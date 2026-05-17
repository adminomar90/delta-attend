import {
  COLORS,
  createDoc,
  drawDataTable,
  drawHeader,
  drawImageFrame,
  drawKpiCards,
  drawSectionTitle,
  drawStatusBadge,
  drawTableRow,
  drawTextBlock,
  finalize,
  fmtDateTime,
  needPage,
  resolveImageUrl,
  resolveLocalImagePath,
  safe,
} from './pdfTemplate.js';

const statusStyle = {
  AWAITING_SCHEDULE: { ar: 'بانتظار تحديد الموعد', bg: COLORS.warning },
  SCHEDULED: { ar: 'تم تحديد الموعد', bg: COLORS.accent },
  IN_INSPECTION: { ar: 'قيد الكشف', bg: COLORS.warning },
  INSPECTION_COMPLETED: { ar: 'تم إكمال الكشف', bg: COLORS.success },
  AWAITING_DAILY_PLAN: { ar: 'بانتظار تفعيل بلان العمل', bg: COLORS.warning },
  IN_EXECUTION: { ar: 'قيد التنفيذ', bg: COLORS.accent },
  CLOSED: { ar: 'مكتملة / مغلقة', bg: COLORS.success },
};

const valueText = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean).join('، ') || '-';
  if (value && typeof value === 'object') return Object.values(value).filter(Boolean).join('، ') || '-';
  return safe(value);
};

const fixMaterialNumbersForPdf = (value) =>
  String(value ?? '').replace(/\d+/g, (digits) => digits.split('').reverse().join(''));

const toRows = (entries = []) =>
  entries
    .map(([label, value]) => [label, valueText(value)])
    .filter(([, value]) => value && value !== '-');

const drawOldCustomerSignature = (ctx, customerName = '') => {
  needPage(ctx, 95);
  const { doc, F, FB, ML, CW } = ctx;
  const y = doc.y + 6;
  const gap = 18;
  const boxW = (CW - gap) / 2;
  const boxH = 58;

  drawSectionTitle(ctx, 'اسم وتوقيع الزبون');

  [
    { label: 'اسم الزبون', value: safe(customerName) },
    { label: 'توقيع الزبون', value: '' },
  ].forEach((item, index) => {
    const x = ML + index * (boxW + gap);
    doc.rect(x, y, boxW, boxH).fillAndStroke(COLORS.paleBlue, COLORS.border);
    doc.font(FB).fontSize(9).fillColor(COLORS.navy);
    doc.text(item.label, x + 8, y + 8, { width: boxW - 16, align: 'right', features: ['arab'] });
    doc.font(F).fontSize(9).fillColor(COLORS.text);
    doc.text(item.value, x + 8, y + 28, { width: boxW - 16, align: 'right', features: ['arab'] });
    doc.moveTo(x + 12, y + boxH - 12).lineTo(x + boxW - 12, y + boxH - 12)
      .strokeColor(COLORS.border).lineWidth(0.7).stroke();
  });

  doc.y = y + boxH + 10;
  doc.fillColor(COLORS.text);
};

const dataUrlToBuffer = (value = '') => {
  const match = String(value).match(/^data:image\/(?:png|jpeg|jpg);base64,(.+)$/);
  return match ? Buffer.from(match[1], 'base64') : null;
};

const drawRequiredMaterialsTable = (ctx, form = {}) => {
  const requiredMaterialItems = Array.isArray(form.requiredMaterialItems) ? form.requiredMaterialItems : [];
  drawSectionTitle(ctx, 'المواد المطلوبة للعمل');
  if (!requiredMaterialItems.length) {
    drawTextBlock(ctx, 'المواد المطلوبة', fixMaterialNumbersForPdf(form.requiredMaterials || 'لم يتم تسجيل مواد مطلوبة لهذه التذكرة.'));
    return;
  }

  drawDataTable(ctx, {
    headers: ['رقم', 'اسم المادة', 'الكمية', 'الوحدة', 'الملاحظات'],
    rows: requiredMaterialItems.map((item, index) => [
      String(index + 1),
      fixMaterialNumbersForPdf(safe(item.materialName)),
      fixMaterialNumbersForPdf(safe(item.quantity)),
      safe(item.unit),
      fixMaterialNumbersForPdf(safe(item.notes)),
    ]),
    colWidths: [0.08, 0.34, 0.14, 0.14, 0.3],
  });
};

