import { AuditRepository } from '../../infrastructure/db/repositories/AuditRepository.js';
import { operationPointsService } from './operationPointsService.js';

const auditRepository = new AuditRepository();

export const auditService = {
  async log({ actorId, action, entityType, entityId, before = null, after = null, req }) {
    const auditLog = await auditRepository.create({
      actor: actorId,
      action,
      entityType,
      entityId: String(entityId),
      before,
      after,
      ipAddress: req?.ip || '',
      userAgent: req?.headers?.['user-agent'] || '',
    });

    try {
      await operationPointsService.awardByAuditLog(auditLog);
    } catch {
      // Ignore gamification awarding failures to avoid blocking core operations.
    }

    return auditLog;
  },
};
