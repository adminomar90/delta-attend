import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { quoteImageUrl, loadQuoteImage } from '../src/application/services/customerQuoteImages.js';
import { buildCustomerQuotePdf } from '../src/infrastructure/reports/customerQuotePdfBuilder.js';
import { companyContact } from '../../../shared/companyContact.mjs';
import PDFDocument from 'pdfkit';

test('quote images use catalog uploads, reject paths and URLs, and convert a memory copy without changing the original', async () => {
  for (const url of ['https://external.test/x.png', '/uploads/../secret.png', '/uploads/%2e%2e/secret.png', '/uploads/..\\secret.png', 'file:///secret.png', '/other/x.png']) assert.equal(quoteImageUrl(url), '');
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'delta-quote-image-'));
  try {
    const root = path.join(scratch, 'uploads'); await fs.mkdir(root);
    const input = await fs.readFile(new URL('../../web/public/icon-512.png', import.meta.url));
    await fs.writeFile(path.join(root, 'camera.png'), input);
    const image = await loadQuoteImage('/uploads/camera.png', root);
    assert.ok(Buffer.isBuffer(image)); assert.equal(image.subarray(1, 4).toString(), 'PNG');
    assert.deepEqual(await fs.readFile(path.join(root, 'camera.png')), input);
    const originalImage = PDFDocument.prototype.image; let embedded = 0, pdf;
    PDFDocument.prototype.image = function (image, ...args) { if (Buffer.isBuffer(image)) embedded++; return originalImage.call(this, image, ...args); };
    try { pdf = await buildCustomerQuotePdf({ quoteNo: 'CQ-IMAGE-TEST', createdAt: '2026-11-01', validUntil: '2026-12-01', currency: 'IQD', items: [{ name: 'كاميرا', unit: 'PIECE', imageUrl: '/uploads/camera.png', quantity: 1, unitPrice: 10, total: 10 }], productsTotal: 10, total: 10 }, { uploadRootDir: root }); }
    finally { PDFDocument.prototype.image = originalImage; }
    assert.equal(embedded, 1);
    for (const link of [companyContact.websiteUrl, `mailto:${companyContact.email}`, companyContact.facebookUrl, companyContact.instagramUrl, ...companyContact.phones.map((phone) => `tel:${phone}`)]) assert.ok(pdf.includes(Buffer.from(link)), `Missing contact link ${link}`);
    await fs.writeFile(path.join(scratch, 'outside.png'), input);
    assert.equal(await loadQuoteImage('/uploads/../outside.png', root), null);
    await fs.writeFile(path.join(root, 'invalid.png'), 'not an image');
    assert.equal(await loadQuoteImage('/uploads/invalid.png', root), null);
    assert.equal(await loadQuoteImage('/uploads/missing.png', root), null);
  } finally { assert.ok(path.basename(scratch).startsWith('delta-quote-image-')); await fs.rm(scratch, { recursive: true, force: true }); }
});
