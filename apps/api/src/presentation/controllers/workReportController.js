import { WorkReportRepository } from '../../infrastructure/db/repositories/WorkReportRepository.js';
import { UserRepository } from '../../infrastructure/db/repositories/UserRepository.js';
import { ProjectRepository } from '../../infrastructure/db/repositories/ProjectRepository.js';
import { PointsLedgerRepository } from '../../infrastructure/db/repositories/PointsLedgerRepository.js';
import { GoalRepository } from '../../infrastructure/db/repositories/GoalRepository.js';
import { buildWorkReportPdfBuffer } from '../../infrastructure/reports/workReportPdfBuilder.js';
import { auditService } from '../../application/services/auditService.js';
import { notificationService } from '../../application/services/notificationService.js';
import {
  NotificationWatchPermission,
  resolveNotificationAudience,
} from '../../application/services/notificationAudienceService.js';
import { levelService } from '../../application/services/levelService.js';
import { badgeService } from '../../application/services/badgeService.js';
import { workReportPointsService } from '../../application/services/workReportPointsService.js';
import { env } from '../../config/env.js';
import {
  applyManagedScopeOnFilter,
  isUserWithinManagedScope,
  resolveManagedUserIds,
} from '../../shared/accessScope.js';
import { Permission, Roles } from '../../shared/constants.js';
import { hasAnyPermission, hasPermission } from '../../shared/permissions.js';
import { buildWhatsAppSendUrl } from '../../shared/attendanceUtils.js';
import { AppError, asyncHandler } from '../../shared/errors.js';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const workReportRepository = new WorkReportRepository();
const userRepository = new UserRepository();
const projectRepository = new ProjectRepository();
const pointsLedgerRepository = new PointsLedgerRepository();
const goalRepository = new GoalRepository();
const DEFAULT_WORK_REPORT_APPROVAL_POINTS = 20;

const toCleanString = (value) => {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim();
};

const toNumberInRange = (value, { min, max, fallback, fieldName }) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    if (fallback === undefined || Number.isNaN(fallback)) {
      throw new AppError(`قيمة ${fieldName} غير صحيحة`, 400);
    }
    return fallback;
  }

  if (parsed < min || parsed > max) {
    throw new AppError(`قيمة ${fieldName} يجب أن تكون بين ${min} و ${max}`, 400);
  }

  return parsed;
};

const toOptionalDate = (value) => {
  const raw = toCleanString(value);
  if (!raw) {
    return null;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new AppError('تاريخ العمل غير صالح', 400);
  }
  return date;
};

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

const parseIdArray = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => toCleanString(item)).filter(Boolean);
  }

  const raw = toCleanString(value);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => toCleanString(item)).filter(Boolean);
    }
  } catch {
    return raw.split(',').map((item) => toCleanString(item)).filter(Boolean);
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

const formatPoints = (value) => {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) {
    return '0';
  }

  return Number.isInteger(parsed)
    ? String(parsed)
    : parsed.toFixed(2).replace(/\.?0+$/, '');
};

const resolvePublicBaseUrl = (req) => `${req.protocol}://${req.get('host')}`;
const uploadRootDir = path.resolve(process.cwd(), env.uploadsDir);
const storedWorkReportsDir = path.resolve(uploadRootDir, 'work-reports');

const hasWorkReportArchiveAccess = (user = {}) =>
  hasPermission(user, Permission.VIEW_COMPLETED_WORK_REPORTS);

const hasOwnWorkReportAccess = (user = {}) =>
  hasAnyPermission(user, [
    Permission.VIEW_OWN_WORK_REPORTS,
    Permission.VIEW_TEAM_WORK_REPORTS,
    Permission.APPROVE_TASKS,
    Permission.VIEW_COMPLETED_WORK_REPORTS,
  ]);

