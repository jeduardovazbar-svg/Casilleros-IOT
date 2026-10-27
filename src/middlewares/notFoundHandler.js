// src/middlewares/notFoundHandler.js
const { error } = require('../utils/responseHelper');

/**
 * Middleware para capturar y responder adecuadamente a rutas no registradas
 */
function notFoundHandler(req, res, next) {
  if (req.originalUrl.startsWith('/api')) {
    return error(res, `Ruta API no encontrada: ${req.method} ${req.originalUrl}`, 404);
  }
  next();
}

module.exports = notFoundHandler;
