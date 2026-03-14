/**
 * Approval History PDF — rebuilt on the unified template.
 */

import {
  createDoc, finalize, safe,
  drawHeader, drawSectionTitle, drawKpiCards, drawTableRow,
  needPage, COLORS,
} from './pdfTemplate.js';

export const buildApprovalHistoryPdfBuffer = async (rows = [], { generatedAt = new Date() } = {}) => {
  const ctx = createDoc({ title: 'سجل الاعتمادات' });

  /* ── Header ── */
  drawHeader(ctx, {
    title: 'سجل الاعتمادات',
    date: generatedAt,
  });

  /* ── KPI Cards ── */
  const approved = rows.filter((r) => /approved|معتمد/i.test(r.approvalStatus || '')).length;
  const rejected = rows.filter((r) => /rejected|مرفوض/i.test(r.approvalStatus || '')).length;

  drawKpiCards(ctx, [
    { label: 'إجمالي العمليات', value: `${rows.length}` },
    { label: 'معتمدة',          value: `${approved}` },
    { label: 'مرفوضة',          value: `${rejected}` },
  ]);

  /* ── Section: العمليات ── */
  drawSectionTitle(ctx, 'تفاصيل العمليات');

  if (!rows.length) {
    ctx.doc.font(ctx.F).fontSize(8.5).fillColor(COLORS.soft);
    ctx.doc.text('لا توجد عمليات مسجلة.', ctx.ML, ctx.doc.y, { width: ctx.CW, align: 'right', features: ['arab'] });
    ctx.doc.moveDown(0.5);
  }

  rows.forEach((row, index) => {
    needPage(ctx, 180);

    /* ── Operation title bar ── */
    const titleBarY = ctx.doc.y;
    ctx.doc.rect(ctx.ML, titleBarY, ctx.CW, 20).fill(COLORS.navy);
    ctx.doc.rect(ctx.ML + ctx.CW - 4, titleBarY, 4, 20).fill(COLORS.accent);

    // Index circle
    const circleX = ctx.ML + ctx.CW - 20;
    ctx.doc.circle(circleX, titleBarY + 10, 8).fill(COLORS.accent);
    ctx.doc.font(ctx.FB).fontSize(8).fillColor(COLORS.white);
    ctx.doc.text(`${index + 1}`, circleX - 8, titleBarY + 6, { width: 16, align: 'center' });

    // Title
    ctx.doc.font(ctx.FB).fontSize(9).fillColor(COLORS.white);
    ctx.doc.text(
      `${safe(row.operationNumber)} - ${safe(row.title)}`,
      ctx.ML + 6, titleBarY + 5,
      { width: ctx.CW - 42, align: 'right', lineBreak: false, features: ['arab'] },
    );
    ctx.doc.y = titleBarY + 22;

    /* ── Details rows ── */
    let idx = 0;
    drawTableRow(ctx, 'النوع',             safe(row.operationType), idx++);
    drawTableRow(ctx, 'الحالة',            safe(row.approvalStatus), idx++);
    drawTableRow(ctx, 'الحالة الأصلية',     safe(row.rawStatus), idx++);
    drawTableRow(ctx, 'المنشئ',            `${safe(row.createdBy)} (${safe(row.createdByRole)})`, idx++);
    drawTableRow(ctx, 'الموظف',            `${safe(row.employeeName)} (${safe(row.employeeCode)})`, idx++);
    drawTableRow(ctx, 'المشروع / القسم',    safe(row.projectOrDepartment), idx++);
    drawTableRow(ctx, 'النقاط',            safe(row.points), idx++);
    drawTableRow(ctx, 'المعتمد',           `${safe(row.approverName)} (${safe(row.approverRole)})`, idx++);
    drawTableRow(ctx, 'الصلاحية',          safe(row.approverPermission), idx++);
    drawTableRow(ctx, 'تاريخ الإنشاء',     `${safe(row.createdDate)} ${safe(row.createdTime)}`, idx++);
    drawTableRow(ctx, 'تاريخ الاعتماد',    `${safe(row.approvalDate)} ${safe(row.approvalTime)}`, idx++);
    drawTableRow(ctx, 'الملاحظات',         safe(row.notes), idx++);
    drawTableRow(ctx, 'خطوات الاعتماد',    safe(row.approvalSteps), idx++);

    if (row.fullDetails && row.fullDetails !== '-') {
      drawTableRow(ctx, 'التفاصيل الكاملة', safe(row.fullDetails), idx++);
    }

    ctx.doc.moveDown(0.6);
  });

  /* ── Finalize ── */
  return finalize(ctx, { footerLabel: 'سجل اعتمادات رسمي' });
};
