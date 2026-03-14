import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { env } from '../../config/env.js';
import { sequenceService } from '../../application/services/sequenceService.js';
import { auditService } from '../../application/services/auditService.js';
import { notificationService } from '../../application/services/notificationService.js';
import { performancePointsService } from '../../application/services/performancePointsService.js';
import {
  createMaintenanceFeedbackToken,
  defaultMaintenanceRequestPoints,
  DeviceCondition,
  getMaintenanceReportStatusLabel,
  isMaintenanceFeedbackTokenValid,
  IssueSeverity,
  MaintenanceAssignableRoles,
  MaintenanceReportStatus,
  MaintenanceType,
  ProjectType,
  resolveMaintenanceManagerReviewerId,
  summarizeMaintenanceReports,
} from '../../application/services/maintenanceReportService.js';
import { buildMaintenanceReportPdfBuffer } from '../../infrastructure/reports/maintenanceReportPdfBuilder.js';
import { MaintenanceReportRepository } from '../../infrastructure/db/repositories/MaintenanceReportRepository.js';
import { UserRepository } from '../../infrastructure/db/repositories/UserRepository.js';
import { Permission, Roles } from '../../shared/constants.js';
import { AppError, asyncHandler } from '../../shared/errors.js';
import { buildWhatsAppSendUrl } from '../../shared/attendanceUtils.js';
import { hasPermission, resolvePermissions } from '../../shared/permissions.js';
import { hashOtp } from '../../shared/security.js';

const maintenanceReportRepository = new MaintenanceReportRepository();
const userRepository = new UserRepository();

const uploadRootDir = path.resolve(process.cwd(), env.uploadsDir);
const storedMaintenanceReportsDir = path.resolve(uploadRootDir, 'maintenance-reports');

const maintenanceTypeLabelMap = {
  [MaintenanceType.PERIODIC]: 'صيانة دورية',
  [MaintenanceType.EMERGENCY]: 'صيانة طارئة',
  [MaintenanceType.FOLLOW_UP]: 'متابعة عطل سابق',
  [MaintenanceType.INSTALLATION]: 'تركيب معدات',
};

const deviceConditionLabelMap = {
  [DeviceCondition.GOOD]: 'جيد',
  [DeviceCondition.NEEDS_MAINTENANCE]: 'يحتاج صيانة',
  [DeviceCondition.NEEDS_REPLACEMENT]: 'يحتاج تبديل',
};

const issueSeverityLabelMap = {
  [IssueSeverity.MEDIUM]: 'متوسط',
  [IssueSeverity.HIGH]: 'عالي',
};

const projectTypeLabelMap = {
  [ProjectType.COMMERCIAL]: 'تجاري',
  [ProjectType.RESIDENTIAL]: 'سكني',
  [ProjectType.GOVERNMENTAL]: 'حكومي',
};

const toCleanString = (value) => {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim();
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBoundedPoints = (value, fallback = defaultMaintenanceRequestPoints) => {
  const points = Math.round(toNumber(value, fallback));
  if (points < 0 || points > 1000) {
    throw new AppError('points must be between 0 and 1000', 400);
  }
  return points;
};

const toOptionalDate = (value) => {
  const raw = toCleanString(value);
  if (!raw) {
    return null;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new AppError('Invalid date value', 400);
  }
  return date;
};

const parseJsonArray = (value, fallback = []) => {
  if (value === undefined) {
    return fallback;
  }

  if (Array.isArray(value)) {
    return value;
  }

  const raw = toCleanString(value);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const parseStringArray = (value, fallback = []) =>
  parseJsonArray(value, fallback)
    .map((item) => toCleanString(item))
    .filter(Boolean);

const parseImageComments = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => toCleanString(item));
  }

  const raw = toCleanString(value);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => toCleanString(item));
    }
  } catch {
    return raw.split(',').map((item) => toCleanString(item));
  }

  return [];
};

const buildUploadedImages = (files = [], comments = []) =>
  files.map((file, index) => ({
    publicUrl: `/uploads/${file.filename}`,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: Number(file.size || 0),
    comment: toCleanString(comments[index]),
  }));

const resolvePublicBaseUrl = (req) => `${req.protocol}://${req.get('host')}`;
const resolveFrontendBaseUrl = () => `${String(env.frontendOrigin?.[0] || 'http://localhost:3000').replace(/\/$/, '')}`;

const canAccessAllMaintenanceReports = (user = {}) =>
  user.role === Roles.GENERAL_MANAGER
  || hasPermission(user, Permission.CREATE_MAINTENANCE_REPORT_REQUESTS)
  || [Roles.PROJECT_MANAGER, Roles.ASSISTANT_PROJECT_MANAGER].includes(user.role);

const canAcceptMaintenanceReport = (user = {}, report = {}) =>
  hasPermission(user, Permission.HANDLE_MAINTENANCE_REPORTS)
  && [MaintenanceReportStatus.NEW, MaintenanceReportStatus.AWAITING_ACCEPTANCE].includes(report.status)
  && (!report.assignedEmployee || String(report.assignedEmployee?._id || report.assignedEmployee) === String(user.id));

const isAssignedMaintenanceEmployee = (user = {}, report = {}) =>
  String(report.assignedEmployee?._id || report.assignedEmployee || '') === String(user.id || '');

const isMaintenanceManagerReviewer = (user = {}, report = {}) =>
  String(report.managerReviewer?._id || report.managerReviewer || '') === String(user.id || '');

const resolveMaintenanceVisibility = (user = {}, report = {}) => {
  if (canAccessAllMaintenanceReports(user)) {
    return true;
  }

  if (String(report.createdBy?._id || report.createdBy || '') === String(user.id || '')) {
    return true;
  }

  if (isAssignedMaintenanceEmployee(user, report)) {
    return true;
  }

  if (isMaintenanceManagerReviewer(user, report)) {
    return true;
  }

  return hasPermission(user, Permission.HANDLE_MAINTENANCE_REPORTS)
    && [MaintenanceReportStatus.NEW, MaintenanceReportStatus.AWAITING_ACCEPTANCE].includes(report.status)
    && !report.assignedEmployee;
};

const assertMaintenanceReportVisible = (req, report) => {
  if (!resolveMaintenanceVisibility(req.user, report)) {
    throw new AppError('You cannot access this maintenance report', 403);
  }
};

const toUserSummary = (user) => {
  if (!user) {
    return null;
  }

  return {
    id: String(user._id || user.id || ''),
    fullName: user.fullName || '',
    role: user.role || '',
    employeeCode: user.employeeCode || '',
    department: user.department || '',
    jobTitle: user.jobTitle || '',
    avatarUrl: user.avatarUrl || '',
    active: user.active !== false,
  };
};

const serializeWorkflowTrail = (entry = {}) => ({
  action: entry.action || '',
  actor: entry.actor ? toUserSummary(entry.actor) : null,
  actorName: entry.actorName || entry.actor?.fullName || '',
  beforeStatus: entry.beforeStatus || '',
  beforeStatusLabel: getMaintenanceReportStatusLabel(entry.beforeStatus),
  afterStatus: entry.afterStatus || '',
  afterStatusLabel: getMaintenanceReportStatusLabel(entry.afterStatus),
  notes: entry.notes || '',
  occurredAt: entry.occurredAt || null,
});

