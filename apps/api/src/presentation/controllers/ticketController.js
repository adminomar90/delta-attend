import mongoose from 'mongoose';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { TaskModel } from '../../infrastructure/db/models/TaskModel.js';
import { UserModel } from '../../infrastructure/db/models/UserModel.js';
import { TicketSettingsModel } from '../../infrastructure/db/models/TicketSettingsModel.js';
import { CustomerModel } from '../../infrastructure/db/models/CustomerModel.js';
import { ProjectModel } from '../../infrastructure/db/models/ProjectModel.js';
import { SupplierModel } from '../../infrastructure/db/models/SupplierModel.js';
import { AppError, asyncHandler } from '../../shared/errors.js';
import { hasPermission } from '../../shared/permissions.js';
import { Permission } from '../../shared/constants.js';
import { env } from '../../config/env.js';
import * as tickets from '../../application/services/ticketService.js';
import { idOf, overdue, terminalStatuses, assertTransition, assertSubmission, baghdadDate, nextOccurrence, executionMinutes } from '../../application/services/ticketPolicy.js';
import { pointsCalculator } from '../../application/services/pointsCalculator.js';
import { PointsLedgerModel } from '../../infrastructure/db/models/PointsLedgerModel.js';

const detailResponse = async (req, res, id = req.params.id) => res.json({ task: await tickets.details(req.user, id) });
export const metadata = asyncHandler(async (req, res) => {
  const ids = await tickets.managedIds(req.user);
  const users = await UserModel.find(ids ? { _id: { $in: ids } } : {}).select('fullName department role active').sort({ fullName: 1 }).lean();
  // Reviewers are selectable contacts, not unrestricted access to employee profiles.
  const reviewers = await UserModel.find({ active: true, deletedAt: null }).select('fullName role').lean();
  const [projects, customers, suppliers] = tickets.isManager(req.user) ? await Promise.all([
    ProjectModel.find({}).select('name code').lean(), CustomerModel.find({ archived: { $ne: true } }).select('name sites').lean(), SupplierModel.find({}).select('supplierName name companyName').lean(),
  ]) : [[], [], []];
  const config = await tickets.settings();
  res.json({ users, reviewers, projects, customers, suppliers, settings: config, capabilities: { create: tickets.isManager(req.user), all: tickets.isGlobal(req.user), maintenance: hasPermission(req.user, Permission.VIEW_MAINTENANCE_PLANS) || tickets.isManager(req.user), settings: hasPermission(req.user, Permission.MANAGE_TICKET_SETTINGS), evaluations: [Permission.VIEW_CUSTOMER_EVALUATIONS, Permission.MANAGE_CUSTOMER_EVALUATIONS, Permission.VIEW_ANALYTICS, Permission.VIEW_EXECUTIVE_REPORTS, Permission.VIEW_COMPLETED_WORK_REPORTS, Permission.MANAGE_DAILY_WORK_PLANS].some((p) => hasPermission(req.user, p)) } });
});
export const list = asyncHandler(async (req, res) => {
  const clauses = [await tickets.accessFilter(req.user)];
  const q = req.query;
  if (q.view === 'mine') clauses.push({ $or: [{ assignee: req.user.id }, { participants: req.user.id }] });
  if (q.view === 'assigned') clauses.push({ assignedBy: req.user.id });
  if (q.view === 'review') clauses.push({ reviewer: req.user.id, status: 'SUBMITTED' });
  if (q.view === 'team' && !tickets.isManager(req.user)) throw new AppError('غير مخول بعرض الفريق', 403);
  if (q.view === 'all' && !tickets.isGlobal(req.user)) throw new AppError('غير مخول بعرض جميع التذاكر', 403);
  for (const field of ['status', 'priority', 'ticketType', 'branch']) if (q[field]) clauses.push({ [field]: String(q[field]) });
  for (const field of ['assignee', 'project', 'customer']) if (q[field]) { if (!mongoose.isValidObjectId(q[field])) throw new AppError('مرشح غير صالح', 400); clauses.push({ [field]: q[field] }); }
  if (q.archived !== 'true') clauses.push({ archived: { $ne: true } });
  if (q.overdue === 'true') clauses.push({ dueDate: { $lt: new Date() }, status: { $nin: [...terminalStatuses, 'DRAFT'] }, isGroupParent: { $ne: true } });
  if (q.from || q.to) clauses.push({ dueDate: { ...(q.from ? { $gte: baghdadDate(q.from) } : {}), ...(q.to ? { $lte: baghdadDate(/^\d{4}-\d{2}-\d{2}$/.test(String(q.to)) ? `${q.to}T23:59:59.999+03:00` : q.to) } : {}) } });
  if (q.search) { const regex = String(q.search).slice(0, 150).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); clauses.push({ $or: ['ticketNumber', 'title', 'description', 'customerName', 'branch'].map((field) => ({ [field]: { $regex: regex, $options: 'i' } })) }); }
  const filter = { $and: clauses }, limit = Math.min(200, Math.max(1, Number(q.limit) || 100)), page = Math.max(1, Number(q.page) || 1);
  const [rows, total, scoped] = await Promise.all([
    TaskModel.find(filter).select('-attachments -comments -submissions -history -maintenanceSnapshot -notificationKeys -execution.customerSignature').populate('assignee reviewer assignedBy', 'fullName active').populate('project', 'name').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    TaskModel.countDocuments(filter), TaskModel.find({ $and: [...clauses, { isGroupParent: { $ne: true }, status: { $ne: 'DRAFT' } }] }).select('status dueDate approvedAt submittedAt createdAt history execution.workMinutes').lean(),
  ]);
  const completed = scoped.filter((t) => t.status === 'APPROVED');
  const summary = { open: scoped.filter((t) => !terminalStatuses.includes(t.status)).length, overdue: scoped.filter((t) => overdue(t)).length, review: scoped.filter((t) => t.status === 'SUBMITTED').length, completed: completed.length, returned: scoped.filter((t) => t.history?.some((h) => h.action === 'إعادة للتعديل') || t.status === 'REJECTED').length, onTimePercent: completed.length ? Math.round(completed.filter((t) => new Date(t.submittedAt || t.approvedAt) <= new Date(t.dueDate)).length / completed.length * 100) : 0, averageHours: completed.length ? Math.round(completed.reduce((sum, t) => sum + (new Date(t.approvedAt) - new Date(t.createdAt)) / 3600000, 0) / completed.length) : 0 };
  summary.averageExecutionHours = completed.length ? Math.round(completed.reduce((sum, t) => sum + executionMinutes(t), 0) / completed.length / 60 * 10) / 10 : 0;
  if (hasPermission(req.user, Permission.VIEW_MAINTENANCE_PLANS) || tickets.isManager(req.user)) {
    const visits = await tickets.dueVisits(req.user);
    summary.maintenanceDue = visits.filter((v) => !v.completedAt && (['TODAY', 'OVERDUE'].includes(v.category) || v.category === 'TICKETED' && new Date(v.scheduledDate) <= new Date())).length;
    summary.maintenanceCompleted = visits.filter((v) => !!v.completedAt).length;
  }
  res.json({ tasks: rows.map((t) => ({ ...t, overdue: overdue(t) })), total, page, pages: Math.ceil(total / limit), summary });
});
export const create = asyncHandler(async (req, res) => { const task = await tickets.createTicket(req.user, req.body); res.status(201); await detailResponse(req, res, task._id); });
export const get = asyncHandler(async (req, res) => detailResponse(req, res));
export const myActivity = asyncHandler(async (req, res) => {
  const [tasks, pointsHistory] = await Promise.all([
    TaskModel.find({ $and: [{ assignee: req.user.id }, await tickets.accessFilter(req.user)] }).select('-attachments -comments -submissions -history -maintenanceSnapshot -notificationKeys -draftData -execution.customerSignature').populate('assignee', 'fullName role pointsTotal level department').populate('project', 'name code').sort({ createdAt: -1 }).limit(20),
    PointsLedgerModel.find({ user: req.user.id }).populate('user', 'fullName role').populate('approvedBy', 'fullName role').sort({ createdAt: -1 }).limit(20),
  ]);
  res.json({ tasks, pointsHistory });
});
export const update = asyncHandler(async (req, res) => {
  const task = await tickets.ensureTask(req.user, req.params.id), b = req.body;
  if (task.archived || terminalStatuses.includes(task.status)) throw new AppError('أعد فتح التذكرة قبل التعديل', 409);
  const manage = await tickets.canManage(req.user, task), execute = tickets.canExecute(req.user, task);
  if (!manage && !execute) throw new AppError('غير مخول بالتعديل', 403);
  if (task.status === 'SUBMITTED' && (b.execution || b.checklist || ['title', 'description', 'requireOutput', 'outputType', 'assignee', 'recipients', 'recipientMode'].some((key) => Object.hasOwn(b, key)))) throw new AppError('نسخة التسليم مغلقة؛ أعدها للتعديل قبل تغيير التنفيذ أو المستلمين', 409);
  const values = {};
  if (b.execution && execute) values.execution = { ...task.execution?.toObject?.() || task.execution, ...tickets.cleanExecution(b.execution) };
  if (b.checklist) {
    if (!Array.isArray(b.checklist) || b.checklist.length > 100) throw new AppError('قائمة الخطوات غير صالحة', 400);
    const itemIds = b.checklist.map((item) => item._id).filter(Boolean);
    if (new Set(itemIds).size !== itemIds.length) throw new AppError('لا يمكن تكرار خطوة في القائمة', 400);
    values.checklist = b.checklist.map((item) => {
      const original = task.checklist.id(item._id);
      if (!original && !manage) throw new AppError('لا يمكنك إضافة خطوات', 403);
      return { ...(original?.toObject() || {}), text: manage ? String(item.text || '').slice(0, 500) : original.text, checked: item.checked === true, checkedBy: req.user.id, checkedAt: new Date() };
    });
    if (!manage && values.checklist.length !== task.checklist.length) throw new AppError('لا يمكنك إزالة خطوات', 403);
  }
  if (manage) {
    if (task.status === 'DRAFT') {
      if (Object.hasOwn(b, 'dueDate')) values.dueDate = baghdadDate(b.dueDate) || null;
      if (Object.hasOwn(b, 'startDate')) values.startDate = baghdadDate(b.startDate) || null;
      if (b.draftData && JSON.stringify(b.draftData).length < 40000) values.draftData = b.draftData;
      if (b.ticketType) { const type = (await tickets.settings()).types.find((t) => t.key === b.ticketType && t.active !== false); if (!type) throw new AppError('نوع التذكرة غير صالح', 400); values.ticketType = b.ticketType; values.technicalRequired = type.technical; }
      if (b.execution) values.execution = tickets.cleanExecution(b.execution);
      Object.assign(values, await tickets.validateLinks(b));
      if (b.recurrence) { const frequency = b.recurrence.frequency || 'NONE'; if (!['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'].includes(frequency)) throw new AppError('التكرار غير صالح', 400); values.recurrence = { frequency, intervalDays: Number(b.recurrence.intervalDays || 1), until: baghdadDate(b.recurrence.until), nextAt: b.assign && b.dueDate && frequency !== 'NONE' ? nextOccurrence(baghdadDate(b.dueDate), b.recurrence) : null }; }
    }
    for (const key of ['title', 'description', 'priority', 'outputType', 'requireOutput', 'reminderMinutes', 'plannedPoints', 'requiredApprovals']) if (Object.hasOwn(b, key)) values[key] = b[key];
    if (b.dueDate) { if (task.status !== 'DRAFT' && !b.reason?.trim()) throw new AppError('سبب تغيير الموعد إلزامي', 400); values.dueDate = baghdadDate(b.dueDate); values.originalDueDate = task.originalDueDate || task.dueDate || values.dueDate; }
    if (b.startDate) values.startDate = baghdadDate(b.startDate);
    if (b.reviewer) { if (!mongoose.isValidObjectId(b.reviewer) || !await UserModel.exists({ _id: b.reviewer, active: true })) throw new AppError('المراجع غير نشط', 400); values.reviewer = b.reviewer; }
    if (b.recipients || b.assignee || b.recipientMode || b.assign === true) {
      if (task.isGroupParent) throw new AppError('أعد إسناد المهام الفرعية بصورة مستقلة', 400);
      const recipientIds = await tickets.recipients(req.user, b), lead = b.leadAssignee || b.assignee || recipientIds[0];
      if (!recipientIds.includes(lead)) throw new AppError('المسؤول الرئيسي خارج قائمة المستلمين', 400);
      if (task.status !== 'DRAFT' && !b.reason?.trim()) throw new AppError('سبب تغيير المستلمين إلزامي', 400);
      values.assignee = lead; values.participants = recipientIds.filter((id) => id !== lead); values.recipientSnapshot = recipientIds;
      if (!task.initialRecipientSnapshot?.length) values.initialRecipientSnapshot = task.recipientSnapshot?.length ? task.recipientSnapshot : recipientIds;
      values.assignmentMode = b.assignmentMode === 'INDEPENDENT' && task.status === 'DRAFT' ? 'INDEPENDENT' : recipientIds.length > 1 ? 'SHARED' : 'SINGLE';
      values.isGroupParent = values.assignmentMode === 'INDEPENDENT';
    }
    if (b.assign === true) {
      if (task.status !== 'DRAFT') throw new AppError('التذكرة مسندة مسبقًا', 409);
      if (!(Object.hasOwn(values, 'title') ? values.title : task.title)?.trim() || !(values.assignee || task.assignee) || !(Object.hasOwn(values, 'dueDate') ? values.dueDate : task.dueDate) || !(values.reviewer || task.reviewer)) throw new AppError('أكمل العنوان والمستلم والمراجع والموعد', 400);
      values.status = 'ASSIGNED';
      values.draftData = null;
    }
  } else if (Object.keys(b).some((k) => !['checklist', 'execution'].includes(k))) throw new AppError('يمكنك تحديث التنفيذ والخطوات فقط', 403);
  if (!Object.keys(values).length) throw new AppError('لا توجد تغييرات', 400);
  if ((values.startDate || task.startDate) && (values.dueDate || task.dueDate) && new Date(values.startDate || task.startDate) > new Date(values.dueDate || task.dueDate)) throw new AppError('التسليم يسبق البدء', 400);
  const updated = await tickets.mutate(task, req.user, b.assign ? 'إسناد مسودة' : values.assignee ? 'إعادة إسناد' : values.dueDate ? 'تغيير موعد التسليم' : 'تحديث التنفيذ والخطوات', values, b.reason || '');
  if (updated.isGroupParent) await tickets.ensureChildren(updated, req.user);
  await detailResponse(req, res);
});
const changeStatusHandler = async (req, res) => {
  const task = await tickets.ensureTask(req.user, req.params.id), b = req.body, next = b.status;
  assertTransition(task, next, b);
  if (task.isGroupParent) throw new AppError('تتغير حالة التكليف الجماعي من تقدم المهام الفرعية', 400);
  const manage = await tickets.canManage(req.user, task), execute = tickets.canExecute(req.user, task);
  if (terminalStatuses.includes(task.status) && !hasPermission(req.user, Permission.REOPEN_TASKS)) throw new AppError('لا تملك صلاحية إعادة الفتح', 403);
  if (['REJECTED', 'APPROVED'].includes(next)) { if (!tickets.canReview(req.user, task)) throw new AppError('المراجع المعين وحده يعتمد الإنجاز؛ اعتماد العمل الشخصي يحتاج صلاحية صريحة', 403); }
  else if (next === 'CANCELLED' ? !manage : !execute && !manage) throw new AppError('غير مخول بالإجراء', 403);
  if (next === 'ASSIGNED') throw new AppError('استخدم إجراء إسناد المسودة بعد إكمال حقولها', 400);
  if (next === 'SUBMITTED' && idOf(task.assignee) !== req.user.id) throw new AppError('المسؤول الرئيسي فقط يسلّم للمراجعة', 403);
  const values = { status: next }, pushes = {};
  if (terminalStatuses.includes(task.status) && next === 'IN_PROGRESS' && (!task.title?.trim() || !task.assignee || !task.dueDate)) {
    if (!manage) throw new AppError('إعادة فتح مسودة غير مسندة تحتاج صلاحية إدارتها', 403);
    values.status = 'DRAFT';
  }
  if (next === 'IN_PROGRESS') { values.waitingReason = ''; values.waitingParty = ''; }
  let label = 'تغيير الحالة';
  if (next === 'WAITING') { values.waitingReason = b.reason; values.waitingParty = b.waitingParty; label = 'انتظار إجراء خارجي'; }
  if (next === 'CANCELLED') { values.cancellationReason = b.reason; label = 'إلغاء التذكرة'; }
  if (next === 'REJECTED') { values.rejectionReason = b.reason || b.rejectionReason; values.approvalTrail = []; label = 'إعادة للتعديل'; }
  if (next === 'SUBMITTED') {
    assertSubmission(task, (await tickets.settings()).types.find((t) => t.key === task.ticketType));
    values.submittedAt = new Date(); values.rejectionReason = ''; values.approvalTrail = [];
    pushes.submissions = { note: String(b.note || '').slice(0, 10000), attachmentIds: task.attachments.filter((a) => a.purpose !== 'REFERENCE').map((a) => idOf(a)), execution: task.execution?.toObject?.() || {}, submittedBy: req.user.id };
    label = 'تسليم للمراجعة';
  }
  if (next === 'APPROVED') {
    if (task.approvalTrail.some((a) => idOf(a.approver) === req.user.id)) throw new AppError('سبق أن اعتمدت مرحلة هذه النسخة', 409);
    pushes.approvalTrail = { approver: req.user.id, role: req.user.role, note: String(b.note || ''), approvedAt: new Date() };
    const final = task.approvalTrail.length + 1 >= (task.requiredApprovals || 1);
    values.status = final ? 'APPROVED' : 'SUBMITTED';
    if (final) { values.approvedAt = new Date(); values.approvedBy = req.user.id; values.completedAt = new Date(); values.qualityScore = Number(b.qualityScore || 3); }
    label = final ? 'اعتماد الإنجاز' : 'اعتماد مرحلي';
  }
  if (terminalStatuses.includes(task.status)) { label = 'إعادة فتح'; values.approvalTrail = []; values.approvedAt = null; values.approvedBy = null; values.completedAt = null; values.archived = false; values.cancellationReason = ''; }
  const updated = await tickets.mutate(task, req.user, label, values, b.reason || b.note || '', pushes);
  if (updated.status === 'APPROVED') {
    await tickets.syncTicketReport(updated);
    if (!task.pointsAwarded && task.assignee && !task.history.some((h) => h.action === 'اعتماد الإنجاز' || h.before?.status === 'APPROVED')) {
      try {
        const existing = await PointsLedgerModel.findOne({ task: updated._id, category: 'TASK_APPROVAL' });
        let points = existing?.points || 0;
        if (!existing) {
          const { performancePointsService } = await import('../../application/services/performancePointsService.js');
          const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
          const start = baghdadDate(day), end = new Date(start.getTime() + 86400000);
          const ledger = await PointsLedgerModel.aggregate([{ $match: { user: updated.assignee, createdAt: { $gte: start, $lt: end } } }, { $group: { _id: null, total: { $sum: '$points' } } }]);
          const manual = Number(b.points), hasManual = b.points !== undefined && Number.isFinite(manual) && manual >= 0 && manual <= 1000 && hasPermission(req.user, Permission.APPROVE_TASKS);
          // Review latency must not reduce the employee's timeliness points.
          const pointsTask = { ...updated.toObject(), completedAt: updated.submittedAt || updated.completedAt };
          points = pointsCalculator.applyDailyCap(hasManual ? Math.round(manual) : pointsCalculator.calculateTaskPoints(pointsTask, updated.qualityScore), ledger[0]?.total || 0);
          await performancePointsService.awardPoints({ userId: updated.assignee, task: updated._id, points, category: 'TASK_APPROVAL', reason: `اعتماد مهمة: ${updated.title}`, sourceAction: 'TASK_APPROVED', approvedBy: req.user.id, actorId: req.user.id, req, metadata: { taskId: idOf(updated) } });
        }
        await TaskModel.updateOne({ _id: updated._id }, { $set: { pointsAwarded: points } });
      }
      catch (error) { console.error('[tickets] Points follow-up:', error.message); }
    }
  }
  if (task.parentTask) await tickets.syncGroupParent(task.parentTask, req.user);
  await detailResponse(req, res);
};
export const changeStatus = asyncHandler(changeStatusHandler);
export const approve = asyncHandler(async (req, res) => { req.body.status = 'APPROVED'; return changeStatusHandler(req, res); });
export const comment = asyncHandler(async (req, res) => {
  const task = await tickets.ensureTask(req.user, req.params.id);
  if (!String(req.body.text || '').trim() || req.body.text.length > 6000) throw new AppError('اكتب تعليقًا بحد أقصى 6000 حرف', 400);
  if (task.archived) throw new AppError('التذكرة مؤرشفة', 409);
  const allowed = [task.assignee, task.assignedBy, task.reviewer, ...(task.participants || [])].map(idOf);
  const mentions = [...new Set(req.body.mentions || [])];
  if (mentions.some((id) => !allowed.includes(id))) throw new AppError('الإشارة متاحة للمشاركين في التذكرة فقط', 400);
  await tickets.mutate(task, req.user, 'تعليق جديد', {}, '', { comments: { text: req.body.text.trim(), author: req.user.id, mentions } });
  await detailResponse(req, res);
});
export const archive = asyncHandler(async (req, res) => { const task = await tickets.ensureTask(req.user, req.params.id); if (!await tickets.canManage(req.user, task)) throw new AppError('غير مخول بالأرشفة', 403); if (!terminalStatuses.includes(task.status)) throw new AppError('أكمل التذكرة أو ألغها بسبب مسجل قبل الأرشفة', 409); await tickets.mutate(task, req.user, 'أرشفة', { archived: true }, req.body.reason || ''); await detailResponse(req, res); });
export const groupRecipients = asyncHandler(async (req, res) => {
  const task = await tickets.ensureTask(req.user, req.params.id), b = req.body;
  if (!task.isGroupParent || !await tickets.canManage(req.user, task) || task.archived) throw new AppError('غير مخول بإدارة مستلمي التكليف', 403);
  if (!b.reason?.trim() || !['ADD', 'REMOVE'].includes(b.mode)) throw new AppError('الإجراء والسبب إلزاميان', 400);
  let ids;
  if (b.mode === 'ADD') ids = await tickets.recipients(req.user, b);
  else { ids = (b.recipients || []).map(String); if (!ids.length || ids.some((v) => !task.recipientSnapshot.map(idOf).includes(v))) throw new AppError('حدد المستلمين الحاليين للإزالة', 400); }
  const current = task.recipientSnapshot.map(idOf), next = b.mode === 'ADD' ? [...new Set([...current, ...ids])] : current.filter((v) => !ids.includes(v));
  if (!next.length) throw new AppError('يجب إبقاء مستلم واحد؛ استخدم الإلغاء لإغلاق المهام', 400);
  if (b.mode === 'REMOVE') {
    const removed = await TaskModel.find({ parentTask: task._id, childKey: { $in: ids.map((userId) => `${task._id}:${userId}`) } });
    if (removed.some((c) => c.status === 'APPROVED')) throw new AppError('لا يمكن إزالة موظف له إنجاز معتمد؛ السجل محفوظ', 409);
  }
  if (b.mode === 'ADD' && await TaskModel.exists({ parentTask: task._id, removedFromGroup: true, childKey: { $in: ids.map((userId) => `${task._id}:${userId}`) } }) && !hasPermission(req.user, Permission.REOPEN_TASKS)) throw new AppError('إعادة موظف أزيل من التكليف تحتاج صلاحية إعادة الفتح', 403);
  const updated = await tickets.mutate(task, req.user, b.mode === 'ADD' ? 'إضافة مستلمين' : 'إزالة مستلمين', { recipientSnapshot: next, initialRecipientSnapshot: task.initialRecipientSnapshot?.length ? task.initialRecipientSnapshot : task.recipientSnapshot, assignee: next.includes(idOf(task.assignee)) ? task.assignee : next[0], status: 'IN_PROGRESS' }, b.reason);
  await tickets.ensureChildren(updated, req.user);
  await detailResponse(req, res);
});
export const saveSettings = asyncHandler(async (req, res) => {
  const b = req.body;
  if (!Array.isArray(b.types) || !b.types.length || b.types.length > 40 || b.types.some((t) => !/^[A-Z][A-Z0-9_]{1,39}$/.test(t.key) || !t.label?.trim()) || new Set(b.types.map((t) => t.key)).size !== b.types.length) throw new AppError('الأنواع غير صالحة أو مكررة', 400);
  const existing = await tickets.settings();
  if (existing.types.some((t) => !b.types.some((n) => n.key === t.key))) throw new AppError('عطّل الأنواع القديمة بدل حذفها حفاظًا على السجلات', 400);
  if (b.autoMaintenance && (!b.defaultReviewer || !await UserModel.exists({ _id: b.defaultReviewer, active: true }))) throw new AppError('اختر مراجعًا نشطًا للإنشاء الآلي', 400);
  const config = await TicketSettingsModel.findOneAndUpdate({ _id: 'tickets' }, { $set: { types: b.types.map((t) => ({ key: t.key, label: t.label.trim().slice(0, 100), technical: t.technical === true, active: t.active !== false })), autoMaintenance: b.autoMaintenance === true, daysBeforeDue: Number(b.daysBeforeDue ?? 3), defaultReviewer: b.defaultReviewer || null, updatedBy: req.user.id } }, { upsert: true, new: true, runValidators: true });
  res.json({ settings: config });
});
export const maintenanceDue = asyncHandler(async (req, res) => res.json({ visits: await tickets.dueVisits(req.user, req.query) }));
export const maintenanceCreate = asyncHandler(async (req, res) => res.status(201).json({ results: await tickets.createMaintenanceTickets(req.user, req.body) }));

