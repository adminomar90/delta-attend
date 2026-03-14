/**
 * Materials Report PDF — rebuilt on the unified template.
 */

import {
  createDoc, finalize, safe,
  drawHeader, drawSectionTitle, drawKpiCards, drawDataTable,
  COLORS,
} from './pdfTemplate.js';

export const buildMaterialsPdfBuffer = async ({
  generatedAt = new Date(),
  requests = [],
  dispatches = [],
  openCustodies = [],
  reconciliations = [],
  movement = [],
  projectSummary = [],
} = {}) => {
  const ctx = createDoc({ title: 'تقارير إدارة المواد' });

  /* ── Header ── */
  drawHeader(ctx, {
    title: 'تقارير إدارة المواد',
    date: generatedAt,
  });

  /* ── KPI Cards ── */
  drawKpiCards(ctx, [
    { label: 'طلبات المواد',   value: `${requests.length}` },
    { label: 'التسليمات',      value: `${dispatches.length}` },
    { label: 'الذمم المفتوحة', value: `${openCustodies.length}` },
    { label: 'التصفيات',       value: `${reconciliations.length}` },
  ]);

  /* ── Section 1: طلبات المواد ── */
  drawSectionTitle(ctx, 'طلبات المواد');
  if (requests.length) {
    drawDataTable(ctx, {
      headers: ['#', 'رقم الطلب', 'المشروع', 'مقدم الطلب', 'الحالة', 'البنود'],
      colWidths: [0.05, 0.15, 0.25, 0.22, 0.18, 0.15],
      rows: requests.map((r, i) => [
        `${i + 1}`, safe(r.requestNo), safe(r.projectName), safe(r.requestedBy), safe(r.status), safe(r.itemsCount),
      ]),
    });
  } else {
    ctx.doc.font(ctx.F).fontSize(8.5).fillColor(COLORS.soft);
    ctx.doc.text('لا توجد طلبات مواد.', ctx.ML, ctx.doc.y, { width: ctx.CW, align: 'right', features: ['arab'] });
    ctx.doc.moveDown(0.5);
  }

  /* ── Section 2: التجهيز والتسليم ── */
  ctx.doc.moveDown(0.3);
  drawSectionTitle(ctx, 'التجهيز والتسليم');
  if (dispatches.length) {
    drawDataTable(ctx, {
      headers: ['#', 'رقم السند', 'الطلب', 'المشروع', 'المستلم', 'الكمية', 'الحالة'],
      colWidths: [0.05, 0.12, 0.12, 0.22, 0.18, 0.13, 0.18],
      rows: dispatches.map((r, i) => [
        `${i + 1}`, safe(r.dispatchNo), safe(r.requestNo), safe(r.projectName), safe(r.recipient), safe(r.deliveredQty), safe(r.status),
      ]),
    });
  } else {
    ctx.doc.font(ctx.F).fontSize(8.5).fillColor(COLORS.soft);
    ctx.doc.text('لا توجد تسليمات.', ctx.ML, ctx.doc.y, { width: ctx.CW, align: 'right', features: ['arab'] });
    ctx.doc.moveDown(0.5);
  }

  /* ── Section 3: الذمم المفتوحة ── */
  ctx.doc.moveDown(0.3);
  drawSectionTitle(ctx, 'الذمم المفتوحة');
  if (openCustodies.length) {
    drawDataTable(ctx, {
      headers: ['#', 'رقم الذمة', 'الموظف', 'المشروع', 'المستلم', 'المصروف', 'المتبقي', 'الحالة'],
      colWidths: [0.04, 0.10, 0.18, 0.18, 0.12, 0.12, 0.12, 0.14],
      rows: openCustodies.map((r, i) => [
        `${i + 1}`, safe(r.custodyNo), safe(r.holder), safe(r.projectName), safe(r.receivedQty), safe(r.consumedQty), safe(r.remainingQty), safe(r.status),
      ]),
    });
  } else {
    ctx.doc.font(ctx.F).fontSize(8.5).fillColor(COLORS.soft);
    ctx.doc.text('لا توجد ذمم مفتوحة.', ctx.ML, ctx.doc.y, { width: ctx.CW, align: 'right', features: ['arab'] });
    ctx.doc.moveDown(0.5);
  }

  /* ── Section 4: التصفية ── */
  ctx.doc.moveDown(0.3);
  drawSectionTitle(ctx, 'التصفيات');
  if (reconciliations.length) {
    drawDataTable(ctx, {
      headers: ['#', 'التصفية', 'الذمة', 'المشروع', 'المصروف', 'المرجع', 'التالف', 'المفقود', 'الحالة'],
      colWidths: [0.04, 0.10, 0.10, 0.16, 0.11, 0.11, 0.11, 0.11, 0.16],
      rows: reconciliations.map((r, i) => [
        `${i + 1}`, safe(r.reconcileNo), safe(r.custodyNo), safe(r.projectName), safe(r.consumedQty), safe(r.toReturnQty), safe(r.damagedQty), safe(r.lostQty), safe(r.status),
      ]),
    });
  } else {
    ctx.doc.font(ctx.F).fontSize(8.5).fillColor(COLORS.soft);
    ctx.doc.text('لا توجد تصفيات.', ctx.ML, ctx.doc.y, { width: ctx.CW, align: 'right', features: ['arab'] });
    ctx.doc.moveDown(0.5);
  }

  /* ── Section 5: حركة المادة ── */
  if (movement.length) {
    ctx.doc.moveDown(0.3);
    drawSectionTitle(ctx, 'حركة المادة');
    drawDataTable(ctx, {
      headers: ['#', 'التاريخ', 'المادة', 'المخزن', 'النوع', 'الكمية', 'المرجع'],
      colWidths: [0.04, 0.14, 0.20, 0.16, 0.16, 0.12, 0.18],
      rows: movement.map((r, i) => [
        `${i + 1}`, safe(r.date), safe(r.materialName), safe(r.warehouse), safe(r.transactionType), safe(r.quantity), safe(r.referenceId),
      ]),
    });
  }

  /* ── Section 6: حسب المشروع ── */
  if (projectSummary.length) {
    ctx.doc.moveDown(0.3);
    drawSectionTitle(ctx, 'ملخص حسب المشروع');
    drawDataTable(ctx, {
      headers: ['المشروع', 'الطلبات', 'المطلوبة', 'المجهزة', 'المصروفة', 'المرجعة', 'المتبقي'],
      colWidths: [0.22, 0.12, 0.12, 0.12, 0.14, 0.14, 0.14],
      rows: projectSummary.map((r) => [
        safe(r.projectName), safe(r.requestsCount), safe(r.requestedQty), safe(r.preparedQty), safe(r.consumedQty), safe(r.returnedQty), safe(r.remainingQty),
      ]),
    });
  }

  /* ── Finalize ── */
  return finalize(ctx, { footerLabel: 'تقرير إدارة المواد' });
};
