/**
 * Work Report PDF — rebuilt on the unified template.
 * Produces the exact same professional layout as before.
 */

import {
  createDoc, finalize, safe, fmtDate, fmtDateTime, fmtPoints,
  resolveLocalImagePath, resolveImageUrl,
  drawHeader, drawStatusBadge, drawSectionTitle, drawTableRow,
  drawKpiCards, drawProgressBar, drawTextBlock, drawImageFrame,
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

  /* ── Header ── */
  drawHeader(ctx, {
    title: 'تقرير العمل اليومي',
    reportId: `#${String(report?._id || '').slice(-8).toUpperCase()}`,
    date: new Date(),
  });

  /* ── Status ── */
  const st = STATUS[report?.status] || STATUS.SUBMITTED;
  drawStatusBadge(ctx, { label: st.ar, color: st.bg });

  /* ── Section 1: بيانات الموظف والمشروع ── */
  drawSectionTitle(ctx, 'بيانات الموظف والمشروع');

  const participants = Array.isArray(report?.participants) ? report.participants : [];
  const participantCount = Number(report?.participantCount || participants.length || 0);
  const participantLabel = participants
    .map((p, i) => {
      const name = safe(p?.fullName || p?.user?.fullName);
      const code = safe(p?.employeeCode || p?.user?.employeeCode);
      return code === '-' ? `${i + 1}. ${name}` : `${i + 1}. ${name} (${code})`;
    })
    .join(' | ');

  drawTableRow(ctx, 'اسم الموظف',        safe(report?.employeeName || report?.user?.fullName), 0);
  drawTableRow(ctx, 'الرمز الوظيفي',      safe(report?.employeeCode || report?.user?.employeeCode), 1);
  drawTableRow(ctx, 'القسم',              safe(report?.user?.department), 2);
  drawTableRow(ctx, 'المشروع',            safe(report?.projectName || report?.project?.name), 3);
  drawTableRow(ctx, 'تاريخ العمل',        fmtDate(report?.workDate || report?.createdAt), 4);
  drawTableRow(ctx, 'عدد الكادر المشارك', `${participantCount}`, 5);
  drawTableRow(ctx, 'نقاط كاتب التقرير',  fmtPoints(report?.reporterPointsAwarded || report?.pointsAwarded || 0), 6);
  drawTableRow(ctx, 'حصة كل مشارك',       participantCount ? fmtPoints(report?.participantPointsAwarded || 0) : '-', 7);

  ctx.doc.moveDown(0.6);
  drawTextBlock(ctx, 'الكادر المشارك', participantLabel);

  /* ── Section 2: مؤشرات الأداء ── */
  drawSectionTitle(ctx, 'مؤشرات الأداء');

  drawKpiCards(ctx, [
    { label: 'نسبة الإنجاز',  value: `${Number(report?.progressPercent || 0)}%` },
    { label: 'ساعات العمل',    value: `${Number(report?.hoursSpent || 0)}` },
    { label: 'النقاط',         value: fmtPoints(report?.pointsAwarded || 0) },
    { label: 'النشاط',         value: safe(report?.activityType) },
  ]);

  drawProgressBar(ctx, report?.progressPercent);

  /* ── Section 3: تفاصيل العمل ── */
  drawSectionTitle(ctx, 'تفاصيل العمل');

  ctx.doc.moveDown(0.15);
  ctx.doc.font(ctx.FB).fontSize(10).fillColor(COLORS.navy);
  ctx.doc.text(safe(report?.title), ctx.ML, ctx.doc.y, { width: ctx.CW, align: 'right', features: ['arab'] });
  ctx.doc.moveTo(ctx.ML, ctx.doc.y + 2).lineTo(ctx.ML + ctx.CW, ctx.doc.y + 2).strokeColor(COLORS.accent).lineWidth(0.5).stroke();
  ctx.doc.moveDown(0.3);

  drawTextBlock(ctx, 'التفاصيل',          safe(report?.details));
  drawTextBlock(ctx, 'الإنجازات',         safe(report?.accomplishments));
  drawTextBlock(ctx, 'التحديات والعقبات', safe(report?.challenges));
  drawTextBlock(ctx, 'الخطوات القادمة',   safe(report?.nextSteps));

  /* ── Section 4: ملاحظات المدير ── */
  ctx.doc.moveDown(0.4);
  drawSectionTitle(ctx, 'ملاحظات المدير والاعتماد');

  drawTableRow(ctx, 'تعليق المدير',   safe(report?.managerComment), 0);
  drawTableRow(ctx, 'سبب الرفض',      safe(report?.rejectionReason), 1);
  drawTableRow(ctx, 'تاريخ الاعتماد', fmtDateTime(report?.approvedAt), 2);

  /* ── Section 5: المرفقات والصور ── */
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

  /* ── Finalize ── */
  return finalize(ctx, { footerLabel: 'تقرير العمل الرسمي' });
};
