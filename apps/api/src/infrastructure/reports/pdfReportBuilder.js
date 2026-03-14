/**
 * Tasks Report PDF — rebuilt on the unified template.
 */

import {
  createDoc, finalize, safe, fmtDate, fmtPoints,
  drawHeader, drawSectionTitle, drawKpiCards, drawDataTable,
  COLORS,
} from './pdfTemplate.js';

export const buildTasksPdfBuffer = async (tasks = []) => {
  const ctx = createDoc({ title: 'تقرير المهام' });

  /* ── Header ── */
  drawHeader(ctx, {
    title: 'تقرير المهام',
    date: new Date(),
  });

  /* ── KPI Cards ── */
  const completed = tasks.filter((t) => t.status === 'APPROVED' || t.status === 'COMPLETED').length;
  const totalPoints = tasks.reduce((s, t) => s + Number(t.pointsAwarded || 0), 0);

  drawKpiCards(ctx, [
    { label: 'إجمالي المهام',    value: `${tasks.length}` },
    { label: 'المهام المنجزة',   value: `${completed}` },
    { label: 'النقاط الممنوحة',  value: fmtPoints(totalPoints) },
  ]);

  /* ── Section: جدول المهام ── */
  drawSectionTitle(ctx, 'قائمة المهام');

  if (tasks.length) {
    drawDataTable(ctx, {
      headers: ['#', 'المهمة', 'المشروع', 'المكلف', 'الحالة', 'النقاط', 'الاستحقاق', 'الاعتماد'],
      colWidths: [0.04, 0.22, 0.16, 0.14, 0.10, 0.08, 0.13, 0.13],
      rows: tasks.map((t, i) => [
        `${i + 1}`,
        safe(t.title),
        safe(t.project?.name),
        safe(t.assignee?.fullName),
        safe(t.status),
        fmtPoints(t.pointsAwarded || 0),
        fmtDate(t.dueDate),
        fmtDate(t.approvedAt),
      ]),
    });
  } else {
    ctx.doc.font(ctx.F).fontSize(8.5).fillColor(COLORS.soft);
    ctx.doc.text('لا توجد مهام.', ctx.ML, ctx.doc.y, { width: ctx.CW, align: 'right', features: ['arab'] });
    ctx.doc.moveDown(0.5);
  }

  /* ── Finalize ── */
  return finalize(ctx, { footerLabel: 'تقرير المهام' });
};
