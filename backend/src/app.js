/**
 * @fileoverview Main Express application entry point.
 * Configures all middleware, routes, socket.io, and starts the server.
 * @module app
 */

require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');

const appConfig = require('./config/app');
const logger = require('./config/logger');
const { httpLogger } = require('./middleware/logger.middleware');
const { generalLimiter } = require('./middleware/rateLimit.middleware');
const { errorHandler, notFoundHandler } = require('./middleware/error.middleware');
const { initializeSocket } = require('./socket/index');
const { disconnectDb } = require('./config/database');
const { disconnectRedis, getRedisClient } = require('./config/redis');

const app = express();
const server = http.createServer(app);

// Enable trust proxy for correct IP detection behind Render/Vercel load balancers
app.set('trust proxy', 1);

/* ------------------------------------------------------------------
   SECURITY MIDDLEWARE
   ------------------------------------------------------------------ */
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: function originCheck(origin, callback) {
    // Always allow requests with no origin (mobile apps, curl, Electron)
    if (!origin) return callback(null, true);

    // Allow only this project's Vercel URLs (production + preview deploys)
    const isVercel = /^https:\/\/petpooja[-\w]*\.vercel\.app$/.test(origin);
    // Allow any localhost port for dev
    const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    // Allow explicitly whitelisted origins
    const isWhitelisted = appConfig.corsWhitelist.includes(origin) || appConfig.corsWhitelist.includes('*');

    if (isVercel || isLocalhost || isWhitelisted) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked origin: ${origin}`);
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Disposition'],
}));

/* ------------------------------------------------------------------
   PARSING & COMPRESSION
   ------------------------------------------------------------------ */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());

/* ------------------------------------------------------------------
   LOGGING & RATE LIMITING
   ------------------------------------------------------------------ */
app.use(httpLogger());
app.use('/api/', generalLimiter);

/* ------------------------------------------------------------------
   PHASE 7: SECURITY HARDENING
   ------------------------------------------------------------------ */
const { inputSanitizer, validateUUIDs, additionalHeaders, payloadSizeGuard, strictTransportSecurity, contentSecurityPolicy } = require('./middleware/security.middleware');
app.use(additionalHeaders);
// HSTS: enforce HTTPS in production
if (appConfig.env === 'production') {
  app.use(strictTransportSecurity);
  app.use(contentSecurityPolicy);
}
app.use(inputSanitizer);
app.use(validateUUIDs);
app.use('/api/', (req, res, next) => {
  // AI menu scan accepts images up to 10MB; all other routes stay at 2MB
  const limit = req.path === '/menu/ai/scan-menu' ? 10 * 1024 * 1024 : 2 * 1024 * 1024;
  return payloadSizeGuard(limit)(req, res, next);
});

/* ------------------------------------------------------------------
   STATIC FILES (uploads & frontend built assets)
   ------------------------------------------------------------------ */
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/public', express.static(path.join(__dirname, '../public')));
app.use('/kitchen', express.static(path.join(__dirname, '../public/kitchen')));

// Allow client-side routing for frontend
app.get('/public/dashboard/*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/dashboard/index.html'));
});
app.get('/public/kitchen/*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/kitchen/index.html'));
});

/* ------------------------------------------------------------------
   HEALTH CHECK
   ------------------------------------------------------------------ */
const { getDbClient } = require('./config/database');

app.get('/health', async (req, res) => {
  let dbStatus = 'disconnected';
  try {
    const prisma = getDbClient();
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = 'healthy';
  } catch (err) {
    logger.error('Health Check DB Failure:', err.message);
    dbStatus = 'error';
  }

  res.status(dbStatus === 'healthy' ? 200 : 500).json({
    success: dbStatus === 'healthy',
    data: {
      service: appConfig.name,
      version: '1.0.0',
      environment: appConfig.env,
      uptime: Math.floor(process.uptime()),
      database: dbStatus,
      timestamp: new Date().toISOString(),
    },
    message: dbStatus === 'healthy' ? 'MS-RM API running' : 'Database connection issues',
  });
});

/* ------------------------------------------------------------------
   API ROUTES
   ------------------------------------------------------------------ */
const authRoutes = require('./modules/auth/auth.routes');
const menuRoutes = require('./modules/menu/menu.routes');
const orderRoutes = require('./modules/orders/order.routes');
const tableRoutes = require('./modules/orders/table.routes');
const kotRoutes = require('./modules/orders/kot.routes');
const inventoryRoutes = require('./modules/inventory/inventory.routes');
const customerRoutes = require('./modules/customers/customer.routes');
const staffRoutes = require('./modules/staff/staff.routes');
const reportsRoutes = require('./modules/reports/reports.routes');
const integrationRoutes = require('./modules/integrations/integration.routes');
const headofficeRoutes = require('./modules/headoffice/headoffice.routes');
const superadminRoutes = require('./modules/superadmin/superadmin.routes');
const discountRoutes = require('./modules/discounts/discount.routes');
const mockRoutes = require('./mock-integrations/routes/mock.routes');
const mockTestRoutes = require('./mock-integrations/routes/test.routes');

app.get('/api', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      name: appConfig.name,
      version: '1.0.0',
      endpoints: {
        auth: '/api/auth',
        menu: '/api/menu',
        orders: '/api/orders',
        tables: '/api/orders/tables',
        kitchen: '/api/kitchen',
        inventory: '/api/inventory',
        customers: '/api/customers',
        staff: '/api/staff',
        reports: '/api/reports',
        integrations: '/api/integrations',
        headoffice: '/api/ho',
        superadmin: '/api/superadmin',
        discounts: '/api/discounts',
        dashboard: '/api/dashboard',
        audit_logs: '/api/audit-logs',
      },
    },
    message: 'MS-RM Restaurant Management API — Welcome',
  });
});

const onlineOrderRoutes = require('./modules/online-orders/online-order.routes');
const ckRoutes = require('./modules/central-kitchen/ck.routes');
const ondcRoutes = require('./modules/ondc/ondc.routes');
const voicePosRoutes = require('./modules/voice-pos/voice-pos.routes');
const pricingRoutes  = require('./modules/pricing/pricing.routes');
const festivalRoutes = require('./modules/festival/festival.routes');
const fraudRoutes    = require('./modules/fraud/fraud.routes');
const rosteringRoutes = require('./modules/staff/rostering.routes');
const xeroRoutes       = require('./modules/xero/xero.routes');

app.use('/api/auth', authRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/orders/tables', tableRoutes); // Moved up to prevent collision with /api/orders/:id
app.use('/api/orders', orderRoutes);
app.use('/api/kitchen', kotRoutes);
app.use('/api/online-orders', onlineOrderRoutes);


app.use('/api/inventory', inventoryRoutes);
// Procurement routes handle: /api/purchase-orders/*, /api/suppliers/*, /api/presets/*
app.use('/api', require('./modules/inventory/procurement.routes'));
// Native accounting ledger — /api/accounting/*
app.use('/api/accounting', require('./modules/accounting/accounting.routes'));
// Expense routes — /api/expenses
app.use('/api', require('./modules/expenses/expense.routes'));
app.use('/api/customers', customerRoutes);
app.use('/api/staff', staffRoutes);
const eodRoutes = require('./modules/reports/eod.routes');
app.use('/api/reports/eod', eodRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/integrations', integrationRoutes);
const aggregatorRoutes = require('./modules/integrations/aggregator.routes');
app.use('/api/aggregators', aggregatorRoutes);
app.use('/api/ho', headofficeRoutes);
app.use('/api/superadmin', superadminRoutes);
app.use('/api/discounts', discountRoutes);
app.use('/api/ck', ckRoutes);
app.use('/api/ondc', ondcRoutes);
app.use('/api/voice-pos', voicePosRoutes);
const onboardingRoutes = require('./modules/onboarding/onboarding.routes');
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/pricing',   pricingRoutes);
app.use('/api/festival',  festivalRoutes);
app.use('/api/fraud',     fraudRoutes);
app.use('/api/rostering', rosteringRoutes);
app.use('/api/xero',      xeroRoutes);
const auIntegrationsRoutes = require('./modules/integrations/au-integrations.routes');
app.use('/api/integrations/au', auIntegrationsRoutes);
const whatsappRoutes = require('./modules/integrations/whatsapp.routes');
app.use('/api/whatsapp', whatsappRoutes);
const reservationRoutes = require('./modules/reservations/reservations.routes');
app.use('/api/reservations', reservationRoutes);
const dashboardRoutes = require('./modules/dashboard/dashboard.routes');
app.use('/api/dashboard', dashboardRoutes);
const auditRoutes = require('./modules/audit/audit.routes');
app.use('/api/audit-logs', auditRoutes);
// Mock & test routes — NEVER expose in production
if (appConfig.env !== 'production') {
  app.use('/mock', mockRoutes);
  app.use('/test', mockTestRoutes);
} else {
  logger.info('Mock/test routes disabled in production.');
}

// Initialize Billing & Subscriptions
try {
  require('./modules/headoffice/billing.service');
  logger.info('Billing service initialized.');
} catch (err) {
  logger.error('Billing service failed to initialize:', { error: err.message });
}

/* ------------------------------------------------------------------
   404 + ERROR HANDLERS
   ------------------------------------------------------------------ */
app.use(notFoundHandler);
app.use(errorHandler);

/* ------------------------------------------------------------------
   EAGER INITIALIZATION & STARTUP CHECKS
   ------------------------------------------------------------------ */
async function startApp() {
  logger.info('Initializing core services...');
  
  // Eagerly connect to DB
  try {
    const prisma = getDbClient();
    await prisma.$connect();
    logger.info('Database connection established.');

    // ── Schema drift migration (idempotent) ──────────────────────────────
    // Applies columns that exist in schema.prisma but may be missing from DB.
    // Uses ADD COLUMN IF NOT EXISTS so it is safe to re-run on every deploy.
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE outlets
          ADD COLUMN IF NOT EXISTS abn            VARCHAR(11),
          ADD COLUMN IF NOT EXISTS acn            VARCHAR(9),
          ADD COLUMN IF NOT EXISTS bill_footer    TEXT,
          ADD COLUMN IF NOT EXISTS bill_header    TEXT,
          ADD COLUMN IF NOT EXISTS metadata       JSONB DEFAULT '{}',
          ADD COLUMN IF NOT EXISTS printer_ip     VARCHAR(50),
          ADD COLUMN IF NOT EXISTS printer_type   VARCHAR(30) DEFAULT 'THERMAL',
          ADD COLUMN IF NOT EXISTS tables_count   INTEGER NOT NULL DEFAULT 0;
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE head_offices
          ADD COLUMN IF NOT EXISTS abn                VARCHAR(20),
          ADD COLUMN IF NOT EXISTS acn                VARCHAR(15),
          ADD COLUMN IF NOT EXISTS country_code       VARCHAR(2)  NOT NULL DEFAULT 'IN',
          ADD COLUMN IF NOT EXISTS currency           VARCHAR(5)  NOT NULL DEFAULT 'INR',
          ADD COLUMN IF NOT EXISTS region             VARCHAR(5)  NOT NULL DEFAULT 'IN',
          ADD COLUMN IF NOT EXISTS regulations_profile VARCHAR(20) NOT NULL DEFAULT 'INDIA',
          ADD COLUMN IF NOT EXISTS timezone           VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
          ADD COLUMN IF NOT EXISTS setup_completed    BOOLEAN NOT NULL DEFAULT false,
          ADD COLUMN IF NOT EXISTS plan               VARCHAR(50) NOT NULL DEFAULT 'TRIAL',
          ADD COLUMN IF NOT EXISTS metadata           JSONB DEFAULT '{}';
      `);
      logger.info('Schema drift migration applied successfully.');
    } catch (migErr) {
      // Non-fatal: log but do not crash startup
      logger.warn('Schema drift migration warning (non-fatal):', { error: migErr.message });
    }

    // ── Widen image_url columns to TEXT (were VARCHAR(500), too short for base64) ─
    // Run each ALTER separately so one missing column doesn't block the others
    for (const tbl of ['menu_items', 'item_combo', 'menu_templates']) {
      try {
        await prisma.$executeRawUnsafe(`ALTER TABLE ${tbl} ALTER COLUMN image_url TYPE TEXT`);
        logger.info(`${tbl}.image_url widened to TEXT.`);
      } catch (e) {
        // Non-fatal: column may already be TEXT or may not exist on this table
        logger.warn(`${tbl}.image_url migration skipped:`, { error: e.message });
      }
    }

    // ── Targeted schema drift: AU/regional columns added after initial deploy ─
    // Each ALTER is wrapped in its own try-catch so missing tables don't block.
    const driftFixes = [
      // suppliers: AU support added abn/pan/payment_terms, soft-delete + active flag
      ['suppliers',         `ADD COLUMN IF NOT EXISTS abn VARCHAR(11),
                             ADD COLUMN IF NOT EXISTS pan VARCHAR(12),
                             ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(50),
                             ADD COLUMN IF NOT EXISTS gstin VARCHAR(20),
                             ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
                             ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false`],
      // table_reservations: duration_minutes was added later
      ['table_reservations', `ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NOT NULL DEFAULT 90,
                              ADD COLUMN IF NOT EXISTS notes TEXT,
                              ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false`],
      // staff_certifications: the entire table was added with the rostering module
      // The CREATE TABLE will be a no-op if it exists.
      // We can't easily create a new table from raw SQL safely, so just ALTER known cols.
      ['staff_certifications', `ADD COLUMN IF NOT EXISTS provider VARCHAR(200),
                                ADD COLUMN IF NOT EXISTS cert_number VARCHAR(100),
                                ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true`],
      // tables: auto_free_at added for predictive auto-free feature
      ['tables', `ADD COLUMN IF NOT EXISTS auto_free_at TIMESTAMPTZ`],
      // purchase_orders: supplier_id must be nullable (POs can be supplier-less)
      ['purchase_orders', `ALTER COLUMN supplier_id DROP NOT NULL`],
      // purchase_orders: columns added across procurement iterations
      ['purchase_orders', `ADD COLUMN IF NOT EXISTS reference_number VARCHAR(50),
                           ADD COLUMN IF NOT EXISTS terms            TEXT,
                           ADD COLUMN IF NOT EXISTS notes            TEXT,
                           ADD COLUMN IF NOT EXISTS expected_date    DATE,
                           ADD COLUMN IF NOT EXISTS delivery_date    DATE,
                           ADD COLUMN IF NOT EXISTS discount_amount  DECIMAL(12,2) NOT NULL DEFAULT 0,
                           ADD COLUMN IF NOT EXISTS pdf_path         TEXT,
                           ADD COLUMN IF NOT EXISTS sent_at          TIMESTAMPTZ,
                           ADD COLUMN IF NOT EXISTS approved_at      TIMESTAMPTZ,
                           ADD COLUMN IF NOT EXISTS approved_by      UUID,
                           ADD COLUMN IF NOT EXISTS created_by       UUID`],
      // po_items: tax/category/received/hsn fields added later
      ['po_items', `ADD COLUMN IF NOT EXISTS category          VARCHAR(50),
                    ADD COLUMN IF NOT EXISTS tax_rate          DECIMAL(5,2) NOT NULL DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS tax_amount        DECIMAL(12,2) NOT NULL DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS total_cost        DECIMAL(12,2) NOT NULL DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS received_quantity DECIMAL(12,3) NOT NULL DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS hsn_code          VARCHAR(20),
                    ADD COLUMN IF NOT EXISTS notes             TEXT`],
      // staff_profiles: compliance + personal + payroll fields added in staff management module
      ['staff_profiles', `ADD COLUMN IF NOT EXISTS employment_type    VARCHAR(20),
                          ADD COLUMN IF NOT EXISTS contract_end_date  DATE,
                          ADD COLUMN IF NOT EXISTS end_date           DATE,
                          ADD COLUMN IF NOT EXISTS date_of_birth      DATE,
                          ADD COLUMN IF NOT EXISTS gender             VARCHAR(20),
                          ADD COLUMN IF NOT EXISTS nationality        VARCHAR(60),
                          ADD COLUMN IF NOT EXISTS address            VARCHAR(500),
                          ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(100),
                          ADD COLUMN IF NOT EXISTS emergency_relationship  VARCHAR(50),
                          ADD COLUMN IF NOT EXISTS bank_bsb           VARCHAR(10),
                          ADD COLUMN IF NOT EXISTS bank_account       VARCHAR(20),
                          ADD COLUMN IF NOT EXISTS bank_account_name  VARCHAR(100),
                          ADD COLUMN IF NOT EXISTS tax_file_number    VARCHAR(20),
                          ADD COLUMN IF NOT EXISTS superannuation_fund VARCHAR(100),
                          ADD COLUMN IF NOT EXISTS super_member_number VARCHAR(50),
                          ADD COLUMN IF NOT EXISTS right_to_work_checked BOOLEAN DEFAULT false,
                          ADD COLUMN IF NOT EXISTS visa_type          VARCHAR(50),
                          ADD COLUMN IF NOT EXISTS visa_expiry        DATE,
                          ADD COLUMN IF NOT EXISTS induction_completed BOOLEAN DEFAULT false,
                          ADD COLUMN IF NOT EXISTS induction_date     DATE,
                          ADD COLUMN IF NOT EXISTS wwcc_number        VARCHAR(50),
                          ADD COLUMN IF NOT EXISTS wwcc_expiry        DATE,
                          ADD COLUMN IF NOT EXISTS rsa_number         VARCHAR(50),
                          ADD COLUMN IF NOT EXISTS rsa_expiry         DATE,
                          ADD COLUMN IF NOT EXISTS food_safety_cert   VARCHAR(50),
                          ADD COLUMN IF NOT EXISTS food_safety_expiry DATE,
                          ADD COLUMN IF NOT EXISTS police_check_date  DATE,
                          ADD COLUMN IF NOT EXISTS police_check_expiry DATE,
                          ADD COLUMN IF NOT EXISTS notes              TEXT`],
    ];
    for (const [tbl, sql] of driftFixes) {
      try {
        await prisma.$executeRawUnsafe(`ALTER TABLE ${tbl} ${sql}`);
        logger.info(`Schema drift patched: ${tbl}`);
      } catch (e) {
        logger.warn(`Schema drift skipped (${tbl}):`, { error: e.message });
      }
    }

    // ── Create native accounting ledger tables if missing ───────────────────
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS chart_accounts (
          id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
          outlet_id  UUID         NOT NULL,
          code       VARCHAR(10)  NOT NULL,
          name       VARCHAR(120) NOT NULL,
          type       VARCHAR(20)  NOT NULL,
          subtype    VARCHAR(40),
          gst        BOOLEAN      NOT NULL DEFAULT false,
          is_active  BOOLEAN      NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
          is_deleted BOOLEAN      NOT NULL DEFAULT false,
          CONSTRAINT chart_accounts_outlet_code_key UNIQUE (outlet_id, code)
        )`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_chart_accounts_outlet_type ON chart_accounts(outlet_id, type)`);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS journal_entries (
          id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          outlet_id  UUID        NOT NULL,
          entry_date DATE        NOT NULL,
          source     VARCHAR(30) NOT NULL,
          source_id  UUID,
          reference  VARCHAR(60),
          memo       TEXT,
          created_by UUID,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          is_deleted BOOLEAN     NOT NULL DEFAULT false
        )`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_journal_entries_outlet_date ON journal_entries(outlet_id, entry_date)`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_journal_entries_source ON journal_entries(source, source_id)`);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS journal_lines (
          id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
          entry_id    UUID          NOT NULL,
          account_id  UUID          NOT NULL,
          debit       DECIMAL(14,2) NOT NULL DEFAULT 0,
          credit      DECIMAL(14,2) NOT NULL DEFAULT 0,
          description VARCHAR(200)
        )`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON journal_lines(entry_id)`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_lines(account_id)`);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS bill_payments (
          id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
          outlet_id         UUID          NOT NULL,
          purchase_order_id UUID          NOT NULL,
          amount            DECIMAL(12,2) NOT NULL,
          method            VARCHAR(20)   NOT NULL DEFAULT 'bank',
          paid_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
          journal_entry_id  UUID,
          created_by        UUID,
          is_deleted        BOOLEAN       NOT NULL DEFAULT false
        )`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_bill_payments_outlet_po ON bill_payments(outlet_id, purchase_order_id)`);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS accounting_period_locks (
          id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          outlet_id UUID        NOT NULL,
          period    VARCHAR(7)  NOT NULL,
          locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          locked_by UUID,
          note      TEXT,
          CONSTRAINT accounting_period_locks_outlet_period_key UNIQUE (outlet_id, period)
        )`);
      logger.info('Accounting ledger tables ensured');
    } catch (e) {
      logger.warn('Accounting ledger tables skipped:', { error: e.message });
    }

    // ── Ensure expenses table + its columns (schema drift on prod) ───────────
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS expenses (
          id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
          outlet_id      UUID         NOT NULL,
          title          VARCHAR(200) NOT NULL,
          description    VARCHAR(500),
          amount         DECIMAL(12,2) NOT NULL,
          category       VARCHAR(50)  NOT NULL DEFAULT 'Misc',
          expense_date   DATE         NOT NULL DEFAULT now(),
          payment_method VARCHAR(30)  NOT NULL DEFAULT 'Cash',
          notes          TEXT,
          created_by     UUID,
          is_deleted     BOOLEAN      NOT NULL DEFAULT false,
          created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
          updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
        )`);
      await prisma.$executeRawUnsafe(`ALTER TABLE expenses
        ADD COLUMN IF NOT EXISTS title          VARCHAR(200),
        ADD COLUMN IF NOT EXISTS description    VARCHAR(500),
        ADD COLUMN IF NOT EXISTS category        VARCHAR(50) NOT NULL DEFAULT 'Misc',
        ADD COLUMN IF NOT EXISTS expense_date    DATE NOT NULL DEFAULT now(),
        ADD COLUMN IF NOT EXISTS payment_method  VARCHAR(30) NOT NULL DEFAULT 'Cash',
        ADD COLUMN IF NOT EXISTS notes           TEXT,
        ADD COLUMN IF NOT EXISTS created_by      UUID,
        ADD COLUMN IF NOT EXISTS is_deleted      BOOLEAN NOT NULL DEFAULT false`);
      logger.info('expenses table ensured');
    } catch (e) {
      logger.warn('expenses table skipped:', { error: e.message });
    }

    // ── Create outlet_daily_counters if missing (race-safe order sequencing) ──
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS outlet_daily_counters (
          id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          outlet_id  UUID        NOT NULL,
          day        VARCHAR(10) NOT NULL,
          seq        INTEGER     NOT NULL DEFAULT 0,
          CONSTRAINT outlet_daily_counters_outlet_day_key UNIQUE (outlet_id, day)
        )
      `);
      // Seed from existing orders so the first new order doesn't collide with
      // orders already created today before this table existed.
      await prisma.$executeRawUnsafe(`
        INSERT INTO outlet_daily_counters (outlet_id, day, seq)
        SELECT
          outlet_id,
          TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
          COUNT(*)::INTEGER AS seq
        FROM orders
        WHERE is_deleted = false
        GROUP BY outlet_id, TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
        ON CONFLICT (outlet_id, day) DO UPDATE
          SET seq = GREATEST(outlet_daily_counters.seq, EXCLUDED.seq)
      `);
      logger.info('outlet_daily_counters table ensured and seeded');
    } catch (e) {
      logger.warn('outlet_daily_counters create skipped:', { error: e.message });
    }

    // ── Create Xero tables if they don't exist ───────────────────────────
    // All statements are idempotent (CREATE TABLE IF NOT EXISTS).
    const xeroTableDDL = [
      `CREATE TABLE IF NOT EXISTS xero_connections (
        id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        outlet_id     UUID        NOT NULL REFERENCES outlets(id),
        org_name      VARCHAR(200) NOT NULL,
        abn           VARCHAR(20),
        address       TEXT,
        currency      VARCHAR(5)  NOT NULL DEFAULT 'AUD',
        country_code  VARCHAR(5)  NOT NULL DEFAULT 'AU',
        timezone      VARCHAR(50),
        is_connected  BOOLEAN     NOT NULL DEFAULT true,
        last_synced   TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        is_deleted    BOOLEAN     NOT NULL DEFAULT false
      )`,
      `CREATE INDEX IF NOT EXISTS idx_xero_conn_outlet ON xero_connections(outlet_id)`,

      `CREATE TABLE IF NOT EXISTS xero_accounts (
        id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        connection_id UUID        NOT NULL REFERENCES xero_connections(id),
        code          VARCHAR(10) NOT NULL,
        name          VARCHAR(200) NOT NULL,
        type          VARCHAR(30) NOT NULL,
        category      VARCHAR(50) NOT NULL,
        is_active     BOOLEAN     NOT NULL DEFAULT true,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(connection_id, code)
      )`,

      `CREATE TABLE IF NOT EXISTS xero_transactions (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        connection_id   UUID        NOT NULL REFERENCES xero_connections(id),
        transaction_ref VARCHAR(30) NOT NULL,
        date            DATE        NOT NULL,
        type            VARCHAR(30) NOT NULL,
        reference       VARCHAR(50),
        account_code    VARCHAR(10) NOT NULL,
        account_name    VARCHAR(200) NOT NULL,
        account_type    VARCHAR(30) NOT NULL,
        category        VARCHAR(50) NOT NULL,
        description     TEXT,
        contact         VARCHAR(200),
        amount_incl_gst DECIMAL(12,2) NOT NULL,
        gst             DECIMAL(12,2) NOT NULL,
        net_amount      DECIMAL(12,2) NOT NULL,
        currency        VARCHAR(5)  NOT NULL DEFAULT 'AUD',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(connection_id, transaction_ref)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_xero_txn_date     ON xero_transactions(connection_id, date)`,
      `CREATE INDEX IF NOT EXISTS idx_xero_txn_cat      ON xero_transactions(connection_id, category)`,
      `CREATE INDEX IF NOT EXISTS idx_xero_txn_actype   ON xero_transactions(connection_id, account_type)`,
      `CREATE INDEX IF NOT EXISTS idx_xero_txn_contact  ON xero_transactions(connection_id, contact)`,

      `CREATE TABLE IF NOT EXISTS xero_bank_accounts (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        connection_id   UUID        NOT NULL REFERENCES xero_connections(id),
        account_name    VARCHAR(200) NOT NULL,
        account_number  VARCHAR(20) NOT NULL,
        bsb             VARCHAR(10),
        opening_balance DECIMAL(12,2) NOT NULL,
        opening_date    DATE        NOT NULL,
        current_balance DECIMAL(12,2) NOT NULL,
        is_active       BOOLEAN     NOT NULL DEFAULT true,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(connection_id, account_number)
      )`,

      `CREATE TABLE IF NOT EXISTS xero_balance_sheet_lines (
        id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        connection_id UUID        NOT NULL REFERENCES xero_connections(id),
        as_at_date    DATE        NOT NULL,
        account_code  VARCHAR(10) NOT NULL,
        account_name  VARCHAR(200) NOT NULL,
        account_type  VARCHAR(30) NOT NULL,
        sub_type      VARCHAR(30) NOT NULL,
        balance       DECIMAL(14,2) NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_xero_bsl_date ON xero_balance_sheet_lines(connection_id, as_at_date)`,

      `CREATE TABLE IF NOT EXISTS xero_invoices (
        id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        connection_id  UUID        NOT NULL REFERENCES xero_connections(id),
        invoice_number VARCHAR(30) NOT NULL,
        contact        VARCHAR(200) NOT NULL,
        type           VARCHAR(10) NOT NULL,
        status         VARCHAR(20) NOT NULL,
        date           DATE        NOT NULL,
        due_date       DATE        NOT NULL,
        total          DECIMAL(12,2) NOT NULL,
        amount_paid    DECIMAL(12,2) NOT NULL,
        amount_due     DECIMAL(12,2) NOT NULL,
        currency       VARCHAR(5)  NOT NULL DEFAULT 'AUD',
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(connection_id, invoice_number)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_xero_inv_status ON xero_invoices(connection_id, status)`,
      `CREATE INDEX IF NOT EXISTS idx_xero_inv_due    ON xero_invoices(connection_id, due_date)`,

      `CREATE TABLE IF NOT EXISTS xero_bas_returns (
        id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        connection_id UUID        NOT NULL REFERENCES xero_connections(id),
        quarter       INT         NOT NULL,
        year          INT         NOT NULL,
        period_start  DATE        NOT NULL,
        period_end    DATE        NOT NULL,
        gst_collected DECIMAL(12,2) NOT NULL,
        gst_paid      DECIMAL(12,2) NOT NULL,
        net_gst       DECIMAL(12,2) NOT NULL,
        payg_withheld DECIMAL(12,2) NOT NULL,
        total_payable DECIMAL(12,2) NOT NULL,
        status        VARCHAR(20) NOT NULL,
        lodged_date   DATE,
        due_date      DATE        NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(connection_id, year, quarter)
      )`,

      `CREATE TABLE IF NOT EXISTS xero_contacts (
        id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        connection_id     UUID        NOT NULL REFERENCES xero_connections(id),
        name              VARCHAR(200) NOT NULL,
        contact_type      VARCHAR(20) NOT NULL,
        abn               VARCHAR(20),
        email             VARCHAR(200),
        phone             VARCHAR(30),
        address           TEXT,
        city              VARCHAR(100),
        state             VARCHAR(10),
        postcode          VARCHAR(10),
        is_active         BOOLEAN     NOT NULL DEFAULT true,
        total_spend       DECIMAL(12,2) NOT NULL DEFAULT 0,
        total_revenue     DECIMAL(12,2) NOT NULL DEFAULT 0,
        transaction_count INT         NOT NULL DEFAULT 0,
        first_transaction DATE,
        last_transaction  DATE,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(connection_id, name)
      )`,

      `CREATE TABLE IF NOT EXISTS xero_tracking_categories (
        id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        connection_id UUID        NOT NULL REFERENCES xero_connections(id),
        name          VARCHAR(100) NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(connection_id, name)
      )`,

      `CREATE TABLE IF NOT EXISTS xero_tracking_options (
        id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        category_id UUID        NOT NULL REFERENCES xero_tracking_categories(id),
        name        VARCHAR(100) NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(category_id, name)
      )`,

      `CREATE TABLE IF NOT EXISTS xero_tracking_summaries (
        id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        connection_id     UUID        NOT NULL REFERENCES xero_connections(id),
        option_id         UUID        NOT NULL REFERENCES xero_tracking_options(id),
        year              INT         NOT NULL,
        month             INT         NOT NULL,
        revenue           DECIMAL(12,2) NOT NULL,
        cost              DECIMAL(12,2) NOT NULL,
        transaction_count INT         NOT NULL,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
    ];
    for (const ddl of xeroTableDDL) {
      try {
        await prisma.$executeRawUnsafe(ddl);
      } catch (e) {
        logger.warn('Xero DDL skipped:', { error: e.message.slice(0, 120) });
      }
    }
    logger.info('Xero tables ensured.');
    // ─────────────────────────────────────────────────────────────────────
  } catch (err) {
    logger.error('Failed to establish database connection during startup:', err.message);
  }

  // Eagerly trigger Redis setup
  try {
    getRedisClient();
    logger.info('Redis initialization triggered.');
  } catch (err) {
    logger.error('Failed to trigger Redis initialization:', err.message);
  }

  // Initialize Socket.io
  try {
    initializeSocket(server);
    logger.info('Socket.io initialized.');
  } catch (err) {
    logger.error('Failed to initialize Socket.io:', err.message);
  }

  // ── Native WebSocket server (wss://.../ws?token=JWT) ────────────────────
  try {
    const { WebSocketServer } = require('ws');
    const jwt = require('jsonwebtoken');

    const wss = new WebSocketServer({ server, path: '/ws' });

    wss.on('connection', (ws, req) => {
      try {
        const url = new URL(req.url, 'http://localhost');
        const token = url.searchParams.get('token');
        if (!token) { ws.close(4001, 'Missing token'); return; }

        const secret = require('./config/app').jwt.secret;
        const decoded = jwt.verify(token, secret);
        ws.userId = decoded.id || decoded.sub;
        ws.outletId = decoded.outlet_id;
        ws.restaurantId = decoded.restaurant_id || decoded.headOfficeId;
      } catch (err) {
        ws.close(4003, 'Invalid token');
        return;
      }

      ws.isAlive = true;
      ws.on('pong', () => { ws.isAlive = true; });
      ws.on('close', () => { /* connection removed automatically from wss.clients */ });
      ws.on('error', (err) => logger.warn('WS client error:', err.message));

      ws.send(JSON.stringify({ type: 'CONNECTED', timestamp: Date.now() }));
      logger.info(`WS connected: user=${ws.userId} outlet=${ws.outletId}`);
    });

    // Heartbeat — terminate stale connections every 30 s
    const heartbeat = setInterval(() => {
      wss.clients.forEach((ws) => {
        if (!ws.isAlive) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);

    wss.on('close', () => clearInterval(heartbeat));

    // Global broadcaster — available to controllers via global.broadcastOrderUpdate(order)
    global.broadcastOrderUpdate = (order) => {
      const payload = JSON.stringify({ type: 'ORDER_UPDATE', data: order });
      wss.clients.forEach((ws) => {
        // Scope broadcast to the same outlet if possible
        if (ws.readyState === 1 && (!ws.outletId || ws.outletId === order.outlet_id)) {
          ws.send(payload);
        }
      });
    };

    logger.info('Native WebSocket server initialised at /ws');
  } catch (err) {
    logger.error('Failed to initialise WebSocket server:', err.message);
  }
  // ─────────────────────────────────────────────────────────────────────────

  server.listen(appConfig.port, () => {
    logger.info(`🚀 ${appConfig.name} API running on port ${appConfig.port} [${appConfig.env}]`);
    logger.info(`   Health: http://localhost:${appConfig.port}/health`);
    logger.info(`   API:    http://localhost:${appConfig.port}/api`);
  });
}

startApp();

/* ------------------------------------------------------------------
   GRACEFUL SHUTDOWN
   ------------------------------------------------------------------ */
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received. Starting graceful shutdown...`);
  server.close(async () => {
    logger.info('HTTP server closed');
    await disconnectDb();
    await disconnectRedis();
    logger.info('All connections closed. Exiting.');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forced shutdown — could not close connections in time');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', { reason: reason?.message || reason });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', { message: error.message, stack: error.stack });
  process.exit(1);
});

module.exports = { app, server };
