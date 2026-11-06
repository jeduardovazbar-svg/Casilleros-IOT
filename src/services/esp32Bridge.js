// src/services/esp32Bridge.js
const WebSocket = require('ws');
const LockerModel = require('../models/lockerModel');
const MovementModel = require('../models/movementModel');
const VideoRecorder = require('./videoRecorder');
const logger = require('../core/logger');

const IOT_DEVICE_TOKEN = process.env.IOT_DEVICE_TOKEN || null;
const MAX_WS_BUFFER_BYTES = 64 * 1024; // 64 KB límite de contrapresión

let esp32Socket = null;
let esp32CamSocket = null;
const openBoxes = new Set();

const Esp32Bridge = {
  init(server) {
    const wss = new WebSocket.Server({ server });

    // Monitor Heartbeat RFC 6455 para evitar sockets zombie (cada 15s)
    const heartbeatInterval = setInterval(() => {
      wss.clients.forEach((ws) => {
        if (!ws.isAlive) {
          logger.warn('WS', 'Cliente no respondió al ping. Cerrando socket zombi.');
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 15000);

    wss.on('close', () => clearInterval(heartbeatInterval));

    wss.on('connection', (ws, req) => {
      ws.isAlive = true;
      ws.deviceType = 'CLIENT_BROWSER';
      const clientIp = req.socket.remoteAddress;

      logger.debug('WS', `Cliente conectado desde ${clientIp}`);

      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.on('message', async (message, isBinary) => {
        // --- 1. RECEPTOR Y RETRANSMISOR DE VIDEO BINARIO ---
        if (isBinary) {
          // Alimentar procesos FFmpeg para todos los casilleros o sesiones de seguridad abiertas
          if (openBoxes.size > 0) {
            for (const boxId of openBoxes) {
              if (VideoRecorder.isRecording(boxId)) {
                VideoRecorder.addFrame(boxId, message);
              }
            }
          }

          // Retransmitir a clientes web aplicando control de contrapresión (Drop-Frame)
          wss.clients.forEach((client) => {
            if (
              client !== esp32Socket &&
              client !== esp32CamSocket &&
              client.readyState === WebSocket.OPEN
            ) {
              if (client.bufferedAmount < MAX_WS_BUFFER_BYTES) {
                client.send(message, { binary: true });
              }
            }
          });
          return;
        }

        // --- 2. RECEPTOR DE MENSAJES JSON ---
        try {
          const data = JSON.parse(message.toString());

          // A. Identificación y registro de dispositivos
          if (data.type === 'IDENTIFY') {
            if (IOT_DEVICE_TOKEN && data.token && data.token !== IOT_DEVICE_TOKEN) {
              logger.warn('WS', `Rechazada identificación no autorizada para ${data.device} desde ${clientIp}`);
              ws.close(4401, 'Unauthorized Device');
              return;
            }

            if (data.device === 'ESP32_MAIN') {
              if (esp32Socket && esp32Socket !== ws) {
                logger.info('WS', 'Cerrando socket anterior de ESP32_MAIN por reconexión');
                esp32Socket.terminate();
              }
              esp32Socket = ws;
              ws.deviceType = 'ESP32_MAIN';
              logger.info('WS', '>>> ESP32 MAIN autenticado y listo en el bus Modbus <<<');
            } else if (data.device === 'ESP32_CAM') {
              if (esp32CamSocket && esp32CamSocket !== ws) {
                logger.info('WS', 'Cerrando socket anterior de ESP32_CAM por reconexión');
                esp32CamSocket.terminate();
              }
              esp32CamSocket = ws;
              ws.deviceType = 'ESP32_CAM';
              logger.info('WS', '>>> ESP32-CAM autenticada y lista para transmitir <<<');
            }
            return;
          }

          // B. Reporte de telemetría de sensores magnéticos y control de cámara
          if (data.type === 'DOOR_STATUS_UPDATE') {
            const { box, status } = data;
            const boxId = Number(box);

            logger.info('TELEMETRIA', `Casillero ${boxId}: sensor marca ${status}`);

            if (LockerModel && typeof LockerModel.updateDoorStatus === 'function') {
              await LockerModel.updateDoorStatus(boxId, status);
            }

            // C. Control del grabador y órdenes a la ESP32-CAM
            if (status === 'abierta') {
              openBoxes.add(boxId);
              VideoRecorder.start(boxId);

              if (esp32CamSocket && esp32CamSocket.readyState === WebSocket.OPEN) {
                logger.info('CAMARA', `Ordenando START_CAMERA para casillero ${boxId}`);
                esp32CamSocket.send(JSON.stringify({ command: 'START_CAMERA', box: boxId }));
              }
            } else if (status === 'cerrada') {
              openBoxes.delete(boxId);

              const videoData = await VideoRecorder.stop(boxId);

              if (openBoxes.size === 0 && esp32CamSocket && esp32CamSocket.readyState === WebSocket.OPEN) {
                logger.info('CAMARA', `Ordenando STOP_CAMERA (ningún casillero abierto)`);
                esp32CamSocket.send(JSON.stringify({ command: 'STOP_CAMERA', box: boxId }));
              }

              if (videoData && videoData.filename) {
                logger.info('AUDITORIA', `Video listo para vincular: ${videoData.filename}`);
                try {
                  await MovementModel.attachVideo(boxId, videoData.filename);
                } catch (vErr) {
                  logger.warn('AUDITORIA', `No se pudo adjuntar video al log: ${vErr.message}`);
                }
              }
            } else if (status === 'alerta_abierta') {
              logger.warn('ALERTA', `Casillero ${boxId} superó el tiempo límite abierto. Cámara continúa grabando.`);
            }

            // D. Reenviar telemetría a los frontends web conectados
            const payloadStr = JSON.stringify(data);
            wss.clients.forEach((client) => {
              if (
                client !== esp32Socket &&
                client !== esp32CamSocket &&
                client.readyState === WebSocket.OPEN
              ) {
                client.send(payloadStr);
              }
            });
          }
        } catch (err) {
          logger.error('WS', `Error procesando payload JSON: ${err.message}`);
        }
      });

      ws.on('close', () => {
        if (ws === esp32Socket) {
          esp32Socket = null;
          logger.warn('WS', 'ESP32 MAIN desconectado del bus');
        }
        if (ws === esp32CamSocket) {
          esp32CamSocket = null;
          logger.warn('WS', 'ESP32-CAM desconectada del bus');
        }
      });

      ws.on('error', (err) => {
        logger.error('WS', `Error en socket: ${err.message}`);
      });
    });

    logger.info('WS', 'Servicio esp32Bridge inicializado (Heartbeat, Multi-dispositivo y Drop-frame)');
  },

  isConnected() {
    return esp32Socket !== null && esp32Socket.readyState === WebSocket.OPEN;
  },

  isCamConnected() {
    return esp32CamSocket !== null && esp32CamSocket.readyState === WebSocket.OPEN;
  },

  triggerLock(boxId, boardId, channelId, pulseMs = 1000) {
    if (!this.isConnected()) {
      logger.warn('MODBUS', `AVISO: ESP32 MAIN no conectado vía WebSocket. Casillero #${boxId}`);
      return false;
    }

    const payload = JSON.stringify({
      command: 'TRIGGER_LOCK',
      box: Number(boxId),
      board: Number(boardId),
      channel: Number(channelId),
      pulseMs: Number(pulseMs)
    });

    esp32Socket.send(payload);
    logger.info('MODBUS', `DISPATCH -> Casillero: ${boxId} | Placa: ${boardId} | Canal: ${channelId}`);
    return true;
  },

  /**
   * Dispara una grabación de seguridad de N segundos (ej. tras 3 intentos fallidos de PIN)
   * Captura el video de evidencia y lo registra en la bitácora de auditoría
   */
  async triggerSecurityRecording(durationMs = 5000) {
    const sessionId = 'security_lockout';
    logger.warn('SEGURIDAD', `[INCIDENTE] Disparando grabación de seguridad por bloqueo (${durationMs / 1000}s)`);

    openBoxes.add(sessionId);
    VideoRecorder.start(sessionId);

    if (esp32CamSocket && esp32CamSocket.readyState === WebSocket.OPEN) {
      esp32CamSocket.send(JSON.stringify({ command: 'START_CAMERA', box: sessionId }));
    }

    // Programar la finalización automática del video tras la duración especificada
    setTimeout(async () => {
      openBoxes.delete(sessionId);
      const videoData = await VideoRecorder.stop(sessionId);

      // Si no quedan otros casilleros abiertos, apagar la cámara
      if (openBoxes.size === 0 && esp32CamSocket && esp32CamSocket.readyState === WebSocket.OPEN) {
        esp32CamSocket.send(JSON.stringify({ command: 'STOP_CAMERA', box: sessionId }));
      }

      if (videoData && videoData.filename) {
        logger.info('SEGURIDAD', `Video de evidencia de intento no autorizado guardado: ${videoData.filename}`);
        try {
          await MovementModel.logSecurityIncident({
            filename: videoData.filename,
            notes: 'BLOQUEO POR 3 INTENTOS ERRÓNEOS DE PIN (Evidencia en video)'
          });
        } catch (err) {
          logger.error('SEGURIDAD', 'Error al registrar bitácora de seguridad', err);
        }
      }
    }, durationMs);
  }
};

module.exports = Esp32Bridge;