const serializeMaintenanceReport = (report, currentUser = null) => ({
  id: String(report._id || report.id || ''),
  requestNo: report.requestNo || '',
  customerName: report.customerName || '',
  siteLocation: report.siteLocation || '',
  phone: report.phone || '',
  projectNumber: report.projectNumber || '',
  points: Number(report.points || 0),
  description: report.description || '',
  status: report.status,
  statusLabel: getMaintenanceReportStatusLabel(report.status),
  createdBy: toUserSummary(report.createdBy),
  assignedEmployee: toUserSummary(report.assignedEmployee) || (report.assignedEmployeeName ? {
    id: '',
    fullName: report.assignedEmployeeName,
    role: report.assignedEmployeeRole || '',
    employeeCode: report.assignedEmployeeCode || '',
    department: '',
    jobTitle: '',
    avatarUrl: '',
    active: true,
  } : null),
  acceptedBy: toUserSummary(report.acceptedBy),
  managerReviewer: toUserSummary(report.managerReviewer) || (report.managerReviewerName ? {
    id: '',
    fullName: report.managerReviewerName,
    role: '',
    employeeCode: '',
    department: '',
    jobTitle: '',
    avatarUrl: '',
    active: true,
  } : null),
  visitInfo: {
    siteName: report.visitInfo?.siteName || '',
    siteAddress: report.visitInfo?.siteAddress || '',
    customerName: report.customerName || '',
    projectNumber: report.projectNumber || '',
    visitDate: report.visitInfo?.visitDate || null,
    arrivalTime: report.visitInfo?.arrivalTime || '',
    departureTime: report.visitInfo?.departureTime || '',
    technicianName: report.visitInfo?.technicianName || report.assignedEmployee?.fullName || report.assignedEmployeeName || '',
    department: report.visitInfo?.department || report.assignedEmployee?.department || '',
  },
  maintenanceTypes: (report.maintenanceTypes || []).map((value) => ({
    value,
    label: maintenanceTypeLabelMap[value] || value,
  })),
  inspectedDevices: (report.inspectedDevices || []).map((item) => ({
    device: item.device || '',
    model: item.model || '',
    condition: item.condition || DeviceCondition.GOOD,
    conditionLabel: deviceConditionLabelMap[item.condition] || item.condition || '',
    notes: item.notes || '',
  })),
  performedActions: (report.performedActions || []).map((item) => toCleanString(item)).filter(Boolean),
  detectedIssues: (report.detectedIssues || []).map((item) => ({
    sequenceNo: Number(item.sequenceNo || 0),
    issue: item.issue || '',
    severity: item.severity || IssueSeverity.MEDIUM,
    severityLabel: issueSeverityLabelMap[item.severity] || item.severity || '',
    proposedSolution: item.proposedSolution || '',
  })),
  usedMaterials: (report.usedMaterials || []).map((item) => ({
    material: item.material || '',
    quantity: item.quantity || '',
    notes: item.notes || '',
  })),
  recommendations: (report.recommendations || []).map((item) => toCleanString(item)).filter(Boolean),
  images: (report.images || []).map((item, index) => ({
    id: `${report._id || report.id || 'report'}-image-${index}`,
    url: item.publicUrl || '',
    originalName: item.originalName || '',
    mimeType: item.mimeType || '',
    size: Number(item.size || 0),
    comment: item.comment || '',
  })),
  pdfFile: report.pdfFile?.publicUrl ? {
    url: report.pdfFile.publicUrl,
    filename: report.pdfFile.filename || '',
    size: Number(report.pdfFile.size || 0),
    generatedAt: report.pdfFile.generatedAt || null,
  } : null,
  customerFeedback: {
    sentAt: report.customerFeedback?.sentAt || report.feedbackSentAt || null,
    expiresAt: report.customerFeedback?.expiresAt || null,
    usedAt: report.customerFeedback?.usedAt || null,
    submittedAt: report.customerFeedback?.submittedAt || null,
    customerName: report.customerFeedback?.customerName || report.customerName || '',
    projectType: report.customerFeedback?.projectType || '',
    projectTypeLabel: projectTypeLabelMap[report.customerFeedback?.projectType] || report.customerFeedback?.projectType || '',
    companyRating: Number(report.customerFeedback?.companyRating || 0),
    employeeRating: Number(report.customerFeedback?.employeeRating || 0),
    notes: report.customerFeedback?.notes || '',
    suggestions: report.customerFeedback?.suggestions || '',
    hasActiveToken: Boolean(report.customerFeedback?.tokenHash && !report.customerFeedback?.usedAt),
  },
  managerReview: {
    action: report.managerReview?.action || '',
    notes: report.managerReview?.notes || '',
    reviewedBy: toUserSummary(report.managerReview?.reviewedBy),
    reviewedAt: report.managerReview?.reviewedAt || null,
  },
  pointsLedger: report.pointsLedger ? {
    id: String(report.pointsLedger._id || report.pointsLedger.id || ''),
    points: Number(report.pointsLedger.points || 0),
    category: report.pointsLedger.category || '',
    reason: report.pointsLedger.reason || '',
    createdAt: report.pointsLedger.createdAt || null,
  } : null,
  acceptedAt: report.acceptedAt || null,
  completedAt: report.completedAt || null,
  feedbackSentAt: report.feedbackSentAt || null,
  submittedForApprovalAt: report.submittedForApprovalAt || null,
  approvedAt: report.approvedAt || null,
  rejectedAt: report.rejectedAt || null,
  closedAt: report.closedAt || null,
  workflowTrail: (report.workflowTrail || []).map(serializeWorkflowTrail),
  createdAt: report.createdAt || null,
  updatedAt: report.updatedAt || null,
  canEditRequest: !!currentUser
    && hasPermission(currentUser, Permission.CREATE_MAINTENANCE_REPORT_REQUESTS)
    && [MaintenanceReportStatus.NEW, MaintenanceReportStatus.AWAITING_ACCEPTANCE].includes(report.status),
  canAccept: !!currentUser && canAcceptMaintenanceReport(currentUser, report),
  canEditReport: !!currentUser
    && hasPermission(currentUser, Permission.HANDLE_MAINTENANCE_REPORTS)
    && isAssignedMaintenanceEmployee(currentUser, report)
    && ![MaintenanceReportStatus.APPROVED, MaintenanceReportStatus.REJECTED].includes(report.status),
  canComplete: !!currentUser
    && hasPermission(currentUser, Permission.HANDLE_MAINTENANCE_REPORTS)
    && isAssignedMaintenanceEmployee(currentUser, report)
    && [MaintenanceReportStatus.IN_PROGRESS, MaintenanceReportStatus.DRAFT, MaintenanceReportStatus.RETURNED_FOR_EDIT].includes(report.status),
  canSendFeedbackLink: !!currentUser
    && hasPermission(currentUser, Permission.HANDLE_MAINTENANCE_REPORTS)
    && isAssignedMaintenanceEmployee(currentUser, report)
    && [MaintenanceReportStatus.COMPLETED, MaintenanceReportStatus.AWAITING_CUSTOMER_FEEDBACK, MaintenanceReportStatus.RETURNED_FOR_EDIT].includes(report.status),
  canSubmitForApproval: !!currentUser
    && hasPermission(currentUser, Permission.HANDLE_MAINTENANCE_REPORTS)
    && isAssignedMaintenanceEmployee(currentUser, report)
    && [MaintenanceReportStatus.COMPLETED, MaintenanceReportStatus.AWAITING_CUSTOMER_FEEDBACK, MaintenanceReportStatus.FEEDBACK_SUBMITTED, MaintenanceReportStatus.RETURNED_FOR_EDIT].includes(report.status),
  canReview: !!currentUser
    && hasPermission(currentUser, Permission.REVIEW_MAINTENANCE_REPORTS)
    && isMaintenanceManagerReviewer(currentUser, report)
    && report.status === MaintenanceReportStatus.PENDING_MANAGER_APPROVAL,
});

