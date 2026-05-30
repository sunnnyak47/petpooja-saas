/**
 * @fileoverview Socket.io server initialization and namespace setup.
 * Configures order and kitchen namespaces for real-time communication.
 * @module socket/index
 */

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const appConfig = require('../config/app');
const logger = require('../config/logger');

/** @type {Server|null} */
let io = null;

/**
 * Attaches a Redis adapter so Socket.io events fan out across ALL backend
 * instances (Render autoscale). Without it, a KOT emitted on instance A never
 * reaches a KDS client connected to instance B — silent cross-instance loss.
 * Only attaches when a REAL Redis is configured; otherwise no-ops (single
 * instance / mock dev is unaffected).
 * @param {Server} server
 */
async function attachRedisAdapter(server) {
  const url = process.env.REDIS_URL;
  const isReal = url && url !== 'mock' && !url.includes('localhost');
  if (!isReal) {
    logger.info('Socket.io: no real Redis — running single-instance (no adapter).');
    return;
  }
  try {
    const Redis = require('ioredis');
    const { createAdapter } = require('@socket.io/redis-adapter');
    const pubClient = new Redis(url, { connectTimeout: 2000, lazyConnect: true, maxRetriesPerRequest: 1 });
    const subClient = pubClient.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()]);
    server.adapter(createAdapter(pubClient, subClient));
    logger.info('Socket.io: Redis adapter attached — multi-instance broadcast enabled.');
  } catch (err) {
    // Never let adapter failure take down realtime; fall back to single-instance.
    logger.error('Socket.io: Redis adapter setup failed, continuing single-instance.', { error: err.message });
  }
}

/**
 * Namespace middleware: verify a JWT from the handshake when present.
 * Backward-compatible — connections WITHOUT a token (e.g. public customer QR
 * pages) are still allowed, just flagged unauthenticated. Authenticated staff
 * sockets get a server-trusted outletId that room-joins can't override.
 */
function socketAuth(socket, next) {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (!token) {
    socket.data.authed = false;
    return next();
  }
  try {
    const decoded = jwt.verify(token, appConfig.jwt.secret);
    socket.data.authed = true;
    socket.data.outletId = decoded.outlet_id;
    socket.data.role = decoded.role;
    socket.data.privileged = ['super_admin', 'owner'].includes(decoded.role);
  } catch (_) {
    socket.data.authed = false; // invalid token → treat as anonymous, don't hard-fail
  }
  next();
}

/**
 * Resolves which outlet room a socket may join. Authenticated non-privileged
 * staff are pinned to their token's outlet (ignoring client-supplied IDs, which
 * is how cross-tenant snooping was possible). Privileged and anonymous (public
 * QR) sockets fall back to the requested outlet.
 */
function resolveOutletId(socket, requestedOutletId) {
  if (socket.data.authed && !socket.data.privileged && socket.data.outletId) {
    return socket.data.outletId;
  }
  return requestedOutletId;
}

/**
 * Initializes Socket.io on the HTTP server with CORS and namespace setup.
 * Creates /orders and /kitchen namespaces with room-based routing.
 * @param {import('http').Server} httpServer - Node HTTP server instance
 * @returns {Server} The Socket.io server instance
 */
function initializeSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        const isVercel = origin.includes('.vercel.app');
        const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
        const isWhitelisted = appConfig.corsWhitelist.includes(origin) || appConfig.corsWhitelist.includes('*');
        callback(null, isVercel || isLocalhost || isWhitelisted);
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],
  });

  // Multi-instance broadcast (no-op without a real Redis). Fire-and-forget so
  // server boot isn't blocked on Redis connect.
  attachRedisAdapter(io);

  /* -- Orders Namespace -- */
  const ordersNs = io.of('/orders');
  ordersNs.use(socketAuth);
  ordersNs.on('connection', (socket) => {
    logger.info(`Orders socket connected: ${socket.id} (authed=${socket.data.authed})`);

    socket.on('join_outlet', (outletId) => {
      const scoped = resolveOutletId(socket, outletId);
      socket.join(`outlet:${scoped}`);
      logger.debug(`Socket ${socket.id} joined outlet:${scoped}`);
    });

    socket.on('leave_outlet', (outletId) => {
      socket.leave(`outlet:${resolveOutletId(socket, outletId)}`);
    });

    socket.on('disconnect', (reason) => {
      logger.debug(`Orders socket disconnected: ${socket.id}, reason: ${reason}`);
    });
  });

  /* -- Kitchen Namespace -- */
  const kitchenNs = io.of('/kitchen');
  kitchenNs.use(socketAuth);
  kitchenNs.on('connection', (socket) => {
    logger.info(`Kitchen socket connected: ${socket.id} (authed=${socket.data.authed})`);

    socket.on('join_outlet', (outletId) => {
      const scoped = resolveOutletId(socket, outletId);
      socket.join(`outlet:${scoped}`);
      logger.debug(`Kitchen socket ${socket.id} joined outlet:${scoped}`);
    });

    socket.on('join_station', (data) => {
      const parsed = typeof data === 'string' ? { outletId: data.split(':')[0], station: data.split(':')[1] } : data;
      const scoped = resolveOutletId(socket, parsed.outletId);
      const station = parsed.station;
      socket.join(`outlet:${scoped}`);
      if (station) {
        socket.join(`station:${scoped}:${station}`);
      }
      logger.debug(`Kitchen socket ${socket.id} joined outlet:${scoped}, station:${station || 'ALL'}`);
    });

    socket.on('kot_item_ready', (data) => {
      // Authenticated staff can only relay for their own outlet; spoofed outletIds ignored.
      const scoped = resolveOutletId(socket, data.outletId);
      ordersNs.to(`outlet:${scoped}`).emit('kot_item_ready', data);
      logger.debug('KOT item ready event relayed', { kotId: data.kotId, itemId: data.itemId });
    });

    socket.on('kot_complete', (data) => {
      const scoped = resolveOutletId(socket, data.outletId);
      ordersNs.to(`outlet:${scoped}`).emit('order_status_change', data);
      logger.debug('KOT complete event relayed', { kotId: data.kotId });
    });

    socket.on('disconnect', (reason) => {
      logger.debug(`Kitchen socket disconnected: ${socket.id}, reason: ${reason}`);
    });
  });

  logger.info('Socket.io initialized with /orders and /kitchen namespaces');
  return io;
}

/**
 * Returns the current Socket.io server instance.
 * @returns {Server|null}
 */
function getIO() {
  return io;
}

module.exports = { initializeSocket, getIO };
