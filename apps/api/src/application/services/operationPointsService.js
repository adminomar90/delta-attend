import { OperationPointsRuleRepository } from '../../infrastructure/db/repositories/OperationPointsRuleRepository.js';
import { PointsLedgerRepository } from '../../infrastructure/db/repositories/PointsLedgerRepository.js';
import { AuditRepository } from '../../infrastructure/db/repositories/AuditRepository.js';
import { UserRepository } from '../../infrastructure/db/repositories/UserRepository.js';
import { levelService } from './levelService.js';
import { performancePointsService } from './performancePointsService.js';
import { AppError } from '../../shared/errors.js';

const operationPointsRuleRepository = new OperationPointsRuleRepository();
const pointsLedgerRepository = new PointsLedgerRepository();
const auditRepository = new AuditRepository();
const userRepository = new UserRepository();

const operationActionCatalog = [
  { actionKey: 'WORK_REPORT_CREATED', labelAr: 'إنشاء تقرير عمل', defaultPoints: 20, formulaType: 'WORK_REPORT_PROGRESS' },
  { actionKey: 'WORK_REPORT_PDF_SAVED', labelAr: 'حفظ تقرير العمل PDF', defaultPoints: 2, formulaType: 'FIXED' },
  { actionKey: 'WORK_REPORT_WHATSAPP_LINK_CREATED', labelAr: 'إنشاء رابط واتساب لتقرير العمل', defaultPoints: 2, formulaType: 'FIXED' },
  { actionKey: 'WORK_REPORT_APPROVED', labelAr: 'اعتماد تقرير العمل', defaultPoints: 6, formulaType: 'FIXED' },
  { actionKey: 'MATERIAL_REQUEST_CREATED', labelAr: 'إنشاء طلب مواد', defaultPoints: 10, formulaType: 'FIXED' },
  { actionKey: 'MATERIAL_REQUEST_PREPARED', labelAr: 'تجهيز طلب مواد', defaultPoints: 8, formulaType: 'FIXED' },
  { actionKey: 'MATERIAL_REQUEST_DISPATCHED', labelAr: 'تسليم مواد', defaultPoints: 8, formulaType: 'FIXED' },
  { actionKey: 'MATERIAL_CUSTODY_RECONCILIATION_SUBMITTED', labelAr: 'إرسال تصفية ذمة مواد', defaultPoints: 6, formulaType: 'FIXED' },
  { actionKey: 'MATERIAL_RECONCILIATION_APPROVED', labelAr: 'اعتماد تصفية مواد', defaultPoints: 6, formulaType: 'FIXED' },
  { actionKey: 'MATERIAL_RETURN_RECEIVED', labelAr: 'استلام مواد راجعة', defaultPoints: 4, formulaType: 'FIXED' },
  { actionKey: 'ATTENDANCE_CHECK_IN', labelAr: 'بصمة دخول', defaultPoints: 3, formulaType: 'FIXED' },
  { actionKey: 'ATTENDANCE_CHECK_OUT', labelAr: 'بصمة انصراف', defaultPoints: 3, formulaType: 'FIXED' },
  { actionKey: 'ATTENDANCE_APPROVED', labelAr: 'اعتماد حضور/انصراف', defaultPoints: 4, formulaType: 'FIXED' },
  { actionKey: 'PROJECT_CREATED', labelAr: 'إنشاء مشروع', defaultPoints: 40, formulaType: 'FIXED' },
  { actionKey: 'PROJECT_UPDATED', labelAr: 'تحديث مشروع', defaultPoints: 5, formulaType: 'FIXED' },
  { actionKey: 'PROJECT_REJECTED', labelAr: 'رفض مشروع', defaultPoints: 2, formulaType: 'FIXED' },
  { actionKey: 'TASK_CREATED', labelAr: 'إنشاء مهمة', defaultPoints: 5, formulaType: 'FIXED' },
  { actionKey: 'TASK_APPROVED', labelAr: 'اعتماد مهمة', defaultPoints: 6, formulaType: 'FIXED' },
  { actionKey: 'TASK_APPROVAL_STAGE_ACCEPTED', labelAr: 'قبول مرحلة اعتماد مهمة', defaultPoints: 2, formulaType: 'FIXED' },
];

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toDateOrNull = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeActionKey = (value) => String(value || '').trim().toUpperCase();

const toRulePayload = (rule, actorId) => ({
  labelAr: String(rule.labelAr || '').trim(),
  basePoints: Math.max(0, Math.round(toNumber(rule.basePoints, 0))),
  formulaType: ['FIXED', 'WORK_REPORT_PROGRESS'].includes(rule.formulaType) ? rule.formulaType : 'FIXED',
  multiplier: Math.max(0, toNumber(rule.multiplier, 1)),
  maxPoints: Math.max(0, Math.round(toNumber(rule.maxPoints, 0))),
  enabled: !!rule.enabled,
  updatedBy: actorId || null,
});

