// src/services/esp32Bridge.js
const WebSocket = require('ws');
const LockerModel = require('../models/lockerModel');
const VideoRecorder = require('./videoRecorder');

let esp32Socket = null;
let esp32CamSocket = null; 
let currentOpenBox = null;

const Esp32Bridge = {
  init(server) {
    const wss = new WebSocket.Server({ server });

    wss.on('connection', (ws, req) => {
      console.log(`[WS] Cliente conectado al puente desde ${req.socket.remoteAddress}`);

      ws.on('message', async (message, isBinary) => {
        // --- 1. RECEPTOR Y RETRANSMISOR DE VIDEO BINARIO ---
        if (isBinary) {
          // Si hay una grabación activa, inyectamos el fotograma JPEG al proceso FFmpeg
          if (currentOpenBox && VideoRecorder.isRecording(currentOpenBox)) {
            VideoRecorder.addFrame(currentOpenBox, message);
          }

          // Retransmitir a clientes web (excluyendo a las placas ESP32)
          wss.clients.forEach(client => {
            if (client !== esp32Socket && client !== esp32CamSocket && client.readyState === WebSocket.OPEN) {
              client.send(message, { binary: true });
            }
          });
          return;
        }

        // --- 2. RECEPTOR DE DATOS JSON NORMALES ---
        try {
          const data = JSON.parse(message);

          // A. Identificación y registro de dispositivos
          if (data.type === 'IDENTIFY') {
            if (data.device === 'ESP32_MAIN') {
              esp32Socket = ws;
              console.log('>>> ESP32 MAIN autenticado y listo en el bus Modbus <<<');
            } else if (data.device === 'ESP32_CAM') {
              esp32CamSocket = ws;
              console.log('>>> ESP32-CAM autenticada y lista para transmitir <<<');
            }
            return;
          }

          // B. Reporte de telemetría de sensores magnéticos y control de cámara
          if (data.type === 'DOOR_STATUS_UPDATE') {
            const { box, status } = data;
            let videoData = null; // 👈 Declarada al inicio para evitar ReferenceError
            
            // Actualizar estado en la base de datos
            if (LockerModel && typeof LockerModel.updateDoorStatus === 'function') {
              await LockerModel.updateDoorStatus(box, status);
            }
            console.log(`[Telemetría] Casillero ${box}: sensor marca ${status}`);

            // C. Control del grabador y órdenes a la ESP32-CAM
            if (status === 'abierta') {
              currentOpenBox = box;
              VideoRecorder.start(box); // Inicia grabación FFmpeg

              if (esp32CamSocket && esp32CamSocket.readyState === WebSocket.OPEN) {
                console.log(`[CÁMARA] Ordenando START_CAMERA para casillero ${box}`);
                esp32CamSocket.send(JSON.stringify({ command: 'START_CAMERA', box: box }));
              }
            } 
            else if (status === 'cerrada') {
              videoData = VideoRecorder.stop(box); // Finaliza archivo .mp4
              currentOpenBox = null;

              if (esp32CamSocket && esp32CamSocket.readyState === WebSocket.OPEN) {
                console.log(`[CÁMARA] Ordenando STOP_CAMERA para casillero ${box}`);
                esp32CamSocket.send(JSON.stringify({ command: 'STOP_CAMERA', box: box }));
              }

              if (videoData) {
                console.log(`[AUDITORÍA] Video listo para vincular: ${videoData.filename}`);
                // Si tienes modelo de movimientos para guardar la ruta del video:
                // await MovementModel.attachVideo(box, videoData.url);
              }
            }
            else if (status === 'alerta_abierta') {
              console.warn(`[ALERTA] Casillero ${box} superó el tiempo límite abierto. Cámara continúa grabando.`);
            }

            // D. Reenviar telemetría a los frontends web conectados
            wss.clients.forEach(client => {
              if (client !== esp32Socket && client !== esp32CamSocket && client.readyState === WebSocket.OPEN) {
                client.send(message);
              }
            });
          }
        } catch (err) {
          console.error('[WS Error] Error procesando payload JSON:', err.message);
        }
      });

      ws.on('close', () => {
        if (ws === esp32Socket) {
          esp32Socket = null;
          console.warn('[WS] ESP32 MAIN desconectado del bus');
        }
        if (ws === esp32CamSocket) {
          esp32CamSocket = null;
          console.warn('[WS] ESP32-CAM desconectada del bus');
        }
      });

      ws.on('error', (err) => {
        console.error('[WS Socket Error]:', err.message);
      });
    });

    console.log('[WS] Servicio esp32Bridge inicializado (Soporte Multi-dispositivo y Streaming)');
  },

  isConnected() {
    return esp32Socket !== null && esp32Socket.readyState === WebSocket.OPEN;
  },

  isCamConnected() {
    return esp32CamSocket !== null && esp32CamSocket.readyState === WebSocket.OPEN;
  },

  triggerLock(boxId, boardId, channelId, pulseMs = 1000) {
    if (!this.isConnected()) {
      console.warn('[AVISO] ESP32 MAIN no conectado vía WebSocket.');
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