import { ProjectRepository } from '../../infrastructure/db/repositories/ProjectRepository.js';
import { UserRepository } from '../../infrastructure/db/repositories/UserRepository.js';
import { PointsLedgerRepository } from '../../infrastructure/db/repositories/PointsLedgerRepository.js';
import { GoalRepository } from '../../infrastructure/db/repositories/GoalRepository.js';
import { auditService } from '../../application/services/auditService.js';
import { notificationService } from '../../application/services/notificationService.js';
import { levelService } from '../../application/services/levelService.js';
import { badgeService } from '../../application/services/badgeService.js';
import {
  NotificationWatchPermission,
  resolveNotificationAudience,
} from '../../application/services/notificationAudienceService.js';
import { Roles } from '../../shared/constants.js';
import { AppError, asyncHandler } from '../../shared/errors.js';

const projectRepository = new ProjectRepository();
const userRepository = new UserRepository();
const pointsLedgerRepository = new PointsLedgerRepository();
const goalRepository = new GoalRepository();

const normalizeApprovalRoles = (roles = []) => {
  const defaultRoles = [Roles.FINANCIAL_MANAGER, Roles.GENERAL_MANAGER];
  if (!Array.isArray(roles) || roles.length === 0) {
    return defaultRoles;
  }

  const validRoles = Object.values(Roles);
  const resolved = [...new Set(roles.filter((item) => validRoles.includes(item)))];
  return resolved.length ? resolved : defaultRoles;
};

const normalizeAwardedPoints = (value) => {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1000) {
    throw new AppError('points must be between 0 and 1000', 400);
  }
  return Math.round(parsed);
};

const awardProjectPoints = async ({ project, approverId, points }) => {
  if (!points) {
    return;
  }

  const ownerId = project.owner?._id || project.owner;

  await pointsLedgerRepository.create({
    user: ownerId,
    points,
    category: 'PROJECT_APPROVAL',
    reason: `اعتماد مشروع: ${project.name}`,
    approvedBy: approverId,
  });

  const ownerCurrent = await userRepository.findById(ownerId);
  if (!ownerCurrent) {
    return;
  }

  const updatedPoints = Number(ownerCurrent.pointsTotal || 0) + points;
  const nextLevel = levelService.resolveLevel(updatedPoints);
  const updatedUser = await userRepository.incrementPointsAndSetLevel(ownerCurrent._id, points, nextLevel);
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

  await notificationService.notifySystem(
    updatedUser._id,
    'اعتماد المشروع',
    `تم اعتماد مشروع "${project.name}" وإضافة ${points} نقطة.`,
    {
      projectId: String(project._id),
      points,
    },
  );
};

export const createProject = asyncHandler(async (req, res) => {
  const {
    name,
    code,
    description = '',
    teamMembers = [],
    startDate,
    endDate,
    budget = 0,
    requiredApprovalRoles,
  } = req.body;

  if (!name || !code) {
    throw new AppError('name and code are required', 400);
  }

  const project = await projectRepository.create({
    name,
    code,
    description,
    teamMembers,
    startDate,
    endDate,
    budget,
    status: 'PENDING_APPROVAL',
    requiredApprovalRoles: normalizeApprovalRoles(requiredApprovalRoles),
    owner: req.user.id,
  });

  const projectFull = await projectRepository.findById(project._id);

  await auditService.log({
    actorId: req.user.id,
    action: 'PROJECT_CREATED',
    entityType: 'PROJECT',
    entityId: project._id,
    after: {
      name,
      code,
      status: project.status,
      requiredApprovalRoles: project.requiredApprovalRoles,
    },
    req,
  });

  const operationRecipients = await resolveNotificationAudience({
    userRepository,
    actorId: req.user.id,
    watchPermission: NotificationWatchPermission.OPERATION,
  });

  if (operationRecipients.length) {
    await notificationService.notifyOperationActivity(operationRecipients, {
      titleAr: 'إنشاء مشروع',
      actorName: req.user.fullName || req.user.name || 'الموظف',
      actionLabel: 'إنشاء مشروع',
      entityLabel: projectFull.name || project.name || 'مشروع',
      occurredAt: projectFull.createdAt || project.createdAt || new Date(),
      metadata: {
        entityType: 'PROJECT',
        entityId: String(projectFull._id || project._id),
        action: 'PROJECT_CREATED',
        projectCode: projectFull.code || project.code || '',
      },
    });
  }

  res.status(201).json({ project: projectFull });
});

export const listProjects = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) {
    filter.status = req.query.status;
  }

  const projects = await projectRepository.list(filter);
  res.json({ projects });
});