const calculatePointsFromRule = (rule, auditLog) => {
  const base = Math.max(0, Math.round(toNumber(rule.basePoints, 0)));
  const multiplier = Math.max(0, toNumber(rule.multiplier, 1));
  const formulaType = rule.formulaType || 'FIXED';
  const maxPoints = Math.max(0, Math.round(toNumber(rule.maxPoints, 0)));

  let points = Math.round(base * multiplier);

  if (formulaType === 'WORK_REPORT_PROGRESS') {
    const progress = clamp(toNumber(auditLog?.after?.progressPercent, 0), 0, 100);
    points = Math.round((base * multiplier * progress) / 100);
  }

  if (maxPoints > 0) {
    points = Math.min(points, maxPoints);
  }

  return Math.max(0, Math.round(points));
};

const applyPointsToUser = async ({ userId, pointsDelta }) => {
  const user = await userRepository.findById(userId);
  if (!user || !user.active) {
    throw new AppError('User not found or inactive', 404);
  }

  const requestedDelta = Number(pointsDelta || 0);
  const currentPoints = Math.max(0, Number(user.pointsTotal || 0));
  const safeDelta = requestedDelta >= 0
    ? requestedDelta
    : -Math.min(Math.abs(requestedDelta), currentPoints);

  const nextPoints = Math.max(0, currentPoints + safeDelta);
  const nextLevel = levelService.resolveLevel(nextPoints);
  const updatedUser = await userRepository.incrementPointsAndSetLevel(user._id, safeDelta, nextLevel);
  return {
    user: updatedUser,
    appliedDelta: safeDelta,
  };
};

const mapRuleOutput = (rule = {}, catalogEntry = null) => ({
  actionKey: normalizeActionKey(rule.actionKey || catalogEntry?.actionKey || ''),
  labelAr: rule.labelAr || catalogEntry?.labelAr || '',
  basePoints: Math.max(0, Math.round(toNumber(rule.basePoints, catalogEntry?.defaultPoints || 0))),
  formulaType: rule.formulaType || catalogEntry?.formulaType || 'FIXED',
  multiplier: Math.max(0, toNumber(rule.multiplier, 1)),
  maxPoints: Math.max(0, Math.round(toNumber(rule.maxPoints, 0))),
  enabled: rule.enabled === undefined ? false : !!rule.enabled,
  updatedAt: rule.updatedAt || null,
  updatedBy: rule.updatedBy || null,
});