const buildWorkflowEntry = ({
  action,
  actorId = null,
  actorName = '',
  beforeStatus = '',
  afterStatus = '',
  notes = '',
}) => ({
  action,
  actor: actorId || null,
  actorName: actorName || '',
  beforeStatus,
  afterStatus,
  notes: notes || '',
  occurredAt: new Date(),
});

const resolveRecipientsByPermission = async (permission, { exclude = [] } = {}) => {
  const excludeIds = new Set((exclude || []).map((item) => String(item)));
  const users = await userRepository.listActive({ includeManager: false });
  return users
    .filter((user) => !excludeIds.has(String(user._id || user.id)))
    .filter((user) => resolvePermissions(user).includes(permission))
    .map((user) => String(user._id || user.id));
};

const ensureAssignableEmployee = async (userId = '') => {
  if (!userId) {
    return null;
  }

  const user = await userRepository.findById(userId);
  if (!user || !user.active) {
    throw new AppError('Assigned employee not found or inactive', 404);
  }

  const permissions = resolvePermissions(user);
  const isAssignableRole = MaintenanceAssignableRoles.includes(user.role);
  if (!isAssignableRole && !permissions.includes(Permission.HANDLE_MAINTENANCE_REPORTS)) {
    throw new AppError('Assigned employee cannot handle maintenance reports', 400);
  }

  return user;
};

const resolveManagerReviewer = async (employeeId = '') => {
  if (!employeeId) {
    return null;
  }

  const users = await userRepository.listActive({ includeManager: false });
  const reviewerId = resolveMaintenanceManagerReviewerId({
    employeeId,
    users,
  });

  if (!reviewerId) {
    return null;
  }

  return userRepository.findById(reviewerId);
};

const filterMaintenanceReports = (reports = [], query = {}) => {
  const customerName = toCleanString(query.customerName || query.customer || '').toLowerCase();
  const projectNumber = toCleanString(query.projectNumber || '').toLowerCase();
  const employeeName = toCleanString(query.employeeName || '').toLowerCase();
  const status = toCleanString(query.status);
  const maintenanceType = toCleanString(query.maintenanceType);
  const dateFrom = toOptionalDate(query.dateFrom || query.from);
  const dateTo = toOptionalDate(query.dateTo || query.to);

  return reports.filter((report) => {
    if (customerName && !String(report.customerName || '').toLowerCase().includes(customerName)) {
      return false;
    }

    if (projectNumber && !String(report.projectNumber || '').toLowerCase().includes(projectNumber)) {
      return false;
    }

    if (employeeName) {
      const employeeLabel = String(
        report.assignedEmployee?.fullName
        || report.assignedEmployeeName
        || report.visitInfo?.technicianName
        || '',
      ).toLowerCase();
      if (!employeeLabel.includes(employeeName)) {
        return false;
      }
    }

    if (status && report.status !== status) {
      return false;
    }

    if (maintenanceType && !(report.maintenanceTypes || []).includes(maintenanceType)) {
      return false;
    }

    const effectiveDate = report.visitInfo?.visitDate ? new Date(report.visitInfo.visitDate) : new Date(report.createdAt || 0);
    if (dateFrom && effectiveDate < dateFrom) {
      return false;
    }
    if (dateTo && effectiveDate > dateTo) {
      return false;
    }

    return true;
  });
};

