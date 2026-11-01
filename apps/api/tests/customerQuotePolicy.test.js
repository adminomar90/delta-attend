import test from 'node:test';
import assert from 'node:assert/strict';
import { quoteTotals, quoteNumber, quoteExpiry } from '../src/application/services/customerQuotePolicy.js';
import { isPublicRoute } from '../../web/lib/publicRoutes.mjs';

test('quotation totals use rounded line amounts and separate installation and programming', () => {
  assert.deepEqual(quoteTotals([{ quantity: 3, unitPrice: .1 }, { quantity: 1.5, unitPrice: .2 }], .1, .2), { lineTotals: [.3, .3], productsTotal: .6, total: .9 });
  assert.equal(quoteTotals([{ quantity: 2, unitPrice: 15000 }], 10000, 5000).total, 45000);
  assert.throws(() => quoteTotals([{ quantity: 100000, unitPrice: 100000000 }]));
});
test('invalid amounts and dates are rejected; expiry uses end of Baghdad business day', () => {
  for (const value of ['', null, true, -1, 'NaN', Infinity]) assert.throws(() => quoteNumber(value));
  assert.equal(quoteExpiry('2027-03-05').toISOString(), '2027-03-05T20:59:59.999Z');
  assert.throws(() => quoteExpiry('2027-02-30'));
  assert.equal(isPublicRoute('/customer-quote/secure-token'), true);
  assert.equal(isPublicRoute('/customer-quotes'), false);
});

test('discount is deducted from products and services and cannot exceed the gross total', () => {
  const items = [{ quantity: 2, unitPrice: 15000 }];
  assert.equal(quoteTotals(items, 10000, 5000, 5000).total, 40000);
  assert.equal(quoteTotals(items, 10000, 5000, 45000).total, 0);
  assert.equal(quoteTotals(items, 10000, 5000, 0).total, 45000);
  for (const amount of [-1, 45000.01, NaN, Infinity]) assert.throws(() => quoteTotals(items, 10000, 5000, amount));
});
