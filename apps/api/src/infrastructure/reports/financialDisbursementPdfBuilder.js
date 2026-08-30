/**
 * Financial Disbursement PDF — transaction-oriented professional layout.
 */

import {
  createDoc,
  finalize,
  safe,
  fmtDateTime,
  resolveLocalImagePath,
  resolveImageUrl,
  drawHeader,
  drawStatusBadge,
  drawSectionTitle,
  drawTableRow,
  drawKpiCards,
  drawTextBlock,
  drawImageFrame,
  drawDataTable,
  needPage,
  COLORS,
} from './pdfTemplate.js';

const STATUS_MAP = {
  DRAFT: { ar: 'مسودة', bg: COLORS.soft },
  PENDING_PROJECT_MANAGER_APPROVAL: { ar: 'بانتظار اعتماد مدير المشاريع', bg: COLORS.warning },
  PENDING_FINANCIAL_MANAGER_APPROVAL: { ar: 'بانتظار اعتماد المدير المالي', bg: COLORS.warning },
  PENDING_GENERAL_MANAGER_APPROVAL: { ar: 'بانتظار اعتماد المدير العام', bg: COLORS.warning },
  READY_FOR_DISBURSEMENT: { ar: 'جاهز للصرف', bg: COLORS.accent },
  DISBURSED: { ar: 'تم الصرف', bg: COLORS.success },
  CLOSED: { ar: 'مغلق', bg: COLORS.success },
  RETURNED_FOR_REVIEW: { ar: 'معاد للمراجعة', bg: COLORS.warning },
  REJECTED_BY_PROJECT_MANAGER: { ar: 'مرفوض من مدير المشاريع', bg: COLORS.danger },
  REJECTED_BY_FINANCIAL_MANAGER: { ar: 'مرفوض من المدير المالي', bg: COLORS.danger },
  REJECTED_BY_GENERAL_MANAGER: { ar: 'مرفوض من المدير العام', bg: COLORS.danger },
};

const TYPE_LABEL_MAP = {
  TRANSPORT_EXPENSE: 'نقل',
  FOOD_EXPENSE: 'طعام',
  MATERIALS_EXPENSE: 'مواد',
  WORK_ADVANCE: 'سلفة عمل',
  SALARY_ADVANCE: 'سلفة من راتب',
  BUSINESS_EXPENSE: 'مصروف تشغيلي',
  EXCEPTIONAL_EXPENSE: 'مصروف استثنائي',
  TRAVEL_EXPENSE: 'مصروف السفر',
  PURCHASE_REIMBURSEMENT: 'استرداد شراء',
  OTHER: 'أخرى',
};

const toMoney = (value, currency = 'IQD') => {
  const amount = Number(value || 0);
  const normalized = Number.isFinite(amount) ? amount : 0;
  const rendered = Number.isInteger(normalized)
    ? String(normalized)
    : normalized.toFixed(2).replace(/\.?0+$/, '');
  return `${rendered} ${currency || 'IQD'}`;
};

const LRM = '\u200e';

