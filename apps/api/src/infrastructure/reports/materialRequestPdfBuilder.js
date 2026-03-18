/**
 * Individual Material Request PDF — professional report with approval trail.
 */

import {
  createDoc, finalize, safe, fmtDate, fmtDateTime,
  drawHeader, drawSectionTitle, drawKpiCards, drawDataTable,
  drawTableRow, drawTimelineEntry, drawTextBlock, needPage,
  COLORS,
} from './pdfTemplate.js';

const STATUS_LABELS = {
  PENDING_MANAGER_APPROVAL: 'بانتظار اعتماد مدير المشاريع',
  PENDING_SUPPLIER_APPROVAL: 'بانتظار اعتماد المجهز',
  IN_PROGRESS: 'قيد التجهيز',
  PENDING_RECEIPT: 'بانتظار استلام الموظف',
  RECEIVED: 'تم الاستلام',
  PENDING_SETTLEMENT: 'بانتظار اعتماد التصفية',
  CLOSED: 'مغلق',
  REJECTED: 'مرفوض',
  NEW: 'جديد',
  UNDER_REVIEW: 'قيد المراجعة',
  APPROVED: 'معتمد',
  PREPARING: 'جاري التجهيز',
  PREPARED: 'تم التجهيز',
  DELIVERED: 'تم التسليم',
  PENDING_RECONCILIATION: 'بانتظار التصفية',
  RECONCILED: 'تمت التصفية',
};

const APPROVAL_ACTION_LABELS = {
  APPROVE_FULL: 'اعتماد كامل',
  APPROVE_PARTIAL: 'اعتماد جزئي',
  REJECT: 'رفض',
  MODIFY: 'تعديل',
};

const statusColor = (s) => {
  if (['REJECTED'].includes(s)) return COLORS.danger;
  if (['CLOSED', 'RECEIVED', 'RECONCILED'].includes(s)) return COLORS.success;
  if (['IN_PROGRESS', 'PREPARING'].includes(s)) return COLORS.warning;
  return COLORS.accent;
};

