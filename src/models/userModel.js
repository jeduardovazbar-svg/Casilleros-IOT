// src/models/userModel.js
const db = require('../config/database');

const UserModel = {
  // Obtiene todos los usuarios activos para comparar hashes en el login
  async getAllActive() {
    const [rows] = await db.query('SELECT * FROM users WHERE is_active = TRUE');
    return rows;
  },

  // Busca un usuario por su identificador único
  async findById(id) {
    const [[user]] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
    return user || null;
  },

  // Inserta un nuevo usuario (Admin u Operador como creador)
  async create({ username, pinHash, role, createdBy, assignedLockerId = null, allowedQty = 0 }) {
    const [result] = await db.query(
      `INSERT INTO users (username, pin_hash, role, created_by, assigned_locker_id, allowed_qty)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [username, pinHash, role, createdBy, assignedLockerId, allowedQty]
    );
    return result.insertId;
  }
};

module.exports = UserModel;