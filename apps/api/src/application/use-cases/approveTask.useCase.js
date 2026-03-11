import dayjs from 'dayjs';
import { TaskStatus, BadgeCodes } from '../../shared/constants.js';
import { AppError } from '../../shared/errors.js';
import { pointsCalculator, pointsPolicy } from '../services/pointsCalculator.js';
import { levelService } from '../services/levelService.js';
import { badgeService } from '../services/badgeService.js';
import { notificationService } from '../services/notificationService.js';

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
        await this.pointsLedgerRepository.create({
          user: task.assignee._id,
          task: task._id,
          points: grantedPoints,
          category: 'TASK_APPROVAL',
          reason: `اعتماد مهمة: ${task.title}`,
          approvedBy: approverId,
        });
      }

      const assigneeCurrent = await this.userRepository.findById(task.assignee._id);
      if (assigneeCurrent) {
        const updatedPoints = assigneeCurrent.pointsTotal + grantedPoints;
        const nextLevel = levelService.resolveLevel(updatedPoints);
        const updatedUser = await this.userRepository.incrementPointsAndSetLevel(task.assignee._id, grantedPoints, nextLevel);

        const generatedBadges = badgeService.evaluate(updatedUser, 0);
        if (!updatedUser.badges.includes(BadgeCodes.FIRST_APPROVAL) && grantedPoints > 0) {
          generatedBadges.push(BadgeCodes.FIRST_APPROVAL);
        }
        for (const badgeCode of generatedBadges) {
          if (!updatedUser.badges.includes(badgeCode)) {
            await this.userRepository.attachBadge(updatedUser._id, badgeCode);
          }
        }
      }

      const goalUpdates = grantedPoints > 0
        ? await this.goalRepository.incrementActiveGoals(task.assignee._id, grantedPoints)
        : [];
      for (const goal of goalUpdates) {
        if (goal.achieved) {
          await notificationService.notifyGoalAchieved(task.assignee._id, goal);
        }
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
