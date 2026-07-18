import { Permission } from '../../shared/constants.js';
import { resolvePermissions } from '../../shared/permissions.js';
import { AppError } from '../../shared/errors.js';

export { resolvePermissions } from '../../shared/permissions.js';

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
export const canCreateFinancialDisbursements = requirePermission(Permission.CREATE_FINANCIAL_DISBURSEMENTS);
export const canReviewFinancialDisbursements = requirePermission(Permission.REVIEW_FINANCIAL_DISBURSEMENTS);
export const canEscalateFinancialDisbursements = requirePermission(Permission.ESCALATE_FINANCIAL_DISBURSEMENTS);
export const canDisburseFinancialFunds = requirePermission(Permission.DISBURSE_FINANCIAL_FUNDS);
export const canCreateMaintenanceReportRequests = requirePermission(Permission.CREATE_MAINTENANCE_REPORT_REQUESTS);
export const canHandleMaintenanceReports = requirePermission(Permission.HANDLE_MAINTENANCE_REPORTS);
export const canReviewMaintenanceReports = requirePermission(Permission.REVIEW_MAINTENANCE_REPORTS);
export const canViewMaintenanceReports = requirePermission(Permission.VIEW_MAINTENANCE_REPORTS);
export const canViewMaintenancePlans = requirePermission(Permission.VIEW_MAINTENANCE_PLANS);
export const canCreateMaintenancePlans = requirePermission(Permission.CREATE_MAINTENANCE_PLANS);
export const canManageMaintenancePlans = requirePermission(Permission.MANAGE_MAINTENANCE_PLANS);
export const canRegisterMaintenanceVisits = requirePermission(Permission.REGISTER_MAINTENANCE_VISITS);
export const canOverrideMaintenancePlanDuplicates = requirePermission(Permission.OVERRIDE_MAINTENANCE_PLAN_DUPLICATES);
export const canManageMaterialCatalog = requirePermission(Permission.MANAGE_MATERIAL_CATALOG);
export const canManageMaterialInventory = requirePermission(Permission.MANAGE_MATERIAL_INVENTORY);
export const canCreateMaterialRequests = requirePermission(Permission.CREATE_MATERIAL_REQUESTS);
export const canReviewMaterialRequests = requirePermission(Permission.REVIEW_MATERIAL_REQUESTS);
export const canPrepareMaterialRequests = requirePermission(Permission.PREPARE_MATERIAL_REQUESTS);
export const canDispatchMaterialRequests = requirePermission(Permission.DISPATCH_MATERIAL_REQUESTS);
export const canReconcileMaterialCustody = requirePermission(Permission.RECONCILE_MATERIAL_CUSTODY);
export const canCloseMaterialCustody = requirePermission(Permission.CLOSE_MATERIAL_CUSTODY);
export const canViewMaterialReports = requirePermission(Permission.VIEW_MATERIAL_REPORTS);
export const canViewAttendanceMonitor = requirePermission(Permission.VIEW_ATTENDANCE_MONITOR);
export const canCreateInternalNotifications = requirePermission(Permission.CREATE_INTERNAL_NOTIFICATIONS);
export const canViewEmployeesHierarchy = requirePermission(Permission.VIEW_EMPLOYEES_HIERARCHY);
export const canViewOwnWorkReports = requirePermission(Permission.VIEW_OWN_WORK_REPORTS);
export const canViewTeamWorkReports = requirePermission(Permission.VIEW_TEAM_WORK_REPORTS);
export const canViewLeaderboard = requirePermission(Permission.VIEW_LEADERBOARD);
export const canSendReportsWhatsapp = requirePermission(Permission.SEND_REPORTS_WHATSAPP);
export const canViewCompletedWorkReports = requirePermission(Permission.VIEW_COMPLETED_WORK_REPORTS);
export const canViewApprovalHistory = requirePermission(Permission.VIEW_APPROVAL_HISTORY);
export const canExportApprovalHistory = requirePermission(Permission.EXPORT_APPROVAL_HISTORY);
export const canViewDailyWorkPlans = requirePermission(Permission.VIEW_DAILY_WORK_PLANS);
export const canCreateDailyWorkPlans = requirePermission(Permission.CREATE_DAILY_WORK_PLANS);
export const canManageDailyWorkPlans = requirePermission(Permission.MANAGE_DAILY_WORK_PLANS);
export const canUpdateAssignedDailyWorkPlans = requirePermission(Permission.UPDATE_ASSIGNED_DAILY_WORK_PLANS);
export const canApproveDailyWorkPlans = requirePermission(Permission.APPROVE_DAILY_WORK_PLANS);
export const canExportDailyWorkPlans = requirePermission(Permission.EXPORT_DAILY_WORK_PLANS);
export const canViewCustomers = requirePermission(Permission.VIEW_CUSTOMERS);
export const canCreateCustomers = requirePermission(Permission.CREATE_CUSTOMERS);
export const canManageCustomers = requirePermission(Permission.MANAGE_CUSTOMERS);
export const canViewCustomerFinancialInfo = requirePermission(Permission.VIEW_CUSTOMER_FINANCIAL_INFO);
export const canViewSuppliers = requirePermission(Permission.VIEW_SUPPLIERS);
export const canViewApprovedSuppliers = requirePermission(Permission.VIEW_APPROVED_SUPPLIERS);
export const canCreateSuppliers = requirePermission(Permission.CREATE_SUPPLIERS);
export const canManageSuppliers = requirePermission(Permission.MANAGE_SUPPLIERS);
export const canApproveSuppliers = requirePermission(Permission.APPROVE_SUPPLIERS);
export const canViewSupplierFinancials = requirePermission(Permission.VIEW_SUPPLIER_FINANCIALS);
export const canEvaluateSuppliers = requirePermission(Permission.EVALUATE_SUPPLIERS);
export const canExportSupplierReports = requirePermission(Permission.EXPORT_SUPPLIER_REPORTS);
export const canViewNetworkDocumentation = requirePermission(Permission.VIEW_NETWORK_DOCUMENTATION);
export const canManageNetworkCustomers = requirePermission(Permission.MANAGE_NETWORK_CUSTOMERS);
export const canManageNetworkBranches = requirePermission(Permission.MANAGE_NETWORK_BRANCHES);
export const canManageNetworkDevices = requirePermission(Permission.MANAGE_NETWORK_DEVICES);
export const canManageNetworkIpPlan = requirePermission(Permission.MANAGE_NETWORK_IP_PLAN);
export const canManageNetworkVlans = requirePermission(Permission.MANAGE_NETWORK_VLANS);
export const canManageNetworkWan = requirePermission(Permission.MANAGE_NETWORK_WAN);
export const canManageNetworkVpn = requirePermission(Permission.MANAGE_NETWORK_VPN);
export const canManageNetworkWifi = requirePermission(Permission.MANAGE_NETWORK_WIFI);
export const canManageNetworkAttachments = requirePermission(Permission.MANAGE_NETWORK_ATTACHMENTS);
export const canApproveNetworkBaseline = requirePermission(Permission.APPROVE_NETWORK_BASELINE);
export const canExportNetworkReports = requirePermission(Permission.EXPORT_NETWORK_REPORTS);
export const canViewNetworkSecrets = requirePermission(Permission.VIEW_NETWORK_SECRETS);
export const canViewNetworkChangeLog = requirePermission(Permission.VIEW_NETWORK_CHANGE_LOG);
