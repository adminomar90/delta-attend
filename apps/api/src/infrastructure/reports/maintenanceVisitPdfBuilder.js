import {
  COLORS,
  createDoc,
  drawBulletList,
  drawHeader,
  drawImageFrame,
  drawKpiCards,
  drawSectionTitle,
  drawStatusBadge,
  drawTableRow,
  drawTextBlock,
  finalize,
  fmtDate,
  fmtDateTime,
  resolveImageUrl,
  resolveLocalImagePath,
  safe,
} from './pdfTemplate.js';

const VISIT_STATUS_MAP = {
  SUCCESS: { ar: 'مكتملة بنجاح', bg: COLORS.success },
  FOLLOW_UP_REQUIRED: { ar: 'تحتاج متابعة', bg: COLORS.warning },
  PAID_REPAIR_REQUIRED: { ar: 'تحتاج صيانة مدفوعة', bg: COLORS.danger },
  PARTIAL: { ar: 'مكتملة جزئيًا', bg: COLORS.accent },
};

const EVALUATION_LABEL_MAP = {
  GOOD: 'جيد',
  ACCEPTABLE: 'مقبول',
  EXCELLENT: 'ممتاز',
};

const yesNo = (value) => (value ? 'نعم' : 'لا');
const safeText = (value) => String(value || '').trim();
const maintenanceTypeLabel = (value) => (
  value === 'FREE' ? 'مجانية' : value === 'PAID' ? 'مدفوعة' : '-'
);

const evaluationCheckboxLine = (selectedGrade, grade) => (
  `${selectedGrade === grade ? '[x]' : '[ ]'} ${EVALUATION_LABEL_MAP[grade]}`
);

