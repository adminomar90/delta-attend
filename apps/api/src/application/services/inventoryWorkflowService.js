import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { MaterialRequestModel as Request } from '../../infrastructure/db/models/MaterialRequestModel.js';
import { MaterialCustodyModel as Custody } from '../../infrastructure/db/models/MaterialCustodyModel.js';
import { MaterialReconciliationModel as Reconciliation } from '../../infrastructure/db/models/MaterialReconciliationModel.js';
import { MaterialDispatchModel as Dispatch } from '../../infrastructure/db/models/MaterialDispatchModel.js';
import { MaterialReturnReceiptModel as ReturnReceipt } from '../../infrastructure/db/models/MaterialReturnReceiptModel.js';
import { StockBalanceModel as Balance } from '../../infrastructure/db/models/StockBalanceModel.js';
import { StockTransactionModel as Movement } from '../../infrastructure/db/models/StockTransactionModel.js';
import { WarehouseModel as Warehouse } from '../../infrastructure/db/models/WarehouseModel.js';
import { MaterialModel as Material } from '../../infrastructure/db/models/MaterialModel.js';
import { UserModel as User } from '../../infrastructure/db/models/UserModel.js';
import { sequenceService } from './sequenceService.js';
import { Permission } from '../../shared/constants.js';
import { hasPermission } from '../../shared/permissions.js';
import { AppError } from '../../shared/errors.js';

const id = (value) => String(value?._id || value || '');
const q = (value) => Number(Number(value || 0).toFixed(4));
const plain = (value) => value?.toObject ? value.toObject() : value;
const fail = (message, code = 409) => { throw new AppError(message, code); };
const positive = (value) => { const n = Number(value); if (!Number.isFinite(n) || n <= 0) fail('الكمية يجب أن تكون رقماً أكبر من صفر', 400); return q(n); };
const event = (actor, action, details = {}) => ({ actor: actor.id, action, at: new Date(), ...details });
export const isWarehouseOperator = (user) => user?.role === 'GENERAL_MANAGER' || user?.role === 'WAREHOUSE_KEEPER' || hasPermission(user, Permission.MANAGE_MATERIAL_INVENTORY);
const storekeeper = (user) => { if (!isWarehouseOperator(user)) fail('هذه العملية لأمين المخزن حصراً', 403); };
const recipientId = (request) => id(request.requestedFor || request.requestedBy);
const allDelivered = (request) => request.items.every((line) => q(line.deliveredQty) >= q(line.approvedQty));
const fulfilled = (line) => q(q(line.consumedQty) + q(line.returnedQty) + q(line.damagedQty) + q(line.lostQty)) === q(line.receivedQty)
  && q(line.damagedReturnedQty) >= q(line.damagedQty);
export const workflowCustodyStatus = (items) => items.length && items.every(fulfilled) ? 'CLOSED'
  : items.some((line) => q(line.consumedQty) + q(line.returnedQty) + q(line.damagedQty) + q(line.lostQty) > 0) ? 'PARTIALLY_RECONCILED' : 'OPEN';

// Serializes every stage of one request, including receipts and reconciliation.
// Durable batch IDs and per-stock operation keys allow an interrupted receipt to resume.
const locked = async (requestId, work) => {
  const token = randomUUID();
  const request = await Request.findOneAndUpdate({ _id: requestId, $or: [
    { workflowLock: null }, { 'workflowLock.until': { $lt: new Date() } }, { workflowLock: { $exists: false } },
  ] }, { $set: { workflowLock: { token, until: new Date(Date.now() + 120000) } } }, { new: true });
  if (!request) {
    if (!await Request.exists({ _id: requestId })) fail('الطلب غير موجود', 404);
    fail('توجد عملية على الطلب؛ أعد المحاولة بعد اكتمالها');
  }
  const heartbeat = setInterval(() => Request.updateOne({ _id: requestId, 'workflowLock.token': token }, { $set: { 'workflowLock.until': new Date(Date.now() + 120000) } }).catch(() => {}), 20000);
  heartbeat.unref();
  try { return await work(request); }
  finally { clearInterval(heartbeat); await Request.updateOne({ _id: requestId, 'workflowLock.token': token }, { $set: { workflowLock: null } }); }
};
export { locked as withInventoryRequestLock };

const regularWarehouse = async (warehouseId) => {
  if (!mongoose.isValidObjectId(warehouseId)) fail('اختر المخزن الصالح', 400);
  const warehouse = await Warehouse.findById(warehouseId);
  if (!warehouse || !warehouse.active || warehouse.type === 'DAMAGED') fail('يجب اختيار مخزن صالح وفعال، وليس مخزن التالف', 400);
  return warehouse;
};

