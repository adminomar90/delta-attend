import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectModel } from '../src/infrastructure/db/models/ProjectModel.js';

test('new projects are active immediately without approval roles', () => {
  const project = new ProjectModel({
    name: 'Direct project',
    code: 'DIRECT-001',
    owner: '507f1f77bcf86cd799439011',
  });

  assert.equal(project.status, 'ACTIVE');
  assert.deepEqual(project.requiredApprovalRoles, []);
});
