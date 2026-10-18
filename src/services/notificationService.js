const nodemailer = require('nodemailer');
const twilio = require('twilio');

// Configuración SMTP para Correo (ejemplo con Gmail / Workspace)
const mailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER, // Tu correo: soporte@edcam.com
    pass: process.env.SMTP_PASS  // Contraseña de aplicación generada en Google
  }
});

// Configuración de Twilio para WhatsApp
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
const TWILIO_WHATSAPP_FROM = 'whatsapp:+14155238886'; // Número Sandbox o número oficial

/**
 * Enviar comprobante por Email
 */
async function sendEmailReceipt({ to, username, items }) {
  if (!to) return;

  const itemsHtml = items.map(i => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">Casillero #${String(i.locker_number).padStart(2, '0')}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${i.product_name}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: center;"><strong>${i.quantity}</strong> pza(s)</td>
    </tr>
  `).join('');

  const htmlTemplate = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; rounded: 12px;">
      <h2 style="color: #1e3a8a; margin-bottom: 4px;">EDCAM Technologies</h2>
      <p style="color: #64748b; font-size: 13px; margin-top: 0;">Smart Automation Systems</p>
      
      <p>Hola <strong>${username}</strong>,</p>
      <p>Tu retiro de insumos ha sido procesado exitosamente en el casillero inteligente:</p>
      
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
        <thead>
          <tr style="background-color: #f8fafc; text-align: left; color: #475569;">
            <th style="padding: 8px;">Casillero</th>
            <th style="padding: 8px;">Insumo</th>
            <th style="padding: 8px; text-align: center;">Cantidad</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <p style="font-size: 12px; color: #64748b;">Fecha y Hora: ${new Date().toLocaleString()}</p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
      <p style="font-size: 11px; color: #94a3b8; text-align: center;">
        “Gracias por utilizar EDCAM Technologies. Que tenga un excelente día. Estamos a sus órdenes.”
      </p>
    </div>
  `;

  await mailTransporter.sendMail({
    from: `"EDCAM Kiosko" <${process.env.SMTP_USER}>`,
    to: to,
    subject: 'Comprobante de Retiro de Insumos - EDCAM Technologies',
    html: htmlTemplate
  });
}

/**
 * Enviar mensaje de confirmación por WhatsApp
 */
async function sendWhatsAppReceipt({ toPhone, username, items }) {
  if (!toPhone) return;

  // Formato internacional requerido (ej. +521XXXXXXXXXX)
  const formattedPhone = toPhone.startsWith('+') ? toPhone : `+${toPhone}`;

  let summary = items.map(i => `• Casillero #${i.locker_number}: ${i.product_name} (${i.quantity} pzas)`).join('\n');

  const textBody = 
    `*EDCAM TECHNOLOGIES • SMART AUTOMATION*\n\n` +
    `¡Hola *${username}*! Tu pedido ha sido dispensado con éxito:\n\n` +
    `${summary}\n\n` +
    `_Hora: ${new Date().toLocaleTimeString()}_\n\n` +
    `Gracias por utilizar EDCAM Technologies. Que tenga un excelente día. Estamos a sus órdenes.`;

  await twilioClient.messages.create({
    from: TWILIO_WHATSAPP_FROM,
    to: `whatsapp:${formattedPhone}`,
    body: textBody
  });
}

module.exports = {
  sendEmailReceipt,
  sendWhatsAppReceipt
};