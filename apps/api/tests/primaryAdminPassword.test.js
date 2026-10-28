import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { PRIMARY_ADMIN_EMAIL, verifyPrimaryAdminPassword } from '../src/application/services/primaryAdminPasswordService.js';

const fixture = async () => {
  const actor = { id: 'manager', role: 'GENERAL_MANAGER' };
  const requester = { _id: actor.id, role: actor.role, active: true, authFailureCount: 0 };
  const admin = { _id: 'primary', role: 'GENERAL_MANAGER', active: true, passwordHash: await bcrypt.hash('Primary-Only-Password ', 4) };
  let checkedEmail;
  const userRepository = {
    findById: async () => requester,
    findByEmail: async (email) => { checkedEmail = email; return admin; },
    incrementAuthFailures: async () => { requester.authFailureCount++; return requester; },
    clearAuthFailures: async () => { requester.authFailureCount = 0; },
    lockUser: async (id, until) => { assert.equal(id, requester._id); requester.lockedUntil = until; },
  };
  return { actor, requester, admin, userRepository, email: () => checkedEmail };
};

test('confirmation verifies only the primary account and preserves password whitespace', async () => {
  const input = await fixture();
  await assert.rejects(verifyPrimaryAdminPassword({ ...input, password: 'Primary-Only-Password' }), { statusCode: 403 });
  const result = await verifyPrimaryAdminPassword({ ...input, password: 'Primary-Only-Password ' });
  assert.equal(input.email(), PRIMARY_ADMIN_EMAIL);
  assert.deepEqual(result, { authorizedBy: 'primary' });
  assert.equal(input.requester.authFailureCount, 0);
});

test('missing password, inactive primary, locked primary and non-GM are rejected', async () => {
  const input = await fixture();
  await assert.rejects(verifyPrimaryAdminPassword(input), { statusCode: 400 });
  await assert.rejects(verifyPrimaryAdminPassword({ ...input, actor: { role: 'WAREHOUSE_KEEPER' }, password: 'x' }), { statusCode: 403 });
  input.admin.active = false;
  await assert.rejects(verifyPrimaryAdminPassword({ ...input, password: 'x' }), { statusCode: 403 });
  input.admin.active = true; input.admin.lockedUntil = new Date(Date.now() + 60000);
  await assert.rejects(verifyPrimaryAdminPassword({ ...input, password: 'x' }), { statusCode: 423 });
});

test('repeated invalid confirmations lock the requester and do not lock another primary account', async () => {
  const input = await fixture();
  await assert.rejects(verifyPrimaryAdminPassword({ ...input, password: 'wrong', maxFailures: 2 }), { statusCode: 403 });
  await assert.rejects(verifyPrimaryAdminPassword({ ...input, password: 'wrong', maxFailures: 2 }), { statusCode: 423 });
  assert.ok(input.requester.lockedUntil > new Date());
  assert.equal(input.admin.lockedUntil, undefined);
  await assert.rejects(verifyPrimaryAdminPassword({ ...input, password: 'Primary-Only-Password ' }), { statusCode: 423 });
});
