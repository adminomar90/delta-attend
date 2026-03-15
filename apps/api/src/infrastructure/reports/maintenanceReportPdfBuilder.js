/**
 * Maintenance Report PDF — professional layout matching financial disbursement quality.
 *
 * Uses the unified pdfTemplate primitives (navy/gold corporate branding,
 * Arabic RTL support, proper page breaks, and institutional formatting).
 */

import fs from 'fs';
import {
  createDoc, finalize, safe, fmtDateTime, needPage,
  drawHeader, drawStatusBadge, drawSectionTitle, drawTableRow,
  drawKpiCards, drawDataTable, drawTextBlock, drawTimelineEntry,
  drawImageFrame, drawBulletList, resolveLocalImagePath, resolveImageUrl,
  COLORS,
} from './pdfTemplate.js';

/* ═══════════════════════════════════════════════════════════════════════════
   STATUS MAP — all 13 maintenance report statuses
   ═══════════════════════════════════════════════════════════════════════════ */

const STATUS_MAP = {
  NEW:                          { ar: 'جديد',                           bg: COLORS.accent  },
  AWAITING_ACCEPTANCE:          { ar: 'بانتظار الاستلام',               bg: COLORS.warning },
  ACCEPTED:                     { ar: 'تم الاستلام',                    bg: COLORS.accent  },
  IN_PROGRESS:                  { ar: 'قيد التنفيذ',                    bg: COLORS.accent  },
  DRAFT:                        { ar: 'محفوظ كمسودة',                   bg: COLORS.soft    },
  COMPLETED:                    { ar: 'مكتمل',                         bg: COLORS.success },
  AWAITING_CUSTOMER_FEEDBACK:   { ar: 'بانتظار تقييم الزبون',           bg: COLORS.warning },
  FEEDBACK_SUBMITTED:           { ar: 'تم تقييمه',                      bg: COLORS.accent  },
  PENDING_MANAGER_APPROVAL:     { ar: 'بانتظار اعتماد المدير المباشر',  bg: COLORS.warning },
  RETURNED_FOR_EDIT:            { ar: 'معاد للتعديل',                   bg: COLORS.danger  },
  APPROVED:                     { ar: 'معتمد',                         bg: COLORS.success },
  REJECTED:                     { ar: 'مرفوض',                         bg: COLORS.danger  },
  CLOSED:                       { ar: 'مغلق',                          bg: COLORS.soft    },
};

/* ═══════════════════════════════════════════════════════════════════════════
   HELPER — star rating display (★☆)
   ═══════════════════════════════════════════════════════════════════════════ */

const renderStars = (rating, max = 5) => {
  const n = Math.min(max, Math.max(0, Number(rating || 0)));
  if (!n) return '-';
  return '★'.repeat(n) + '☆'.repeat(max - n) + `  (${n}/${max})`;
};

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN BUILDER
   ═══════════════════════════════════════════════════════════════════════════ */

