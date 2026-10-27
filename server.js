// server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const os = require('os');

const apiRoutes = require('./src/routes');
const esp32Bridge = require('./src/services/esp32Bridge');
const notFoundHandler = require('./src/middlewares/notFoundHandler');
const errorHandler = require('./src/middlewares/errorHandler');

const app = express();
const server = http.createServer(app);

// Middlewares globales
app.use(cors());
app.use(express.json());

// Servir la interfaz web del kiosco táctil
app.use(express.static(path.join(__dirname, 'public')));

// Servir estáticamente las grabaciones de video de seguridad (.mp4)
app.use('/recordings', express.static(path.join(__dirname, 'storage/recordings')));

// Logger de peticiones entrantes
app.use((req, res, next) => {
  console.log(`[HTTP INCOMING] ${req.method} ${req.url}`);
  next();
});

// Enrutador de APIs
app.use('/api', apiRoutes);

// Diagnóstico de salud y estado del ESP32
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    esp32Connected: esp32Bridge.isConnected(),
    esp32CamConnected: esp32Bridge.isCamConnected(),
    timestamp: new Date()
  });
});

// Manejo de rutas inexistentes y errores globales
app.use(notFoundHandler);
app.use(errorHandler);

// Inicialización del WebSocket Server montado sobre el servidor HTTP
esp32Bridge.init(server);

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
  console.log(`=========================================`);
  console.log(` Servidor activo en http://localhost:${PORT}`);
  console.log(` Red Local / Kiosco en http://${localIp}:${PORT}`);
  console.log(` WebSocket listo en ws://${localIp}:${PORT}`);
  console.log(`=========================================`);
});
