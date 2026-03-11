import test from 'node:test';
import assert from 'node:assert/strict';
import { Roles } from '../src/shared/constants.js';
import {
  applyManagedScopeOnFilter,
  isUserWithinManagedScope,
  resolveManagedUserIds,
} from '../src/shared/accessScope.js';

const createUserRepositoryStub = ({ actor, nodes }) => ({
  findById: async () => actor,
  listHierarchyNodes: async () => nodes,
});

test('resolveManagedUserIds returns only self for technical staff', async () => {
  const ids = await resolveManagedUserIds({
    userRepository: createUserRepositoryStub({ actor: null, nodes: [] }),
    actorId: 'u-tech',
    actorRole: Roles.TECHNICAL_STAFF,
  });

  assert.deepEqual(ids, ['u-tech']);
});

test('resolveManagedUserIds returns hierarchy descendants for project manager', async () => {
  const ids = await resolveManagedUserIds({
    userRepository: createUserRepositoryStub({
      actor: { _id: 'm1', department: 'Engineering' },
      nodes: [
        { _id: 'm1', manager: null, department: 'Engineering' },
        { _id: 'e1', manager: 'm1', department: 'Engineering' },
        { _id: 'e2', manager: 'e1', department: 'Engineering' },
        { _id: 'x1', manager: null, department: 'Finance' },
      ],
    }),
    actorId: 'm1',
    actorRole: Roles.PROJECT_MANAGER,
  });

  assert.deepEqual([...ids].sort(), ['e1', 'e2', 'm1']);
});

test('resolveManagedUserIds adds same-department users for general manager', async () => {
  const ids = await resolveManagedUserIds({
    userRepository: createUserRepositoryStub({
      actor: { _id: 'g1', department: 'Operations' },
      nodes: [
        { _id: 'g1', manager: null, department: 'Operations' },
        { _id: 'o1', manager: null, department: 'Operations' },
        { _id: 's1', manager: null, department: 'Sales' },
      ],
    }),
    actorId: 'g1',
    actorRole: Roles.GENERAL_MANAGER,
  });

  assert.deepEqual([...ids].sort(), ['g1', 'o1']);
});

test('resolveManagedUserIds keeps unrestricted roles unfiltered', async () => {
  const ids = await resolveManagedUserIds({
    userRepository: createUserRepositoryStub({
      actor: { _id: 'h1', department: 'HR' },
      nodes: [],
    }),
    actorId: 'h1',
    actorRole: Roles.HR_MANAGER,
  });

  assert.equal(ids, null);
});

test('applyManagedScopeOnFilter blocks out-of-scope requested user', () => {
  const filter = {};

  applyManagedScopeOnFilter({
    filter,
    managedUserIds: ['u1', 'u2'],
    field: 'assignee',
    requestedUserId: 'u3',
  });

  assert.deepEqual(filter, { assignee: { $in: [] } });
});

test('isUserWithinManagedScope respects restricted scopes', () => {
  assert.equal(isUserWithinManagedScope({ managedUserIds: ['a1', 'a2'], userId: 'a1' }), true);
  assert.equal(isUserWithinManagedScope({ managedUserIds: ['a1', 'a2'], userId: 'x9' }), false);
  assert.equal(isUserWithinManagedScope({ managedUserIds: null, userId: 'x9' }), true);
});