const drawCustomerSignature = (ctx, customer = {}, signature = {}, technicianName = '') => {
  needPage(ctx, 210);
  const { doc, F, FB, ML, CW } = ctx;

  drawSectionTitle(ctx, 'توقيع الزبون على صحة معلومات الكشف');
  drawTextBlock(
    ctx,
    'إقرار الزبون',
    'أقر أنا الزبون بأن المعلومات والقياسات المذكورة في هذا التقرير تم تسجيلها أثناء الكشف الميداني، وهي تمثل المتطلبات والملاحظات الفنية الأولية لغرض التسعير أو التنفيذ.',
  );

  [
    ['اسم الزبون', signature.customerName || customer.customerName],
    ['رقم الهاتف', signature.phone || customer.phone],
    ['تاريخ ووقت التوقيع', fmtDateTime(signature.signedAt)],
    ['اسم الفني / ممثل الشركة', signature.technicianName || technicianName],
    ['توقيع الفني / ممثل الشركة', signature.technicianSignature],
  ].forEach(([label, value], index) => drawTableRow(ctx, label, safe(value), index));

  const y = doc.y + 8;
  const boxH = 118;
  doc.rect(ML, y, CW, boxH).fillAndStroke(COLORS.white, COLORS.border);
  doc.rect(ML + CW - 4, y, 4, boxH).fill(COLORS.accent);
  doc.font(FB).fontSize(12).fillColor(COLORS.navy);
  doc.text('مربع توقيع الزبون', ML + 12, y + 10, { width: CW - 24, align: 'right', features: ['arab'] });
  const signatureBuffer = dataUrlToBuffer(signature.imageDataUrl);
  if (signatureBuffer) {
    try {
      doc.image(signatureBuffer, ML + 20, y + 34, { fit: [CW - 40, 68], align: 'center', valign: 'center' });
    } catch {
      doc.font(F).fontSize(11).fillColor(COLORS.soft);
      doc.text('تعذر تضمين صورة التوقيع', ML + 20, y + 58, { width: CW - 40, align: 'center', features: ['arab'] });
    }
  } else {
    doc.font(FB).fontSize(11).fillColor(COLORS.soft);
    doc.text(signature.emptyReason ? `سبب عدم التوقيع: ${signature.emptyReason}` : 'لم يتم إرفاق توقيع إلكتروني', ML + 20, y + 58, { width: CW - 40, align: 'center', features: ['arab'] });
    doc.moveTo(ML + 40, y + 96).lineTo(ML + CW - 40, y + 96).strokeColor(COLORS.border).lineWidth(1).stroke();
  }

  doc.y = y + boxH + 10;
  doc.fillColor(COLORS.text);
};

