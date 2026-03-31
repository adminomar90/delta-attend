import {
  createDoc,
  finalize,
  safe,
  fmtDate,
  fmtDateTime,
  drawHeader,
  drawSectionTitle,
  drawKpiCards,
  drawDataTable,
  drawBulletList,
  drawProgressBar,
  needPage,
  COLORS,
} from './pdfTemplate.js';
import {
  buildDailyWorkPlanExportRows,
  DailyWorkPlanStatus,
  dailyWorkPlanPriorityLabelMap,
  dailyWorkPlanStatusLabelMap,
  dailyWorkPlanTaskTypeLabelMap,
} from '../../application/services/dailyWorkPlanService.js';

const shortId = (value) => String(value?._id || value?.id || value || '').slice(-8).toUpperCase() || '-';

const formatShortDateTime = (value) => {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ar-IQ', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const truncate = (value, max = 38) => {
  const text = safe(value);
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3)).trim()}...`;
};

const resolvePersonLabel = (value) =>
  value?.fullName
  || value?.name
  || value?.employeeCode
  || value?.jobTitle
  || '';

const resolveRoleLabel = (value) =>
  value?.jobTitle
  || value?.role
  || '';

const resolvePlanStatusLabel = (plan) => dailyWorkPlanStatusLabelMap[plan?.status] || plan?.status || '-';
const resolvePlanPriorityLabel = (plan) => dailyWorkPlanPriorityLabelMap[plan?.priority] || plan?.priority || '-';
const resolvePlanTaskTypeLabel = (plan) => dailyWorkPlanTaskTypeLabelMap[plan?.taskType] || plan?.taskType || '-';

const resolveTimeRange = (plan) => [plan?.startTime, plan?.expectedEndTime].filter(Boolean).join(' - ') || '-';

const resolveAssigneeName = (assignee) =>
  assignee?.user?.fullName
  || assignee?.fullName
  || assignee?.user?.name
  || '-';

const resolveAssigneesLabel = (plan, { compact = false } = {}) => {
  const names = (plan?.assignees || []).map(resolveAssigneeName).filter((item) => item && item !== '-');
  if (!names.length) return '-';
  if (!compact || names.length <= 2) return names.join('، ');
  return `${names.slice(0, 2).join('، ')} +${names.length - 2}`;
};

const resolveArchiveLabel = (plan) => (plan?.archived ? 'مؤرشف' : 'غير مؤرشف');

const resolveStatusColor = (plan) => {
  if (plan?.archived) return COLORS.gold;
  switch (plan?.status) {
    case DailyWorkPlanStatus.COMPLETED:
      return COLORS.success;
    case DailyWorkPlanStatus.PENDING_APPROVAL:
      return COLORS.accent;
    case DailyWorkPlanStatus.OVERDUE:
      return COLORS.danger;
    case DailyWorkPlanStatus.IN_PROGRESS:
      return COLORS.warning;
    default:
      return COLORS.blue;
  }
};

const drawSubsectionTitle = (ctx, label) => {
  needPage(ctx, 22);
  const { doc, FB, ML, CW } = ctx;
  const y = doc.y;
  doc.font(FB).fontSize(9).fillColor(COLORS.accent);
  doc.text(label, ML, y, { width: CW, align: 'right', features: ['arab'] });
  doc.moveTo(ML, y + 14).lineTo(ML + CW, y + 14).strokeColor(COLORS.border).lineWidth(0.5).stroke();
  doc.y = y + 18;
  doc.fillColor(COLORS.text);
};

const drawInfoRows = (ctx, items = []) => {
  const rows = items.filter((item) => item && item.value !== undefined && item.value !== null && String(item.value).trim() !== '');
  if (!rows.length) return;

  const { doc, F, FB, ML, CW } = ctx;
  const labelW = Math.max(130, CW * 0.28);
  const valueW = CW - labelW;

  rows.forEach((item, index) => {
    const label = safe(item.label);
    const value = safe(item.value);
    const textH = doc.heightOfString(value, {
      width: valueW - 12,
      align: 'right',
      features: ['arab'],
    });
    const rowH = Math.max(22, textH + 10);
    needPage(ctx, rowH + 2);
    const y = doc.y;
    const labelX = ML + CW - labelW;
    const bg = index % 2 === 0 ? COLORS.rowEven : COLORS.rowOdd;

    doc.rect(ML, y, CW, rowH).fill(bg);
    doc.rect(labelX, y, labelW, rowH).fillAndStroke(COLORS.lightBlue, COLORS.border);
    doc.rect(ML, y, CW, rowH).lineWidth(0.35).strokeColor(COLORS.border).stroke();

    doc.font(FB).fontSize(8.5).fillColor(COLORS.navy);
    doc.text(label, labelX + 6, y + 5, {
      width: labelW - 12,
      align: 'right',
      features: ['arab'],
    });

    doc.font(F).fontSize(8.5).fillColor(COLORS.text);
    doc.text(value, ML + 6, y + 5, {
      width: valueW - 12,
      align: 'right',
      features: ['arab'],
    });

    doc.y = y + rowH;
  });

  doc.moveDown(0.25);
};

const drawWrappedTextBlock = (ctx, label, value) => {
  const text = safe(value);
  if (text === '-') return;

  const { doc, F, FB, ML, CW } = ctx;
  const textH = doc.heightOfString(text, {
    width: CW - 16,
    align: 'right',
    features: ['arab'],
  });
  const boxH = Math.max(26, textH + 12);

  needPage(ctx, boxH + 24);

  doc.moveDown(0.15);
  doc.font(FB).fontSize(9).fillColor(COLORS.accent);
  doc.text(label, ML, doc.y, { width: CW, align: 'right', features: ['arab'] });
  doc.moveDown(0.15);

  const y = doc.y;
  doc.roundedRect(ML, y, CW, boxH, 4).fillAndStroke(COLORS.paleBlue, COLORS.border);
  doc.font(F).fontSize(8.5).fillColor(COLORS.text);
  doc.text(text, ML + 8, y + 6, {
    width: CW - 16,
    align: 'right',
    features: ['arab'],
  });
  doc.y = y + boxH + 8;
};

const drawPlanHeader = (ctx, plan, index) => {
  needPage(ctx, 48);
  const { doc, F, FB, ML, CW } = ctx;
  const y = doc.y;
  const accentColor = resolveStatusColor(plan);
  const metaLine = [
    `الحالة: ${resolvePlanStatusLabel(plan)}`,
    `الأولوية: ${resolvePlanPriorityLabel(plan)}`,
    `الإنجاز: ${Number(plan?.progressPercent || 0)}%`,
    `التاريخ: ${fmtDate(plan?.planDate)}`,
  ].join('   |   ');

  doc.roundedRect(ML, y, CW, 24, 4).fill(COLORS.navy);
  doc.rect(ML + CW - 6, y, 6, 24).fill(accentColor);

  doc.circle(ML + 14, y + 12, 8).fill(accentColor);
  doc.font(FB).fontSize(8).fillColor(COLORS.white);
  doc.text(`${index + 1}`, ML + 6, y + 8, { width: 16, align: 'center' });

  doc.font(FB).fontSize(9.5).fillColor(COLORS.white);
  doc.text(`${safe(plan?.title)}  |  ${shortId(plan)}`, ML + 28, y + 6, {
    width: CW - 42,
    align: 'right',
    lineBreak: false,
    features: ['arab'],
  });

  doc.font(F).fontSize(8).fillColor(COLORS.soft);
  doc.text(metaLine, ML, y + 30, { width: CW, align: 'right', features: ['arab'] });
  doc.y = y + 44;
  doc.fillColor(COLORS.text);
};

const buildSummaryMetrics = (plans = []) => {
  const completed = plans.filter((plan) => plan.status === DailyWorkPlanStatus.COMPLETED).length;
  const pendingApproval = plans.filter((plan) => plan.status === DailyWorkPlanStatus.PENDING_APPROVAL).length;
  const overdue = plans.filter((plan) => plan.status === DailyWorkPlanStatus.OVERDUE).length;
  const archived = plans.filter((plan) => plan.archived).length;
  const open = plans.filter((plan) => plan.status !== DailyWorkPlanStatus.COMPLETED).length;
  return {
    completed,
    pendingApproval,
    overdue,
    archived,
    open,
  };
};

const buildAssigneeTableRows = (plan) =>
  (plan?.assignees || []).map((assignee) => [
    safe(resolveAssigneeName(assignee)),
    safe(dailyWorkPlanStatusLabelMap[assignee?.status] || assignee?.status || '-'),
    `${Math.max(0, Math.min(100, Number(assignee?.progressPercent || 0)))}%`,
    `${Number(assignee?.pointsAwarded || 0)}`,
    assignee?.teamLeaderRating === 0 || assignee?.teamLeaderRating ? `${assignee.teamLeaderRating}%` : '-',
    formatShortDateTime(assignee?.lastUpdatedAt),
  ]);

const buildAssigneeNotes = (plan) =>
  (plan?.assignees || []).flatMap((assignee) => {
    const name = resolveAssigneeName(assignee);
    const notes = [];
    if (assignee?.employeeNotes) notes.push(`${name}: ملاحظة الموظف - ${safe(assignee.employeeNotes)}`);
    if (assignee?.adminNotes) notes.push(`${name}: ملاحظة الإدارة - ${safe(assignee.adminNotes)}`);
    if (assignee?.delayRequest?.reason) notes.push(`${name}: سبب طلب التأجيل - ${safe(assignee.delayRequest.reason)}`);
    if (Array.isArray(assignee?.attachments) && assignee.attachments.length) {
      notes.push(`${name}: عدد مرفقات التنفيذ ${assignee.attachments.length}`);
    }
    return notes;
  });

const buildTopLevelAttachments = (plan) =>
  (plan?.attachments || []).map((attachment, index) => {
    const label = attachment?.originalName || attachment?.fileName || `مرفق ${index + 1}`;
    const comment = attachment?.comment ? ` - ${safe(attachment.comment)}` : '';
    return `${label}${comment}`;
  });

const buildTimelineLines = (plan) =>
  (plan?.timeline || []).slice(-6).map((entry) => {
    const actor = entry?.actorName ? `${safe(entry.actorName)}${entry?.actorRole ? ` (${safe(entry.actorRole)})` : ''}` : 'النظام';
    return `${formatShortDateTime(entry?.createdAt)} - ${actor}: ${safe(entry?.message || entry?.type)}`;
  });

const buildPlanInfoRows = (plan) => {
  const createdBy = resolvePersonLabel(plan?.createdBy);
  const supervisor = resolvePersonLabel(plan?.supervisor);
  const teamLeader = resolvePersonLabel(plan?.teamLeader);
  const approvedBy = resolvePersonLabel(plan?.approvedBy);
  const archivedBy = resolvePersonLabel(plan?.archivedBy);

  return [
    { label: 'رقم البلان', value: shortId(plan) },
    { label: 'تاريخ البلان', value: fmtDate(plan?.planDate) },
    { label: 'الوقت المخطط', value: resolveTimeRange(plan) },
    { label: 'الموعد النهائي', value: plan?.dueAt ? fmtDateTime(plan.dueAt) : '' },
    { label: 'الحالة', value: resolvePlanStatusLabel(plan) },
    { label: 'نوع المهمة', value: resolvePlanTaskTypeLabel(plan) },
    { label: 'الأولوية', value: resolvePlanPriorityLabel(plan) },
    { label: 'نسبة الإنجاز', value: `${Math.max(0, Math.min(100, Number(plan?.progressPercent || 0)))}%` },
    { label: 'حالة الأرشفة', value: resolveArchiveLabel(plan) },
    { label: 'المشروع', value: plan?.project?.name || plan?.projectNameSnapshot || '' },
    { label: 'العميل', value: plan?.customerName || '' },
    { label: 'الموقع', value: plan?.location || '' },
    { label: 'المنشئ', value: createdBy ? `${createdBy}${resolveRoleLabel(plan?.createdBy) ? ` - ${resolveRoleLabel(plan.createdBy)}` : ''}` : '' },
    { label: 'المشرف', value: supervisor ? `${supervisor}${resolveRoleLabel(plan?.supervisor) ? ` - ${resolveRoleLabel(plan.supervisor)}` : ''}` : '' },
    { label: 'قائد الفريق', value: teamLeader ? `${teamLeader}${resolveRoleLabel(plan?.teamLeader) ? ` - ${resolveRoleLabel(plan.teamLeader)}` : ''}` : '' },
    { label: 'المكلفون', value: resolveAssigneesLabel(plan) },
    { label: 'تاريخ الإنشاء', value: plan?.createdAt ? fmtDateTime(plan.createdAt) : '' },
    { label: 'آخر تحديث', value: plan?.lastUpdatedAt ? fmtDateTime(plan.lastUpdatedAt) : '' },
    { label: 'المعتمد بواسطة', value: approvedBy || '' },
    { label: 'تاريخ الاعتماد', value: plan?.approvedAt ? fmtDateTime(plan.approvedAt) : '' },
    { label: 'مؤرشف بواسطة', value: archivedBy || '' },
    { label: 'تاريخ الأرشفة', value: plan?.archivedAt ? fmtDateTime(plan.archivedAt) : '' },
    { label: 'التاريخ الأصلي', value: plan?.originalPlanDate ? fmtDate(plan.originalPlanDate) : '' },
    { label: 'تاريخ التأجيل', value: plan?.postponedTo ? fmtDateTime(plan.postponedTo) : '' },
    { label: 'إجمالي النقاط', value: `${Number(plan?.pointsAwardedTotal || 0)}` },
    { label: 'عدد مرات الترحيل', value: `${Number(plan?.rolledOverCount || 0)}` },
    { label: 'عدد المرفقات', value: `${Array.isArray(plan?.attachments) ? plan.attachments.length : 0}` },
  ];
};

const buildExecutiveContextLines = (context = {}) => {
  const lines = [];
  if (context?.subtitle) lines.push(context.subtitle);
  if (context?.generatedBy) lines.push(`تم إعداد التقرير بواسطة: ${safe(context.generatedBy)}`);
  if (context?.generatedAt) lines.push(`تاريخ ووقت الإصدار: ${fmtDateTime(context.generatedAt)}`);
  if (Array.isArray(context?.filtersSummary)) {
    context.filtersSummary.filter(Boolean).forEach((item) => lines.push(item));
  }
  return lines;
};

export const buildDailyWorkPlansPdfBuffer = async (plans = [], context = {}) => {
  const ctx = createDoc({ title: 'تقرير البلان اليومي الإداري' });
  const rows = buildDailyWorkPlanExportRows(plans);
  const metrics = buildSummaryMetrics(plans);

  drawHeader(ctx, {
    title: 'تقرير البلان اليومي الإداري',
    subtitle: context?.subtitle || 'نسخة تفصيلية منظمة للعرض على الإدارة العليا',
    date: context?.generatedAt || new Date(),
  });

  drawKpiCards(ctx, [
    { label: 'إجمالي البلانات', value: `${plans.length}` },
    { label: 'المكتملة', value: `${metrics.completed}` },
    { label: 'بانتظار الاعتماد', value: `${metrics.pendingApproval}` },
    { label: 'المتأخرة', value: `${metrics.overdue}` },
  ]);

  drawSectionTitle(ctx, 'الملخص التنفيذي');
  drawBulletList(
    ctx,
    [
      ...buildExecutiveContextLines(context),
      `عدد البلانات المؤرشفة ضمن التقرير: ${metrics.archived}`,
      `عدد البلانات المفتوحة أو غير المكتملة: ${metrics.open}`,
    ],
    'لا توجد ملاحظات إضافية.',
  );

  drawSectionTitle(ctx, 'الملخص الإداري السريع');

  if (!rows.length) {
    ctx.doc.font(ctx.F).fontSize(8.5).fillColor(COLORS.soft);
    ctx.doc.text('لا توجد بيانات متاحة للتصدير وفق نطاق البحث الحالي.', ctx.ML, ctx.doc.y, {
      width: ctx.CW,
      align: 'right',
      features: ['arab'],
    });
    ctx.doc.moveDown(0.5);
    return finalize(ctx, { footerLabel: 'تقرير البلان اليومي الإداري' });
  }

  drawDataTable(ctx, {
    headers: ['#', 'عنوان البلان', 'التاريخ', 'الوقت', 'الحالة', 'الأولوية', 'الإنجاز', 'الأرشفة', 'جهة التنفيذ'],
    colWidths: [0.04, 0.22, 0.11, 0.13, 0.12, 0.1, 0.07, 0.07, 0.14],
    rows: plans.map((plan, index) => [
      `${index + 1}`,
      truncate(plan?.title, 34),
      fmtDate(plan?.planDate),
      truncate(resolveTimeRange(plan), 18),
      truncate(resolvePlanStatusLabel(plan), 16),
      truncate(resolvePlanPriorityLabel(plan), 14),
      `${Math.max(0, Math.min(100, Number(plan?.progressPercent || 0)))}%`,
      plan?.archived ? 'نعم' : 'لا',
      truncate(resolveAssigneesLabel(plan, { compact: true }), 24),
    ]),
  });

  drawSectionTitle(ctx, 'التفاصيل التنفيذية لكل بلان');

  plans.forEach((plan, index) => {
    needPage(ctx, 180);
    drawPlanHeader(ctx, plan, index);
    drawInfoRows(ctx, buildPlanInfoRows(plan));
    drawSubsectionTitle(ctx, 'مؤشر التقدم');
    drawProgressBar(ctx, Number(plan?.progressPercent || 0));

    drawWrappedTextBlock(ctx, 'وصف المهمة', plan?.description);
    drawWrappedTextBlock(ctx, 'ملاحظات الإدارة', plan?.adminNotes);

    const assigneeRows = buildAssigneeTableRows(plan);
    drawSubsectionTitle(ctx, 'تفصيل المكلفين');
    if (assigneeRows.length) {
      drawDataTable(ctx, {
        headers: ['المكلف', 'الحالة', 'الإنجاز', 'النقاط', 'التقييم', 'آخر تحديث'],
        colWidths: [0.24, 0.18, 0.1, 0.1, 0.1, 0.28],
        rows: assigneeRows,
      });
    } else {
      drawBulletList(ctx, [], 'لا يوجد مكلفون مسجلون لهذا البلان.');
    }

    drawSubsectionTitle(ctx, 'ملاحظات ومرفقات التنفيذ');
    drawBulletList(ctx, buildAssigneeNotes(plan), 'لا توجد ملاحظات إضافية على مستوى المكلفين.');
    drawBulletList(ctx, buildTopLevelAttachments(plan), 'لا توجد مرفقات عامة على هذا البلان.');

    drawSubsectionTitle(ctx, 'التسلسل التنفيذي وآخر التحديثات');
    drawBulletList(ctx, buildTimelineLines(plan), 'لا توجد تحديثات مسجلة في التسلسل الزمني لهذا البلان.');

    if (index < plans.length - 1) {
      ctx.doc.moveDown(0.4);
    }
  });

  return finalize(ctx, { footerLabel: 'تقرير البلان اليومي الإداري' });
};
