import { TaskRepository } from '../../infrastructure/db/repositories/TaskRepository.js';
import { UserRepository } from '../../infrastructure/db/repositories/UserRepository.js';
import { PointsLedgerRepository } from '../../infrastructure/db/repositories/PointsLedgerRepository.js';
import { GoalRepository } from '../../infrastructure/db/repositories/GoalRepository.js';
import { ApproveTaskUseCase } from '../../application/use-cases/approveTask.useCase.js';
import { ChangeTaskStatusUseCase } from '../../application/use-cases/changeTaskStatus.useCase.js';
import { auditService } from '../../application/services/auditService.js';
import { notificationService } from '../../application/services/notificationService.js';
import { Roles, TaskStatus } from '../../shared/constants.js';
import {
  applyManagedScopeOnFilter,
  isUserWithinManagedScope,
  resolveManagedUserIds,
} from '../../shared/accessScope.js';
import { AppError, asyncHandler } from '../../shared/errors.js';

const taskRepository = new TaskRepository();
const userRepository = new UserRepository();
const pointsLedgerRepository = new PointsLedgerRepository();
const goalRepository = new GoalRepository();

const approveTaskUseCase = new ApproveTaskUseCase({
  taskRepository,
  userRepository,
  pointsLedgerRepository,
  goalRepository,
  auditService,
});

const changeTaskStatusUseCase = new ChangeTaskStatusUseCase({
  taskRepository,
  auditService,
});

export const createTask = asyncHandler(async (req, res) => {
  const {
    title,
    description,
    project,
    assignee,
    dueDate,
    difficulty = 3,
    urgency = 1,
    estimatedHours = 2,
    plannedPoints,
    requiredApprovals,
  } = req.body;

  if (!title || !project || !assignee || !dueDate) {
    throw new AppError('title, project, assignee and dueDate are required', 400);
  }

  const assigneeUser = await userRepository.findById(assignee);
  if (!assigneeUser || !assigneeUser.active) {
    throw new AppError('Assignee not found or inactive', 404);
  }
  const managedUserIds = await resolveManagedUserIds({
    userRepository,
    actorId: req.user.id,
    actorRole: req.user.role,
  });

  if (!isUserWithinManagedScope({ managedUserIds, userId: assigneeUser._id })) {
    throw new AppError('You can only assign tasks to employees in your management scope', 403);
  }

  const numericPlannedPoints = Number(plannedPoints);
  const resolvedPlannedPoints = Number.isFinite(numericPlannedPoints) && numericPlannedPoints > 0
    ? Math.round(numericPlannedPoints)
    : undefined;
  if (resolvedPlannedPoints && resolvedPlannedPoints > 1000) {
    throw new AppError('plannedPoints cannot exceed 1000', 400);
  }

  const task = await taskRepository.create({
    title,
    description,
    project,
    assignee,
    assignedBy: req.user.id,
    dueDate,
    difficulty,
    urgency,
    estimatedHours,
    plannedPoints: resolvedPlannedPoints,
    status: TaskStatus.TODO,
    requiredApprovals: Number(requiredApprovals || (Number(urgency) >= 3 ? 2 : 1)),
    approvalTrail: [],
  });

  const taskWithRefs = await taskRepository.findById(task._id);

  await notificationService.notifyTaskAssigned(assignee, task, assigneeUser.email);

  await auditService.log({
    actorId: req.user.id,
    action: 'TASK_CREATED',
    entityType: 'TASK',
    entityId: task._id,
    after: {
      title,
      assignee,
      project,
      dueDate,
      plannedPoints: resolvedPlannedPoints || null,
      requiredApprovals: task.requiredApprovals,
    },
    req,
  });

  res.status(201).json({ task: taskWithRefs });
});

export const listTasks = asyncHandler(async (req, res) => {
  const filter = {};

  if (req.query.status) {
    filter.status = req.query.status;
  }
  if (req.query.project) {
    filter.project = req.query.project;
  }
  const managedUserIds = await resolveManagedUserIds({
    userRepository,
    actorId: req.user.id,
    actorRole: req.user.role,
  });

  applyManagedScopeOnFilter({
    filter,
    managedUserIds,
    field: 'assignee',
    requestedUserId: req.query.assignee,
  });

  const tasks = await taskRepository.list(filter);
  res.json({ tasks });
});