const stock = async ({ kind, material, warehouse, quantity, key, reserveKey, actor, request, reference }) => {
  const amount = positive(quantity);
  if (kind === 'return') {
    try { await Balance.updateOne({ material, warehouse }, { $setOnInsert: { material, warehouse, qtyOnHand: 0, qtyReserved: 0 } }, { upsert: true }); }
    catch (error) { if (error.code !== 11000) throw error; }
  }
  const filter = { material, warehouse, appliedOperationKeys: { $ne: key } };
  const update = { $addToSet: { appliedOperationKeys: key } };
  if (kind === 'reserve') { filter.$expr = { $gte: [{ $subtract: ['$qtyOnHand', '$qtyReserved'] }, amount] }; update.$inc = { qtyReserved: amount }; }
  if (kind === 'release') { filter.appliedOperationKeys = { $all: [reserveKey], $ne: key }; filter.qtyReserved = { $gte: amount }; update.$inc = { qtyReserved: -amount }; }
  if (kind === 'issue') { filter.appliedOperationKeys = { $all: [reserveKey], $ne: key }; filter.qtyOnHand = { $gte: amount }; filter.qtyReserved = { $gte: amount }; update.$inc = { qtyOnHand: -amount, qtyReserved: -amount }; }
  if (kind === 'return') update.$inc = { qtyOnHand: amount };
  let balance = await Balance.findOneAndUpdate(filter, update, { new: true });
  if (!balance) {
    balance = await Balance.findOne({ material, warehouse }).select('+appliedOperationKeys');
    if (kind === 'release' && !balance?.appliedOperationKeys.includes(reserveKey)) return;
    if (!balance?.appliedOperationKeys.includes(key)) fail('الرصيد المتاح أو المحجوز لا يكفي للعملية');
  }
  await Movement.updateOne({ operationKey: key }, { $setOnInsert: {
    material, warehouse, request, operationKey: key, performedBy: actor.id,
    transactionType: { reserve: 'RESERVE', release: 'RELEASE', issue: 'OUT', return: 'RETURN_IN' }[kind],
    quantity: amount, quantityDelta: kind === 'issue' ? -amount : kind === 'return' ? amount : 0,
    referenceType: 'INVENTORY_WORKFLOW', referenceId: reference, notes: kind === 'return' ? 'استلام مرتجع بعد اعتماد التصفية' : 'دورة طلب المواد',
  } }, { upsert: true });
};

const pendingReturns = (reconciliation) => reconciliation.items.some((line) => q(line.toReturnQty) > q(line.returnedQtyConfirmed)
  || q(line.damagedToReturnQty) > q(line.damagedReturnedConfirmed));
