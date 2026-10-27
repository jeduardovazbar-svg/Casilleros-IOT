// src/services/notificationService.js
const nodemailer = require('nodemailer');
const twilio = require('twilio');

// Configuración SMTP para Correo
const mailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Configuración de Twilio para WhatsApp (si se utiliza como pasarela alternativa)
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

/**
 * Enviar comprobante por Email con desglose de precios unitarios y total
 */
async function sendEmailReceipt({ to, username, items, totalAmount }) {
  if (!to || !process.env.SMTP_USER || !process.env.SMTP_PASS) return;

  const total = totalAmount !== undefined 
    ? parseFloat(totalAmount) 
    : items.reduce((acc, i) => acc + (parseFloat(i.subtotal) || ((parseFloat(i.unit_price) || 0) * i.quantity)), 0);

  const itemsHtml = items.map(i => {
    const unitPrice = parseFloat(i.unit_price) || 0;
    const subtotal = parseFloat(i.subtotal) || (unitPrice * i.quantity);
    return `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">Casillero #${String(i.locker_number).padStart(2, '0')}</td>
      <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: 500;">${i.product_name}</td>
      <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: center;"><strong>${i.quantity}</strong> pza(s)</td>
      <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #475569;">$${unitPrice.toFixed(2)}</td>
      <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold; color: #0f172a;">$${subtotal.toFixed(2)}</td>
    </tr>
  `;
  }).join('');

  const htmlTemplate = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 620px; margin: auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
      <div style="border-bottom: 2px solid #3b82f6; padding-bottom: 12px; margin-bottom: 18px;">
        <h2 style="color: #1e3a8a; margin: 0; font-size: 22px;">EDCAM Technologies</h2>
        <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">Smart Automation Systems • Comprobante de Entrega</p>
      </div>
      
      <p style="font-size: 15px; color: #334155;">Hola <strong>${username}</strong>,</p>
      <p style="font-size: 14px; color: #475569;">Tu retiro de insumos ha sido procesado exitosamente en el casillero inteligente. A continuación se detalla tu comprobante:</p>
      
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
        <thead>
          <tr style="background-color: #f1f5f9; text-align: left; color: #334155;">
            <th style="padding: 10px; border-radius: 6px 0 0 6px;">Casillero</th>
            <th style="padding: 10px;">Insumo</th>
            <th style="padding: 10px; text-align: center;">Cantidad</th>
            <th style="padding: 10px; text-align: right;">P. Unitario</th>
            <th style="padding: 10px; text-align: right; border-radius: 0 6px 6px 0;">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
        <tfoot>
          <tr style="background-color: #f8fafc;">
            <td colspan="4" style="padding: 12px 10px; text-align: right; font-weight: bold; color: #1e293b; font-size: 15px;">TOTAL DE LA VENTA:</td>
            <td style="padding: 12px 10px; text-align: right; font-weight: bold; color: #2563eb; font-size: 16px;">$${total.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>

      <div style="background-color: #f8fafc; padding: 12px 15px; border-radius: 8px; margin: 20px 0;">
        <p style="font-size: 12px; color: #64748b; margin: 0;">📅 <strong>Fecha y Hora:</strong> ${new Date().toLocaleString()}</p>
      </div>

      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
      <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">
        “Gracias por utilizar EDCAM Technologies. Que tenga un excelente día. Estamos a sus órdenes.”
      </p>
    </div>
  `;

  await mailTransporter.sendMail({
    from: `"EDCAM Kiosko" <${process.env.SMTP_USER}>`,
    to: to,
    subject: `Comprobante de Retiro - Total: $${total.toFixed(2)} - EDCAM Technologies`,
    html: htmlTemplate
  });
}

/**
 * Enviar mensaje de confirmación por WhatsApp (Twilio fallback)
 */
async function sendWhatsAppReceipt({ toPhone, username, items, totalAmount }) {
  if (!toPhone || !twilioClient) return;

  const formattedPhone = toPhone.startsWith('+') ? toPhone : `+${toPhone}`;
  const total = totalAmount !== undefined 
    ? parseFloat(totalAmount) 
    : items.reduce((acc, i) => acc + (parseFloat(i.subtotal) || ((parseFloat(i.unit_price) || 0) * i.quantity)), 0);

  const summary = items.map(i => {
    const unitPrice = parseFloat(i.unit_price) || 0;
    const subtotal = parseFloat(i.subtotal) || (unitPrice * i.quantity);
    return `• Casillero #${i.locker_number}: *${i.product_name}* x${i.quantity} | $${unitPrice.toFixed(2)} c/u (Subtotal: $${subtotal.toFixed(2)})`;
  }).join('\n');

  const textBody = 
    `*EDCAM TECHNOLOGIES • SMART AUTOMATION*\n\n` +
    `¡Hola *${username}*! Tu pedido ha sido dispensado con éxito:\n\n` +
    `${summary}\n\n` +
    `💰 *Total de la Venta:* $${total.toFixed(2)}\n` +
    `🕒 *Hora:* ${new Date().toLocaleTimeString()}\n` +
    `📅 *Fecha:* ${new Date().toLocaleDateString()}\n\n` +
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
