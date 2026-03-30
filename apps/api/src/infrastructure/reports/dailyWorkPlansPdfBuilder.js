import {
  createDoc,
  finalize,
  safe,
  drawHeader,
  drawSectionTitle,
  drawKpiCards,
  drawDataTable,
  COLORS,
} from './pdfTemplate.js';
import {
  buildDailyWorkPlanExportRows,
  DailyWorkPlanStatus,
} from '../../application/services/dailyWorkPlanService.js';

export const buildDailyWorkPlansPdfBuffer = async (plans = []) => {
  const ctx = createDoc({ title: 'بلان العمل اليومي' });
  const rows = buildDailyWorkPlanExportRows(plans);
  const completed = plans.filter((plan) => plan.status === DailyWorkPlanStatus.COMPLETED).length;
  const overdue = plans.filter((plan) => plan.status === DailyWorkPlanStatus.OVERDUE).length;

  drawHeader(ctx, {
    title: 'بلان العمل اليومي',
    date: new Date(),
  });

  drawKpiCards(ctx, [
    { label: 'إجمالي البلانات', value: `${plans.length}` },
    { label: 'المكتملة', value: `${completed}` },
    { label: 'المتأخرة', value: `${overdue}` },
  ]);

  drawSectionTitle(ctx, 'قائمة البلانات');

  if (!rows.length) {
    ctx.doc.font(ctx.F).fontSize(8.5).fillColor(COLORS.soft);
    ctx.doc.text('لا توجد بيانات للتصدير.', ctx.ML, ctx.doc.y, {
      width: ctx.CW,
      align: 'right',
      features: ['arab'],
    });
    ctx.doc.moveDown(0.5);
    return finalize(ctx, { footerLabel: 'بلان العمل اليومي' });
  }

  drawDataTable(ctx, {
    headers: ['#', 'العنوان', 'التاريخ', 'الحالة', 'الأولوية', 'التقدم', 'المكلّفون'],
    colWidths: [0.05, 0.26, 0.12, 0.13, 0.11, 0.09, 0.24],
    rows: rows.map((row, index) => [
      `${index + 1}`,
      safe(row.title),
      safe(row.planDate),
      safe(row.statusLabel),
      safe(row.priorityLabel),
      `${row.progressPercent}%`,
      safe(row.assigneesLabel),
    ]),
  });

  return finalize(ctx, { footerLabel: 'بلان العمل اليومي' });
};
