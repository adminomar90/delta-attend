import {
  COLORS,
  createDoc,
  drawHeader,
  drawImageFrame,
  drawSectionTitle,
  finalize,
  resolveImageUrl,
  resolveLocalImagePath,
  safe,
} from './pdfTemplate.js';

const LRM = '\u200e';
const money = (value, currency = 'IQD') => `${LRM}${Number(value || 0).toLocaleString('en-US')} ${currency || 'IQD'}${LRM}`;
const dateText = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return `${LRM}${date.toLocaleDateString('en-GB')}${LRM}`;
};

const paymentLabel = {
  CASH: 'نقدي',
  CREDIT: 'آجل',
  PARTIAL: 'تسديد جزئي',
};

const isImageAttachment = (attachment = {}) => {
  const mimeType = String(attachment.mimeType || '').toLowerCase();
  const target = `${String(attachment.originalName || '').toLowerCase()} ${String(attachment.url || '').toLowerCase()}`;
  return mimeType.startsWith('image/')
    || /\.(jpg|jpeg|png|webp|gif|bmp|heic|heif)$/i.test(target);
};

const drawRow = (ctx, rightLabel, rightValue, leftLabel, leftValue, { rightLtr = false, leftLtr = false } = {}) => {
  const { doc, F, FB, ML, CW } = ctx;
  const y = doc.y;
  const gap = 10;
  const boxW = (CW - gap) / 2;
  const boxH = 42;
  const drawBox = (x, label, value, ltr = false) => {
    doc.roundedRect(x, y, boxW, boxH, 4).fillAndStroke(COLORS.paleBlue, COLORS.border);
    doc.font(FB).fontSize(8).fillColor(COLORS.soft);
    doc.text(label, x + 10, y + 6, { width: boxW - 20, align: 'right', features: ['arab'] });
    doc.font(F).fontSize(10).fillColor(COLORS.text);
    doc.text(ltr ? `${LRM}${safe(value)}${LRM}` : safe(value), x + 10, y + 22, {
      width: boxW - 20,
      align: ltr ? 'left' : 'right',
      features: ltr ? [] : ['arab'],
      lineBreak: false,
    });
  };
  drawBox(ML + boxW + gap, rightLabel, rightValue, rightLtr);
  drawBox(ML, leftLabel, leftValue, leftLtr);
  doc.y = y + boxH + 8;
};

const drawFullBox = (ctx, label, value) => {
  if (!value) return;
  const { doc, F, FB, ML, CW } = ctx;
  const y = doc.y;
  const boxH = 48;
  doc.roundedRect(ML, y, CW, boxH, 4).fillAndStroke(COLORS.paleBlue, COLORS.border);
  doc.font(FB).fontSize(8).fillColor(COLORS.soft);
  doc.text(label, ML + 10, y + 7, { width: CW - 20, align: 'right', features: ['arab'] });
  doc.font(F).fontSize(10).fillColor(COLORS.text);
  doc.text(safe(value), ML + 10, y + 24, { width: CW - 20, align: 'right', features: ['arab'] });
  doc.y = y + boxH + 8;
};

export const buildProjectInvoicePdfBuffer = async ({ invoice, uploadRootDir = '', publicBaseUrl = '' }) => {
  const ctx = createDoc({ title: 'Project Invoice' });
  drawHeader(ctx, {
    title: 'فاتورة مشروع',
    subtitle: invoice.invoiceNo || '',
    dateText: `${LRM}${new Date().toLocaleDateString('en-GB')}${LRM}`,
  });

  drawSectionTitle(ctx, 'بيانات الفاتورة');
  drawRow(ctx, 'رقم الفاتورة', invoice.invoiceNo, 'تاريخ الفاتورة', dateText(invoice.invoiceDate), { rightLtr: true, leftLtr: true });
  drawRow(ctx, 'المشروع', invoice.project?.name || '-', 'المورد', invoice.supplierName || invoice.supplier?.supplierName || '-');
  drawRow(ctx, 'نوع المواد', invoice.materialType, 'طريقة الدفع', paymentLabel[invoice.paymentMethod] || invoice.paymentMethod);

  drawSectionTitle(ctx, 'المبالغ');
  drawRow(ctx, 'مبلغ الفاتورة', money(invoice.invoiceAmount, invoice.currency), 'مبلغ النقل', money(invoice.transportAmount, invoice.currency), { rightLtr: true, leftLtr: true });
  drawRow(ctx, 'الإجمالي', money(invoice.totalAmount, invoice.currency), 'المسدد', money(invoice.paidAmount, invoice.currency), { rightLtr: true, leftLtr: true });
  drawRow(ctx, 'المتبقي', money(invoice.remainingAmount, invoice.currency), 'العملة', invoice.currency || 'IQD', { rightLtr: true, leftLtr: true });

  const originalInvoice = invoice.originalInvoice || {};
  if (originalInvoice.originalName || originalInvoice.url) {
    drawSectionTitle(ctx, 'مرفق الفاتورة الأصلية');
    drawFullBox(ctx, 'اسم الملف', originalInvoice.originalName || originalInvoice.url);

    if (isImageAttachment(originalInvoice)) {
      drawImageFrame(ctx, {
        localPath: resolveLocalImagePath(originalInvoice.url, uploadRootDir),
        fallbackUrl: resolveImageUrl(originalInvoice.url, publicBaseUrl),
        name: originalInvoice.originalName || 'صورة الفاتورة الأصلية',
        comment: '',
        index: 0,
      });
    }
  }

  if (invoice.notes) {
    drawSectionTitle(ctx, 'ملاحظات');
    drawFullBox(ctx, 'الملاحظات', invoice.notes);
  }

  drawSectionTitle(ctx, 'اعتماد داخلي');
  drawRow(ctx, 'أضيف بواسطة', invoice.createdBy?.fullName || '-', 'تاريخ الإضافة', dateText(invoice.createdAt), { leftLtr: true });

  return finalize(ctx);
};