export const updateProject = asyncHandler(async (req, res) => {
  const project = await projectRepository.findById(req.params.id);
  if (!project) {
    throw new AppError('Project not found', 404);
  }

  if (['DONE', 'REJECTED'].includes(project.status)) {
    throw new AppError('Cannot update closed project', 400);
  }

  const before = {
    name: project.name,
    status: project.status,
    budget: project.budget,
    requiredApprovalRoles: project.requiredApprovalRoles,
  };

  const payload = {
    ...req.body,
  };

  if (req.body.requiredApprovalRoles) {
    payload.requiredApprovalRoles = normalizeApprovalRoles(req.body.requiredApprovalRoles);
  }

  const updatedProject = await projectRepository.updateById(req.params.id, payload);

  await auditService.log({
    actorId: req.user.id,
    action: 'PROJECT_UPDATED',
    entityType: 'PROJECT',
    entityId: project._id,
    before,
    after: {
      name: updatedProject.name,
      status: updatedProject.status,
      budget: updatedProject.budget,
      requiredApprovalRoles: updatedProject.requiredApprovalRoles,
    },
    req,
  });

  res.json({ project: updatedProject });
});

export const approveProject = asyncHandler(async (req, res) => {
  const project = await projectRepository.findById(req.params.id);
  if (!project) {
    throw new AppError('Project not found', 404);
  }

  if (project.status !== 'PENDING_APPROVAL') {
    throw new AppError('Project is not pending approval', 400);
  }

  const requiredRoles = project.requiredApprovalRoles || [];
  const roleAllowed = requiredRoles.includes(req.user.role) || req.user.role === Roles.GENERAL_MANAGER;

  if (!roleAllowed) {
    throw new AppError('Your role cannot approve this project', 403);
  }

  const alreadyApproved = (project.approvalTrail || []).some(
    (entry) => String(entry.approver?._id || entry.approver) === req.user.id,
  );

  if (alreadyApproved) {
    throw new AppError('You already approved this project', 409);
  }

  const comment = String(req.body.comment || '').trim();
  const requestedPoints = normalizeAwardedPoints(req.body.points || 0);

  const stageProject = await projectRepository.updateById(project._id, {
    $push: {
      approvalTrail: {
        approver: req.user.id,
        role: req.user.role,
        comment,
        approvedAt: new Date(),
      },
    },
  });

  const approvedRoles = new Set((stageProject.approvalTrail || []).map((entry) => entry.role));
  const completed = requiredRoles.every((role) => approvedRoles.has(role));

  let finalProject = stageProject;
  let grantedPoints = 0;

  if (completed) {
    grantedPoints = requestedPoints;
    finalProject = await projectRepository.updateById(project._id, {
      status: 'ACTIVE',
      rejectionReason: '',
      approvalPointsAwarded: grantedPoints,
      approvedAt: new Date(),
    });

    await awardProjectPoints({
      project,
      approverId: req.user.id,
      points: grantedPoints,
    });
  }

  await auditService.log({
    actorId: req.user.id,
    action: completed ? 'PROJECT_APPROVED_FINAL' : 'PROJECT_APPROVED_STAGE',
    entityType: 'PROJECT',
    entityId: project._id,
    after: {
      status: finalProject.status,
      approvalsCompleted: approvedRoles.size,
      approvalsRequired: requiredRoles.length,
      pointsAwarded: grantedPoints,
    },
    req,
  });

  res.json({
    project: finalProject,
    grantedPoints,
    approvals: {
      completed: approvedRoles.size,
      required: requiredRoles.length,
      pending: Math.max(0, requiredRoles.length - approvedRoles.size),
    },
  });
});

export const rejectProject = asyncHandler(async (req, res) => {
  const project = await projectRepository.findById(req.params.id);
  if (!project) {
    throw new AppError('Project not found', 404);
  }

  if (project.status !== 'PENDING_APPROVAL') {
    throw new AppError('Project is not pending approval', 400);
  }

  const reason = String(req.body.reason || '').trim();
  if (!reason) {
    throw new AppError('Rejection reason is required', 400);
  }

  const updatedProject = await projectRepository.updateById(req.params.id, {
    status: 'REJECTED',
    rejectedBy: req.user.id,
    rejectionReason: reason,
  });

  await auditService.log({
    actorId: req.user.id,
    action: 'PROJECT_REJECTED',
    entityType: 'PROJECT',
    entityId: project._id,
    after: {
      status: 'REJECTED',
      reason,
    },
    req,
  });

  res.json({ project: updatedProject });
});

