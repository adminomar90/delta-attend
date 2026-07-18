import { MaterialsRepository } from '../../infrastructure/db/repositories/MaterialsRepository.js';
import { ProjectRepository } from '../../infrastructure/db/repositories/ProjectRepository.js';
import { auditService } from '../../application/services/auditService.js';
import { AppError, asyncHandler } from '../../shared/errors.js';
import { UserModel } from '../../infrastructure/db/models/UserModel.js';
import { UserRepository } from '../../infrastructure/db/repositories/UserRepository.js';
import { adjustOnHandStock, roundQty } from './materialsCommon.js';
import { resolvePermissions } from '../../shared/permissions.js';
import { Permission } from '../../shared/constants.js';
import { notificationService } from '../../application/services/notificationService.js';
import { sequenceService } from '../../application/services/sequenceService.js';
import { resolveManagedUserIds } from '../../shared/accessScope.js';

const repository = new MaterialsRepository();
const projectRepository = new ProjectRepository();
const userRepository = new UserRepository();
const n = (value) => Number(value || 0);
const idOf = (value) => String(value?._id || value || '');

const canAccessAllProjectCustodies = (req) => (
  req.user.role === 'GENERAL_MANAGER'
  || resolvePermissions(req.user).includes(Permission.MANAGE_MATERIAL_INVENTORY)
);

const projectUserIds = (project) => [
  idOf(project?.owner),
  idOf(project?.projectManager),
  ...(project?.teamMembers || []).map(idOf),
].filter(Boolean);

const resolveProjectCustodyScopeIds = async (req) => {
  if (canAccessAllProjectCustodies(req)) return null;
  const managed = await resolveManagedUserIds({
    userRepository,
    actorId: req.user.id,
    actorRole: req.user.role,
  });
  return new Set([String(req.user.id), ...(Array.isArray(managed) ? managed.map(String) : [])]);
};

const isProjectInScope = (project, allowedIds) => (
  allowedIds === null || projectUserIds(project).some((id) => allowedIds.has(id))
);

const assertProjectCustodyScope = async (req, project) => {
  const allowedIds = await resolveProjectCustodyScopeIds(req);
  if (!isProjectInScope(project, allowedIds)) {
    throw new AppError('لا تملك صلاحية الاطلاع على ذمة هذا المشروع', 403);
  }
};

const totalsOf = (custodies = []) => custodies.reduce((totals, custody) => {
  for (const item of custody.items || []) {
    totals.lines += 1;
    totals.issued += n(item.receivedQty);
    totals.used += n(item.consumedQty);
    totals.returned += n(item.returnedQty);
    totals.damaged += n(item.damagedQty);
    totals.lost += n(item.lostQty);
    totals.remaining += n(item.remainingQty);
    totals.value += n(item.receivedQty) * n(item.material?.estimatedUnitCost);
  }
  return totals;
}, { lines: 0, issued: 0, used: 0, returned: 0, damaged: 0, lost: 0, remaining: 0, value: 0 });

const statusOf = (custodies, totals) => {
  if (!custodies.length) return 'NO_MATERIALS';
  if (custodies.every((item) => item.status === 'CLOSED')) return 'CLOSED';
  if (totals.damaged + totals.lost > 0) return 'ATTENTION';
  if (custodies.some((item) => ['PARTIALLY_RECONCILED', 'FULLY_RECONCILED'].includes(item.status))) return 'PARTIAL';
  if (totals.remaining > 0) return 'ACTIVE';
  return 'OPEN';
};

const summaryOf = (project, custodies) => {
  const totals = totalsOf(custodies);
  const technicians = new Map();
  custodies.forEach((custody) => {
    const holder = custody.holder;
    if (holder) technicians.set(idOf(holder), holder.fullName || holder.employeeCode || '-');
    (custody.items || []).forEach((item) => {
      const technician = item.assignedTechnician;
      if (technician) technicians.set(idOf(technician), technician.fullName || technician.employeeCode || '-');
    });
  });
  const dates = custodies.flatMap((custody) => [custody.updatedAt, custody.openedAt, ...(custody.dispatchNotes || []).map((note) => note.deliveredAt)]).filter(Boolean);
  return {
    project,
    custodyStatus: statusOf(custodies, totals),
    custodiesCount: custodies.length,
    technicians: [...technicians.entries()].map(([id, name]) => ({ id, name })),
    techniciansCount: technicians.size,
    lastMovementAt: dates.length ? new Date(Math.max(...dates.map((date) => new Date(date).getTime()))) : null,
    totals,
  };
};

