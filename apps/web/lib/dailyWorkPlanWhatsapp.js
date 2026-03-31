'use client';

import {
  DailyWorkPlanStatus,
  dailyWorkPlanPriorityLabelMap,
  dailyWorkPlanStatusLabelMap,
  dailyWorkPlanTaskTypeLabelMap,
  formatDate,
} from './dailyWorkPlans';

const formatTime12 = (value) => {
  const normalizedValue = String(value || '').trim();
  if (!/^\d{2}:\d{2}$/.test(normalizedValue)) {
    return '';
  }

  const [hours, minutes] = normalizedValue.split(':').map(Number);
  const date = new Date(Date.UTC(2026, 0, 1, hours || 0, minutes || 0, 0, 0));
  return date.toLocaleTimeString('ar-IQ', {
    timeZone: 'UTC',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const formatDateTime12 = (value) => {
  if (!value) {
    return '-';
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleString('ar-IQ', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const formatPlanTimeRange = (plan = {}) => {
  const startTime = formatTime12(plan.startTime);
  const endTime = formatTime12(plan.expectedEndTime);
  return [startTime, endTime].filter(Boolean).join(' - ') || '-';
};

const buildAssigneeWhatsappLines = (assignees = []) => {
  const lines = (assignees || [])
    .map((item) => {
      const fullName = item.user?.fullName || item.fullName || 'موظف';
      const statusLabel = dailyWorkPlanStatusLabelMap[item.status] || item.status || '-';
      const progressPercent = Number(item.progressPercent || 0);
      return `- ${fullName}: ${statusLabel} (${progressPercent}%)`;
    })
    .filter(Boolean);

  return lines.length ? lines.join('\n') : '-';
};

export const buildDailyWorkPlanWhatsappMessage = (plan = {}) => {
  const statusLabel = plan.statusLabel || dailyWorkPlanStatusLabelMap[plan.status] || plan.status || '-';
  const priorityLabel = plan.priorityLabel || dailyWorkPlanPriorityLabelMap[plan.priority] || plan.priority || '-';
  const taskTypeLabel = plan.taskTypeLabel || dailyWorkPlanTaskTypeLabelMap[plan.taskType] || plan.taskType || '-';
  const projectName = plan.project?.name || plan.projectNameSnapshot || '-';
  const supervisorName = plan.supervisor?.fullName || plan.supervisor?.name || '-';
  const attachmentsCount = Array.isArray(plan.attachments) ? plan.attachments.length : 0;
  const approvalLabel = plan.isApproved || plan.status === DailyWorkPlanStatus.COMPLETED
    ? 'معتمدة'
    : plan.status === DailyWorkPlanStatus.PENDING_APPROVAL
      ? 'بانتظار الاعتماد'
      : 'غير معتمدة';

  const lines = [
    '[ بلان العمل اليومي - Delta Plus ]',
    '----------------------------------',
    `عنوان الخطة: ${plan.title || '-'}`,
    `الحالة الحالية: ${statusLabel}`,
    `الأولوية: ${priorityLabel}`,
    `نوع المهمة: ${taskTypeLabel}`,
    `التاريخ: ${formatDate(plan.planDate)}`,
    `الوقت: ${formatPlanTimeRange(plan)}`,
    `الجهة / الزبون: ${plan.customerName || '-'}`,
    `المشروع: ${projectName}`,
    `الموقع: ${plan.location || '-'}`,
    `المشرف المسؤول: ${supervisorName}`,
    `نسبة الإنجاز العامة: ${Number(plan.progressPercent || 0)}%`,
    `الاعتماد: ${approvalLabel}`,
    `عدد المرفقات: ${attachmentsCount}`,
  ];

  if (plan.originalPlanDate) {
    lines.push(`التاريخ الأصلي: ${formatDate(plan.originalPlanDate)}`);
  }

  if (plan.postponedTo) {
    lines.push(`مؤجلة إلى: ${formatDateTime12(plan.postponedTo)}`);
  }

  lines.push(
    '',
    'الموظفون المكلفون:',
    buildAssigneeWhatsappLines(plan.assignees),
    '',
    'وصف العمل:',
    plan.description || '-',
    '',
    'ملاحظات الإدارة:',
    plan.adminNotes || '-',
    '',
    `آخر تحديث: ${formatDateTime12(plan.lastUpdatedAt)}`,
    '----------------------------------',
    '[ رسالة جاهزة من نظام Delta Plus ]',
  );

  return lines.join('\n');
};

export const buildDailyWorkPlanArchiveWhatsappMessage = (plans = [], { search = '' } = {}) => {
  const archivedPlans = Array.isArray(plans) ? plans : [];
  const approvedCount = archivedPlans.filter((plan) => plan.isApproved || plan.status === DailyWorkPlanStatus.COMPLETED).length;
  const pendingApprovalCount = archivedPlans.filter((plan) => plan.status === DailyWorkPlanStatus.PENDING_APPROVAL).length;
  const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' });
  const archivedTodayCount = archivedPlans.filter((plan) => {
    if (!plan.archivedAt) return false;
    return new Date(plan.archivedAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' }) === todayKey;
  }).length;

  const lines = [
    '[ أرشيف البلان اليومي - Delta Plus ]',
    '----------------------------------',
    `عدد البلانات المؤرشفة: ${archivedPlans.length}`,
    `المكتملة/المعتمدة: ${approvedCount}`,
    `بانتظار الاعتماد: ${pendingApprovalCount}`,
    `المؤرشفة اليوم: ${archivedTodayCount}`,
  ];

  if (search) {
    lines.push(`مرشح البحث: ${search}`);
  }

  lines.push('', 'آخر البلانات المؤرشفة:');

  if (!archivedPlans.length) {
    lines.push('- لا توجد بلانات مؤرشفة مطابقة.');
  } else {
    archivedPlans.slice(0, 15).forEach((plan, index) => {
      const statusLabel = plan.statusLabel || dailyWorkPlanStatusLabelMap[plan.status] || plan.status || '-';
      const archivedAtLabel = formatDateTime12(plan.archivedAt);
      lines.push(
        `${index + 1}. ${plan.title || '-'} | ${formatDate(plan.planDate)} | ${statusLabel} | ${Number(plan.progressPercent || 0)}% | أرشفة: ${archivedAtLabel}`,
      );
    });
  }

  if (archivedPlans.length > 15) {
    lines.push(`... وباقي ${archivedPlans.length - 15} بلان/بلانات أخرى.`);
  }

  lines.push('----------------------------------', '[ رسالة جاهزة من نظام Delta Plus ]');
  return lines.join('\n');
};
