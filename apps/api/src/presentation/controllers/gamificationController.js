import dayjs from 'dayjs';
import { PointsLedgerRepository } from '../../infrastructure/db/repositories/PointsLedgerRepository.js';
import { UserRepository } from '../../infrastructure/db/repositories/UserRepository.js';
import { BadgeRepository } from '../../infrastructure/db/repositories/BadgeRepository.js';
import { AuditRepository } from '../../infrastructure/db/repositories/AuditRepository.js';
import { pointsPolicy } from '../../application/services/pointsCalculator.js';
import { levelService, levelThresholds } from '../../application/services/levelService.js';
import { operationPointsService } from '../../application/services/operationPointsService.js';
import { resolveManagedUserIds } from '../../shared/accessScope.js';
import { Roles } from '../../shared/constants.js';
import { AppError, asyncHandler } from '../../shared/errors.js';

const pointsLedgerRepository = new PointsLedgerRepository();
const userRepository = new UserRepository();
const badgeRepository = new BadgeRepository();
const auditRepository = new AuditRepository();

const getDateRange = (period) => {
  const now = dayjs();

  if (period === 'weekly') {
    return {
      startDate: now.startOf('week').toDate(),
      endDate: now.endOf('week').toDate(),
    };
  }

  if (period === 'daily') {
    return {
      startDate: now.startOf('day').toDate(),
      endDate: now.endOf('day').toDate(),
    };
  }

  return {
    startDate: now.startOf('month').toDate(),
    endDate: now.endOf('month').toDate(),
  };
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const assertGamificationAdmin = (req) => {
  if (req.user?.role !== Roles.GENERAL_MANAGER) {
    throw new AppError('Only general manager can manage operation points and levels', 403);
  }
};

export const leaderboard = asyncHandler(async (req, res) => {
  const period = req.query.period || 'monthly';
  const limit = Number(req.query.limit || 10);
  const managedUserIds = await resolveManagedUserIds({
    userRepository,
    actorId: req.user.id,
    actorRole: req.user.role,
  });

  const { startDate, endDate } = getDateRange(period);
  const data = await pointsLedgerRepository.leaderboard({
    startDate,
    endDate,
    limit,
    userIds: managedUserIds,
  });

  res.json({
    period,
    startDate,
    endDate,
    leaderboard: data.map((item, index) => ({
      rank: index + 1,
      ...item,
    })),
  });
});

export const myGamificationState = asyncHandler(async (req, res) => {
  const user = await userRepository.findById(req.user.id);
  const nextLevel = levelService.nextLevel(user.pointsTotal);
  const badges = await badgeRepository.list();

  const now = dayjs();
  const leaderboardData = await pointsLedgerRepository.leaderboard({
    startDate: now.startOf('month').toDate(),
    endDate: now.endOf('month').toDate(),
    limit: 100,
  });

  const rank = leaderboardData.findIndex((item) => String(item.userId) === req.user.id);

  res.json({
    user: {
      id: String(user._id),
      fullName: user.fullName,
      pointsTotal: user.pointsTotal,
      level: user.level,
      badges: user.badges,
    },
    nextLevel,
    rank: rank >= 0 ? rank + 1 : null,
    availableBadges: badges,
  });
});

export const policies = asyncHandler(async (req, res) => {
  res.json({
    pointsPolicy,
    levelThresholds,
    fairnessNotes: [
      'Point scoring depends on task difficulty, urgency, and estimated hours.',
      'A daily cap prevents point inflation.',
      'Points are granted only after task approval.',
      'Quality score (1-5) affects final granted points.',
    ],
  });
});

export const listOperationRules = asyncHandler(async (req, res) => {
  assertGamificationAdmin(req);
  const rules = await operationPointsService.listRules();
  res.json({
    rules,
    catalog: operationPointsService.operationActionCatalog,
  });
});

export const upsertOperationRules = asyncHandler(async (req, res) => {
  assertGamificationAdmin(req);
  const rules = Array.isArray(req.body.rules) ? req.body.rules : [];
  if (!rules.length) {
    throw new AppError('rules is required and must contain at least one item', 400);
  }

  await operationPointsService.upsertRules(rules, req.user.id);
  const refreshed = await operationPointsService.listRules();
  res.json({ rules: refreshed });
});

export const listOperationEvents = asyncHandler(async (req, res) => {
  assertGamificationAdmin(req);

  const operations = await operationPointsService.listOperationEvents({
    actorId: req.query.userId || '',
    from: req.query.from ? `${req.query.from}T00:00:00.000Z` : '',
    to: req.query.to ? `${req.query.to}T23:59:59.999Z` : '',
    limit: Math.max(1, Math.min(1000, Math.round(toNumber(req.query.limit, 300)))),
  });

  res.json({ operations });
});

export const grantPointsByOperation = asyncHandler(async (req, res) => {
  assertGamificationAdmin(req);

  const operation = await auditRepository.findById(req.params.id);
  if (!operation) {
    throw new AppError('Operation not found', 404);
  }

  const points = Math.round(toNumber(req.body.points, 0));
  if (!points) {
    const result = await operationPointsService.awardByAuditLog(operation);
    if (!result.awarded) {
      throw new AppError(`Points were not granted: ${result.reason}`, 409);
    }

    res.status(201).json({
      granted: true,
      mode: 'RULE',
      points: result.points,
      ledger: result.ledger,
      user: result.user,
    });
    return;
  }

  if (points < 0 || points > 10000) {
    throw new AppError('points must be between 0 and 10000', 400);
  }

  const actorId = String(operation.actor?._id || operation.actor || '');
  if (!actorId) {
    throw new AppError('Operation actor is missing', 400);
  }

  const result = await operationPointsService.grantManualPoints({
    userId: actorId,
    points,
    reason: req.body.reason || `منح يدوي لنشاط ${operation.action}`,
    actorId: req.user.id,
    metadata: {
      operationId: String(operation._id),
      action: operation.action,
      entityType: operation.entityType,
      entityId: operation.entityId,
    },
  });

  res.status(201).json({
    granted: true,
    mode: 'MANUAL',
    ledger: result.ledger,
    user: result.user,
  });
});

export const grantManualPoints = asyncHandler(async (req, res) => {
  assertGamificationAdmin(req);

  const userId = String(req.body.userId || req.body.employeeId || '').trim();
  if (!userId) {
    throw new AppError('userId is required', 400);
  }

  const result = await operationPointsService.grantManualPoints({
    userId,
    points: req.body.points,
    reason: req.body.reason || 'منح يدوي من الأدمن',
    actorId: req.user.id,
    metadata: {
      source: 'ADMIN_DASHBOARD',
    },
  });

  res.status(201).json({
    ledger: result.ledger,
    user: result.user,
  });
});

export const deductManualPoints = asyncHandler(async (req, res) => {
  assertGamificationAdmin(req);

  const userId = String(req.body.userId || req.body.employeeId || '').trim();
  if (!userId) {
    throw new AppError('userId is required', 400);
  }

  const result = await operationPointsService.deductManualPoints({
    userId,
    points: req.body.points,
    reason: req.body.reason,
    actorId: req.user.id,
    metadata: {
      source: 'ADMIN_DASHBOARD',
    },
  });

  res.status(201).json({
    ledger: result.ledger,
    user: result.user,
    appliedDeduction: result.appliedDeduction,
  });
});

export const overrideUserLevel = asyncHandler(async (req, res) => {
  assertGamificationAdmin(req);

  const userId = String(req.body.userId || req.body.employeeId || '').trim();
  if (!userId) {
    throw new AppError('userId is required', 400);
  }

  const result = await operationPointsService.overrideUserLevel({
    userId,
    level: req.body.level,
    reason: req.body.reason || 'تعديل مستوى يدوي من لوحة الأدمن',
    actorId: req.user.id,
  });

  res.json({
    user: result.user,
    ledger: result.ledger,
  });
});