export const buildMaintenanceReportPdfBuffer = async (
  { report, generatedAt = new Date(), publicBaseUrl = '', uploadRootDir = '' } = {},
) => {
  const ctx = createDoc({ title: `تقرير صيانة - ${safe(report?.requestNo)}` });

  /* ── Header ── */
  drawHeader(ctx, {
    title: 'تقرير الصيانة الدورية',
    reportId: safe(report?.requestNo),
    date: generatedAt,
  });

  /* ── Status Badge ── */
  const st = STATUS_MAP[report?.status] || { ar: safe(report?.statusLabel || report?.status), bg: COLORS.warning };
  drawStatusBadge(ctx, { label: st.ar, color: st.bg });

  /* ── KPI Cards ── */
  const devicesCount  = (report?.inspectedDevices || []).length;
  const issuesCount   = (report?.detectedIssues || []).length;
  const materialsUsed = (report?.usedMaterials || []).length;
  drawKpiCards(ctx, [
    { label: 'النقاط',            value: safe(report?.points) },
    { label: 'الأجهزة المفحوصة',  value: `${devicesCount}` },
    { label: 'المشاكل المكتشفة',  value: `${issuesCount}` },
    { label: 'المواد المستخدمة',   value: `${materialsUsed}` },
  ]);

  /* ── Section: بيانات الطلب ── */
  drawSectionTitle(ctx, 'بيانات الطلب');
  let idx = 0;
  drawTableRow(ctx, 'رقم الطلب',       safe(report?.requestNo), idx++);
  drawTableRow(ctx, 'اسم الزبون',      safe(report?.customerName), idx++);
  drawTableRow(ctx, 'الموقع',          safe(report?.siteLocation), idx++);
  drawTableRow(ctx, 'رقم الهاتف',      safe(report?.phone), idx++);
  drawTableRow(ctx, 'رقم المشروع',     safe(report?.projectNumber), idx++);
  drawTableRow(ctx, 'الحالة',          st.ar, idx++);
  drawTableRow(ctx, 'الفني المُكلّف',  safe(report?.assignedEmployee?.fullName || report?.assignedEmployeeName), idx++);
  drawTableRow(ctx, 'المدير المباشر',  safe(report?.managerReviewer?.fullName || report?.managerReviewerName), idx++);
  if (report?.description) {
    drawTableRow(ctx, 'الوصف', safe(report.description), idx++);
  }

  /* ── Section: معلومات الزيارة ── */
  ctx.doc.moveDown(0.4);
  drawSectionTitle(ctx, 'معلومات الزيارة');
  idx = 0;
  drawTableRow(ctx, 'اسم الشركة / الموقع', safe(report?.visitInfo?.siteName || report?.customerName), idx++);
  drawTableRow(ctx, 'عنوان الموقع',         safe(report?.visitInfo?.siteAddress || report?.siteLocation), idx++);
  drawTableRow(ctx, 'رقم العقد أو المشروع', safe(report?.projectNumber), idx++);
  drawTableRow(ctx, 'تاريخ الزيارة',        fmtDateTime(report?.visitInfo?.visitDate), idx++);
  drawTableRow(ctx, 'وقت الوصول',           safe(report?.visitInfo?.arrivalTime), idx++);
  drawTableRow(ctx, 'وقت المغادرة',         safe(report?.visitInfo?.departureTime), idx++);
  drawTableRow(ctx, 'اسم الفني',            safe(report?.visitInfo?.technicianName || report?.assignedEmployee?.fullName), idx++);
  drawTableRow(ctx, 'القسم المسؤول',         safe(report?.visitInfo?.department || report?.assignedEmployee?.department), idx++);

  /* ── Section: نوع الصيانة ── */
  ctx.doc.moveDown(0.4);
  drawSectionTitle(ctx, 'نوع الصيانة');
  const mtItems = (report?.maintenanceTypes || []).map((t) => (typeof t === 'string' ? t : t.label || t.value || ''));
  drawBulletList(ctx, mtItems, 'لم يتم تحديد نوع الصيانة');

  /* ── Section: الأجهزة المفحوصة ── */
  ctx.doc.moveDown(0.3);
  drawSectionTitle(ctx, 'الأجهزة التي تم فحصها');
  if (devicesCount) {
    drawDataTable(ctx, {
      headers: ['#', 'الجهاز', 'الموديل', 'الحالة', 'الملاحظات'],
      colWidths: [0.06, 0.28, 0.22, 0.18, 0.26],
      rows: (report.inspectedDevices || []).map((d, i) => [
        `${i + 1}`, safe(d.device), safe(d.model), safe(d.conditionLabel || d.condition), safe(d.notes),
      ]),
    });
  } else {
    drawBulletList(ctx, [], 'لا توجد أجهزة مسجلة');
  }

  /* ── Section: الأعمال المنفذة ── */
  ctx.doc.moveDown(0.3);
  drawSectionTitle(ctx, 'الأعمال التي تم تنفيذها');
  drawBulletList(ctx, report?.performedActions || [], 'لا توجد أعمال منفذة مسجلة');

  /* ── Section: المشاكل المكتشفة ── */
  ctx.doc.moveDown(0.3);
  drawSectionTitle(ctx, 'المشاكل المكتشفة');
  if (issuesCount) {
    drawDataTable(ctx, {
      headers: ['#', 'المشكلة', 'الخطورة', 'الحل المقترح'],
      colWidths: [0.06, 0.38, 0.18, 0.38],
      rows: (report.detectedIssues || []).map((d, i) => [
        safe(d.sequenceNo || i + 1), safe(d.issue), safe(d.severityLabel || d.severity), safe(d.proposedSolution),
      ]),
    });
  } else {
    drawBulletList(ctx, [], 'لا توجد مشاكل مكتشفة');
  }

  /* ── Section: المواد المستخدمة ── */
  ctx.doc.moveDown(0.3);
  drawSectionTitle(ctx, 'المواد المستخدمة');
  if (materialsUsed) {
    drawDataTable(ctx, {
      headers: ['#', 'المادة', 'الكمية', 'الملاحظات'],
      colWidths: [0.06, 0.40, 0.16, 0.38],
      rows: (report.usedMaterials || []).map((m, i) => [
        `${i + 1}`, safe(m.material), safe(m.quantity), safe(m.notes),
      ]),
    });
  } else {
    drawBulletList(ctx, [], 'لا توجد مواد مستخدمة');
  }

  /* ── Section: التوصيات ── */
  ctx.doc.moveDown(0.3);
  drawSectionTitle(ctx, 'التوصيات');
  drawBulletList(ctx, report?.recommendations || [], 'لا توجد توصيات');

  /* ── Section: تقييم الزبون ── */
  if (report?.customerFeedback?.submittedAt) {
    ctx.doc.moveDown(0.4);
    drawSectionTitle(ctx, 'تقييم الزبون');
    idx = 0;
    drawTableRow(ctx, 'اسم الزبون',    safe(report.customerFeedback.customerName || report?.customerName), idx++);
    drawTableRow(ctx, 'نوع المشروع',   safe(report.customerFeedback.projectTypeLabel || report.customerFeedback.projectType), idx++);
    drawTableRow(ctx, 'تقييم الشركة',   renderStars(report.customerFeedback.companyRating), idx++);
    drawTableRow(ctx, 'تقييم الموظف',   renderStars(report.customerFeedback.employeeRating), idx++);
    if (report.customerFeedback.notes) {
      drawTableRow(ctx, 'الملاحظات', safe(report.customerFeedback.notes), idx++);
    }
    if (report.customerFeedback.suggestions) {
      drawTableRow(ctx, 'الاقتراحات', safe(report.customerFeedback.suggestions), idx++);
    }
    drawTableRow(ctx, 'تاريخ الإرسال',  fmtDateTime(report.customerFeedback.submittedAt), idx++);
  }

  /* ── Section: اعتماد المدير ── */
  if (report?.managerReview?.reviewedAt) {
    ctx.doc.moveDown(0.4);
    drawSectionTitle(ctx, 'اعتماد المدير المباشر');
    idx = 0;
    drawTableRow(ctx, 'الإجراء',  safe(report.managerReview.action), idx++);
    drawTableRow(ctx, 'المدير',   safe(report.managerReview.reviewedBy?.fullName || report?.managerReviewer?.fullName), idx++);
    if (report.managerReview.notes) {
      drawTableRow(ctx, 'الملاحظات', safe(report.managerReview.notes), idx++);
    }
    drawTableRow(ctx, 'التاريخ',  fmtDateTime(report.managerReview.reviewedAt), idx++);
  }

  /* ── Section: التواريخ المهمة ── */
  const timestamps = [
    { label: 'تاريخ الإنشاء',        value: report?.createdAt },
    { label: 'تاريخ الاستلام',       value: report?.acceptedAt },
    { label: 'تاريخ الإكمال',        value: report?.completedAt },
    { label: 'تاريخ إرسال التقييم',   value: report?.feedbackSentAt },
    { label: 'تاريخ رفع للاعتماد',   value: report?.submittedForApprovalAt },
    { label: 'تاريخ الاعتماد',       value: report?.approvedAt },
    { label: 'تاريخ الإغلاق',        value: report?.closedAt },
  ].filter((t) => t.value);

  if (timestamps.length) {
    ctx.doc.moveDown(0.4);
    drawSectionTitle(ctx, 'التواريخ المهمة');
    idx = 0;
    timestamps.forEach((t) => {
      drawTableRow(ctx, t.label, fmtDateTime(t.value), idx++);
    });
  }

  /* ── Section: سجل الإجراءات والاعتمادات ── */
  ctx.doc.moveDown(0.4);
  drawSectionTitle(ctx, 'سجل الإجراءات والاعتمادات');
  const trail = report?.workflowTrail || [];
  if (!trail.length) {
    drawBulletList(ctx, [], 'لا يوجد سجل إجراءات بعد');
  } else {
    trail.forEach((entry, i) => {
      drawTimelineEntry(ctx, {
        index: i + 1,
        action: safe(entry.action),
        actor: safe(entry.actor?.fullName || entry.actorName),
        role: entry.actor?.role || '',
        date: entry.occurredAt,
        beforeStatus: safe(entry.beforeStatusLabel || entry.beforeStatus),
        afterStatus: safe(entry.afterStatusLabel || entry.afterStatus),
        notes: entry.notes || '',
      });
    });
  }

  /* ── Section: الصور والمرفقات ── */
  const images = report?.images || [];
  if (images.length > 0) {
    ctx.doc.moveDown(0.6);
    drawSectionTitle(ctx, `الصور والمرفقات  ( ${images.length} )`);
    ctx.doc.moveDown(0.3);
    images.forEach((image, i) => {
      const imgUrl = image?.publicUrl || image?.url || '';
      const localPath   = resolveLocalImagePath(imgUrl, uploadRootDir);
      const fallbackUrl = resolveImageUrl(imgUrl, publicBaseUrl);
      drawImageFrame(ctx, {
        localPath,
        fallbackUrl,
        name: safe(image?.originalName || `صورة ${i + 1}`),
        comment: String(image?.comment || '').trim(),
        index: i,
      });
    });
  }

  /* ── Finalize ── */
  return finalize(ctx, { footerLabel: 'تقرير صيانة رسمي' });
};
