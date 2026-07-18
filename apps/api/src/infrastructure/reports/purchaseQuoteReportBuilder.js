import ExcelJS from 'exceljs';
import {
  createDoc, finalize, safe, drawHeader, drawSectionTitle, drawKpiCards, drawDataTable,
} from './pdfTemplate.js';

const statusAr = {
  NOT_SENT: 'لم يرسل', SENT: 'تم الإرسال', OPENED: 'فتح الرابط',
  QUOTED: 'تم التسعير', EXPIRED: 'منتهي', LOCKED: 'مقفل', REOPENED: 'معاد فتحه',
};
const numberEn = (value) => Number(value || 0).toLocaleString('en-US');

const rowsOf = (purchase) => (purchase.suppliers || []).flatMap((supplier) => {
  const lines = supplier.lines?.length ? supplier.lines : (purchase.items || []).map((item) => ({
    materialName: item.materialName,
    requestedQty: item.requestedQty,
  }));
  return lines.map((line) => ({
    requestNo: purchase.requestNo,
    supplier: supplier.companyName || supplier.supplierName || '-',
    status: statusAr[supplier.status] || supplier.status,
    material: line.materialName || '-',
    requestedQty: Number(line.requestedQty || 0),
    offeredQty: Number(line.offeredQty || 0),
    unitPrice: Number(line.unitPrice || 0),
    total: Number(line.totalPrice || 0),
    currency: supplier.currency || 'IQD',
  }));
});

export const buildPurchaseQuotePdf = async (purchase) => {
  const quoted = (purchase.suppliers || []).filter((item) => item.status === 'QUOTED').length;
  const ctx = createDoc({ title: `طلبات التسعير - ${safe(purchase.requestNo)}`, fontScale: 1.16 });
  drawHeader(ctx, {
    title: 'طلب عرض سعر',
    subtitle: safe(purchase.reason || purchase.projectName || 'طلب تسعير مواد'),
    reportId: safe(purchase.requestNo),
    dateText: new Date().toLocaleString('en-GB'),
  });
  drawKpiCards(ctx, [
    { label: 'الموردون', value: `${(purchase.suppliers || []).length}` },
    { label: 'تم التسعير', value: `${quoted}` },
    { label: 'المواد', value: `${(purchase.items || []).length}` },
  ], { englishDigits: true });

  for (const supplier of purchase.suppliers || []) {
    const supplierName = supplier.companyName || supplier.supplierName || '-';
    const currency = supplier.currency || 'IQD';
    const lines = supplier.lines?.length ? supplier.lines : (purchase.items || []).map((item) => ({
      materialName: item.materialName, requestedQty: item.requestedQty, offeredQty: 0, unitPrice: 0, totalPrice: 0,
    }));
    drawSectionTitle(ctx, `${supplierName} — ${statusAr[supplier.status] || supplier.status}`);
    drawDataTable(ctx, {
      headers: ['#', 'المادة المطلوبة', 'الكمية المطلوبة', 'الكمية المتوفرة', 'سعر الوحدة', 'المجموع', 'العملة'],
      colWidths: [0.05, 0.28, 0.13, 0.13, 0.14, 0.17, 0.10],
      englishDigits: true,
      rows: lines.map((line, index) => [
        `${index + 1}`, safe(line.materialName), numberEn(line.requestedQty), numberEn(line.offeredQty),
        numberEn(line.unitPrice), numberEn(line.totalPrice), currency,
      ]),
    });
    const materialsTotal = lines.reduce((sum, line) => sum + Number(line.totalPrice || 0), 0);
    const grandTotal = materialsTotal + Number(supplier.deliveryFee || 0);
    const totalY = ctx.doc.y;
    const valueWidth = ctx.CW * 0.45;
    ctx.doc.roundedRect(ctx.ML, totalY - 3, ctx.CW, 25, 4).fillAndStroke('#f5f9fd', '#c8d6e5');
    ctx.doc.font(ctx.FB).fontSize(10).fillColor('#152f61');
    ctx.doc.text('إجمالي عرض المورد:', ctx.ML + valueWidth, totalY + 4, { width: ctx.CW - valueWidth - 10, align: 'right', features: ['arab'] });
    ctx.doc.font(ctx.FB).fontSize(11).fillColor('#152f61');
    ctx.doc.text(`${numberEn(grandTotal)} ${currency}`, ctx.ML + 10, totalY + 4, { width: valueWidth - 10, align: 'left', features: [] });
    ctx.doc.y = totalY + 25;
    ctx.doc.moveDown(0.8);
  }
  return finalize(ctx);
};

export const buildPurchaseQuoteExcel = async (purchase) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('طلبات التسعير', { views: [{ rightToLeft: true }] });
  sheet.columns = [
    { header: 'رقم الطلب', key: 'requestNo', width: 18 }, { header: 'المورد', key: 'supplier', width: 26 },
    { header: 'الحالة', key: 'status', width: 18 }, { header: 'المادة', key: 'material', width: 28 },
    { header: 'الكمية المطلوبة', key: 'requestedQty', width: 16 }, { header: 'الكمية المتوفرة', key: 'offeredQty', width: 16 },
    { header: 'سعر الوحدة', key: 'unitPrice', width: 16 }, { header: 'المجموع', key: 'total', width: 18 },
    { header: 'العملة', key: 'currency', width: 12 },
  ];
  sheet.addRows(rowsOf(purchase));
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF152F61' } };
  sheet.autoFilter = { from: 'A1', to: 'I1' };
  return workbook.xlsx.writeBuffer();
};
