// src/middlewares/errorHandler.js
const { error } = require('../utils/responseHelper');

/**
 * Middleware de manejo de errores no controlados a nivel de aplicación
 */
function errorHandler(err, req, res, next) {
  console.error('[SERVER ERROR]:', err);

  const statusCode = err.status || err.statusCode || 500;
  const message = err.message || 'Error interno del servidor';

  return error(res, message, statusCode, process.env.NODE_ENV === 'development' ? err.stack : undefined);
}

module.exports = errorHandler;
