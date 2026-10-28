import test from 'node:test';
import assert from 'node:assert/strict';
import { Roles, Permission } from '../src/shared/constants.js';
import { previewTechnicianCustodyReset, resetTechnicianCustodies, RESETTABLE_CUSTODY_STATUSES } from '../src/application/services/technicianCustodyResetService.js';

const setup = () => {
  const calls = [];
  const records = RESETTABLE_CUSTODY_STATUSES.map((status, index) => ({ _id: `custody-${index}`, custodyNo: `MC-${index}`, status, updatedAt: new Date('2026-01-01'), items: [{ remainingQty: 10 }] }));
  const repository = {
    findResettableTechnicianCustodies: async (technicianId, statuses) => {
      assert.equal(technicianId, 'selected-technician');
      assert.deepEqual(statuses, ['OPEN', 'PENDING_RECONCILIATION', 'PARTIALLY_RECONCILED', 'OVERDUE']);
      return records;
    },
    deleteTechnicianOpenCustodies: async (...args) => { calls.push(args); return { deletedCustodiesCount: args[1].length }; },
  };
  return {
    calls, records,
    options: { user: { role: Roles.GENERAL_MANAGER }, technicianId: 'selected-technician', repository,
      findUser: async () => ({ _id: 'selected-technician', fullName: 'Selected Technician', employeeCode: 'T1' }) },
  };
};

test('only GM may preview or reset custodies, even with custom inventory permissions', async () => {
  for (const role of Object.values(Roles).filter((role) => role !== Roles.GENERAL_MANAGER)) {
    const { options, calls } = setup();
    const forbidden = { ...options, user: { role, customPermissions: [Permission.MANAGE_MATERIAL_INVENTORY] }, findUser: async () => assert.fail('must deny before lookup') };
    await assert.rejects(previewTechnicianCustodyReset(forbidden), { statusCode: 403 });
    await assert.rejects(resetTechnicianCustodies(forbidden), { statusCode: 403 });
    assert.deepEqual(calls, []);
  }
});

test('reset deletes precisely the selected technician open custody IDs from the confirmed preview', async () => {
  const { options, calls } = setup();
  const preview = await previewTechnicianCustodyReset(options);
  assert.equal(preview.custodies.length, 4);
  assert.equal(preview.custodies[0].remainingQty, 10);
  const result = await resetTechnicianCustodies({ ...options, confirmationName: 'Selected Technician', previewToken: preview.previewToken });
  assert.equal(result.deletedCustodiesCount, 4);
  assert.deepEqual(calls, [['selected-technician', ['custody-0', 'custody-1', 'custody-2', 'custody-3'], RESETTABLE_CUSTODY_STATUSES]]);
});

test('incorrect name, missing preview and changed custody data reject reset without deleting', async () => {
  const { options, calls, records } = setup();
  const preview = await previewTechnicianCustodyReset(options);
  await assert.rejects(resetTechnicianCustodies({ ...options, confirmationName: 'Wrong', previewToken: preview.previewToken }), { statusCode: 400 });
  await assert.rejects(resetTechnicianCustodies({ ...options, confirmationName: 'Selected Technician' }), { statusCode: 409 });
  records[0].updatedAt = new Date('2026-01-02');
  await assert.rejects(resetTechnicianCustodies({ ...options, confirmationName: 'Selected Technician', previewToken: preview.previewToken }), { statusCode: 409 });
  assert.deepEqual(calls, []);
});

test('missing technician fails and empty preview is a safe no-op', async () => {
  const { options, records, calls } = setup();
  await assert.rejects(previewTechnicianCustodyReset({ ...options, findUser: async () => null }), { statusCode: 404 });
  records.length = 0;
  const preview = await previewTechnicianCustodyReset(options);
  assert.deepEqual(preview.custodies, []);
  const result = await resetTechnicianCustodies({ ...options, confirmationName: 'Selected Technician', previewToken: preview.previewToken });
  assert.equal(result.deletedCustodiesCount, 0);
  assert.deepEqual(calls[0][1], []);
});

test('unassigned reset uses a null holder filter and does not look up or include other technicians', async () => {
  const { options, calls } = setup();
  options.technicianId = 'unassigned';
  options.findUser = async () => assert.fail('unassigned custodies have no user');
  options.repository.findResettableTechnicianCustodies = async (holder, statuses) => {
    assert.equal(holder, null);
    assert.deepEqual(statuses, RESETTABLE_CUSTODY_STATUSES);
    return [{ _id: 'unassigned-custody', custodyNo: 'CU-UNKNOWN', status: 'OPEN', items: [] }];
  };
  const preview = await previewTechnicianCustodyReset(options);
  const result = await resetTechnicianCustodies({ ...options, previewToken: preview.previewToken, confirmationName: preview.technician.fullName });
  assert.equal(result.deletedCustodiesCount, 1);
  assert.deepEqual(calls, [[null, ['unassigned-custody'], RESETTABLE_CUSTODY_STATUSES]]);
});
