/**
 * Attendance Report PDF — rebuilt on the unified template.
 */

import {
  createDoc, finalize, safe, fmtDateTime,
  drawHeader, drawSectionTitle, drawKpiCards, drawDataTable,
  COLORS,
} from './pdfTemplate.js';

const toHours = (minutes) => Number((Math.max(0, Number(minutes || 0)) / 60).toFixed(2));

const fmtLocation = (loc) => {
  if (!loc) return '-';
  const lat = loc.latitude ?? loc.lat;
  const lng = loc.longitude ?? loc.lng;
  if (lat == null && lng == null) return '-';
  return `${lat}, ${lng}`;
};

export const buildAttendancePdfBuffer = async (rows = [], { fromLabel, toLabel } = {}) => {
  const ctx = createDoc({ title: 'تقرير الحضور والانصراف' });

  /* ── Header ── */
  drawHeader(ctx, {
    title: 'تقرير الحضور والانصراف',
    subtitle: fromLabel && toLabel ? `الفترة: ${safe(fromLabel)} ← ${safe(toLabel)}` : undefined,
    date: new Date(),
  });

  /* ── KPI Cards ── */
  const totalMinutes = rows.reduce((s, r) => s + Number(r.durationMinutes || 0), 0);
  const totalHours = toHours(totalMinutes);
  const avgHours = rows.length ? (totalHours / rows.length).toFixed(2) : '0';

  drawKpiCards(ctx, [
    { label: 'إجمالي السجلات', value: `${rows.length}` },
    { label: 'إجمالي الساعات',  value: `${totalHours}` },
    { label: 'متوسط الساعات',   value: `${avgHours}` },
  ]);

  /* ── Section: جدول الحضور ── */
  drawSectionTitle(ctx, 'سجلات الحضور والانصراف');

  if (rows.length) {
    drawDataTable(ctx, {
      headers: ['#', 'الموظف', 'الرمز', 'الحالة', 'الدخول', 'الخروج', 'الساعات', 'موقع الدخول', 'موقع الخروج'],
      colWidths: [0.04, 0.16, 0.09, 0.10, 0.13, 0.13, 0.08, 0.14, 0.13],
      rows: rows.map((r, i) => {
        const worked = Number(r.durationMinutes || 0);
        return [
          `${i + 1}`,
          safe(r.employeeName),
          safe(r.employeeCode),
          safe(r.status),
          fmtDateTime(r.checkInAt),
          fmtDateTime(r.checkOutAt),
          `${toHours(worked)}`,
          fmtLocation(r.checkInLocation),
          fmtLocation(r.checkOutLocation),
        ];
      }),
    });
  } else {
    ctx.doc.font(ctx.F).fontSize(8.5).fillColor(COLORS.soft);
    ctx.doc.text('لا توجد سجلات حضور.', ctx.ML, ctx.doc.y, { width: ctx.CW, align: 'right', features: ['arab'] });
    ctx.doc.moveDown(0.5);
  }

  /* ── Finalize ── */
  return finalize(ctx, { footerLabel: 'تقرير حضور وانصراف' });
};
