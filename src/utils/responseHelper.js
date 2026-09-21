// src/utils/responseHelper.js
const responseHelper = {
  success(res, data = null, message = 'Operación exitosa', status = 200) {
    return res.status(status).json({
      ok: true,
      message,
      data
    });
  },

  error(res, message = 'Error en la operación', status = 400, details = null) {
    return res.status(status).json({
      ok: false,
      error: message,
      ...(details && { details })
    });
  }
};

module.exports = responseHelper;