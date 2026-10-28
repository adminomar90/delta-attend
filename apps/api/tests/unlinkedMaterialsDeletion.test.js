import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { deleteUnlinkedMaterials, previewUnlinkedMaterialsDeletion } from '../src/application/services/unlinkedMaterialsDeletionService.js';

test('only general manager may preview or delete unlinked products', async () => {
  for (const role of ['TECHNICAL_STAFF', 'WAREHOUSE_KEEPER', 'PROJECT_MANAGER']) {
    const input = { user: { role, customPermissions: ['MANAGE_MATERIAL_INVENTORY'] }, repository: {} };
    await assert.rejects(previewUnlinkedMaterialsDeletion(input), { statusCode: 403 });
    await assert.rejects(deleteUnlinkedMaterials(input), { statusCode: 403 });
  }
});

test('permanent cleanup requires primary admin password and deletes only selected products', async () => {
  let deleted = [];
  const repository = { findUnlinkedMaterialIds: async () => ['a', 'b'], findMaterialsForDeletion: async () => [{ _id: 'a', name: 'First' }, { _id: 'b', name: 'Second' }], deleteUnlinkedMaterialInventory: async (ids) => { deleted = ids; return { deletedMaterialsCount: ids.length }; } };
  const passwordHash = await bcrypt.hash('Primary-Test-Password', 4);
  const account = { _id: 'gm', role: 'GENERAL_MANAGER', active: true, passwordHash };
  const userRepository = { findById: async () => account, findByEmail: async () => account, incrementAuthFailures: async () => ({ authFailureCount: 1 }), clearAuthFailures: async () => {} };
  const input = { user: { id: 'gm', role: 'GENERAL_MANAGER' }, userRepository, adminPassword: 'Primary-Test-Password', repository, materialIds: ['a', 'b'], expectedCount: 2 };
  assert.equal((await previewUnlinkedMaterialsDeletion(input)).count, 2);
  await assert.rejects(deleteUnlinkedMaterials({ ...input, adminPassword: '' }), { statusCode: 400 });
  await assert.rejects(deleteUnlinkedMaterials({ ...input, adminPassword: 'wrong' }), { statusCode: 403 });
  await assert.rejects(deleteUnlinkedMaterials({ ...input, adminPassword: undefined, confirmationText: 'old confirmation' }), { statusCode: 400 });
  await assert.rejects(deleteUnlinkedMaterials({ ...input, expectedCount: 1 }), { statusCode: 409 });
  assert.deepEqual(deleted, []);
  assert.equal((await deleteUnlinkedMaterials(input)).deletedMaterialsCount, 2);
  assert.deepEqual(deleted, ['a', 'b']);
  assert.equal((await deleteUnlinkedMaterials({ ...input, materialIds: ['b'], expectedCount: 1 })).deletedMaterialsCount, 1);
  assert.deepEqual(deleted, ['b']);
  await assert.rejects(deleteUnlinkedMaterials({ ...input, materialIds: [] }), { statusCode: 400 });
  await assert.rejects(deleteUnlinkedMaterials({ ...input, materialIds: ['linked'], expectedCount: 1 }), { statusCode: 409 });
  assert.deepEqual(deleted, ['b']);
});