export const buildMaintenanceVisitPdfBuffer = async (
  { visit, generatedAt = new Date(), publicBaseUrl = '', uploadRootDir = '' } = {},
) => {
  const ctx = createDoc({
    title: `تقرير زيارة صيانة - ${safe(visit?.maintenancePlan?.customerName || visit?.id)}`,
  });

  drawHeader(ctx, {
    title: 'تقرير زيارة الصيانة الدورية',
    subtitle: safe(visit?.maintenancePlan?.projectName || visit?.maintenancePlan?.projectNumber || ''),
    reportId: safe(visit?.id),
    date: generatedAt,
  });

  const statusMeta = VISIT_STATUS_MAP[visit?.status]
    || { ar: safe(visit?.statusLabel || visit?.status), bg: COLORS.warning };

  drawStatusBadge(ctx, {
    label: statusMeta.ar,
    color: statusMeta.bg,
  });

  drawKpiCards(ctx, [
    { label: 'نسبة إنجاز الزيارة', value: `${Number(visit?.completionRate || 0)}%` },
    { label: 'نسبة تقييم الفني', value: visit?.technicianEvaluationPercent ? `${Number(visit.technicianEvaluationPercent)}%` : '-' },
    { label: 'عدد الصور', value: `${(visit?.images || []).length}` },
    { label: 'حالة التقييم', value: safe(visit?.technicianEvaluationGradeLabel || '-') },
  ]);

  drawSectionTitle(ctx, 'بيانات الزيارة');
  let rowIndex = 0;
  drawTableRow(ctx, 'اسم الزبون', safe(visit?.maintenancePlan?.customerName), rowIndex++);
  drawTableRow(ctx, 'اسم المشروع', safe(visit?.maintenancePlan?.projectName), rowIndex++);
  drawTableRow(ctx, 'رقم المشروع', safe(visit?.maintenancePlan?.projectNumber), rowIndex++);
  drawTableRow(ctx, 'الموقع', safe(visit?.maintenancePlan?.location), rowIndex++);
  drawTableRow(ctx, 'رقم الهاتف', safe(visit?.maintenancePlan?.phone), rowIndex++);
  drawTableRow(ctx, 'نوع الخطة', maintenanceTypeLabel(visit?.maintenancePlan?.maintenanceType), rowIndex++);
  drawTableRow(ctx, 'تاريخ الزيارة', fmtDate(visit?.visitDate), rowIndex++);
  drawTableRow(ctx, 'وقت التسجيل', fmtDateTime(visit?.createdAt), rowIndex++);
  drawTableRow(ctx, 'الفني / المهندس', safe(visit?.technicianName || visit?.technician?.fullName), rowIndex++);
  drawTableRow(ctx, 'رقم الفني / المهندس', safe(visit?.technician?.phone), rowIndex++);
  drawTableRow(ctx, 'نوع الزيارة', safe(visit?.visitType), rowIndex++);
  drawTableRow(ctx, 'حالة الزيارة', statusMeta.ar, rowIndex++);

  drawSectionTitle(ctx, 'نتيجة التنفيذ');
  rowIndex = 0;
  drawTableRow(ctx, 'حالة الأجهزة', safe(visit?.deviceStatus), rowIndex++);
  drawTableRow(ctx, 'تمت الزيارة بنجاح', yesNo(visit?.visitCompletedSuccessfully), rowIndex++);
  drawTableRow(ctx, 'تحتاج متابعة', yesNo(visit?.followUpRequired), rowIndex++);
  drawTableRow(ctx, 'تحتاج صيانة مدفوعة إضافية', yesNo(visit?.paidRepairRequired), rowIndex++);
  drawTableRow(ctx, 'نسبة الإنجاز', `${Number(visit?.completionRate || 0)}%`, rowIndex++);

  drawTextBlock(ctx, 'الأعمال المنفذة', safeText(visit?.workDone));
  drawTextBlock(ctx, 'الملاحظات', safeText(visit?.notes));
  drawTextBlock(ctx, 'التوصيات', safeText(visit?.recommendations));
  drawTextBlock(ctx, 'نص الاعتماد', safeText(visit?.approvalText));

  drawSectionTitle(ctx, 'تقييم الفني أو المهندس');
  drawBulletList(
    ctx,
    [
      evaluationCheckboxLine(visit?.technicianEvaluationGrade, 'GOOD'),
      evaluationCheckboxLine(visit?.technicianEvaluationGrade, 'ACCEPTABLE'),
      evaluationCheckboxLine(visit?.technicianEvaluationGrade, 'EXCELLENT'),
    ],
    'لم يتم تسجيل تقييم للفني أو المهندس.',
  );
  rowIndex = 0;
  drawTableRow(ctx, 'درجة التقييم المختارة', safe(visit?.technicianEvaluationGradeLabel), rowIndex++);
  drawTableRow(
    ctx,
    'نسبة التقييم',
    visit?.technicianEvaluationPercent ? `${Number(visit.technicianEvaluationPercent)}%` : '-',
    rowIndex++,
  );

  drawSectionTitle(ctx, 'التواقيع والاعتماد');
  rowIndex = 0;
  drawTableRow(ctx, 'توقيع الزبون', safe(visit?.customerSignature), rowIndex++);
  drawTableRow(ctx, 'توقيع الفني / المهندس', safe(visit?.technicianSignature), rowIndex++);
  drawTableRow(ctx, 'توقيع مدير المشاريع', safe(visit?.projectManagerSignature), rowIndex++);
  drawTableRow(ctx, 'اعتماد عام', safe(visit?.signedBy), rowIndex++);

  drawSectionTitle(ctx, 'معلومات إضافية');
  drawBulletList(
    ctx,
    [
      visit?.maintenancePlan?.status ? `حالة الخطة: ${safe(visit.maintenancePlan.status)}` : '',
      visit?.maintenancePlan?.executorName ? `المنفذ الأساسي: ${safe(visit.maintenancePlan.executorName)}` : '',
      visit?.createdBy?.fullName ? `تم تسجيل الزيارة بواسطة: ${safe(visit.createdBy.fullName)}` : '',
    ].filter(Boolean),
    'لا توجد معلومات إضافية مسجلة.',
  );

  const images = visit?.images || [];
  if (images.length) {
    drawSectionTitle(ctx, `الصور المرفقة (${images.length})`);
    images.forEach((image, index) => {
      const source = image?.url || image?.publicUrl || '';
      drawImageFrame(ctx, {
        localPath: resolveLocalImagePath(source, uploadRootDir),
        fallbackUrl: resolveImageUrl(source, publicBaseUrl),
        name: safe(image?.originalName || `صورة ${index + 1}`),
        comment: safeText(image?.comment),
        index,
      });
    });
  }

  return finalize(ctx, {
    footerLabel: 'تقرير زيارة صيانة دورية',
  });
};
