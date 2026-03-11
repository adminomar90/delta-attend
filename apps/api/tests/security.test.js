import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePasswordStrength, hashOtp } from '../src/shared/security.js';

test('validatePasswordStrength accepts strong password', () => {
  const result = validatePasswordStrength('Strong@123');
  assert.equal(result.valid, true);
  assert.equal(result.failures.length, 0);
});

test('validatePasswordStrength rejects weak password', () => {
  const result = validatePasswordStrength('weak');
  assert.equal(result.valid, false);
  assert.ok(result.failures.length > 0);
});

test('hashOtp returns deterministic hash', () => {
  const a = hashOtp('123456');
  const b = hashOtp('123456');
  assert.equal(a, b);
});
