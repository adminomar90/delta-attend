import { ensureTask } from './ticketService.js';
import { terminalStatuses } from './ticketPolicy.js';
import { AppError } from '../../shared/errors.js';
export async function resolveTicketLink(actor, taskId) {
  if (!taskId) return null;
  const task = await ensureTask(actor, taskId);
  if (task.archived || terminalStatuses.includes(task.status) || task.status === 'DRAFT' || task.isGroupParent) throw new AppError('اربط الطلب بتذكرة تنفيذ فعالة', 409);
  return task._id;
}
