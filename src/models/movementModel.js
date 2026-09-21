// src/models/movementModel.js
const db = require('../config/database');

const MovementModel = {
  // Inserta un registro transaccional en la bitácora
  async log({ lockerId, userId, actionType, quantityChanged, stockBefore, stockAfter, notes = null }, connection = null) {
    const executor = connection || db;
    const [result] = await executor.query(
      `INSERT INTO inventory_logs 
       (locker_id, user_id, action_type, quantity_changed, stock_before, stock_after, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [lockerId, userId, actionType, quantityChanged, stockBefore, stockAfter, notes]
    );
    return result.insertId;
  },

  // Consulta los últimos movimientos para auditoría del Administrador
  async getDailyLogs(limit = 100) {
    const [rows] = await db.query(
      `SELECT l.id, l.created_at, l.action_type, l.quantity_changed, 
              l.stock_before, l.stock_after, l.notes,
              u.username, u.role,
              k.locker_number, k.product_name
       FROM inventory_logs l
       JOIN users u ON l.user_id = u.id
       JOIN lockers k ON l.locker_id = k.id
       ORDER BY l.created_at DESC
       LIMIT ?`,
      [limit]
    );
    return rows;
  }
};

module.exports = MovementModel;