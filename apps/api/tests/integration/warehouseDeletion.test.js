import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { MaterialsRepository } from '../../src/infrastructure/db/repositories/MaterialsRepository.js';
import { WarehouseModel } from '../../src/infrastructure/db/models/WarehouseModel.js';
import { MaterialModel } from '../../src/infrastructure/db/models/MaterialModel.js';
import { StockBalanceModel } from '../../src/infrastructure/db/models/StockBalanceModel.js';
import { StockTransactionModel } from '../../src/infrastructure/db/models/StockTransactionModel.js';
import { deleteWarehouseWithInventory } from '../../src/application/services/warehouseDeletionService.js';

test('permanently deletes a populated warehouse including reserved stock', {
  skip: !process.env.WAREHOUSE_DELETE_TEST_URI,
}, async () => {
  const databaseName = `codex_warehouse_delete_test_${randomUUID().replaceAll('-', '')}`;
  try {
    await mongoose.connect(process.env.WAREHOUSE_DELETE_TEST_URI, { dbName: databaseName, serverSelectionTimeoutMS: 5000 });
    const [source, other] = await WarehouseModel.create([{ name: 'Deletion Test', code: 'SOURCE' }, { name: 'Other Warehouse', code: 'OTHER' }]);
    const [exclusive, shared, historical] = await MaterialModel.create([
      { name: 'Exclusive Material', code: 'EXCLUSIVE' },
      { name: 'Shared Material', code: 'SHARED' },
      { name: 'Historical Material', code: 'HISTORY' },
    ]);
    await StockBalanceModel.create([
      { warehouse: source._id, material: exclusive._id, qtyOnHand: 100, qtyReserved: 30 },
      { warehouse: source._id, material: shared._id, qtyOnHand: 50, qtyReserved: 20 },
      { warehouse: other._id, material: shared._id, qtyOnHand: 80, qtyReserved: 5 },
    ]);
    await StockTransactionModel.create([
      { warehouse: source._id, material: exclusive._id, transactionType: 'IN', quantity: 100 },
      { warehouse: source._id, material: historical._id, transactionType: 'OUT', quantity: 10 },
      { warehouse: other._id, material: shared._id, transactionType: 'IN', quantity: 80 },
    ]);

    const result = await deleteWarehouseWithInventory({
      user: { role: 'GENERAL_MANAGER' }, warehouseId: source._id,
      confirmationName: source.name, repository: new MaterialsRepository(),
    });

    assert.equal(result.deletedMaterialsCount, 2);
    assert.equal(result.deletedBalancesCount, 2);
    assert.equal(result.deletedTransactionsCount, 2);
    assert.equal(await WarehouseModel.countDocuments({ _id: source._id }), 0);
    assert.equal(await StockBalanceModel.countDocuments({ warehouse: source._id }), 0);
    assert.equal(await StockTransactionModel.countDocuments({ warehouse: source._id }), 0);
    assert.equal(await MaterialModel.countDocuments({ _id: { $in: [exclusive._id, historical._id] } }), 0);
    assert.equal(await MaterialModel.countDocuments({ _id: shared._id }), 1);
    const remaining = await StockBalanceModel.findOne({ warehouse: other._id, material: shared._id });
    assert.equal(remaining.qtyOnHand, 80);
    assert.equal(remaining.qtyReserved, 5);
    assert.equal(await StockTransactionModel.countDocuments({ warehouse: other._id }), 1);
    assert.equal(await WarehouseModel.countDocuments({ _id: other._id }), 1);
  } finally {
    try {
      // Only the uniquely named database created by this test can be removed.
      if (mongoose.connection.readyState === 1 && mongoose.connection.name === databaseName
        && /^codex_warehouse_delete_test_[a-f0-9]{32}$/.test(databaseName)) {
        await mongoose.connection.dropDatabase();
      }
    } finally {
      await mongoose.disconnect();
    }
  }
});
