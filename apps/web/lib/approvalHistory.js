'use client';

export const approvalOperationTypeOptions = [
  { value: '', label: 'كل الأنواع' },
  { value: 'task', label: 'مهمة' },
  { value: 'project', label: 'مشروع' },
  { value: 'work-report', label: 'تقرير عمل' },
  { value: 'attendance', label: 'حضور وانصراف' },
  { value: 'material-request', label: 'طلب مواد' },
  { value: 'material-reconciliation', label: 'تصفية مواد' },
];

export const approvalOperationTypeLabelMap = Object.fromEntries(
  approvalOperationTypeOptions.filter((option) => option.value).map((option) => [option.value, option.label]),
);

export const approvalStatusLabelMap = {
  APPROVED: 'معتمد',
  ACTIVE: 'نشط',
  ON_HOLD: 'معلق',
  DONE: 'مكتمل',
  PREPARING: 'قيد التجهيز',
  PREPARED: 'مجهز',
  DELIVERED: 'مسلّم',
  PENDING_RECONCILIATION: 'بانتظار التصفية',
  RECONCILED: 'تمت التصفية',
  CLOSED: 'مغلق',
};

export const roleLabelMap = {
  GENERAL_MANAGER: 'مدير عام',
  HR_MANAGER: 'مدير موارد بشرية',
  FINANCIAL_MANAGER: 'مدير مالي',
  PROJECT_MANAGER: 'مدير مشروع',
  ASSISTANT_PROJECT_MANAGER: 'مساعد مدير مشروع',
  TEAM_LEAD: 'قائد فريق',
  TECHNICAL_STAFF: 'موظف فني',
};

export const permissionLabelMap = {
  APPROVE_TASKS: 'اعتماد المهام',
  APPROVE_PROJECTS: 'اعتماد المشاريع',
  REVIEW_MATERIAL_REQUESTS: 'مراجعة واعتماد المواد',
};

export const formatDateTime = (value) => {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString('ar-IQ');
};

export const formatDate = (value) => {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleDateString('ar-IQ');
};

export const formatPoints = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0';
};

export const buildApprovalHistoryQuery = (filters = {}) => {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }

    params.set(key, String(value));
  });

  const query = params.toString();
  return query ? `?${query}` : '';
};

export const downloadBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
};