const hasTeamWorkReportAccess = (user = {}) =>
  hasAnyPermission(user, [
    Permission.VIEW_TEAM_WORK_REPORTS,
    Permission.APPROVE_TASKS,
    Permission.VIEW_COMPLETED_WORK_REPORTS,
  ]);

const workReportStatusLabelMap = {
  SUBMITTED: 'بانتظار الاعتماد',
  APPROVED: 'معتمد',
  REJECTED: 'مرفوض',
};

const resolveWorkReportStatusLabel = (status) => workReportStatusLabelMap[String(status || '').toUpperCase()] || status || 'غير معروف';

const canApproveOrRejectWorkReport = async ({ actor, report }) => {
  const actorId = String(actor?.id || actor?._id || '');

  if (!actorId) {
    return false;
  }

  if (actor?.role === Roles.GENERAL_MANAGER) {
    return true;
  }

  const ownerId = String(report?.user?._id || report?.user || '');
  if (!ownerId) {
    return false;
  }

  if (actor?.role === Roles.PROJECT_MANAGER) {
    const managedUserIds = await resolveManagedUserIds({
      userRepository,
      actorId,
      actorRole: actor.role,
    });

    return ownerId !== actorId && isUserWithinManagedScope({
      managedUserIds,
      userId: ownerId,
    });
  }

  const owner = await userRepository.findById(ownerId);
  const ownerManagerId = String(owner?.manager?._id || owner?.manager || '');

  return ownerManagerId && ownerManagerId === actorId;
};

