// src/services/esp32Bridge.js
const WebSocket = require('ws');
const LockerModel = require('../models/lockerModel');

let esp32Socket = null;

const Esp32Bridge = {
  init(server) {
    // Servidor WS estándar sin bloqueo de subprotocolos
    const wss = new WebSocket.Server({ server });

    wss.on('connection', (ws, req) => {
      console.log(`[WS] Cliente conectado al puente desde ${req.socket.remoteAddress}`);

      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message);

          // 1. Identificación y registro del ESP32
          if (data.type === 'IDENTIFY' && data.device === 'ESP32_MAIN') {
            esp32Socket = ws;
            console.log('>>> ESP32 autenticado y listo en el bus Modbus <<<');
            return;
          }

          // 2. Reporte de telemetría de sensores magnéticos
          if (data.type === 'DOOR_STATUS_UPDATE') {
            const { box, status } = data;
            if (LockerModel && typeof LockerModel.updateDoorStatus === 'function') {
              await LockerModel.updateDoorStatus(box, status);
            }
            console.log(`[Telemetría] Casillero ${box}: sensor marca ${status}`);
          }
        } catch (err) {
          console.error('[WS Error] Error procesando payload:', err.message);
        }
      });

      ws.on('close', () => {
        if (ws === esp32Socket) {
          esp32Socket = null;
          console.warn('[WS] ESP32 desconectado del bus');
        }
      });

      ws.on('error', (err) => {
        console.error('[WS Socket Error]:', err.message);
      });
    });

    console.log('[WS] Servicio esp32Bridge inicializado');
  },

  isConnected() {
    return esp32Socket !== null && esp32Socket.readyState === WebSocket.OPEN;
  },

  triggerLock(boxId, boardId, channelId, pulseMs = 1000) {
    if (!this.isConnected()) {
      console.warn('[AVISO] ESP32 no conectado vía WebSocket.');
      return false;
    }

    const payload = JSON.stringify({
      command: 'TRIGGER_LOCK',
      box: boxId,
      board: boardId,
      channel: channelId,
      pulseMs: pulseMs
    });

    esp32Socket.send(payload);
    console.log(`[MODBUS DISPATCH] Casillero: ${boxId} | Placa: ${boardId} | Canal: ${channelId}`);
    return true;
  }
};

module.exports = Esp32Bridge;