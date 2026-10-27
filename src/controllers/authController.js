// src/controllers/authController.js
const bcrypt = require('bcrypt');
const UserModel = require('../models/userModel');
const UserController = require('./userController');
const { success, error } = require('../utils/responseHelper');

const AuthController = {
  // Login en el kiosco por PIN
  async loginPin(req, res) {
    try {
      const { pin } = req.body;
      if (!pin) return error(res, 'El PIN es obligatorio', 400);

      const activeUsers = await UserModel.getAllActive();
      let matchedUser = null;

      for (const u of activeUsers) {
        if (await bcrypt.compare(String(pin), u.pin_hash)) {
          matchedUser = u;
          break;
        }
      }

      if (!matchedUser) {
        return error(res, 'PIN incorrecto o cuenta deshabilitada', 401);
      }

      return success(res, {
        id: matchedUser.id,
        username: matchedUser.username,
        role: matchedUser.role,
        assigned_locker_id: matchedUser.assigned_locker_id,
        allowed_qty: matchedUser.allowed_qty,
        email: matchedUser.email,
        phone: matchedUser.phone
      }, 'Sesión validada');
    } catch (err) {
      return error(res, 'Error al autenticar usuario', 500, err.message);
    }
  },

  // Creación jerárquica de cuentas (delega a UserController para validación completa)
  async createUser(req, res) {
    return UserController.createUser(req, res);
  }
};

module.exports = AuthController;
