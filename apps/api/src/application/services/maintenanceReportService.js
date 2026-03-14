import crypto from 'node:crypto';
import { Roles } from '../../shared/constants.js';
import {
  buildUsersById,
  isActiveHierarchyUser,
  resolveEffectiveManagerId,
  toHierarchyUserId,
} from '../../shared/employeeHierarchy.js';
import { hashOtp } from '../../shared/security.js';

export const defaultMaintenanceRequestPoints = 15;

export const MaintenanceAssignableRoles = [
  Roles.PROJECT_MANAGER,
  Roles.ASSISTANT_PROJECT_MANAGER,
  Roles.TEAM_LEAD,
  Roles.TECHNICAL_STAFF,
];

export const MaintenanceReportStatus = {
  NEW: 'NEW',
  AWAITING_ACCEPTANCE: 'AWAITING_ACCEPTANCE',
  ACCEPTED: 'ACCEPTED',
  IN_PROGRESS: 'IN_PROGRESS',
  DRAFT: 'DRAFT',
  COMPLETED: 'COMPLETED',
  AWAITING_CUSTOMER_FEEDBACK: 'AWAITING_CUSTOMER_FEEDBACK',
  FEEDBACK_SUBMITTED: 'FEEDBACK_SUBMITTED',
  PENDING_MANAGER_APPROVAL: 'PENDING_MANAGER_APPROVAL',
  RETURNED_FOR_EDIT: 'RETURNED_FOR_EDIT',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CLOSED: 'CLOSED',
};

export const MaintenanceType = {
  PERIODIC: 'PERIODIC',
  EMERGENCY: 'EMERGENCY',
  FOLLOW_UP: 'FOLLOW_UP',
  INSTALLATION: 'INSTALLATION',
};

export const DeviceCondition = {
  GOOD: 'GOOD',
  NEEDS_MAINTENANCE: 'NEEDS_MAINTENANCE',
  NEEDS_REPLACEMENT: 'NEEDS_REPLACEMENT',
};

export const IssueSeverity = {
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
};

export const ProjectType = {
  COMMERCIAL: 'COMMERCIAL',
  RESIDENTIAL: 'RESIDENTIAL',
  GOVERNMENTAL: 'GOVERNMENTAL',
};

export const getMaintenanceReportStatusLabel = (status) => ({
  [MaintenanceReportStatus.NEW]: 'جديد',
  [MaintenanceReportStatus.AWAITING_ACCEPTANCE]: 'بانتظار الاستلام',
  [MaintenanceReportStatus.ACCEPTED]: 'تم الاستلام',
  [MaintenanceReportStatus.IN_PROGRESS]: 'قيد التنفيذ',
  [MaintenanceReportStatus.DRAFT]: 'محفوظ كمسودة',
  [MaintenanceReportStatus.COMPLETED]: 'مكتمل',
  [MaintenanceReportStatus.AWAITING_CUSTOMER_FEEDBACK]: 'بانتظار تقييم الزبون',
  [MaintenanceReportStatus.FEEDBACK_SUBMITTED]: 'تم تقييمه',
  [MaintenanceReportStatus.PENDING_MANAGER_APPROVAL]: 'بانتظار اعتماد المدير المباشر',
  [MaintenanceReportStatus.RETURNED_FOR_EDIT]: 'معاد للتعديل',
  [MaintenanceReportStatus.APPROVED]: 'معتمد',
  [MaintenanceReportStatus.REJECTED]: 'مرفوض',
  [MaintenanceReportStatus.CLOSED]: 'مغلق',
}[status] || status || '');

export const createMaintenanceFeedbackToken = ({ validHours = 168 } = {}) => {
  const rawToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + (Number(validHours || 168) * 60 * 60 * 1000));

  return {
    rawToken,
    tokenHash: hashOtp(rawToken),
    expiresAt,
  };
};

