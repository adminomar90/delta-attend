import { PointsLedgerRepository } from '../../infrastructure/db/repositories/PointsLedgerRepository.js';
import { UserRepository } from '../../infrastructure/db/repositories/UserRepository.js';
import { levelService } from './levelService.js';
import { badgeService } from './badgeService.js';
import { goalProgressService } from './goalProgressService.js';
import { AppError } from '../../shared/errors.js';

const pointsLedgerRepository = new PointsLedgerRepository();
const userRepository = new UserRepository();

const toRoundedNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const performancePointsService = {
  async awardPoints({
    userId,
    points,
    category,
    reason,
    approvedBy,
    task = null,
    auditLog = null,
    sourceAction = '',
    metadata = null,
    actorId = '',
    req = null,
    additionalBadgeCodes = [],
  } = {}) {
    const grantedPoints = Math.round(toRoundedNumber(points, 0));
    if (grantedPoints <= 0) {
      return {
        awarded: false,
        points: 0,
        ledger: null,
        user: await userRepository.findById(userId),
        goalOutcome: {
          updatedGoals: [],
          promotedUser: null,
        },
      };
    }

    if (grantedPoints > 10000) {
      throw new AppError('points must be between 1 and 10000', 400);
    }

    const targetUser = await userRepository.findById(userId);
    if (!targetUser || !targetUser.active) {
      throw new AppError('User not found or inactive', 404);
    }

    const nextPoints = Math.max(0, toRoundedNumber(targetUser.pointsTotal, 0) + grantedPoints);
    const nextLevel = levelService.resolveLevel(nextPoints);

    const ledger = await pointsLedgerRepository.create({
      user: userId,
      task,
      points: grantedPoints,
      category,
      reason,
      approvedBy,
      auditLog,
      sourceAction,
      metadata,
    });

    let updatedUser = await userRepository.incrementPointsAndSetLevel(targetUser._id, grantedPoints, nextLevel);
    const generatedBadges = [
      ...badgeService.evaluate(updatedUser, 0),
      ...additionalBadgeCodes,
    ];

    for (const badgeCode of generatedBadges) {
      if (!updatedUser.badges.includes(badgeCode)) {
        await userRepository.attachBadge(updatedUser._id, badgeCode);
      }
    }

    const goalOutcome = await goalProgressService.applyAwardedPoints({
      userId: updatedUser._id,
      pointsDelta: grantedPoints,
      actorId: actorId || approvedBy || userId,
      sourceAction,
      sourceMetadata: {
        ...(metadata || {}),
        category,
        ledgerId: String(ledger._id),
      },
      req,
      currentUser: updatedUser,
    });

    if (goalOutcome.promotedUser) {
      updatedUser = goalOutcome.promotedUser;
    }

    return {
      awarded: true,
      points: grantedPoints,
      ledger,
      user: updatedUser,
      goalOutcome,
    };
  },
};
