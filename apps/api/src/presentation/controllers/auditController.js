import { AuditRepository } from '../../infrastructure/db/repositories/AuditRepository.js';
import { asyncHandler } from '../../shared/errors.js';

const auditRepository = new AuditRepository();

export const listAuditLogs = asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit || 100);
  const logs = await auditRepository.list(limit);
  res.json({ logs });
});
