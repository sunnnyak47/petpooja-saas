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
const { disconnectRedis } = require('./config/redis');

const app = express();
const server = http.createServer(app);

/* ------------------------------------------------------------------
   SECURITY MIDDLEWARE
   ------------------------------------------------------------------ */
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: function originCheck(origin, callback) {
    if (!origin || appConfig.corsWhitelist.includes(origin) || appConfig.corsWhitelist.includes('*')) {
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
const { inputSanitizer, validateUUIDs, additionalHeaders, payloadSizeGuard } = require('./middleware/security.middleware');
app.use(additionalHeaders);
app.use(inputSanitizer);
app.use(validateUUIDs);
app.use('/api/', payloadSizeGuard(2 * 1024 * 1024));

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
    message: dbStatus === 'healthy' ? 'Petpooja API running' : 'Database connection issues',
  });
});

/* ------------------------------------------------------------------
   API ROUTES
   ------------------------------------------------------------------ */
const authRoutes = require('./modules/auth/auth.routes');
const menuRoutes = require('./modules/menu/menu.routes');
const orderRoutes = require('./modules/orders/order.routes');
const kotRoutes = require('./modules/orders/kot.routes');
const inventoryRoutes = require('./modules/inventory/inventory.routes');
const customerRoutes = require('./modules/customers/customer.routes');
const staffRoutes = require('./modules/staff/staff.routes');
const reportsRoutes = require('./modules/reports/reports.routes');
const integrationRoutes = require('./modules/integrations/integration.routes');
const headofficeRoutes = require('./modules/headoffice/headoffice.routes');
const superadminRoutes = require('./modules/superadmin/superadmin.routes');

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
        kitchen: '/api/kitchen',
        inventory: '/api/inventory',
        customers: '/api/customers',
        staff: '/api/staff',
        reports: '/api/reports',
        integrations: '/api/integrations',
        headoffice: '/api/ho',
        superadmin: '/api/superadmin',
      },
    },
    message: 'Petpooja ERP API — Welcome',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/kitchen', kotRoutes);
const procurementRoutes = require('./modules/inventory/procurement.routes');

app.use('/api/inventory', inventoryRoutes);
app.use('/api/purchase-orders', procurementRoutes);
app.use('/api/suppliers', procurementRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/ho', headofficeRoutes);
app.use('/api/superadmin', superadminRoutes);

// Initialize Billing & Subscriptions
require('./modules/headoffice/billing.service');

/* ------------------------------------------------------------------
   404 + ERROR HANDLERS
   ------------------------------------------------------------------ */
app.use(notFoundHandler);
app.use(errorHandler);

/* ------------------------------------------------------------------
   SOCKET.IO INITIALIZATION
   ------------------------------------------------------------------ */
initializeSocket(server);

/* ------------------------------------------------------------------
   SERVER START
   ------------------------------------------------------------------ */
server.listen(appConfig.port, () => {
  logger.info(`🚀 ${appConfig.name} API running on port ${appConfig.port} [${appConfig.env}]`);
  logger.info(`   Health: http://localhost:${appConfig.port}/health`);
  logger.info(`   API:    http://localhost:${appConfig.port}/api`);
});

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
