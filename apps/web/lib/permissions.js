'use client';

export const Permission = {
  MANAGE_USERS: 'MANAGE_USERS',
  MANAGE_USER_STATUS: 'MANAGE_USER_STATUS',
  RESET_USER_PASSWORDS: 'RESET_USER_PASSWORDS',
  MANAGE_PERMISSIONS: 'MANAGE_PERMISSIONS',
  MANAGE_PROJECTS: 'MANAGE_PROJECTS',
  APPROVE_PROJECTS: 'APPROVE_PROJECTS',
  MANAGE_TASKS: 'MANAGE_TASKS',
  APPROVE_TASKS: 'APPROVE_TASKS',
  VIEW_FINANCIAL_REPORTS: 'VIEW_FINANCIAL_REPORTS',
  VIEW_EXECUTIVE_REPORTS: 'VIEW_EXECUTIVE_REPORTS',
  VIEW_AUDIT_LOGS: 'VIEW_AUDIT_LOGS',
  VIEW_ANALYTICS: 'VIEW_ANALYTICS',
  MANAGE_GAMIFICATION: 'MANAGE_GAMIFICATION',
  MANAGE_MATERIAL_CATALOG: 'MANAGE_MATERIAL_CATALOG',
  MANAGE_MATERIAL_INVENTORY: 'MANAGE_MATERIAL_INVENTORY',
  CREATE_MATERIAL_REQUESTS: 'CREATE_MATERIAL_REQUESTS',
  REVIEW_MATERIAL_REQUESTS: 'REVIEW_MATERIAL_REQUESTS',
  PREPARE_MATERIAL_REQUESTS: 'PREPARE_MATERIAL_REQUESTS',
  DISPATCH_MATERIAL_REQUESTS: 'DISPATCH_MATERIAL_REQUESTS',
  RECONCILE_MATERIAL_CUSTODY: 'RECONCILE_MATERIAL_CUSTODY',
  CLOSE_MATERIAL_CUSTODY: 'CLOSE_MATERIAL_CUSTODY',
  VIEW_MATERIAL_REPORTS: 'VIEW_MATERIAL_REPORTS',
};

const RolePermissions = {
  GENERAL_MANAGER: Object.values(Permission),
  HR_MANAGER: [
    Permission.MANAGE_USERS,
    Permission.MANAGE_USER_STATUS,
    Permission.RESET_USER_PASSWORDS,
    Permission.MANAGE_PERMISSIONS,
    Permission.VIEW_ANALYTICS,
    Permission.VIEW_EXECUTIVE_REPORTS,
  ],
  FINANCIAL_MANAGER: [
    Permission.APPROVE_PROJECTS,
    Permission.VIEW_FINANCIAL_REPORTS,
    Permission.VIEW_ANALYTICS,
    Permission.VIEW_EXECUTIVE_REPORTS,
    Permission.VIEW_MATERIAL_REPORTS,
    Permission.REVIEW_MATERIAL_REQUESTS,
    Permission.CLOSE_MATERIAL_CUSTODY,
  ],
  PROJECT_MANAGER: [
    Permission.MANAGE_PROJECTS,
    Permission.APPROVE_PROJECTS,
    Permission.MANAGE_TASKS,
    Permission.APPROVE_TASKS,
    Permission.VIEW_ANALYTICS,
    Permission.VIEW_EXECUTIVE_REPORTS,
    Permission.CREATE_MATERIAL_REQUESTS,
    Permission.REVIEW_MATERIAL_REQUESTS,
    Permission.PREPARE_MATERIAL_REQUESTS,
    Permission.DISPATCH_MATERIAL_REQUESTS,
    Permission.RECONCILE_MATERIAL_CUSTODY,
    Permission.CLOSE_MATERIAL_CUSTODY,
    Permission.VIEW_MATERIAL_REPORTS,
  ],
  ASSISTANT_PROJECT_MANAGER: [
    Permission.MANAGE_PROJECTS,
    Permission.APPROVE_PROJECTS,
    Permission.MANAGE_TASKS,
    Permission.APPROVE_TASKS,
    Permission.VIEW_ANALYTICS,
    Permission.CREATE_MATERIAL_REQUESTS,
    Permission.REVIEW_MATERIAL_REQUESTS,
    Permission.PREPARE_MATERIAL_REQUESTS,
    Permission.DISPATCH_MATERIAL_REQUESTS,
    Permission.RECONCILE_MATERIAL_CUSTODY,
    Permission.VIEW_MATERIAL_REPORTS,
  ],
  TEAM_LEAD: [
    Permission.MANAGE_TASKS,
    Permission.APPROVE_TASKS,
    Permission.VIEW_ANALYTICS,
    Permission.CREATE_MATERIAL_REQUESTS,
    Permission.REVIEW_MATERIAL_REQUESTS,
    Permission.PREPARE_MATERIAL_REQUESTS,
    Permission.DISPATCH_MATERIAL_REQUESTS,
    Permission.RECONCILE_MATERIAL_CUSTODY,
  ],
  TECHNICAL_STAFF: [
    Permission.CREATE_MATERIAL_REQUESTS,
    Permission.RECONCILE_MATERIAL_CUSTODY,
  ],
};