const formatDateTimeLtr = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return `${date.toLocaleDateString('en-GB')} ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
};

const moneyLtr = (value, currency = 'IQD') => {
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

const drawReceiptLikeRow = (ctx, rightLabel, rightValue, leftLabel, leftValue, { rightLtr = false, leftLtr = false } = {}) => {
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

const drawReceiptLikeFullBox = (ctx, label, value, { ltr = false } = {}) => {
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

const isImageAttachment = (attachment = {}) => {
  const mimeType = String(attachment.mimeType || '').toLowerCase();
  const target = `${String(attachment.originalName || '').toLowerCase()} ${String(attachment.url || '').toLowerCase()}`;
  return mimeType.startsWith('image/')
    || /\.(jpg|jpeg|png|webp|gif|bmp|heic|heif)$/i.test(target);
};

const uniqueAttachments = (items = []) => {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    for (const attachment of item.attachments || []) {
      const key = `${attachment.url || ''}::${attachment.originalName || ''}`;
      if (!key.trim() || seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(attachment);
    }
  }

  return result;
};

const sortTransactionItems = (items = []) =>
  [...items].sort((a, b) => {
    const dateDiff = new Date(a.createdAt || a.transactionDate || 0).getTime()
      - new Date(b.createdAt || b.transactionDate || 0).getTime();
    if (dateDiff !== 0) {
      return dateDiff;
    }
    return String(a.requestNo || '').localeCompare(String(b.requestNo || ''), 'en');
  });

const drawTransactionItemCard = (ctx, item, index) => {
  const amount = Number(item.amount || 0);
  const approvedAmount = item.approvedAmount != null ? Number(item.approvedAmount) : null;
  const status = STATUS_MAP[item.status] || {
    ar: safe(item.statusLabel || item.status),
    bg: COLORS.warning,
  };

  needPage(ctx, 150);
  drawSectionTitle(ctx, `تفاصيل البند ${index + 1}`);

  let rowIndex = 0;
  drawTableRow(ctx, 'رقم الطلب', safe(item.requestNo), rowIndex++);
  drawTableRow(ctx, 'نوع الصرف', safe(TYPE_LABEL_MAP[item.requestType] || item.requestType), rowIndex++);
  drawTableRow(ctx, 'المبلغ', toMoney(amount, item.currency), rowIndex++);
  drawTableRow(
    ctx,
    'المبلغ المعتمد',
    approvedAmount != null ? toMoney(approvedAmount, item.currency) : 'غير محدد بعد',
    rowIndex++,
  );
  drawTableRow(ctx, 'الحالة', safe(item.statusLabel || status.ar), rowIndex++);
  drawTableRow(ctx, 'تاريخ المعاملة', item.transactionDate ? fmtDateTime(item.transactionDate) : '-', rowIndex++);

  drawTextBlock(ctx, 'تفاصيل البند', safe(item.description));
  drawTextBlock(ctx, 'الملاحظات', safe(item.notes));
};

const buildProjectAdvanceReceiptPdfBuffer = async ({
  request,
  generatedAt = new Date(),
} = {}) => {
  const amount = request?.approvedAmount != null ? Number(request.approvedAmount) : Number(request?.amount || 0);
  const currency = request?.currency || 'IQD';
  const status = STATUS_MAP[request?.status] || {
    ar: safe(request?.statusLabel || request?.status),
    bg: COLORS.warning,
  };

  const ctx = createDoc({ margin: 42, size: 'A4', title: `سند سلفة مشروع - ${safe(request?.requestNo)}` });

  drawHeader(ctx, {
    title: 'سند سلفة مصروفة على مشروع',
    subtitle: request?.requestNo || '',
    dateText: `${LRM}${formatDateTimeLtr(generatedAt)}${LRM}`,
  });

  drawStatusBadge(ctx, { label: safe(request?.statusLabel || status.ar), color: status.bg });

  drawSectionTitle(ctx, 'تفاصيل السند');
  drawReceiptLikeRow(ctx, 'رقم المعاملة', request?.requestNo || '-', 'تاريخ السلفة', formatDateTimeLtr(request?.transactionDate || request?.createdAt), {
    rightLtr: true,
    leftLtr: true,
  });
  drawReceiptLikeRow(ctx, 'اسم المشروع', request?.project?.name || '-', 'رمز المشروع', request?.project?.code || '-', {
    leftLtr: true,
  });
  drawReceiptLikeRow(ctx, 'الموظف المستلف', request?.advanceRecipient?.fullName || '-', 'طالب السلفة', request?.employee?.fullName || '-');
  drawReceiptLikeRow(ctx, 'المبلغ رقماً', moneyLtr(amount, currency), 'الحالة', request?.statusLabel || status.ar, {
    rightLtr: true,
  });
  drawReceiptLikeFullBox(ctx, 'المبلغ كتابةً', amountInWords(amount, currency));
  drawReceiptLikeRow(ctx, 'العملة', currencyName(currency), 'نوع المعاملة', TYPE_LABEL_MAP.WORK_ADVANCE);

  if (request?.description) {
    drawSectionTitle(ctx, 'تفاصيل السلفة');
    drawReceiptLikeFullBox(ctx, 'التفاصيل', request.description);
  }

  if (request?.notes) {
    drawSectionTitle(ctx, 'ملاحظات');
    drawReceiptLikeFullBox(ctx, 'الملاحظات', request.notes);
  }

  drawSectionTitle(ctx, 'التواقيع');
  drawReceiptLikeRow(ctx, 'توقيع الموظف المستلف', '________________', 'توقيع المدير المالي', '________________', {
    rightLtr: true,
    leftLtr: true,
  });
  drawReceiptLikeRow(ctx, 'توقيع مدير المشروع', '________________', 'توقيع المدير العام', '________________', {
    rightLtr: true,
    leftLtr: true,
  });

  return finalize(ctx, { footerLabel: 'سند سلفة مشروع رسمي — Delta Plus' });
};

export const buildFinancialDisbursementPdfBuffer = async ({
  request,
  transactionRequests = [],
  generatedAt = new Date(),
  publicBaseUrl = '',
  uploadRootDir = '',
} = {}) => {
  const items = sortTransactionItems(transactionRequests?.length ? transactionRequests : [request].filter(Boolean));
  const primary = request || items[0] || {};
  if (primary.isProjectAdvance && items.length <= 1) {
    return buildProjectAdvanceReceiptPdfBuffer({ request: primary, generatedAt });
  }

  const currency = primary.currency || items[0]?.currency || 'IQD';
  const transactionNo = primary.transactionNo || primary.requestNo || '-';
  const employeeName = primary.employee?.fullName || items[0]?.employee?.fullName || '-';

  const requestedTotal = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const calculatedTransactionTotal = items.length > 0
    ? requestedTotal
    : Number(primary.transactionTotalAmount || 0);
  const finalSpendTotal = items.reduce(
    (sum, item) => sum + Number(item.approvedAmount != null ? item.approvedAmount : item.amount || 0),
    0,
  );
  const attachments = uniqueAttachments(items);
  const imageAttachments = attachments.filter(isImageAttachment);
  const otherAttachments = attachments.filter((attachment) => !isImageAttachment(attachment));

  const ctx = createDoc({ title: `مستند معاملة صرف مالي - ${safe(transactionNo)}` });

  drawHeader(ctx, {
    title: 'مستند معاملة صرف مالي',
    subtitle: `${safe(employeeName)} — رقم المعاملة ${safe(transactionNo)}`,
    reportId: safe(transactionNo),
    date: generatedAt,
  });

  const currentStatus = STATUS_MAP[primary.status] || {
    ar: safe(primary.statusLabel || primary.status),
    bg: COLORS.warning,
  };
  drawStatusBadge(ctx, { label: currentStatus.ar, color: currentStatus.bg });

  drawKpiCards(ctx, [
    { label: 'إجمالي المجموع الكلي', value: toMoney(calculatedTransactionTotal, currency) },
    { label: 'مجموع الصرف الكلي', value: toMoney(finalSpendTotal, currency) },
    { label: 'عدد البنود', value: String(items.length || 1) },
    { label: 'عدد المرفقات', value: String(attachments.length) },
  ]);

  drawSectionTitle(ctx, 'ملخص المعاملة');
  let summaryIndex = 0;
  drawTableRow(ctx, 'رقم المعاملة', safe(transactionNo), summaryIndex++);
  drawTableRow(ctx, 'التاريخ', primary.transactionDate ? fmtDateTime(primary.transactionDate) : '-', summaryIndex++);
  drawTableRow(ctx, 'الموظف', safe(employeeName), summaryIndex++);
  drawTableRow(ctx, 'العملة', safe(currency), summaryIndex++);
  drawTableRow(ctx, 'الحالة الحالية', safe(primary.statusLabel || currentStatus.ar), summaryIndex++);
  drawTableRow(ctx, 'إجمالي المجموع الكلي المحتسب من البنود', toMoney(calculatedTransactionTotal, currency), summaryIndex++);

  drawSectionTitle(ctx, `تفاصيل رقم المعاملة ${safe(transactionNo)}`);
  items.forEach((item, index) => {
    drawTransactionItemCard(ctx, item, index);
  });

  drawSectionTitle(ctx, `مرفقات المعاملة (${attachments.length})`);
  if (!attachments.length) {
    drawTextBlock(ctx, 'تنبيه', 'لا توجد مرفقات مضافة لهذه المعاملة.');
  } else {
    if (imageAttachments.length) {
      drawTextBlock(ctx, 'الصور المرفقة', `تم إرفاق ${imageAttachments.length} صورة ضمن هذه المعاملة.`);
      imageAttachments.forEach((attachment, index) => {
        const localPath = resolveLocalImagePath(attachment.url, uploadRootDir);
        const fallbackUrl = resolveImageUrl(attachment.url, publicBaseUrl);
        drawImageFrame(ctx, {
          localPath,
          fallbackUrl,
          name: `صورة مرفقة ${index + 1}`,
          comment: '',
          index,
        });
      });
    }

    if (otherAttachments.length) {
      drawSectionTitle(ctx, 'مرفقات أخرى');
      drawDataTable(ctx, {
        headers: ['#', 'نوع الملف', 'الاسم', 'الحجم'],
        rows: otherAttachments.map((attachment, index) => ([
          `${index + 1}`,
          safe(attachment.mimeType || 'مستند'),
          safe(attachment.originalName || `مرفق ${index + 1}`),
          toMoney(Number(attachment.size || 0) / (1024 * 1024), 'MB'),
        ])),
        colWidths: [0.08, 0.32, 0.42, 0.18],
      });
    }
  }

  drawSectionTitle(ctx, 'الخلاصة المالية');
  drawKpiCards(ctx, [
    { label: 'إجمالي المجموع الكلي', value: toMoney(calculatedTransactionTotal, currency) },
    { label: 'مجموع الصرف الكلي', value: toMoney(finalSpendTotal, currency) },
  ]);
  drawTextBlock(
    ctx,
    'ملخص نهائي',
    `تم احتساب إجمالي المجموع الكلي بجمع مبالغ ${items.length} بند مباشرة، وبلغ ${toMoney(calculatedTransactionTotal, currency)}، بينما بلغ مجموع الصرف الكلي ${toMoney(finalSpendTotal, currency)} مع ${attachments.length} مرفق.`,
  );

  return finalize(ctx, { footerLabel: 'مستند معاملة الصرف المالي الرسمي — Delta Plus' });
};
