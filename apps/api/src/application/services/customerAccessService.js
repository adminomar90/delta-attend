import { DailyWorkPlanRepository } from '../../infrastructure/db/repositories/DailyWorkPlanRepository.js';
import { Permission, Roles } from '../../shared/constants.js';
import { hasPermission } from '../../shared/permissions.js';

const dailyWorkPlanRepository = new DailyWorkPlanRepository();
const toId = (value) => String(value?._id || value?.id || value || '').trim();

export const userCanSeeCustomer = async (req, customer) => {
  if (hasPermission(req.user, Permission.MANAGE_CUSTOMERS) || hasPermission(req.user, Permission.CREATE_CUSTOMERS)
    || req.user.role === Roles.GENERAL_MANAGER) return true;
  if (hasPermission(req.user, Permission.VIEW_CUSTOMER_FINANCIAL_INFO)) return true;
  if (!hasPermission(req.user, Permission.VIEW_CUSTOMERS)) return false;
  const actorId = toId(req.user.id);
  if (toId(customer.createdBy) === actorId) return true;
  const linkedPlanIds = (customer.linkedDailyWorkPlans || []).map(toId).filter(Boolean);
  if (!linkedPlanIds.length) return false;
  const visiblePlans = await dailyWorkPlanRepository.list({
    _id: { $in: linkedPlanIds },
    $or: [{ 'assignees.user': actorId }, { teamLeader: actorId }, { supervisor: actorId }, { createdBy: actorId }],
  }, { limit: 1 });
  return visiblePlans.length > 0;
};