const privateDir = path.resolve(env.privateUploadsDir, 'tickets');
const fileTypes = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xls': 'application/vnd.ms-excel', '.csv': 'text/csv', '.txt': 'text/plain' };
export function validateTicketFile(file) {
  const ext = path.extname(file.originalname).toLowerCase(), mime = fileTypes[ext], b = file.buffer;
  if (!mime || !b?.length || b.length > 10 * 1024 * 1024) throw new AppError('الملف غير مدعوم أو يتجاوز 10 MB', 400);
  const valid = ext === '.pdf' ? b.subarray(0, 5).toString() === '%PDF-' : ext === '.png' ? b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : ['.jpg', '.jpeg'].includes(ext) ? b[0] === 255 && b[1] === 216 && b[2] === 255 : ['.xlsx', '.docx'].includes(ext) ? b[0] === 80 && b[1] === 75 && b[2] === 3 && b[3] === 4 : ext === '.xls' ? b.subarray(0, 8).equals(Buffer.from([208, 207, 17, 224, 161, 177, 26, 225])) : !b.includes(0);
  if (!valid) throw new AppError('محتوى الملف لا يطابق امتداده', 400);
  return { ext, mime };
}
export const authorizeUpload = asyncHandler(async (req, res, next) => { const task = await tickets.ensureTask(req.user, req.params.id); if (task.archived || !['DRAFT', 'TODO', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'REJECTED'].includes(task.status)) throw new AppError('لا يمكن رفع مرفقات في هذه الحالة', 409); if (!tickets.canExecute(req.user, task) && !await tickets.canManage(req.user, task)) throw new AppError('غير مخول بالرفع', 403); req.ticket = task; next(); });
export const upload = asyncHandler(async (req, res) => {
  const task = req.ticket, files = req.files || [], purpose = req.body.purpose || 'REFERENCE';
  if (!['REFERENCE', 'OUTPUT', 'BEFORE', 'AFTER'].includes(purpose) || !files.length || task.attachments.length + files.length > 100) throw new AppError('نوع المرفق أو عدد الملفات غير صالح', 400);
  if (task.isGroupParent && purpose !== 'REFERENCE') throw new AppError('ارفع ناتج الإنجاز في المهمة المستقلة للموظف؛ التكليف الرئيسي للمراجع فقط', 400);
  const checked = files.map((f) => validateTicketFile(f)), stored = [];
  await fs.mkdir(privateDir, { recursive: true });
  try {
    for (const [i, file] of files.entries()) {
      const storageName = `${randomUUID()}${checked[i].ext}`;
      await fs.writeFile(path.join(privateDir, storageName), file.buffer, { flag: 'wx' });
      let originalName = file.originalname; if (/[\u0080-\u00ff]/.test(originalName)) { const decoded = Buffer.from(originalName, 'latin1').toString('utf8'); if (!decoded.includes('\uFFFD')) originalName = decoded; }
      stored.push({ originalName: path.basename(originalName).slice(0, 200), storageName, size: file.size, mimeType: checked[i].mime, purpose, uploadedBy: req.user.id });
    }
    await tickets.mutate(task, req.user, 'إرفاق ملفات', {}, purpose, { attachments: { $each: stored } });
  } catch (error) { await Promise.allSettled(stored.map((f) => fs.unlink(path.join(privateDir, f.storageName)))); throw error; }
  await detailResponse(req, res);
});
export const download = asyncHandler(async (req, res) => {
  const task = await tickets.ensureTask(req.user, req.params.id), file = task.attachments.id(req.params.attachmentId);
  if (!file || !/^[a-f0-9-]+\.[a-z]+$/.test(file.storageName)) throw new AppError('الملف غير موجود', 404);
  res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
  res.download(path.join(privateDir, file.storageName), file.originalName);
});
