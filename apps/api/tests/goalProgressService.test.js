import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateGoalProgressPercent,
  resolveGoalPeriod,
} from '../src/application/services/goalProgressService.js';

test('calculateGoalProgressPercent returns rounded percentage for active goal', () => {
  assert.equal(
    calculateGoalProgressPercent({
      currentPoints: 45,
      targetPoints: 100,
    }),
    45,
  );
});

test('calculateGoalProgressPercent allows overachievement visibility', () => {
  assert.equal(
    calculateGoalProgressPercent({
      currentPoints: 135,
      targetPoints: 100,
    }),
    135,
  );
});

test('resolveGoalPeriod detects daily and weekly and monthly windows', () => {
  assert.equal(
    resolveGoalPeriod({
      startDate: '2026-03-01',
      endDate: '2026-03-01',
    }),
    'DAILY',
  );

  assert.equal(
    resolveGoalPeriod({
      startDate: '2026-03-01',
      endDate: '2026-03-07',
    }),
    'WEEKLY',
  );

  assert.equal(
    resolveGoalPeriod({
      startDate: '2026-03-01',
      endDate: '2026-03-31',
    }),
    'MONTHLY',
  );
});

test('resolveGoalPeriod falls back to custom for arbitrary ranges', () => {
  assert.equal(
    resolveGoalPeriod({
      startDate: '2026-03-10',
      endDate: '2026-03-22',
    }),
    'CUSTOM',
  );
});