export const listProjectCustodies = asyncHandler(async (req, res) => {
  const [custodies, allProjects] = await Promise.all([repository.listCustodies({ project: { $ne: null } }, { limit: 5000 }), projectRepository.list({})]);
  const groups = new Map();
  custodies.forEach((custody) => {
    const project = custody.project;
    if (!project) return;
    const key = idOf(project);
    if (!groups.has(key)) groups.set(key, { project, custodies: [] });
    groups.get(key).custodies.push(custody);
  });
  allProjects.forEach((project) => {
    const key = idOf(project);
    if (groups.has(key)) groups.get(key).project = project;
    else groups.set(key, { project, custodies: [] });
  });
  let projects = [...groups.values()].map(({ project, custodies: rows }) => summaryOf(project, rows));
  const allowedProjectUserIds = await resolveProjectCustodyScopeIds(req);
  projects = projects.filter((row) => isProjectInScope(row.project, allowedProjectUserIds));
  const permissions = resolvePermissions(req.user);
  const canViewCosts = permissions.includes(Permission.VIEW_PROJECT_CUSTODY_COST) || permissions.includes(Permission.VIEW_MATERIAL_REPORTS) || permissions.includes(Permission.MANAGE_MATERIAL_INVENTORY);
  if (!canViewCosts) projects = projects.map((row) => ({ ...row, totals: { ...row.totals, value: null } }));
  const search = String(req.query.search || '').trim().toLowerCase();
  if (search) projects = projects.filter((row) => [row.project?.name, row.project?.code, row.project?.clientName].some((value) => String(value || '').toLowerCase().includes(search)));
  if (req.query.status) projects = projects.filter((row) => row.custodyStatus === req.query.status);
  if (req.query.technicianId) projects = projects.filter((row) => row.technicians.some((item) => item.id === String(req.query.technicianId)));
  res.json({ projects, totals: { projects: projects.length, open: projects.filter((row) => row.custodyStatus !== 'CLOSED').length, value: canViewCosts ? projects.reduce((sum, row) => sum + n(row.totals.value), 0) : null } });
});

export const getProjectCustody = asyncHandler(async (req, res) => {
  const [custodies, projectRecord] = await Promise.all([repository.listCustodies({ project: req.params.projectId }, { limit: 1000 }), projectRepository.findById(req.params.projectId)]);
  if (!projectRecord && !custodies.length) throw new AppError('المشروع غير موجود', 404);
  const project = projectRecord || custodies[0].project;
  await assertProjectCustodyScope(req, project);
  const items = custodies.flatMap((custody) => (custody.items || []).map((item) => {
    const dispatch = (custody.dispatchNotes || []).find((note) => (note.items || []).some((line) => idOf(line.material) === idOf(item.material))) || custody.dispatchNotes?.[0];
    return {
      custodyId: custody._id,
      custodyNo: custody.custodyNo,
      custodyStatus: custody.status,
      itemId: item._id,
      material: item.material,
      materialName: item.materialName || item.material?.name,
      unit: item.unit || item.material?.unit,
      receivedQty: n(item.receivedQty), consumedQty: n(item.consumedQty), returnedQty: n(item.returnedQty),
      damagedQty: n(item.damagedQty), lostQty: n(item.lostQty), remainingQty: n(item.remainingQty),
      holder: custody.holder,
      assignedTechnician: item.assignedTechnician || null,
      requestNo: custody.request?.requestNo || '',
      dispatchNo: dispatch?.dispatchNo || '',
      deliveredBy: dispatch?.deliveredBy || null,
      deliveredAt: dispatch?.deliveredAt || custody.openedAt,
      notes: item.notes || '', lineStatus: item.lineStatus,
    };
  }));
  res.json({ summary: summaryOf(project, custodies), custodies, items });
});

export const closeProjectCustody = asyncHandler(async (req, res) => {
  const reason = String(req.body.reason || '').trim();
  if (!reason) throw new AppError('سبب الإغلاق مطلوب', 400);
  const custodies = await repository.listCustodies({ project: req.params.projectId }, { limit: 1000 });
  if (!custodies.length) throw new AppError('لا توجد ذمة للمشروع', 404);
  const unresolved = custodies.some((custody) => (custody.items || []).some((item) => n(item.consumedQty) + n(item.returnedQty) + n(item.damagedQty) + n(item.lostQty) < n(item.receivedQty)));
  if (unresolved) throw new AppError('لا يمكن إغلاق ذمة المشروع قبل تسوية جميع المواد', 409);
  const updated = [];
  for (const custody of custodies) updated.push(await repository.updateCustodyById(custody._id, { status: 'CLOSED', closedAt: new Date(), isOverdue: false, notes: [custody.notes, `إغلاق ذمة المشروع: ${reason}`].filter(Boolean).join('\n') }));
  await auditService.log({ actorId: req.user.id, action: 'PROJECT_CUSTODY_CLOSED', entityType: 'PROJECT', entityId: req.params.projectId, before: { custodies: custodies.map((item) => ({ id: item._id, status: item.status })) }, after: { status: 'CLOSED', reason }, req });
  res.json({ custodies: updated });
});

