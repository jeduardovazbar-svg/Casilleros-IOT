// src/services/notificationService.js
const nodemailer = require('nodemailer');
const twilio = require('twilio');
const logger = require('../core/logger');

// Configuración SMTP para Correo con pool de conexiones reutilizables
const mailTransporter = nodemailer.createTransport({
  service: 'gmail',
  pool: true,
  maxConnections: 3,
  maxMessages: 100,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  try {
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  } catch (err) {
    logger.warn('NOTIFICACION', `Twilio no disponible: ${err.message}`);
  }
}
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

/**
 * 1. Enviar comprobante individual por Email con diseño corporativo formal
 */
async function sendEmailReceipt({ to, username, items, totalAmount }) {
  if (!to || !process.env.SMTP_USER || !process.env.SMTP_PASS) return;

  const total = totalAmount !== undefined 
    ? parseFloat(totalAmount) 
    : items.reduce((acc, i) => acc + (parseFloat(i.subtotal) || ((parseFloat(i.unit_price) || 0) * i.quantity)), 0);

  const itemsHtml = items.map((i, idx) => {
    const unitPrice = parseFloat(i.unit_price) || 0;
    const subtotal = parseFloat(i.subtotal) || (unitPrice * i.quantity);
    const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    return `
    <tr style="background-color: ${bg};">
      <td style="padding: 12px 14px; border-bottom: 1px solid #e2e8f0; font-family: monospace; font-size: 13px; color: #1e3a8a; font-weight: bold;">
        CASILLERO #${String(i.locker_number).padStart(2, '0')}
      </td>
      <td style="padding: 12px 14px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #1e293b;">
        ${i.product_name}
      </td>
      <td style="padding: 12px 14px; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: bold; color: #0f172a;">
        ${i.quantity} pza(s)
      </td>
      <td style="padding: 12px 14px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #475569;">
        $${unitPrice.toFixed(2)}
      </td>
      <td style="padding: 12px 14px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold; color: #0f172a;">
        $${subtotal.toFixed(2)}
      </td>
    </tr>
  `;
  }).join('');

  const htmlTemplate = `
    <div style="background-color: #f1f5f9; padding: 30px 15px; font-family: 'Segoe UI', Arial, sans-serif;">
      <div style="max-width: 650px; margin: auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; border: 1px solid #cbd5e1; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
        
        <!-- Encabezado Corporativo -->
        <div style="background: linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%); padding: 25px 30px; color: #ffffff;">
          <h1 style="margin: 0; font-size: 20px; letter-spacing: 0.5px; font-weight: 700;">EDCAM TECHNOLOGIES</h1>
          <p style="margin: 4px 0 0 0; font-size: 12px; color: #93c5fd; text-transform: uppercase; letter-spacing: 1px;">Sistemas Inteligentes de Dispensación • Smart Locker WMS</p>
        </div>

        <div style="padding: 30px;">
          <div style="border-left: 4px solid #2563eb; padding-left: 14px; margin-bottom: 22px;">
            <p style="margin: 0; font-size: 13px; color: #64748b; text-transform: uppercase; font-weight: bold;">Comprobante Oficial de Movimiento</p>
            <p style="margin: 3px 0 0 0; font-size: 16px; color: #0f172a; font-weight: 600;">Destinatario: <strong>${username}</strong></p>
          </div>

          <p style="font-size: 14px; color: #334155; line-height: 1.5;">
            Le confirmamos que su solicitud de extracción de inventario ha sido validada y ejecutada correctamente en la unidad física de casilleros. A continuación se desglosan los artículos dispensados:
          </p>

          <table style="width: 100%; border-collapse: collapse; margin: 25px 0 15px 0; font-size: 13px;">
            <thead>
              <tr style="background-color: #0f172a; color: #ffffff; text-align: left;">
                <th style="padding: 10px 14px;">Identificador</th>
                <th style="padding: 10px 14px;">Insumo / Artículo</th>
                <th style="padding: 10px 14px; text-align: center;">Cantidad</th>
                <th style="padding: 10px 14px; text-align: right;">P. Unitario</th>
                <th style="padding: 10px 14px; text-align: right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
            <tfoot>
              <tr style="background-color: #f8fafc; border-top: 2px solid #cbd5e1;">
                <td colspan="4" style="padding: 14px; text-align: right; font-weight: 700; color: #1e293b; font-size: 14px;">TOTAL GENERAL:</td>
                <td style="padding: 14px; text-align: right; font-weight: 800; color: #1e3a8a; font-size: 16px;">$${total.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>

          <div style="background-color: #f8fafc; border-left: 3px solid #64748b; padding: 12px 16px; margin: 20px 0; font-size: 12px; color: #475569;">
            <p style="margin: 0;"><strong>Folio de Auditoría:</strong> TRX-${Date.now().toString(36).toUpperCase()}</p>
            <p style="margin: 3px 0 0 0;"><strong>Fecha y Hora de Apertura:</strong> ${new Date().toLocaleString()}</p>
          </div>

          <p style="font-size: 12px; color: #64748b; text-align: center; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 18px;">
            Este mensaje es una notificación automatizada de control de existencias generada por EDCAM Locker WMS.
          </p>
        </div>
      </div>
    </div>
  `;

  try {
    await mailTransporter.sendMail({
      from: `"EDCAM Casilleros Inteligentes" <${process.env.SMTP_USER}>`,
      to,
      subject: `[Comprobante WMS] Dispensación Autorizada - Total: $${total.toFixed(2)} - EDCAM`,
      html: htmlTemplate
    });
    logger.info('EMAIL', `Comprobante formal enviado a ${to}`);
  } catch (err) {
    logger.error('EMAIL', `Fallo al despachar comprobante a ${to}: ${err.message}`);
  }
}

/**
 * 2. Enviar Reporte Ejecutivo Semanal/Periódico con Archivo Excel Adjunto (.xlsx)
 */
async function sendWeeklyExecutiveReport({ recipients, stats, excelBuffer, filename }) {
  if (!recipients || recipients.length === 0 || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    logger.warn('EMAIL', 'No hay destinatarios o credenciales SMTP configuradas para el reporte periódico');
    return false;
  }

  const emails = recipients.map(r => r.email).filter(Boolean);
  if (emails.length === 0) return false;

  const htmlTemplate = `
    <div style="background-color: #f8fafc; padding: 35px 20px; font-family: 'Segoe UI', Tahoma, Arial, sans-serif;">
      <div style="max-width: 680px; margin: auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); padding: 30px; color: #ffffff;">
          <h1 style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: 0.5px;">EDCAM TECHNOLOGIES</h1>
          <p style="margin: 6px 0 0 0; font-size: 13px; color: #bfdbfe; text-transform: uppercase; letter-spacing: 1.2px;">
            Informe Periódico de Gestión y Auditoría WMS
          </p>
        </div>

        <div style="padding: 30px;">
          <p style="font-size: 15px; color: #1e293b; margin-top: 0;">
            Estimado equipo de <strong>Administración y Operaciones</strong>,
          </p>
          <p style="font-size: 14px; color: #475569; line-height: 1.6;">
            Se ha compilado el resumen estadístico de movimientos y dispensación del casillero inteligente correspondiente a los <strong>últimos ${stats.daysAnalyzed || 7} días</strong>. Se adjunta el archivo formal en formato Microsoft Excel (<code>.xlsx</code>) con el desglose completo de folios y auditoría de stock.
          </p>

          <!-- Resumen de Métricas Clave (KPIs) -->
          <div style="display: table; width: 100%; margin: 25px 0;">
            <div style="display: table-row;">
              <div style="display: table-cell; width: 33%; padding: 15px; background-color: #f1f5f9; border-radius: 8px; text-align: center; border: 1px solid #e2e8f0;">
                <p style="margin: 0; font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase;">Monto Retirado</p>
                <p style="margin: 5px 0 0 0; font-size: 18px; font-weight: 800; color: #1e3a8a;">$${stats.totalRevenue.toFixed(2)}</p>
              </div>
              <div style="display: table-cell; width: 33%; padding: 15px; background-color: #f1f5f9; border-radius: 8px; text-align: center; border: 1px solid #e2e8f0;">
                <p style="margin: 0; font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase;">Insumos Retirados</p>
                <p style="margin: 5px 0 0 0; font-size: 18px; font-weight: 800; color: #0284c7;">${stats.totalUnits} pzas</p>
              </div>
              <div style="display: table-cell; width: 33%; padding: 15px; background-color: #f1f5f9; border-radius: 8px; text-align: center; border: 1px solid #e2e8f0;">
                <p style="margin: 0; font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase;">Producto Estrella</p>
                <p style="margin: 5px 0 0 0; font-size: 14px; font-weight: 800; color: #0f172a;">${stats.starProduct}</p>
              </div>
            </div>
          </div>

          <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 14px 18px; border-radius: 4px; margin: 25px 0;">
            <p style="margin: 0; font-size: 13px; color: #1e40af; font-weight: 600;">
              📎 Archivo Adjunto: <code>${filename}</code>
            </p>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #3b82f6;">
              Incluye las hojas: <em>Resumen Ejecutivo</em> (tarjetas, rotación y usuarios) y <em>Bitácora Detallada</em> (precios unitarios, subtotales, inventario inicial/final y evidencia de video).
            </p>
          </div>

          <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
            EDCAM Technologies • Departamento de Automatización y Control Industrial • Sistema WMS
          </p>
        </div>
      </div>
    </div>
  `;

  try {
    await mailTransporter.sendMail({
      from: `"EDCAM Auditoría WMS" <${process.env.SMTP_USER}>`,
      to: emails.join(', '),
      subject: `[Reporte WMS] Informe Estadístico y Auditoría de Casilleros - ${filename}`,
      html: htmlTemplate,
      attachments: [
        {
          filename,
          content: excelBuffer,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }
      ]
    });

    logger.info('EMAIL', `Reporte ejecutivo semanal con Excel despachado con éxito a: ${emails.join(', ')}`);
    return true;
  } catch (err) {
    logger.error('EMAIL', `Fallo al enviar reporte periódico con Excel: ${err.message}`);
    return false;
  }
}

/**
 * 3. Alerta Inmediata de Seguridad (3 intentos fallidos de PIN)
 */
async function sendSecurityAlertEmail({ ip, reason, attempts = 3, timestamp = new Date() }) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return;

  const htmlTemplate = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 2px solid #ef4444; border-radius: 8px;">
      <h2 style="color: #b91c1c; margin-top: 0;">⚠️ ALERTA DE SEGURIDAD: INTENTO DE ACCESO NO AUTORIZADO</h2>
      <p style="font-size: 14px; color: #334155;">Se ha detectado un bloqueo de teclado en el kiosco de casilleros inteligentes:</p>
      <ul style="font-size: 13px; color: #1e293b; line-height: 1.8;">
        <li><strong>Evento:</strong> ${reason}</li>
        <li><strong>Intentos Fallidos Consecutivos:</strong> ${attempts}</li>
        <li><strong>Dirección de Red:</strong> ${ip}</li>
        <li><strong>Fecha y Hora:</strong> ${new Date(timestamp).toLocaleString()}</li>
        <li><strong>Acción Automática:</strong> Se activó la ESP32-CAM y se grabó un clip de seguridad de 5 segundos como evidencia.</li>
      </ul>
      <p style="font-size: 12px; color: #64748b; margin-bottom: 0;">Puede revisar el video correspondiente en el panel de auditoría de administradores.</p>
    </div>
  `;

  try {
    await mailTransporter.sendMail({
      from: `"EDCAM Seguridad" <${process.env.SMTP_USER}>`,
      to: process.env.SMTP_USER,
      subject: `⚠️ ALERTA CRÍTICA: Bloqueo de PIN por Intentos Erróneos en Kiosco`,
      html: htmlTemplate
    });
    logger.info('EMAIL', 'Alerta de intrusión enviada al correo del administrador');
  } catch (err) {
    logger.error('EMAIL', `Fallo al enviar alerta de seguridad: ${err.message}`);
  }
}

module.exports = {
  sendEmailReceipt,
  sendWeeklyExecutiveReport,
  sendSecurityAlertEmail
};
