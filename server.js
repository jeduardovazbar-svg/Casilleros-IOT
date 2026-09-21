// server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');

const apiRoutes = require('./src/routes');
const esp32Bridge = require('./src/services/esp32Bridge');

const app = express();
const server = http.createServer(app);

// Middlewares globales
app.use(cors());
app.use(express.json());

// Servir la interfaz web del kiosco táctil
app.use(express.static('public'));

// En server.js, justo antes de app.use('/api', apiRoutes);
app.use((req, res, next) => {
  console.log(`[HTTP INCOMING] ${req.method} ${req.url}`);
  next();
});

app.use('/api', apiRoutes);

// Diagnóstico de salud y estado del ESP32
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    esp32Connected: esp32Bridge.isConnected(),
    timestamp: new Date()
  });
});

// Inicialización del WebSocket Server montado sobre el servidor HTTP
esp32Bridge.init(server);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`=========================================`);
  console.log(` Servidor activo en http://localhost:${PORT}`);
  console.log(` WebSocket listo en ws://192.168.100.142:${PORT}`);
  console.log(`=========================================`);
});