const buildEmployeeSummary = (reports = []) => {
  const stats = new Map();

  for (const report of reports) {
    const employeeId = String(report.assignedEmployee?._id || report.assignedEmployee || '');
    if (!employeeId) {
      continue;
    }

    if (!stats.has(employeeId)) {
      stats.set(employeeId, {
        employee: toUserSummary(report.assignedEmployee) || {
          id: employeeId,
          fullName: report.assignedEmployeeName || '',
          role: report.assignedEmployeeRole || '',
          employeeCode: report.assignedEmployeeCode || '',
          department: '',
          jobTitle: '',
          avatarUrl: '',
          active: true,
        },
        visits: 0,
        completedReports: 0,
        approvedReports: 0,
        rejectedReports: 0,
        pendingReports: 0,
        totalPoints: 0,
        companyRatingTotal: 0,
        employeeRatingTotal: 0,
        ratingCount: 0,
      });
    }

    const current = stats.get(employeeId);
    current.visits += 1;
    current.totalPoints += Number(report.points || 0);

    if ([MaintenanceReportStatus.COMPLETED, MaintenanceReportStatus.AWAITING_CUSTOMER_FEEDBACK, MaintenanceReportStatus.PENDING_MANAGER_APPROVAL, MaintenanceReportStatus.APPROVED].includes(report.status)) {
      current.completedReports += 1;
    }
    if (report.status === MaintenanceReportStatus.APPROVED) {
      current.approvedReports += 1;
    }
    if ([MaintenanceReportStatus.REJECTED, MaintenanceReportStatus.RETURNED_FOR_EDIT].includes(report.status)) {
      current.rejectedReports += 1;
    }
    if ([MaintenanceReportStatus.AWAITING_ACCEPTANCE, MaintenanceReportStatus.IN_PROGRESS, MaintenanceReportStatus.DRAFT, MaintenanceReportStatus.PENDING_MANAGER_APPROVAL].includes(report.status)) {
      current.pendingReports += 1;
    }

    const companyRating = Number(report.customerFeedback?.companyRating || 0);
    const employeeRating = Number(report.customerFeedback?.employeeRating || 0);
    if (companyRating > 0 && employeeRating > 0) {
      current.companyRatingTotal += companyRating;
      current.employeeRatingTotal += employeeRating;
      current.ratingCount += 1;
    }
  }

  return Array.from(stats.values())
    .map((item) => ({
      ...item,
      averageCompanyRating: item.ratingCount ? Number((item.companyRatingTotal / item.ratingCount).toFixed(2)) : 0,
      averageEmployeeRating: item.ratingCount ? Number((item.employeeRatingTotal / item.ratingCount).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.totalPoints - a.totalPoints);
};

export const listMaintenanceAssignees = asyncHandler(async (_req, res) => {
  const users = await userRepository.listActive({ includeManager: false });
  const assignees = users
    .filter((user) => {
      const permissions = resolvePermissions(user);
      return permissions.includes(Permission.HANDLE_MAINTENANCE_REPORTS)
        || MaintenanceAssignableRoles.includes(user.role);
    })
    .map((user) => toUserSummary(user));

  res.json({ assignees });
});

export const createMaintenanceReportRequest = asyncHandler(async (req, res) => {
  const customerName = toCleanString(req.body.customerName);
  const siteLocation = toCleanString(req.body.siteLocation);
  const phone = toCleanString(req.body.phone);
  const projectNumber = toCleanString(req.body.projectNumber);

  if (!customerName || !siteLocation || !phone || !projectNumber) {
    throw new AppError('customerName, siteLocation, phone, and projectNumber are required', 400);
  }

  const points = toBoundedPoints(req.body.points, defaultMaintenanceRequestPoints);
  const assignedEmployee = await ensureAssignableEmployee(toCleanString(req.body.assignedEmployeeId));
  const managerReviewer = assignedEmployee
    ? await resolveManagerReviewer(String(assignedEmployee._id))
    : null;
  const requestNo = await sequenceService.next('MAINTENANCE_REPORT', { prefix: 'MTR', digits: 5 });

  const report = await maintenanceReportRepository.create({
    requestNo,
    customerName,
    siteLocation,
    phone,
    projectNumber,
    points,
    description: toCleanString(req.body.description),
    status: MaintenanceReportStatus.AWAITING_ACCEPTANCE,
    createdBy: req.user.id,
    assignedEmployee: assignedEmployee?._id || null,
    assignedEmployeeName: assignedEmployee?.fullName || '',
    assignedEmployeeRole: assignedEmployee?.role || '',
    assignedEmployeeCode: assignedEmployee?.employeeCode || '',
    managerReviewer: managerReviewer?._id || null,
    managerReviewerName: managerReviewer?.fullName || '',
    visitInfo: {
      siteName: customerName,
      siteAddress: siteLocation,
    },
    workflowTrail: [
      buildWorkflowEntry({
        action: 'MAINTENANCE_REQUEST_CREATED',
        actorId: req.user.id,
        actorName: req.user.name || req.user.fullName || '',
        beforeStatus: '',
        afterStatus: MaintenanceReportStatus.AWAITING_ACCEPTANCE,
      }),
    ],
  });

  const createdReport = await maintenanceReportRepository.findById(report._id);
  const recipients = assignedEmployee
    ? [String(assignedEmployee._id)]
    : await resolveRecipientsByPermission(Permission.HANDLE_MAINTENANCE_REPORTS, { exclude: [req.user.id] });

  if (recipients.length) {
    await notificationService.notifyMaintenanceReportRequest(recipients, {
      requestId: String(createdReport._id),
      requestNo: createdReport.requestNo,
      status: createdReport.status,
      customerName,
      projectNumber,
      messageAr: assignedEmployee
        ? `تم تعيين طلب تقرير الصيانة ${createdReport.requestNo} إليك للمتابعة.`
        : `تم إنشاء طلب تقرير الصيانة ${createdReport.requestNo} وهو بانتظار الاستلام.`,
    });
  }

  await auditService.log({
    actorId: req.user.id,
    action: 'MAINTENANCE_REPORT_REQUEST_CREATED',
    entityType: 'MAINTENANCE_REPORT',
    entityId: createdReport._id,
    after: serializeMaintenanceReport(createdReport, req.user),
    req,
  });

  res.status(201).json({
    report: serializeMaintenanceReport(createdReport, req.user),
  });
});

export const updateMaintenanceReportRequest = asyncHandler(async (req, res) => {
  const report = await maintenanceReportRepository.findById(req.params.id);
  if (!report) {
    throw new AppError('Maintenance report request not found', 404);
  }

  if (![MaintenanceReportStatus.NEW, MaintenanceReportStatus.AWAITING_ACCEPTANCE].includes(report.status)) {
    throw new AppError('Accepted or processed requests cannot be edited from request form', 400);
  }

  if (!canAccessAllMaintenanceReports(req.user)) {
    throw new AppError('You cannot edit this maintenance request', 403);
  }

  const before = serializeMaintenanceReport(report, req.user);
  const assignedEmployee = await ensureAssignableEmployee(toCleanString(req.body.assignedEmployeeId) || String(report.assignedEmployee?._id || report.assignedEmployee || ''));
  const managerReviewer = assignedEmployee
    ? await resolveManagerReviewer(String(assignedEmployee._id))
    : null;

  const updated = await maintenanceReportRepository.updateById(report._id, {
    customerName: toCleanString(req.body.customerName || report.customerName),
    siteLocation: toCleanString(req.body.siteLocation || report.siteLocation),
    phone: toCleanString(req.body.phone || report.phone),
    projectNumber: toCleanString(req.body.projectNumber || report.projectNumber),
    points: toBoundedPoints(req.body.points, report.points),
    description: toCleanString(req.body.description ?? report.description),
    assignedEmployee: assignedEmployee?._id || null,
    assignedEmployeeName: assignedEmployee?.fullName || '',
    assignedEmployeeRole: assignedEmployee?.role || '',
    assignedEmployeeCode: assignedEmployee?.employeeCode || '',
    managerReviewer: managerReviewer?._id || null,
    managerReviewerName: managerReviewer?.fullName || '',
    workflowTrail: [
      ...(report.workflowTrail || []),
      buildWorkflowEntry({
        action: 'MAINTENANCE_REQUEST_UPDATED',
        actorId: req.user.id,
        actorName: req.user.name || req.user.fullName || '',
        beforeStatus: report.status,
        afterStatus: report.status,
        notes: toCleanString(req.body.updateNote),
      }),
    ],
  });

  if (assignedEmployee && String(assignedEmployee._id) !== String(report.assignedEmployee?._id || report.assignedEmployee || '')) {
    await notificationService.notifyMaintenanceReportRequest(String(assignedEmployee._id), {
      requestId: String(updated._id),
      requestNo: updated.requestNo,
      status: updated.status,
      customerName: updated.customerName,
      projectNumber: updated.projectNumber,
      messageAr: `تم تعيين طلب تقرير الصيانة ${updated.requestNo} إليك بعد تحديث البيانات.`,
    });
  }

  await auditService.log({
    actorId: req.user.id,
    action: 'MAINTENANCE_REPORT_REQUEST_UPDATED',
    entityType: 'MAINTENANCE_REPORT',
    entityId: updated._id,
    before,
    after: serializeMaintenanceReport(updated, req.user),
    req,
  });

  res.json({
    report: serializeMaintenanceReport(updated, req.user),
  });
});

export const listMaintenanceReports = asyncHandler(async (req, res) => {
  const reports = await maintenanceReportRepository.list({});
  const visible = reports.filter((report) => resolveMaintenanceVisibility(req.user, report));
  const filtered = filterMaintenanceReports(visible, req.query);

  res.json({
    reports: filtered.map((report) => serializeMaintenanceReport(report, req.user)),
  });
});

export const maintenanceReportsSummary = asyncHandler(async (req, res) => {
  const reports = await maintenanceReportRepository.list({});
  const visible = reports.filter((report) => resolveMaintenanceVisibility(req.user, report));
  const filtered = filterMaintenanceReports(visible, req.query);

  res.json({
    summary: summarizeMaintenanceReports(filtered),
    employees: buildEmployeeSummary(filtered),
    latestReports: filtered
      .slice()
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
      .slice(0, 10)
      .map((report) => serializeMaintenanceReport(report, req.user)),
  });
});

export const getMaintenanceReport = asyncHandler(async (req, res) => {
  const report = await maintenanceReportRepository.findById(req.params.id);
  if (!report) {
    throw new AppError('Maintenance report not found', 404);
  }

  assertMaintenanceReportVisible(req, report);

  res.json({
    report: serializeMaintenanceReport(report, req.user),
  });
});

const parseVisitInfo = (body = {}, report = {}, employee = null) => ({
  siteName: toCleanString(body.siteName ?? report.visitInfo?.siteName ?? report.customerName),
  siteAddress: toCleanString(body.siteAddress ?? report.visitInfo?.siteAddress ?? report.siteLocation),
  visitDate: toOptionalDate(body.visitDate ?? report.visitInfo?.visitDate),
  arrivalTime: toCleanString(body.arrivalTime ?? report.visitInfo?.arrivalTime),
  departureTime: toCleanString(body.departureTime ?? report.visitInfo?.departureTime),
  technicianName: toCleanString(body.technicianName ?? report.visitInfo?.technicianName ?? employee?.fullName),
  department: toCleanString(body.department ?? report.visitInfo?.department ?? employee?.department),
});

const parseInspectedDevices = (value, fallback = []) =>
  parseJsonArray(value, fallback)
    .map((item) => ({
      device: toCleanString(item?.device),
      model: toCleanString(item?.model),
      condition: Object.values(DeviceCondition).includes(item?.condition)
        ? item.condition
        : DeviceCondition.GOOD,
      notes: toCleanString(item?.notes),
    }))
    .filter((item) => item.device || item.model || item.notes);

const parseDetectedIssues = (value, fallback = []) =>
  parseJsonArray(value, fallback)
    .map((item, index) => ({
      sequenceNo: index + 1,
      issue: toCleanString(item?.issue || item?.problem),
      severity: Object.values(IssueSeverity).includes(item?.severity)
        ? item.severity
        : IssueSeverity.MEDIUM,
      proposedSolution: toCleanString(item?.proposedSolution || item?.solution),
    }))
    .filter((item) => item.issue || item.proposedSolution);

const parseUsedMaterials = (value, fallback = []) =>
  parseJsonArray(value, fallback)
    .map((item) => ({
      material: toCleanString(item?.material),
      quantity: toCleanString(item?.quantity),
      notes: toCleanString(item?.notes),
    }))
    .filter((item) => item.material || item.quantity || item.notes);

const normalizeMaintenanceTypes = (value, fallback = []) =>
  parseJsonArray(value, fallback)
    .map((item) => toCleanString(item))
    .filter((item) => Object.values(MaintenanceType).includes(item));

const validateCompletionReadiness = (report) => {
  if (!report.visitInfo?.visitDate) {
    throw new AppError('visitDate is required before completing the report', 400);
  }
  if (!report.visitInfo?.arrivalTime || !report.visitInfo?.departureTime) {
    throw new AppError('arrivalTime and departureTime are required before completing the report', 400);
  }
  if (!(report.maintenanceTypes || []).length) {
    throw new AppError('At least one maintenance type is required before completing the report', 400);
  }
  if (!(report.inspectedDevices || []).length) {
    throw new AppError('At least one inspected device is required before completing the report', 400);
  }
  if (!(report.performedActions || []).length) {
    throw new AppError('At least one performed action is required before completing the report', 400);
  }
};

const resolveStoredMaintenanceReportPdfAbsolutePath = (publicUrl) => {
  const raw = toCleanString(publicUrl);
  if (!raw.startsWith('/uploads/')) {
    return '';
  }

  const relativePath = raw.split('?')[0].split('#')[0].replace('/uploads/', '');
  const absolutePath = path.resolve(uploadRootDir, relativePath);
  if (!absolutePath.startsWith(uploadRootDir)) {
    return '';
  }

  return absolutePath;
};

const buildStoredMaintenanceReportPdfPayload = ({ publicUrl, filename, absolutePath }) => ({
  publicUrl,
  filename,
  size: fs.existsSync(absolutePath) ? Number(fs.statSync(absolutePath).size || 0) : 0,
  generatedAt: new Date(),
});

const createStoredMaintenanceReportPdf = async ({ report, req }) => {
  const buffer = await buildMaintenanceReportPdfBuffer({
    report: serializeMaintenanceReport(report, req.user),
    generatedAt: new Date(),
  });

  if (!fs.existsSync(storedMaintenanceReportsDir)) {
    fs.mkdirSync(storedMaintenanceReportsDir, { recursive: true });
  }

  const filename = `maintenance-report-${String(report._id)}-${Date.now()}-${randomUUID().slice(0, 8)}.pdf`;
  const absolutePath = path.resolve(storedMaintenanceReportsDir, filename);
  fs.writeFileSync(absolutePath, buffer);

  return {
    filename,
    absolutePath,
    pdfUrl: `/uploads/maintenance-reports/${filename}`,
  };
};

const ensureStoredMaintenanceReportPdf = async ({ report, req }) => {
  const existingPublicUrl = toCleanString(report?.pdfFile?.publicUrl);
  const existingFilename = toCleanString(report?.pdfFile?.filename);
  const existingAbsolutePath = resolveStoredMaintenanceReportPdfAbsolutePath(existingPublicUrl);

  if (existingPublicUrl && existingFilename && existingAbsolutePath && fs.existsSync(existingAbsolutePath)) {
    return {
      report,
      pdfFile: {
        publicUrl: existingPublicUrl,
        filename: existingFilename,
        size: Number(report?.pdfFile?.size || fs.statSync(existingAbsolutePath).size || 0),
        generatedAt: report?.pdfFile?.generatedAt || null,
      },
      absolutePath: existingAbsolutePath,
      createdNew: false,
    };
  }

  const stored = await createStoredMaintenanceReportPdf({ report, req });
  const pdfFile = buildStoredMaintenanceReportPdfPayload({
    publicUrl: stored.pdfUrl,
    filename: stored.filename,
    absolutePath: stored.absolutePath,
  });

  const updatedReport = await maintenanceReportRepository.updateById(report._id, {
    pdfFile,
  });

  return {
    report: updatedReport,
    pdfFile,
    absolutePath: stored.absolutePath,
    createdNew: true,
  };
};

const buildMaintenanceWhatsappMessage = ({ report, pdfAbsoluteUrl }) => {
  const lines = [
    'تقرير صيانة دورية - Delta Plus',
    `رقم الطلب: ${report.requestNo}`,
    `الزبون: ${report.customerName}`,
    `الموقع: ${report.siteLocation}`,
    `رقم المشروع: ${report.projectNumber}`,
    `الفني: ${report.assignedEmployee?.fullName || report.assignedEmployeeName || '-'}`,
    `الحالة: ${getMaintenanceReportStatusLabel(report.status)}`,
  ];

  if (pdfAbsoluteUrl) {
    lines.push(`رابط ملف PDF: ${pdfAbsoluteUrl}`);
  }

  return lines.join('\n');
};

export const acceptMaintenanceReportRequest = asyncHandler(async (req, res) => {
  const report = await maintenanceReportRepository.findById(req.params.id);
  if (!report) {
    throw new AppError('Maintenance report request not found', 404);
  }

  if (!canAcceptMaintenanceReport(req.user, report)) {
    throw new AppError('You cannot accept this maintenance request', 403);
  }

  const assignee = await userRepository.findById(req.user.id);
  if (!assignee || !assignee.active) {
    throw new AppError('Assigned employee not found or inactive', 404);
  }

  const managerReviewer = await resolveManagerReviewer(String(assignee._id));
  const before = serializeMaintenanceReport(report, req.user);
  const updated = await maintenanceReportRepository.updateById(report._id, {
    assignedEmployee: assignee._id,
    assignedEmployeeName: assignee.fullName || '',
    assignedEmployeeRole: assignee.role || '',
    assignedEmployeeCode: assignee.employeeCode || '',
    acceptedBy: assignee._id,
    acceptedAt: new Date(),
    managerReviewer: managerReviewer?._id || null,
    managerReviewerName: managerReviewer?.fullName || '',
    status: MaintenanceReportStatus.IN_PROGRESS,
    workflowTrail: [
      ...(report.workflowTrail || []),
      buildWorkflowEntry({
        action: 'MAINTENANCE_REQUEST_ACCEPTED',
        actorId: assignee._id,
        actorName: assignee.fullName || '',
        beforeStatus: report.status,
        afterStatus: MaintenanceReportStatus.IN_PROGRESS,
      }),
    ],
  });

  const notifyTargets = [
    String(report.createdBy?._id || report.createdBy || ''),
    String(managerReviewer?._id || ''),
  ].filter((item) => item && item !== String(assignee._id));

  if (notifyTargets.length) {
    await notificationService.notifyMaintenanceReportStatus(notifyTargets, {
      requestId: String(updated._id),
      requestNo: updated.requestNo,
      previousStatus: report.status,
      status: updated.status,
      customerName: updated.customerName,
      action: 'ACCEPT',
      messageAr: `تم استلام طلب تقرير الصيانة ${updated.requestNo} من قبل ${assignee.fullName}.`,
    });
  }

  await auditService.log({
    actorId: req.user.id,
    action: 'MAINTENANCE_REPORT_ACCEPTED',
    entityType: 'MAINTENANCE_REPORT',
    entityId: updated._id,
    before,
    after: serializeMaintenanceReport(updated, req.user),
    req,
  });

  res.json({
    report: serializeMaintenanceReport(updated, req.user),
  });
});

export const saveMaintenanceReportDraft = asyncHandler(async (req, res) => {
  const report = await maintenanceReportRepository.findById(req.params.id);
  if (!report) {
    throw new AppError('Maintenance report not found', 404);
  }

  if (!isAssignedMaintenanceEmployee(req.user, report)) {
    throw new AppError('Only the assigned employee can update this report', 403);
  }

  const employee = await userRepository.findById(req.user.id);
  const files = Array.isArray(req.files) ? req.files : [];
  const comments = parseImageComments(req.body.imageComments);
  const uploadedImages = buildUploadedImages(files, comments);
  const nextVisitInfo = parseVisitInfo(req.body, report, employee);
  const nextMaintenanceTypes = normalizeMaintenanceTypes(req.body.maintenanceTypes, report.maintenanceTypes || []);
  const nextInspectedDevices = parseInspectedDevices(req.body.inspectedDevices, report.inspectedDevices || []);
  const nextPerformedActions = parseStringArray(req.body.performedActions, report.performedActions || []);
  const nextDetectedIssues = parseDetectedIssues(req.body.detectedIssues, report.detectedIssues || []);
  const nextUsedMaterials = parseUsedMaterials(req.body.usedMaterials, report.usedMaterials || []);
  const nextRecommendations = parseStringArray(req.body.recommendations, report.recommendations || []);
  const nextImages = [
    ...(report.images || []),
    ...uploadedImages,
  ];

  const before = serializeMaintenanceReport(report, req.user);
  const updated = await maintenanceReportRepository.updateById(report._id, {
    visitInfo: nextVisitInfo,
    maintenanceTypes: nextMaintenanceTypes,
    inspectedDevices: nextInspectedDevices,
    performedActions: nextPerformedActions,
    detectedIssues: nextDetectedIssues,
    usedMaterials: nextUsedMaterials,
    recommendations: nextRecommendations,
    images: nextImages,
    status: MaintenanceReportStatus.DRAFT,
    workflowTrail: [
      ...(report.workflowTrail || []),
      buildWorkflowEntry({
        action: 'MAINTENANCE_REPORT_SAVED',
        actorId: req.user.id,
        actorName: req.user.name || req.user.fullName || '',
        beforeStatus: report.status,
        afterStatus: MaintenanceReportStatus.DRAFT,
        notes: toCleanString(req.body.saveNote),
      }),
    ],
  });

  const notifyTargets = [
    String(report.createdBy?._id || report.createdBy || ''),
  ].filter((item) => item && item !== String(req.user.id));

  if (notifyTargets.length) {
    await notificationService.notifyMaintenanceReportStatus(notifyTargets, {
      requestId: String(updated._id),
      requestNo: updated.requestNo,
      previousStatus: report.status,
      status: updated.status,
      customerName: updated.customerName,
      action: 'SAVE_DRAFT',
      messageAr: `تم حفظ تقرير الصيانة ${updated.requestNo} كمسودة من قبل ${req.user.name || req.user.fullName || 'الفني'}.`,
    });
  }

  await auditService.log({
    actorId: req.user.id,
    action: 'MAINTENANCE_REPORT_DRAFT_SAVED',
    entityType: 'MAINTENANCE_REPORT',
    entityId: updated._id,
    before,
    after: serializeMaintenanceReport(updated, req.user),
    req,
  });

  res.json({
    report: serializeMaintenanceReport(updated, req.user),
  });
});

export const completeMaintenanceReport = asyncHandler(async (req, res) => {
  const report = await maintenanceReportRepository.findById(req.params.id);
  if (!report) {
    throw new AppError('Maintenance report not found', 404);
  }

  if (!isAssignedMaintenanceEmployee(req.user, report)) {
    throw new AppError('Only the assigned employee can complete this report', 403);
  }

  validateCompletionReadiness(report);

  const before = serializeMaintenanceReport(report, req.user);
  let pointsLedgerId = report.pointsLedger?._id || report.pointsLedger || null;
  let pointsGrantedAt = report.pointsGrantedAt || null;

  if (!pointsLedgerId && Number(report.points || 0) > 0) {
    const outcome = await performancePointsService.awardPoints({
      userId: req.user.id,
      points: Number(report.points || 0),
      category: 'MAINTENANCE_REPORT',
      reason: `إكمال تقرير الصيانة ${report.requestNo}`,
      approvedBy: req.user.id,
      sourceAction: 'MAINTENANCE_REPORT_COMPLETED',
      metadata: {
        maintenanceReportId: String(report._id),
        requestNo: report.requestNo,
        customerName: report.customerName,
        projectNumber: report.projectNumber,
      },
      actorId: req.user.id,
      req,
    });

    pointsLedgerId = outcome.ledger?._id || null;
    pointsGrantedAt = outcome.ledger?.createdAt || new Date();
  }

  let updated = await maintenanceReportRepository.updateById(report._id, {
    status: MaintenanceReportStatus.COMPLETED,
    completedAt: new Date(),
    pointsLedger: pointsLedgerId,
    pointsGrantedAt,
    workflowTrail: [
      ...(report.workflowTrail || []),
      buildWorkflowEntry({
        action: 'MAINTENANCE_REPORT_COMPLETED',
        actorId: req.user.id,
        actorName: req.user.name || req.user.fullName || '',
        beforeStatus: report.status,
        afterStatus: MaintenanceReportStatus.COMPLETED,
      }),
    ],
  });

  try {
    const storedPdf = await ensureStoredMaintenanceReportPdf({
      report: updated,
      req,
    });
    updated = storedPdf.report;
  } catch (pdfError) {
    console.error('PDF generation failed for maintenance report', updated._id, pdfError.message);
  }

  const notifyTargets = [
    String(updated.createdBy?._id || updated.createdBy || ''),
    String(updated.managerReviewer?._id || updated.managerReviewer || ''),
  ].filter((item) => item && item !== String(req.user.id));

  if (notifyTargets.length) {
    await notificationService.notifyMaintenanceReportStatus(notifyTargets, {
      requestId: String(updated._id),
      requestNo: updated.requestNo,
      previousStatus: report.status,
      status: updated.status,
      customerName: updated.customerName,
      action: 'COMPLETE',
      messageAr: `تم إكمال تقرير الصيانة ${updated.requestNo} ومنح ${updated.points} نقطة للفني.`,
    });
  }

  await auditService.log({
    actorId: req.user.id,
    action: 'MAINTENANCE_REPORT_COMPLETED',
    entityType: 'MAINTENANCE_REPORT',
    entityId: updated._id,
    before,
    after: serializeMaintenanceReport(updated, req.user),
    req,
  });

  res.json({
    report: serializeMaintenanceReport(updated, req.user),
  });
});

export const sendMaintenanceFeedbackLink = asyncHandler(async (req, res) => {
  const report = await maintenanceReportRepository.findById(req.params.id);
  if (!report) {
    throw new AppError('Maintenance report not found', 404);
  }

  if (!isAssignedMaintenanceEmployee(req.user, report) && !canAccessAllMaintenanceReports(req.user)) {
    throw new AppError('You cannot generate customer feedback link for this report', 403);
  }

  if (![MaintenanceReportStatus.COMPLETED, MaintenanceReportStatus.AWAITING_CUSTOMER_FEEDBACK, MaintenanceReportStatus.RETURNED_FOR_EDIT].includes(report.status)) {
    throw new AppError('Customer feedback link can only be generated after completing the report', 400);
  }

  const token = createMaintenanceFeedbackToken();
  const feedbackUrl = `${resolveFrontendBaseUrl()}/maintenance-feedback/${token.rawToken}`;
  const before = serializeMaintenanceReport(report, req.user);
  const updated = await maintenanceReportRepository.updateById(report._id, {
    status: MaintenanceReportStatus.AWAITING_CUSTOMER_FEEDBACK,
    feedbackSentAt: new Date(),
    customerFeedback: {
      ...(report.customerFeedback?.toObject ? report.customerFeedback.toObject() : report.customerFeedback || {}),
      tokenHash: token.tokenHash,
      sentAt: new Date(),
      expiresAt: token.expiresAt,
      usedAt: null,
      submittedAt: null,
      customerName: report.customerName,
      projectType: '',
      companyRating: 0,
      employeeRating: 0,
      notes: '',
      suggestions: '',
    },
    workflowTrail: [
      ...(report.workflowTrail || []),
      buildWorkflowEntry({
        action: 'MAINTENANCE_FEEDBACK_LINK_SENT',
        actorId: req.user.id,
        actorName: req.user.name || req.user.fullName || '',
        beforeStatus: report.status,
        afterStatus: MaintenanceReportStatus.AWAITING_CUSTOMER_FEEDBACK,
      }),
    ],
  });

  const notifyTargets = [
    String(updated.createdBy?._id || updated.createdBy || ''),
  ].filter((item) => item && item !== String(req.user.id));

  if (notifyTargets.length) {
    await notificationService.notifyMaintenanceReportStatus(notifyTargets, {
      requestId: String(updated._id),
      requestNo: updated.requestNo,
      previousStatus: report.status,
      status: updated.status,
      customerName: updated.customerName,
      action: 'SEND_FEEDBACK_LINK',
      messageAr: `تم إرسال رابط تقييم الزبون لتقرير الصيانة ${updated.requestNo}.`,
    });
  }

  await auditService.log({
    actorId: req.user.id,
    action: 'MAINTENANCE_FEEDBACK_LINK_CREATED',
    entityType: 'MAINTENANCE_REPORT',
    entityId: updated._id,
    before,
    after: {
      ...serializeMaintenanceReport(updated, req.user),
      feedbackUrl,
    },
    req,
  });

  res.json({
    report: serializeMaintenanceReport(updated, req.user),
    feedback: {
      url: feedbackUrl,
      expiresAt: token.expiresAt,
      whatsappUrl: buildWhatsAppSendUrl(
        updated.phone,
        [
          'نشكر تعاونكم مع Delta Plus.',
          `رابط تقييم الخدمة لتقرير الصيانة رقم ${updated.requestNo}:`,
          feedbackUrl,
        ].join('\n'),
      ),
    },
  });
});

export const submitMaintenanceReportForApproval = asyncHandler(async (req, res) => {
  const report = await maintenanceReportRepository.findById(req.params.id);
  if (!report) {
    throw new AppError('Maintenance report not found', 404);
  }

  if (!isAssignedMaintenanceEmployee(req.user, report)) {
    throw new AppError('Only the assigned employee can submit this report for approval', 403);
  }

  if (![MaintenanceReportStatus.COMPLETED, MaintenanceReportStatus.AWAITING_CUSTOMER_FEEDBACK, MaintenanceReportStatus.FEEDBACK_SUBMITTED, MaintenanceReportStatus.RETURNED_FOR_EDIT].includes(report.status)) {
    throw new AppError('This report cannot be submitted for approval in its current state', 400);
  }

  const managerReviewer = report.managerReviewer?._id || report.managerReviewer
    ? report.managerReviewer
    : await resolveManagerReviewer(req.user.id);

  if (!managerReviewer) {
    throw new AppError('Direct manager could not be resolved for approval', 409);
  }

  const managerReviewerId = String(managerReviewer._id || managerReviewer);
  const managerReviewerName = report.managerReviewerName || managerReviewer.fullName || '';
  const before = serializeMaintenanceReport(report, req.user);
  const updated = await maintenanceReportRepository.updateById(report._id, {
    managerReviewer: managerReviewerId,
    managerReviewerName,
    status: MaintenanceReportStatus.PENDING_MANAGER_APPROVAL,
    submittedForApprovalAt: new Date(),
    workflowTrail: [
      ...(report.workflowTrail || []),
      buildWorkflowEntry({
        action: 'MAINTENANCE_REPORT_SUBMITTED_FOR_APPROVAL',
        actorId: req.user.id,
        actorName: req.user.name || req.user.fullName || '',
        beforeStatus: report.status,
        afterStatus: MaintenanceReportStatus.PENDING_MANAGER_APPROVAL,
        notes: toCleanString(req.body.notes),
      }),
    ],
  });

  await notificationService.notifyMaintenanceReportStatus(
    [managerReviewerId, String(updated.createdBy?._id || updated.createdBy || '')].filter((item) => item && item !== String(req.user.id)),
    {
      requestId: String(updated._id),
      requestNo: updated.requestNo,
      previousStatus: report.status,
      status: updated.status,
      customerName: updated.customerName,
      action: 'SUBMIT_FOR_APPROVAL',
      messageAr: `تم إرسال تقرير الصيانة ${updated.requestNo} إلى المدير المباشر للاعتماد.`,
    },
  );

  await auditService.log({
    actorId: req.user.id,
    action: 'MAINTENANCE_REPORT_SUBMITTED_FOR_APPROVAL',
    entityType: 'MAINTENANCE_REPORT',
    entityId: updated._id,
    before,
    after: serializeMaintenanceReport(updated, req.user),
    req,
  });

  res.json({
    report: serializeMaintenanceReport(updated, req.user),
  });
});

export const reviewMaintenanceReport = asyncHandler(async (req, res) => {
  const report = await maintenanceReportRepository.findById(req.params.id);
  if (!report) {
    throw new AppError('Maintenance report not found', 404);
  }

  if (!isMaintenanceManagerReviewer(req.user, report)) {
    throw new AppError('Only the direct manager can review this maintenance report', 403);
  }

  if (report.status !== MaintenanceReportStatus.PENDING_MANAGER_APPROVAL) {
    throw new AppError('Only reports pending manager approval can be reviewed', 400);
  }

  const action = toCleanString(req.body.action).toUpperCase();
  if (!['APPROVE', 'REJECT', 'RETURN_FOR_EDIT'].includes(action)) {
    throw new AppError('action must be APPROVE, REJECT, or RETURN_FOR_EDIT', 400);
  }

  const notes = toCleanString(req.body.notes);
  if (['REJECT', 'RETURN_FOR_EDIT'].includes(action) && !notes) {
    throw new AppError('notes are required when rejecting or returning the report', 400);
  }

  const nextStatus = action === 'APPROVE'
    ? MaintenanceReportStatus.APPROVED
    : action === 'REJECT'
      ? MaintenanceReportStatus.REJECTED
      : MaintenanceReportStatus.RETURNED_FOR_EDIT;

  const before = serializeMaintenanceReport(report, req.user);
  const updated = await maintenanceReportRepository.updateById(report._id, {
    status: nextStatus,
    approvedAt: action === 'APPROVE' ? new Date() : report.approvedAt,
    rejectedAt: action === 'REJECT' ? new Date() : null,
    closedAt: action === 'APPROVE' ? new Date() : null,
    managerReview: {
      action,
      notes,
      reviewedBy: req.user.id,
      reviewedAt: new Date(),
    },
    workflowTrail: [
      ...(report.workflowTrail || []),
      buildWorkflowEntry({
        action: `MAINTENANCE_REPORT_${action}`,
        actorId: req.user.id,
        actorName: req.user.name || req.user.fullName || '',
        beforeStatus: report.status,
        afterStatus: nextStatus,
        notes,
      }),
    ],
  });

  const notifyTargets = [
    String(updated.assignedEmployee?._id || updated.assignedEmployee || ''),
    String(updated.createdBy?._id || updated.createdBy || ''),
  ].filter((item) => item && item !== String(req.user.id));

  await notificationService.notifyMaintenanceReportStatus(notifyTargets, {
    requestId: String(updated._id),
    requestNo: updated.requestNo,
    previousStatus: report.status,
    status: updated.status,
    customerName: updated.customerName,
    action,
    messageAr: action === 'APPROVE'
      ? `تم اعتماد تقرير الصيانة ${updated.requestNo} وإغلاق المهمة.`
      : action === 'REJECT'
        ? `تم رفض تقرير الصيانة ${updated.requestNo}.`
        : `تمت إعادة تقرير الصيانة ${updated.requestNo} للتعديل.`,
  });

  await auditService.log({
    actorId: req.user.id,
    action: `MAINTENANCE_REPORT_${action}`,
    entityType: 'MAINTENANCE_REPORT',
    entityId: updated._id,
    before,
    after: serializeMaintenanceReport(updated, req.user),
    req,
  });

  res.json({
    report: serializeMaintenanceReport(updated, req.user),
  });
});

export const exportMaintenanceReportPdf = asyncHandler(async (req, res) => {
  const report = await maintenanceReportRepository.findById(req.params.id);
  if (!report) {
    throw new AppError('Maintenance report not found', 404);
  }

  assertMaintenanceReportVisible(req, report);

  const stored = await ensureStoredMaintenanceReportPdf({
    report,
    req,
  });

  const filename = stored.pdfFile.filename || `maintenance-report-${String(report._id)}.pdf`;
  const disposition = req.query.download === '1' ? 'attachment' : 'inline';

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
  res.sendFile(stored.absolutePath);
});

export const maintenanceReportWhatsappLink = asyncHandler(async (req, res) => {
  const report = await maintenanceReportRepository.findById(req.params.id);
  if (!report) {
    throw new AppError('Maintenance report not found', 404);
  }

  assertMaintenanceReportVisible(req, report);

  const stored = await ensureStoredMaintenanceReportPdf({
    report,
    req,
  });

  const pdfAbsoluteUrl = `${resolvePublicBaseUrl(req)}${stored.pdfFile.publicUrl}`;
  const message = buildMaintenanceWhatsappMessage({
    report,
    pdfAbsoluteUrl,
  });
  const directUrl = buildWhatsAppSendUrl(report.phone, message);

  await auditService.log({
    actorId: req.user.id,
    action: 'MAINTENANCE_REPORT_WHATSAPP_LINK_CREATED',
    entityType: 'MAINTENANCE_REPORT',
    entityId: report._id,
    after: {
      requestNo: report.requestNo,
      recipient: report.phone,
      pdfUrl: stored.pdfFile.publicUrl,
    },
    req,
  });

  res.json({
    pdfUrl: stored.pdfFile.publicUrl,
    whatsapp: {
      recipient: report.phone,
      url: directUrl || `https://wa.me/?text=${encodeURIComponent(message)}`,
      mode: directUrl ? 'DIRECT' : 'MANUAL_SELECT',
    },
  });
});

export const getPublicMaintenanceFeedback = asyncHandler(async (req, res) => {
  const rawToken = toCleanString(req.params.token);
  if (!rawToken) {
    throw new AppError('Feedback token is required', 400);
  }

  const report = await maintenanceReportRepository.findByFeedbackTokenHash(hashOtp(rawToken));
  if (!report || !isMaintenanceFeedbackTokenValid({
    tokenHash: report.customerFeedback?.tokenHash,
    rawToken,
    expiresAt: report.customerFeedback?.expiresAt,
    usedAt: report.customerFeedback?.usedAt,
  })) {
    throw new AppError('Feedback link is invalid or expired', 410);
  }

  res.json({
    report: {
      id: String(report._id),
      requestNo: report.requestNo,
      customerName: report.customerName,
      siteLocation: report.siteLocation,
      projectNumber: report.projectNumber,
      technicianName: report.assignedEmployee?.fullName || report.assignedEmployeeName || '',
      expiresAt: report.customerFeedback?.expiresAt || null,
      contactPhone: '07721661664',
      contactEmail: 'info@deltaplus-iq.com',
    },
  });
});

export const submitPublicMaintenanceFeedback = asyncHandler(async (req, res) => {
  const rawToken = toCleanString(req.params.token);
  if (!rawToken) {
    throw new AppError('Feedback token is required', 400);
  }

  const report = await maintenanceReportRepository.findByFeedbackTokenHash(hashOtp(rawToken));
  if (!report || !isMaintenanceFeedbackTokenValid({
    tokenHash: report.customerFeedback?.tokenHash,
    rawToken,
    expiresAt: report.customerFeedback?.expiresAt,
    usedAt: report.customerFeedback?.usedAt,
  })) {
    throw new AppError('Feedback link is invalid or expired', 410);
  }

  const customerName = toCleanString(req.body.customerName || report.customerName);
  const projectType = toCleanString(req.body.projectType);
  const companyRating = Math.round(toNumber(req.body.companyRating, 0));
  const employeeRating = Math.round(toNumber(req.body.employeeRating, 0));

  if (!customerName || !Object.values(ProjectType).includes(projectType)) {
    throw new AppError('customerName and valid projectType are required', 400);
  }
  if (companyRating < 1 || companyRating > 5 || employeeRating < 1 || employeeRating > 5) {
    throw new AppError('companyRating and employeeRating must be between 1 and 5', 400);
  }

  const nextManagerReviewer = report.managerReviewer?._id || report.managerReviewer
    ? report.managerReviewer
    : await resolveManagerReviewer(String(report.assignedEmployee?._id || report.assignedEmployee || ''));

  const nextManagerReviewerId = nextManagerReviewer?._id || nextManagerReviewer || null;

  const updated = await maintenanceReportRepository.updateById(report._id, {
    managerReviewer: nextManagerReviewerId,
    managerReviewerName: report.managerReviewerName || nextManagerReviewer?.fullName || '',
    status: MaintenanceReportStatus.PENDING_MANAGER_APPROVAL,
    submittedForApprovalAt: new Date(),
    customerFeedback: {
      ...(report.customerFeedback?.toObject ? report.customerFeedback.toObject() : report.customerFeedback || {}),
      customerName,
      projectType,
      companyRating,
      employeeRating,
      notes: toCleanString(req.body.notes),
      suggestions: toCleanString(req.body.suggestions),
      submittedAt: new Date(),
      usedAt: new Date(),
    },
    workflowTrail: [
      ...(report.workflowTrail || []),
      buildWorkflowEntry({
        action: 'MAINTENANCE_FEEDBACK_SUBMITTED',
        actorId: null,
        actorName: customerName,
        beforeStatus: report.status,
        afterStatus: MaintenanceReportStatus.PENDING_MANAGER_APPROVAL,
        notes: toCleanString(req.body.notes),
      }),
    ],
  });

  const notifyTargets = [
    String(nextManagerReviewerId || ''),
    String(updated.assignedEmployee?._id || updated.assignedEmployee || ''),
    String(updated.createdBy?._id || updated.createdBy || ''),
  ].filter(Boolean);

  await notificationService.notifyMaintenanceReportFeedback(notifyTargets, {
    requestId: String(updated._id),
    requestNo: updated.requestNo,
    customerName,
    companyRating,
    employeeRating,
    messageAr: `وصل تقييم جديد من الزبون لتقرير الصيانة ${updated.requestNo}.`,
  });

  res.json({
    success: true,
    reportId: String(updated._id),
  });
});
