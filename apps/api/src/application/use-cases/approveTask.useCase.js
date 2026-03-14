import dayjs from 'dayjs';
import { TaskStatus, BadgeCodes } from '../../shared/constants.js';
import { AppError } from '../../shared/errors.js';
import { pointsCalculator, pointsPolicy } from '../services/pointsCalculator.js';
import { notificationService } from '../services/notificationService.js';
import { performancePointsService } from '../services/performancePointsService.js';

export class ApproveTaskUseCase {
  constructor({ taskRepository, userRepository, pointsLedgerRepository, goalRepository, auditService }) {
    this.taskRepository = taskRepository;
    this.userRepository = userRepository;
    this.pointsLedgerRepository = pointsLedgerRepository;
    this.goalRepository = goalRepository;
    this.auditService = auditService;
  }

  async execute({ taskId, approverId, qualityScore, manualPoints, trailEntry, req }) {
    const task = await this.taskRepository.findById(taskId);

    if (!task) {
      throw new AppError('Task not found', 404);
    }

    if (task.status !== TaskStatus.SUBMITTED) {
      throw new AppError('Only submitted tasks can be approved', 400);
    }

    const dayStart = dayjs().startOf('day').toDate();
    const dayEnd = dayjs().endOf('day').toDate();

    const currentDayPoints = await this.pointsLedgerRepository.sumPointsForDay(task.assignee._id, dayStart, dayEnd);
    const normalizedManualPoints = Number(manualPoints);
    const hasManualPoints = Number.isFinite(normalizedManualPoints) && normalizedManualPoints >= 0;
    if (hasManualPoints && normalizedManualPoints > 1000) {
      throw new AppError('points cannot exceed 1000', 400);
    }

    const calculatedPoints = hasManualPoints
      ? Math.round(normalizedManualPoints)
      : pointsCalculator.calculateTaskPoints(task, qualityScore);
    const grantedPoints = pointsCalculator.applyDailyCap(calculatedPoints, currentDayPoints);

    const beforeSnapshot = {
      status: task.status,
      pointsAwarded: task.pointsAwarded,
    };

    // Atomic update: push trail entry + set status to APPROVED in one operation
    const atomicUpdate = {
      $set: {
        status: TaskStatus.APPROVED,
        approvedBy: approverId,
        approvedAt: new Date(),
        qualityScore,
        pointsAwarded: grantedPoints,
        completedAt: task.completedAt || new Date(),
        rejectionReason: '',
      },
    };
    if (trailEntry) {
      atomicUpdate.$push = { approvalTrail: trailEntry };
    }
    // PRIMARY ACTION: atomic status update (must succeed — task is now APPROVED in DB)
    const updatedTask = await this.taskRepository.updateById(taskId, atomicUpdate);

    // SECONDARY ACTIONS: points, badges, notifications — wrapped in try-catch so they
    // never cause a 500 error that hides the successful approval from the frontend.
    try {
      if (grantedPoints > 0) {
        await performancePointsService.awardPoints({
          userId: task.assignee._id,
          task: task._id,
          points: grantedPoints,
          category: 'TASK_APPROVAL',
          reason: `اعتماد مهمة: ${task.title}`,
          approvedBy: approverId,
          sourceAction: 'TASK_APPROVED',
          metadata: {
            taskId: String(task._id),
            qualityScore,
          },
          actorId: approverId,
          req,
          additionalBadgeCodes: [BadgeCodes.FIRST_APPROVAL],
        });
      }

      await notificationService.notifyTaskApproved(task.assignee._id, task, grantedPoints, task.assignee?.email);

      await this.auditService.log({
        actorId: approverId,
        action: 'TASK_APPROVED',
        entityType: 'TASK',
        entityId: task._id,
        before: beforeSnapshot,
        after: {
          status: TaskStatus.APPROVED,
          pointsAwarded: grantedPoints,
          qualityScore,
          manualPoints: hasManualPoints ? Math.round(normalizedManualPoints) : null,
        },
        req,
      });
    } catch (secondaryError) {
      console.error('[approveTask] Secondary operation failed (task is already approved):', secondaryError.message);
    }

    return {
      task: updatedTask,
      grantedPoints,
      fairness: {
        calculatedPoints,
        manualPoints: hasManualPoints ? Math.round(normalizedManualPoints) : null,
        currentDayPoints,
        dailyCap: pointsPolicy.dailyCap,
        remainingToday: Math.max(0, pointsPolicy.dailyCap - currentDayPoints),
      },
    };
  }
}
