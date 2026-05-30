/**
 * Xero Accounting Integration — AU
 * Full OAuth2 integration for syncing invoices, bills, and GST/BAS data to Xero.
 * Configure XERO_CLIENT_ID and XERO_CLIENT_SECRET to activate live mode.
 * When credentials are not set, all methods return realistic mock responses.
 */
const logger = require('../../../config/logger');
const { getDbClient } = require('../../../config/database');
const { AppError } = require('../../../utils/errors');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const XERO_AUTH_URL = 'https://login.xero.com/identity/connect/authorize';
const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token';
const XERO_API_BASE = 'https://api.xero.com/api.xro/2.0';
const XERO_CONNECTIONS_URL = 'https://api.xero.com/connections';

// Read-only scope set, matched EXACTLY to the granular scopes the Xero app is
// configured with (developer.xero.com → app → Configuration → Scopes). The
// broad `accounting.transactions.read` / `accounting.reports.read` scopes are
// NOT available for this app and trigger invalid_scope — the granular variants
// below are the ones the app actually exposes. Each maps to a specific endpoint
// the sync calls (see syncFromXero).
const SCOPES = [
  'openid',                                  // OIDC identity
  'profile',                                 // basic profile info
  'email',                                   // email address
  'offline_access',                          // mandatory — refresh tokens
  'accounting.settings.read',                // Organisation, Accounts, TrackingCategories
  'accounting.contacts',                     // Contacts (read + create supplier/customer on push)
  'accounting.invoices',                     // Invoices (read for analytics + write to push POS sales / PO bills)
  'accounting.reports.profitandloss.read',   // Reports/ProfitAndLoss
  'accounting.reports.balancesheet.read',    // Reports/BalanceSheet
  'accounting.reports.taxreports.read',      // Reports/BASReport
  // Write scopes for the maximum-scale export feature (user must reconnect):
  'accounting.settings',                     // write — create 'Service Channel' tracking category
  'accounting.payments',                     // write — create payments to reconcile exported invoices
].join(' ');

/** Token is refreshed this many ms before actual expiry to avoid races. */
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds the OutletSetting key for Xero integration config.
 * @param {string} outletId
 * @returns {string}
 */
function settingKey(outletId) {
  return `au_integration_xero_${outletId}`;
}

/**
 * Returns true when live Xero credentials are configured.
 * @returns {boolean}
 */
function isLiveMode() {
  return !!(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET);
}

/**
 * Convert a Decimal-string monetary value to integer cents to avoid
 * floating-point drift during aggregation.
 * @param {string|number} value
 * @returns {number} integer cents
 */
function toCents(value) {
  return Math.round(Number(value) * 100);
}

/**
 * Convert integer cents back to a dollar amount (2 dp).
 * @param {number} cents
 * @returns {number}
 */
function fromCents(cents) {
  return Number((cents / 100).toFixed(2));
}

// ---------------------------------------------------------------------------
// XeroService
// ---------------------------------------------------------------------------

class XeroService {
  constructor() {
    this.clientId = process.env.XERO_CLIENT_ID || '';
    this.clientSecret = process.env.XERO_CLIENT_SECRET || '';
    this.redirectUri = process.env.XERO_REDIRECT_URI || '';
  }

  // =========================================================================
  // Internal: OutletSetting persistence
  // =========================================================================

  /**
   * Reads the Xero integration config from OutletSetting.
   * @param {string} outletId
   * @returns {Promise<object|null>} parsed JSON config or null
   */
  async _getConfig(outletId) {
    const prisma = getDbClient();
    const row = await prisma.outletSetting.findUnique({
      where: {
        outlet_id_setting_key: {
          outlet_id: outletId,
          setting_key: settingKey(outletId),
        },
      },
    });
    if (!row) return null;
    try {
      return JSON.parse(row.setting_value);
    } catch {
      return null;
    }
  }

  /**
   * Upserts the Xero integration config into OutletSetting.
   * @param {string} outletId
   * @param {object} config
   * @returns {Promise<void>}
   */
  async _saveConfig(outletId, config) {
    const prisma = getDbClient();
    const key = settingKey(outletId);
    await prisma.outletSetting.upsert({
      where: {
        outlet_id_setting_key: {
          outlet_id: outletId,
          setting_key: key,
        },
      },
      update: {
        setting_value: JSON.stringify(config),
        data_type: 'json',
        updated_at: new Date(),
      },
      create: {
        outlet_id: outletId,
        setting_key: key,
        setting_value: JSON.stringify(config),
        data_type: 'json',
      },
    });
  }

  // =========================================================================
  // Internal: HTTP helpers for Xero API
  // =========================================================================

  /**
   * Makes an authenticated request to the Xero API.
   * @param {string} method - HTTP method
   * @param {string} url - full URL
   * @param {string} accessToken
   * @param {string} tenantId - Xero tenant (org) ID
   * @param {object|null} body - JSON body for POST/PUT
   * @returns {Promise<object>} parsed response
   */
  async _xeroRequest(method, url, accessToken, tenantId, body = null) {
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (tenantId) {
      headers['Xero-Tenant-Id'] = tenantId;
    }

    const opts = { method, headers };
    if (body && (method === 'POST' || method === 'PUT')) {
      opts.body = JSON.stringify(body);
    }

    const res = await fetch(url, opts);
    const text = await res.text();

    if (!res.ok) {
      logger.error('[Xero] API error', {
        status: res.status,
        url,
        body: text.substring(0, 500),
      });
      // Surface a meaningful, operational error so the real Xero message reaches
      // the client instead of being masked as a generic 500. Most relevant:
      // 401/403 = token expired or missing scope (e.g. write scope not granted —
      // reconnect required), 400 = bad payload.
      let detail = text.substring(0, 200);
      try {
        const parsed = JSON.parse(text);
        // Xero validation exceptions nest the real reason inside
        // Elements[].ValidationErrors[].Message — surface those first.
        const nested = (parsed.Elements || [])
          .flatMap(el => el.ValidationErrors || [])
          .map(ve => ve.Message)
          .filter(Boolean);
        detail = nested.length
          ? nested.join('; ')
          : (parsed.Detail || parsed.Message || parsed.detail || detail);
      } catch (_) { /* keep raw text */ }
      const hint = (res.status === 401 || res.status === 403)
        ? ' — your Xero connection lacks the required permission. Please Disconnect and reconnect to Xero.'
        : '';
      throw new AppError(`Xero API error (${res.status}): ${detail}${hint}`, res.status === 403 ? 403 : 400);
    }

    return text ? JSON.parse(text) : {};
  }

  // =========================================================================
  // OAuth2 Flow
  // =========================================================================

