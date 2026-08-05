import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectStageModel, ProjectStageStatus } from '../src/infrastructure/db/models/ProjectStageModel.js';

test('project stage defaults to not started and accepts progress percent', () => {
  const stage = new ProjectStageModel({
    project: '507f1f77bcf86cd799439011',
    name: 'مرحلة التأسيس',
    progressPercent: 10,
  });

  assert.equal(stage.status, ProjectStageStatus.NOT_STARTED);
  assert.equal(stage.progressPercent, 10);
});

test('project stage rejects invalid status values', async () => {
  const stage = new ProjectStageModel({
    project: '507f1f77bcf86cd799439011',
    name: 'مرحلة غير صالحة',
    status: 'UNKNOWN',
  });

  await assert.rejects(() => stage.validate(), /UNKNOWN/);
});
