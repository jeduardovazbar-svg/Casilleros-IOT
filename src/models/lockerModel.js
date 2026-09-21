// src/models/lockerModel.js
const db = require('../config/database');

const LockerModel = {
  // Retorna la cuadrícula completa de casilleros ordenada numéricamente
  async getAll() {
    const [rows] = await db.query('SELECT * FROM lockers ORDER BY locker_number ASC');
    return rows;
  },

  // Obtiene datos de hardware y producto de un casillero por su ID
  async findById(id, connection = null) {
    const executor = connection || db;
    const [[locker]] = await executor.query('SELECT * FROM lockers WHERE id = ?', [id]);
    return locker || null;
  },

  // Bloquea el registro durante una transacción para evitar condiciones de carrera en el stock
  async findByIdForUpdate(id, connection) {
    const [[locker]] = await connection.query('SELECT * FROM lockers WHERE id = ? FOR UPDATE', [id]);
    return locker || null;
  },

  // Actualiza la telemetría reportada por el ESP32 (abierta / cerrada)
  async updateDoorStatus(boxNumber, status) {
    await db.query(
      'UPDATE lockers SET status = ? WHERE locker_number = ?',
      [status === 'abierta' ? 'maintenance' : 'available', boxNumber]
    );
  },

  // Modifica las dimensiones en la interfaz visual (S, M, L, XL)
  async updateDimensions(id, sizeType, colSpan, rowSpan) {
    const [result] = await db.query(
      `UPDATE lockers 
       SET size_type = ?, grid_col_span = ?, grid_row_span = ? 
       WHERE id = ?`,
      [sizeType, colSpan, rowSpan, id]
    );
    return result.affectedRows > 0;
  }
};

module.exports = LockerModel;