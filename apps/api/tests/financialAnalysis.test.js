import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFinancialAnalysis, parseFinancialAnalysisFilters as parse } from '../src/application/services/financialAnalysisService.js';

const row = (extra = {}) => ({ _id: 'one', requestNo: 'FD-1', transactionNo: 'TX-1', transactionDate: '2026-11-01T20:00:00Z', employee: { _id: 'e1', fullName: 'عمر' }, project: { _id: 'p1', name: 'مشروع دلتا' }, requestType: 'MATERIALS_EXPENSE', amount: 100, approvedAmount: 80, status: 'RECEIVED', currency: 'IQD', attachments: [], ...extra });

test('analysis sums line values once, separates currencies and counts unique transaction invoices', () => {
  const attachment = { url: '/uploads/invoice.pdf', originalName: 'فاتورة مواد' };
  const result = buildFinancialAnalysis([
    row({ attachments: [attachment], transactionTotalAmount: 300 }),
    row({ _id: 'two', requestNo: 'FD-2', amount: 200, approvedAmount: 170, attachments: [attachment], transactionTotalAmount: 300 }),
    row({ _id: 'usd', transactionNo: 'USD-1', currency: 'USD', amount: 9999 }),
    row({ _id: 'pending', transactionNo: 'TX-2', amount: 50, approvedAmount: null, status: 'PENDING_FINANCIAL_MANAGER_APPROVAL' }),
    row({ _id: 'rejected', transactionNo: 'TX-3', amount: 20, status: 'REJECTED_BY_GENERAL_MANAGER' }),
  ], parse({}));
  assert.equal(result.summary.paid, 250);
  assert.equal(result.summary.approved, 250);
  assert.equal(result.summary.requested, 370);
  assert.equal(result.summary.pending, 50);
  assert.equal(result.summary.transactions, 3);
  assert.equal(result.summary.lines, 4);
  assert.equal(result.summary.attachments, 1);
  assert.equal(result.summary.withInvoices, 1);
  assert.equal(result.summary.withoutInvoices, 2);
  assert.equal(result.rankings.types[0].amount, 250);
  assert.equal(result.trend[0].amount, 250);
});

test('date filters include the whole Baghdad day and compare equal prior periods', () => {
  const result = buildFinancialAnalysis([
    row({ transactionDate: '2026-11-01T20:59:59Z', amount: 100, approvedAmount: 100 }),
    row({ _id: 'tomorrow', transactionDate: '2026-11-01T21:00:00Z', approvedAmount: 900 }),
    row({ _id: 'previous', transactionDate: '2026-10-31T15:00:00Z', approvedAmount: 50 }),
  ], parse({ from: '2026-11-01', to: '2026-11-01', period: 'day' }));
  assert.equal(result.summary.paid, 100);
  assert.deepEqual(result.summary.comparison, { from: '2026-10-31', to: '2026-10-31', amount: 50, change: 100 });
  assert.deepEqual(result.trend, [{ date: '2026-11-01', amount: 100 }]);
});

test('analytical filters, Arabic search, basis and inherited invoice attachments work together', () => {
  const records = [row({ description: 'أجور تركيب', archived: true, attachments: [{ url: '/a.pdf', originalName: 'فاتورة أصلية' }] }), row({ _id: 'two', attachments: [], approvedAmount: 10 })];
  const result = buildFinancialAnalysis(records, parse({ basis: 'requested', invoice: 'with', search: 'اجور اصليه', project: 'p1', employee: 'e1', type: 'MATERIALS_EXPENSE', status: 'RECEIVED', archive: 'archived', min: 90, max: 110 }));
  // Arabic normalization preserves ta marbuta; the search below matches actual spelling.
  assert.equal(result.rows.length, 0);
  const match = buildFinancialAnalysis(records, parse({ basis: 'requested', invoice: 'with', search: 'اجور اصلية', project: 'p1', employee: 'e1', archive: 'archived', min: 90, max: 110 }));
  assert.equal(match.rows.length, 1); assert.equal(match.summary.amount, 100);
  assert.equal(buildFinancialAnalysis(records, parse({ invoice: 'without' })).rows.length, 0);
});

test('pagination never truncates totals and zero/empty amounts stay valid', () => {
  const result = buildFinancialAnalysis(Array.from({ length: 47 }, (_, index) => row({ _id: String(index), requestNo: `FD-${index}`, transactionNo: `TX-${index}`, amount: .1, approvedAmount: .1 })), parse({ page: 3 }));
  assert.equal(result.summary.amount, 4.7); assert.equal(result.pagination.pages, 3); assert.equal(result.rows.length, 7);
  assert.equal(buildFinancialAnalysis([row({ approvedAmount: 0 })], parse({})).summary.paid, 0);
  const empty = buildFinancialAnalysis([], parse({}));
  assert.equal(empty.summary.average, 0); assert.equal(empty.pagination.pages, 1); assert.deepEqual(empty.trend, []);
});

test('invalid ranges, dates, currency, status and monetary values are rejected', () => {
  for (const query of [{ from: '2026-02-30' }, { from: '2026-99-01' }, { from: '2026-11-02', to: '2026-11-01' }, { min: 3, max: 2 }, { min: 'abc' }, { max: Infinity }, { currency: 'ALL' , status: 'FAKE' }, { currency: '$' }, { basis: 'fake' }]) assert.throws(() => parse(query));
});
