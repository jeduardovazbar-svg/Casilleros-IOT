// src/models/statsModel.js
const db = require('../config/database');

const StatsModel = {
  // 1. Insumos más retirados (Consumo total por producto)
  async getTopProducts() {
    const query = `
      SELECT 
        l.product_name,
        SUM(ABS(m.quantity_changed)) AS total_withdrawn
      FROM inventory_logs m
      JOIN lockers l ON m.locker_id = l.id
      WHERE m.action_type = 'RETIRO' AND m.quantity_changed < 0
      GROUP BY l.product_name
      ORDER BY total_withdrawn DESC
      LIMIT 6;
    `;
    const [rows] = await db.query(query);
    return rows;
  },

  // 2. Actividad y volumen retirado por empleado
  async getUserActivity() {
    const query = `
      SELECT 
        u.username,
        u.role,
        COUNT(m.id) AS total_operations,
        SUM(CASE WHEN m.quantity_changed < 0 THEN ABS(m.quantity_changed) ELSE 0 END) AS total_items
      FROM inventory_logs m
      JOIN users u ON m.user_id = u.id
      WHERE u.role != 'admin'
      GROUP BY u.id, u.username, u.role
      ORDER BY total_items DESC;
    `;
    const [rows] = await db.query(query);
    return rows;
  }
};

module.exports = StatsModel;