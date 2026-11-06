// src/core/logger.js
/**
 * Logger estructurado de alto rendimiento para entorno Kiosco / IoT Industrial
 * Formato: [TIMESTAMP ISO] [NIVEL] [SERVICIO] Mensaje
 */
const LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

const CURRENT_LEVEL = process.env.LOG_LEVEL 
  ? (LEVELS[process.env.LOG_LEVEL.toUpperCase()] ?? LEVELS.INFO)
  : LEVELS.INFO;

function formatTimestamp() {
  return new Date().toISOString();
}

function log(levelStr, service, message, extra = null) {
  const levelNum = LEVELS[levelStr] ?? LEVELS.INFO;
  if (levelNum < CURRENT_LEVEL) return;

  const prefix = `[${formatTimestamp()}] [${levelStr.padEnd(5)}] [${service}]`;
  if (extra) {
    if (extra instanceof Error) {
      console.log(`${prefix} ${message} - ${extra.stack || extra.message}`);
    } else {
      console.log(`${prefix} ${message} - ${JSON.stringify(extra)}`);
    }
  } else {
    console.log(`${prefix} ${message}`);
  }
}

const logger = {
  debug: (service, msg, extra) => log('DEBUG', service, msg, extra),
  info: (service, msg, extra) => log('INFO', service, msg, extra),
  warn: (service, msg, extra) => log('WARN', service, msg, extra),
  error: (service, msg, extra) => log('ERROR', service, msg, extra)
};

module.exports = logger;
