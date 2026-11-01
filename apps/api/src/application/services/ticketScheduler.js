import { TaskModel } from '../../infrastructure/db/models/TaskModel.js';
import { UserModel } from '../../infrastructure/db/models/UserModel.js';
import { terminalStatuses, idOf, nextOccurrence } from './ticketPolicy.js';
import * as tickets from './ticketService.js';

let running = false;
export async function runTicketScheduler(now = new Date()) {
  if (running) return;
  running = true;
  try {
    const rows = await TaskModel.find({ archived: { $ne: true }, isGroupParent: { $ne: true }, status: { $nin: [...terminalStatuses, 'DRAFT'] }, dueDate: { $ne: null } });
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    for (const task of rows) {
      const actor = { id: '', fullName: 'النظام' }, due = new Date(task.dueDate), until = due - now;
      if (until < 0) await tickets.notifyOnce(task, `overdue:${due.toISOString()}:${day}`, actor, 'تذكرة متأخرة');
      else if (task.reminderMinutes > 0 && until <= task.reminderMinutes * 60000) await tickets.notifyOnce(task, `due:${due.toISOString()}`, actor, 'اقتراب موعد التسليم');
    }
    for (const task of await TaskModel.find({ archived: { $ne: true }, status: { $ne: 'CANCELLED' }, 'recurrence.nextAt': { $lte: now, $ne: null }, parentTask: null })) {
      const creator = await UserModel.findById(task.assignedBy).lean();
      if (!creator?.active) continue;
      const actor = { ...creator, id: idOf(creator) }, at = new Date(task.recurrence.nextAt), key = `${task._id}:${at.toISOString()}`;
      const body = { ...task.toObject(), project: idOf(task.project) || undefined, customer: idOf(task.customer) || undefined, supplier: idOf(task.supplier) || undefined, dueDate: at, startDate: task.startDate && task.dueDate ? new Date(at.getTime() - (task.dueDate - task.startDate)) : undefined, recipients: task.recipientSnapshot.map(idOf), recipientMode: 'MULTIPLE', assignee: idOf(task.assignee), leadAssignee: idOf(task.assignee), reviewer: idOf(task.reviewer), checklist: task.checklist.map((c) => ({ text: c.text })), execution: {}, recurrence: { frequency: 'NONE' } };
      delete body.requestKey;
      try {
        if (!await TaskModel.exists({ recurrenceKey: key })) await tickets.createTicket(actor, body, { recurrenceKey: key, recurrence: { frequency: 'NONE', rootTask: task._id } });
        const next = nextOccurrence(at, task.recurrence);
        await TaskModel.updateOne({ _id: task._id, 'recurrence.nextAt': at }, { $set: { 'recurrence.nextAt': next } });
      } catch (error) {
        if (error.code === 11000) continue;
        await tickets.notifyOnce(task, `recurrence-failure:${key}`, { id: '', fullName: 'النظام' }, `تعذر التكرار: ${error.message}`);
      }
    }
    const config = await tickets.settings();
    if (config.autoMaintenance && config.updatedBy && config.defaultReviewer) {
      const creator = await UserModel.findById(config.updatedBy).lean();
      if (creator?.active) {
        const actor = { ...creator, id: idOf(creator) }, cutoff = new Date(now.getTime() + config.daysBeforeDue * 86400000);
        const visits = (await tickets.dueVisits(actor)).filter((r) => !r.completedAt && !r.ticketId && new Date(r.scheduledDate) <= cutoff && r.assignedEmployee);
        for (const row of visits) {
          try { await tickets.createMaintenanceTickets(actor, { visits: [row.key], assignee: idOf(row.assignedEmployee), recipientMode: 'SINGLE', reviewer: idOf(config.defaultReviewer) }); }
          catch (error) { console.error('[tickets] Automatic maintenance:', error.message); }
        }
      }
    }
    // Recover a report/plan update interrupted after the atomic approval write.
    for (const task of await TaskModel.find({ status: 'APPROVED', $or: [{ maintenancePlan: { $ne: null } }, { technicalRequired: true }] })) await tickets.syncTicketReport(task);
  } finally { running = false; }
}
export function startTicketScheduler() {
  const tick = () => runTicketScheduler().catch((error) => console.error('[tickets] Scheduler:', error.message));
  const first = setTimeout(tick, 5000), interval = setInterval(tick, 60000);
  first.unref(); interval.unref();
  return () => { clearTimeout(first); clearInterval(interval); };
}
