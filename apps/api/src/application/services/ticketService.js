import mongoose from 'mongoose';
import { TaskModel } from '../../infrastructure/db/models/TaskModel.js';
import { UserModel } from '../../infrastructure/db/models/UserModel.js';
import { UserRepository } from '../../infrastructure/db/repositories/UserRepository.js';
import { CounterModel } from '../../infrastructure/db/models/CounterModel.js';
import { TicketSettingsModel } from '../../infrastructure/db/models/TicketSettingsModel.js';
import { CustomerModel } from '../../infrastructure/db/models/CustomerModel.js';
import { MaintenancePlanModel } from '../../infrastructure/db/models/MaintenancePlanModel.js';
import { MaintenanceVisitModel } from '../../infrastructure/db/models/MaintenanceVisitModel.js';
import { MaterialRequestModel } from '../../infrastructure/db/models/MaterialRequestModel.js';
import { PurchaseRequestModel } from '../../infrastructure/db/models/PurchaseRequestModel.js';
import { MaintenanceReportModel } from '../../infrastructure/db/models/MaintenanceReportModel.js';
import { resolveManagedUserIds } from '../../shared/accessScope.js';
import { hasPermission } from '../../shared/permissions.js';
import { Permission, Roles } from '../../shared/constants.js';
import { AppError } from '../../shared/errors.js';
import { notificationService } from './notificationService.js';
import { summarizeMaintenancePlan } from './maintenancePlanService.js';
import { idOf, ticketTypes, terminalStatuses, baghdadDate, overdue, nextOccurrence } from './ticketPolicy.js';