export const isMaintenanceFeedbackTokenValid = ({
  tokenHash = '',
  rawToken = '',
  expiresAt = null,
  usedAt = null,
} = {}) => {
  if (!tokenHash || !rawToken || usedAt) {
    return false;
  }

  if (expiresAt && new Date(expiresAt) < new Date()) {
    return false;
  }

  return hashOtp(rawToken) === tokenHash;
};

export const resolveMaintenanceManagerReviewerId = ({
  employeeId,
  users = [],
} = {}) => {
  const activeUsers = (users || []).filter((user) => isActiveHierarchyUser(user));
  const usersById = buildUsersById(activeUsers);
  const employee = usersById.get(toHierarchyUserId(employeeId));

  const effectiveManagerId = resolveEffectiveManagerId({
    user: employee,
    usersById,
    skipInactiveManagers: true,
  });

  if (effectiveManagerId) {
    return effectiveManagerId;
  }

  return toHierarchyUserId(
    activeUsers.find((user) =>
      [Roles.TEAM_LEAD, Roles.PROJECT_MANAGER, Roles.ASSISTANT_PROJECT_MANAGER, Roles.GENERAL_MANAGER].includes(user.role)
      && toHierarchyUserId(user) !== toHierarchyUserId(employeeId)),
  );
};

export const listMaintenanceAssignableUsers = (users = []) =>
  (users || []).filter((user) =>
    isActiveHierarchyUser(user)
    && MaintenanceAssignableRoles.includes(user.role),
  );

export const summarizeMaintenanceReports = (reports = []) => {
  const summary = {
    total: reports.length,
    awaitingAcceptance: 0,
    inProgress: 0,
    completed: 0,
    awaitingFeedback: 0,
    pendingApproval: 0,
    approved: 0,
    rejected: 0,
    closed: 0,
    totalVisits: reports.length,
    averageCompanyRating: 0,
    averageEmployeeRating: 0,
  };

  let companyRatingTotal = 0;
  let employeeRatingTotal = 0;
  let ratingCount = 0;

  for (const report of reports || []) {
    switch (report.status) {
      case MaintenanceReportStatus.NEW:
      case MaintenanceReportStatus.AWAITING_ACCEPTANCE:
        summary.awaitingAcceptance += 1;
        break;
      case MaintenanceReportStatus.ACCEPTED:
      case MaintenanceReportStatus.IN_PROGRESS:
      case MaintenanceReportStatus.DRAFT:
        summary.inProgress += 1;
        break;
      case MaintenanceReportStatus.COMPLETED:
        summary.completed += 1;
        break;
      case MaintenanceReportStatus.AWAITING_CUSTOMER_FEEDBACK:
        summary.awaitingFeedback += 1;
        break;
      case MaintenanceReportStatus.PENDING_MANAGER_APPROVAL:
      case MaintenanceReportStatus.FEEDBACK_SUBMITTED:
        summary.pendingApproval += 1;
        break;
      case MaintenanceReportStatus.APPROVED:
        summary.approved += 1;
        break;
      case MaintenanceReportStatus.REJECTED:
      case MaintenanceReportStatus.RETURNED_FOR_EDIT:
        summary.rejected += 1;
        break;
      case MaintenanceReportStatus.CLOSED:
        summary.closed += 1;
        break;
      default:
        break;
    }

    const companyRating = Number(report.customerFeedback?.companyRating || 0);
    const employeeRating = Number(report.customerFeedback?.employeeRating || 0);

    if (companyRating > 0 && employeeRating > 0) {
      companyRatingTotal += companyRating;
      employeeRatingTotal += employeeRating;
      ratingCount += 1;
    }
  }

  if (ratingCount > 0) {
    summary.averageCompanyRating = Number((companyRatingTotal / ratingCount).toFixed(2));
    summary.averageEmployeeRating = Number((employeeRatingTotal / ratingCount).toFixed(2));
  }

  return summary;
};
