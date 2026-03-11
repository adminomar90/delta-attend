import test from 'node:test';
import assert from 'node:assert/strict';
import { pointsCalculator } from '../src/application/services/pointsCalculator.js';

test('calculateTaskPoints uses plannedPoints when provided', () => {
  const points = pointsCalculator.calculateTaskPoints({
    plannedPoints: 175,
    difficulty: 1,
    urgency: 1,
    estimatedHours: 1,
    dueDate: new Date(),
    completedAt: new Date(),
  });

  assert.equal(points, 175);
});

test('applyDailyCap enforces remaining points for the day', () => {
  const granted = pointsCalculator.applyDailyCap(120, 260);
  assert.equal(granted, 60);
});