export const settings = async () => (await TicketSettingsModel.findById('tickets').lean()) || { types: ticketTypes.map((t) => ({ ...t, active: true })), autoMaintenance: false, daysBeforeDue: 3 };
export const isManager = (actor) => hasPermission(actor, Permission.MANAGE_TASKS);
export const isGlobal = (actor) => hasPermission(actor, Permission.VIEW_ALL_TASKS);
export async function managedIds(actor, includeInactive = true) {
  if (isGlobal(actor)) return null;
  if (!isManager(actor)) return [actor.id];
  return resolveManagedUserIds({ userRepository: new UserRepository(), actorId: actor.id, actorRole: [Roles.PROJECT_MANAGER, Roles.ASSISTANT_PROJECT_MANAGER, Roles.TEAM_LEAD].includes(actor.role) ? actor.role : Roles.TEAM_LEAD, includeInactive });
}
export async function accessFilter(actor) {
  if (isGlobal(actor)) return {};
  const related = [{ assignee: actor.id }, { participants: actor.id }, { assignedBy: actor.id }, { reviewer: actor.id }];
  if (isManager(actor)) related.push({ assignee: { $in: await managedIds(actor) } });
  return { $or: [{ assignedBy: actor.id }, { $and: [{ status: { $ne: 'DRAFT' } }, { $or: related }] }] };
}
export async function ensureTask(actor, taskId) {
  if (!mongoose.isValidObjectId(taskId)) throw new AppError('التذكرة غير موجودة', 404);
  const task = await TaskModel.findOne({ $and: [{ _id: taskId }, await accessFilter(actor)] });
  if (!task) throw new AppError('التذكرة غير موجودة أو غير مخول بها', 404);
  return task;
}
export async function canManage(actor, task) {
  if (!isManager(actor)) return false;
  if (isGlobal(actor) || idOf(task.assignedBy) === actor.id) return true;
  return (await managedIds(actor)).includes(idOf(task.assignee));
}
export const canExecute = (actor, task) => idOf(task.assignee) === actor.id || (task.participants || []).some((p) => idOf(p) === actor.id);
export function canReview(actor, task) {
  if ([idOf(task.assignee), ...(task.participants || []).map(idOf)].includes(actor.id) && !hasPermission(actor, Permission.APPROVE_OWN_TASKS)) return false;
  return task.reviewer ? idOf(task.reviewer) === actor.id || isGlobal(actor) && hasPermission(actor, Permission.APPROVE_TASKS) : hasPermission(actor, Permission.APPROVE_TASKS);
}
export async function nextTicketNumber() {
  const year = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Baghdad', year: 'numeric' }).format(new Date());
  const counter = await CounterModel.findOneAndUpdate({ _id: `ticket-${year}` }, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return `TK-${year}-${String(counter.seq).padStart(5, '0')}`;
}
const history = (actor, action, note = '', before, after) => ({ actor: actor.id, actorName: actor.fullName || '', action, note, before, after, at: new Date() });
async function auditTicket(actor, task, action, before = null, after = null) {
  try { const { auditService } = await import('./auditService.js'); await auditService.log({ actorId: actor.id, action, entityType: 'TASK', entityId: task._id, before, after }); }
  catch (error) { console.error('[tickets] Central audit follow-up:', error.message); }
}
export async function mutate(task, actor, action, values, note = '', extraPush = {}) {
  const logged = { ...values };
  delete logged.draftData;
  if (logged.execution) logged.execution = { changedFields: Object.keys(logged.execution) };
  if (logged.checklist) logged.checklist = { count: logged.checklist.length, checked: logged.checklist.filter((item) => item.checked).length };
  if (task.status === 'DRAFT' && Object.hasOwn(logged, 'description')) logged.description = '(تم تحديث نص المسودة)';
  const before = { status: task.status, dueDate: task.dueDate };
  if (values.assignee || values.recipientSnapshot) Object.assign(before, { assignee: task.assignee, participants: task.participants, recipientSnapshot: task.recipientSnapshot });
  if (values.approvalTrail) before.approvalTrail = task.approvalTrail;
  const updated = await TaskModel.findOneAndUpdate({ _id: task._id, $expr: { $eq: [{ $ifNull: ['$revision', 0] }, task.revision || 0] } }, {
    $set: { ...values, status: values.status || task.status }, $inc: { revision: 1 }, $push: { history: history(actor, action, note, before, logged), ...extraPush },
  }, { new: true, runValidators: true });
  if (!updated) throw new AppError('تم تحديث التذكرة بواسطة مستخدم آخر؛ حدّث الصفحة ثم حاول مجددًا', 409);
  const auditAction = task.status === 'DRAFT' ? values.status === 'ASSIGNED' ? 'TASK_CREATED' : 'TASK_DRAFT_SAVED' : values.status === 'APPROVED' ? task.pointsAwarded > 0 || task.history.some((h) => h.action === 'اعتماد الإنجاز' || h.before?.status === 'APPROVED') ? 'TASK_REAPPROVED' : 'TASK_APPROVED' : 'TASK_UPDATED';
  await auditTicket(actor, task, auditAction, before, { ...logged, title: updated.title, assignee: updated.assignee, ticketNumber: updated.ticketNumber });
  if (updated.status !== 'DRAFT' && !['تحديث التنفيذ والخطوات', 'إرفاق ملفات'].includes(action)) await notify(updated, actor, action, note);
  return updated;
}
export async function notify(task, actor, action, note = '') {
  const ids = [...new Set([task.assignee, task.assignedBy, task.reviewer, ...(task.participants || [])].map(idOf).filter((id) => id && id !== actor.id))];
  try {
    await notificationService.notifyUsers(ids, { type: 'SYSTEM', titleAr: 'التذاكر والمهام', messageAr: `${action}: ${task.title}${note ? ` — ${note.slice(0, 300)}` : ''}`, metadata: { taskId: idOf(task), href: `/tasks?ticket=${idOf(task)}`, action } });
  } catch (error) { console.error('[tickets] Notification delivery failed:', error.message); }
}
export async function recipients(actor, body) {
  const filter = { active: true, deletedAt: null };
  const ids = await managedIds(actor);
  if (ids) filter._id = { $in: ids };
  switch (body.recipientMode || 'SINGLE') {
    case 'DEPARTMENT': if (!String(body.department || '').trim()) throw new AppError('اختر القسم', 400); filter.department = body.department; break;
    case 'TECHNICAL': filter.role = Roles.TECHNICAL_STAFF; break;
    case 'ALL': break;
    default: {
      const wanted = [...new Set((body.recipientMode === 'MULTIPLE' ? body.recipients || [] : [body.assignee]).map(idOf).filter(Boolean))];
      if (!wanted.length || wanted.some((id) => !mongoose.isValidObjectId(id))) throw new AppError('اختر الموظفين المستلمين', 400);
      filter._id = { $in: ids ? wanted.filter((id) => ids.includes(id)) : wanted };
      const users = await UserModel.find(filter).select('_id fullName').lean();
      if (users.length !== wanted.length) throw new AppError('يوجد موظف غير نشط أو خارج نطاق إدارتك', 403);
      return users.map((u) => idOf(u));
    }
  }
  const users = await UserModel.find(filter).select('_id').lean();
  if (!users.length) throw new AppError('لا يوجد مستلمون نشطون ضمن النطاق المحدد', 400);
  return users.map(idOf);
}
const executionKeys = ['contactName', 'contactPhone', 'location', 'mapUrl', 'device', 'model', 'serial', 'fault', 'impact', 'coverage', 'visitDate', 'diagnosis', 'actionTaken', 'materialsUsed', 'replacedParts', 'testResult', 'recommendations', 'customerSignature', 'signatureUnavailableReason', 'workMinutes', 'travelMinutes'];
export function cleanExecution(input = {}) {
  const out = {};
  for (const key of executionKeys) if (Object.hasOwn(input, key)) {
    if (key === 'visitDate') out[key] = baghdadDate(input[key]);
    else if (['workMinutes', 'travelMinutes'].includes(key)) { out[key] = Number(input[key]); if (!Number.isFinite(out[key]) || out[key] < 0 || out[key] > 100000) throw new AppError('مدة العمل أو التنقل غير صالحة', 400); }
    else out[key] = String(input[key] || '').slice(0, key === 'customerSignature' ? 200000 : 10000);
  }
  return out;
}
export async function validateLinks(body) {
  const result = {};
  for (const [key, model] of [['project', 'Project'], ['customer', 'Customer'], ['supplier', 'Supplier']]) if (body[key]) {
    if (!mongoose.isValidObjectId(body[key]) || !await mongoose.model(model).exists({ _id: body[key] })) throw new AppError(`المرجع ${key} غير موجود`, 400);
    result[key] = body[key];
  }
  if (result.customer) {
    const customer = await CustomerModel.findById(result.customer).select('name sites');
    result.customerName = customer.name;
    if (body.branch && !customer.sites.some((s) => idOf(s) === body.branch || s.name === body.branch)) throw new AppError('الفرع لا يتبع الزبون', 400);
    result.branch = body.branch || '';
  }
  return result;
}
export async function createTicket(actor, body, internal = {}) {
  if (!isManager(actor)) throw new AppError('ليس لديك صلاحية إنشاء تكليف', 403);
  const draft = body.draft === true;
  const type = (await settings()).types.find((t) => t.key === (body.ticketType || 'GENERAL') && t.active !== false);
  if (!type) throw new AppError('نوع التذكرة غير صالح أو معطل', 400);
  const dueDate = baghdadDate(body.dueDate), startDate = baghdadDate(body.startDate);
  if (!draft && (!String(body.title || '').trim() || !dueDate || !body.reviewer)) throw new AppError('العنوان والمراجع وموعد التسليم مطلوبة عند الإسناد', 400);
  if (startDate && dueDate && startDate > dueDate) throw new AppError('موعد التسليم يجب أن يكون بعد البدء', 400);
  const recipientIds = draft ? [] : await recipients(actor, body);
  const lead = body.leadAssignee || body.assignee || recipientIds[0];
  if (!draft && !recipientIds.includes(lead)) throw new AppError('المسؤول الرئيسي يجب أن يكون ضمن المستلمين', 400);
  if (body.reviewer && (!mongoose.isValidObjectId(body.reviewer) || !await UserModel.exists({ _id: body.reviewer, active: true, deletedAt: null }))) throw new AppError('المراجع غير موجود أو غير نشط', 400);
  const mode = recipientIds.length > 1 && body.assignmentMode === 'SINGLE' ? 'SHARED' : body.assignmentMode || (recipientIds.length > 1 ? 'SHARED' : 'SINGLE');
  if (!['SINGLE', 'SHARED', 'INDEPENDENT'].includes(mode)) throw new AppError('نمط التكليف غير صالح', 400);
  const frequency = body.recurrence?.frequency || 'NONE';
  if (!['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'].includes(frequency) || frequency === 'CUSTOM' && !(Number(body.recurrence?.intervalDays) >= 1)) throw new AppError('جدول التكرار غير صالح', 400);
  let requestKey;
  if (body.requestKey) { if (!/^[a-zA-Z0-9-]{8,100}$/.test(body.requestKey)) throw new AppError('مفتاح الطلب غير صالح', 400); requestKey = `${actor.id}:${body.requestKey}`; }
  const payload = {
    title: String(body.title || '').trim().slice(0, 300), description: String(body.description || '').slice(0, 20000), draftData: draft ? body.draftData || null : null,
    ticketNumber: await nextTicketNumber(), ticketType: type.key, technicalRequired: type.technical, priority: body.priority || 'NORMAL', assignedBy: actor.id,
    assignee: draft ? null : lead || null, reviewer: body.reviewer || null, participants: mode === 'SHARED' ? recipientIds.filter((id) => id !== lead) : [], recipientSnapshot: recipientIds, initialRecipientSnapshot: recipientIds,
    assignmentMode: mode, isGroupParent: !draft && mode === 'INDEPENDENT', dueDate, startDate, originalDueDate: dueDate,
    ...await validateLinks(body), status: draft ? 'DRAFT' : 'ASSIGNED', outputType: String(body.outputType || 'CONFIRMATION'), requireOutput: body.requireOutput === true,
    checklist: (body.checklist || []).slice(0, 100).map((item) => ({ text: String(item.text || item).trim().slice(0, 500), checked: false })).filter((i) => i.text),
    execution: type.technical ? cleanExecution(body.execution) : {},
    difficulty: body.difficulty || 3, urgency: body.urgency || (body.priority === 'URGENT' ? 3 : body.priority === 'HIGH' ? 2 : 1), estimatedHours: body.estimatedHours || 2, plannedPoints: body.plannedPoints || null, requiredApprovals: body.requiredApprovals || 1,
    reminderMinutes: body.reminderMinutes ?? 60,
    recurrence: { frequency, intervalDays: body.recurrence?.intervalDays, until: baghdadDate(body.recurrence?.until), nextAt: frequency === 'NONE' || draft ? undefined : nextOccurrence(dueDate, body.recurrence) },
    history: [history(actor, draft ? 'حفظ مسودة' : 'إنشاء وإسناد')], ...(requestKey ? { requestKey } : {}), ...internal,
  };
  let task, created = false;
  try { task = await TaskModel.create(payload); created = true; }
  catch (error) { if (error.code === 11000 && internal.maintenanceKey) task = await TaskModel.findOne({ maintenanceKey: internal.maintenanceKey }); else if (error.code === 11000 && requestKey) task = await TaskModel.findOne({ requestKey }); else throw error; }
  if (!task) throw new AppError('تعذر حفظ التكليف', 409);
  if (created) await auditTicket(actor, task, draft ? 'TASK_DRAFT_SAVED' : 'TASK_CREATED', null, { title: task.title, assignee: task.assignee, dueDate: task.dueDate, status: task.status, ticketNumber: task.ticketNumber });
  if (task.isGroupParent) await ensureChildren(task, actor);
  if (!draft && !task.isGroupParent && task.history.length === 1) await notifyOnce(task, 'creation', actor, 'تكليف جديد');
  return task;
}
export async function ensureChildren(parent, actor) {
  const currentKeys = parent.recipientSnapshot.map((userId) => `${parent._id}:${userId}`);
  for (const child of await TaskModel.find({ parentTask: parent._id })) {
    if (!currentKeys.includes(child.childKey) && !terminalStatuses.includes(child.status)) await mutate(child, actor, 'إزالة من تكليف جماعي', { status: 'CANCELLED', removedFromGroup: true, cancellationReason: 'أزيل المستلم من التكليف الرئيسي' });
    else if (currentKeys.includes(child.childKey) && child.removedFromGroup) await mutate(child, actor, 'إعادة إضافة إلى التكليف الجماعي', { status: 'ASSIGNED', removedFromGroup: false, cancellationReason: '' });
  }
  for (const assignee of parent.recipientSnapshot) {
    const childKey = `${parent._id}:${assignee}`;
    if (await TaskModel.exists({ childKey })) continue;
    const data = parent.toObject();
    for (const key of ['_id', '__v', 'requestKey', 'ticketNumber', 'createdAt', 'updatedAt', 'history', 'maintenanceKey', 'recurrenceKey']) delete data[key];
    try {
      const child = await TaskModel.create({ ...data, ticketNumber: await nextTicketNumber(), childKey, parentTask: parent._id, isGroupParent: false, assignmentMode: 'SINGLE', assignee, participants: [], recipientSnapshot: [assignee], initialRecipientSnapshot: [assignee], notificationKeys: [], recurrence: { frequency: 'NONE' },
        status: 'ASSIGNED', revision: 0, submittedAt: null, completedAt: null, approvedAt: null, approvedBy: null, pointsAwarded: 0, approvalTrail: [], submissions: [], archived: false,
        attachments: parent.attachments.filter((file) => file.purpose === 'REFERENCE').map((file) => file.toObject()), checklist: parent.checklist.map((item) => ({ text: item.text, checked: false })),
        execution: { ...data.execution, diagnosis: '', actionTaken: '', testResult: '', customerSignature: '', signatureUnavailableReason: '', workMinutes: 0, travelMinutes: 0 },
        history: [history(actor, 'إنشاء مهمة مستقلة', idOf(parent))] });
      await notifyOnce(child, 'creation', actor, 'تكليف مستقل جديد');
    }
    catch (error) { if (error.code !== 11000) throw error; }
  }
}
export async function notifyOnce(task, key, actor, label) {
  const claimed = await TaskModel.updateOne({ _id: task._id, notificationKeys: { $ne: key } }, { $addToSet: { notificationKeys: key } });
  if (claimed.modifiedCount) await notify(task, actor, label);
}
export async function syncGroupParent(taskId, actor) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const parent = await TaskModel.findById(taskId);
    if (!parent?.isGroupParent) return;
    const children = await TaskModel.find({ parentTask: parent._id, childKey: { $in: parent.recipientSnapshot.map((userId) => `${parent._id}:${userId}`) } }).select('status');
    if (!children.length || children.length !== parent.recipientSnapshot.length) return;
    const complete = children.every((child) => child.status === 'APPROVED'), closed = children.every((child) => terminalStatuses.includes(child.status));
    const status = complete ? 'APPROVED' : closed ? 'CANCELLED' : children.some((child) => !['ASSIGNED', 'TODO'].includes(child.status)) ? 'IN_PROGRESS' : 'ASSIGNED';
    if (status === parent.status) return;
    const result = await TaskModel.updateOne({ _id: parent._id, revision: parent.revision }, { $set: { status, completedAt: complete ? new Date() : null, approvedAt: complete ? new Date() : null }, $inc: { revision: 1 }, $push: { history: history(actor, 'تحديث تقدم التكليف', '', { status: parent.status }, { status }) } });
    if (result.modifiedCount) return;
  }
}
export async function details(actor, taskId) {
  const task = await ensureTask(actor, taskId);
  if (task.isGroupParent) { await ensureChildren(task, { id: idOf(task.assignedBy), fullName: '' }); await syncGroupParent(taskId, actor); }
  const doc = await TaskModel.findById(taskId).populate('assignee reviewer assignedBy participants', 'fullName department active').populate('approvalTrail.approver comments.author comments.mentions submissions.submittedBy', 'fullName role active').populate('project', 'name code').populate('customer', 'name sites').populate('supplier', 'supplierName name companyName').lean();
  const children = await TaskModel.find({ $and: [{ parentTask: taskId }, await accessFilter(actor)] }).select('title ticketNumber status assignee dueDate').populate('assignee', 'fullName active').lean();
  const counts = task.isGroupParent ? await TaskModel.aggregate([{ $match: { parentTask: task._id, childKey: { $in: task.recipientSnapshot.map((userId) => `${task._id}:${userId}`) } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]) : [];
  const total = counts.reduce((sum, c) => sum + c.count, 0), completed = counts.find((c) => c._id === 'APPROVED')?.count || 0;
  const publicAttachments = (doc.attachments || []).map(({ storageName, ...a }) => ({ ...a, downloadUrl: `/tasks/${taskId}/attachments/${a._id}` }));
  const [linkedMaterials, linkedPurchases] = await Promise.all([MaterialRequestModel.find({ ticket: taskId }).select('requestNo status').lean(), PurchaseRequestModel.find({ ticket: taskId }).select('requestNo status').lean()]);
  return { ...doc, attachments: publicAttachments, children, linkedMaterials, linkedPurchases, groupProgress: { total, completed }, overdue: overdue(doc), capabilities: { manage: await canManage(actor, task), execute: !task.isGroupParent && canExecute(actor, task), submit: !task.isGroupParent && idOf(task.assignee) === actor.id, review: !task.isGroupParent && canReview(actor, task), reopen: !task.isGroupParent && hasPermission(actor, Permission.REOPEN_TASKS), archive: await canManage(actor, task) } };
}
export async function approveMaintenance(task) {
  if (!task.maintenancePlan || task.status !== 'APPROVED') return;
  const plan = await MaintenancePlanModel.findById(task.maintenancePlan);
  if (!plan) throw new AppError('خطة الصيانة المرتبطة غير موجودة', 409);
  const scheduled = plan.scheduledVisits.find((v) => v.id === task.scheduledVisitId);
  if (!scheduled) throw new AppError('استحقاق الصيانة المرتبط غير موجود', 409);
  // Stable _id and ticket index make report creation recoverable and idempotent.
  const visitId = task.maintenanceVisit || new mongoose.Types.ObjectId();
  const updated = await TaskModel.findOneAndUpdate({ _id: task._id, maintenanceVisit: null }, { $set: { maintenanceVisit: visitId } }, { new: true });
  const finalVisitId = updated?.maintenanceVisit || (await TaskModel.findById(task._id)).maintenanceVisit;
  const e = task.execution || {};
  const previous = await MaintenanceVisitModel.findById(finalVisitId).select('ticketApprovedAt');
  if (!previous || Number(previous.ticketApprovedAt) !== Number(task.approvedAt)) await MaintenanceVisitModel.updateOne({ _id: finalVisitId }, { $set: {
    ticket: task._id, ticketApprovedAt: task.approvedAt, maintenancePlan: plan._id, scheduledVisitId: task.scheduledVisitId, visitDate: e.visitDate || task.submittedAt || task.approvedAt || new Date(),
    technician: task.assignee, technicianName: (await UserModel.findById(task.assignee).select('fullName'))?.fullName || '',
    visitType: plan.maintenanceType, workDone: `${e.diagnosis || ''}\n${e.actionTaken || ''}`, deviceStatus: e.testResult || '', recommendations: e.recommendations || '', notes: e.materialsUsed || '',
    customerSignature: e.customerSignature || '', approvalText: e.signatureUnavailableReason || '', createdBy: task.assignedBy,
  } }, { upsert: true });
  // Do not change the original schedule dates. The existing scheduling policy
  // selects the next original uncompleted visit, preserving lateness history.
  await MaintenancePlanModel.updateOne({ _id: plan._id, scheduledVisits: { $elemMatch: { id: scheduled.id, completedAt: null } } }, { $set: { 'scheduledVisits.$.completedAt': task.approvedAt || new Date(), 'scheduledVisits.$.visitReport': finalVisitId } });
  const fresh = await MaintenancePlanModel.findById(plan._id);
  const summary = summarizeMaintenancePlan(fresh.toObject());
  await MaintenancePlanModel.updateOne({ _id: plan._id, updatedAt: fresh.updatedAt }, { $set: { completedVisits: summary.completedVisits, remainingVisits: summary.remainingVisits, nextVisitDate: summary.nextVisitDate, lastVisitDate: summary.lastVisitDate, status: summary.status } });
}
export async function syncTicketReport(task) {
  if (task.status !== 'APPROVED' || task.isGroupParent) return;
  if (task.maintenancePlan) return approveMaintenance(task);
  if (!task.technicalRequired) return;
  const previous = await MaintenanceReportModel.findById(task._id).select('approvedAt');
  if (previous && Number(previous.approvedAt) === Number(task.approvedAt)) {
    if (!task.maintenanceReport) await TaskModel.updateOne({ _id: task._id }, { $set: { maintenanceReport: task._id } });
    return;
  }
  const e = task.execution || {}, user = await UserModel.findById(task.assignee).select('fullName role employeeCode').lean();
  const project = task.project ? await mongoose.model('Project').findById(task.project).select('name code').lean() : null;
  await MaintenanceReportModel.updateOne({ _id: task._id }, { $set: {
    ticket: task._id, requestNo: `TKR-${task.ticketNumber || task._id}`, customerName: task.customerName || 'غير مسجل', siteLocation: e.location || task.branch || 'غير مسجل', phone: e.contactPhone || 'غير مسجل', projectNumber: project?.code || 'غير مرتبط بمشروع',
    description: task.description || task.title, status: 'APPROVED', createdBy: task.assignedBy, assignedEmployee: task.assignee, assignedEmployeeName: user?.fullName || '', assignedEmployeeRole: user?.role || '', assignedEmployeeCode: user?.employeeCode || '', managerReviewer: task.approvedBy,
    visitInfo: { siteName: task.branch || '', siteAddress: e.location || '', visitDate: e.visitDate || task.completedAt, technicianName: user?.fullName || '' },
    maintenanceTypes: ['EMERGENCY'], inspectedDevices: [{ device: e.device || '', model: e.model || '', condition: 'GOOD', notes: `${e.serial || ''}\n${e.testResult || ''}` }], performedActions: [e.actionTaken || ''], detectedIssues: [{ sequenceNo: 1, issue: e.diagnosis || e.fault || '', severity: 'MEDIUM', proposedSolution: e.actionTaken || '' }], usedMaterials: e.materialsUsed ? [{ material: e.materialsUsed, quantity: '', notes: e.replacedParts || '' }] : [], recommendations: [e.recommendations || ''], points: 0, completedAt: task.completedAt, approvedAt: task.approvedAt,
    managerReview: { action: 'APPROVE', reviewedBy: task.approvedBy, reviewedAt: task.approvedAt, notes: 'مولّد من تذكرة معتمدة؛ التنفيذ والمرفقات محفوظة في التذكرة الأصلية' },
  } }, { upsert: true });
  await TaskModel.updateOne({ _id: task._id }, { $set: { maintenanceReport: task._id } });
}
export async function dueVisits(actor, query = {}) {
  if (!hasPermission(actor, Permission.VIEW_MAINTENANCE_PLANS) && !isManager(actor)) throw new AppError('غير مخول بعرض الصيانات', 403);
  const ids = await managedIds(actor);
  const filter = isGlobal(actor) ? {} : { $or: [{ createdBy: actor.id }, { assignedEmployee: { $in: ids || [actor.id] } }] };
  const plans = await MaintenancePlanModel.find(filter).lean();
  const tickets = await TaskModel.find({ maintenancePlan: { $in: plans.map((p) => p._id) }, maintenanceKey: { $type: 'string' } }).select('_id maintenanceKey status assignee').lean();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const day = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d));
  const rows = [];
  for (const plan of plans) for (const visit of plan.scheduledVisits || []) {
    if (plan.status !== 'ACTIVE' && !visit.completedAt) continue;
    const ticket = tickets.find((t) => t.maintenanceKey === `${plan._id}:${visit.id}`);
    const category = visit.completedAt ? 'COMPLETED' : ticket && ticket.status !== 'CANCELLED' ? 'TICKETED' : day(visit.scheduledDate) < today ? 'OVERDUE' : day(visit.scheduledDate) === today ? 'TODAY' : 'UPCOMING';
    rows.push({ key: `${plan._id}:${visit.id}`, planId: idOf(plan), visitId: visit.id, scheduledDate: visit.scheduledDate, customerName: plan.customerName, location: plan.location, projectName: plan.projectName, maintenanceType: plan.maintenanceType, assignedEmployee: plan.assignedEmployee, category, ticketId: ticket ? idOf(ticket) : null, completedAt: visit.completedAt });
  }
  return rows.filter((row) => !query.category || row.category === query.category).sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate));
}
export async function createMaintenanceTickets(actor, body) {
  if (!isManager(actor)) throw new AppError('غير مخول بإنشاء تكليفات الصيانة', 403);
  const selected = Array.isArray(body.visits) ? body.visits : [];
  if (!selected.length || selected.length > 100) throw new AppError('حدد من 1 إلى 100 استحقاق', 400);
  const available = await dueVisits(actor);
  const ids = await recipients(actor, body);
  const results = [];
  for (const [index, selectedKey] of [...new Set(selected)].entries()) {
    const row = available.find((r) => r.key === selectedKey);
    if (!row || row.completedAt) throw new AppError('استحقاق غير متاح أو منفذ مسبقًا', 409);
    const existing = await TaskModel.findOne({ maintenanceKey: row.key });
    if (existing) { results.push({ id: idOf(existing), existing: true }); continue; }
    const plan = await MaintenancePlanModel.findById(row.planId).lean();
    const customer = mongoose.isValidObjectId(plan.customerId) ? await CustomerModel.findById(plan.customerId).select('sites mapUrl address phone contactPersons').lean() : null;
    const site = customer?.sites?.find((s) => s.name === plan.branch || idOf(s) === plan.branch);
    const lastReport = await MaintenanceVisitModel.findOne({ maintenancePlan: plan._id }).sort({ visitDate: -1 }).select('_id visitDate workDone recommendations').lean();
    const task = await createTicket(actor, {
      ...body, requestKey: `maintenance-${row.key.replace(':', '-')}`, ticketType: 'PERIODIC', recipientMode: 'SINGLE', assignmentMode: 'SINGLE', assignee: ids[index % ids.length],
      title: `متابعة صيانة — ${plan.customerName} — ${plan.location || plan.projectName || ''}`, description: plan.notes || '', dueDate: row.scheduledDate,
      project: idOf(plan.project) || undefined, customer: mongoose.isValidObjectId(plan.customerId) ? plan.customerId : undefined,
      checklist: (plan.checklist || []).map((text) => ({ text })),
      execution: { contactName: site?.managerName || customer?.contactPersons?.find((person) => person.isTechnical)?.name || '', contactPhone: site?.managerPhone || plan.phone || customer?.phone || '', location: site?.address || plan.location || customer?.address || '', mapUrl: site?.mapUrl || customer?.mapUrl || '', device: plan.deviceDetails || '', coverage: plan.maintenanceType === 'FREE' ? 'WARRANTY' : 'CONTRACT' }, recurrence: { frequency: 'NONE' },
    }, {
      maintenancePlan: plan._id, scheduledVisitId: row.visitId, maintenanceKey: row.key, customerName: plan.customerName, branch: plan.branch || '',
      maintenanceSnapshot: { customerName: plan.customerName, branch: plan.branch, contractReference: plan.contractReference, deviceDetails: plan.deviceDetails, checklist: plan.checklist, location: plan.location, projectName: plan.projectName, notes: plan.notes, maintenanceType: plan.maintenanceType, originalScheduledDate: row.scheduledDate, workReport: plan.workReport, lastReport },
    });
    results.push({ id: idOf(task), existing: false });
  }
  return results;
}
