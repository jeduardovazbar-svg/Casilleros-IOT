// src/models/movementModel.js
const db = require('../config/database');

const MovementModel = {
  /**
   * Inserta un registro transaccional en la bitácora de movimientos (inventory_logs)
   */
  async log({ lockerId, userId, actionType, quantityChanged, stockBefore, stockAfter, notes = null }, connection = null) {
    const executor = connection || db;
    const [result] = await executor.query(
      `INSERT INTO inventory_logs 
       (locker_id, user_id, action_type, quantity_changed, stock_before, stock_after, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        lockerId,
        userId,
        actionType,
        quantityChanged,
        stockBefore,
        stockAfter,
        notes ? String(notes).trim() : null
      ]
    );
    return result.insertId;
  },

  /**
   * Vincula el nombre del archivo de video grabado al último registro de auditoría de este casillero
   */
  async attachVideo(boxNumber, videoFilename) {
    if (!boxNumber || !videoFilename) return false;
    const tag = `[VIDEO:${videoFilename}]`;

    const [result] = await db.query(
      `UPDATE inventory_logs 
       SET notes = CONCAT(IFNULL(notes, ''), ' ', ?) 
       WHERE locker_id = (SELECT id FROM lockers WHERE locker_number = ? LIMIT 1)
       ORDER BY id DESC LIMIT 1`,
      [tag, boxNumber]
    );
    return result.affectedRows > 0;
  },

  /**
   * Consulta los últimos movimientos para auditoría del Administrador
   * @param {number} limit - Límite de registros (default 100)
   */
  async getDailyLogs(limit = 100) {
    const parsedLimit = Math.max(1, Math.min(parseInt(limit, 10) || 100, 500));
    const [rows] = await db.query(
      `SELECT l.id, l.created_at, l.action_type, l.quantity_changed, 
              l.stock_before, l.stock_after, l.notes,
              u.username, u.role,
              k.locker_number, k.product_name, k.price
       FROM inventory_logs l
       JOIN users u ON l.user_id = u.id
       JOIN lockers k ON l.locker_id = k.id
       ORDER BY l.created_at DESC
       LIMIT ?`,
      [parsedLimit]
    );

    // Parsear video_url si existe la etiqueta [VIDEO:archivo.mp4] en notes
    return rows.map(r => {
      let videoUrl = null;
      if (r.notes && r.notes.includes('[VIDEO:')) {
        const match = r.notes.match(/\[VIDEO:([^\]]+)\]/);
        if (match && match[1]) {
          videoUrl = `/recordings/${match[1]}`;
        }
      }
      return {
        ...r,
        video_url: videoUrl
      };
    });
  }
};

module.exports = MovementModel;
