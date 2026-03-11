import { Permission, RolePermissions } from '../../shared/constants.js';
import { AppError } from '../../shared/errors.js';

export const resolvePermissions = (user = {}) => {
  const rolePermissions = RolePermissions[user.role] || [];
  const customPermissions = Array.isArray(user.customPermissions) ? user.customPermissions : [];
  return [...new Set([...rolePermissions, ...customPermissions])];
};

export const requirePermission = (permission) => (req, res, next) => {
  const permissions = resolvePermissions(req.user);

  if (!permissions.includes(permission)) {
    return next(new AppError('Insufficient permissions', 403));
  }

  return next();
};

export const requireAnyPermission = (...requiredPermissions) => (req, res, next) => {
  const permissions = resolvePermissions(req.user);

  if (!requiredPermissions.some((permission) => permissions.includes(permission))) {
    return next(new AppError('Insufficient permissions', 403));
  }

  return next();
};

export const canApproveTasks = requirePermission(Permission.APPROVE_TASKS);
export const canManageTasks = requirePermission(Permission.MANAGE_TASKS);
export const canManageProjects = requirePermission(Permission.MANAGE_PROJECTS);
export const canApproveProjects = requirePermission(Permission.APPROVE_PROJECTS);
export const canManageUsers = requirePermission(Permission.MANAGE_USERS);
export const canManageUserStatus = requirePermission(Permission.MANAGE_USER_STATUS);
export const canResetUserPasswords = requirePermission(Permission.RESET_USER_PASSWORDS);
export const canManagePermissions = requirePermission(Permission.MANAGE_PERMISSIONS);
export const canViewAuditLogs = requirePermission(Permission.VIEW_AUDIT_LOGS);
export const canViewAnalytics = requirePermission(Permission.VIEW_ANALYTICS);
export const canManageGamification = requirePermission(Permission.MANAGE_GAMIFICATION);
export const canViewExecutiveReports = requirePermission(Permission.VIEW_EXECUTIVE_REPORTS);
export const canViewFinancialReports = requirePermission(Permission.VIEW_FINANCIAL_REPORTS);
export const canManageMaterialCatalog = requirePermission(Permission.MANAGE_MATERIAL_CATALOG);
export const canManageMaterialInventory = requirePermission(Permission.MANAGE_MATERIAL_INVENTORY);
export const canCreateMaterialRequests = requirePermission(Permission.CREATE_MATERIAL_REQUESTS);
export const canReviewMaterialRequests = requirePermission(Permission.REVIEW_MATERIAL_REQUESTS);
export const canPrepareMaterialRequests = requirePermission(Permission.PREPARE_MATERIAL_REQUESTS);
export const canDispatchMaterialRequests = requirePermission(Permission.DISPATCH_MATERIAL_REQUESTS);
export const canReconcileMaterialCustody = requirePermission(Permission.RECONCILE_MATERIAL_CUSTODY);
export const canCloseMaterialCustody = requirePermission(Permission.CLOSE_MATERIAL_CUSTODY);
export const canViewMaterialReports = requirePermission(Permission.VIEW_MATERIAL_REPORTS);
