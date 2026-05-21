/**
 * Xero Accounting Integration — AU
 * Full OAuth2 integration for syncing invoices, bills, and GST/BAS data to Xero.
 * Configure XERO_CLIENT_ID and XERO_CLIENT_SECRET to activate live mode.
 * When credentials are not set, all methods return realistic mock responses.
 */
const logger = require('../../../config/logger');
const { getDbClient } = require('../../../config/database');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const XERO_AUTH_URL = 'https://login.xero.com/identity/connect/authorize';
const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token';
const XERO_API_BASE = 'https://api.xero.com/api.xro/2.0';
const XERO_CONNECTIONS_URL = 'https://api.xero.com/connections';

// Minimal scope set guaranteed to work on a freshly-created Xero app.
// We do NOT request openid/profile/email — those are OIDC identity scopes
// that new apps don't have enabled by default and would trigger
// `invalid_scope` errors. Identity isn't needed for our integration; we
// only consume the org's accounting data, not the user's Xero profile.
const SCOPES = [
  'offline_access',              // mandatory — issues refresh tokens
  'accounting.transactions',     // read/write invoices, bills, bank txns
  'accounting.contacts',         // customers + suppliers
  'accounting.settings',         // org info, chart of accounts
  'accounting.reports.read',     // P&L, balance sheet, BAS reports
  'accounting.attachments.read', // invoice & bill attachments
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
      throw new Error(`Xero API ${res.status}: ${text.substring(0, 200)}`);
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

    return {
      connected: true,
      org_name: config.org_name,
      tenant_id: config.tenant_id,
      connected_at: config.connected_at,
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
   * Queries all paid orders for the given date and syncs them to Xero
   * as a single summary invoice grouped by payment method.
   * @param {string} outletId
   * @param {string} date - YYYY-MM-DD
   * @returns {Promise<object>} sync result
   */
  async syncDailySales(outletId, date) {
    logger.info(`[Xero] Syncing daily sales for outlet ${outletId} on ${date}`);

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

    // Get all paid orders for the date with their payments
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
      },
    });

    // Aggregate by payment method using integer cents
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
    const totalAmount = fromCents(totalCents);
    const totalTax = fromCents(totalTaxCents);

    // Build Xero-compatible line items
    const lineItems = Object.entries(methodTotals).map(([method, cents]) => ({
      Description: `${method} — ${date}`,
      Quantity: 1,
      UnitAmount: fromCents(cents),
      AccountCode: '200',
      TaxType: 'OUTPUT',
    }));

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
        message: 'Daily sales synced to Xero (mock — configure XERO_CLIENT_ID to activate)',
      };
    }

    // Live mode — POST to Xero
    const { accessToken, tenantId } = await this.getValidToken(outletId);

    const result = await this._xeroRequest(
      'POST',
      `${XERO_API_BASE}/Invoices`,
      accessToken,
      tenantId,
      { Invoices: [invoicePayload] }
    );

    const created = result.Invoices?.[0];

    // Update last_sync and invoices_exported count
    const config = await this._getConfig(outletId);
    if (config) {
      config.last_sync = new Date().toISOString();
      config.invoices_exported = (config.invoices_exported || 0) + 1;
      await this._saveConfig(outletId, config);
    }

    logger.info(`[Xero] Daily sales invoice created: ${created?.InvoiceID}`);

    return {
      success: true,
      mock: false,
      xero_invoice_id: created?.InvoiceID,
      invoice_number: invoiceNumber,
      total_amount: totalAmount,
      total_tax: totalTax,
      orders_count: orders.length,
      line_items: lineItems.length,
      payment_breakdown: Object.fromEntries(
        Object.entries(methodTotals).map(([m, c]) => [m, fromCents(c)])
      ),
      status: created?.Status || 'AUTHORISED',
      message: 'Daily sales synced to Xero',
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