export const buildFieldInspectionPdfBuffer = async (
  { ticket, generatedAt = new Date() } = {},
  { publicBaseUrl = '', uploadRootDir = '' } = {},
) => {
  const form = ticket?.inspectionForm || {};
  const customer = ticket?.customerSnapshot || {};
  const status = statusStyle[ticket?.status] || { ar: safe(ticket?.status), bg: COLORS.warning };
  const technicians = (ticket?.technicians || [])
    .map((item) => item.fullName || item.user?.fullName || '')
    .filter(Boolean);
  const photos = (ticket?.attachments || []).filter((item) => item.kind === 'photo');
  const files = (ticket?.attachments || []).filter((item) => item.kind !== 'photo');
  const materials = [...(form.materials || []), ...(form.customMaterials || [])].filter(Boolean);
  const requestType = form.requestType === 'أخرى' ? form.customRequestType : form.requestType;
  const siteStatus = form.siteStatus === 'أخرى' ? form.customSiteStatus : form.siteStatus;
  const serviceFields = form.serviceFields && typeof form.serviceFields === 'object' ? form.serviceFields : {};

  const ctx = createDoc({ title: `تقرير كشف ميداني - ${safe(ticket?.ticketNo)}`, fontScale: 1.18 });

  drawHeader(ctx, {
    title: 'تقرير الكشف الميداني',
    subtitle: `${safe(customer.customerName)}  —  ${safe(form.serviceType || ticket?.serviceType)}`,
    reportId: ticket?.ticketNo || '',
    date: generatedAt,
  });

  drawStatusBadge(ctx, { label: status.ar, color: status.bg });

  drawKpiCards(ctx, [
    { label: 'نوع الخدمة', value: safe(form.serviceType || ticket?.serviceType) },
    { label: 'نتيجة الكشف', value: safe(form.inspectionResult) },
    { label: 'عدد الصور', value: String(photos.length) },
    { label: 'المرفقات', value: String(files.length) },
  ]);

  drawSectionTitle(ctx, 'بيانات التذكرة والزبون');
  [
    ['رقم التذكرة', ticket?.ticketNo],
    ['اسم الزبون', customer.customerName],
    ['رقم الهاتف', customer.phone],
    ['العنوان', customer.address],
    ['موعد الكشف', fmtDateTime(ticket?.appointmentAt)],
    ['وقت بدء الكشف', fmtDateTime(ticket?.inspectionStartedAt)],
    ['وقت انتهاء الكشف', fmtDateTime(ticket?.inspectionEndedAt)],
    ['الفني / الفريق', technicians.join('، ')],
  ].forEach(([label, value], index) => drawTableRow(ctx, label, safe(value), index));

  const summaryRows = toRows([
    ['نوع الخدمة', form.serviceType || ticket?.serviceType],
    ['نوع الطلب', requestType],
    ['حالة الموقع', siteStatus],
    ['درجة الاستعجال', form.urgency],
    ['نتيجة الكشف', form.inspectionResult],
  ]);
  if (summaryRows.length) {
    ctx.doc.moveDown(0.6);
    drawSectionTitle(ctx, 'ملخص الكشف');
    drawDataTable(ctx, {
      headers: ['البند', 'القيمة'],
      rows: summaryRows,
      colWidths: [0.34, 0.66],
    });
  }

  const technicianDetailsRows = toRows([
    ['وصف حالة الموقع', form.siteCondition],
    ['متطلبات الزبون', form.customerRequirements],
    ['نوع الأعمال المطلوبة', form.requiredWorkType],
    ['الأجهزة أو الأنظمة الموجودة حاليا في الموقع', form.existingSystems],
    ['الأعمال المقترحة', form.proposedWorks],
    ['المواد أو الأجهزة المطلوبة', fixMaterialNumbersForPdf(form.requiredMaterials || materials.join('، '))],
    ['القياسات أو الملاحظات الفنية', form.technicalMeasurements],
    ['التوصيات النهائية', form.finalRecommendations],
    ['توصية الفني', form.technicianRecommendation],
    ['ملاحظات عامة', form.generalNotes],
  ]);
  if (technicianDetailsRows.length) {
    drawSectionTitle(ctx, 'تفاصيل استمارة الكشف المسجلة من الفني');
    technicianDetailsRows.forEach(([label, value]) => drawTextBlock(ctx, label, value));
  }

  const serviceRows = Object.entries(serviceFields).map(([label, value]) => [label, valueText(value)]);
  if (serviceRows.length) {
    drawSectionTitle(ctx, `تفاصيل خدمة ${safe(form.serviceType || ticket?.serviceType)}`);
    drawDataTable(ctx, {
      headers: ['السؤال', 'الإجابة'],
      rows: serviceRows,
      colWidths: [0.44, 0.56],
    });
  }

  drawRequiredMaterialsTable(ctx, form);

  drawSectionTitle(ctx, 'المواد والتوصيات');
  const materialRowsSummary = (form.requiredMaterialItems || [])
    .map((item) => [item.materialName, item.quantity, item.unit].filter(Boolean).join(' '))
    .filter(Boolean)
    .join('، ');
  drawTextBlock(ctx, 'المواد أو الأجهزة المطلوبة', fixMaterialNumbersForPdf(materialRowsSummary || materials.join('، ') || '-'));
  drawTextBlock(ctx, 'توصية الفني', form.technicianRecommendation);
  drawTextBlock(ctx, 'ملاحظات عامة', form.generalNotes || ticket?.notes);
  drawTextBlock(ctx, 'وصف طلب الزبون', ticket?.requestDescription);

  if (photos.length) {
    drawSectionTitle(ctx, `صور الكشف الميداني - العدد ${photos.length}`);
    photos.forEach((photo, index) => {
      const localPath = resolveLocalImagePath(photo.publicUrl, uploadRootDir);
      const fallbackUrl = resolveImageUrl(photo.publicUrl, publicBaseUrl);
      drawImageFrame(ctx, {
        localPath,
        fallbackUrl,
        name: photo.originalName || photo.fileName || `صورة ${index + 1}`,
        comment: photo.comment || '',
        index,
      });
    });
  }

  if (files.length) {
    drawSectionTitle(ctx, `قائمة المرفقات - العدد ${files.length}`);
    drawDataTable(ctx, {
      headers: ['#', 'اسم الملف', 'النوع', 'تاريخ الرفع'],
      rows: files.map((file, index) => [
        String(index + 1),
        safe(file.originalName || file.fileName),
        safe(file.kind || file.mimeType),
        fmtDateTime(file.uploadedAt),
      ]),
      colWidths: [0.08, 0.44, 0.22, 0.26],
    });
  }

  drawCustomerSignature(ctx, customer, form.customerSignature || {}, form.completedByName || technicians.join('، '));

  return finalize(ctx, { footerLabel: 'تقرير الكشف الميداني الرسمي — Delta Plus' });
};
