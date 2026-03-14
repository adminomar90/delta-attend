import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildChildrenByManager,
  buildUsersById,
  resolveEffectiveManagerId,
  wouldCreateManagementCycle,
} from '../src/shared/employeeHierarchy.js';

test('resolveEffectiveManagerId skips inactive managers and climbs to the next active parent', () => {
  const users = [
    { _id: 'gm1', manager: null, active: true, deletedAt: null },
    { _id: 'm1', manager: 'gm1', active: false, deletedAt: null },
    { _id: 'e1', manager: 'm1', active: true, deletedAt: null },
  ];

  const usersById = buildUsersById(users);
  const effectiveManagerId = resolveEffectiveManagerId({
    user: users[2],
    usersById,
    skipInactiveManagers: true,
  });

  assert.equal(effectiveManagerId, 'gm1');
});

test('wouldCreateManagementCycle detects assigning a user under their descendant', () => {
  const usersById = buildUsersById([
    { _id: 'gm1', manager: null, active: true, deletedAt: null },
    { _id: 'm1', manager: 'gm1', active: true, deletedAt: null },
    { _id: 'e1', manager: 'm1', active: true, deletedAt: null },
  ]);

  assert.equal(
    wouldCreateManagementCycle({
      usersById,
      userId: 'gm1',
      managerId: 'e1',
    }),
    true,
  );
});

test('buildChildrenByManager keeps inactive employees visible when explicitly requested', () => {
  const users = [
    { _id: 'gm1', manager: null, active: true, deletedAt: null },
    { _id: 'm1', manager: 'gm1', active: false, deletedAt: null },
    { _id: 'e1', manager: 'm1', active: true, deletedAt: null },
  ];

  const activeOnly = buildChildrenByManager(users);
  const includeInactive = buildChildrenByManager(users, { includeInactive: true });

  assert.deepEqual(activeOnly.childrenByManager.get('gm1'), ['e1']);
  assert.deepEqual(includeInactive.childrenByManager.get('gm1'), ['m1']);
  assert.deepEqual(includeInactive.childrenByManager.get('m1'), ['e1']);
});