const assertNoSettlement = async (custodyId) => {
  if (!custodyId) return;
  const records = await Reconciliation.find({ custody: custodyId, status: { $in: ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'] } });
  if (records.some((record) => record.status !== 'APPROVED' || pendingReturns(record))) fail('أكمل التصفية أو استلام المرتجعات الحالية أولاً');
};
const syncRequest = async (request, custody, extra = {}) => {
  const status = !allDelivered(request) ? 'IN_PROGRESS' : custody.status === 'CLOSED' ? 'CLOSED' : 'PENDING_SETTLEMENT';
  await Request.updateOne({ _id: request._id }, { $set: { status, closedAt: status === 'CLOSED' ? new Date() : null, ...extra } });
};

export const reviewInventoryRequest = async (requestId, actor, body) => {
  storekeeper(actor);
  return locked(requestId, async (request) => {
    if (!['PENDING_MANAGER_APPROVAL', 'NEW', 'UNDER_REVIEW'].includes(request.status)) fail('يجب إعادة تقديم الطلب المرفوض؛ ولا يمكن تغيير الاعتماد بعد بدء التجهيز');
    if (recipientId(request) === id(actor.id)) fail('لا يجوز اعتماد طلب مواد على ذمتك الشخصية', 403);
    const action = String(body.action || 'APPROVE_FULL').toUpperCase();
    if (!['APPROVE_FULL', 'APPROVE_PARTIAL', 'MODIFY', 'REJECT'].includes(action)) fail('إجراء الاعتماد غير صالح', 400);
    if (action === 'REJECT' && !String(body.notes || body.comment || body.rejectReason || '').trim()) fail('سبب رفض الطلب مطلوب', 400);
    const inputs = new Map((body.items || []).map((line) => [id(line.materialId || line.material), line]));
    const items = request.items.map((line) => {
      const amount = action === 'REJECT' ? 0 : action === 'APPROVE_FULL' ? q(line.requestedQty) : Number(inputs.get(id(line.material))?.approvedQty ?? line.approvedQty);
      if (!Number.isFinite(amount) || amount < 0 || amount > q(line.requestedQty)) fail('الكمية المعتمدة يجب أن تكون بين صفر والكمية المطلوبة', 400);
      return { ...plain(line), approvedQty: q(amount), lineStatus: amount === 0 ? 'REJECTED' : amount < q(line.requestedQty) ? 'PARTIAL' : 'APPROVED' };
    });
    const rejected = items.every((line) => !line.approvedQty);
    const status = rejected ? 'REJECTED' : 'APPROVED';
    await Request.updateOne({ _id: request._id }, { $set: { items, status, assignedPreparer: actor.id,
      approvalSummary: { approvalType: rejected ? 'REJECTED' : items.some((line) => line.approvedQty < line.requestedQty) ? 'PARTIAL' : 'FULL', approvedBy: actor.id, approvedAt: new Date(), notes: body.notes || body.comment || '' } },
      $push: { workflowEvents: event(actor, 'WAREHOUSE_APPROVAL', { status }) } });
    return { request: await Request.findById(request._id), notice: { userId: recipientId(request), message: rejected ? 'تم رفض طلب المواد' : 'اعتمد أمين المخزن كميات طلبك وبدأ التجهيز' } };
  });
};

const releaseBatch = async (request, batch, actor, rejection = null) => {
  await Request.updateOne({ _id: request._id }, { $set: { 'pendingReceipt.state': rejection ? 'REJECTING' : 'ROLLING_BACK', 'pendingReceipt.rejectNotes': rejection?.notes || '' } });
  for (const line of batch.items) await stock({ kind: 'release', material: line.material, warehouse: batch.warehouse, quantity: line.quantity,
    key: `release:${batch.id}:${line.material}`, reserveKey: `reserve:${batch.id}:${line.material}`, actor, request: request._id, reference: batch.id });
  const amounts = new Map(batch.items.map((line) => [line.material, line.quantity]));
  await Request.updateOne({ _id: request._id }, { $set: { pendingReceipt: null, ...(rejection ? { status: 'IN_PROGRESS', items: request.items.map((line) => ({ ...plain(line), preparedQty: q(line.preparedQty - (amounts.get(id(line.material)) || 0)) })) } : {}) },
    ...(rejection ? { $push: { workflowEvents: event(actor, 'RECEIPT_REJECTED', { notes: rejection.notes }) } } : {}) });
};

export const prepareInventoryRequest = async (requestId, actor, body) => {
  storekeeper(actor);
  return locked(requestId, async (request) => {
    if (['ROLLING_BACK', 'RESERVING'].includes(request.pendingReceipt?.state)) { await releaseBatch(request, request.pendingReceipt, actor); request.pendingReceipt = null; }
    if (request.pendingReceipt?.state === 'READY') fail('الدفعة مجهزة؛ بانتظار قبول الفني للاستلام');
    if (new Set(request.items.map((line) => id(line.material))).size !== request.items.length) fail('الطلب القديم يحتوي بنوداً مكررة؛ صححها قبل التجهيز');
    if (!['APPROVED', 'PENDING_SUPPLIER_APPROVAL', 'IN_PROGRESS', 'RECEIVED', 'PREPARING'].includes(request.status)) fail('الطلب غير معتمد أو غير جاهز للتجهيز');
    if (recipientId(request) === id(actor.id)) fail('لا يمكنك تجهيز مواد على ذمتك الشخصية', 403);
    await assertNoSettlement(request.custodyRef);
    const warehouse = await regularWarehouse(body.warehouseId || id(request.warehouse));
    const input = new Map();
    for (const line of body.items || []) {
      const material = id(line.materialId || line.material);
      if (input.has(material)) fail('المادة مكررة في دفعة التجهيز', 400);
      input.set(material, positive(line.preparedQty));
    }
    if (!input.size) fail('اختر مادة وكمية للتجهيز', 400);
    const items = [];
    for (const [material, amount] of input) {
      const line = request.items.find((entry) => id(entry.material) === material);
      if (!line || amount > q(line.approvedQty - line.preparedQty)) fail('كمية التجهيز تتجاوز الكمية المعتمدة المتبقية');
      if (!await Material.exists({ _id: material, active: true })) fail('المادة محذوفة أو مؤرشفة؛ لا يمكن تجهيزها', 409);
      items.push({ material, quantity: amount });
    }
    const batch = { id: randomUUID(), warehouse: id(warehouse), items, state: 'RESERVING', preparedBy: actor.id, at: new Date() };
    await Request.updateOne({ _id: request._id }, { $set: { pendingReceipt: batch } });
    try {
      for (const line of items) await stock({ kind: 'reserve', material: line.material, warehouse: warehouse._id, quantity: line.quantity,
        key: `reserve:${batch.id}:${line.material}`, actor, request: request._id, reference: batch.id });
    } catch (error) { await releaseBatch(request, batch, actor); throw error; }
    const updatedItems = request.items.map((line) => ({ ...plain(line), preparedQty: q(q(line.preparedQty) + (input.get(id(line.material)) || 0)) }));
    await Request.updateOne({ _id: request._id }, { $set: { items: updatedItems, pendingReceipt: { ...batch, state: 'READY' }, status: 'PENDING_RECEIPT', warehouse: warehouse._id },
      $push: { preparations: { preparedBy: actor.id, warehouse: warehouse._id, mode: 'PARTIAL', items: items.map((line) => ({ material: line.material, preparedQty: line.quantity })) }, workflowEvents: event(actor, 'PREPARED_AND_RESERVED', { batchId: batch.id }) } });
    return { request: await Request.findById(request._id), notice: { userId: recipientId(request), message: 'جهز المخزن دفعة مواد وحجزها؛ راجع الكميات ثم أكد الاستلام' } };
  });
};

export const acceptInventoryReceipt = async (requestId, actor, body) => locked(requestId, async (request) => {
  if (recipientId(request) !== id(actor.id)) fail('قبول أو رفض الاستلام للفني المستلم حصراً', 403);
  if (!['PENDING_RECEIPT', 'PREPARED'].includes(request.status)) {
    if (body.receiptToken && request.lastReceiptToken === body.receiptToken) return { request, alreadyApplied: true };
    fail('لا توجد دفعة بانتظار الاستلام');
  }
  let batch = request.pendingReceipt;
  if (batch?.state === 'REJECTING') {
    await releaseBatch(request, batch, actor, { notes: batch.rejectNotes });
    return { request: await Request.findById(request._id), receiptRejected: true };
  }
  if (!batch) {
    // Legacy prepared requests are converted only when their actual recipient accepts.
    const warehouse = await regularWarehouse(body.warehouseId || id(request.warehouse) || id([...request.preparations].reverse().find((entry) => entry.warehouse)?.warehouse));
    const items = request.items.filter((line) => q(line.preparedQty) > q(line.deliveredQty)).map((line) => ({ material: id(line.material), quantity: q(line.preparedQty - line.deliveredQty) }));
    if (!items.length) fail('لا توجد كمية مجهزة للاستلام');
    batch = { id: randomUUID(), warehouse: id(warehouse), items, state: 'RESERVING', preparedBy: id(request.assignedPreparer), legacy: true };
    await Request.updateOne({ _id: request._id }, { $set: { pendingReceipt: batch } });
  }
  if (batch.state === 'RESERVING' && batch.legacy) {
    for (const line of batch.items) await stock({ kind: 'reserve', material: line.material, warehouse: batch.warehouse, quantity: line.quantity, key: `reserve:${batch.id}:${line.material}`, actor, request: request._id, reference: batch.id });
    batch.state = 'READY'; await Request.updateOne({ _id: request._id }, { $set: { pendingReceipt: batch } });
  }
  if (body.receiptToken && body.receiptToken !== batch.id) fail('تغيرت الدفعة؛ حدث الصفحة قبل تأكيد الاستلام');
  if (String(body.action || 'ACCEPT').toUpperCase() === 'REJECT') {
    if (batch.state !== 'READY') fail('بدأ تسجيل الاستلام ولا يمكن إلغاء الدفعة');
    if (!String(body.notes || '').trim()) fail('سبب رفض الاستلام مطلوب', 400);
    await releaseBatch(request, batch, actor, { notes: body.notes });
    return { request: await Request.findById(request._id), receiptRejected: true };
  }
  if (!['READY', 'ISSUING'].includes(batch.state)) fail('أمين المخزن لم يكمل تجهيز الدفعة');
  await assertNoSettlement(request.custodyRef);
  await Request.updateOne({ _id: request._id }, { $set: { 'pendingReceipt.state': 'ISSUING' } });
  const operationKey = `receipt:${id(request)}:${batch.id}`;
  let dispatch = await Dispatch.findOne({ operationKey });
  if (!dispatch) dispatch = await Dispatch.create({ operationKey, dispatchNo: await sequenceService.next('MATERIAL_DISPATCH', { prefix: 'DN' }), request: request._id,
    project: request.project, recipient: actor.id, deliveredBy: batch.preparedBy || request.assignedPreparer || actor.id, preparedBy: batch.preparedBy || request.assignedPreparer,
    warehouse: batch.warehouse, status: 'ISSUED', confirmationMethod: 'EMPLOYEE_CONFIRM',
    items: batch.items.map((item) => { const line = request.items.find((entry) => id(entry.material) === item.material); return { material: item.material, materialName: line.materialName, unit: line.unitSnapshot, deliveredQty: item.quantity }; }) });
  for (const line of batch.items) await stock({ kind: 'issue', material: line.material, warehouse: batch.warehouse, quantity: line.quantity,
    key: `issue:${batch.id}:${line.material}`, reserveKey: `reserve:${batch.id}:${line.material}`, actor, request: request._id, reference: dispatch.dispatchNo });
  let custody = await Custody.findOne({ request: request._id, holder: actor.id });
  if (!custody) custody = await Custody.create({ custodyNo: await sequenceService.next('MATERIAL_CUSTODY', { prefix: 'CU' }), request: request._id, project: request.project,
    manualProjectName: request.manualProjectName, holder: actor.id, custodyType: request.project ? 'BOTH' : 'TECHNICIAN', items: [], status: 'OPEN' });
  if (!custody.appliedReceiptKeys.includes(operationKey)) {
    const items = custody.items.map(plain);
    for (const batchLine of batch.items) {
      let line = items.find((entry) => id(entry.material) === batchLine.material);
      const requested = request.items.find((entry) => id(entry.material) === batchLine.material);
      if (!line) { line = { material: batchLine.material, materialName: requested.materialName, unit: requested.unitSnapshot, assignedTechnician: actor.id, receivedQty: 0, remainingQty: 0, consumedQty: 0, returnedQty: 0, damagedQty: 0, lostQty: 0 }; items.push(line); }
      line.receivedQty = q(q(line.receivedQty) + batchLine.quantity); line.remainingQty = q(q(line.remainingQty) + batchLine.quantity); line.lineStatus = 'OPEN';
    }
    await Custody.updateOne({ _id: custody._id, appliedReceiptKeys: { $ne: operationKey } }, { $set: { items, status: 'OPEN', closedAt: null }, $addToSet: { appliedReceiptKeys: operationKey, dispatchNotes: dispatch._id } });
  }
  const amounts = new Map(batch.items.map((line) => [line.material, line.quantity]));
  const items = request.items.map((line) => ({ ...plain(line), deliveredQty: q(q(line.deliveredQty) + (amounts.get(id(line.material)) || 0)) }));
  const complete = items.every((line) => q(line.deliveredQty) >= q(line.approvedQty));
  await Dispatch.updateOne({ _id: dispatch._id }, { $set: { status: 'CONFIRMED' } });
  await Request.updateOne({ _id: request._id }, { $set: { items, status: complete ? 'PENDING_SETTLEMENT' : 'IN_PROGRESS', pendingReceipt: null, lastReceiptToken: batch.id, dispatchRef: dispatch._id, custodyRef: custody._id }, $push: { workflowEvents: event(actor, 'RECEIPT_CONFIRMED', { batchId: batch.id, dispatchId: dispatch._id, custodyId: custody._id }) } });
  return { request: await Request.findById(request._id), custody: await Custody.findById(custody._id), dispatch, notice: { userId: batch.preparedBy, message: 'أكد الفني استلام الدفعة؛ تم الخصم وتسجيل الذمة' } };
});

export const submitInventoryReconciliation = async (custodyId, actor, body) => {
  const initial = await Custody.findById(custodyId);
  if (!initial) fail('الذمة غير موجودة', 404);
  return locked(initial.request, async (request) => {
    const custody = await Custody.findById(custodyId);
    if (id(custody.holder) !== id(actor.id)) fail('إرسال التصفية للفني صاحب الذمة حصراً', 403);
    if (custody.status === 'CLOSED' || request.pendingReceipt) fail('أكمل الاستلام أولاً؛ الذمة المغلقة لا تقبل تصفية');
    await assertNoSettlement(custodyId);
    const inputs = new Map((body.items || []).map((line) => [id(line.materialId || line.material), line]));
    if (inputs.size !== custody.items.length) fail('يجب إدخال تصفية جميع بنود الذمة', 400);
    const items = custody.items.map((line) => {
      const input = inputs.get(id(line.material)); if (!input) fail('بند الذمة غير موجود في التصفية', 400);
      const consumed = Number(input.consumedQty), damaged = Number(input.damagedQty), lost = Number(input.lostQty);
      if ([consumed, damaged, lost].some((value) => !Number.isFinite(value) || value < 0)) fail('أدخل كميات صحيحة غير سالبة', 400);
      if (consumed < q(line.consumedQty) || damaged < q(line.damagedQty) || lost < q(line.lostQty)) fail('لا يمكن تخفيض كميات سبق اعتمادها');
      const remaining = q(line.receivedQty - consumed - damaged - lost - q(line.returnedQty));
      if (remaining < 0 || (input.remainingQty !== undefined && q(input.remainingQty) !== remaining)) fail('مجموع المستهلك والتالف والمفقود والراجع والمتبقي يجب أن يساوي المستلم');
      const toReturn = input.toReturnQty === undefined ? remaining : Number(input.toReturnQty);
      if (!Number.isFinite(toReturn) || toReturn < 0 || toReturn > remaining) fail('الفائض المراد إرجاعه يتجاوز المتبقي');
      return { custodyItem: line._id, material: line.material, materialName: line.materialName, unit: line.unit, receivedQty: line.receivedQty,
        consumedQty: q(consumed), damagedQty: q(damaged), lostQty: q(lost), remainingQty: remaining, toReturnQty: q(toReturn), returnedQtyConfirmed: 0,
        damagedToReturnQty: q(damaged - q(line.damagedReturnedQty)), damagedReturnedConfirmed: 0, notes: input.notes || '' };
    });
    const reconciliation = await Reconciliation.create({ reconcileNo: await sequenceService.next('MATERIAL_RECONCILIATION', { prefix: 'RC' }), custody: custody._id, request: request._id, project: custody.project,
      submittedBy: actor.id, items, status: 'SUBMITTED', notes: body.notes || '' });
    await Custody.updateOne({ _id: custodyId }, { $set: { status: 'PENDING_RECONCILIATION' } });
    await Request.updateOne({ _id: request._id }, { $set: { status: 'PENDING_RECONCILIATION', reconciliationRef: reconciliation._id }, $push: { workflowEvents: event(actor, 'RECONCILIATION_SUBMITTED', { reconciliationId: reconciliation._id }) } });
    return { reconciliation, custody: await Custody.findById(custodyId), notice: { userId: request.assignedPreparer, message: 'أرسل الفني تصفية ذمته؛ راجع المستهلك والفائض والتالف' } };
  });
};

export const reviewInventoryReconciliation = async (reconciliationId, actor, body) => {
  storekeeper(actor);
  const initial = await Reconciliation.findById(reconciliationId); if (!initial) fail('التصفية غير موجودة', 404);
  return locked(initial.request, async (request) => {
    const reconciliation = await Reconciliation.findById(reconciliationId);
    const custody = await Custody.findById(reconciliation.custody); if (!custody) fail('الذمة المرتبطة غير موجودة', 404);
    if (id(reconciliation.submittedBy) === id(actor.id) || id(custody.holder) === id(actor.id)) fail('لا يجوز اعتماد أو رفض تصفيتك الشخصية', 403);
    if (!['SUBMITTED', 'UNDER_REVIEW'].includes(reconciliation.status)) fail('تمت مراجعة التصفية مسبقاً');
    const reject = body.action === 'REJECT';
    if (!['APPROVE', 'REJECT'].includes(body.action)) fail('إجراء المراجعة غير صالح', 400);
    if (reject && !String(body.reviewNotes || '').trim()) fail('ملاحظات رفض التصفية مطلوبة', 400);
    const items = custody.items.map((line) => {
      const input = reconciliation.items.find((entry) => id(entry.material) === id(line.material));
      if (reject || !input) return plain(line);
      if (q(input.receivedQty) !== q(line.receivedQty)) fail('تغيرت كمية الذمة؛ أعد تقديم التصفية');
      return { ...plain(line), consumedQty: input.consumedQty, damagedQty: input.damagedQty, lostQty: input.lostQty, remainingQty: input.remainingQty,
        lineStatus: 'PARTIAL' };
    });
    const awaiting = !reject && pendingReturns(reconciliation);
    const status = awaiting ? 'PENDING_RECONCILIATION' : workflowCustodyStatus(items);
    await Reconciliation.updateOne({ _id: reconciliationId }, { $set: { status: reject ? 'REJECTED' : 'APPROVED', reviewedBy: actor.id, reviewedAt: new Date(), reviewNotes: body.reviewNotes || '' } });
    await Custody.updateOne({ _id: custody._id }, { $set: { items, status, closedAt: status === 'CLOSED' ? new Date() : null } });
    await syncRequest(request, { status }, { status: awaiting ? 'PENDING_RECONCILIATION' : !allDelivered(request) ? 'IN_PROGRESS' : status === 'CLOSED' ? 'CLOSED' : 'PENDING_SETTLEMENT' });
    await Request.updateOne({ _id: request._id }, { $push: { workflowEvents: event(actor, reject ? 'RECONCILIATION_REJECTED' : 'RECONCILIATION_APPROVED', { reconciliationId, custodyStatus: status }) } });
    return { reconciliation: await Reconciliation.findById(reconciliationId), custody: await Custody.findById(custody._id), notice: { userId: id(custody.holder), message: reject ? 'رفض أمين المخزن التصفية؛ راجع الملاحظات' : awaiting ? 'اعتمدت التصفية؛ سلم الفائض والتالف للمخزن لإكمال الإغلاق' : 'تم اعتماد التصفية وتحديث ذمتك' } };
  });
};

export const receiveInventoryReturns = async (reconciliationId, actor, body) => {
  storekeeper(actor);
  const initial = await Reconciliation.findById(reconciliationId); if (!initial) fail('التصفية غير موجودة', 404);
  return locked(initial.request, async (request) => {
    let reconciliation = await Reconciliation.findById(reconciliationId);
    let custody = await Custody.findById(reconciliation.custody); if (!custody) fail('الذمة غير موجودة', 404);
    if (reconciliation.status !== 'APPROVED') fail('يجب اعتماد التصفية أولاً');
    if (!/^[a-zA-Z0-9-]{16,100}$/.test(String(body.operationKey || ''))) fail('معرف عملية الاستلام مطلوب؛ حدث الصفحة', 400);
    if (reconciliation.appliedReturnKeys.includes(body.operationKey) && !reconciliation.pendingReturnBatch) return { reconciliation, custody, alreadyApplied: true };
    let batch = reconciliation.pendingReturnBatch;
    if (batch && batch.id !== body.operationKey) fail('توجد عملية استلام غير مكتملة؛ استأنفها قبل بدء عملية جديدة');
    if (!batch) {
      const inputs = new Map();
      for (const item of body.items || []) {
        const material = id(item.materialId || item.material); if (inputs.has(material)) fail('المادة مكررة', 400);
        let good = Number(item.returnedQty || 0), damaged = Number(item.damagedReturnedQty || 0);
        if (['DAMAGED', 'NOT_USABLE'].includes(item.condition)) { damaged += good; good = 0; }
        if (![good, damaged].every((n) => Number.isFinite(n) && n >= 0)) fail('كميات الراجع والتالف غير صالحة', 400);
        const line = reconciliation.items.find((entry) => id(entry.material) === material);
        if (!line || good > q(line.toReturnQty - line.returnedQtyConfirmed) || damaged > q(q(line.damagedToReturnQty) - q(line.damagedReturnedConfirmed))) fail('الكمية تتجاوز الفائض أو التالف المعتمد');
        if (good || damaged) inputs.set(material, { material, good: q(good), damaged: q(damaged) });
      }
      if (!inputs.size) fail('أدخل كمية راجع أو تالف للاستلام', 400);
      const warehouse = [...inputs.values()].some((line) => line.good) ? await regularWarehouse(body.warehouseId) : null;
      let damagedWarehouse = null;
      if ([...inputs.values()].some((line) => line.damaged)) {
        damagedWarehouse = await Warehouse.findOne({ type: 'DAMAGED', active: true });
        if (!damagedWarehouse) {
          try { damagedWarehouse = await Warehouse.findOneAndUpdate({ code: 'WH-DAMAGED', type: 'DAMAGED' }, { $set: { active: true }, $setOnInsert: { name: 'مخزن التالف', code: 'WH-DAMAGED', type: 'DAMAGED' } }, { upsert: true, new: true }); }
          catch (error) {
            if (error.code !== 11000) throw error;
            damagedWarehouse = await Warehouse.findOne({ type: 'DAMAGED', active: true });
            if (!damagedWarehouse) fail('الرمز WH-DAMAGED مستخدم لمخزن آخر؛ أنشئ مخزن تالف من الإعدادات أولاً');
          }
        }
      }
      batch = { id: body.operationKey, items: [...inputs.values()], warehouse: warehouse?._id || null, damagedWarehouse: damagedWarehouse?._id || null, actorId: actor.id };
      await Reconciliation.updateOne({ _id: reconciliationId }, { $set: { pendingReturnBatch: batch } });
    }
    for (const line of batch.items) {
      if (line.good) await stock({ kind: 'return', material: line.material, warehouse: batch.warehouse, quantity: line.good, key: `return:${batch.id}:${line.material}:good`, actor, request: request._id, reference: reconciliation.reconcileNo });
      if (line.damaged) await stock({ kind: 'return', material: line.material, warehouse: batch.damagedWarehouse, quantity: line.damaged, key: `return:${batch.id}:${line.material}:damaged`, actor, request: request._id, reference: reconciliation.reconcileNo });
    }
    let receipt = await ReturnReceipt.findOne({ operationKey: batch.id });
    if (!receipt) receipt = await ReturnReceipt.create({ operationKey: batch.id, returnNo: await sequenceService.next('MATERIAL_RETURN_RECEIPT', { prefix: 'RT' }),
      reconciliation: reconciliation._id, custody: custody._id, request: request._id, project: request.project || null, warehouse: batch.warehouse, damagedWarehouse: batch.damagedWarehouse,
      returnedBy: custody.holder, receivedByStorekeeper: actor.id, inventoryPosted: true,
      items: batch.items.flatMap((line) => { const original = reconciliation.items.find((entry) => id(entry.material) === line.material); return [
        ...(line.good ? [{ material: line.material, materialName: original.materialName, unit: original.unit, returnedQty: line.good, condition: 'NEW' }] : []),
        ...(line.damaged ? [{ material: line.material, materialName: original.materialName, unit: original.unit, returnedQty: line.damaged, condition: 'DAMAGED' }] : []),
      ]; }) });
    if (!custody.appliedReturnKeys.includes(batch.id)) {
      const items = custody.items.map((line) => {
        const input = batch.items.find((entry) => entry.material === id(line.material)); if (!input) return plain(line);
        return { ...plain(line), returnedQty: q(q(line.returnedQty) + input.good), damagedReturnedQty: q(q(line.damagedReturnedQty) + input.damaged), remainingQty: q(q(line.remainingQty) - input.good) };
      });
      await Custody.updateOne({ _id: custody._id, appliedReturnKeys: { $ne: batch.id } }, { $set: { items }, $addToSet: { appliedReturnKeys: batch.id } });
    }
    if (!reconciliation.appliedReturnKeys.includes(batch.id)) {
      const items = reconciliation.items.map((line) => { const input = batch.items.find((entry) => entry.material === id(line.material)); return input ? { ...plain(line), returnedQtyConfirmed: q(q(line.returnedQtyConfirmed) + input.good), damagedReturnedConfirmed: q(q(line.damagedReturnedConfirmed) + input.damaged) } : plain(line); });
      await Reconciliation.updateOne({ _id: reconciliationId, appliedReturnKeys: { $ne: batch.id } }, { $set: { items, returnReceiptRef: receipt._id }, $addToSet: { appliedReturnKeys: batch.id } });
    }
    custody = await Custody.findById(custody._id); reconciliation = await Reconciliation.findById(reconciliationId);
    const status = pendingReturns(reconciliation) ? 'PENDING_RECONCILIATION' : workflowCustodyStatus(custody.items);
    await Custody.updateOne({ _id: custody._id }, { $set: { status, closedAt: status === 'CLOSED' ? new Date() : null } });
    await syncRequest(request, { status }, { status: pendingReturns(reconciliation) ? 'PENDING_RECONCILIATION' : !allDelivered(request) ? 'IN_PROGRESS' : status === 'CLOSED' ? 'CLOSED' : 'PENDING_SETTLEMENT' });
    await Reconciliation.updateOne({ _id: reconciliationId }, { $set: { pendingReturnBatch: null } });
    await Request.updateOne({ _id: request._id }, { $push: { workflowEvents: event(actor, 'RETURNS_RECEIVED', { batchId: batch.id, receiptId: receipt._id }) } });
    return { reconciliation: await Reconciliation.findById(reconciliationId), custody: await Custody.findById(custody._id), returnReceipt: receipt };
  });
};

export const closeInventoryCustody = async (custodyId, actor) => {
  storekeeper(actor);
  const initial = await Custody.findById(custodyId); if (!initial) fail('الذمة غير موجودة', 404);
  return locked(initial.request, async (request) => {
    const custody = await Custody.findById(custodyId);
    await assertNoSettlement(custodyId);
    if (workflowCustodyStatus(custody.items) !== 'CLOSED') fail('لا يمكن إغلاق الذمة قبل تسوية المواد واستلام الفائض والتالف');
    await Custody.updateOne({ _id: custodyId }, { $set: { status: 'CLOSED', closedAt: new Date() } });
    await syncRequest(request, { status: 'CLOSED' });
    return { custody: await Custody.findById(custodyId) };
  });
};

export const cancelRemainingInventoryRequest = async (requestId, actor, body) => locked(requestId, async (initial) => {
  if (!isWarehouseOperator(actor) && recipientId(initial) !== id(actor.id)) fail('إلغاء الباقي للفني المستلم أو أمين المخزن فقط', 403);
  if (!String(body.notes || '').trim()) fail('سبب إلغاء الكميات غير المستلمة مطلوب', 400);
  if (['CLOSED', 'CANCELLED', 'REJECTED', 'RECONCILED'].includes(initial.status)) fail('الطلب منتهٍ بالفعل');
  if (initial.pendingReceipt && !['READY', 'RESERVING', 'ROLLING_BACK'].includes(initial.pendingReceipt.state)) fail('أكمل عملية الاستلام الجارية أولاً');
  if (initial.pendingReceipt) {
    const batch = initial.pendingReceipt;
    const prepared = batch.state === 'READY' || batch.legacy;
    await releaseBatch(initial, batch, actor, prepared ? { notes: body.notes } : null);
  }
  const request = await Request.findById(requestId);
  const items = request.items.map((line) => ({ ...plain(line), approvedQty: q(line.deliveredQty), preparedQty: q(line.deliveredQty), lineStatus: q(line.deliveredQty) > 0 ? 'DELIVERED' : 'CANCELLED' }));
  const anyDelivered = items.some((line) => q(line.deliveredQty) > 0);
  const custody = request.custodyRef ? await Custody.findById(request.custodyRef) : null;
  const status = !anyDelivered ? 'CANCELLED' : custody?.status === 'CLOSED' ? 'CLOSED' : custody?.status === 'PENDING_RECONCILIATION' ? 'PENDING_RECONCILIATION' : 'PENDING_SETTLEMENT';
  await Request.updateOne({ _id: requestId }, { $set: { items, status, pendingReceipt: null }, $push: { workflowEvents: event(actor, 'UNRECEIVED_QUANTITIES_CANCELLED', { notes: body.notes, previousApproved: request.items.map((line) => ({ material: line.material, quantity: line.approvedQty })) }) } });
  return { request: await Request.findById(requestId), notice: { userId: recipientId(request), message: 'ألغي باقي الكميات غير المستلمة؛ تبقى المواد المستلمة على الذمة حتى تصفيتها' } };
});
