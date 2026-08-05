import {
  COLORS,
  createDoc,
  drawHeader,
  drawSectionTitle,
  finalize,
  safe,
} from './pdfTemplate.js';

const LRM = '\u200e';

const formatDateTimeLtr = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return `${date.toLocaleDateString('en-GB')} ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
};

const money = (value, currency = 'IQD') => {
  const amount = Number(value || 0);
  const rendered = Number.isFinite(amount) ? amount.toLocaleString('en-US') : '0';
  return `${LRM}${rendered} ${currency || 'IQD'}${LRM}`;
};

const stabilizeMixedDirection = (value) =>
  safe(value)
    .replace(/([0-9][0-9,.:/_-]*)/g, `${LRM}$1${LRM}`)
    .replace(/([A-Za-z][A-Za-z0-9,.:/_-]*)/g, `${LRM}$1${LRM}`);

const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
const tens = ['', 'عشرة', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const teens = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
const hundreds = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

const underThousandToWords = (value) => {
  const number = Number(value || 0);
  const parts = [];
  const hundred = Math.floor(number / 100);
  const remainder = number % 100;

  if (hundred) parts.push(hundreds[hundred]);
  if (remainder) {
    if (remainder < 10) {
      parts.push(ones[remainder]);
    } else if (remainder < 20) {
      parts.push(teens[remainder - 10]);
    } else {
      const one = remainder % 10;
      const ten = Math.floor(remainder / 10);
      parts.push(one ? `${ones[one]} و${tens[ten]}` : tens[ten]);
    }
  }

  return parts.join(' و');
};

const scaleToWords = (value, singular, dual, plural) => {
  if (!value) return '';
  if (value === 1) return singular;
  if (value === 2) return dual;
  if (value >= 3 && value <= 10) return `${underThousandToWords(value)} ${plural}`;
  return `${underThousandToWords(value)} ${singular}`;
};

const numberToArabicWords = (value) => {
  const number = Math.floor(Math.abs(Number(value || 0)));
  if (!number) return 'صفر';

  const billions = Math.floor(number / 1000000000);
  const millions = Math.floor((number % 1000000000) / 1000000);
  const thousands = Math.floor((number % 1000000) / 1000);
  const rest = number % 1000;

  return [
    scaleToWords(billions, 'مليار', 'ملياران', 'مليارات'),
    scaleToWords(millions, 'مليون', 'مليونان', 'ملايين'),
    scaleToWords(thousands, 'ألف', 'ألفان', 'آلاف'),
    underThousandToWords(rest),
  ].filter(Boolean).join(' و');
};

const currencyName = (currency = 'IQD') => (currency === 'USD' ? 'دولار أمريكي' : 'دينار عراقي');
const amountInWords = (amount, currency) => `فقط ${numberToArabicWords(amount)} ${currencyName(currency)} لا غير`;

const drawReceiptRow = (ctx, rightLabel, rightValue, leftLabel, leftValue, { rightLtr = false, leftLtr = false } = {}) => {
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
    doc.text(ltr ? `${LRM}${safe(value)}${LRM}` : stabilizeMixedDirection(value), x + 10, y + 22, {
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

const drawFullBox = (ctx, label, value, { ltr = false } = {}) => {
  if (!value) return;
  const { doc, F, FB, ML, CW } = ctx;
  const y = doc.y;
  const boxH = 48;

  doc.roundedRect(ML, y, CW, boxH, 4).fillAndStroke(COLORS.paleBlue, COLORS.border);
  doc.font(FB).fontSize(8).fillColor(COLORS.soft);
  doc.text(label, ML + 10, y + 7, { width: CW - 20, align: 'right', features: ['arab'] });
  doc.font(F).fontSize(10).fillColor(COLORS.text);
  doc.text(ltr ? `${LRM}${safe(value)}${LRM}` : stabilizeMixedDirection(value), ML + 10, y + 24, {
    width: CW - 20,
    align: ltr ? 'left' : 'right',
    features: ltr ? [] : ['arab'],
  });
  doc.y = y + boxH + 8;
};

export const buildCustomerReceiptPdfBuffer = async ({ receipt }) => {
  const ctx = createDoc({ margin: 42, size: 'A4' });

  drawHeader(ctx, {
    title: 'سند استلام مبلغ من زبون',
    subtitle: receipt.receiptNo || '',
    dateText: `${LRM}${formatDateTimeLtr(new Date())}${LRM}`,
  });

  drawSectionTitle(ctx, 'تفاصيل السند');
  drawReceiptRow(ctx, 'رقم السند', receipt.receiptNo, 'تاريخ الاستلام', formatDateTimeLtr(receipt.receiptDate), {
    rightLtr: true,
    leftLtr: true,
  });
  drawReceiptRow(ctx, 'اسم الزبون', receipt.customerName || receipt.customer?.name, 'المشروع', receipt.project?.name || '-');
  drawReceiptRow(ctx, 'المبلغ رقماً', money(receipt.amount, receipt.currency), 'المستلم', receipt.receivedBy?.fullName || '-', {
    rightLtr: true,
  });
  drawFullBox(ctx, 'المبلغ كتابةً', amountInWords(receipt.amount, receipt.currency));
  drawReceiptRow(ctx, 'أضيف بواسطة', receipt.createdBy?.fullName || '-', 'العملة', currencyName(receipt.currency));

  if (receipt.details) {
    drawSectionTitle(ctx, 'تفاصيل المبلغ');
    drawFullBox(ctx, 'التفاصيل', receipt.details);
  }

  if (receipt.notes) {
    drawSectionTitle(ctx, 'ملاحظات');
    drawFullBox(ctx, 'الملاحظات', receipt.notes);
  }

  drawSectionTitle(ctx, 'التواقيع');
  drawReceiptRow(ctx, 'توقيع المستلم', '________________', 'توقيع الزبون', '________________', {
    rightLtr: true,
    leftLtr: true,
  });

  return finalize(ctx);
};
