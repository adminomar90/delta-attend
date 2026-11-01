import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSubmission, assertTransition, baghdadDate, nextOccurrence, overdue, executionMinutes } from '../src/application/services/ticketPolicy.js';
test('Baghdad wall clock is stored as an unambiguous UTC instant', () => {
  assert.equal(baghdadDate('2026-10-29T09:30').toISOString(), '2026-10-29T06:30:00.000Z');
  assert.equal(baghdadDate('2026-10-29T09:30+03:00').toISOString(), '2026-10-29T06:30:00.000Z');
  assert.throws(() => baghdadDate('invalid'));
});
test('waiting, cancellation, return and reopen require reasons', () => {
  assert.throws(() => assertTransition({ status: 'IN_PROGRESS' }, 'WAITING', { reason: 'waiting' }));
  assert.doesNotThrow(() => assertTransition({ status: 'IN_PROGRESS' }, 'WAITING', { reason: 'waiting', waitingParty: 'customer' }));
  assert.throws(() => assertTransition({ status: 'SUBMITTED' }, 'REJECTED'));
  assert.throws(() => assertTransition({ status: 'ASSIGNED' }, 'APPROVED'));
  assert.throws(() => assertTransition({ status: 'APPROVED' }, 'IN_PROGRESS'));
});
test('submission requires actual output and technical evidence', () => {
  assert.throws(() => assertSubmission({ requireOutput: true, attachments: [] }, {}));
  assert.throws(() => assertSubmission({ requireOutput: true, outputType: 'EXCEL', attachments: [{ purpose: 'OUTPUT', originalName: 'photo.png' }] }, {}));
  assert.throws(() => assertSubmission({ execution: { diagnosis: 'x', actionTaken: 'x', testResult: '' } }, { technical: true }));
  assert.doesNotThrow(() => assertSubmission({ requireOutput: true, attachments: [{ purpose: 'OUTPUT' }], execution: { diagnosis: 'x', actionTaken: 'x', testResult: 'pass', signatureUnavailableReason: 'customer away' } }, { technical: true }));
});
test('execution duration excludes time awaiting external action and review', () => {
  const history = [
    { at: '2026-10-29T09:00Z', after: { status: 'IN_PROGRESS' } },
    { at: '2026-10-29T10:00Z', after: { status: 'WAITING' } },
    { at: '2026-10-29T12:00Z', after: { status: 'IN_PROGRESS' } },
    { at: '2026-10-29T12:30Z', after: { status: 'SUBMITTED' } },
  ];
  assert.equal(executionMinutes({ history }), 90);
  assert.equal(executionMinutes({ history, execution: { workMinutes: 40 } }), 40);
});
test('lateness is independent of workflow and monthly recurrence handles month ends', () => {
  assert.equal(overdue({ status: 'SUBMITTED', dueDate: '2020-01-01' }), true);
  assert.equal(overdue({ status: 'APPROVED', dueDate: '2020-01-01' }), false);
  assert.equal(nextOccurrence('2026-01-31T09:00:00Z', { frequency: 'MONTHLY' }).toISOString(), '2026-02-28T09:00:00.000Z');
  assert.equal(nextOccurrence('2026-01-31T09:00:00Z', { frequency: 'DAILY', until: '2026-01-31' }), null);
});
