import test from 'node:test';
import assert from 'node:assert/strict';
import PDFDocument from 'pdfkit';
import { buildCustomerQuotePdf } from '../src/infrastructure/reports/customerQuotePdfBuilder.js';

test('customer quote PDF repeats table headers, preserves mixed model codes and renders English digits', async () => {
  const written = [], original = PDFDocument.prototype.text;
  PDFDocument.prototype.text = function (value, ...args) { if (typeof value === 'string') written.push(value); return original.call(this, value, ...args); };
  let pdf;
  try {
    pdf = await buildCustomerQuotePdf({ quoteNo: 'CQ-2026-00001', title: 'عرض كاميرات Dahua', customerName: 'شركة دلتا', address: 'بغداد', createdAt: '2026-11-01', validUntil: '2026-12-01', currency: 'IQD', items: Array.from({ length: 35 }, () => ({ name: 'كاميرا مراقبة Dahua IPC-HFW1234 مع التركيب والبرمجة واختبار منظومة التسجيل', unit: 'PIECE', quantity: 2, unitPrice: 15000, total: 30000 })), productsTotal: 1050000, installationFee: 10000, programmingFee: 5000, total: 1065000, notes: 'تم اختبار المنظومة', terms: 'ضمان سنة' });
  } finally { PDFDocument.prototype.text = original; }
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  assert.ok(written.filter((value) => value === 'المنتج').length >= 2);
  assert.ok(written.some((value) => value.includes('Dahua IPC-HFW1234')));
  assert.ok(written.includes('1,065,000 IQD'));
  assert.equal(written.some((value) => /[٠-٩۰-۹]/.test(value)), false);
});

test('PDF shows a discount and net amount only for positive discounts, including legacy quotes', async () => {
  const original = PDFDocument.prototype.text;
  try {
    for (const discount of [undefined, 0, 5000]) {
      const written = [];
      PDFDocument.prototype.text = function (value, ...args) { if (typeof value === 'string') written.push(value); return original.call(this, value, ...args); };
      await buildCustomerQuotePdf({ quoteNo: 'CQ-2026-00002', createdAt: '2026-11-01', validUntil: '2026-12-01', currency: 'IQD', items: [{ name: 'كاميرا', unit: 'PIECE', quantity: 2, unitPrice: 15000, total: 30000 }], productsTotal: 30000, installationFee: 10000, programmingFee: 5000, discount, total: 45000 - (discount || 0) });
      assert.equal(written.includes('الخصم'), discount === 5000);
      assert.equal(written.includes('الإجمالي قبل الخصم'), discount === 5000);
      if (discount) { assert.ok(written.includes('-5,000 IQD')); assert.ok(written.includes('40,000 IQD')); }
      else assert.ok(written.includes('45,000 IQD'));
    }
  } finally { PDFDocument.prototype.text = original; }
});

const paginationQuote = (count, longNames = false) => ({
  quoteNo: 'CQ-2026-PAGE', title: 'عرض تجهيز منظومة المراقبة', customerName: 'شركة دلتا بلص', address: 'بغداد - الكرادة', createdAt: '2026-11-01', validUntil: '2026-12-01', currency: 'IQD',
  items: Array.from({ length: count }, (_, i) => ({ name: longNames ? 'كاميرا مراقبة خارجية Dahua IPC-HFW1234 مع الملحقات والربط والبرمجة' : `Camera-${String(i + 1).padStart(2, '0')}`, unit: 'PIECE', quantity: 2, unitPrice: 15000, total: 30000 })),
  productsTotal: count * 30000, installationFee: 10000, programmingFee: 5000, discount: 5000, total: count * 30000 + 10000,
  notes: 'الأسعار تشمل المواد الموضحة في هذا العرض.\nيتم تنسيق موعد التركيب مع الزبون.', terms: 'ضمان سنة واحدة على عيوب الصناعة.',
});
const pageCount = (pdf) => (pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length;

test('adaptive sizing fits several products and their photos, services, discount and terms on one A4 page', async () => {
  for (const count of [2, 8, 12]) assert.equal(pageCount(await buildCustomerQuotePdf(paginationQuote(count))), 1, `${count} products should fit on one page`);
  assert.equal(pageCount(await buildCustomerQuotePdf(paginationQuote(18, true))), 2, 'longer product names should continue cleanly onto a second page');
});

test('pagination preserves every row, repeats contact information and keeps the summary with the final products', async () => {
  const written = [], original = PDFDocument.prototype.text;
  PDFDocument.prototype.text = function (value, ...args) { if (typeof value === 'string') written.push({ value, page: this.page }); return original.call(this, value, ...args); };
  let pdf;
  try { pdf = await buildCustomerQuotePdf(paginationQuote(15)); } finally { PDFDocument.prototype.text = original; }
  const count = pageCount(pdf); assert.equal(count, 2);
  const products = written.filter((item) => /^Camera-\d{2}$/.test(item.value));
  assert.equal(products.length, 15); assert.equal(new Set(products.map((item) => item.value)).size, 15);
  const final = products.at(-1).page;
  assert.ok(products.filter((item) => item.page === final).length >= 3, 'avoid a lone product on the last page');
  assert.equal(written.find((item) => item.value === 'الإجمالي بعد الخصم').page, final);
  assert.equal(written.filter((item) => item.value === 'المنتج').length, count);
  assert.equal(written.filter((item) => item.value === 'www.deltaplus-iq.com').length, count);
  assert.ok(written.some((item) => item.value === '1 / 2')); assert.ok(written.some((item) => item.value === '2 / 2'));
});

test('long notes continue with a heading and retain their final text without clipping', async () => {
  const written = [], original = PDFDocument.prototype.text;
  PDFDocument.prototype.text = function (value, ...args) { if (typeof value === 'string') written.push(value); return original.call(this, value, ...args); };
  let pdf;
  try { pdf = await buildCustomerQuotePdf({ ...paginationQuote(2), notes: 'ملاحظة مهمة حول التجهيز والربط واختبار الأعمال. '.repeat(60), terms: 'شروط تسليم الأعمال والضمان حسب الاتفاق. '.repeat(50) + '\nEND-OF-TERMS' }); }
  finally { PDFDocument.prototype.text = original; }
  assert.ok(pageCount(pdf) > 1); assert.equal(written.filter((value) => value === 'END-OF-TERMS').length, 1);
  assert.ok(written.some((value) => value.includes('(تابع)')));
});