export const buildMaterialRequestPdfBuffer = async ({ request } = {}) => {
  if (!request) throw new Error('Request data is required for PDF generation');

  const ctx = createDoc({ title: `طلب مواد - ${request.requestNo}` });

  /* ── Header ── */
  drawHeader(ctx, {
    title: 'تقرير طلب مواد',
    reportId: request.requestNo,
    date: new Date(),
  });

  /* ── Status KPI ── */
  const statusText = STATUS_LABELS[request.status] || request.status;
  drawKpiCards(ctx, [
    { label: 'الحالة', value: statusText },
    { label: 'البنود', value: `${(request.items || []).length}` },
    { label: 'الأولوية', value: request.priority === 'URGENT' ? 'عاجل' : request.priority === 'LOW' ? 'منخفض' : 'طبيعي' },
    { label: 'تاريخ الطلب', value: fmtDate(request.requestDate) },
  ]);

  /* ── Section 1: معلومات الطلب ── */
  drawSectionTitle(ctx, 'معلومات الطلب');
  const infoRows = [
    ['رقم الطلب', request.requestNo],
    ['المشروع', request.project?.name || request.manualProjectName || request.projectName || '-'],
    ['العميل', request.clientName || '-'],
    ['الطالب', request.requestedBy?.fullName || '-'],
    ['المستلم', request.requestedFor?.fullName || request.requestedBy?.fullName || '-'],
    ['المجهز', request.assignedPreparer?.fullName || 'غير معين'],
    ['تاريخ الطلب', fmtDateTime(request.requestDate)],
    ['الحالة', statusText],
  ];
  infoRows.forEach((row, i) => drawTableRow(ctx, row[0], row[1], i));
  ctx.doc.moveDown(0.5);

  /* ── Section 2: بنود الطلب ── */
  drawSectionTitle(ctx, 'بنود الطلب');
  if (request.items?.length) {
    drawDataTable(ctx, {
      headers: ['#', 'المادة', 'المطلوب', 'المعتمد', 'المجهز', 'المسلّم', 'الوحدة', 'الحالة'],
      colWidths: [0.04, 0.24, 0.10, 0.10, 0.10, 0.10, 0.10, 0.22],
      rows: request.items.map((item, i) => [
        `${i + 1}`,
        safe(item.materialName),
        safe(item.requestedQty),
        safe(item.approvedQty),
        safe(item.preparedQty),
        safe(item.deliveredQty),
        safe(item.unitSnapshot),
        STATUS_LABELS[item.lineStatus] || safe(item.lineStatus),
      ]),
    });
  }

  /* ── Section 3: سجل الاعتمادات ── */
  if (request.approvals?.length) {
    ctx.doc.moveDown(0.3);
    drawSectionTitle(ctx, 'سجل الاعتمادات والقرارات');
    request.approvals.forEach((approval, i) => {
      drawTimelineEntry(ctx, {
        index: i + 1,
        action: APPROVAL_ACTION_LABELS[approval.action] || safe(approval.action),
        actor: approval.approvedBy?.fullName || safe(approval.approvedBy),
        date: approval.approvedAt,
        beforeStatus: STATUS_LABELS[approval.beforeSnapshot?.status] || safe(approval.beforeSnapshot?.status),
        afterStatus: STATUS_LABELS[approval.afterSnapshot?.status] || safe(approval.afterSnapshot?.status),
        notes: approval.comment,
      });
    });
  }

  /* ── Section 4: سجل التجهيز ── */
  if (request.preparations?.length) {
    ctx.doc.moveDown(0.3);
    drawSectionTitle(ctx, 'سجل التجهيز');
    request.preparations.forEach((prep, i) => {
      drawTimelineEntry(ctx, {
        index: i + 1,
        action: prep.mode === 'FULL' ? 'تجهيز كامل' : 'تجهيز جزئي',
        actor: prep.preparedBy?.fullName || safe(prep.preparedBy),
        date: prep.preparedAt,
        beforeStatus: '-',
        afterStatus: `${(prep.items || []).length} مواد`,
        notes: prep.notes,
      });
    });
  }

  /* ── Section 5: ملاحظات عامة ── */
  if (request.generalNotes) {
    ctx.doc.moveDown(0.3);
    drawTextBlock(ctx, 'ملاحظات عامة', request.generalNotes);
  }

  /* ── Section 6: خانات التوقيع ── */
  ctx.doc.moveDown(0.5);
  needPage(ctx, 100);
  drawSectionTitle(ctx, 'التواقيع');

  const { doc, F, FB, ML, CW } = ctx;
  const signBoxW = CW / 3 - 8;
  const signY = doc.y + 4;

  const signBoxes = [
    { label: 'مدير المشاريع', name: request.approvalSummary?.approvedBy?.fullName || '' },
    { label: 'المجهز', name: request.assignedPreparer?.fullName || '' },
    { label: 'المستلم', name: request.requestedFor?.fullName || request.requestedBy?.fullName || '' },
  ];

  signBoxes.forEach((box, i) => {
    const x = ML + i * (signBoxW + 12);
    doc.rect(x, signY, signBoxW, 70).lineWidth(0.5).strokeColor(COLORS.border).stroke();
    doc.font(FB).fontSize(8).fillColor(COLORS.navy);
    doc.text(box.label, x, signY + 4, { width: signBoxW, align: 'center', features: ['arab'] });
    doc.font(F).fontSize(7.5).fillColor(COLORS.soft);
    doc.text(box.name, x, signY + 18, { width: signBoxW, align: 'center', features: ['arab'] });
    doc.text('التوقيع: ........................', x, signY + 48, { width: signBoxW, align: 'center', features: ['arab'] });
  });

  doc.y = signY + 80;

  /* ── Finalize ── */
  return finalize(ctx, { footerLabel: `طلب مواد ${request.requestNo}` });
};
