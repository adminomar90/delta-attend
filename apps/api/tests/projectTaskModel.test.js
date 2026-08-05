import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectTaskModel, ProjectTaskPriority, ProjectTaskStatus } from '../src/infrastructure/db/models/ProjectTaskModel.js';

test('project task defaults to new status and medium priority', () => {
  const task = new ProjectTaskModel({
    project: '507f1f77bcf86cd799439011',
    stage: '507f1f77bcf86cd799439012',
    title: 'تجهيز الموقع',
  });

  assert.equal(task.status, ProjectTaskStatus.NEW);
  assert.equal(task.priority, ProjectTaskPriority.MEDIUM);
  assert.equal(task.progressPercent, 0);
});

test('project task rejects invalid priority', async () => {
  const task = new ProjectTaskModel({
    project: '507f1f77bcf86cd799439011',
    stage: '507f1f77bcf86cd799439012',
    title: 'مهمة غير صالحة',
    priority: 'IMPOSSIBLE',
  });

  await assert.rejects(() => task.validate(), /IMPOSSIBLE/);
});
