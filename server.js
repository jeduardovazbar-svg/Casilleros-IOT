// server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const os = require('os');

const apiRoutes = require('./src/routes');
const esp32Bridge = require('./src/services/esp32Bridge');
const schedulerService = require('./src/services/schedulerService');
const notFoundHandler = require('./src/middlewares/notFoundHandler');
const errorHandler = require('./src/middlewares/errorHandler');
const logger = require('./src/core/logger');

const app = express();
const server = http.createServer(app);

// Configuración de Seguridad Ligera (Permite streams MJPEG y recursos de UI)
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// Middlewares globales de alto rendimiento
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Servir la interfaz web del kiosco táctil con optimización de caché
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : '0',
  etag: true,
  setHeaders: (res, filePath) => {
    // Evitar caché persistente en index.html para cambios inmediatos en el kiosco
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  }
}));

// Servir estáticamente las grabaciones de video de seguridad (.mp4)
app.use('/recordings', express.static(path.join(__dirname, 'storage/recordings'), {
  etag: true,
  maxAge: '7d'
}));

// Logger de peticiones HTTP en depuración
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    logger.debug('HTTP', `${req.method} ${req.url}`);
    next();
  });
}

// Enrutador de APIs modular
app.use('/api', apiRoutes);

// Diagnóstico de salud y telemetría de hardware
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    esp32Connected: esp32Bridge.isConnected(),
    esp32CamConnected: esp32Bridge.isCamConnected(),
    uptimeSeconds: Math.floor(process.uptime()),
    memoryUsageMB: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2),
    timestamp: new Date().toISOString()
  });
});

// Manejo de rutas inexistentes y errores globales
app.use(notFoundHandler);
app.use(errorHandler);

// Inicialización del puente WebSocket
esp32Bridge.init(server);

// Inicialización del programador de reportes periódicos por correo
schedulerService.init();

// Función auxiliar para obtener la IP de red local
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIpAddress();
  logger.info('SERVER', `Servidor activo en http://localhost:${PORT}`);
  logger.info('SERVER', `Red Local / Kiosco en http://${localIp}:${PORT}`);
  logger.info('SERVER', `WebSocket listo en ws://${localIp}:${PORT}`);
});

// Apagado elegante del sistema (Graceful Shutdown)
function gracefulShutdown(signal) {
  logger.warn('SERVER', `Señal ${signal} recibida. Cerrando conexiones de forma ordenada...`);
  server.close(() => {
    logger.info('SERVER', 'Servidor HTTP y WebSockets cerrados.');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('SERVER', 'Cierre forzado por tiempo de espera excedido (Timeout).');
    process.exit(1);
  }, 5000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
