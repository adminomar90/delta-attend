import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveCustodyStatus,
  normalizeReconciliationQuantities,
} from '../src/application/services/materialReconciliationService.js';

test('reconciliation rejects a disposition total greater than received quantity', () => {
  assert.throws(
    () => normalizeReconciliationQuantities({
      receivedQty: 150,
      input: { consumedQty: 140, damagedQty: 5, lostQty: 50, remainingQty: 0, toReturnQty: 0 },
    }),
    /لا يمكن أن يتجاوز الكمية المستلمة/,
  );
});

test('reconciliation requires remaining quantity to balance exactly', () => {
  assert.throws(
    () => normalizeReconciliationQuantities({
      receivedQty: 10,
      input: { consumedQty: 4, damagedQty: 1, lostQty: 0, remainingQty: 7, toReturnQty: 7 },
    }),
    /الكمية المتبقية لا تطابق/,
  );
});

test('reconciliation accepts a balanced partial return', () => {
  assert.deepEqual(
    normalizeReconciliationQuantities({
      receivedQty: 10,
      input: { consumedQty: 4, damagedQty: 1, lostQty: 0, remainingQty: 5, toReturnQty: 3 },
    }),
    {
      receivedQty: 10,
      consumedQty: 4,
      damagedQty: 1,
      lostQty: 0,
      remainingQty: 5,
      toReturnQty: 3,
    },
  );
});

test('custody status is derived from approved quantities only', () => {
  assert.equal(deriveCustodyStatus([{ receivedQty: 10, remainingQty: 10 }]), 'OPEN');
  assert.equal(deriveCustodyStatus([{ receivedQty: 10, consumedQty: 4, remainingQty: 6 }]), 'PARTIALLY_RECONCILED');
  assert.equal(deriveCustodyStatus([{ receivedQty: 10, consumedQty: 8, damagedQty: 2 }]), 'FULLY_RECONCILED');
});