export const operationPointsService = {
  operationActionCatalog,

  async listRules() {
    const savedRules = await operationPointsRuleRepository.listAll();
    const savedByAction = new Map(
      savedRules.map((item) => [normalizeActionKey(item.actionKey), item]),
    );

    return operationActionCatalog.map((entry) => {
      const saved = savedByAction.get(normalizeActionKey(entry.actionKey));
      return mapRuleOutput(saved || { actionKey: entry.actionKey }, entry);
    });
  },

  async upsertRules(rules = [], actorId = '') {
    if (!Array.isArray(rules)) {
      throw new AppError('rules must be an array', 400);
    }

    const supportedActions = new Set(operationActionCatalog.map((item) => normalizeActionKey(item.actionKey)));
    const updated = [];

    for (const item of rules) {
      const actionKey = normalizeActionKey(item.actionKey || item.action);
      if (!supportedActions.has(actionKey)) {
        throw new AppError(`Unsupported action key: ${actionKey}`, 400);
      }

      const saved = await operationPointsRuleRepository.upsertByActionKey(
        actionKey,
        toRulePayload(item, actorId),
      );
      updated.push(saved);
    }

    return updated;
  },

  async awardByAuditLog(auditLog) {
    const actionKey = normalizeActionKey(auditLog?.action);
    if (!actionKey || !auditLog?._id || !auditLog?.actor) {
      return { awarded: false, reason: 'invalid_audit' };
    }

    const existing = await pointsLedgerRepository.findByAuditLog(auditLog._id);
    if (existing) {
      return { awarded: false, reason: 'already_awarded', ledger: existing };
    }

    const rule = await operationPointsRuleRepository.findByActionKey(actionKey);
    if (!rule || !rule.enabled) {
      return { awarded: false, reason: 'rule_disabled' };
    }

    const points = calculatePointsFromRule(rule, auditLog);
    if (points <= 0) {
      return { awarded: false, reason: 'zero_points' };
    }

    const actorId = String(auditLog.actor?._id || auditLog.actor);
    const rewardResult = await performancePointsService.awardPoints({
      userId: actorId,
      points,
      category: 'OPERATION_REWARD',
      reason: `نقاط عملية: ${rule.labelAr || actionKey}`,
      approvedBy: rule.updatedBy?._id || rule.updatedBy || actorId,
      auditLog: auditLog._id,
      sourceAction: actionKey,
      metadata: {
        entityType: auditLog.entityType || '',
        entityId: String(auditLog.entityId || ''),
      },
      actorId,
    });

    return {
      awarded: true,
      points,
      ledger: rewardResult.ledger,
      user: rewardResult.user,
      actionKey,
    };
  },

  async grantManualPoints({
    userId,
    points,
    reason,
    actorId,
    metadata = null,
  }) {
    const granted = Math.round(toNumber(points, 0));
    if (granted <= 0 || granted > 10000) {
      throw new AppError('points must be between 1 and 10000', 400);
    }

    const cleanReason = String(reason || '').trim();
    if (!cleanReason) {
      throw new AppError('reason is required', 400);
    }

    const rewardResult = await performancePointsService.awardPoints({
      userId,
      points: granted,
      category: 'MANUAL_ADMIN_GRANT',
      reason: cleanReason,
      approvedBy: actorId,
      metadata,
      actorId,
    });

    return { ledger: rewardResult.ledger, user: rewardResult.user };
  },

  async deductManualPoints({
    userId,
    points,
    reason,
    actorId,
    metadata = null,
  }) {
    const requestedDeduction = Math.round(toNumber(points, 0));
    if (requestedDeduction <= 0 || requestedDeduction > 10000) {
      throw new AppError('points must be between 1 and 10000', 400);
    }

    const cleanReason = String(reason || '').trim();
    if (!cleanReason) {
      throw new AppError('reason is required', 400);
    }

    const { user: updatedUser, appliedDelta } = await applyPointsToUser({
      userId,
      pointsDelta: -requestedDeduction,
    });

    if (!appliedDelta) {
      throw new AppError('User has no points to deduct', 409);
    }

    const ledger = await pointsLedgerRepository.create({
      user: userId,
      points: appliedDelta,
      category: 'PENALTY',
      reason: cleanReason,
      approvedBy: actorId,
      metadata: {
        ...(metadata || {}),
        requestedDeduction,
        appliedDeduction: Math.abs(appliedDelta),
      },
    });

    return { ledger, user: updatedUser, appliedDeduction: Math.abs(appliedDelta) };
  },

  async overrideUserLevel({
    userId,
    level,
    reason,
    actorId,
  }) {
    const targetLevel = Math.round(toNumber(level, 0));
    if (targetLevel < 1 || targetLevel > 100) {
      throw new AppError('level must be between 1 and 100', 400);
    }

    const user = await userRepository.findById(userId);
    if (!user || !user.active) {
      throw new AppError('User not found or inactive', 404);
    }

    const cleanReason = String(reason || '').trim() || 'تعديل مستوى يدوي من الأدمن';
    const updatedUser = await userRepository.updateById(user._id, {
      level: targetLevel,
    });

    const ledger = await pointsLedgerRepository.create({
      user: user._id,
      points: 0,
      category: 'LEVEL_OVERRIDE_ADJUSTMENT',
      reason: cleanReason,
      approvedBy: actorId,
      metadata: {
        previousLevel: Number(user.level || 1),
        newLevel: targetLevel,
      },
    });

    return { user: updatedUser, ledger };
  },

  async listOperationEvents({
    actorId = '',
    from = null,
    to = null,
    limit = 200,
  } = {}) {
    const rules = await this.listRules();
    const rulesByAction = new Map(rules.map((item) => [normalizeActionKey(item.actionKey), item]));
    const actions = rules.map((item) => normalizeActionKey(item.actionKey));

    const logs = await auditRepository.listByActions({
      actions,
      actorId: actorId || '',
      from: toDateOrNull(from),
      to: toDateOrNull(to),
      limit,
    });

    const ledgerByAuditLog = new Map();
    const ledgers = await pointsLedgerRepository.listByAuditLogIds(
      logs.map((item) => item._id),
    );
    ledgers.forEach((entry) => {
      if (entry.auditLog) {
        ledgerByAuditLog.set(String(entry.auditLog), entry);
      }
    });

    return logs.map((log) => {
      const actionKey = normalizeActionKey(log.action);
      const rule = rulesByAction.get(actionKey) || {};
      const recommendedPoints = rule.enabled ? calculatePointsFromRule(rule, log) : 0;
      const grantedLedger = ledgerByAuditLog.get(String(log._id)) || null;

      return {
        operationId: String(log._id),
        actionKey,
        actionLabel: rule.labelAr || actionKey,
        actor: log.actor,
        entityType: log.entityType,
        entityId: String(log.entityId || ''),
        createdAt: log.createdAt,
        recommendedPoints,
        rule,
        progressPercent: toNumber(log.after?.progressPercent, 0),
        pointsGranted: grantedLedger ? Number(grantedLedger.points || 0) : 0,
        granted: !!grantedLedger,
        grantedLedger,
      };
    });
  },
};
