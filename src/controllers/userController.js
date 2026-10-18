// src/controllers/userController.js
const db = require('../config/database');
const UserModel = require('../models/userModel');
const { success, error } = require('../utils/responseHelper');
const bcrypt = require('bcrypt'); // Si tu proyecto usa bcryptjs, pon require('bcryptjs')

const UserController = {
  async createUser(req, res) {
    const { 
      admin_id, 
      username, 
      pin, 
      role, 
      assigned_locker_id, 
      allowed_qty,
      email, 
      phone 
    } = req.body;

    const cleanPin = String(pin || '').trim();

    // 1. Validaciones básicas de formato
    if (!admin_id || !username || !cleanPin || !role) {
      return error(res, 'Faltan campos requeridos (nombre, PIN o rol)', 400);
    }

    if (cleanPin.length !== 4 || isNaN(cleanPin)) {
      return error(res, 'El PIN debe ser exactamente de 4 dígitos numéricos', 400);
    }

    try {
      // 2. Validar que quien crea el usuario sea Administrador
      const admin = await UserModel.findById(admin_id);
      if (!admin || admin.role !== 'admin') {
        return error(res, 'Acceso denegado: solo el administrador puede registrar cuentas', 403);
      }

      // 3. Validar que el nombre de usuario no esté repetido
      const [existingUser] = await db.query('SELECT id FROM users WHERE username = ?', [username.trim()]);
      if (existingUser.length > 0) {
        return error(res, 'El nombre de usuario ya está registrado', 409);
      }

      // 4. Validar que el PIN no pertenezca a otro usuario
      // Al estar cifrados con salt en MySQL, comparamos contra los usuarios activos
      const [users] = await db.query('SELECT id, pin_hash FROM users WHERE is_active = 1');
      for (const u of users) {
        const isMatch = await bcrypt.compare(cleanPin, u.pin_hash);
        if (isMatch) {
          return error(res, 'El PIN ya está en uso por otro operador. Elige uno diferente.', 409);
        }
      }

      // 5. Cifrar el nuevo PIN con 10 rondas de salteo
      const hashedPin = await bcrypt.hash(cleanPin, 10);

      // 6. Insertar en la columna correcta: pin_hash
      const [result] = await db.query(
        `INSERT INTO users (username, pin_hash, role, assigned_locker_id, allowed_qty, email, phone, created_by, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          username.trim(),
          hashedPin,
          role,
          role === 'empleado' ? (assigned_locker_id || null) : null,
          role === 'empleado' ? (allowed_qty || 1) : 0,
          email ? email.trim() : null,
          phone ? phone.trim() : null,
          admin_id
        ]
      );

      return success(res, {
        id: result.insertId,
        username,
        role
      }, 'Usuario creado exitosamente', 201);

    } catch (err) {
      console.error('Error al registrar usuario:', err);
      return error(res, 'Error interno al registrar usuario', 500, err.message);
    }
  }
};

module.exports = UserController;