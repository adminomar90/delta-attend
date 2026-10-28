import { createDoc, drawHeader, drawKpiCards, COLORS } from './pdfTemplate.js';

const units = { PIECE: 'قطعة', METER: 'متر', ROLL: 'لفة', KG: 'كغم', TON: 'طن', LITER: 'لتر', SQM: 'م²', BOX: 'صندوق', SET: 'طقم', BAG: 'كيس', PAIR: 'زوج', CARTON: 'كارتون' };
const statuses = { OPEN: 'مفتوحة', PARTIALLY_RECONCILED: 'مصفاة جزئياً', PENDING_RECONCILIATION: 'بانتظار التصفية', OVERDUE: 'متأخرة', FULLY_RECONCILED: 'مصفاة بالكامل', CLOSED: 'مغلقة' };
const qty = (value) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(Number(value || 0));
const date = (value) => value ? new Date(value).toLocaleDateString('en-GB', { timeZone: 'Asia/Baghdad' }) : '-';
const text = (value) => String(value ?? '').trim() || '-';

// Fontkit shapes an Arabic line right-to-left. Keep embedded codes and numbers readable.
export const prepareCustodyPdfLine = (value) => /[\u0621-\u064A]/.test(value)
  ? value.replace(/[A-Za-z0-9\u0660-\u0669\u06F0-\u06F9][A-Za-z0-9\u0660-\u0669\u06F0-\u06F9.,:/+_%#@-]*/g, (run) => [...run].reverse().join(''))
  : value;

export const buildTechnicianCustodyPdfBuffer = async ({ holder, custodies, includeClosed = false, single = false }) => {
  const ctx = createDoc({ title: `كشف ذمم - ${holder.fullName}` });
  const { doc, F, FB, ML, CW, BOTTOM } = ctx;
  const wrap = (value, width) => text(value).split('\n').flatMap((paragraph) => {
    const lines = []; let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && doc.widthOfString(candidate, { features: ['arab'] }) > width) { lines.push(line); line = word; }
      else line = candidate;
    }
    lines.push(line); return lines;
  });
  const write = (value, x, y, width, options = {}) => {
    const lineHeight = doc.currentLineHeight(true) + 1;
    wrap(value, width).forEach((line, index) => doc.text(prepareCustodyPdfLine(line), x, y + index * lineHeight, { width, align: 'right', features: ['arab'], lineBreak: false, ...options }));
  };
  const section = (title) => {
    if (doc.y + 55 > BOTTOM) doc.addPage();
    const y = doc.y;
    doc.roundedRect(ML, y, CW, 28, 4).fill(COLORS.lightBlue);
    doc.font(FB).fontSize(11).fillColor(COLORS.navy);
    write(title, ML + 10, y + 5, CW - 20);
    doc.y = y + 35;
  };
  drawHeader(ctx, { title: 'كشف ذمم المواد', subtitle: 'إدارة المخازن | ملف ذمة الفني', reportId: 'CUSTODY STATEMENT', dateText: new Date().toLocaleString('en-GB', { timeZone: 'Asia/Baghdad' }) });
  doc.font(FB).fontSize(16).fillColor(COLORS.navy);
  write(holder.fullName, ML, doc.y + 2, CW);
  doc.moveDown(0.4);
  doc.font(F).fontSize(9).fillColor(COLORS.soft);
  write(`الرقم الوظيفي: ${holder.employeeCode || '-'}     |     الهاتف: ${holder.phone || '-'}`, ML, doc.y, CW);
  doc.moveDown(0.8);
  doc.font(F).fontSize(8).fillColor(COLORS.soft);
  write(single ? 'نطاق الكشف: ذمة واحدة' : includeClosed ? 'نطاق الكشف: جميع الذمم، بما فيها المغلقة والمصفاة' : 'نطاق الكشف: الذمم المفتوحة وغير المصفاة', ML, doc.y, CW);
  doc.moveDown(0.8);
  const allItems = custodies.flatMap((custody) => custody.items || []);
  drawKpiCards(ctx, [
    { label: 'ذمم في الكشف', value: String(custodies.length) },
    { label: 'بنود المواد', value: String(allItems.length) },
    { label: 'بنود بكمية متبقية', value: String(allItems.filter((item) => Number(item.remainingQty) > 0).length) },
    { label: 'مشاريع', value: String(new Set(custodies.map((custody) => custody.project?.name || custody.manualProjectName || 'بدون مشروع')).size) },
  ].reverse(), { englishDigits: true });

  // Columns are positioned from the right; headers repeat after every page break.
  const columns = [
    ['المادة', 0.32], ['الوحدة', 0.08], ['المسحوب', 0.11], ['المستهلك', 0.11],
    ['الراجع', 0.10], ['تالف / مفقود', 0.15], ['المتبقي', 0.13],
  ];
  const row = (values, y, height, header = false, alternate = false) => {
    doc.rect(ML, y, CW, height).fill(header ? COLORS.navy : alternate ? COLORS.paleBlue : COLORS.white);
    let right = ML + CW;
    columns.forEach(([, fraction], index) => {
      const width = CW * fraction; right -= width;
      doc.font(F).fontSize(header ? 9 : 9).fillColor(header ? COLORS.white : COLORS.text);
      write(values[index], right + 5, y + 7, width - 10, { align: index === 0 ? 'right' : 'center' });
      if (!header) doc.moveTo(right, y + height).lineTo(right + width, y + height).strokeColor(COLORS.border).lineWidth(0.4).stroke();
    });
    doc.y = y + height;
  };
  const heading = () => row(columns.map(([label]) => label), doc.y, 36, true);
  for (const custody of custodies) {
    if (doc.y + 155 > BOTTOM) doc.addPage();
    section(`ذمة رقم ${custody.custodyNo}`);
    doc.font(F).fontSize(9).fillColor(COLORS.text);
    write(`المشروع: ${custody.project?.name || custody.manualProjectName || '-'}     |     الحالة: ${statuses[custody.status] || custody.status}`, ML, doc.y, CW);
    doc.moveDown(0.45);
    write(`تاريخ الصرف: ${date(custody.openedAt || custody.createdAt)}     |     رقم الطلب: ${custody.request?.requestNo || '-'}`, ML, doc.y, CW);
    doc.moveDown(0.7);
    heading();
    for (const [index, item] of (custody.items || []).entries()) {
      const name = item.materialName || item.material?.name || '-';
      const code = item.material?.code;
      const values = [code ? `${name}\n${code}` : name, units[item.unit] || item.unit || '-', qty(item.receivedQty), qty(item.consumedQty), qty(item.returnedQty), qty(Number(item.damagedQty || 0) + Number(item.lostQty || 0)), qty(item.remainingQty)];
      doc.font(F).fontSize(9);
      const height = Math.max(35, ...values.map((value, i) => wrap(value, CW * columns[i][1] - 10).length * (doc.currentLineHeight(true) + 1) + 16));
      if (doc.y + height > BOTTOM) {
        doc.addPage();
        section(`تابع الذمة ${custody.custodyNo}`);
        heading();
      }
      row(values, doc.y, height, false, index % 2 === 1);
    }
    doc.y += 16;
  }
  if (doc.y + 75 > BOTTOM) doc.addPage();
  doc.font(F).fontSize(8).fillColor(COLORS.soft);
  write('الكميات موضحة حسب وحدة كل مادة. التالف والمفقود معروضان في عمود واحد.', ML, doc.y, CW);
  doc.y += 30;
  doc.font(FB).fontSize(9).fillColor(COLORS.navy);
  write('توقيع مستلم المواد: __________________     توقيع مسؤول المخزن: __________________', ML, doc.y, CW);
  // Footer text belongs below the content margin; avoid automatic blank footer pages.
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    const pages = doc.bufferedPageRange();
    for (let page = pages.start; page < pages.start + pages.count; page++) {
      doc.switchToPage(page); doc.page.margins.bottom = 0;
      const y = doc.page.height - 26;
      doc.rect(0, y, ctx.PW, 26).fill(COLORS.navy); doc.rect(0, y, ctx.PW, 1.5).fill(COLORS.gold);
      doc.font(F).fontSize(7).fillColor('#c8d6e5');
      write('DELTA PLUS', ML, y + 7, CW * 0.3, { align: 'left' });
      write('كشف ذمم المواد', ML + CW * 0.3, y + 7, CW * 0.4, { align: 'center' });
      write(`${page + 1} / ${pages.count}`, ML + CW * 0.7, y + 7, CW * 0.3);
    }
    doc.end();
  });
};