export const updateTaskStatus = asyncHandler(async (req, res) => {
  const { status, rejectionReason } = req.body;

  if (!status) {
    throw new AppError('status is required', 400);
  }

  const task = await taskRepository.findById(req.params.id);
  if (!task) {
    throw new AppError('Task not found', 404);
  }

  const managerRoles = [
    Roles.GENERAL_MANAGER,
    Roles.PROJECT_MANAGER,
    Roles.ASSISTANT_PROJECT_MANAGER,
    Roles.TEAM_LEAD,
  ];
  const isManager = managerRoles.includes(req.user.role);
  const isAssignee = String(task.assignee?._id) === req.user.id;
  const managedUserIds = isManager
    ? await resolveManagedUserIds({
        userRepository,
        actorId: req.user.id,
        actorRole: req.user.role,
      })
    : null;
  const canManageAssignee = isUserWithinManagedScope({
    managedUserIds,
    userId: task.assignee?._id,
  });

  if ((!isManager || !canManageAssignee) && !isAssignee) {
    throw new AppError('You are not allowed to update this task', 403);
  }

  if (
    req.user.role === Roles.TECHNICAL_STAFF &&
    (!isAssignee || ![TaskStatus.IN_PROGRESS, TaskStatus.SUBMITTED].includes(status))
  ) {
    throw new AppError('Technical staff can only move task to IN_PROGRESS or SUBMITTED', 403);
  }

  const updatedTask = await changeTaskStatusUseCase.execute({
    taskId: req.params.id,
    actorId: req.user.id,
    status,
    rejectionReason,
    req,
  });

  // Reset approval chain on re-submission after rejection.
  if (status === TaskStatus.SUBMITTED && task.status === TaskStatus.REJECTED) {
    await taskRepository.updateById(req.params.id, { approvalTrail: [] });
  }

  res.json({ task: updatedTask });
});

export const approveTask = asyncHandler(async (req, res) => {
  const qualityScore = Number(req.body.qualityScore || 3);
  const note = String(req.body.note || '').trim();
  const manualPoints = req.body.points;

  const task = await taskRepository.findById(req.params.id);

  if (!task) {
    throw new AppError('Task not found', 404);
  }

  if (task.status !== TaskStatus.SUBMITTED) {
    throw new AppError('Only submitted tasks can be approved', 400);
  }
  const managedUserIds = await resolveManagedUserIds({
    userRepository,
    actorId: req.user.id,
    actorRole: req.user.role,
  });

  if (!isUserWithinManagedScope({ managedUserIds, userId: task.assignee?._id })) {
    throw new AppError('You can only approve tasks for employees in your management scope', 403);
  }

  const alreadyApproved = (task.approvalTrail || []).some(
    (entry) => String(entry.approver?._id || entry.approver) === req.user.id,
  );

  if (alreadyApproved) {
    throw new AppError('You already approved this task in a previous stage', 409);
  }

  const required = Math.max(1, Number(task.requiredApprovals || 1));
  const nextCount = (task.approvalTrail || []).length + 1;

  const trailEntry = {
    approver: req.user.id,
    role: req.user.role,
    note,
    approvedAt: new Date(),
  };

  if (nextCount < required) {
    // Staged approval: push trail entry and notify
    await taskRepository.updateById(task._id, {
      $push: { approvalTrail: trailEntry },
    });

    const stagedTask = await taskRepository.findById(task._id);

    await notificationService.notifyTaskApprovalProgress(
      task.assignee._id,
      task,
      nextCount,
      required,
      task.assignee?.email,
    );

    await auditService.log({
      actorId: req.user.id,
      action: 'TASK_APPROVAL_STAGE_ACCEPTED',
      entityType: 'TASK',
      entityId: task._id,
      after: {
        approvalsCompleted: nextCount,
        approvalsRequired: required,
      },
      req,
    });

    return res.json({
      task: stagedTask,
      message: 'Task received staged approval and is waiting for final approvals',
      approvals: {
        completed: nextCount,
        required,
        pending: required - nextCount,
      },
    });
  }

  // Final approval: pass trailEntry to use case — trail push + status update are atomic
  const result = await approveTaskUseCase.execute({
    taskId: req.params.id,
    approverId: req.user.id,
    qualityScore,
    manualPoints,
    trailEntry,
    req,
  });

  res.json({
    ...result,
    approvals: {
      completed: required,
      required,
      pending: 0,
    },
  });
});

export const getMyActivity = asyncHandler(async (req, res) => {
  const tasks = await taskRepository.list({ assignee: req.user.id }, { limit: 20 });
  const ledger = await pointsLedgerRepository.listLatest(20);
  const myLedger = ledger.filter((entry) => String(entry.user?._id) === req.user.id);

  res.json({
    tasks,
    pointsHistory: myLedger,
  });
});

