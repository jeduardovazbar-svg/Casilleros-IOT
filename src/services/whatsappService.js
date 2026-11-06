// src/services/whatsappService.js
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const logger = require('../core/logger');

let isClientReady = false;
let client = null;

try {
  client = new Client({
    authStrategy: new LocalAuth({
      dataPath: './.wwebjs_auth'
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    }
  });

  client.on('qr', (qr) => {
    logger.info('WHATSAPP', 'Código QR disponible para vinculación en terminal:');
    qrcode.generate(qr, { small: true });
  });

  client.on('ready', () => {
    isClientReady = true;
    logger.info('WHATSAPP', '>>> Cliente WhatsApp autenticado y listo para enviar notificaciones <<<');
  });

  client.on('authenticated', () => {
    logger.info('WHATSAPP', 'Sesión de WhatsApp autenticada correctamente');
  });

  client.on('auth_failure', (msg) => {
    logger.error('WHATSAPP', `Error de autenticación WhatsApp: ${msg}`);
  });

  client.on('disconnected', (reason) => {
    isClientReady = false;
    logger.warn('WHATSAPP', `Cliente WhatsApp desconectado: ${reason}`);
  });

  client.initialize().catch((err) => {
    logger.warn('WHATSAPP', `Inicialización en segundo plano o en espera de vinculación: ${err.message}`);
  });
} catch (initErr) {
  logger.error('WHATSAPP', `No se pudo inicializar cliente WhatsApp: ${initErr.message}`);
}

function normalizePhoneNumber(rawPhone) {
  let clean = rawPhone.toString().replace(/\D/g, '');
  if (clean.length === 10) {
    clean = `521${clean}`;
  }
  return clean;
}

/**
 * 1. Envío de Comprobante Oficial de Dispensación con estructura ejecutiva
 */
async function sendWhatsAppMessage(rawPhone, username, items, totalAmount) {
  if (!client || !isClientReady) {
    logger.debug('WHATSAPP', 'Servicio no listo. Omitiendo mensaje temporalmente.');
    return false;
  }

  if (!rawPhone || !Array.isArray(items) || items.length === 0) return false;

  try {
    const cleanNumber = normalizePhoneNumber(rawPhone);
    const numberId = await client.getNumberId(cleanNumber);
    if (!numberId) {
      logger.warn('WHATSAPP', `El número ${cleanNumber} no está registrado en WhatsApp.`);
      return false;
    }

    const folio = `TRX-${Date.now().toString(36).toUpperCase()}`;
    const itemsList = items
      .map((i, idx) => {
        const unitPrice = parseFloat(i.unit_price) || 0;
        const subtotal = parseFloat(i.subtotal) || (unitPrice * i.quantity);
        return `▫️ *${idx + 1}. [Casillero #${String(i.locker_number).padStart(2, '0')}]* ${i.product_name}\n   • Cantidad: *${i.quantity} pza(s)* | P.Unit: $${unitPrice.toFixed(2)}\n   • Subtotal: *$${subtotal.toFixed(2)}*`;
      })
      .join('\n\n');

    const total = totalAmount !== undefined 
      ? parseFloat(totalAmount) 
      : items.reduce((acc, i) => acc + (parseFloat(i.subtotal) || ((parseFloat(i.unit_price) || 0) * i.quantity)), 0);

    const message = 
`🏢 *EDCAM TECHNOLOGIES • SMART AUTOMATION*
_División de Casilleros Inteligentes y Control WMS_
━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 *COMPROBANTE OFICIAL DE DISPENSACIÓN*

👤 *Usuario Solicitante:* ${username}
🔖 *Folio de Operación:* \`${folio}\`
📅 *Fecha:* ${new Date().toLocaleDateString()}  |  🕒 *Hora:* ${new Date().toLocaleTimeString()}

📦 *DESGLOSE DE ARTÍCULOS ENTREGADOS:*
${itemsList}

━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 *IMPORTE TOTAL GENERAL:* *$${total.toFixed(2)} MXN*
━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ *Estado:* Operación validada en hardware y bitácora de auditoría.
📌 *Nota:* Conserve este mensaje como comprobante de movimiento de inventario.

_“Automatización de precisión y control inteligente a su servicio.”_`;

    await client.sendMessage(numberId._serialized, message);
    logger.info('WHATSAPP', `Comprobante formal entregado a ${cleanNumber}`);
    return true;
  } catch (error) {
    logger.error('WHATSAPP', `Error al enviar mensaje: ${error.message}`);
    return false;
  }
}

/**
 * 2. Envío de Resumen Ejecutivo Periódico / Semanal por WhatsApp
 */
async function sendWeeklyReportWhatsApp(rawPhone, stats) {
  if (!client || !isClientReady || !rawPhone) return false;

  try {
    const cleanNumber = normalizePhoneNumber(rawPhone);
    const numberId = await client.getNumberId(cleanNumber);
    if (!numberId) return false;

    const message = 
`📊 *EDCAM TECHNOLOGIES • INFORME EJECUTIVO SEMANAL*
_Auditoría General de Casilleros Inteligentes WMS_
━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 *Período Evaluado:* Últimos ${stats.daysAnalyzed || 7} días
🕒 *Corte de Información:* ${new Date().toLocaleString()}

📈 *INDICADORES CLAVE DE RENDIMIENTO (KPIs):*
• 💵 *Monto Total Retirado:* $${stats.totalRevenue.toFixed(2)} MXN
• 📦 *Unidades Totales Dispensadas:* ${stats.totalUnits} piezas
• 🏆 *Producto Más Demandado:* *${stats.starProduct}*
• 📝 *Total de Transacciones Registradas:* ${stats.totalTransactions} eventos

━━━━━━━━━━━━━━━━━━━━━━━━━━
📎 *Detalle:* El reporte completo con hojas de rotación de stock y bitácora detallada ha sido despachado por correo electrónico en formato Excel (.xlsx).

_Departamento de Auditoría y Control de Inventarios • EDCAM_`;

    await client.sendMessage(numberId._serialized, message);
    logger.info('WHATSAPP', `Resumen semanal de KPIs enviado a ${cleanNumber}`);
    return true;
  } catch (err) {
    logger.error('WHATSAPP', `Error enviando reporte semanal por WhatsApp: ${err.message}`);
    return false;
  }
}

module.exports = {
  sendWhatsAppMessage,
  sendWeeklyReportWhatsApp
};