const resolveStoredWorkReportPdfAbsolutePath = (publicUrl) => {
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

const buildStoredWorkReportPdfPayload = ({ publicUrl, filename, absolutePath }) => ({
  publicUrl,
  filename,
  size: fs.existsSync(absolutePath) ? Number(fs.statSync(absolutePath).size || 0) : 0,
  generatedAt: new Date(),
});

const serializeWorkReportParticipantEmployee = (user) => ({
  id: String(user._id || user.id),
  fullName: user.fullName,
  employeeCode: user.employeeCode || '',
  role: user.role || '',
  department: user.department || '',
  jobTitle: user.jobTitle || '',
});

const resolveWorkReportParticipants = async ({ participantIds, participantCount, authorId }) => {
  const cleanedIds = participantIds.map((item) => toCleanString(item)).filter(Boolean);

  if (new Set(cleanedIds).size !== cleanedIds.length) {
    throw new AppError('لا يمكن تكرار نفس المشارك داخل التقرير', 400);
  }

  if (cleanedIds.includes(String(authorId))) {
    throw new AppError('لا يمكن اختيار كاتب التقرير ضمن المشاركين', 400);
  }

  if (participantCount !== cleanedIds.length) {
    throw new AppError('عدد المشاركين لا يطابق الأسماء المختارة', 400);
  }

  if (!cleanedIds.length) {
    return [];
  }

  const participants = await userRepository.listByIds(cleanedIds);
  if (participants.length !== cleanedIds.length) {
    throw new AppError('أحد المشاركين المختارين غير صالح أو غير نشط', 400);
  }

  const participantMap = new Map(
    participants.map((item) => [String(item._id || item.id), item]),
  );

  return cleanedIds.map((id) => {
    const participant = participantMap.get(String(id));
    if (!participant) {
      throw new AppError('أحد المشاركين المختارين غير صالح أو غير نشط', 400);
    }

    return {
      user: participant._id,
      fullName: participant.fullName,
      employeeCode: participant.employeeCode || '',
    };
  });
};

const grantPointsToWorkReportUser = async ({
  userId,
  points,
  report,
  approvedBy,
  distributionRole,
}) => {
  const safePoints = Number(points || 0);
  if (safePoints <= 0) {
    return null;
  }

  const targetUser = await userRepository.findById(userId);
  if (!targetUser) {
    throw new AppError('تعذر العثور على حساب أحد المشاركين أثناء الاعتماد', 409);
  }

  await pointsLedgerRepository.create({
    user: targetUser._id,
    points: safePoints,
    category: 'WORK_REPORT_APPROVAL',
    reason: distributionRole === 'REPORT_AUTHOR'
      ? `اعتماد تقرير عمل: ${report.title || report.projectName || 'بدون عنوان'}`
      : `مشاركة في تقرير عمل: ${report.title || report.projectName || 'بدون عنوان'}`,
    approvedBy,
    sourceAction: 'WORK_REPORT_APPROVAL',
    metadata: {
      workReportId: String(report._id),
      distributionRole,
      totalPoints: Number(report.pointsAwarded || 0),
      participantCount: Number(report.participantCount || report.participants?.length || 0),
    },
  });

  const updatedPoints = Number(targetUser.pointsTotal || 0) + safePoints;
  const nextLevel = levelService.resolveLevel(updatedPoints);
  const updatedUser = await userRepository.incrementPointsAndSetLevel(targetUser._id, safePoints, nextLevel);
  const generatedBadges = badgeService.evaluate(updatedUser, 0);

  for (const badgeCode of generatedBadges) {
    if (!updatedUser.badges.includes(badgeCode)) {
      await userRepository.attachBadge(updatedUser._id, badgeCode);
    }
  }

  const goalUpdates = await goalRepository.incrementActiveGoals(updatedUser._id, safePoints);
  for (const goal of goalUpdates) {
    if (goal.achieved) {
      await notificationService.notifyGoalAchieved(updatedUser._id, goal);
    }
  }

  return updatedUser;
};

const assertWorkReportAccess = async (req, report) => {
  if (report?.status === 'APPROVED' && hasWorkReportArchiveAccess(req.user)) {
    return;
  }

  const reportOwnerId = String(report.user?._id || report.user || '');
  if (reportOwnerId === String(req.user.id) && hasOwnWorkReportAccess(req.user)) {
    return;
  }

  if (!hasTeamWorkReportAccess(req.user)) {
    throw new AppError('ليس لديك صلاحية الوصول إلى تقرير العمل هذا', 403);
  }

  const managedUserIds = await resolveManagedUserIds({
    userRepository,
    actorId: req.user.id,
    actorRole: req.user.role,
  });

  if (!isUserWithinManagedScope({ managedUserIds, userId: report.user?._id || report.user })) {
    throw new AppError('ليس لديك صلاحية الوصول إلى تقرير العمل هذا', 403);
  }
};

const createStoredWorkReportPdf = async ({ report, req }) => {
  const buffer = await buildWorkReportPdfBuffer(report, {
    publicBaseUrl: resolvePublicBaseUrl(req),
    uploadRootDir,
  });

  if (!fs.existsSync(storedWorkReportsDir)) {
    fs.mkdirSync(storedWorkReportsDir, { recursive: true });
  }

  const filename = `work-report-${String(report._id)}-${Date.now()}-${randomUUID().slice(0, 8)}.pdf`;
  const absolutePath = path.resolve(storedWorkReportsDir, filename);
  fs.writeFileSync(absolutePath, buffer);

  return {
    filename,
    absolutePath,
    pdfUrl: `/uploads/work-reports/${filename}`,
  };
};

const ensureStoredWorkReportPdf = async ({ report, req }) => {
  const existingPublicUrl = toCleanString(report?.pdfFile?.publicUrl);
  const existingFilename = toCleanString(report?.pdfFile?.filename);
  const existingAbsolutePath = resolveStoredWorkReportPdfAbsolutePath(existingPublicUrl);

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

  const stored = await createStoredWorkReportPdf({ report, req });
  const pdfFile = buildStoredWorkReportPdfPayload({
    publicUrl: stored.pdfUrl,
    filename: stored.filename,
    absolutePath: stored.absolutePath,
  });

  const updatedReport = await workReportRepository.updateById(report._id, {
    pdfFile,
  });

  return {
    report: updatedReport,
    pdfFile,
    absolutePath: stored.absolutePath,
    createdNew: true,
  };
};

const resolveWorkReportRecipientPhone = async (report) => {
  const ownerId = report.user?._id || report.user;
  const owner = await userRepository.findByIdWithManager(ownerId);
  const managerPhone = String(owner?.manager?.phone || '').trim();
  return managerPhone || env.attendanceAdminWhatsapp || '';
};

const buildWorkReportWhatsappMessage = (report, pdfAbsoluteUrl) => {
  const employeeName = report?.employeeName || report?.user?.fullName || '-';
  const employeeCode = report?.employeeCode || report?.user?.employeeCode || '-';
  const projectName = report?.project?.name || report?.projectName || '-';
  const progress = Number(report?.progressPercent || 0);
  const participantCount = Number(report?.participantCount || report?.participants?.length || 0);
  const participantSummaryLine = `عدد الكادر المشارك: ${participantCount}`;

  return [
    'تقرير عمل PDF - Delta Plus',
    `الموظف: ${employeeName}`,
    `رمز الموظف: ${employeeCode}`,
    `المشروع: ${projectName}`,
    `نسبة الإنجاز: ${progress}%`,
    participantSummaryLine,
    `تاريخ التقرير: ${new Date(report?.workDate || report?.createdAt || new Date()).toLocaleDateString('ar-IQ')}`,
    `رابط التقرير PDF: ${pdfAbsoluteUrl}`,
    'يرجى فتح الرابط ومراجعة التقرير.',
  ].join('\n');
};

export const listWorkReportEmployees = asyncHandler(async (_req, res) => {
  const users = await userRepository.listActive({ includeManager: false });
  res.json({
    employees: users.map((user) => serializeWorkReportParticipantEmployee(user)),
  });
});

export const createWorkReport = asyncHandler(async (req, res) => {
  const projectId = toCleanString(req.body.projectId || req.body.project);
  const manualProjectName = toCleanString(req.body.projectName);
  const details = toCleanString(req.body.details);

  if (!projectId && !manualProjectName) {
    throw new AppError('اسم المشروع مطلوب', 400);
  }
  if (!details) {
    throw new AppError('تفاصيل التقرير مطلوبة', 400);
  }

  const [user, project] = await Promise.all([
    userRepository.findById(req.user.id),
    projectId ? projectRepository.findById(projectId) : Promise.resolve(null),
  ]);

  if (!user || !user.active) {
    throw new AppError('المستخدم غير موجود أو غير نشط', 404);
  }
  if (projectId && !project) {
    throw new AppError('المشروع غير موجود', 404);
  }

  const resolvedProjectName = project?.name || manualProjectName;

  const progressPercent = toNumberInRange(req.body.progressPercent, {
    min: 0,
    max: 100,
    fallback: 0,
    fieldName: 'progressPercent',
  });
  const hoursSpent = toNumberInRange(req.body.hoursSpent, {
    min: 0,
    max: 24,
    fallback: 0,
    fieldName: 'hoursSpent',
  });
  const participantIds = parseIdArray(req.body.participantIds);
  const participantCount = toNumberInRange(req.body.participantCount, {
    min: 0,
    max: 100,
    fallback: participantIds.length,
    fieldName: 'participantCount',
  });
  const participants = await resolveWorkReportParticipants({
    participantIds,
    participantCount,
    authorId: req.user.id,
  });
  const files = Array.isArray(req.files) ? req.files : [];
  const comments = parseImageComments(req.body.imageComments);
  const images = buildUploadedImages(files, comments);

  const created = await workReportRepository.create({
    user: req.user.id,
    employeeName: user.fullName,
    employeeCode: user.employeeCode || '',
    project: project?._id || null,
    projectName: resolvedProjectName,
    activityType: toCleanString(req.body.activityType),
    title: toCleanString(req.body.title),
    details,
    accomplishments: toCleanString(req.body.accomplishments),
    challenges: toCleanString(req.body.challenges),
    nextSteps: toCleanString(req.body.nextSteps),
    progressPercent,
    hoursSpent,
    workDate: toOptionalDate(req.body.workDate) || new Date(),
    images,
    participantCount,
    participants,
    status: 'SUBMITTED',
    pointsAwarded: 0,
    reporterPointsAwarded: 0,
    participantPointsAwarded: 0,
    participantsTotalAwarded: 0,
  });

  let report = await workReportRepository.findById(created._id);

  try {
    const storedPdf = await ensureStoredWorkReportPdf({
      report,
      req,
    });
    report = storedPdf.report;
  } catch (pdfError) {
    // Log the error but do NOT delete the report â€” the user's data is preserved.
    // The PDF can be regenerated later via ensureStoredWorkReportPdf.
    console.error('PDF generation failed for work report', created._id, pdfError.message);
  }

  await auditService.log({
    actorId: req.user.id,
    action: 'WORK_REPORT_CREATED',
    entityType: 'WORK_REPORT',
    entityId: created._id,
    after: {
      projectId: project ? String(project._id) : '',
      projectName: resolvedProjectName,
      progressPercent,
      hoursSpent,
      imagesCount: images.length,
      participantCount,
      participantIds: participants.map((item) => String(item.user)),
      pdfUrl: report.pdfFile?.publicUrl || '',
      status: 'SUBMITTED',
    },
    req,
  });

  const workReportRecipients = await resolveNotificationAudience({
    userRepository,
    actorId: req.user.id,
    watchPermission: NotificationWatchPermission.WORK_REPORT,
  });
  await notificationService.notifyWorkReportCreated(workReportRecipients, {
    employeeName: user.fullName,
    reportTitle: report.title || report.activityType || 'بدون عنوان',
    projectName: resolvedProjectName || report.projectName || '-',
    occurredAt: report.createdAt || new Date(),
    metadata: {
      workReportId: String(report._id),
      ...(project ? { projectId: String(project._id) } : {}),
    },
  });

  const operationRecipients = await resolveNotificationAudience({
    userRepository,
    actorId: req.user.id,
    watchPermission: NotificationWatchPermission.OPERATION,
  });
  await notificationService.notifyOperationActivity(operationRecipients, {
    titleAr: 'إنشاء تقرير عمل',
    actorName: user.fullName,
    actionLabel: 'إنشاء تقرير عمل',
    entityLabel: report.title || resolvedProjectName || 'تقرير عمل',
    occurredAt: report.createdAt || new Date(),
    metadata: {
      entityType: 'WORK_REPORT',
      entityId: String(report._id),
      action: 'WORK_REPORT_CREATED',
    },
  });

  res.status(201).json({ report });
});

export const listWorkReports = asyncHandler(async (req, res) => {
  if (!hasOwnWorkReportAccess(req.user)) {
    throw new AppError('ليس لديك صلاحية عرض تقارير العمل', 403);
  }

  const filter = {};

  if (req.query.status) {
    filter.status = req.query.status;
  }
  if (req.query.projectId) {
    filter.project = req.query.projectId;
  }

  const managedUserIds = hasTeamWorkReportAccess(req.user)
    ? await resolveManagedUserIds({
        userRepository,
        actorId: req.user.id,
        actorRole: req.user.role,
      })
    : [req.user.id];

  applyManagedScopeOnFilter({
    filter,
    managedUserIds,
    field: 'user',
    requestedUserId: hasTeamWorkReportAccess(req.user) ? req.query.userId : req.user.id,
  });

  const reports = await workReportRepository.list(filter);
  res.json({ reports });
});

export const listCompletedWorkReports = asyncHandler(async (_req, res) => {
  const reports = await workReportRepository.list(
    { status: 'APPROVED' },
    { sort: { approvedAt: -1, createdAt: -1 } },
  );

  res.json({ reports });
});

export const getWorkReport = asyncHandler(async (req, res) => {
  const report = await workReportRepository.findById(req.params.id);
  if (!report) {
    throw new AppError('تقرير العمل غير موجود', 404);
  }

  await assertWorkReportAccess(req, report);

  res.json({ report });
});

export const exportWorkReportPdf = asyncHandler(async (req, res) => {
  const report = await workReportRepository.findById(req.params.id);
  if (!report) {
    throw new AppError('تقرير العمل غير موجود', 404);
  }

  await assertWorkReportAccess(req, report);

  const stored = await ensureStoredWorkReportPdf({
    report,
    req,
  });
  const filename = stored.pdfFile.filename || `work-report-${String(report._id)}.pdf`;
  const disposition = req.query.download === '1' ? 'attachment' : 'inline';

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
  res.sendFile(stored.absolutePath);
});

export const saveWorkReportPdf = asyncHandler(async (req, res) => {
  const report = await workReportRepository.findById(req.params.id);
  if (!report) {
    throw new AppError('تقرير العمل غير موجود', 404);
  }

  await assertWorkReportAccess(req, report);

  const stored = await ensureStoredWorkReportPdf({
    report,
    req,
  });
  const pdfUrl = stored.pdfFile.publicUrl;

  await auditService.log({
    actorId: req.user.id,
    action: 'WORK_REPORT_PDF_RESOLVED',
    entityType: 'WORK_REPORT',
    entityId: report._id,
    after: {
      pdfUrl,
      reusedExisting: !stored.createdNew,
    },
    req,
  });

  res.status(stored.createdNew ? 201 : 200).json({
    reportId: String(report._id),
    pdfUrl,
  });
});

export const workReportWhatsappLink = asyncHandler(async (req, res) => {
  if (!hasPermission(req.user, Permission.SEND_REPORTS_WHATSAPP)) {
    throw new AppError('ليس لديك صلاحية إرسال تقارير العمل عبر واتساب', 403);
  }

  const report = await workReportRepository.findById(req.params.id);
  if (!report) {
    throw new AppError('تقرير العمل غير موجود', 404);
  }

  await assertWorkReportAccess(req, report);

  const stored = await ensureStoredWorkReportPdf({
    report,
    req,
  });

  const recipient = await resolveWorkReportRecipientPhone(report);
  const pdfAbsoluteUrl = `${resolvePublicBaseUrl(req)}${stored.pdfFile.publicUrl}`;
  const message = buildWorkReportWhatsappMessage(report, pdfAbsoluteUrl);
  const directUrl = buildWhatsAppSendUrl(recipient, message);
  const whatsappUrl = directUrl || `https://wa.me/?text=${encodeURIComponent(message)}`;

  await auditService.log({
    actorId: req.user.id,
    action: 'WORK_REPORT_WHATSAPP_LINK_CREATED',
    entityType: 'WORK_REPORT',
    entityId: report._id,
    after: {
      recipient,
      pdfUrl: stored.pdfFile.publicUrl,
      reusedExisting: !stored.createdNew,
      mode: directUrl ? 'DIRECT' : 'MANUAL_SELECT',
    },
    req,
  });

  res.json({
    pdfUrl: stored.pdfFile.publicUrl,
    whatsapp: {
      recipient,
      url: whatsappUrl,
      mode: directUrl ? 'DIRECT' : 'MANUAL_SELECT',
    },
  });
});

export const approveWorkReport = asyncHandler(async (req, res) => {
  const report = await workReportRepository.findById(req.params.id);
  if (!report) {
    throw new AppError('تقرير العمل غير موجود', 404);
  }

  if (report.status !== 'SUBMITTED') {
    throw new AppError(`لا يمكن اعتماد التقرير لأن حالته الحالية هي: ${resolveWorkReportStatusLabel(report.status)}`, 400);
  }

  if (String(report.user?._id || report.user) === req.user.id) {
    throw new AppError('لا يمكنك اعتماد تقريرك الشخصي', 403);
  }

  const canApprove = await canApproveOrRejectWorkReport({
    actor: req.user,
    report,
  });

  if (!canApprove) {
    throw new AppError('الاعتماد متاح فقط للمدير المباشر أو المدير العام', 403);
  }

  const rawPoints = toCleanString(req.body.points);
  const points = rawPoints
    ? toNumberInRange(rawPoints, {
        min: 1,
        max: 1000,
        fallback: NaN,
        fieldName: 'points',
      })
    : DEFAULT_WORK_REPORT_APPROVAL_POINTS;
  const managerComment = toCleanString(req.body.managerComment);
  const distribution = workReportPointsService.calculateDistribution(
    points,
    report.participants?.length || 0,
  );
  const authorId = report.user?._id || report.user;
  const participants = Array.isArray(report.participants) ? report.participants : [];
  const reportLabel = report.title || report.projectName || 'بدون عنوان';

  const before = {
    status: report.status,
    pointsAwarded: report.pointsAwarded || 0,
    reporterPointsAwarded: report.reporterPointsAwarded || 0,
    participantPointsAwarded: report.participantPointsAwarded || 0,
    participantsTotalAwarded: report.participantsTotalAwarded || 0,
  };

  const updated = await workReportRepository.updateById(report._id, {
    status: 'APPROVED',
    pointsAwarded: distribution.totalPoints,
    reporterPointsAwarded: distribution.reporterPoints,
    participantPointsAwarded: distribution.participantPoints,
    participantsTotalAwarded: distribution.participantsTotalPoints,
    approvedBy: req.user.id,
    approvedAt: new Date(),
    managerComment,
    rejectionReason: '',
  });

  await grantPointsToWorkReportUser({
    userId: authorId,
    points: distribution.reporterPoints,
    report: updated,
    approvedBy: req.user.id,
    distributionRole: 'REPORT_AUTHOR',
  });

  for (const participant of participants) {
    await grantPointsToWorkReportUser({
      userId: participant.user?._id || participant.user,
      points: distribution.participantPoints,
      report: updated,
      approvedBy: req.user.id,
      distributionRole: 'PARTICIPANT',
    });
  }

  await notificationService.notifySystem(
    authorId,
    'تم اعتماد تقرير العمل',
    participants.length
      ? `تم اعتماد تقريرك "${reportLabel}" بنجاح. تم منحك ${formatPoints(distribution.reporterPoints)} نقطة ككاتب للتقرير، وإجمالي نقاط التقرير ${formatPoints(distribution.totalPoints)} نقطة موزعة على ${distribution.participantCount} مشارك.`
      : `تم اعتماد تقريرك "${reportLabel}" بنجاح. تم منحك ${formatPoints(distribution.reporterPoints)} نقطة.`,
    {
      workReportId: String(report._id),
      totalPoints: distribution.totalPoints,
      reporterPoints: distribution.reporterPoints,
      participantPoints: distribution.participantPoints,
      participantCount: distribution.participantCount,
      status: 'APPROVED',
      approvedAt: updated.approvedAt || new Date(),
    },
  );

  for (const participant of participants) {
    await notificationService.notifySystem(
      participant.user?._id || participant.user,
      'تم اعتماد التقرير ومكافأة المشاركة',
      `تم اعتماد تقرير العمل "${reportLabel}"، وتم منحك ${formatPoints(distribution.participantPoints)} نقطة كمشارك في التنفيذ.`,
      {
        workReportId: String(report._id),
        totalPoints: distribution.totalPoints,
        reporterPoints: distribution.reporterPoints,
        participantPoints: distribution.participantPoints,
        participantCount: distribution.participantCount,
        status: 'APPROVED',
        approvedAt: updated.approvedAt || new Date(),
      },
    );
  }

  await auditService.log({
    actorId: req.user.id,
    action: 'WORK_REPORT_APPROVED',
    entityType: 'WORK_REPORT',
    entityId: report._id,
    before,
    after: {
      status: 'APPROVED',
      pointsAwarded: distribution.totalPoints,
      reporterPointsAwarded: distribution.reporterPoints,
      participantPointsAwarded: distribution.participantPoints,
      participantsTotalAwarded: distribution.participantsTotalPoints,
      participantCount: distribution.participantCount,
    },
    req,
  });

  const reportOperationRecipients = await resolveNotificationAudience({
    userRepository,
    actorId: authorId,
    watchPermission: NotificationWatchPermission.OPERATION,
    excludeUserIds: [req.user.id],
  });
  await notificationService.notifyOperationActivity(reportOperationRecipients, {
    titleAr: 'اعتماد تقرير عمل',
    actorName: req.user.name || req.user.fullName || 'المعتمد',
    actionLabel: 'اعتماد تقرير عمل',
    entityLabel: reportLabel,
    occurredAt: updated.approvedAt || new Date(),
    metadata: {
      entityType: 'WORK_REPORT',
      entityId: String(report._id),
      action: 'WORK_REPORT_APPROVED',
      totalPoints: distribution.totalPoints,
      participantCount: distribution.participantCount,
    },
  });

  res.json({
    report: updated,
    grantedPoints: distribution.totalPoints,
    distribution,
  });
});

export const rejectWorkReport = asyncHandler(async (req, res) => {
  const report = await workReportRepository.findById(req.params.id);
  if (!report) {
    throw new AppError('تقرير العمل غير موجود', 404);
  }

  if (report.status !== 'SUBMITTED') {
    throw new AppError(`لا يمكن رفض التقرير لأن حالته الحالية هي: ${resolveWorkReportStatusLabel(report.status)}`, 400);
  }

  if (String(report.user?._id || report.user) === req.user.id) {
    throw new AppError('لا يمكنك رفض تقريرك الشخصي', 403);
  }

  const canReject = await canApproveOrRejectWorkReport({
    actor: req.user,
    report,
  });

  if (!canReject) {
    throw new AppError('الرفض متاح فقط للمدير المباشر أو المدير العام', 403);
  }

  const reason = toCleanString(req.body.reason);
  if (!reason) {
    throw new AppError('سبب الرفض مطلوب', 400);
  }

  const updated = await workReportRepository.updateById(report._id, {
    status: 'REJECTED',
    rejectionReason: reason,
    managerComment: toCleanString(req.body.managerComment),
    pointsAwarded: 0,
    reporterPointsAwarded: 0,
    participantPointsAwarded: 0,
    participantsTotalAwarded: 0,
    approvedBy: null,
    approvedAt: null,
  });

  await notificationService.notifySystem(
    report.user?._id || report.user,
    'رفض تقرير العمل',
    `تم رفض تقرير العمل "${report.title || report.projectName || 'بدون عنوان'}". السبب: ${reason}`,
    {
      workReportId: String(report._id),
      reason,
    },
  );

  await auditService.log({
    actorId: req.user.id,
    action: 'WORK_REPORT_REJECTED',
    entityType: 'WORK_REPORT',
    entityId: report._id,
    after: {
      status: 'REJECTED',
      reason,
    },
    req,
  });

  const rejectedOperationRecipients = await resolveNotificationAudience({
    userRepository,
    actorId: report.user?._id || report.user,
    watchPermission: NotificationWatchPermission.OPERATION,
    excludeUserIds: [req.user.id],
  });
  await notificationService.notifyOperationActivity(rejectedOperationRecipients, {
    titleAr: 'رفض تقرير عمل',
    actorName: req.user.name || req.user.fullName || 'المعتمد',
    actionLabel: 'رفض تقرير عمل',
    entityLabel: report.title || report.projectName || 'تقرير عمل',
    occurredAt: new Date(),
    metadata: {
      entityType: 'WORK_REPORT',
      entityId: String(report._id),
      action: 'WORK_REPORT_REJECTED',
      reason,
    },
  });

  res.json({ report: updated });
});

