import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { buildWorkReportPdfBuffer } from '../src/infrastructure/reports/workReportPdfBuilder.js';
import { toEnglishDigits, prepareEnglishPdfText } from '../src/infrastructure/reports/pdfTemplate.js';

test('digit conversion preserves Arabic text and converts Arabic and Persian numbers', () => {
  assert.equal(toEnglishDigits('التقرير ١٢٣ / ۴۵۶ بتاريخ ٢٨/١٠/٢٠٢٦'), 'التقرير 123 / 456 بتاريخ 28/10/2026');
  assert.equal(toEnglishDigits('ABC-123 / 25.5%'), 'ABC-123 / 25.5%');
  assert.equal(prepareEnglishPdfText('المشروع ٢٤'), 'المشروع 42');
  assert.equal(prepareEnglishPdfText('28/10/2026'), '28/10/2026');
});

test('work report PDF renders every numeric text with English digits including Baghdad dates', async () => {
  const written = [];
  const original = PDFDocument.prototype.text;
  PDFDocument.prototype.text = function (value, ...args) { if (typeof value === 'string') written.push(value); return original.call(this, value, ...args); };
  let pdf;
  try {
    pdf = await buildWorkReportPdfBuffer({ _id: '12345678abcdef1234567890', title: 'صيانة شبكة ١٢٣', status: 'APPROVED',
      employeeName: 'أحمد محمد', employeeCode: 'TECH-٠١٢', projectName: 'مشروع المبنى ٢٤',
      createdAt: '2026-10-28T10:20:30Z', approvedAt: '2026-10-28T21:30:00Z', workDate: '2026-10-28T10:20:30Z',
      approvedBy: { fullName: 'مدير المشروع' }, progressPercent: 75, hoursSpent: 6.5, pointsAwarded: 125,
      details: 'تم تركيب ١٢ كاميرا في الطابق ٣ وفحص ۴ نقاط شبكة.', accomplishments: 'تم إنجاز ١٠٠٪ من الفحص.',
      participants: [], images: [], user: { _id: 'test-user', fullName: 'أحمد محمد', employeeCode: 'TECH-٠١٢', department: 'الفريق ٢' },
    });
  } finally { PDFDocument.prototype.text = original; }
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  assert.ok(written.some((text) => text.includes('29/10/2026, 00:30:00')));
  assert.ok(written.some((text) => text.includes('28/10/2026')));
  assert.ok(written.some((text) => text.includes('75')));
  assert.ok(written.some((text) => text.replace(/[\u200e\u200f]/g, '').includes('TECH-012')));
  assert.ok(written.some((text) => text.includes('21 كاميرا')));
  assert.equal(written.filter((text) => /[٠-٩۰-۹]/.test(text)).length, 0);
  assert.equal((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 2, 'footers must not add blank pages');
  if (process.env.WORK_REPORT_PDF_QA === '1') {
    const output = path.resolve('tmp/pdfs/work-report-english-digits.pdf');
    fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, pdf);
  }
});
