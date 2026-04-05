/**
 * @fileoverview Socket.io server initialization and namespace setup.
 * Configures order and kitchen namespaces for real-time communication.
 * @module socket/index
 */

const { Server } = require('socket.io');
const appConfig = require('../config/app');
const logger = require('../config/logger');

/** @type {Server|null} */
let io = null;

/**
 * Initializes Socket.io on the HTTP server with CORS and namespace setup.
 * Creates /orders and /kitchen namespaces with room-based routing.
 * @param {import('http').Server} httpServer - Node HTTP server instance
 * @returns {Server} The Socket.io server instance
 */
function initializeSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: appConfig.corsWhitelist,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],
  });

  /* -- Orders Namespace -- */
  const ordersNs = io.of('/orders');
  ordersNs.on('connection', (socket) => {
    logger.info(`Orders socket connected: ${socket.id}`);

    socket.on('join_outlet', (outletId) => {
      socket.join(`outlet:${outletId}`);
      logger.debug(`Socket ${socket.id} joined outlet:${outletId}`);
    });

    socket.on('leave_outlet', (outletId) => {
      socket.leave(`outlet:${outletId}`);
    });

    socket.on('disconnect', (reason) => {
      logger.debug(`Orders socket disconnected: ${socket.id}, reason: ${reason}`);
    });
  });

  /* -- Kitchen Namespace -- */
  const kitchenNs = io.of('/kitchen');
  kitchenNs.on('connection', (socket) => {
    logger.info(`Kitchen socket connected: ${socket.id}`);

    socket.on('join_outlet', (outletId) => {
      socket.join(`outlet:${outletId}`);
      logger.debug(`Kitchen socket ${socket.id} joined outlet:${outletId}`);
    });
    
    socket.on('join_station', (data) => {
      const { outletId, station } = typeof data === 'string' ? { outletId: data.split(':')[0], station: data.split(':')[1] } : data;
      socket.join(`outlet:${outletId}`);
      if (station) {
        socket.join(`station:${outletId}:${station}`);
      }
      logger.debug(`Kitchen socket ${socket.id} joined outlet:${outletId}, station:${station || 'ALL'}`);
    });

    socket.on('kot_item_ready', (data) => {
      ordersNs.to(`outlet:${data.outletId}`).emit('kot_item_ready', data);
      logger.debug('KOT item ready event relayed', { kotId: data.kotId, itemId: data.itemId });
    });

    socket.on('kot_complete', (data) => {
      ordersNs.to(`outlet:${data.outletId}`).emit('order_status_change', data);
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
