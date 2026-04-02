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

export const buildFinancialDisbursementPdfBuffer = async ({
  request,
  transactionRequests = [],
  generatedAt = new Date(),
  publicBaseUrl = '',
  uploadRootDir = '',
} = {}) => {
  const items = sortTransactionItems(transactionRequests?.length ? transactionRequests : [request].filter(Boolean));
  const primary = request || items[0] || {};
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
