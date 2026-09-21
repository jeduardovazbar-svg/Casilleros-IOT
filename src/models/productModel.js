// src/models/productModel.js
const db = require('../config/database');

const ProductModel = {
  async updateStock(lockerId, newStock, connection = null) {
    const executor = connection || db;
    const [result] = await executor.query(
      'UPDATE lockers SET current_stock = ? WHERE id = ?',
      [newStock, lockerId]
    );
    return result.affectedRows > 0;
  },

  async assignProduct(lockerId, productName) {
    const [result] = await db.query(
      'UPDATE lockers SET product_name = ? WHERE id = ?',
      [productName, lockerId]
    );
    return result.affectedRows > 0;
  }
};

module.exports = ProductModel;