const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

let isClientReady = false;

// Inicialización del cliente con almacenamiento de sesión
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: './.wwebjs_auth' // Carpeta donde se guarda la sesión iniciada
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

// Evento: Generar código QR para vincular dispositivo
client.on('qr', (qr) => {
  console.log('\n======================================================');
  console.log('[WHATSAPP] Escanea este código QR con el WhatsApp de EDCAM:');
  console.log('======================================================\n');
  qrcode.generate(qr, { small: true });
});

// Evento: Conexión exitosa y autenticado
client.on('ready', () => {
  isClientReady = true;
  console.log('>>> [WHATSAPP] Servicio conectado y listo para enviar mensajes <<<');
});

client.on('authenticated', () => {
  console.log('[WHATSAPP] Autenticación completada.');
});

client.on('auth_failure', (msg) => {
  console.error('[WHATSAPP] Error de autenticación:', msg);
});

client.on('disconnected', (reason) => {
  isClientReady = false;
  console.warn('[WHATSAPP] Cliente desconectado:', reason);
  client.initialize().catch(err => {
    console.warn('[WHATSAPP] Falló reintento de inicialización:', err.message);
  });
});

// Iniciar el cliente al arrancar Node.js de forma protegida
client.initialize().catch(err => {
  console.warn('[WHATSAPP] Inicialización diferida o en espera de sesión:', err.message);
});

/**
 * Enviar mensaje de comprobante con desglose de precios unitarios y total
 * @param {string} rawPhone - Número del usuario (10 dígitos o con lada)
 * @param {string} username - Nombre del usuario
 * @param {Array} items - Lista de artículos retirados
 * @param {number} totalAmount - Monto total acumulado
 */
async function sendWhatsAppMessage(rawPhone, username, items, totalAmount) {
  if (!isClientReady) {
    console.warn('[WHATSAPP] El cliente aún no está listo o la sesión no está activa.');
    return false;
  }

  if (!rawPhone || !Array.isArray(items) || items.length === 0) return false;

  try {
    // 1. Limpieza del número: quitar espacios, guiones y signos +
    let cleanNumber = rawPhone.toString().replace(/\D/g, '');

    // Para números de México (10 dígitos), WhatsApp requiere el prefijo de país 52
    if (cleanNumber.length === 10) {
      cleanNumber = `521${cleanNumber}`;
    }

    // 2. Verificar y resolver el ID exacto en la red de WhatsApp
    const numberId = await client.getNumberId(cleanNumber);
    if (!numberId) {
      console.warn(`[WHATSAPP] El número ${cleanNumber} no tiene cuenta de WhatsApp registrada.`);
      return false;
    }

    // 3. Redactar el mensaje con desglose de precios individuales y totales
    const itemsList = items
      .map(i => {
        const unitPrice = parseFloat(i.unit_price) || 0;
        const subtotal = parseFloat(i.subtotal) || (unitPrice * i.quantity);
        return `• Casillero #${String(i.locker_number).padStart(2, '0')}: *${i.product_name}* x${i.quantity} | $${unitPrice.toFixed(2)} c/u -> Subtotal: $${subtotal.toFixed(2)}`;
      })
      .join('\n');

    const total = totalAmount !== undefined 
      ? parseFloat(totalAmount) 
      : items.reduce((acc, i) => acc + (parseFloat(i.subtotal) || ((parseFloat(i.unit_price) || 0) * i.quantity)), 0);

    const message = 
`*EDCAM TECHNOLOGIES • SMART AUTOMATION*
_Comprobante de Dispensación_

Hola *${username}*, tu pedido ha sido dispensado con éxito:

${itemsList}

💰 *Total de la Venta:* $${total.toFixed(2)}
🕒 *Hora:* ${new Date().toLocaleTimeString()}
📅 *Fecha:* ${new Date().toLocaleDateString()}

“Gracias por utilizar EDCAM Technologies. Que tenga un excelente día. Estamos a sus órdenes.”`;

    // 4. Envío directo al destinatario
    await client.sendMessage(numberId._serialized, message);
    console.log(`[WHATSAPP] Notificación enviada correctamente a: ${cleanNumber}`);
    return true;
  } catch (error) {
    console.error('[WHATSAPP] Error al enviar mensaje:', error.message);
    return false;
  }
}

module.exports = {
  sendWhatsAppMessage
};
