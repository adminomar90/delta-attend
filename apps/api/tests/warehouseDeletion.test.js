import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteWarehouseWithInventory } from '../src/application/services/warehouseDeletionService.js';
import { Roles, Permission } from '../src/shared/constants.js';

const makeRepository = ({ materials = ['exclusive', 'shared'], shared = ['shared'] } = {}) => {
  const calls = [];
  return {
    calls,
    findWarehouseById: async (id) => ({ _id: id, name: 'Test Warehouse', code: 'TEST' }),
    findWarehouseMaterialIds: async () => materials,
    findMaterialIdsUsedOutsideWarehouse: async () => shared,
    deleteMaterialsByIds: async (ids) => { calls.push(['materials', ids]); return { deletedCount: ids.length }; },
    deleteStockTransactionsByWarehouse: async (id) => { calls.push(['transactions', id]); return { deletedCount: 3 }; },
    deleteStockBalancesByWarehouse: async (id) => { calls.push(['balances', id]); return { deletedCount: materials.length }; },
    deleteWarehouseById: async (id) => { calls.push(['warehouse', id]); },
  };
};
const input = { user: { role: Roles.GENERAL_MANAGER }, warehouseId: 'source', confirmationName: 'Test Warehouse' };

test('warehouse deletion denies every non-GM role even with inventory permissions', async () => {
  for (const role of Object.values(Roles).filter((role) => role !== Roles.GENERAL_MANAGER)) {
    const repository = makeRepository();
    repository.findWarehouseById = async () => assert.fail('must reject before database access');
    await assert.rejects(deleteWarehouseWithInventory({ ...input, user: { role, customPermissions: [Permission.MANAGE_MATERIAL_INVENTORY] }, repository }), { statusCode: 403 });
    assert.deepEqual(repository.calls, []);
  }
});

test('deletes source inventory and exclusive materials while retaining shared materials', async () => {
  const repository = makeRepository();
  const result = await deleteWarehouseWithInventory({ ...input, repository });
  assert.deepEqual(repository.calls, [['materials', ['exclusive']], ['transactions', 'source'], ['balances', 'source'], ['warehouse', 'source']]);
  assert.equal(result.deletedMaterialsCount, 1);
  assert.equal(result.retainedSharedMaterialsCount, 1);
  assert.equal(result.deletedBalancesCount, 2);
  assert.equal(result.deletedTransactionsCount, 3);
});

test('empty warehouse deletion does not require a transfer destination', async () => {
  const repository = makeRepository({ materials: [], shared: [] });
  const result = await deleteWarehouseWithInventory({ ...input, repository });
  assert.equal(result.deletedMaterialsCount, 0);
  assert.deepEqual(repository.calls.at(-1), ['warehouse', 'source']);
});

test('rejects an incorrect confirmation or missing warehouse before deleting anything', async () => {
  const repository = makeRepository();
  await assert.rejects(deleteWarehouseWithInventory({ ...input, confirmationName: 'wrong', repository }), { statusCode: 400 });
  assert.deepEqual(repository.calls, []);
  repository.findWarehouseById = async () => null;
  await assert.rejects(deleteWarehouseWithInventory({ ...input, repository }), { statusCode: 404 });
  assert.deepEqual(repository.calls, []);
});

test('cleanup failure keeps warehouse and source balances available for retry', async () => {
  const repository = makeRepository();
  repository.deleteStockTransactionsByWarehouse = async () => { throw new Error('database unavailable'); };
  await assert.rejects(deleteWarehouseWithInventory({ ...input, repository }), /database unavailable/);
  assert.deepEqual(repository.calls, [['materials', ['exclusive']]]);
});
