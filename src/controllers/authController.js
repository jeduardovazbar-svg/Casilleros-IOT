// src/controllers/authController.js
const AuthService = require('../services/authService');
const UserController = require('./userController');
const esp32Bridge = require('../services/esp32Bridge');
const { sendSecurityAlertEmail } = require('../services/notificationService');
const { success, error } = require('../utils/responseHelper');
const logger = require('../core/logger');

const AuthController = {
  // Login en el kiosco por PIN
  async loginPin(req, res) {
    try {
      const { pin } = req.body;
      if (!pin) return error(res, 'El PIN es obligatorio', 400);

      const session = await AuthService.authenticatePin(pin);
      if (!session) {
        logger.warn('AUTH', 'Intento de login con PIN fallido o cuenta deshabilitada');
        return error(res, 'PIN incorrecto o cuenta deshabilitada', 401);
      }

      logger.info('AUTH', `Sesión iniciada con éxito para usuario ${session.username} (${session.role})`);
      return success(res, session, 'Sesión validada');
    } catch (err) {
      logger.error('AUTH', 'Error al autenticar usuario', err);
      return error(res, 'Error al autenticar usuario', 500, err.message);
    }
  },

  // Creación jerárquica de cuentas (delega a UserController)
  async createUser(req, res) {
    return UserController.createUser(req, res);
  },

  // Alerta de seguridad: Bloqueo de PIN tras 3 intentos erróneos
  async reportLockout(req, res) {
    try {
      const clientIp = req.ip || req.socket.remoteAddress || 'Local Kiosk';
      const { reason, attempts } = req.body;

      logger.warn('SEGURIDAD', `[INCIDENTE BLOQUEO] Kiosco bloqueado por 3 intentos erróneos desde ${clientIp}`);

      // 1. Activar grabación de video de 5 segundos con la ESP32-CAM
      esp32Bridge.triggerSecurityRecording(5000);

      // 2. Despachar correo de advertencia inmediata al administrador
      sendSecurityAlertEmail({
        ip: clientIp,
        reason: reason || 'Bloqueo temporal por 3 intentos fallidos de PIN',
        attempts: attempts || 3,
        timestamp: new Date()
      }).catch(err => logger.error('SEGURIDAD', `Error enviando alerta de email: ${err.message}`));

      return success(res, { recordingSeconds: 5 }, 'Incidente registrado y video de seguridad iniciado');
    } catch (err) {
      logger.error('SEGURIDAD', 'Error procesando reporte de bloqueo', err);
      return error(res, 'Error al procesar incidente de seguridad', 500, err.message);
    }
  }
};

module.exports = AuthController;
