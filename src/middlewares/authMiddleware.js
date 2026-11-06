// src/middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');
const UserModel = require('../models/userModel');
const { error } = require('../utils/responseHelper');

const JWT_SECRET = process.env.JWT_SECRET || 'edcam_secret_key_default_production_2026';

/**
 * Middleware para validar la identidad del usuario (soporta JWT Bearer Header y fallback transparente de Kiosco)
 */
async function authenticateUser(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (authHeader) {
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      return next();
    } catch (err) {
      return error(res, 'Token inválido o expirado', 401);
    }
  }

  // Fallback seguro para el Kiosco Táctil local por ID de usuario
  const userId = req.body?.user_id || req.body?.admin_id || req.query?.user_id;
  if (userId) {
    try {
      const user = await UserModel.findById(userId);
      if (user && user.is_active) {
        req.user = {
          sub: user.id,
          id: user.id,
          username: user.username,
          role: user.role,
          assigned_locker_id: user.assigned_locker_id,
          allowed_qty: user.allowed_qty,
          email: user.email,
          phone: user.phone
        };
        return next();
      }
    } catch (dbErr) {
      // Continuar al rechazo
    }
  }

  return error(res, 'Autenticación requerida para acceder a este recurso', 401);
}

/**
 * Middleware para restringir acceso según roles (RBAC)
 */
function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return error(res, 'Usuario no autenticado', 401);
    }

    if (!allowedRoles.includes(req.user.role)) {
      return error(res, `Acceso denegado: se requiere uno de los roles [${allowedRoles.join(', ')}]`, 403);
    }

    next();
  };
}

module.exports = {
  verifyToken: authenticateUser,
  authenticateUser,
  requireRole
};
