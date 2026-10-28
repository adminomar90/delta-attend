import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAttachmentFileName } from '../src/shared/attachmentFileName.js';

test('Arabic and mixed attachment names recover from multipart Latin-1 decoding', () => {
  for (const name of ['استمارة معلومات الضباط.xlsx', 'مخطط الشبكة - Switch 24.pdf', 'صورة 📷 2026.png']) {
    const garbled = Buffer.from(name, 'utf8').toString('latin1');
    assert.equal(normalizeAttachmentFileName(garbled), name);
    assert.equal(normalizeAttachmentFileName(Buffer.from(garbled, 'utf8').toString('latin1')), name);
    assert.equal(normalizeAttachmentFileName(name), name);
  }
});

test('proper English, accented and Unicode names remain intact and controls are removed', () => {
  for (const name of ['Report 2026.xlsx', 'café.pdf', 'Ångström.txt', '北京.xlsx']) assert.equal(normalizeAttachmentFileName(name), name);
  assert.equal(normalizeAttachmentFileName('folder/ملف.pdf'), 'ملف.pdf');
  assert.equal(normalizeAttachmentFileName('C:\\folder\\ملف.pdf'), 'ملف.pdf');
  assert.equal(normalizeAttachmentFileName('report\r\n.txt'), 'report.txt');
  assert.equal(normalizeAttachmentFileName(''), 'attachment');
});
