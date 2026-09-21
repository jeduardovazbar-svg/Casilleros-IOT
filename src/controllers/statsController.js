// src/controllers/statsController.js
const StatsModel = require('../models/statsModel');
const UserModel = require('../models/userModel');
const { success, error } = require('../utils/responseHelper');

const StatsController = {
  async getDashboardStats(req, res) {
    try {
      const { user_id } = req.query;
      const user = await UserModel.findById(user_id);

      if (!user || user.role !== 'admin') {
        return error(res, 'Acceso denegado: solo Admin puede ver analíticas', 403);
      }

      const [products, userActivity] = await Promise.all([
        StatsModel.getTopProducts(),
        StatsModel.getUserActivity()
      ]);

      return success(res, { products, userActivity });
    } catch (err) {
      return error(res, 'Error al calcular estadísticas', 500, err.message);
    }
  }
};

module.exports = StatsController;