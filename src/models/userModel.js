// src/models/userModel.js
const db = require('../config/database');

const UserModel = {
  /**
   * Obtiene todos los usuarios activos para comparar hashes de PIN en el login
   */
  async getAllActive() {
    const [rows] = await db.query('SELECT * FROM users WHERE is_active = 1');
    return rows;
  },

  /**
   * Obtiene todos los usuarios para la gestión de administración (sin hashes)
   */
  async getAll() {
    const [rows] = await db.query(
      `SELECT id, username, email, phone, role, created_by, assigned_locker_id, allowed_qty, is_active, created_at 
       FROM users 
       ORDER BY created_at DESC`
    );
    return rows;
  },

  /**
   * Busca un usuario por su identificador único (ID)
   */
  async findById(id) {
    const [[user]] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
    return user || null;
  },

  /**
   * Busca un usuario por su nombre de usuario
   */
  async findByUsername(username) {
    const [[user]] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    return user || null;
  },

  /**
   * Inserta un nuevo usuario en la base de datos
   */
  async create({ 
    username, 
    pinHash, 
    role, 
    createdBy, 
    assignedLockerId = null, 
    allowedQty = 0, 
    email = null, 
    phone = null,
    isActive = 1
  }) {
    const [result] = await db.query(
      `INSERT INTO users 
       (username, pin_hash, role, created_by, assigned_locker_id, allowed_qty, email, phone, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        username,
        pinHash,
        role,
        createdBy || null,
        assignedLockerId || null,
        allowedQty || 0,
        email || null,
        phone || null,
        isActive
      ]
    );
    return result.insertId;
  },

  /**
   * Desactivación lógica de usuario
   */
  async deactivate(id) {
    const [result] = await db.query('UPDATE users SET is_active = 0 WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }
};

module.exports = UserModel;