export const reopenProjectCustody = asyncHandler(async (req, res) => {
  const reason = String(req.body.reason || '').trim();
  if (!reason) throw new AppError('سبب إعادة الفتح مطلوب', 400);
  const custodies = await repository.listCustodies({ project: req.params.projectId, status: 'CLOSED' }, { limit: 1000 });
  if (!custodies.length) throw new AppError('لا توجد ذمة مغلقة لإعادة فتحها', 404);
  const updated = [];
  for (const custody of custodies) updated.push(await repository.updateCustodyById(custody._id, { status: 'PARTIALLY_RECONCILED', closedAt: null, $push: { revisions: { action: 'REOPEN', reason, actor: req.user.id, actorName: req.user.fullName || '', at: new Date() } } }));
  await auditService.log({ actorId: req.user.id, action: 'PROJECT_CUSTODY_REOPENED', entityType: 'PROJECT', entityId: req.params.projectId, before: { status: 'CLOSED' }, after: { status: 'PARTIALLY_RECONCILED', reason }, req });
  res.json({ custodies: updated });
});

export const updateProjectCustodyItem = asyncHandler(async (req, res) => {
  const action = String(req.body.action || 'ADJUST').trim().toUpperCase();
  const actionPermission = { ADJUST: Permission.ADJUST_PROJECT_CUSTODY, CANCEL: Permission.CANCEL_PROJECT_CUSTODY_ITEM, TRANSFER_TECHNICIAN: Permission.TRANSFER_PROJECT_CUSTODY_TECHNICIAN, UNASSIGN_TECHNICIAN: Permission.TRANSFER_PROJECT_CUSTODY_TECHNICIAN, TRANSFER_PROJECT: Permission.TRANSFER_PROJECT_CUSTODY_PROJECT }[action];
  const permissions = resolvePermissions(req.user);
  if (!permissions.includes(Permission.MANAGE_MATERIAL_INVENTORY) && (!actionPermission || !permissions.includes(actionPermission))) throw new AppError('لا تملك صلاحية تنفيذ هذه العملية', 403);
  const reason = String(req.body.reason || '').trim();
  const note = String(req.body.note || req.body.notes || '').trim();
  if (!reason || !note) throw new AppError('سبب العملية والملاحظة إلزاميان', 400);
  const custody = await repository.findCustodyById(req.params.custodyId);
  if (!custody || idOf(custody.project) !== String(req.params.projectId)) throw new AppError('سجل الذمة غير موجود', 404);
  if (custody.status === 'CLOSED') throw new AppError('لا يمكن تعديل ذمة مغلقة', 409);
  const line = custody.items.id(req.params.itemId);
  if (!line) throw new AppError('المادة غير موجودة في الذمة', 404);
  const before = line.toObject();
  const dispatch = custody.dispatchNotes?.[0];
  const warehouseId = idOf(dispatch?.warehouse);
  let stockDelta = 0;
  let transferredCustody = null;

  if (action === 'ADJUST') {
    if (req.body.quantity === undefined || req.body.quantity === null || req.body.quantity === '') throw new AppError('الكمية الجديدة مطلوبة', 400);
    const nextQty = roundQty(req.body.quantity);
    const accounted = roundQty(n(line.consumedQty) + n(line.returnedQty) + n(line.damagedQty) + n(line.lostQty));
    if (nextQty < accounted || nextQty < 0) throw new AppError(`الكمية الجديدة لا يمكن أن تقل عن الكمية المسواة (${accounted})`, 409);
    const delta = roundQty(nextQty - n(line.receivedQty));
    if (delta && !warehouseId) throw new AppError('لا يمكن تعديل الكمية لعدم وجود مخزن مرتبط بسند الصرف', 409);
    stockDelta = -delta;
    line.receivedQty = nextQty;
    line.remainingQty = roundQty(Math.max(0, nextQty - accounted));
    line.lineStatus = line.remainingQty > 0 ? 'PARTIAL' : 'RECONCILED';
  } else if (action === 'TRANSFER_TECHNICIAN') {
    const technicianId = String(req.body.technicianId || '').trim();
    const technician = technicianId ? await UserModel.findById(technicianId).select('_id fullName active') : null;
    if (!technician || technician.active === false) throw new AppError('الفني المحدد غير موجود أو غير فعال', 404);
    line.assignedTechnician = technician._id;
  } else if (action === 'UNASSIGN_TECHNICIAN') {
    line.assignedTechnician = null;
  } else if (action === 'TRANSFER_PROJECT') {
    const targetProjectId = String(req.body.targetProjectId || '').trim();
    const quantity = roundQty(req.body.quantity);
    const targetProject = targetProjectId ? await projectRepository.findById(targetProjectId) : null;
    if (!targetProject || targetProjectId === String(req.params.projectId)) throw new AppError('اختر مشروعاً آخر صالحاً', 400);
    if (quantity <= 0 || quantity > n(line.remainingQty)) throw new AppError(`كمية النقل يجب أن تكون بين 0 و${line.remainingQty}`, 409);
    line.receivedQty = roundQty(n(line.receivedQty) - quantity);
    line.remainingQty = roundQty(n(line.remainingQty) - quantity);
    line.lineStatus = line.remainingQty > 0 ? 'PARTIAL' : 'RECONCILED';
    const dispatchNo = await sequenceService.next('MATERIAL_DISPATCH', { prefix: 'DN', digits: 5 });
    const dispatch = await repository.createDispatch({ dispatchNo, request: idOf(custody.request), project: targetProject._id, recipient: idOf(line.assignedTechnician) || idOf(custody.holder) || null, deliveredBy: req.user.id, preparedBy: req.user.id, warehouse: warehouseId || null, deliveredAt: new Date(), confirmationMethod: 'CHECKBOX', status: 'CONFIRMED', custodyType: idOf(line.assignedTechnician) || idOf(custody.holder) ? 'BOTH' : 'PROJECT', notes: `${reason} - ${note}`, items: [{ material: idOf(line.material), materialName: line.materialName, unit: line.unit, deliveredQty: quantity, conditionAtDelivery: 'TRANSFERRED', notes: note }] });
    const custodyNo = await sequenceService.next('MATERIAL_CUSTODY', { prefix: 'CU', digits: 5 });
    transferredCustody = await repository.createCustody({ custodyNo, request: idOf(custody.request), project: targetProject._id, holder: idOf(line.assignedTechnician) || idOf(custody.holder) || null, custodyType: idOf(line.assignedTechnician) || idOf(custody.holder) ? 'BOTH' : 'PROJECT', openedAt: new Date(), status: 'OPEN', dispatchNotes: [dispatch._id], notes: `منقولة من ${custody.custodyNo}: ${reason}`, items: [{ material: idOf(line.material), materialName: line.materialName, assignedTechnician: idOf(line.assignedTechnician) || idOf(custody.holder) || null, unit: line.unit, receivedQty: quantity, consumedQty: 0, remainingQty: quantity, returnedQty: 0, damagedQty: 0, lostQty: 0, lineStatus: 'OPEN', notes: note }] });
  } else if (action === 'CANCEL') {
    const accounted = roundQty(n(line.consumedQty) + n(line.returnedQty) + n(line.damagedQty) + n(line.lostQty));
    if (accounted > 0) throw new AppError('لا يمكن إلغاء مادة بدأت تسويتها؛ استخدم التسوية أو الإرجاع', 409);
    if (!warehouseId) throw new AppError('لا يمكن إلغاء الصرف لعدم وجود مخزن مرتبط', 409);
    stockDelta = n(line.receivedQty);
    line.receivedQty = 0; line.remainingQty = 0; line.lineStatus = 'CANCELLED'; line.cancelledAt = new Date(); line.cancelledBy = req.user.id; line.cancellationReason = reason;
  } else throw new AppError('نوع العملية غير مدعوم', 400);

  if (stockDelta) await adjustOnHandStock({ materialId: idOf(line.material), warehouseId, qtyDelta: stockDelta, avgCost: n(line.material?.estimatedUnitCost), transactionType: 'ADJUSTMENT', projectId: req.params.projectId, requestId: idOf(custody.request), referenceType: 'PROJECT_CUSTODY_REVISION', referenceId: custody.custodyNo, notes: `${reason} - ${note}`, actorId: req.user.id });
  line.notes = [line.notes, note].filter(Boolean).join('\n');
  const revision = { action, itemId: line._id, materialId: idOf(line.material), before, after: line.toObject(), reason, note, actor: req.user.id, actorName: req.user.fullName || '', at: new Date() };
  const updated = await repository.updateCustodyById(custody._id, { items: custody.items.map((item) => item.toObject()), $push: { revisions: revision } });
  await auditService.log({ actorId: req.user.id, action: `PROJECT_CUSTODY_${action}`, entityType: 'MATERIAL_CUSTODY', entityId: custody._id, before, after: revision.after, req });
  const recipients = [...new Set([idOf(custody.holder), idOf(line.assignedTechnician), idOf(custody.project?.projectManager), idOf(custody.project?.owner)].filter(Boolean))];
  for (const recipientId of recipients) await notificationService.notifySystem(recipientId, 'تحديث ذمة مشروع', `تم تنفيذ عملية ${action} على المادة ${line.materialName || line.material?.name || ''} في الذمة ${custody.custodyNo}.`, { custodyId: String(custody._id), projectId: req.params.projectId, action });
  res.json({ custody: updated, revision, transferredCustody });
});