export const permissionLabelMap = {
  [Permission.MANAGE_USERS]: 'إدارة الموظفين',
  [Permission.MANAGE_USER_STATUS]: 'تفعيل/تعطيل الموظفين',
  [Permission.RESET_USER_PASSWORDS]: 'إعادة تعيين كلمات المرور',
  [Permission.MANAGE_PERMISSIONS]: 'إدارة الصلاحيات',
  [Permission.MANAGE_PROJECTS]: 'إدارة المشاريع',
  [Permission.APPROVE_PROJECTS]: 'اعتماد المشاريع',
  [Permission.MANAGE_TASKS]: 'إدارة المهام',
  [Permission.APPROVE_TASKS]: 'اعتماد المهام',
  [Permission.VIEW_FINANCIAL_REPORTS]: 'عرض التقارير المالية',
  [Permission.VIEW_EXECUTIVE_REPORTS]: 'عرض التقارير التنفيذية',
  [Permission.VIEW_AUDIT_LOGS]: 'عرض سجل التدقيق',
  [Permission.VIEW_ANALYTICS]: 'عرض التحليلات',
  [Permission.MANAGE_GAMIFICATION]: 'إدارة نظام النقاط والمستويات',
  [Permission.MANAGE_MATERIAL_CATALOG]: 'إدارة كتلوج المواد',
  [Permission.MANAGE_MATERIAL_INVENTORY]: 'إدارة مخزون المواد',
  [Permission.CREATE_MATERIAL_REQUESTS]: 'إنشاء طلبات المواد',
  [Permission.REVIEW_MATERIAL_REQUESTS]: 'مراجعة/اعتماد طلبات المواد',
  [Permission.PREPARE_MATERIAL_REQUESTS]: 'تجهيز طلبات المواد',
  [Permission.DISPATCH_MATERIAL_REQUESTS]: 'تسليم طلبات المواد',
  [Permission.RECONCILE_MATERIAL_CUSTODY]: 'تصفية ذمم المواد',
  [Permission.CLOSE_MATERIAL_CUSTODY]: 'إغلاق ذمم المواد',
  [Permission.VIEW_MATERIAL_REPORTS]: 'عرض تقارير المواد',
};

export const resolveUserPermissions = (user = {}) => {
  const rolePermissions = RolePermissions[user.role] || [];
  const customPermissions = Array.isArray(user.customPermissions) ? user.customPermissions : [];
  const explicitPermissions = Array.isArray(user.permissions) ? user.permissions : [];
  return [...new Set([...rolePermissions, ...customPermissions, ...explicitPermissions])];
};

export const hasPermission = (user, permission) => resolveUserPermissions(user).includes(permission);

export const hasAnyPermission = (user, required = []) =>
  required.some((permission) => hasPermission(user, permission));
