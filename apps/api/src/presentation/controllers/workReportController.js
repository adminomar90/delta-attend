import { WorkReportRepository } from '../../infrastructure/db/repositories/WorkReportRepository.js';
import { UserRepository } from '../../infrastructure/db/repositories/UserRepository.js';
import { ProjectRepository } from '../../infrastructure/db/repositories/ProjectRepository.js';
import { PointsLedgerRepository } from '../../infrastructure/db/repositories/PointsLedgerRepository.js';
import { GoalRepository } from '../../infrastructure/db/repositories/GoalRepository.js';
import { buildWorkReportPdfBuffer } from '../../infrastructure/reports/workReportPdfBuilder.js';
import { auditService } from '../../application/services/auditService.js';
import { notificationService } from '../../application/services/notificationService.js';
import { levelService } from '../../application/services/levelService.js';
import { badgeService } from '../../application/services/badgeService.js';
import { env } from '../../config/env.js';
import {
  applyManagedScopeOnFilter,
  isUserWithinManagedScope,
  resolveManagedUserIds,
} from '../../shared/accessScope.js';
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
      throw new AppError(`${fieldName} must be a valid number`, 400);
    }
    return fallback;
  }

  if (parsed < min || parsed > max) {
    throw new AppError(`${fieldName} must be between ${min} and ${max}`, 400);
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
    throw new AppError('Invalid workDate value', 400);
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

const buildUploadedImages = (files = [], comments = []) =>
  files.map((file, index) => ({
    publicUrl: `/uploads/${file.filename}`,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: Number(file.size || 0),
    comment: toCleanString(comments[index]),
  }));

const resolvePublicBaseUrl = (req) => `${req.protocol}://${req.get('host')}`;

const assertWorkReportAccess = async (req, report) => {
  const managedUserIds = await resolveManagedUserIds({
    userRepository,
    actorId: req.user.id,
    actorRole: req.user.role,
  });

  if (!isUserWithinManagedScope({ managedUserIds, userId: report.user?._id || report.user })) {
    throw new AppError('You cannot access this work report', 403);
  }
};

const createStoredWorkReportPdf = async ({ report, req }) => {
  const buffer = await buildWorkReportPdfBuffer(report, {
    publicBaseUrl: resolvePublicBaseUrl(req),
    uploadRootDir: path.resolve(process.cwd(), env.uploadsDir),
  });

  const reportsDir = path.resolve(process.cwd(), env.uploadsDir, 'work-reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const filename = `work-report-${String(report._id)}-${Date.now()}-${randomUUID().slice(0, 8)}.pdf`;
  const absolutePath = path.resolve(reportsDir, filename);
  fs.writeFileSync(absolutePath, buffer);

  return {
    filename,
    absolutePath,
    pdfUrl: `/uploads/work-reports/${filename}`,
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

  return [
    'تقرير عمل PDF - Delta Plus',
    `الموظف: ${employeeName}`,
    `رمز الموظف: ${employeeCode}`,
    `المشروع: ${projectName}`,
    `نسبة الإنجاز: ${progress}%`,
    `تاريخ التقرير: ${new Date(report?.workDate || report?.createdAt || new Date()).toLocaleDateString('ar-IQ')}`,
    `رابط التقرير PDF: ${pdfAbsoluteUrl}`,
    'يرجى فتح الرابط ومراجعة التقرير.',
  ].join('\n');
};

export const createWorkReport = asyncHandler(async (req, res) => {
  const projectId = toCleanString(req.body.projectId || req.body.project);
  const details = toCleanString(req.body.details);

  if (!projectId) {
    throw new AppError('projectId is required', 400);
  }
  if (!details) {
    throw new AppError('details is required', 400);
  }

  const [user, project] = await Promise.all([
    userRepository.findById(req.user.id),
    projectRepository.findById(projectId),
  ]);

  if (!user || !user.active) {
    throw new AppError('User not found or inactive', 404);
  }
  if (!project) {
    throw new AppError('Project not found', 404);
  }

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
  const files = Array.isArray(req.files) ? req.files : [];
  const comments = parseImageComments(req.body.imageComments);
  const images = buildUploadedImages(files, comments);

  const created = await workReportRepository.create({
    user: req.user.id,
    employeeName: user.fullName,
    employeeCode: user.employeeCode || '',
    project: project._id,
    projectName: project.name || '',
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
    status: 'SUBMITTED',
    pointsAwarded: 0,
  });

  const report = await workReportRepository.findById(created._id);

  await auditService.log({
    actorId: req.user.id,
    action: 'WORK_REPORT_CREATED',
    entityType: 'WORK_REPORT',
    entityId: created._id,
    after: {
      projectId: String(project._id),
      progressPercent,
      hoursSpent,
      imagesCount: images.length,
      status: 'SUBMITTED',
    },
    req,
  });

  res.status(201).json({ report });
});

export const listWorkReports = asyncHandler(async (req, res) => {
  const filter = {};

  if (req.query.status) {
    filter.status = req.query.status;
  }
  if (req.query.projectId) {
    filter.project = req.query.projectId;
  }

  const managedUserIds = await resolveManagedUserIds({
    userRepository,
    actorId: req.user.id,
    actorRole: req.user.role,
  });

  applyManagedScopeOnFilter({
    filter,
    managedUserIds,
    field: 'user',
    requestedUserId: req.query.userId,
  });

  const reports = await workReportRepository.list(filter);
  res.json({ reports });
});

export const getWorkReport = asyncHandler(async (req, res) => {
  const report = await workReportRepository.findById(req.params.id);
  if (!report) {
    throw new AppError('Work report not found', 404);
  }

  await assertWorkReportAccess(req, report);

  res.json({ report });
});

export const exportWorkReportPdf = asyncHandler(async (req, res) => {
  const report = await workReportRepository.findById(req.params.id);
  if (!report) {
    throw new AppError('Work report not found', 404);
  }

  await assertWorkReportAccess(req, report);

  const buffer = await buildWorkReportPdfBuffer(report, {
    publicBaseUrl: resolvePublicBaseUrl(req),
    uploadRootDir: path.resolve(process.cwd(), env.uploadsDir),
  });

  const filename = `work-report-${String(report._id)}.pdf`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.send(buffer);
});

export const saveWorkReportPdf = asyncHandler(async (req, res) => {
  const report = await workReportRepository.findById(req.params.id);
  if (!report) {
    throw new AppError('Work report not found', 404);
  }

  await assertWorkReportAccess(req, report);

  const stored = await createStoredWorkReportPdf({
    report,
    req,
  });
  const pdfUrl = stored.pdfUrl;

  await auditService.log({
    actorId: req.user.id,
    action: 'WORK_REPORT_PDF_SAVED',
    entityType: 'WORK_REPORT',
    entityId: report._id,
    after: {
      pdfUrl,
    },
    req,
  });

  res.status(201).json({
    reportId: String(report._id),
    pdfUrl,
  });
});

export const workReportWhatsappLink = asyncHandler(async (req, res) => {
  const report = await workReportRepository.findById(req.params.id);
  if (!report) {
    throw new AppError('Work report not found', 404);
  }

  await assertWorkReportAccess(req, report);

  const stored = await createStoredWorkReportPdf({
    report,
    req,
  });

  const recipient = await resolveWorkReportRecipientPhone(report);
  const pdfAbsoluteUrl = `${resolvePublicBaseUrl(req)}${stored.pdfUrl}`;
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
      pdfUrl: stored.pdfUrl,
      mode: directUrl ? 'DIRECT' : 'MANUAL_SELECT',
    },
    req,
  });

  res.json({
    pdfUrl: stored.pdfUrl,
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
    throw new AppError('Work report not found', 404);
  }

  if (report.status !== 'SUBMITTED') {
    throw new AppError('Only submitted work reports can be approved', 400);
  }

  if (String(report.user?._id || report.user) === req.user.id) {
    throw new AppError('You cannot approve your own work report', 403);
  }

  const managedUserIds = await resolveManagedUserIds({
    userRepository,
    actorId: req.user.id,
    actorRole: req.user.role,
  });

  if (!isUserWithinManagedScope({ managedUserIds, userId: report.user?._id || report.user })) {
    throw new AppError('You can only approve reports for employees in your management scope', 403);
  }

  const points = Math.round(toNumberInRange(req.body.points, {
    min: 1,
    max: 1000,
    fallback: NaN,
    fieldName: 'points',
  }));
  const managerComment = toCleanString(req.body.managerComment);

  const before = {
    status: report.status,
    pointsAwarded: report.pointsAwarded || 0,
  };

  const updated = await workReportRepository.updateById(report._id, {
    status: 'APPROVED',
    pointsAwarded: points,
    approvedBy: req.user.id,
    approvedAt: new Date(),
    managerComment,
    rejectionReason: '',
  });

  await pointsLedgerRepository.create({
    user: report.user?._id || report.user,
    points,
    category: 'WORK_REPORT_APPROVAL',
    reason: `اعتماد تقرير عمل: ${report.title || report.projectName || 'بدون عنوان'}`,
    approvedBy: req.user.id,
  });

  const assigneeCurrent = await userRepository.findById(report.user?._id || report.user);
  if (assigneeCurrent) {
    const updatedPoints = Number(assigneeCurrent.pointsTotal || 0) + points;
    const nextLevel = levelService.resolveLevel(updatedPoints);
    const updatedUser = await userRepository.incrementPointsAndSetLevel(assigneeCurrent._id, points, nextLevel);
    const generatedBadges = badgeService.evaluate(updatedUser, 0);

    for (const badgeCode of generatedBadges) {
      if (!updatedUser.badges.includes(badgeCode)) {
        await userRepository.attachBadge(updatedUser._id, badgeCode);
      }
    }

    const goalUpdates = await goalRepository.incrementActiveGoals(updatedUser._id, points);
    for (const goal of goalUpdates) {
      if (goal.achieved) {
        await notificationService.notifyGoalAchieved(updatedUser._id, goal);
      }
    }
  }

  await notificationService.notifySystem(
    report.user?._id || report.user,
    'اعتماد تقرير العمل',
    `تم اعتماد تقرير العمل "${report.title || report.projectName || 'بدون عنوان'}" وإضافة ${points} نقطة.`,
    {
      workReportId: String(report._id),
      points,
    },
  );

  await auditService.log({
    actorId: req.user.id,
    action: 'WORK_REPORT_APPROVED',
    entityType: 'WORK_REPORT',
    entityId: report._id,
    before,
    after: {
      status: 'APPROVED',
      pointsAwarded: points,
    },
    req,
  });

  res.json({
    report: updated,
    grantedPoints: points,
  });
});

export const rejectWorkReport = asyncHandler(async (req, res) => {
  const report = await workReportRepository.findById(req.params.id);
  if (!report) {
    throw new AppError('Work report not found', 404);
  }

  if (report.status !== 'SUBMITTED') {
    throw new AppError('Only submitted work reports can be rejected', 400);
  }

  if (String(report.user?._id || report.user) === req.user.id) {
    throw new AppError('You cannot reject your own work report', 403);
  }

  const managedUserIds = await resolveManagedUserIds({
    userRepository,
    actorId: req.user.id,
    actorRole: req.user.role,
  });

  if (!isUserWithinManagedScope({ managedUserIds, userId: report.user?._id || report.user })) {
    throw new AppError('You can only reject reports for employees in your management scope', 403);
  }

  const reason = toCleanString(req.body.reason);
  if (!reason) {
    throw new AppError('reason is required', 400);
  }

  const updated = await workReportRepository.updateById(report._id, {
    status: 'REJECTED',
    rejectionReason: reason,
    managerComment: toCleanString(req.body.managerComment),
    pointsAwarded: 0,
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

  res.json({ report: updated });
});
