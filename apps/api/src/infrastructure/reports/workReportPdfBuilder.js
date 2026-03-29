/**
 * Work Report PDF — Professional Arabic layout.
 * Uses the unified template primitives with improved organisation,
 * participant table, cleaner sections, and better image grid.
 */

import {
  createDoc, finalize, safe, fmtDate, fmtDateTime, fmtPoints,
  resolveLocalImagePath, resolveImageUrl,
  drawHeader, drawStatusBadge, drawSectionTitle, drawTableRow,
  drawKpiCards, drawProgressBar, drawTextBlock, drawImageFrame,
  drawDataTable, needPage,
  COLORS,
} from './pdfTemplate.js';

const STATUS = {
  SUBMITTED: { ar: 'بانتظار الاعتماد', bg: COLORS.warning },
  APPROVED:  { ar: 'معتمد',            bg: COLORS.success },
  REJECTED:  { ar: 'مرفوض',            bg: COLORS.danger  },
};

export const buildWorkReportPdfBuffer = async (
  report,
  { publicBaseUrl = '', uploadRootDir = '' } = {},
) => {
  const ctx = createDoc({ title: `تقرير العمل - ${safe(report?.title)}` });

  /* ═══════════════════════════════════════════════════════════════════════
     1. HEADER BANNER
     ═══════════════════════════════════════════════════════════════════════ */
  const employeeName = safe(report?.employeeName || report?.user?.fullName);
  const projectName = safe(report?.projectName || report?.project?.name);

  drawHeader(ctx, {
    title: 'تقرير العمل اليومي',
    subtitle: `${employeeName}  —  ${projectName}`,
    reportId: `#${String(report?._id || '').slice(-8).toUpperCase()}`,
    date: new Date(),
  });

  /* ═══════════════════════════════════════════════════════════════════════
     2. STATUS BADGE
     ═══════════════════════════════════════════════════════════════════════ */
  const st = STATUS[report?.status] || STATUS.SUBMITTED;
  drawStatusBadge(ctx, { label: st.ar, color: st.bg });

  /* ═══════════════════════════════════════════════════════════════════════
     3. KPI CARDS — top-level summary
     ═══════════════════════════════════════════════════════════════════════ */
  drawKpiCards(ctx, [
    { label: 'نسبة الإنجاز',  value: `${Number(report?.progressPercent || 0)}%` },
    { label: 'ساعات العمل',    value: `${Number(report?.hoursSpent || 0)}` },
    { label: 'النقاط',         value: fmtPoints(report?.pointsAwarded || 0) },
    { label: 'النشاط',         value: safe(report?.activityType) },
  ]);

  drawProgressBar(ctx, report?.progressPercent);

  /* ═══════════════════════════════════════════════════════════════════════
     4. EMPLOYEE & PROJECT INFO
     ═══════════════════════════════════════════════════════════════════════ */
  drawSectionTitle(ctx, 'بيانات الموظف والمشروع');

  drawTableRow(ctx, 'اسم الموظف',        employeeName, 0);
  drawTableRow(ctx, 'الرمز الوظيفي',      safe(report?.employeeCode || report?.user?.employeeCode), 1);
  drawTableRow(ctx, 'القسم',              safe(report?.user?.department), 2);
  drawTableRow(ctx, 'المشروع',            projectName, 3);
  drawTableRow(ctx, 'تاريخ العمل',        fmtDate(report?.workDate || report?.createdAt), 4);
  drawTableRow(ctx, 'تاريخ الإنشاء',      fmtDateTime(report?.createdAt), 5);

  /* ═══════════════════════════════════════════════════════════════════════
     5. PARTICIPANTS
     ═══════════════════════════════════════════════════════════════════════ */
  const participants = Array.isArray(report?.participants) ? report.participants : [];
  const participantCount = Number(report?.participantCount || participants.length || 0);

  ctx.doc.moveDown(0.4);
  drawSectionTitle(ctx, `الكادر المشارك  ( ${participantCount} )`);

  if (participants.length > 0) {
    drawDataTable(ctx, {
      headers: ['#', 'الاسم', 'الرمز الوظيفي', 'النقاط'],
      rows: participants.map((p, i) => [
        `${i + 1}`,
        safe(p?.fullName || p?.user?.fullName),
        safe(p?.employeeCode || p?.user?.employeeCode),
        fmtPoints(report?.participantPointsAwarded || 0),
      ]),
      colWidths: [0.08, 0.42, 0.25, 0.25],
    });
  } else {
    ctx.doc.font(ctx.F).fontSize(8.5).fillColor(COLORS.soft);
    ctx.doc.text(
      participantCount > 0 ? `${participantCount} مشاركين` : 'لا يوجد مشاركون',
      ctx.ML, ctx.doc.y, { width: ctx.CW, align: 'right', features: ['arab'] },
    );
    ctx.doc.moveDown(0.3);
    ctx.doc.fillColor(COLORS.text);
  }

  /* Points summary row */
  ctx.doc.moveDown(0.15);
  drawTableRow(ctx, 'نقاط كاتب التقرير',  fmtPoints(report?.reporterPointsAwarded || report?.pointsAwarded || 0), 0);
  drawTableRow(ctx, 'حصة كل مشارك',       participantCount ? fmtPoints(report?.participantPointsAwarded || 0) : '-', 1);

  /* ═══════════════════════════════════════════════════════════════════════
     6. WORK DETAILS
     ═══════════════════════════════════════════════════════════════════════ */
  ctx.doc.moveDown(0.5);
  drawSectionTitle(ctx, 'تفاصيل العمل');

  /* Report title highlight */
  needPage(ctx, 40);
  ctx.doc.moveDown(0.2);
  const titleY = ctx.doc.y;
  const titleText = safe(report?.title);
  const titleH = Math.max(ctx.doc.font(ctx.FB).fontSize(11).heightOfString(titleText, { width: ctx.CW - 24, align: 'right' }) + 14, 28);
  ctx.doc.rect(ctx.ML, titleY, ctx.CW, titleH).fill(COLORS.lightBlue);
  ctx.doc.rect(ctx.ML + ctx.CW - 3, titleY, 3, titleH).fill(COLORS.accent);
  ctx.doc.font(ctx.FB).fontSize(11).fillColor(COLORS.navy);
  ctx.doc.text(titleText, ctx.ML + 8, titleY + 7, { width: ctx.CW - 24, align: 'right', features: ['arab'] });
  ctx.doc.y = titleY + titleH + 6;
  ctx.doc.fillColor(COLORS.text);

  /* Detail sub-sections */
  drawTextBlock(ctx, 'التفاصيل',          safe(report?.details));
  drawTextBlock(ctx, 'الإنجازات',         safe(report?.accomplishments));
  drawTextBlock(ctx, 'التحديات والعقبات', safe(report?.challenges));
  drawTextBlock(ctx, 'الخطوات القادمة',   safe(report?.nextSteps));

  /* ═══════════════════════════════════════════════════════════════════════
     7. MANAGER NOTES & APPROVAL
     ═══════════════════════════════════════════════════════════════════════ */
  ctx.doc.moveDown(0.5);
  drawSectionTitle(ctx, 'ملاحظات المدير والاعتماد');

  drawTableRow(ctx, 'تعليق المدير',   safe(report?.managerComment), 0);
  drawTableRow(ctx, 'سبب الرفض',      safe(report?.rejectionReason), 1);
  drawTableRow(ctx, 'تاريخ الاعتماد', fmtDateTime(report?.approvedAt), 2);
  drawTableRow(ctx, 'المعتمد',        safe(report?.approvedBy?.fullName), 3);

  /* ═══════════════════════════════════════════════════════════════════════
     8. ATTACHMENTS & IMAGES
     ═══════════════════════════════════════════════════════════════════════ */
  const images = report?.images || [];
  if (images.length > 0) {
    ctx.doc.moveDown(0.6);
    drawSectionTitle(ctx, `المرفقات والصور  ( ${images.length} )`);
    ctx.doc.moveDown(0.3);

    images.forEach((image, idx) => {
      const localPath   = resolveLocalImagePath(image?.publicUrl, uploadRootDir);
      const fallbackUrl = resolveImageUrl(image?.publicUrl, publicBaseUrl);
      drawImageFrame(ctx, {
        localPath,
        fallbackUrl,
        name: safe(image?.originalName || `صورة ${idx + 1}`),
        comment: String(image?.comment || '').trim(),
        index: idx,
      });
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     FINALIZE
     ═══════════════════════════════════════════════════════════════════════ */
  return finalize(ctx, { footerLabel: 'تقرير العمل الرسمي — Delta Plus' });
};