  /**
   * Generates the Xero OAuth2 authorization URL.
   * @param {string} outletId
   * @param {string} state - opaque state parameter for CSRF protection
   * @returns {string} authorization URL
   */
  getAuthorizationUrl(outletId, state) {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: SCOPES,
      state,
    });
    return `${XERO_AUTH_URL}?${params.toString()}`;
  }

  /**
   * Exchanges an authorization code for access + refresh tokens.
   * Fetches the connected tenant and stores everything in OutletSetting.
   * @param {string} outletId
   * @param {string} code - authorization code from callback
   * @returns {Promise<object>} connection info
   */
  async exchangeCodeForTokens(outletId, code) {
    logger.info(`[Xero] Exchanging auth code for tokens — outlet ${outletId}`);

    // Exchange code for tokens
    const tokenRes = await fetch(XERO_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      logger.error('[Xero] Token exchange failed', { status: tokenRes.status, body: errText.substring(0, 500) });
      throw new Error(`Xero token exchange failed (${tokenRes.status})`);
    }

    const tokens = await tokenRes.json();

    // Fetch connected tenants to get tenant_id and org_name
    const connectionsRes = await fetch(XERO_CONNECTIONS_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!connectionsRes.ok) {
      const errText = await connectionsRes.text();
      logger.error('[Xero] Connections fetch failed', { status: connectionsRes.status, body: errText.substring(0, 500) });
      throw new Error(`Xero connections fetch failed (${connectionsRes.status})`);
    }

    const connections = await connectionsRes.json();
    const tenant = connections[0]; // use first connected org

    if (!tenant) {
      throw new Error('No Xero organisation found after authorisation');
    }

    const config = {
      connected: true,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      tenant_id: tenant.tenantId,
      org_name: tenant.tenantName || tenant.orgName || 'Unknown',
      connected_at: new Date().toISOString(),
      last_sync: null,
      invoices_exported: 0,
    };

    await this._saveConfig(outletId, config);

    logger.info(`[Xero] Connected outlet ${outletId} to org "${config.org_name}"`);

    // Kick off async initial data sync — don't await so the auth response is fast
    this.syncFromXero(outletId)
      .then(r => logger.info(`[Xero] Initial sync done: ${r.transactions} txns, ${r.invoices} invoices`))
      .catch(e => logger.error(`[Xero] Initial sync failed: ${e.message}`));

    return {
      connected: true,
      org_name: config.org_name,
      tenant_id: config.tenant_id,
      connected_at: config.connected_at,
      syncing: true,
    };
  }

  /**
   * Refreshes an expired access token using the stored refresh token.
   * @param {string} outletId
   * @returns {Promise<string>} new access token
   */
  async refreshAccessToken(outletId) {
    const config = await this._getConfig(outletId);
    if (!config || !config.refresh_token) {
      throw new Error('No Xero refresh token stored — re-authorise required');
    }

    logger.info(`[Xero] Refreshing access token — outlet ${outletId}`);

    const tokenRes = await fetch(XERO_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: config.refresh_token,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      logger.error('[Xero] Token refresh failed', { status: tokenRes.status, body: errText.substring(0, 500) });
      // Mark as disconnected so the user knows to re-auth
      config.connected = false;
      await this._saveConfig(outletId, config);
      throw new Error(`Xero token refresh failed (${tokenRes.status}) — re-authorise required`);
    }

    const tokens = await tokenRes.json();

    config.access_token = tokens.access_token;
    config.refresh_token = tokens.refresh_token;
    config.token_expires_at = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    await this._saveConfig(outletId, config);

    return tokens.access_token;
  }

  /**
   * Returns a valid (non-expired) access token, refreshing if needed.
   * @param {string} outletId
   * @returns {Promise<{ accessToken: string, tenantId: string }>}
   */
  async getValidToken(outletId) {
    const config = await this._getConfig(outletId);
    if (!config || !config.connected) {
      throw new Error('Xero not connected for this outlet — authorise first');
    }

    const expiresAt = new Date(config.token_expires_at).getTime();
    const now = Date.now();

    let accessToken = config.access_token;

    if (now >= expiresAt - TOKEN_EXPIRY_BUFFER_MS) {
      accessToken = await this.refreshAccessToken(outletId);
    }

    return { accessToken, tenantId: config.tenant_id };
  }

  // =========================================================================
  // Invoice Sync — Daily Sales
  // =========================================================================

  /**
   * Queries all paid orders for the given date and syncs them to Xero as a
   * single summary invoice. By default lines are itemised per menu category
   * and split per service channel (order_type) with Xero tracking attached.
   *
   * @param {string} outletId
   * @param {string} date - YYYY-MM-DD
   * @param {object} [options]
   * @param {boolean} [options.itemised=true]        group lines by menu category (vs payment method)
   * @param {boolean} [options.channelTracking=true] split by category × channel + attach Tracking
   * @param {boolean} [options.reconcile=false]      create Xero payments so the invoice shows paid
   * @returns {Promise<object>} sync result
   */
  async syncDailySales(outletId, date, options = {}) {
    const {
      itemised = true,
      channelTracking = true,
      reconcile = false,
    } = options;

    logger.info(
      `[Xero] Syncing daily sales for outlet ${outletId} on ${date} ` +
      `(itemised=${itemised}, channelTracking=${channelTracking}, reconcile=${reconcile})`
    );

    const prisma = getDbClient();

    // Fetch outlet for code
    const outlet = await prisma.outlet.findUnique({
      where: { id: outletId },
      select: { code: true },
    });
    if (!outlet) {
      throw new Error(`Outlet ${outletId} not found`);
    }

    // Date range for the given day (UTC boundaries)
    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(`${date}T23:59:59.999Z`);

    // Get all paid orders for the date with their payments and (when itemising)
    // their order_items + menu_item.category for per-category grouping.
    const orders = await prisma.order.findMany({
      where: {
        outlet_id: outletId,
        is_paid: true,
        is_deleted: false,
        status: { notIn: ['cancelled', 'voided'] },
        paid_at: { gte: dayStart, lte: dayEnd },
      },
      include: {
        payments: {
          where: { is_deleted: false, status: 'success' },
          select: { method: true, amount: true },
        },
        order_items: {
          include: {
            menu_item: { include: { category: true } },
          },
        },
      },
    });

    // No paid orders for this day → nothing to invoice. Skip rather than POST
    // an empty invoice (Xero rejects invoices with no line items).
    if (orders.length === 0) {
      logger.info(`[Xero] No paid orders for ${date} — skipping`);
      return {
        success: true,
        skipped: true,
        orders_count: 0,
        total_amount: 0,
        line_items: 0,
        itemised,
        channel_tracking: channelTracking,
        reconciled: false,
        payments_created: 0,
        message: `No paid orders on ${date}`,
      };
    }

    // Aggregate by payment method (always — needed for reconciliation + breakdown)
    const methodTotals = {}; // method -> cents
    let totalCents = 0;
    let totalTaxCents = 0;

    for (const order of orders) {
      totalTaxCents += toCents(order.total_tax);

      for (const payment of order.payments) {
        const amountCents = toCents(payment.amount);
        const method = _normalisePaymentMethod(payment.method);
        methodTotals[method] = (methodTotals[method] || 0) + amountCents;
        totalCents += amountCents;
      }
    }

    const invoiceNumber = `POS-${outlet.code}-${date.replace(/-/g, '')}`;
    const totalTax = fromCents(totalTaxCents);

    // ---- Build line items ----
    let lineItems;
    if (itemised) {
      // Group by menu category, optionally split per service channel.
      // key -> { cents, category, channelLabel }
      const groups = {};
      for (const order of orders) {
        const channelLabel = _channelLabel(order.order_type);
        for (const item of (order.order_items || [])) {
          const category = item.menu_item?.category?.name || 'Uncategorised';
          const key = channelTracking ? `${category}||${channelLabel}` : category;
          if (!groups[key]) {
            groups[key] = { cents: 0, category, channelLabel };
          }
          groups[key].cents += toCents(item.item_total);
        }
      }

      lineItems = Object.values(groups).map((g) => {
        const line = {
          Description: g.category,
          Quantity: 1,
          UnitAmount: fromCents(g.cents),
          AccountCode: '200',
          TaxType: 'OUTPUT',
        };
        if (channelTracking) {
          line.Tracking = [{ Name: 'Service Channel', Option: g.channelLabel }];
        }
        return line;
      });
    } else {
      // Legacy behaviour: one line per payment method.
      lineItems = Object.entries(methodTotals).map(([method, cents]) => ({
        Description: `${method} — ${date}`,
        Quantity: 1,
        UnitAmount: fromCents(cents),
        AccountCode: '200',
        TaxType: 'OUTPUT',
      }));
    }

    // Total amount derived from the line items we are actually invoicing.
    const lineCents = lineItems.reduce((sum, l) => sum + toCents(l.UnitAmount), 0);
    const totalAmount = fromCents(lineCents);

    // Orders existed but produced no payable line items → skip rather than POST
    // an invoice Xero will reject.
    if (lineItems.length === 0) {
      logger.info(`[Xero] No payable line items for ${date} — skipping`);
      return {
        success: true,
        skipped: true,
        orders_count: orders.length,
        total_amount: 0,
        line_items: 0,
        itemised,
        channel_tracking: channelTracking,
        reconciled: false,
        payments_created: 0,
        message: `No payable line items on ${date}`,
      };
    }

    const invoicePayload = {
      Type: 'ACCREC',
      Contact: { Name: 'Daily POS Sales' },
      Date: date,
      DueDate: date,
      InvoiceNumber: invoiceNumber,
      Reference: `POS daily sales ${date}`,
      Status: 'AUTHORISED',
      LineAmountTypes: 'Inclusive',
      CurrencyCode: 'AUD',
      LineItems: lineItems,
    };

    // Mock mode
    if (!isLiveMode()) {
      logger.warn('[Xero] XERO_CLIENT_ID not configured — returning mock response');
      return {
        success: true,
        mock: true,
        xero_invoice_id: `XERO-MOCK-${Date.now()}`,
        invoice_number: invoiceNumber,
        total_amount: totalAmount,
        total_tax: totalTax,
        orders_count: orders.length,
        line_items: lineItems.length,
        payment_breakdown: Object.fromEntries(
          Object.entries(methodTotals).map(([m, c]) => [m, fromCents(c)])
        ),
        status: 'AUTHORISED',
        itemised,
        channel_tracking: channelTracking,
        reconciled: false,
        reconcile_skipped_reason: reconcile ? 'mock mode — no Xero call made' : undefined,
        payments_created: 0,
        message: 'Daily sales synced to Xero (mock — configure XERO_CLIENT_ID to activate)',
      };
    }

    // Live mode — POST to Xero
    const { accessToken, tenantId } = await this.getValidToken(outletId);

    // Ensure the 'Service Channel' tracking category exists before posting.
    // If it fails (e.g. write scope not granted), drop Tracking from the lines
    // rather than failing the whole invoice.
    let channelTrackingApplied = channelTracking;
    if (channelTracking) {
      try {
        await this._ensureServiceChannelCategory(accessToken, tenantId);
      } catch (err) {
        logger.warn(`[Xero] Could not ensure Service Channel category — omitting Tracking: ${err.message}`);
        channelTrackingApplied = false;
        for (const line of invoicePayload.LineItems) {
          delete line.Tracking;
        }
      }
    }

    const result = await this._xeroRequest(
      'POST',
      `${XERO_API_BASE}/Invoices`,
      accessToken,
      tenantId,
      { Invoices: [invoicePayload] }
    );

    const created = result.Invoices?.[0];
    const createdInvoiceId = created?.InvoiceID;

    // Update last_sync and invoices_exported count
    const config = await this._getConfig(outletId);
    if (config) {
      config.last_sync = new Date().toISOString();
      config.invoices_exported = (config.invoices_exported || 0) + 1;
      await this._saveConfig(outletId, config);
    }

    logger.info(`[Xero] Daily sales invoice created: ${createdInvoiceId}`);

    // Optional reconciliation — never fail the export over this.
    let reconciled = false;
    let reconcileSkippedReason;
    let paymentsCreated = 0;
    if (reconcile && createdInvoiceId) {
      const methodAmounts = Object.fromEntries(
        Object.entries(methodTotals).map(([m, c]) => [m, fromCents(c)])
      );
      const recResult = await this._reconcileInvoice(
        accessToken,
        tenantId,
        createdInvoiceId,
        methodAmounts,
        date
      );
      reconciled = !!recResult.reconciled;
      paymentsCreated = recResult.payments_created || 0;
      if (!reconciled) reconcileSkippedReason = recResult.reason;
    }

    return {
      success: true,
      mock: false,
      xero_invoice_id: createdInvoiceId,
      invoice_number: invoiceNumber,
      total_amount: totalAmount,
      total_tax: totalTax,
      orders_count: orders.length,
      line_items: lineItems.length,
      payment_breakdown: Object.fromEntries(
        Object.entries(methodTotals).map(([m, c]) => [m, fromCents(c)])
      ),
      status: created?.Status || 'AUTHORISED',
      itemised,
      channel_tracking: channelTrackingApplied,
      reconciled,
      reconcile_skipped_reason: reconcileSkippedReason,
      payments_created: paymentsCreated,
      message: 'Daily sales synced to Xero',
    };
  }

  /**
   * Ensures an active tracking category named 'Service Channel' exists in Xero,
   * creating it (with Dine-In / Takeaway / Delivery options) if absent.
   * Throws on failure — callers should wrap in try/catch and degrade gracefully.
   * @param {string} accessToken
   * @param {string} tenantId
   * @returns {Promise<void>}
   */
  async _ensureServiceChannelCategory(accessToken, tenantId) {
    const existing = await this._xeroRequest(
      'GET',
      `${XERO_API_BASE}/TrackingCategories`,
      accessToken,
      tenantId
    );
    const found = (existing.TrackingCategories || []).find(
      (c) => c.Name === 'Service Channel' && (c.Status || 'ACTIVE') === 'ACTIVE'
    );
    if (found) return;

    logger.info('[Xero] Creating "Service Channel" tracking category');
    await this._xeroRequest(
      'POST',
      `${XERO_API_BASE}/TrackingCategories`,
      accessToken,
      tenantId,
      {
        TrackingCategories: [
          {
            Name: 'Service Channel',
            Options: [{ Name: 'Dine-In' }, { Name: 'Takeaway' }, { Name: 'Delivery' }],
          },
        ],
      }
    );
  }

  /**
   * Creates Xero payments against a created invoice so it reconciles as paid.
   * Posts one Payment per payment-method total. Never throws — returns a
   * structured result so the caller can record but not fail the export.
   * @param {string} accessToken
   * @param {string} tenantId
   * @param {string} invoiceId
   * @param {object} methodTotals - { methodLabel: dollarAmount }
   * @param {string} date - YYYY-MM-DD
   * @returns {Promise<{reconciled:boolean, payments_created?:number, reason?:string}>}
   */
  async _reconcileInvoice(accessToken, tenantId, invoiceId, methodTotals, date) {
    try {
      const accountsRes = await this._xeroRequest(
        'GET',
        `${XERO_API_BASE}/Accounts?where=Type%3D%3D%22BANK%22`,
        accessToken,
        tenantId
      );
      const bank = (accountsRes.Accounts || [])[0];
      if (!bank || !bank.Code) {
        return { reconciled: false, reason: 'no bank account in Xero' };
      }

      const payments = Object.values(methodTotals)
        .filter((amount) => Number(amount) > 0)
        .map((amount) => ({
          Invoice: { InvoiceID: invoiceId },
          Account: { Code: bank.Code },
          Date: date,
          Amount: Math.round(Number(amount) * 100) / 100,
        }));

      if (payments.length === 0) {
        return { reconciled: false, reason: 'no positive payment totals to reconcile' };
      }

      await this._xeroRequest(
        'POST',
        `${XERO_API_BASE}/Payments`,
        accessToken,
        tenantId,
        { Payments: payments }
      );

      logger.info(`[Xero] Reconciled invoice ${invoiceId} with ${payments.length} payment(s)`);
      return { reconciled: true, payments_created: payments.length };
    } catch (err) {
      logger.warn(`[Xero] Reconciliation failed for invoice ${invoiceId}: ${err.message}`);
      return { reconciled: false, reason: err.message };
    }
  }

  /**
   * Exports paid orders as individual ACCREC invoices (one invoice per order),
   * batching up to 50 per POST and pacing batches to respect Xero's ~60 calls/min
   * rate limit.
   * @param {string} outletId
   * @param {string} fromDate - YYYY-MM-DD
   * @param {string} toDate   - YYYY-MM-DD
   * @param {object} [options]
   * @param {boolean} [options.channelTracking=true] attach Service Channel tracking per line
   * @returns {Promise<object>}
   */
  async syncOrdersIndividually(outletId, fromDate, toDate, options = {}) {
    const { channelTracking = true } = options;

    logger.info(
      `[Xero] Exporting individual order invoices for outlet ${outletId} ` +
      `from ${fromDate} to ${toDate} (channelTracking=${channelTracking})`
    );

    const prisma = getDbClient();

    // from/to may arrive as Date objects (Joi coerces them) or YYYY-MM-DD
    // strings — normalise to a date-only string before building UTC bounds.
    const toDateStr = (v) => (v instanceof Date ? v.toISOString() : String(v)).split('T')[0];
    const periodStart = new Date(`${toDateStr(fromDate)}T00:00:00.000Z`);
    const periodEnd = new Date(`${toDateStr(toDate)}T23:59:59.999Z`);

    const orders = await prisma.order.findMany({
      where: {
        outlet_id: outletId,
        is_paid: true,
        is_deleted: false,
        status: { notIn: ['cancelled', 'voided'] },
        paid_at: { gte: periodStart, lte: periodEnd },
      },
      include: {
        order_items: {
          include: {
            menu_item: { include: { category: true } },
          },
        },
      },
    });

    // Build one invoice payload per order (skip orders with no items).
    const invoices = [];
    let skipped = 0;
    for (const order of orders) {
      const items = order.order_items || [];
      if (items.length === 0) {
        skipped++;
        continue;
      }

      const channelLabel = _channelLabel(order.order_type);
      const lineItems = items.map((item) => {
        const line = {
          Description: item.name,
          Quantity: Number(item.quantity),
          UnitAmount: Number(item.unit_price),
          AccountCode: '200',
          TaxType: 'OUTPUT',
        };
        if (channelTracking) {
          line.Tracking = [{ Name: 'Service Channel', Option: channelLabel }];
        }
        return line;
      });

      const orderDate = order.paid_at
        ? order.paid_at.toISOString().split('T')[0]
        : fromDate;

      invoices.push({
        Type: 'ACCREC',
        Contact: { Name: order.customer_name || 'POS Customer' },
        Date: orderDate,
        DueDate: orderDate,
        InvoiceNumber: order.order_number,
        Reference: `POS order ${order.order_number}`,
        Status: 'AUTHORISED',
        LineAmountTypes: 'Inclusive',
        CurrencyCode: 'AUD',
        LineItems: lineItems,
      });
    }

    // Mock mode — realistic summary without calling Xero.
    if (!isLiveMode()) {
      logger.warn('[Xero] XERO_CLIENT_ID not configured — returning mock individual-export response');
      return {
        success: true,
        mock: true,
        invoices_created: invoices.length,
        batches: Math.ceil(invoices.length / 50),
        skipped,
        errors: [],
        message: 'Individual orders synced to Xero (mock — configure XERO_CLIENT_ID to activate)',
      };
    }

    if (invoices.length === 0) {
      return {
        success: true,
        mock: false,
        invoices_created: 0,
        batches: 0,
        skipped,
        errors: [],
        message: 'No orders with line items to export',
      };
    }

    const { accessToken, tenantId } = await this.getValidToken(outletId);

    // Ensure the tracking category once before the loop; degrade gracefully.
    let trackingApplied = channelTracking;
    if (channelTracking) {
      try {
        await this._ensureServiceChannelCategory(accessToken, tenantId);
      } catch (err) {
        logger.warn(`[Xero] Could not ensure Service Channel category — omitting Tracking: ${err.message}`);
        trackingApplied = false;
        for (const inv of invoices) {
          for (const line of inv.LineItems) delete line.Tracking;
        }
      }
    }

    const BATCH_SIZE = 50;
    const batches = [];
    for (let i = 0; i < invoices.length; i += BATCH_SIZE) {
      batches.push(invoices.slice(i, i + BATCH_SIZE));
    }

    let created = 0;
    const errors = [];
    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b];
      try {
        const result = await this._xeroRequest(
          'POST',
          `${XERO_API_BASE}/Invoices`,
          accessToken,
          tenantId,
          { Invoices: batch }
        );
        created += (result.Invoices || []).length;
      } catch (err) {
        logger.warn(`[Xero] Individual-export batch ${b + 1}/${batches.length} failed: ${err.message}`);
        errors.push({ batch: b + 1, size: batch.length, error: err.message });
      }
      // Pace batches to stay under the ~60 calls/min rate limit.
      if (b < batches.length - 1) {
        await new Promise((r) => setTimeout(r, 1100));
      }
    }

    // Update sync metadata.
    const config = await this._getConfig(outletId);
    if (config) {
      config.last_sync = new Date().toISOString();
      config.invoices_exported = (config.invoices_exported || 0) + created;
      await this._saveConfig(outletId, config);
    }

    logger.info(
      `[Xero] Individual export done: ${created} invoices in ${batches.length} batches ` +
      `(${skipped} skipped, ${errors.length} batch errors)`
    );

    return {
      success: true,
      mock: false,
      invoices_created: created,
      batches: batches.length,
      skipped,
      errors,
      channel_tracking: trackingApplied,
      message: 'Individual orders synced to Xero',
    };
  }

  // =========================================================================
  // Purchase Order Sync — Bills
  // =========================================================================

  /**
   * Creates a Xero Bill from a purchase order.
   * @param {string} outletId
   * @param {object} po - purchase order (with po_items and supplier populated)
   * @returns {Promise<object>}
   */
  async syncPurchaseOrder(outletId, po) {
    logger.info(`[Xero] Syncing PO ${po.id} (${po.po_number}) to Xero as Bill`);

    const prisma = getDbClient();

    // Ensure we have full PO data with items and supplier
    const fullPo = await prisma.purchaseOrder.findUnique({
      where: { id: po.id },
      include: {
        po_items: { where: { is_deleted: false } },
        supplier: true,
      },
    });

    if (!fullPo) {
      throw new Error(`Purchase order ${po.id} not found`);
    }

    const supplierName = fullPo.supplier?.name || 'Unknown Supplier';
    const grandTotal = fromCents(toCents(fullPo.grand_total));
    const taxAmount = fromCents(toCents(fullPo.tax_amount));

    // Build line items from PO items
    const lineItems = fullPo.po_items.map((item) => ({
      Description: `${item.item_name}${item.category ? ` (${item.category})` : ''} — ${Number(item.ordered_quantity)} ${item.unit}`,
      Quantity: Number(item.ordered_quantity),
      UnitAmount: Number(item.unit_cost),
      AccountCode: '300', // Cost of Goods Sold / Purchases
      TaxType: Number(item.tax_rate) > 0 ? 'INPUT' : 'NONE',
    }));

    const billPayload = {
      Type: 'ACCPAY',
      Contact: { Name: supplierName },
      Date: fullPo.created_at.toISOString().split('T')[0],
      DueDate: fullPo.expected_date
        ? fullPo.expected_date.toISOString().split('T')[0]
        : fullPo.created_at.toISOString().split('T')[0],
      InvoiceNumber: fullPo.po_number,
      Reference: fullPo.reference_number || fullPo.po_number,
      Status: 'AUTHORISED',
      LineAmountTypes: 'Exclusive',
      CurrencyCode: 'AUD',
      LineItems: lineItems,
    };

    // Mock mode
    if (!isLiveMode()) {
      logger.warn('[Xero] XERO_CLIENT_ID not configured — returning mock Bill response');
      return {
        success: true,
        mock: true,
        xero_bill_id: `XERO-BILL-MOCK-${Date.now()}`,
        po_number: fullPo.po_number,
        supplier: supplierName,
        grand_total: grandTotal,
        tax_amount: taxAmount,
        line_items: lineItems.length,
        status: 'AUTHORISED',
        message: 'PO synced as Bill in Xero (mock — configure XERO_CLIENT_ID to activate)',
      };
    }

    // Live mode
    const { accessToken, tenantId } = await this.getValidToken(outletId);

    const result = await this._xeroRequest(
      'POST',
      `${XERO_API_BASE}/Invoices`,
      accessToken,
      tenantId,
      { Invoices: [billPayload] }
    );

    const created = result.Invoices?.[0];

    logger.info(`[Xero] Bill created for PO ${fullPo.po_number}: ${created?.InvoiceID}`);

    return {
      success: true,
      mock: false,
      xero_bill_id: created?.InvoiceID,
      po_number: fullPo.po_number,
      supplier: supplierName,
      grand_total: grandTotal,
      tax_amount: taxAmount,
      line_items: lineItems.length,
      status: created?.Status || 'AUTHORISED',
      message: 'PO synced as Bill in Xero',
    };
  }

  // =========================================================================
  // GST / BAS Summary
  // =========================================================================

  /**
   * Calculates AU BAS fields from local order and purchase data, and
   * optionally reconciles against Xero if connected.
   *
   * BAS fields returned:
   *   G1  — Total sales including GST
   *   1A  — GST on sales
   *   G10 — Capital purchases (not tracked locally — defaults to 0)
   *   G11 — Non-capital purchases (PO grand totals)
   *   1B  — GST on purchases (PO tax totals)
   *
   * @param {string} outletId
   * @param {string} from - ISO date YYYY-MM-DD
   * @param {string} to   - ISO date YYYY-MM-DD
   * @returns {Promise<object>}
   */
  async getGSTSummary(outletId, from, to) {
    logger.info(`[Xero] Calculating GST/BAS summary for outlet ${outletId} from ${from} to ${to}`);

    const prisma = getDbClient();

    const periodStart = new Date(`${from}T00:00:00.000Z`);
    const periodEnd = new Date(`${to}T23:59:59.999Z`);

    // ---- Sales aggregation ----
    const orders = await prisma.order.findMany({
      where: {
        outlet_id: outletId,
        is_paid: true,
        is_deleted: false,
        status: { notIn: ['cancelled', 'voided'] },
        paid_at: { gte: periodStart, lte: periodEnd },
      },
      select: {
        grand_total: true,
        total_tax: true,
      },
    });

    let g1Cents = 0; // Total sales incl GST
    let salesTaxCents = 0; // 1A — GST on sales

    for (const order of orders) {
      g1Cents += toCents(order.grand_total);
      salesTaxCents += toCents(order.total_tax);
    }

    // ---- Purchases aggregation (non-capital) ----
    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where: {
        outlet_id: outletId,
        is_deleted: false,
        status: { in: ['approved', 'received', 'completed'] },
        created_at: { gte: periodStart, lte: periodEnd },
      },
      select: {
        grand_total: true,
        tax_amount: true,
      },
    });

    let g11Cents = 0; // Non-capital purchases
    let purchaseTaxCents = 0; // 1B — GST on purchases

    for (const po of purchaseOrders) {
      g11Cents += toCents(po.grand_total);
      purchaseTaxCents += toCents(po.tax_amount);
    }

    const localSummary = {
      period: { from, to },
      g1_total_sales: fromCents(g1Cents),
      '1a_gst_on_sales': fromCents(salesTaxCents),
      g10_capital_purchases: 0, // not tracked locally
      g11_non_capital_purchases: fromCents(g11Cents),
      '1b_gst_on_purchases': fromCents(purchaseTaxCents),
      net_gst_payable: fromCents(salesTaxCents - purchaseTaxCents),
      orders_count: orders.length,
      purchase_orders_count: purchaseOrders.length,
      source: 'local',
    };

    // If not connected or in mock mode, return local-only data
    const config = await this._getConfig(outletId);
    const isConnected = config?.connected && isLiveMode();

    if (!isConnected) {
      if (!isLiveMode()) {
        localSummary.message = 'Configure XERO_CLIENT_ID to pull live data from Xero for reconciliation';
        localSummary.mock = true;
      } else {
        localSummary.message = 'Xero not connected — showing local data only';
      }
      return localSummary;
    }

    // Fetch Xero BAS/Tax report for reconciliation
    try {
      const { accessToken, tenantId } = await this.getValidToken(outletId);

      const xeroReport = await this._xeroRequest(
        'GET',
        `${XERO_API_BASE}/Reports/BASReport?fromDate=${from}&toDate=${to}`,
        accessToken,
        tenantId
      );

      return {
        ...localSummary,
        source: 'reconciled',
        xero_report: xeroReport.Reports?.[0] || null,
        message: 'Local data with Xero BAS report for reconciliation',
      };
    } catch (err) {
      logger.warn(`[Xero] Failed to fetch BAS report from Xero: ${err.message}`);
      return {
        ...localSummary,
        source: 'local',
        xero_reconciliation_error: err.message,
        message: 'Local data only — Xero BAS report fetch failed',
      };
    }
  }

  // =========================================================================
  // Connection Management
  // =========================================================================

  /**
   * Returns the current Xero connection status for an outlet.
   * @param {string} outletId
   * @returns {Promise<object>}
   */
  async getConnectionStatus(outletId) {
    const config = await this._getConfig(outletId);

    if (!config || !config.connected) {
      return {
        connected: false,
        org_name: null,
        last_sync: null,
        invoices_exported: 0,
        live_mode: isLiveMode(),
        message: isLiveMode()
          ? 'Xero not connected — initiate OAuth2 flow to connect'
          : 'Xero credentials not configured (XERO_CLIENT_ID) — running in mock mode',
      };
    }

    return {
      connected: true,
      org_name: config.org_name,
      tenant_id: config.tenant_id,
      connected_at: config.connected_at,
      last_sync: config.last_sync,
      invoices_exported: config.invoices_exported || 0,
      live_mode: isLiveMode(),
    };
  }

  // =========================================================================
  // Full Data Sync — Pulls Xero data into local xero_* analytics tables
  // =========================================================================

  /**
   * Pulls 3 years of financial data from Xero and upserts it into the
   * xero_connections / xero_transactions / xero_invoices etc. tables
   * used by the analytics service.
   *
   * Safe to call multiple times — uses upsert/skipDuplicates throughout.
   * @param {string} outletId
   * @returns {Promise<{ transactions: number, invoices: number, contacts: number }>}
   */
  async syncFromXero(outletId) {
    logger.info(`[Xero] Starting full sync for outlet ${outletId}`);
    const { accessToken, tenantId } = await this.getValidToken(outletId);
    const config = await this._getConfig(outletId);
    const prisma = getDbClient();

    const req = (path) =>
      this._xeroRequest('GET', `${XERO_API_BASE}/${path}`, accessToken, tenantId);

    // ── 1. Ensure xero_connections row exists ─────────────────────────────
    let conn = await prisma.xeroConnection.findFirst({
      where: { outlet_id: outletId, is_deleted: false },
    });
    if (!conn) {
      let orgInfo = {};
      try {
        const orgRes = await req('Organisation');
        orgInfo = orgRes?.Organisations?.[0] || {};
      } catch (_) {}
      conn = await prisma.xeroConnection.create({
        data: {
          outlet_id:    outletId,
          org_name:     config.org_name || orgInfo.Name || 'Xero Organisation',
          abn:          orgInfo.TaxNumber || null,
          address:      orgInfo.Addresses?.[0]?.AddressLine1 || null,
          currency:     orgInfo.BaseCurrency || 'AUD',
          country_code: orgInfo.CountryCode  || 'AU',
          timezone:     orgInfo.Timezone     || null,
          is_connected: true,
          last_synced:  new Date(),
        },
      });
    }
    const connId = conn.id;

    // ── 2. Chart of Accounts ──────────────────────────────────────────────
    const accountsRes = await req('Accounts?where=Status%3D%3D%22ACTIVE%22');
    const xeroAccounts = accountsRes?.Accounts || [];
    const catMap = {}; // code → category
    for (const a of xeroAccounts) {
      const cat = _mapXeroAccountType(a.Type, a.Name);
      catMap[a.Code] = cat;
      await prisma.xeroAccount.upsert({
        where:  { connection_id_code: { connection_id: connId, code: a.Code || a.AccountID.slice(0, 10) } },
        create: { connection_id: connId, code: a.Code || a.AccountID.slice(0, 10), name: a.Name, type: a.Type, category: cat, is_active: a.Status === 'ACTIVE' },
        update: { name: a.Name, type: a.Type, category: cat, is_active: a.Status === 'ACTIVE' },
      });
    }

    // ── 3. P&L Transactions (36 months, 3 x 12-month windows) ────────────
    let txnCount = 0;
    const now = new Date();
    for (let w = 0; w < 3; w++) {
      const toDate   = new Date(now.getFullYear(), now.getMonth() - w * 12, 0);
      const fromDate = new Date(toDate.getFullYear() - 1, toDate.getMonth() + 1, 1);
      const from = _fmtDate(fromDate);
      const to   = _fmtDate(toDate);
      let report;
      try {
        report = await req(
          `Reports/ProfitAndLoss?fromDate=${from}&toDate=${to}&periods=12&timeframe=MONTH&standardLayout=true`
        );
      } catch (e) {
        logger.warn(`[Xero] P&L report failed for window ${w}: ${e.message}`);
        continue;
      }
      const rows = report?.Reports?.[0]?.Rows || [];
      // Extract column date headers from the Header row
      const headerRow = rows.find(r => r.RowType === 'Header');
      const colDates  = (headerRow?.Cells || []).slice(1).map(c => c.Value); // e.g. "Jan 2023"
      // Parse all Section/Row entries
      for (const section of rows.filter(r => r.RowType === 'Section')) {
        const sectionTitle = section.Title || '';
        for (const row of (section.Rows || []).filter(r => r.RowType === 'Row')) {
          const cells = row.Cells || [];
          if (!cells.length) continue;
          const nameCell = cells[0];
          const acctName = nameCell.Value || '';
          const acctCode = nameCell.Attributes?.find(a => a.Id === 'account')?.Value || '';
          const acctType = sectionTitle.toLowerCase().includes('income') ? 'REVENUE' : 'EXPENSE';
          const cat      = catMap[acctCode] || _mapXeroSectionToCategory(sectionTitle);
          // Each subsequent cell is a month's value
          for (let ci = 1; ci < cells.length && (ci - 1) < colDates.length; ci++) {
            const rawVal = parseFloat(cells[ci].Value) || 0;
            if (!rawVal) continue;
            // P&L report shows revenue as positive, expenses as positive
            // We store revenue positive, expenses negative
            const net   = acctType === 'REVENUE' ? rawVal : -Math.abs(rawVal);
            const txRef = `PNL-${acctCode || acctName.slice(0, 8).replace(/\s/g, '')}-${colDates[ci - 1].replace(' ', '')}`.slice(0, 30);
            const txDate = _parsePnlDate(colDates[ci - 1]);
            if (!txDate) continue;
            await prisma.xeroTransaction.upsert({
              where:  { connection_id_transaction_ref: { connection_id: connId, transaction_ref: txRef } },
              create: {
                connection_id:   connId,
                transaction_ref: txRef,
                date:            txDate,
                type:            acctType === 'REVENUE' ? 'ACCREC' : 'ACCPAY',
                account_code:    acctCode || '000',
                account_name:    acctName,
                account_type:    acctType,
                category:        cat,
                description:     sectionTitle,
                amount_incl_gst: Math.round(net * 1.1 * 100) / 100,
                gst:             Math.round(net * 0.1 * 100) / 100,
                net_amount:      Math.round(net * 100) / 100,
                currency:        'AUD',
              },
              update: { net_amount: Math.round(net * 100) / 100, amount_incl_gst: Math.round(net * 1.1 * 100) / 100, gst: Math.round(net * 0.1 * 100) / 100 },
            });
            txnCount++;
          }
        }
      }
    }

    // ── 4. Balance Sheet (quarterly snapshots) ────────────────────────────
    for (let q = 0; q < 12; q++) {
      const d = new Date(now.getFullYear(), now.getMonth() - q * 3, 0);
      const asAt = _fmtDate(d);
      let bs;
      try { bs = await req(`Reports/BalanceSheet?date=${asAt}&standardLayout=true`); } catch (_) { continue; }
      for (const section of (bs?.Reports?.[0]?.Rows || []).filter(r => r.RowType === 'Section')) {
        const subType = section.Title || '';
        for (const row of (section.Rows || []).filter(r => r.RowType === 'Row')) {
          const cells = row.Cells || [];
          if (!cells.length) continue;
          const acctName = cells[0]?.Value || '';
          const acctCode = cells[0]?.Attributes?.find(a => a.Id === 'account')?.Value || acctName.slice(0, 10);
          const bal = parseFloat(cells[1]?.Value) || 0;
          if (!bal) continue;
          const acctType = _mapBSSubTypeToAccountType(subType);
          await prisma.xeroBalanceSheetLine.upsert({
            where:  { id: (await prisma.xeroBalanceSheetLine.findFirst({ where: { connection_id: connId, as_at_date: d, account_code: acctCode.slice(0, 10) } }))?.id || '00000000-0000-0000-0000-000000000000' },
            create: { connection_id: connId, as_at_date: d, account_code: acctCode.slice(0, 10), account_name: acctName, account_type: acctType, sub_type: subType.slice(0, 30), balance: bal },
            update: { balance: bal },
          }).catch(() => prisma.xeroBalanceSheetLine.create({ data: { connection_id: connId, as_at_date: d, account_code: acctCode.slice(0, 10), account_name: acctName, account_type: acctType, sub_type: subType.slice(0, 30), balance: bal } }).catch(() => null));
        }
      }
    }

    // ── 5. Invoices (last 24 months) ──────────────────────────────────────
    const invFrom = _fmtDate(new Date(now.getFullYear() - 2, now.getMonth(), 1));
    let invCount = 0;
    try {
      const invRes = await req(`Invoices?DateFrom=${invFrom}&order=Date+DESC&page=1`);
      for (const inv of (invRes?.Invoices || [])) {
        await prisma.xeroInvoice.upsert({
          where:  { connection_id_invoice_number: { connection_id: connId, invoice_number: inv.InvoiceNumber || inv.InvoiceID.slice(0, 30) } },
          create: {
            connection_id:  connId,
            invoice_number: (inv.InvoiceNumber || inv.InvoiceID).slice(0, 30),
            contact:        (inv.Contact?.Name || 'Unknown').slice(0, 200),
            type:           inv.Type || 'ACCPAY',
            status:         inv.Status || 'DRAFT',
            date:           inv.Date ? new Date(inv.Date) : new Date(),
            due_date:       inv.DueDate ? new Date(inv.DueDate) : new Date(),
            total:          inv.Total || 0,
            amount_paid:    inv.AmountPaid || 0,
            amount_due:     inv.AmountDue || 0,
            currency:       inv.CurrencyCode || 'AUD',
          },
          update: { status: inv.Status, amount_paid: inv.AmountPaid || 0, amount_due: inv.AmountDue || 0 },
        });
        invCount++;
      }
    } catch (e) { logger.warn('[Xero] Invoices sync failed:', e.message); }

    // ── 6. Contacts ───────────────────────────────────────────────────────
    let contactCount = 0;
    try {
      const ctRes = await req('Contacts?where=IsSupplier%3D%3Dtrue+OR+IsCustomer%3D%3Dtrue&page=1');
      for (const ct of (ctRes?.Contacts || []).slice(0, 200)) {
        const cType = ct.IsSupplier ? 'SUPPLIER' : 'CUSTOMER';
        await prisma.xeroContact.upsert({
          where:  { connection_id_name: { connection_id: connId, name: (ct.Name || ct.ContactID).slice(0, 200) } },
          create: {
            connection_id: connId,
            name:          (ct.Name || ct.ContactID).slice(0, 200),
            contact_type:  cType,
            abn:           ct.TaxNumber?.slice(0, 20) || null,
            email:         ct.EmailAddress?.slice(0, 200) || null,
            phone:         ct.Phones?.[0]?.PhoneNumber?.slice(0, 30) || null,
            city:          ct.Addresses?.[0]?.City?.slice(0, 100) || null,
            state:         ct.Addresses?.[0]?.Region?.slice(0, 10) || null,
            is_active:     ct.ContactStatus === 'ACTIVE',
          },
          update: { is_active: ct.ContactStatus === 'ACTIVE' },
        });
        contactCount++;
      }
    } catch (e) { logger.warn('[Xero] Contacts sync failed:', e.message); }

    // ── 7. Tracking Categories ────────────────────────────────────────────
    try {
      const trRes = await req('TrackingCategories?where=Status%3D%3D%22ACTIVE%22');
      for (const cat of (trRes?.TrackingCategories || [])) {
        const dbCat = await prisma.xeroTrackingCategory.upsert({
          where:  { connection_id_name: { connection_id: connId, name: cat.Name.slice(0, 100) } },
          create: { connection_id: connId, name: cat.Name.slice(0, 100) },
          update: {},
        });
        for (const opt of (cat.Options || [])) {
          if (opt.Status !== 'ACTIVE') continue;
          await prisma.xeroTrackingOption.upsert({
            where:  { category_id_name: { category_id: dbCat.id, name: opt.Name.slice(0, 100) } },
            create: { category_id: dbCat.id, name: opt.Name.slice(0, 100) },
            update: {},
          });
        }
      }
    } catch (e) { logger.warn('[Xero] Tracking sync failed:', e.message); }

    // ── 8. Update connection last_synced ──────────────────────────────────
    await prisma.xeroConnection.update({ where: { id: connId }, data: { last_synced: new Date() } });
    config.last_sync = new Date().toISOString();
    await this._saveConfig(outletId, config);

    logger.info(`[Xero] Sync complete: ${txnCount} txns, ${invCount} invoices, ${contactCount} contacts`);
    return { transactions: txnCount, invoices: invCount, contacts: contactCount };
  }

  /**
   * Disconnects Xero by clearing stored tokens.
   * Optionally revokes the token at Xero's end.
   * @param {string} outletId
   * @returns {Promise<object>}
   */
  async disconnect(outletId) {
    logger.info(`[Xero] Disconnecting outlet ${outletId}`);

    const config = await this._getConfig(outletId);

    // Attempt to revoke at Xero if we have a valid token and tenant
    if (config?.connected && config.tenant_id && isLiveMode()) {
      try {
        await fetch(XERO_CONNECTIONS_URL + '/' + config.tenant_id, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${config.access_token}`,
            'Content-Type': 'application/json',
          },
        });
        logger.info(`[Xero] Revoked connection for tenant ${config.tenant_id}`);
      } catch (err) {
        // Non-fatal — we still clear local tokens
        logger.warn(`[Xero] Failed to revoke Xero connection: ${err.message}`);
      }
    }

    // Clear the stored config
    const prisma = getDbClient();
    const key = settingKey(outletId);

    await prisma.outletSetting.updateMany({
      where: {
        outlet_id: outletId,
        setting_key: key,
      },
      data: {
        setting_value: JSON.stringify({
          connected: false,
          access_token: null,
          refresh_token: null,
          token_expires_at: null,
          tenant_id: null,
          org_name: config?.org_name || null,
          connected_at: null,
          last_sync: config?.last_sync || null,
          invoices_exported: config?.invoices_exported || 0,
        }),
        updated_at: new Date(),
      },
    });

    return {
      success: true,
      message: `Disconnected from Xero${config?.org_name ? ` (${config.org_name})` : ''}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/** Format a Date as YYYY-MM-DD for Xero API */
function _fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Parse "Jan 2023" → Date(2023-01-15) */
function _parsePnlDate(str) {
  try {
    const [mon, yr] = str.split(' ');
    const months = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
    if (months[mon] === undefined || !yr) return null;
    return new Date(parseInt(yr), months[mon], 15);
  } catch { return null; }
}

/** Map a Xero account Type to our category string */
function _mapXeroAccountType(type, name = '') {
  const t = (type || '').toUpperCase();
  const n = (name || '').toLowerCase();
  if (t === 'REVENUE' || t === 'SALES') return 'Revenue';
  if (t === 'DIRECTCOSTS' || t === 'COSTOFGOODSSOLD') return 'Cost of Sales';
  if (t === 'DEPRECIATN' || n.includes('deprec') || n.includes('amort')) return 'Depreciation';
  if (n.includes('wage') || n.includes('salary') || n.includes('labour') || n.includes('labor') || n.includes('payroll') || n.includes('superannuation') || n.includes('workers comp')) return 'Labour';
  if (n.includes('rent') || n.includes('lease') || n.includes('utilities') || n.includes('electricity') || n.includes('gas') || n.includes('water')) return 'Occupancy';
  if (n.includes('market') || n.includes('advertis') || n.includes('promotion')) return 'Marketing';
  if (n.includes('insurance') || n.includes('accounting') || n.includes('legal') || n.includes('bank fee') || n.includes('admin')) return 'Admin';
  return 'Operations';
}

/** Map a P&L section title to a category */
function _mapXeroSectionToCategory(sectionTitle) {
  const t = (sectionTitle || '').toLowerCase();
  if (t.includes('income') || t.includes('revenue') || t.includes('sales')) return 'Revenue';
  if (t.includes('cost') || t.includes('cogs')) return 'Cost of Sales';
  if (t.includes('deprec')) return 'Depreciation';
  return 'Operations';
}

/** Map balance sheet section title to account type string */
function _mapBSSubTypeToAccountType(subType) {
  const t = (subType || '').toLowerCase();
  if (t.includes('current asset')) return 'CURRENT';
  if (t.includes('non-current asset') || t.includes('fixed') || t.includes('plant')) return 'FIXED';
  if (t.includes('current liab')) return 'CURRENT_LIABILITY';
  if (t.includes('non-current liab') || t.includes('long-term')) return 'NON_CURRENT';
  if (t.includes('equity') || t.includes('capital')) return 'EQUITY';
  if (t.includes('bank')) return 'BANK';
  return 'OTHER';
}

/**
 * Maps an order_type string to a Xero 'Service Channel' tracking option label.
 * @param {string} orderType - 'dine_in' | 'takeaway' | 'delivery'
 * @returns {string}
 */
function _channelLabel(orderType) {
  switch ((orderType || '').toLowerCase()) {
    case 'takeaway': return 'Takeaway';
    case 'delivery': return 'Delivery';
    case 'dine_in':  return 'Dine-In';
    default:         return 'Dine-In';
  }
}

/**
 * Normalises a payment method string from the DB into a display label
 * for the Xero invoice line description.
 * @param {string} method
 * @returns {string}
 */
function _normalisePaymentMethod(method) {
  const lower = (method || '').toLowerCase().trim();
  if (lower === 'cash') return 'Cash Sales';
  if (lower === 'card' || lower === 'credit_card' || lower === 'debit_card' || lower === 'eftpos') return 'Card Sales';
  if (lower === 'upi' || lower === 'qr') return 'UPI Sales';
  if (lower === 'online' || lower === 'wallet' || lower === 'paypal') return 'Online Sales';
  // Capitalise first letter for anything else
  return method ? method.charAt(0).toUpperCase() + method.slice(1) + ' Sales' : 'Other Sales';
}

module.exports = new XeroService();
