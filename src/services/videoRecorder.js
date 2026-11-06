// src/services/videoRecorder.js
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const logger = require('../core/logger');

let ffmpegBinary = 'ffmpeg';
try {
  const staticFfmpeg = require('ffmpeg-static');
  if (staticFfmpeg && fs.existsSync(staticFfmpeg)) {
    ffmpegBinary = staticFfmpeg;
  }
} catch (e) {
  ffmpegBinary = 'ffmpeg';
}

const RECORDINGS_DIR = path.join(__dirname, '../../storage/recordings');
if (!fs.existsSync(RECORDINGS_DIR)) {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

// Mapa de sesiones: boxId -> { process, filePath, filename, startTime, isDraining, closePromise }
const activeSessions = new Map();

const VideoRecorder = {
  start(boxId) {
    if (activeSessions.has(boxId)) {
      logger.warn('GRABADOR', `Casillero/Sesión #${boxId} ya cuenta con una sesión de video en curso.`);
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const isSecurity = String(boxId).toLowerCase().includes('security') || String(boxId).toLowerCase().includes('seguridad');
    const filename = isSecurity
      ? `seguridad_bloqueo_${timestamp}.mp4`
      : `casillero_${boxId}_${timestamp}.mp4`;
    const filePath = path.join(RECORDINGS_DIR, filename);

    const ffmpegArgs = [
      '-y',
      '-loglevel', 'error',
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      '-r', '15',
      '-i', '-',
      '-vcodec', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-movflags', '+faststart',
      filePath
    ];

    const proc = spawn(ffmpegBinary, ffmpegArgs);
    let lastErrorOutput = '';

    const session = {
      process: proc,
      filePath,
      filename,
      url: `/recordings/${filename}`,
      startTime: Date.now(),
      isDraining: false,
      closePromise: null
    };

    session.closePromise = new Promise((resolve) => {
      proc.on('close', (code) => {
        if (code === 0) {
          logger.info('GRABADOR', `Video guardado correctamente: ${filename}`);
          resolve({
            filename,
            filePath,
            url: `/recordings/${filename}`,
            durationMs: Date.now() - session.startTime,
            success: true
          });
        } else {
          logger.warn('GRABADOR', `FFmpeg cerró con código ${code} en sesión #${boxId}: ${lastErrorOutput}`);
          resolve({
            filename,
            filePath,
            url: `/recordings/${filename}`,
            durationMs: Date.now() - session.startTime,
            success: false
          });
        }
      });
    });

    proc.stdin.on('drain', () => {
      session.isDraining = false;
    });

    proc.stdin.on('error', (err) => {
      if (err.code !== 'EPIPE') {
        logger.error('GRABADOR', `Stdin Error en sesión #${boxId}`, err);
      }
    });

    proc.stderr.on('data', (chunk) => {
      lastErrorOutput = chunk.toString().slice(-300);
    });

    proc.on('error', (err) => {
      logger.error('GRABADOR', `Error al invocar FFmpeg para sesión #${boxId}`, err);
      activeSessions.delete(boxId);
    });

    activeSessions.set(boxId, session);
    logger.info('GRABADOR', `Iniciando grabación para sesión #${boxId} -> ${filename}`);
  },

  addFrame(boxId, frameBuffer) {
    const session = activeSessions.get(boxId);
    if (!session || !session.process.stdin.writable) return;

    if (session.isDraining) {
      return;
    }

    const canWriteMore = session.process.stdin.write(frameBuffer);
    if (!canWriteMore) {
      session.isDraining = true;
    }
  },

  async stop(boxId) {
    const session = activeSessions.get(boxId);
    if (!session) return null;

    activeSessions.delete(boxId);
    logger.info('GRABADOR', `Finalizando grabación de sesión #${boxId}...`);

    try {
      if (session.process.stdin.writable) {
        session.process.stdin.end();
      }
    } catch (err) {
      logger.error('GRABADOR', `Error cerrando stdin de sesión #${boxId}`, err);
    }

    // Watchdog de 4 segundos
    const watchdogPromise = new Promise((resolve) => {
      setTimeout(() => {
        try {
          if (!session.process.killed) {
            logger.warn('GRABADOR', `Watchdog: FFmpeg no finalizó a tiempo para sesión #${boxId}. Enviando SIGKILL.`);
            session.process.kill('SIGKILL');
          }
        } catch (_) {}
        resolve({
          filename: session.filename,
          filePath: session.filePath,
          url: session.url,
          durationMs: Date.now() - session.startTime,
          success: false
        });
      }, 4000);
    });

    return Promise.race([session.closePromise, watchdogPromise]);
  },

  isRecording(boxId) {
    return activeSessions.has(boxId);
  }
};

function cleanup() {
  for (const [boxId, session] of activeSessions.entries()) {
    try {
      logger.warn('GRABADOR', `Limpieza: cerrando proceso FFmpeg para sesión #${boxId}`);
      session.process.kill('SIGKILL');
    } catch (_) {}
  }
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);

module.exports = VideoRecorder;
