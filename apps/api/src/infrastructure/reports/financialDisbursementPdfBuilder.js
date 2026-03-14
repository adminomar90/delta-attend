/**
 * Financial Disbursement PDF — rebuilt on the unified template.
 */

import {
  createDoc, finalize, safe, fmtDateTime, fmtPoints, needPage,
  drawHeader, drawStatusBadge, drawSectionTitle, drawTableRow,
  drawKpiCards, drawTimelineEntry,
  COLORS,
} from './pdfTemplate.js';

const STATUS_MAP = {
  DRAFT:                              { ar: 'مسودة',                           bg: COLORS.soft    },
  PENDING_PROJECT_MANAGER_APPROVAL:   { ar: 'بانتظار اعتماد مدير المشاريع',    bg: COLORS.warning },
  PENDING_FINANCIAL_MANAGER_APPROVAL: { ar: 'بانتظار اعتماد المدير المالي',     bg: COLORS.warning },
  PENDING_GENERAL_MANAGER_APPROVAL:   { ar: 'بانتظار اعتماد المدير العام',      bg: COLORS.warning },
  APPROVED:                           { ar: 'معتمد',                           bg: COLORS.success },
  REJECTED:                           { ar: 'مرفوض',                           bg: COLORS.danger  },
  DISBURSED:                          { ar: 'تم الصرف',                        bg: COLORS.success },
};

export const buildFinancialDisbursementPdfBuffer = async ({ request, generatedAt = new Date() } = {}) => {
  const ctx = createDoc({ title: `مستند صرف مالي - ${safe(request?.requestNo)}` });

  /* ── Header ── */
  drawHeader(ctx, {
    title: 'مستند معاملة صرف مالي',
    reportId: safe(request?.requestNo),
    date: generatedAt,
  });

  /* ── Status ── */
  const st = STATUS_MAP[request?.status] || { ar: safe(request?.statusLabel || request?.status), bg: COLORS.warning };
  drawStatusBadge(ctx, { label: st.ar, color: st.bg });

  /* ── KPI Cards ── */
  const amount = Number(request?.amount || 0);
  const approvedAmount = request?.approvedAmount != null ? Number(request.approvedAmount) : null;
  drawKpiCards(ctx, [
    { label: 'المبلغ المطلوب', value: `${amount} ${request?.currency || 'IQD'}` },
    { label: 'المبلغ المعتمد', value: approvedAmount != null ? `${approvedAmount} ${request?.currency || 'IQD'}` : '-' },
    { label: 'نوع الصرف',     value: safe(request?.requestType) },
    { label: 'العملة',         value: safe(request?.currency || 'IQD') },
  ]);

  /* ── Section: بيانات المعاملة ── */
  drawSectionTitle(ctx, 'بيانات المعاملة');

  let idx = 0;
  drawTableRow(ctx, 'رقم الطلب',        safe(request?.requestNo), idx++);
  drawTableRow(ctx, 'رقم المعاملة',      safe(request?.transactionNo), idx++);
  drawTableRow(ctx, 'تاريخ المعاملة',    request?.transactionDate ? fmtDateTime(request.transactionDate) : '-', idx++);
  drawTableRow(ctx, 'الموظف',            safe(request?.employee?.fullName), idx++);
  drawTableRow(ctx, 'صفة مقدم الطلب',    safe(request?.employeeRole), idx++);
  drawTableRow(ctx, 'نوع الصرف',         safe(request?.requestType), idx++);
  drawTableRow(ctx, 'المبلغ',            `${amount} ${request?.currency || 'IQD'}`, idx++);
  if (approvedAmount != null) {
    drawTableRow(ctx, 'المبلغ المعتمد',  `${approvedAmount} ${request?.currency || 'IQD'}`, idx++);
    if (approvedAmount !== amount) {
      drawTableRow(ctx, 'ملاحظة التقليص', `تم تقليص المبلغ من ${amount} إلى ${approvedAmount}`, idx++);
    }
  }
  drawTableRow(ctx, 'إجمالي المعاملة',   `${Number(request?.transactionTotalAmount || amount)} ${request?.currency || 'IQD'}`, idx++);
  drawTableRow(ctx, 'الحالة',            st.ar, idx++);
  drawTableRow(ctx, 'الوصف',             safe(request?.description), idx++);
  drawTableRow(ctx, 'ملاحظات',           safe(request?.notes), idx++);

  /* ── Section: سجل الإجراءات ── */
  ctx.doc.moveDown(0.6);
  drawSectionTitle(ctx, 'سجل الإجراءات والاعتمادات');

  const trail = Array.isArray(request?.workflowTrail) ? request.workflowTrail : [];
  if (!trail.length) {
    ctx.doc.font(ctx.F).fontSize(8.5).fillColor(COLORS.soft);
    ctx.doc.text('لا يوجد سجل إجراءات بعد.', ctx.ML, ctx.doc.y, { width: ctx.CW, align: 'right', features: ['arab'] });
    ctx.doc.moveDown(0.5);
  } else {
    trail.forEach((entry, i) => {
      drawTimelineEntry(ctx, {
        index: i + 1,
        action: safe(entry?.action),
        actor: safe(entry?.actor?.fullName),
        role: entry?.actor?.role || '',
        date: entry?.occurredAt,
        beforeStatus: safe(entry?.beforeStatusLabel || entry?.beforeStatus),
        afterStatus: safe(entry?.afterStatusLabel || entry?.afterStatus),
        notes: entry?.notes || '',
      });
    });
  }

  /* ── Finalize ── */
  return finalize(ctx, { footerLabel: 'مستند صرف مالي رسمي' });
};
