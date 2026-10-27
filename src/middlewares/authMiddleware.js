// src/middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');
const { error } = require('../utils/responseHelper');

/**
 * Middleware para validar tokens JWT en peticiones protegidas
 */
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return error(res, 'Token de autenticación no proporcionado', 401);
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'edcam_secret_key_default');
    req.user = decoded;
    next();
  } catch (err) {
    return error(res, 'Token inválido o expirado', 401);
  }
}

module.exports = {
  verifyToken
};
