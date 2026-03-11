import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAttendanceMessage,
  buildWhatsAppSendUrl,
  haversineDistanceMeters,
  sanitizeWhatsappNumber,
} from '../src/shared/attendanceUtils.js';

test('sanitizeWhatsappNumber normalizes international number', () => {
  assert.equal(sanitizeWhatsappNumber('+964 770 123 4567'), '9647701234567');
  assert.equal(sanitizeWhatsappNumber('00770-123-4567'), '7701234567');
});

test('haversineDistanceMeters returns zero for same coordinates', () => {
  const distance = haversineDistanceMeters(33.3152, 44.3661, 33.3152, 44.3661);
  assert.ok(distance < 0.001);
});

test('buildWhatsAppSendUrl returns empty if phone is missing', () => {
  assert.equal(buildWhatsAppSendUrl('', 'hello'), '');
});

test('buildAttendanceMessage includes required fields in any-location mode', () => {
  const message = buildAttendanceMessage({
    mode: 'CHECK_IN',
    employeeName: 'Ahmed Ali',
    employeeCode: 'DP-1001',
    workSiteName: 'Any Location',
    policy: 'ANY_LOCATION',
    timestamp: new Date('2026-03-02T08:00:00Z'),
    latitude: 33.3152,
    longitude: 44.3661,
  });

  assert.ok(message.includes('Employee: Ahmed Ali'));
  assert.ok(message.includes('Employee Code: DP-1001'));
  assert.ok(message.includes('Attendance Policy: ANY_LOCATION'));
  assert.ok(message.includes('Type: Check-in'));
  assert.ok(message.includes('Location: https://maps.google.com/?q=33.3152,44.3661'));
});
