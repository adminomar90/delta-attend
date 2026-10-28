import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTechnicianCustodyPdfBuffer, prepareCustodyPdfLine } from '../src/infrastructure/reports/technicianCustodyPdfBuilder.js';

test('mixed Arabic PDF lines retain the readable ordering of codes and phone numbers', () => {
  assert.equal(prepareCustodyPdfLine('CU-2026-00001'), 'CU-2026-00001');
  assert.equal(prepareCustodyPdfLine('100.5'), '100.5');
  assert.equal(prepareCustodyPdfLine('ذمة رقم CU-2026-00001'), 'ذمة رقم 10000-6202-UC');
  assert.equal(prepareCustodyPdfLine('الهاتف: 07701234567'), 'الهاتف: 76543210770');
});

test('a one-custody statement embeds Arabic fonts and stays on one page', async () => {
  const pdf = await buildTechnicianCustodyPdfBuffer({
    holder: { fullName: 'أحمد محمد', employeeCode: 'TECH-001', phone: '07701234567' }, single: true,
    custodies: [{ custodyNo: 'CU-2026-00001', status: 'OPEN', project: { name: 'مشروع الحماية' }, openedAt: new Date('2026-10-27'), items: [
      { materialName: 'كيبل شبكة CAT6', material: { code: 'MAT-001' }, unit: 'METER', receivedQty: 100.5, consumedQty: 30, remainingQty: 70.5 },
    ] }],
  });
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  const source = pdf.toString('latin1');
  assert.match(source, /\/FontFile2/);
  assert.match(source, /\/ToUnicode/);
  assert.equal((source.match(/\/Type \/Page\b/g) || []).length, 1, 'footer must not create blank pages');
});

test('a large custody statement paginates without blank footer pages', async () => {
  const pdf = await buildTechnicianCustodyPdfBuffer({
    holder: { fullName: 'فني الاختبار' }, custodies: [{ custodyNo: 'CU-TEST', status: 'PARTIALLY_RECONCILED', items: Array.from({ length: 50 }, (_, index) => ({
      materialName: `كاميرا مراقبة خارجية ومستلزمات تركيب للمشروع ${index}`, unit: 'PIECE', receivedQty: 10, remainingQty: 5,
    })) }],
  });
  const pages = (pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length;
  assert.ok(pages >= 3 && pages <= 6, `unexpected page count ${pages}`);
});
