// src/models/lockerModel.js
const db = require('../config/database');

const LockerModel = {
  /**
   * Retorna la cuadrícula completa de casilleros ordenada numéricamente
   */
  async getAll() {
    const [rows] = await db.query('SELECT * FROM lockers ORDER BY locker_number ASC');
    return rows;
  },

  /**
   * Obtiene datos de hardware y producto de un casillero por su ID
   */
  async findById(id, connection = null) {
    const executor = connection || db;
    const [[locker]] = await executor.query('SELECT * FROM lockers WHERE id = ?', [id]);
    return locker || null;
  },

  /**
   * Obtiene datos de un casillero por su número físico (#)
   */
  async findByLockerNumber(lockerNumber, connection = null) {
    const executor = connection || db;
    const [[locker]] = await executor.query('SELECT * FROM lockers WHERE locker_number = ?', [lockerNumber]);
    return locker || null;
  },

  /**
   * Bloquea el registro durante una transacción para evitar condiciones de carrera en el stock
   */
  async findByIdForUpdate(id, connection) {
    const [[locker]] = await connection.query('SELECT * FROM lockers WHERE id = ? FOR UPDATE', [id]);
    return locker || null;
  },

  /**
   * Actualiza el stock disponible de un casillero
   */
  async updateStock(lockerId, newStock, connection = null) {
    const executor = connection || db;
    const [result] = await executor.query(
      'UPDATE lockers SET current_stock = ? WHERE id = ?',
      [newStock, lockerId]
    );
    return result.affectedRows > 0;
  },

  /**
   * Asigna o actualiza el nombre del producto y opcionalmente el precio de un casillero
   */
  async assignProduct(lockerId, productName, price = null, connection = null) {
    const executor = connection || db;
    if (price !== null && !isNaN(price)) {
      const [result] = await executor.query(
        'UPDATE lockers SET product_name = ?, price = ? WHERE id = ?',
        [productName, price, lockerId]
      );
      return result.affectedRows > 0;
    }

    const [result] = await executor.query(
      'UPDATE lockers SET product_name = ? WHERE id = ?',
      [productName, lockerId]
    );
    return result.affectedRows > 0;
  },

  /**
   * Actualiza producto, precio y stock de un casillero de manera atómica
   */
  async updateProductInfo(lockerId, { productName, price, newStock }, connection = null) {
    const executor = connection || db;
    const updates = [];
    const values = [];

    if (productName !== undefined && productName !== null) {
      updates.push('product_name = ?');
      values.push(String(productName).trim());
    }
    if (price !== undefined && price !== null && !isNaN(price)) {
      updates.push('price = ?');
      values.push(parseFloat(price));
    }
    if (newStock !== undefined && newStock !== null && !isNaN(newStock)) {
      updates.push('current_stock = ?');
      values.push(parseInt(newStock, 10));
    }

    if (updates.length === 0) return true;

    values.push(lockerId);
    const [result] = await executor.query(
      `UPDATE lockers SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    return result.affectedRows > 0;
  },

  /**
   * Actualiza la telemetría reportada por el ESP32 (abierta / cerrada)
   */
  async updateDoorStatus(boxNumber, status) {
    await db.query(
      'UPDATE lockers SET status = ? WHERE locker_number = ?',
      [status === 'abierta' ? 'maintenance' : 'available', boxNumber]
    );
  },

  /**
   * Modifica las dimensiones en la interfaz visual (S, M, L, XL)
   */
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
