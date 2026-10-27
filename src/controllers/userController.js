// src/controllers/userController.js
const UserModel = require('../models/userModel');
const { success, error } = require('../utils/responseHelper');
const bcrypt = require('bcrypt');

const UserController = {
  /**
   * GET /api/users
   * Lista todos los usuarios (sin hashes) para administración
   */
  async getAllUsers(req, res) {
    try {
      const users = await UserModel.getAll();
      return success(res, users, 'Usuarios recuperados correctamente');
    } catch (err) {
      console.error('Error al listar usuarios:', err);
      return error(res, 'Error al consultar usuarios', 500, err.message);
    }
  },

  /**
   * POST /api/users (y usado por /api/auth/register)
   * Creación validada y jerárquica de cuentas
   */
  async createUser(req, res) {
    try {
      const { 
        admin_id,
        creator_id,
        username, 
        pin, 
        role, 
        assigned_locker_id, 
        allowed_qty,
        email, 
        phone 
      } = req.body;

      const effectiveCreatorId = admin_id || creator_id;
      const cleanUsername = String(username || '').trim();
      const cleanPin = String(pin || '').trim();
      const cleanRole = String(role || '').trim().toLowerCase();

      // 1. Validaciones básicas de campos obligatorios
      if (!effectiveCreatorId || !cleanUsername || !cleanPin || !cleanRole) {
        return error(res, 'Faltan campos requeridos (creador, nombre, PIN o rol)', 400);
      }

      // 2. Validación de PIN (4 dígitos numéricos)
      if (cleanPin.length !== 4 || !/^\d{4}$/.test(cleanPin)) {
        return error(res, 'El PIN debe ser exactamente de 4 dígitos numéricos', 400);
      }

      // 3. Validación de rol válido
      const validRoles = ['admin', 'operador', 'empleado'];
      if (!validRoles.includes(cleanRole)) {
        return error(res, 'Rol inválido. Opciones permitidas: admin, operador, empleado', 400);
      }

      // 4. Validar permisos jerárquicos del creador
      const creator = await UserModel.findById(effectiveCreatorId);
      if (!creator || !creator.is_active) {
        return error(res, 'Usuario creador no encontrado o inactivo', 401);
      }

      // Empleado no puede crear usuarios
      if (creator.role === 'empleado') {
        return error(res, 'Sin privilegios para registrar usuarios', 403);
      }

      // Operador únicamente puede registrar empleados
      if (creator.role === 'operador' && cleanRole !== 'empleado') {
        return error(res, 'Los operadores únicamente tienen permiso para registrar empleados', 403);
      }

      // 5. Validar que el nombre de usuario no esté repetido
      const existingUser = await UserModel.findByUsername(cleanUsername);
      if (existingUser) {
        return error(res, 'El nombre de usuario ya está registrado', 409);
      }

      // 6. Validar que el PIN no pertenezca a otro usuario activo
      const activeUsers = await UserModel.getAllActive();
      for (const u of activeUsers) {
        if (await bcrypt.compare(cleanPin, u.pin_hash)) {
          return error(res, 'El PIN ya está en uso por otro usuario. Elige uno diferente.', 409);
        }
      }

      // 7. Cifrar el PIN con 10 rondas de salteo
      const hashedPin = await bcrypt.hash(cleanPin, 10);

      // 8. Crear en la base de datos a través del modelo
      const newUserId = await UserModel.create({
        username: cleanUsername,
        pinHash: hashedPin,
        role: cleanRole,
        createdBy: effectiveCreatorId,
        assignedLockerId: cleanRole === 'empleado' ? (parseInt(assigned_locker_id, 10) || null) : null,
        allowedQty: cleanRole === 'empleado' ? (parseInt(allowed_qty, 10) || 1) : 0,
        email: email ? String(email).trim() : null,
        phone: phone ? String(phone).trim() : null,
        isActive: 1
      });

      return success(res, {
        id: newUserId,
        username: cleanUsername,
        role: cleanRole
      }, 'Usuario creado exitosamente', 201);

    } catch (err) {
      console.error('Error al registrar usuario:', err);
      return error(res, 'Error interno al registrar usuario', 500, err.message);
    }
  },

  /**
   * DELETE /api/users/:id
   * Desactivación lógica de un usuario (soft-delete)
   */
  async deactivateUser(req, res) {
    try {
      const { id } = req.params;
      const { admin_id, user_id } = req.body;
      const requesterId = admin_id || user_id;

      const admin = await UserModel.findById(requesterId);
      if (!admin || admin.role !== 'admin') {
        return error(res, 'Acceso denegado: solo el Administrador puede desactivar usuarios', 403);
      }

      const ok = await UserModel.deactivate(id);
      if (!ok) return error(res, 'Usuario no encontrado o ya inactivo', 404);

      return success(res, null, 'Usuario desactivado correctamente');
    } catch (err) {
      return error(res, 'Error al desactivar usuario', 500, err.message);
    }
  }
};

module.exports = UserController;
