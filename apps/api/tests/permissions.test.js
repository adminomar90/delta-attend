import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePermissions } from '../src/presentation/middlewares/authorizationMiddleware.js';
import { Permission, Roles } from '../src/shared/constants.js';

test('resolvePermissions merges role and custom permissions', () => {
  const permissions = resolvePermissions({
    role: Roles.HR_MANAGER,
    customPermissions: [Permission.MANAGE_PROJECTS],
  });

  assert.ok(permissions.includes(Permission.MANAGE_USERS));
  assert.ok(permissions.includes(Permission.MANAGE_PROJECTS));
});

test('technical staff receives material request permissions', () => {
  const permissions = resolvePermissions({
    role: Roles.TECHNICAL_STAFF,
    customPermissions: [],
  });

  assert.ok(permissions.includes(Permission.CREATE_MATERIAL_REQUESTS));
  assert.ok(permissions.includes(Permission.RECONCILE_MATERIAL_CUSTODY));
});

test('technical staff cannot reconcile another employee custody by default', () => {
  const permissions = resolvePermissions({ role: Roles.TECHNICAL_STAFF });
  assert.equal(permissions.includes(Permission.RECONCILE_MATERIAL_CUSTODY), true);
  assert.equal(permissions.includes(Permission.RECONCILE_OTHERS_MATERIAL_CUSTODY), false);
});

test('general manager can reconcile another employee custody', () => {
  const permissions = resolvePermissions({ role: Roles.GENERAL_MANAGER });
  assert.equal(permissions.includes(Permission.RECONCILE_OTHERS_MATERIAL_CUSTODY), true);
});
