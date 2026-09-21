// src/controllers/authController.js
const bcrypt = require('bcrypt');
const UserModel = require('../models/userModel');
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
        allowed_qty: matchedUser.allowed_qty
      }, 'Sesión validada');
    } catch (err) {
      return error(res, 'Error al autenticar usuario', 500, err.message);
    }
  },

  // Creación jerárquica de cuentas
  async createUser(req, res) {
    try {
      const { creator_id, username, pin, role, assigned_locker_id, allowed_qty } = req.body;

      if (!creator_id || !username || !pin || !role) {
        return error(res, 'Faltan campos obligatorios para registrar usuario', 400);
      }

      const creator = await UserModel.findById(creator_id);
      if (!creator) return error(res, 'Usuario creador no encontrado', 401);

      // Jerarquía: Operador solo crea Empleados
      if (creator.role === 'operador' && role !== 'empleado') {
        return error(res, 'Los operadores únicamente tienen permiso para registrar empleados', 403);
      }

      // Jerarquía: Empleado no puede crear cuentas
      if (creator.role === 'empleado') {
        return error(res, 'Sin privilegios para registrar usuarios', 403);
      }

      const pinHash = await bcrypt.hash(String(pin), 10);
      const newUserId = await UserModel.create({
        username,
        pinHash,
        role,
        createdBy: creator_id,
        assignedLockerId: assigned_locker_id || null,
        allowedQty: allowed_qty || 0
      });

      return success(res, { id: newUserId, username, role }, 'Usuario creado correctamente', 201);
    } catch (err) {
      return error(res, 'Error al registrar el usuario', 500, err.message);
    }
  }
};

module.exports = AuthController;