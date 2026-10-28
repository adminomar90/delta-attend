import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { UserModel } from '../../src/infrastructure/db/models/UserModel.js';
import '../../src/infrastructure/db/models/CustomerModel.js';
import '../../src/infrastructure/db/models/ProjectModel.js';
import { MaterialRequestModel as Request } from '../../src/infrastructure/db/models/MaterialRequestModel.js';
import { MaterialCustodyModel as Custody } from '../../src/infrastructure/db/models/MaterialCustodyModel.js';
import { MaterialModel as Material } from '../../src/infrastructure/db/models/MaterialModel.js';
import { WarehouseModel as Warehouse } from '../../src/infrastructure/db/models/WarehouseModel.js';
import { StockBalanceModel as Balance } from '../../src/infrastructure/db/models/StockBalanceModel.js';
import { MaterialsRepository } from '../../src/infrastructure/db/repositories/MaterialsRepository.js';
import { deleteInventoryRequest as remove, reviewInventoryRequest as review, prepareInventoryRequest as prepare, acceptInventoryReceipt as accept,
  submitInventoryReconciliation as submit, reviewInventoryReconciliation as approve, receiveInventoryReturns as returns,
} from '../../src/application/services/inventoryWorkflowService.js';

test('request deletion releases only unreceived reservations and preserves posted custody settlement', { skip: !process.env.INVENTORY_WORKFLOW_TEST_URI }, async () => {
  const databaseName = `codex_request_delete_test_${randomUUID().replaceAll('-', '')}`;
  try {
    await mongoose.connect(process.env.INVENTORY_WORKFLOW_TEST_URI, { dbName: databaseName });
    const password = 'Isolated-Primary-Password';
    const admin = await UserModel.create({ email: 'admin@delta.com', fullName: 'Primary', role: 'GENERAL_MANAGER', passwordHash: await bcrypt.hash(password, 4) });
    const actor = { id: String(admin._id), role: 'GENERAL_MANAGER' };
    const tech = { id: String(new mongoose.Types.ObjectId()), role: 'TECHNICAL_STAFF' }, keeper = { id: String(new mongoose.Types.ObjectId()), role: 'WAREHOUSE_KEEPER' };
    const warehouse = await Warehouse.create({ name: 'Source', code: 'SOURCE' });
    const material = await Material.create({ name: 'Cable', code: 'CABLE', unit: 'METER' });
    await Balance.create({ material: material._id, warehouse: warehouse._id, qtyOnHand: 20 });
    const create = (no) => Request.create({ requestNo: no, requestedBy: tech.id, requestedFor: tech.id, warehouse: warehouse._id,
      items: [{ material: material._id, materialName: material.name, unitSnapshot: 'METER', requestedQty: 5 }] });
    const prep = (request, quantity) => prepare(request._id, keeper, { items: [{ materialId: material._id, preparedQty: quantity }] });
    const first = await create('DELETE-UNRECEIVED');
    await review(first._id, keeper, { action: 'APPROVE_FULL' });
    await prep(first, 5);
    await assert.rejects(remove(first._id, keeper, {}), { statusCode: 403 });
    assert.equal((await Balance.findOne()).qtyReserved, 5);
    await Request.updateOne({ _id: first._id }, { $set: { 'pendingReceipt.state': 'ISSUING' } });
    await assert.rejects(remove(first._id, actor, {}), { statusCode: 409 });
    await Request.updateOne({ _id: first._id }, { $set: { 'pendingReceipt.state': 'READY' } });
    await remove(first._id, actor, {});
    assert.equal((await Balance.findOne()).qtyReserved, 0);
    assert.equal((await Balance.findOne()).qtyOnHand, 20);
    assert.ok((await Request.findById(first._id)).deletedAt);
    assert.equal((await new MaterialsRepository().listRequests()).length, 0);
    assert.equal((await remove(first._id, actor, {})).alreadyApplied, true);
    await assert.rejects(prep(first, 1), { statusCode: 409 });

    const second = await create('DELETE-PARTIALLY-RECEIVED');
    await review(second._id, keeper, { action: 'APPROVE_FULL' });
    const batch = await prep(second, 2);
    const received = await accept(second._id, tech, { receiptToken: batch.request.pendingReceipt.id });
    await prep(second, 1);
    const result = await remove(second._id, actor, {});
    assert.equal(result.custodyPreserved, true);
    assert.equal((await Custody.findById(received.custody._id)).items[0].receivedQty, 2);
    assert.equal((await Balance.findOne()).qtyOnHand, 18);
    assert.equal((await Balance.findOne()).qtyReserved, 0);
    const settlement = await submit(received.custody._id, tech, { items: [{ materialId: material._id, consumedQty: 1, damagedQty: 0, lostQty: 0, remainingQty: 1, toReturnQty: 1 }] });
    await approve(settlement.reconciliation._id, keeper, { action: 'APPROVE' });
    const returned = await returns(settlement.reconciliation._id, keeper, { operationKey: randomUUID(), warehouseId: warehouse._id, items: [{ materialId: material._id, returnedQty: 1 }] });
    assert.equal(returned.custody.status, 'CLOSED');
    assert.equal((await Balance.findOne()).qtyOnHand, 19);
    assert.equal((await new MaterialsRepository().listRequests()).length, 0);
    assert.ok((await Request.findById(second._id)).deletedAt);

    // Deleted warehouse and catalog references must never block old request deletion.
    const orphanRequest = await Request.create({ requestNo: 'MR-2026-00192', status: 'APPROVED', requestedBy: tech.id, requestedFor: tech.id,
      warehouse: new mongoose.Types.ObjectId(), items: [{ material: new mongoose.Types.ObjectId(), materialName: 'Deleted catalog product', requestedQty: 1, approvedQty: 1 }] });
    const populated = await new MaterialsRepository().findRequestById(orphanRequest._id);
    assert.equal(populated.warehouse, null);
    assert.equal(populated.items[0].material, null);
    const orphanResult = await remove(orphanRequest._id, actor, {});
    assert.equal(orphanResult.deleted, true);
    assert.equal((await new MaterialsRepository().listRequests()).length, 0);
  } finally {
    try { if (mongoose.connection.readyState === 1 && mongoose.connection.name === databaseName && /^codex_request_delete_test_[a-f0-9]{32}$/.test(databaseName)) await mongoose.connection.dropDatabase(); }
    finally { await mongoose.disconnect(); }
  }
});
