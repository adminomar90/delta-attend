import test from 'node:test';
import assert from 'node:assert/strict';
import { workReportPointsService } from '../src/application/services/workReportPointsService.js';

test('calculateDistribution keeps full points for report author when there are no participants', () => {
  const distribution = workReportPointsService.calculateDistribution(100, 0);

  assert.equal(distribution.totalPoints, 100);
  assert.equal(distribution.reporterPoints, 100);
  assert.equal(distribution.participantsTotalPoints, 0);
  assert.equal(distribution.participantPoints, 0);
});

test('calculateDistribution splits report points between author and participants', () => {
  const distribution = workReportPointsService.calculateDistribution(100, 4);

  assert.equal(distribution.totalPoints, 100);
  assert.equal(distribution.reporterPoints, 35);
  assert.equal(distribution.participantsTotalPoints, 65);
  assert.equal(distribution.participantPoints, 16.25);
});
