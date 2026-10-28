import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { MaterialRequestModel as Request } from '../../src/infrastructure/db/models/MaterialRequestModel.js';
import { MaterialCustodyModel as Custody } from '../../src/infrastructure/db/models/MaterialCustodyModel.js';
import { MaterialModel as Material } from '../../src/infrastructure/db/models/MaterialModel.js';
import { WarehouseModel as Warehouse } from '../../src/infrastructure/db/models/WarehouseModel.js';
import { StockBalanceModel as Balance } from '../../src/infrastructure/db/models/StockBalanceModel.js';
import { MaterialReturnReceiptModel as ReturnReceipt } from '../../src/infrastructure/db/models/MaterialReturnReceiptModel.js';
import { MaterialDispatchModel as Dispatch } from '../../src/infrastructure/db/models/MaterialDispatchModel.js';
import { reviewInventoryRequest as review, prepareInventoryRequest as prepare, acceptInventoryReceipt as accept,
  submitInventoryReconciliation as submit, reviewInventoryReconciliation as approve, receiveInventoryReturns as returns,
  cancelRemainingInventoryRequest as cancel,
} from '../../src/application/services/inventoryWorkflowService.js';

test('inventory lifecycle, partial deliveries, surplus and damaged returns are consistent and retry safe', { skip: !process.env.INVENTORY_WORKFLOW_TEST_URI }, async () => {
  const databaseName = `codex_inventory_workflow_test_${randomUUID().replaceAll('-', '')}`;
  try {
    await mongoose.connect(process.env.INVENTORY_WORKFLOW_TEST_URI, { dbName: databaseName, autoIndex: false, autoCreate: false });
    const key = () => new mongoose.Types.ObjectId();
    const tech = { id: String(key()), role: 'TECHNICAL_STAFF' }, keeper = { id: String(key()), role: 'WAREHOUSE_KEEPER' }, other = { id: String(key()), role: 'TECHNICAL_STAFF' };
    const warehouse = await Warehouse.create({ name: 'المخزن الرئيسي', code: 'MAIN' });
    const material = await Material.create({ name: 'كيبل شبكة', code: 'MAT-1', unit: 'METER' });
    await Balance.create({ material: material._id, warehouse: warehouse._id, qtyOnHand: 20, qtyReserved: 0 });
    const request = await Request.create({ requestNo: 'TEST-1', requestedBy: tech.id, requestedFor: tech.id, warehouse: warehouse._id,
      items: [{ material: material._id, materialName: material.name, unitSnapshot: material.unit, requestedQty: 10 }] });
    await assert.rejects(review(request._id, tech, { action: 'APPROVE_FULL' }), { statusCode: 403 });
    await review(request._id, keeper, { action: 'APPROVE_PARTIAL', items: [{ materialId: material._id, approvedQty: 8 }] });
    let prepared = await prepare(request._id, keeper, { warehouseId: warehouse._id, items: [{ materialId: material._id, preparedQty: 4 }] });
    let balance = await Balance.findOne({ material: material._id, warehouse: warehouse._id });
    assert.equal(balance.qtyOnHand, 20); assert.equal(balance.qtyReserved, 4);
    await assert.rejects(accept(request._id, other, {}), { statusCode: 403 });
    const firstToken = prepared.request.pendingReceipt.id;
    const first = await accept(request._id, tech, { receiptToken: firstToken });
    assert.equal(first.request.status, 'IN_PROGRESS');
    assert.equal(first.custody.items[0].receivedQty, 4);
    assert.equal((await accept(request._id, tech, { receiptToken: firstToken })).alreadyApplied, true);
    prepared = await prepare(request._id, keeper, { warehouseId: warehouse._id, items: [{ materialId: material._id, preparedQty: 4 }] });
    const received = await accept(request._id, tech, { receiptToken: prepared.request.pendingReceipt.id });
    assert.equal(received.custody.items[0].receivedQty, 8);
    assert.equal(received.request.status, 'PENDING_SETTLEMENT');
    balance = await Balance.findOne({ material: material._id, warehouse: warehouse._id });
    assert.equal(balance.qtyOnHand, 12); assert.equal(balance.qtyReserved, 0);
    const partial = await submit(received.custody._id, tech, { items: [{ materialId: material._id, consumedQty: 2, damagedQty: 0, lostQty: 0, remainingQty: 6, toReturnQty: 0 }] });
    await assert.rejects(approve(partial.reconciliation._id, tech, { action: 'APPROVE' }), { statusCode: 403 });
    const partialResult = await approve(partial.reconciliation._id, keeper, { action: 'APPROVE' });
    assert.equal(partialResult.custody.status, 'PARTIALLY_RECONCILED');
    assert.equal(partialResult.custody.items[0].remainingQty, 6);
    const settlement = await submit(received.custody._id, tech, { items: [{ materialId: material._id, consumedQty: 3, damagedQty: 2, lostQty: 0, remainingQty: 3, toReturnQty: 3 }] });
    const reviewed = await approve(settlement.reconciliation._id, keeper, { action: 'APPROVE' });
    assert.equal(reviewed.custody.status, 'PENDING_RECONCILIATION');
    const operationKey = randomUUID();
    const input = { operationKey, warehouseId: warehouse._id, items: [{ materialId: material._id, returnedQty: 3, damagedReturnedQty: 2 }] };
    await assert.rejects(returns(settlement.reconciliation._id, keeper, { ...input, warehouseId: '' }), { statusCode: 400 });
    const returned = await returns(settlement.reconciliation._id, keeper, input);
    assert.equal(returned.custody.status, 'CLOSED');
    assert.equal(returned.custody.items[0].remainingQty, 0);
    assert.equal(returned.custody.items[0].damagedReturnedQty, 2);
    assert.equal((await Request.findById(request._id)).status, 'CLOSED');
    balance = await Balance.findOne({ material: material._id, warehouse: warehouse._id });
    assert.equal(balance.qtyOnHand, 15);
    const damaged = await Warehouse.findOne({ type: 'DAMAGED' });
    assert.equal((await Balance.findOne({ material: material._id, warehouse: damaged._id })).qtyOnHand, 2);
    assert.equal((await returns(settlement.reconciliation._id, keeper, input)).alreadyApplied, true);
    assert.equal(await ReturnReceipt.countDocuments(), 1);
    assert.equal(await Dispatch.countDocuments({ request: request._id }), 2);

    // Interrupted acceptance resumes the same batch without another stock debit.
    const second = await Request.create({ requestNo: 'TEST-2', requestedBy: tech.id, requestedFor: tech.id, warehouse: warehouse._id,
      items: [{ material: material._id, materialName: material.name, unitSnapshot: 'METER', requestedQty: 2 }] });
    await review(second._id, keeper, { action: 'APPROVE_FULL' });
    const ready = await prepare(second._id, keeper, { warehouseId: warehouse._id, items: [{ materialId: material._id, preparedQty: 2 }] });
    const original = Custody.create;
    Custody.create = async () => { throw new Error('simulated interruption'); };
    try { await assert.rejects(accept(second._id, tech, { receiptToken: ready.request.pendingReceipt.id }), /simulated interruption/); }
    finally { Custody.create = original; }
    const resumed = await accept(second._id, tech, { receiptToken: ready.request.pendingReceipt.id });
    assert.equal(resumed.custody.items[0].receivedQty, 2);
    assert.equal((await Balance.findOne({ material: material._id, warehouse: warehouse._id })).qtyOnHand, 13);
    assert.equal(await Dispatch.countDocuments({ request: second._id }), 1);

    // A failed multi-line preparation releases earlier reservations.
    const unavailable = await Material.create({ name: 'مادة قليلة', code: 'MAT-2', unit: 'PIECE' });
    await Balance.create({ material: unavailable._id, warehouse: warehouse._id, qtyOnHand: 1, qtyReserved: 0 });
    const third = await Request.create({ requestNo: 'TEST-3', requestedBy: tech.id, requestedFor: tech.id, warehouse: warehouse._id,
      items: [{ material: material._id, requestedQty: 3 }, { material: unavailable._id, requestedQty: 2 }] });
    await review(third._id, keeper, { action: 'APPROVE_FULL' });
    await assert.rejects(prepare(third._id, keeper, { warehouseId: warehouse._id, items: [{ materialId: material._id, preparedQty: 3 }, { materialId: unavailable._id, preparedQty: 2 }] }), { statusCode: 409 });
    assert.equal((await Balance.findOne({ material: material._id, warehouse: warehouse._id })).qtyReserved, 0);
    assert.equal((await Request.findById(third._id)).pendingReceipt, null);

    // Refusing a prepared batch releases stock without creating a custody.
    const refused = await prepare(third._id, keeper, { warehouseId: warehouse._id, items: [{ materialId: material._id, preparedQty: 3 }] });
    await accept(third._id, tech, { action: 'REJECT', receiptToken: refused.request.pendingReceipt.id, notes: 'Wrong batch' });
    assert.equal((await Balance.findOne({ material: material._id, warehouse: warehouse._id })).qtyReserved, 0);
    assert.equal((await Request.findById(third._id)).items[0].preparedQty, 0);
    assert.equal(await Custody.countDocuments({ request: third._id }), 0);
    await assert.rejects(review(third._id, keeper, { action: 'APPROVE_FULL' }), { statusCode: 409 });
    await cancel(third._id, tech, { notes: 'Cancel unreceived quantities' });
    assert.equal((await Request.findById(third._id)).status, 'CANCELLED');

    // Concurrent accepts cannot debit the same batch twice.
    const fourth = await Request.create({ requestNo: 'TEST-4', requestedBy: tech.id, requestedFor: tech.id, warehouse: warehouse._id,
      items: [{ material: material._id, materialName: material.name, unitSnapshot: 'METER', requestedQty: 4 }] });
    await review(fourth._id, keeper, { action: 'APPROVE_FULL' });
    const concurrentReady = await prepare(fourth._id, keeper, { warehouseId: warehouse._id, items: [{ materialId: material._id, preparedQty: 2 }] });
    const concurrentInput = { receiptToken: concurrentReady.request.pendingReceipt.id };
    const attempts = await Promise.allSettled([accept(fourth._id, tech, concurrentInput), accept(fourth._id, tech, concurrentInput)]);
    assert.ok(attempts.some((result) => result.status === 'fulfilled'));
    const concurrentCustody = await Custody.findOne({ request: fourth._id });
    assert.equal(concurrentCustody.items[0].receivedQty, 2);
    assert.equal((await Balance.findOne({ material: material._id, warehouse: warehouse._id })).qtyOnHand, 11);
    const remainingReady = await prepare(fourth._id, keeper, { warehouseId: warehouse._id, items: [{ materialId: material._id, preparedQty: 2 }] });
    assert.ok(remainingReady.request.pendingReceipt);
    await cancel(fourth._id, tech, { notes: 'Keep received materials only' });
    assert.equal((await Request.findById(fourth._id)).status, 'PENDING_SETTLEMENT');
    assert.equal((await Balance.findOne({ material: material._id, warehouse: warehouse._id })).qtyReserved, 0);
    assert.equal((await Custody.findById(concurrentCustody._id)).items[0].receivedQty, 2);

    // Interrupted returns resume after stock credit without duplicating it.
    const finalSettlement = await submit(concurrentCustody._id, tech, { items: [{ materialId: material._id, consumedQty: 0, damagedQty: 1, lostQty: 0, remainingQty: 1, toReturnQty: 1 }] });
    await approve(finalSettlement.reconciliation._id, keeper, { action: 'APPROVE' });
    const returnInput = { operationKey: randomUUID(), warehouseId: warehouse._id, items: [{ materialId: material._id, returnedQty: 1, damagedReturnedQty: 1 }] };
    const originalReceiptCreate = ReturnReceipt.create;
    ReturnReceipt.create = async () => { throw new Error('simulated return interruption'); };
    try { await assert.rejects(returns(finalSettlement.reconciliation._id, keeper, returnInput), /simulated return interruption/); }
    finally { ReturnReceipt.create = originalReceiptCreate; }
    assert.equal((await Balance.findOne({ material: material._id, warehouse: warehouse._id })).qtyOnHand, 12);
    const completedReturn = await returns(finalSettlement.reconciliation._id, keeper, returnInput);
    assert.equal(completedReturn.custody.status, 'CLOSED');
    assert.equal((await Balance.findOne({ material: material._id, warehouse: warehouse._id })).qtyOnHand, 12);
    assert.equal((await Balance.findOne({ material: material._id, warehouse: damaged._id })).qtyOnHand, 3);

    const selfRequest = await Request.create({ requestNo: 'SELF', requestedBy: keeper.id, requestedFor: keeper.id,
      items: [{ material: material._id, requestedQty: 1 }] });
    await assert.rejects(review(selfRequest._id, keeper, { action: 'APPROVE_FULL' }), { statusCode: 403 });
    await assert.rejects(prepare(second._id, keeper, { warehouseId: damaged._id, items: [{ materialId: material._id, preparedQty: 1 }] }), { statusCode: 409 });
  } finally {
    try {
      if (mongoose.connection.readyState === 1 && mongoose.connection.name === databaseName && /^codex_inventory_workflow_test_[a-f0-9]{32}$/.test(databaseName)) await mongoose.connection.dropDatabase();
    } finally { await mongoose.disconnect(); }
  }
});
