// src/services/videoRecorder.js
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Carpeta donde se almacenarán las grabaciones (en la raíz del proyecto)
const RECORDINGS_DIR = path.join(__dirname, '../../storage/recordings');
if (!fs.existsSync(RECORDINGS_DIR)) {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

// Almacena las sesiones activas: { [boxId]: { process, filePath, filename, url, startTime } }
const activeSessions = {};

const VideoRecorder = {
  // Inicia la sesión de grabación para un casillero específico
  start(boxId) {
    if (activeSessions[boxId]) {
      console.warn(`[GRABADOR] Ya existe una grabación en curso para el casillero ${boxId}`);
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `casillero_${boxId}_${timestamp}.mp4`;
    const filePath = path.join(RECORDINGS_DIR, filename);

    // Parámetros de FFmpeg optimizados para streaming continuo desde memoria
    const ffmpegArgs = [
      '-y',                       // Sobrescribir archivo si existiera
      '-loglevel', 'warning',     // Evitar saturación de búfer con logs de depuración
      '-f', 'image2pipe',         // Formato de entrada: flujo continuo de imágenes
      '-vcodec', 'mjpeg',         // Códec de entrada (fotogramas JPEG del ESP32-CAM)
      '-r', '15',                 // Tasa aproximada de fotogramas por segundo (FPS)
      '-i', '-',                  // Leer directamente desde stdin (tubería)
      '-vcodec', 'libx264',       // Códec de salida H.264 compatible con navegadores y móviles
      '-pix_fmt', 'yuv420p',      // Formato de píxel universal
      '-preset', 'ultrafast',     // Codificación ultra rápida para no saturar la CPU
      '-movflags', '+faststart',  // Permite reproducir el video en web sin descargarlo completo
      filePath
    ];

    const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);

    // 1. Manejo de error si el ejecutable de FFmpeg falla o no se encuentra en el sistema
    ffmpegProcess.on('error', (err) => {
      console.error(`[GRABADOR CRÍTICO] Error al iniciar proceso FFmpeg para casillero ${boxId}:`, err.message);
      delete activeSessions[boxId];
    });

    // 2. Control de error en la tubería de entrada (stdin)
    ffmpegProcess.stdin.on('error', (err) => {
      if (err.code !== 'EPIPE') {
        console.error(`[GRABADOR Stdin Error Casillero ${boxId}]:`, err.message);
      }
    });

    // 3. Drenar stderr para evitar que se llene el buffer de Windows y congele la grabación
    ffmpegProcess.stderr.on('data', () => {
      // Flujo consumido silenciosamente para mantener la tubería despejada
    });

    ffmpegProcess.on('close', (code) => {
      if (code === 0) {
        console.log(`[GRABADOR] Video guardado exitosamente: ${filename}`);
      } else {
        console.warn(`[GRABADOR] FFmpeg cerró para casillero ${boxId} con código: ${code}`);
      }
    });

    activeSessions[boxId] = {
      process: ffmpegProcess,
      filePath: filePath,
      filename: filename,
      url: `/recordings/${filename}`,
      startTime: Date.now()
    };

    console.log(`[GRABADOR] Iniciando grabación para casillero ${boxId} -> ${filename}`);
  },

  // Escribe un fotograma JPEG binario en la tubería de FFmpeg
  addFrame(boxId, frameBuffer) {
    const session = activeSessions[boxId];
    if (session && session.process && session.process.stdin && session.process.stdin.writable) {
      session.process.stdin.write(frameBuffer);
    }
  },

  // Detiene la sesión y finaliza el empaquetado del archivo .mp4
  stop(boxId) {
    const session = activeSessions[boxId];
    if (!session) return null;

    console.log(`[GRABADOR] Finalizando grabación de casillero ${boxId}...`);

    try {
      if (session.process.stdin.writable) {
        session.process.stdin.end(); // Cierra el flujo para escribir los metadatos finales del MP4
      }
    } catch (err) {
      console.error(`[GRABADOR] Error al cerrar stdin del casillero ${boxId}:`, err.message);
    }

    const savedInfo = {
      filename: session.filename,
      filePath: session.filePath,
      url: session.url,
      durationMs: Date.now() - session.startTime
    };

    delete activeSessions[boxId];
    return savedInfo;
  },

  // Verifica si hay una grabación en progreso para este casillero
  isRecording(boxId) {
    return !!activeSessions[boxId];
  }
};

module.exports = VideoRecorder;