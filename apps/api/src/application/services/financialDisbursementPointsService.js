import { PointsLedgerRepository } from '../../infrastructure/db/repositories/PointsLedgerRepository.js';
import { UserRepository } from '../../infrastructure/db/repositories/UserRepository.js';
import { performancePointsService } from './performancePointsService.js';
import { levelService } from './levelService.js';
import { AppError } from '../../shared/errors.js';

const pointsLedgerRepository = new PointsLedgerRepository();
const userRepository = new UserRepository();

export const financialDisbursementPointsService = {
  async applyPoints({
    userId,
    points,
    reason,
    actorId,
    sourceAction,
    metadata = null,
    req = null,
  } = {}) {
    const requestedPoints = Math.round(Number(points || 0));
    if (!requestedPoints) {
      return {
        applied: false,
        points: 0,
        ledger: null,
        user: await userRepository.findById(userId),
      };
    }

    if (requestedPoints > 0) {
      const rewardResult = await performancePointsService.awardPoints({
        userId,
        points: requestedPoints,
        category: 'FINANCIAL_DISBURSEMENT',
        reason,
        approvedBy: actorId,
        sourceAction,
        metadata,
        actorId,
        req,
      });

      return {
        applied: rewardResult.awarded,
        points: requestedPoints,
        ledger: rewardResult.ledger,
        user: rewardResult.user,
      };
    }

    const targetUser = await userRepository.findById(userId);
    if (!targetUser || !targetUser.active) {
      throw new AppError('User not found or inactive', 404);
    }

    const safeDeduction = -Math.min(Math.abs(requestedPoints), Math.max(0, Number(targetUser.pointsTotal || 0)));
    if (!safeDeduction) {
      return {
        applied: false,
        points: 0,
        ledger: null,
        user: targetUser,
      };
    }

    const nextPoints = Math.max(0, Number(targetUser.pointsTotal || 0) + safeDeduction);
    const nextLevel = levelService.resolveLevel(nextPoints);

    const ledger = await pointsLedgerRepository.create({
      user: userId,
      points: safeDeduction,
      category: 'FINANCIAL_DISBURSEMENT',
      reason,
      approvedBy: actorId,
      sourceAction,
      metadata,
    });

    const updatedUser = await userRepository.incrementPointsAndSetLevel(targetUser._id, safeDeduction, nextLevel);

    return {
      applied: true,
      points: safeDeduction,
      ledger,
      user: updatedUser,
    };
  },
};
