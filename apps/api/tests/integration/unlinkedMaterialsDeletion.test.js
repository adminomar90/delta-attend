import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { UserModel } from '../../src/infrastructure/db/models/UserModel.js';
import { MaterialsRepository } from '../../src/infrastructure/db/repositories/MaterialsRepository.js';
import { WarehouseModel } from '../../src/infrastructure/db/models/WarehouseModel.js';
import { MaterialModel } from '../../src/infrastructure/db/models/MaterialModel.js';
import { StockBalanceModel } from '../../src/infrastructure/db/models/StockBalanceModel.js';
import { StockTransactionModel } from '../../src/infrastructure/db/models/StockTransactionModel.js';
import { deleteUnlinkedMaterials, previewUnlinkedMaterialsDeletion } from '../../src/application/services/unlinkedMaterialsDeletionService.js';

test('orphan cleanup removes active and archived products but preserves real warehouse products', { skip: !process.env.WAREHOUSE_DELETE_TEST_URI }, async () => {
  const databaseName = `codex_unlinked_delete_test_${randomUUID().replaceAll('-', '')}`;
  try {
    await mongoose.connect(process.env.WAREHOUSE_DELETE_TEST_URI, { dbName: databaseName });
    const adminPassword = 'Isolated-Admin-Password';
    const [admin, manager] = await UserModel.create([
      { fullName: 'Test Primary Admin', email: 'admin@delta.com', passwordHash: await bcrypt.hash(adminPassword, 4), role: 'GENERAL_MANAGER' },
      { fullName: 'Test Manager', email: 'manager@test.invalid', passwordHash: await bcrypt.hash('Manager-Password', 4), role: 'GENERAL_MANAGER' },
    ]);
    const warehouse = await WarehouseModel.create({ name: 'Live', code: 'LIVE' });
    const removedWarehouseId = new mongoose.Types.ObjectId();
    const [linked, zeroLinked, orphan, archived] = await MaterialModel.create([
      { name: 'Linked', code: 'LINKED' }, { name: 'Zero balance', code: 'ZERO' },
      { name: 'Orphan', code: 'ORPHAN' }, { name: 'Archived orphan', code: 'ARCHIVED', active: false },
    ]);
    await StockBalanceModel.create([
      { material: linked._id, warehouse: warehouse._id, qtyOnHand: 10 },
      { material: zeroLinked._id, warehouse: warehouse._id, qtyOnHand: 0 },
      { material: orphan._id, warehouse: removedWarehouseId, qtyOnHand: 4, qtyReserved: 1 },
    ]);
    await StockTransactionModel.create([
      { material: orphan._id, warehouse: removedWarehouseId, transactionType: 'IN', quantity: 4 },
      { material: archived._id, warehouse: removedWarehouseId, transactionType: 'OUT', quantity: 3 },
    ]);
    const repository = new MaterialsRepository(), input = { user: { id: String(manager._id), role: 'GENERAL_MANAGER' }, repository, adminPassword };
    const preview = await previewUnlinkedMaterialsDeletion(input);
    assert.equal(preview.count, 2);
    assert.equal(preview.products.find((item) => String(item._id) === String(orphan._id)).code, 'ORPHAN');
    await assert.rejects(deleteUnlinkedMaterials({ ...input, adminPassword: 'Manager-Password', materialIds: [String(orphan._id)], expectedCount: 1 }), { statusCode: 403 });
    assert.equal(await MaterialModel.countDocuments(), 4);
    await assert.rejects(deleteUnlinkedMaterials({ ...input, materialIds: [String(linked._id)], expectedCount: 1 }), { statusCode: 409 });
    const result = await deleteUnlinkedMaterials({ ...input, materialIds: [String(orphan._id)], expectedCount: 1 });
    assert.equal(result.authorizedBy, String(admin._id));
    assert.ok(!JSON.stringify(result).includes(adminPassword));
    assert.equal(result.deletedMaterialsCount, 1);
    assert.equal(result.deletedBalancesCount, 1);
    assert.equal(result.deletedTransactionsCount, 1);
    assert.equal(await MaterialModel.countDocuments({ _id: archived._id }), 1);
    const remainingPreview = await previewUnlinkedMaterialsDeletion(input);
    assert.equal(remainingPreview.count, 1);
    await deleteUnlinkedMaterials({ ...input, materialIds: remainingPreview.products.map((item) => String(item._id)), expectedCount: remainingPreview.count });
    assert.equal(await MaterialModel.countDocuments(), 2);
    assert.equal((await StockBalanceModel.findOne({ material: linked._id })).qtyOnHand, 10);
    assert.equal(await StockBalanceModel.countDocuments({ material: zeroLinked._id }), 1);
    // Old movements and deleted warehouse references must not make a product "shared".
    await StockTransactionModel.create({ material: zeroLinked._id, warehouse: removedWarehouseId, transactionType: 'IN', quantity: 1 });
    assert.deepEqual(await repository.findMaterialIdsUsedOutsideWarehouse([zeroLinked._id], warehouse._id), []);
  } finally {
    try { if (mongoose.connection.readyState === 1 && mongoose.connection.name === databaseName && /^codex_unlinked_delete_test_[a-f0-9]{32}$/.test(databaseName)) await mongoose.connection.dropDatabase(); }
    finally { await mongoose.disconnect(); }
  }
});
