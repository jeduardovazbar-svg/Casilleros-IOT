// src/services/reportGeneratorService.js
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const db = require('../config/database');
const MovementModel = require('../models/movementModel');
const StatsModel = require('../models/statsModel');
const LockerModel = require('../models/lockerModel');
const logger = require('../core/logger');

const REPORTS_DIR = path.join(__dirname, '../../storage/reports');
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

const ReportGeneratorService = {
  /**
   * Recopila todas las métricas analíticas y genera un libro de cálculo Excel (.xlsx) corporativo
   * @param {number} days - Días hacia atrás para el análisis (default: 7)
   */
  async generateWeeklyReport(days = 7) {
    logger.info('REPORTES', `Generando reporte de auditoría y estadísticas para los últimos ${days} días...`);

    // 1. Obtener datos de la base de datos
    const [recentLogs, topProducts, userActivity, lockers] = await Promise.all([
      MovementModel.getRecentLogs(days),
      StatsModel.getTopProducts(),
      StatsModel.getUserActivity(),
      LockerModel.getAll()
    ]);

    // 2. Calcular KPIs agregados
    let totalWithdrawnUnits = 0;
    let totalRevenueAmount = 0;

    recentLogs.forEach((log) => {
      if (log.action_type === 'RETIRO') {
        const qty = Math.abs(log.quantity_changed);
        const price = parseFloat(log.price) || 0;
        totalWithdrawnUnits += qty;
        totalRevenueAmount += (qty * price);
      }
    });

    const starProduct = topProducts.length > 0 ? topProducts[0].product_name : 'N/A';
    const totalTransactions = recentLogs.length;

    // 3. Construir libro de trabajo ExcelJS
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'EDCAM Technologies - Smart Locker Systems';
    workbook.created = new Date();

    // ========================================================
    // HOJA 1: RESUMEN EJECUTIVO Y ESTADÍSTICAS
    // ========================================================
    const wsSummary = workbook.addWorksheet('Resumen Ejecutivo', {
      views: [{ showGridLines: true }]
    });

    // Encabezado corporativo
    wsSummary.mergeCells('A1:G1');
    const headerCell = wsSummary.getCell('A1');
    headerCell.value = 'EDCAM TECHNOLOGIES • SMART AUTOMATION';
    headerCell.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }; // Azul oscuro industrial
    headerCell.alignment = { horizontal: 'center', vertical: 'middle' };
    wsSummary.getRow(1).height = 35;

    wsSummary.mergeCells('A2:G2');
    const subheaderCell = wsSummary.getCell('A2');
    subheaderCell.value = `INFORME PERIÓDICO DE GESTIÓN Y AUDITORÍA DE INVENTARIO (${days} DÍAS)`;
    subheaderCell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF3B82F6' } };
    subheaderCell.alignment = { horizontal: 'center', vertical: 'middle' };
    wsSummary.getRow(2).height = 22;

    wsSummary.getCell('A3').value = `Fecha de emisión: ${new Date().toLocaleString()} | Sistema: Casillero Inteligente WMS`;
    wsSummary.getCell('A3').font = { italic: true, size: 9, color: { argb: 'FF64748B' } };

    // Tarjetas de Indicadores Clave de Rendimiento (KPIs)
    const kpiStartRow = 5;
    const kpis = [
      { label: 'MONTO TOTAL RETIRADO', value: totalRevenueAmount, format: '$#,##0.00', col: 'B' },
      { label: 'UNIDADES DISPENSADAS', value: totalWithdrawnUnits, format: '#,##0', col: 'D' },
      { label: 'PRODUCTO ESTRELLA', value: starProduct, format: null, col: 'F' }
    ];

    kpis.forEach(kpi => {
      const labelCell = wsSummary.getCell(`${kpi.col}${kpiStartRow}`);
      const valCell = wsSummary.getCell(`${kpi.col}${kpiStartRow + 1}`);

      labelCell.value = kpi.label;
      labelCell.font = { size: 9, bold: true, color: { argb: 'FF64748B' } };
      labelCell.alignment = { horizontal: 'center', vertical: 'middle' };

      valCell.value = kpi.value;
      valCell.font = { size: 14, bold: true, color: { argb: 'FF1E293B' } };
      valCell.alignment = { horizontal: 'center', vertical: 'middle' };
      if (kpi.format) valCell.numFmt = kpi.format;

      labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      valCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    });

    // Sección A: Tabla de Insumos y Rotación
    let currentRow = 9;
    wsSummary.getCell(`A${currentRow}`).value = '1. BALANCE GENERAL DE INSUMOS Y DISPENSACIÓN';
    wsSummary.getCell(`A${currentRow}`).font = { size: 12, bold: true, color: { argb: 'FF1E3A8A' } };
    currentRow++;

    const productHeaders = ['Casillero', 'Producto', 'Capacidad Máx.', 'Stock Actual', 'Precio Unitario', 'Rotación'];
    wsSummary.getRow(currentRow).values = productHeaders;
    wsSummary.getRow(currentRow).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    wsSummary.getRow(currentRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    currentRow++;

    lockers.forEach(l => {
      const price = parseFloat(l.price) || 0;
      wsSummary.getRow(currentRow).values = [
        `#${l.locker_number}`,
        l.product_name || 'Sin Asignar',
        l.max_capacity,
        l.current_stock,
        price,
        l.status === 'available' ? 'Operativo' : 'Mantenimiento'
      ];
      wsSummary.getCell(`E${currentRow}`).numFmt = '$#,##0.00';
      currentRow++;
    });

    currentRow += 2;

    // Sección B: Actividad por Usuario / Operador
    wsSummary.getCell(`A${currentRow}`).value = '2. ACTIVIDAD REGISTRADA POR USUARIO';
    wsSummary.getCell(`A${currentRow}`).font = { size: 12, bold: true, color: { argb: 'FF1E3A8A' } };
    currentRow++;

    wsSummary.getRow(currentRow).values = ['Usuario', 'Rol de Acceso', 'Operaciones Realizadas', 'Total Insumos Retirados'];
    wsSummary.getRow(currentRow).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    wsSummary.getRow(currentRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0284C7' } };
    currentRow++;

    userActivity.forEach(u => {
      wsSummary.getRow(currentRow).values = [
        u.username,
        u.role.toUpperCase(),
        u.total_operations,
        u.total_items
      ];
      currentRow++;
    });

    wsSummary.columns = [
      { width: 14 },
      { width: 30 },
      { width: 18 },
      { width: 18 },
      { width: 18 },
      { width: 18 },
      { width: 25 }
    ];

    // ========================================================
    // HOJA 2: BITÁCORA DETALLADA DE MOVIMIENTOS
    // ========================================================
    const wsLogs = workbook.addWorksheet('Bitácora de Movimientos', {
      views: [{ showGridLines: true }]
    });

    wsLogs.mergeCells('A1:L1');
    const logsHeader = wsLogs.getCell('A1');
    logsHeader.value = 'BITÁCORA TRANSACCIONAL DETALLADA DE CASILLEROS';
    logsHeader.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    logsHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    logsHeader.alignment = { horizontal: 'center', vertical: 'middle' };
    wsLogs.getRow(1).height = 30;

    const logHeaders = [
      'Folio ID',
      'Fecha / Hora',
      'Casillero',
      'Insumo',
      'Tipo Acción',
      'Cantidad',
      'P. Unitario',
      'Subtotal',
      'Stock Antes',
      'Stock Después',
      'Usuario',
      'Rol'
    ];

    wsLogs.getRow(2).values = logHeaders;
    wsLogs.getRow(2).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    wsLogs.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    wsLogs.getRow(2).height = 24;

    let logRowIdx = 3;
    recentLogs.forEach((r, idx) => {
      const unitPrice = parseFloat(r.price) || 0;
      const qty = Math.abs(r.quantity_changed);
      const subtotal = unitPrice * qty;

      const row = wsLogs.getRow(logRowIdx);
      row.values = [
        r.id,
        new Date(r.created_at).toLocaleString(),
        `Casillero #${r.locker_number}`,
        r.product_name,
        r.action_type,
        qty,
        unitPrice,
        subtotal,
        r.stock_before,
        r.stock_after,
        r.username,
        r.role
      ];

      // Formato moneda
      wsLogs.getCell(`G${logRowIdx}`).numFmt = '$#,##0.00';
      wsLogs.getCell(`H${logRowIdx}`).numFmt = '$#,##0.00';

      // Cebra para legibilidad
      if (idx % 2 === 0) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }

      logRowIdx++;
    });

    wsLogs.columns = [
      { width: 10 },
      { width: 22 },
      { width: 16 },
      { width: 28 },
      { width: 18 },
      { width: 12 },
      { width: 14 },
      { width: 14 },
      { width: 14 },
      { width: 14 },
      { width: 20 },
      { width: 14 }
    ];

    // 4. Guardar archivo en disco y retornar Buffer
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `Reporte_Auditoria_EDCAM_${timestamp}.xlsx`;
    const filePath = path.join(REPORTS_DIR, filename);

    await workbook.xlsx.writeFile(filePath);
    const buffer = await workbook.xlsx.writeBuffer();

    logger.info('REPORTES', `Archivo Excel generado con éxito: ${filename} (${buffer.length} bytes)`);

    return {
      filename,
      filePath,
      buffer,
      stats: {
        totalRevenue: totalRevenueAmount,
        totalUnits: totalWithdrawnUnits,
        starProduct,
        totalTransactions,
        recentCount: recentLogs.length,
        daysAnalyzed: days
      }
    };
  }
};

module.exports = ReportGeneratorService;
