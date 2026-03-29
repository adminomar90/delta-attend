import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isIpInCidr,
  normalizeCidr,
  normalizeIpv4,
  normalizeMacAddress,
} from '../src/application/services/networkDocsService.js';
import {
  decryptSensitiveValue,
  encryptSensitiveValue,
} from '../src/shared/security.js';

test('normalizeIpv4 normalizes valid IPv4 values', () => {
  assert.equal(normalizeIpv4('010.001.001.001'), '10.1.1.1');
});

test('normalizeCidr normalizes CIDR values', () => {
  assert.equal(normalizeCidr('192.168.001.000/24'), '192.168.1.0/24');
});

test('isIpInCidr returns correct subnet membership', () => {
  assert.equal(isIpInCidr('192.168.1.25', '192.168.1.0/24'), true);
  assert.equal(isIpInCidr('192.168.2.25', '192.168.1.0/24'), false);
});

test('normalizeMacAddress formats MAC addresses consistently', () => {
  assert.equal(normalizeMacAddress('aa-bb-cc-dd-ee-ff'), 'AA:BB:CC:DD:EE:FF');
});

test('encryptSensitiveValue can be decrypted back to the same value', () => {
  const encrypted = encryptSensitiveValue('super-secret-value');
  assert.equal(decryptSensitiveValue(encrypted), 'super-secret-value');
});
