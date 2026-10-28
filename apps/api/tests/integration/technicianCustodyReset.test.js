import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { MaterialsRepository } from '../../src/infrastructure/db/repositories/MaterialsRepository.js';
import { MaterialCustodyModel } from '../../src/infrastructure/db/models/MaterialCustodyModel.js';
import { MaterialRequestModel } from '../../src/infrastructure/db/models/MaterialRequestModel.js';
import { MaterialReconciliationModel } from '../../src/infrastructure/db/models/MaterialReconciliationModel.js';
import { MaterialReturnReceiptModel } from '../../src/infrastructure/db/models/MaterialReturnReceiptModel.js';
import { StockBalanceModel } from '../../src/infrastructure/db/models/StockBalanceModel.js';
import { StockTransactionModel } from '../../src/infrastructure/db/models/StockTransactionModel.js';
import { previewTechnicianCustodyReset, resetTechnicianCustodies } from '../../src/application/services/technicianCustodyResetService.js';

test('reset removes only selected technician open custodies and their dependent records', { skip: !process.env.CUSTODY_RESET_TEST_URI }, async () => {
  const databaseName = `codex_custody_reset_test_${randomUUID().replaceAll('-', '')}`;
  const id = () => new mongoose.Types.ObjectId();
  try {
    await mongoose.connect(process.env.CUSTODY_RESET_TEST_URI, { dbName: databaseName, autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 5000 });
    const technicianId = id(), otherId = id(), materialId = id(), warehouseId = id();
    const statuses = ['OPEN', 'PENDING_RECONCILIATION', 'PARTIALLY_RECONCILED', 'OVERDUE', 'FULLY_RECONCILED', 'CLOSED', 'OPEN', 'OPEN', 'CLOSED'];
    const custodies = statuses.map((status, index) => ({ _id: id(), custodyNo: `TEST-${index}`, status,
      holder: index >= 7 ? null : index === 6 ? otherId : technicianId, request: id(), updatedAt: new Date(),
      items: [{ material: materialId, materialName: 'Test Material', remainingQty: 10, receivedQty: 10 }],
    }));
    await MaterialCustodyModel.collection.insertMany(custodies);
    await MaterialRequestModel.collection.insertMany(custodies.map((custody) => ({ _id: custody.request, custodyRef: custody._id, status: 'PENDING_RECONCILIATION' })));
    await MaterialReconciliationModel.collection.insertMany(custodies.map((custody) => ({ custody: custody._id, status: 'SUBMITTED' })));
    await MaterialReturnReceiptModel.collection.insertMany(custodies.map((custody) => ({ custody: custody._id })));
    await StockBalanceModel.collection.insertOne({ material: materialId, warehouse: warehouseId, qtyOnHand: 50, qtyReserved: 5 });
    await StockTransactionModel.collection.insertOne({ material: materialId, warehouse: warehouseId, transactionType: 'OUT', quantity: 10 });
    const options = { user: { role: 'GENERAL_MANAGER' }, technicianId, repository: new MaterialsRepository(),
      findUser: async () => ({ _id: technicianId, fullName: 'Test Technician' }) };
    const preview = await previewTechnicianCustodyReset(options);
    assert.equal(preview.custodies.length, 4);
    const result = await resetTechnicianCustodies({ ...options, previewToken: preview.previewToken, confirmationName: 'Test Technician' });
    assert.equal(result.deletedCustodiesCount, 4);
    assert.equal(result.deletedReconciliationsCount, 4);
    assert.equal(result.deletedReturnReceiptsCount, 4);
    const preservedIds = custodies.slice(4).map((custody) => String(custody._id));
    const remaining = await MaterialCustodyModel.find().lean();
    assert.deepEqual(remaining.map((custody) => String(custody._id)).sort(), preservedIds.sort());
    assert.equal(await MaterialReconciliationModel.countDocuments(), 5);
    assert.equal(await MaterialReturnReceiptModel.countDocuments(), 5);
    assert.equal(await MaterialRequestModel.countDocuments({ status: 'CLOSED', custodyRef: null }), 4);
    assert.equal(await MaterialRequestModel.countDocuments({ status: 'PENDING_RECONCILIATION' }), 5);
    const unassigned = { ...options, technicianId: 'unassigned', findUser: async () => assert.fail('must not look up a user') };
    const orphanPreview = await previewTechnicianCustodyReset(unassigned);
    assert.deepEqual(orphanPreview.custodies.map((custody) => custody.id), [String(custodies[7]._id)]);
    await resetTechnicianCustodies({ ...unassigned, previewToken: orphanPreview.previewToken, confirmationName: orphanPreview.technician.fullName });
    assert.equal(await MaterialCustodyModel.countDocuments({ _id: custodies[7]._id }), 0);
    assert.equal(await MaterialCustodyModel.countDocuments({ _id: custodies[8]._id }), 1);
    assert.equal(await MaterialCustodyModel.countDocuments({ holder: otherId }), 1);
    assert.equal(await MaterialReconciliationModel.countDocuments({ custody: custodies[7]._id }), 0);
    assert.equal(await MaterialReturnReceiptModel.countDocuments({ custody: custodies[7]._id }), 0);
    const balance = await StockBalanceModel.findOne().lean();
    assert.equal(balance.qtyOnHand, 50);
    assert.equal(balance.qtyReserved, 5);
    assert.equal(await StockTransactionModel.countDocuments(), 1);
  } finally {
    try {
      if (mongoose.connection.readyState === 1 && mongoose.connection.name === databaseName && /^codex_custody_reset_test_[a-f0-9]{32}$/.test(databaseName)) {
        await mongoose.connection.dropDatabase();
      }
    } finally { await mongoose.disconnect(); }
  }
});
