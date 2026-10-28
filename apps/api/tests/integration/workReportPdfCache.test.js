import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import express from 'express';
import { WorkReportModel } from '../../src/infrastructure/db/models/WorkReportModel.js';
import { UserModel } from '../../src/infrastructure/db/models/UserModel.js';
import '../../src/infrastructure/db/models/ProjectModel.js';
import { WORK_REPORT_PDF_FORMAT_VERSION } from '../../src/infrastructure/reports/workReportPdfBuilder.js';

test('existing report PDFs upgrade once to English digits and subsequent downloads reuse the new file', { skip: !process.env.WORK_REPORT_PDF_TEST_URI }, async () => {
  const suffix = randomUUID().replaceAll('-', ''), dbName = `codex_work_pdf_test_${suffix}`;
  const tempRoot = path.resolve('tmp/pdfs'), output = path.resolve(tempRoot, `cache-${suffix}`);
  let server;
  try {
    process.env.MONGO_URI = process.env.WORK_REPORT_PDF_TEST_URI;
    process.env.JWT_SECRET = 'isolated-pdf-cache-test';
    process.env.UPLOADS_DIR = output;
    await mongoose.connect(process.env.WORK_REPORT_PDF_TEST_URI, { dbName });
    // Initialize controllers in the same order as the application router.
    await import('../../src/presentation/routes/index.js');
    const { exportWorkReportPdf } = await import('../../src/presentation/controllers/workReportController.js');
    const { errorHandler } = await import('../../src/presentation/middlewares/errorHandler.js');
    const { env } = await import('../../src/config/env.js');
    assert.equal(env.uploadsDir, output);
    const user = await UserModel.create({ fullName: 'Test Admin', email: 'test@example.invalid', role: 'GENERAL_MANAGER', passwordHash: 'test' });
    fs.mkdirSync(path.join(output, 'work-reports'), { recursive: true });
    const oldFile = path.join(output, 'work-reports', 'old.pdf'); fs.writeFileSync(oldFile, '%PDF old cached fixture');
    const report = await WorkReportModel.create({ user: user._id, employeeName: user.fullName, title: 'Report 123', details: 'Test details', status: 'APPROVED', approvedAt: new Date(),
      pdfFile: { filename: 'old.pdf', publicUrl: '/uploads/work-reports/old.pdf', generatedAt: new Date('2025-01-01') } });
    const app = express();
    app.use((req, res, next) => { req.user = { id: String(user._id), role: 'GENERAL_MANAGER' }; next(); });
    app.get('/reports/:id/pdf', exportWorkReportPdf); app.use(errorHandler);
    server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const url = `http://127.0.0.1:${server.address().port}/reports/${report._id}/pdf?download=1`;
    const first = await fetch(url); assert.equal(first.status, 200); assert.match(first.headers.get('content-disposition'), /^attachment/);
    const pdf = Buffer.from(await first.arrayBuffer()); assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
    const updated = await WorkReportModel.findById(report._id);
    assert.equal(updated.pdfFile.formatVersion, WORK_REPORT_PDF_FORMAT_VERSION);
    assert.notEqual(updated.pdfFile.filename, 'old.pdf');
    const second = await fetch(url); assert.equal(second.status, 200);
    assert.deepEqual(Buffer.from(await second.arrayBuffer()), pdf);
    assert.equal((await WorkReportModel.findById(report._id)).pdfFile.filename, updated.pdfFile.filename);
    assert.ok(fs.existsSync(oldFile), 'the archived original is preserved');
  } finally {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    try { if (mongoose.connection.readyState === 1 && mongoose.connection.name === dbName && /^codex_work_pdf_test_[a-f0-9]{32}$/.test(dbName)) await mongoose.connection.dropDatabase(); }
    finally { await mongoose.disconnect(); }
    // Only the unique test directory under the workspace temp folder is removable.
    if (path.dirname(output) === tempRoot && /^cache-[a-f0-9]{32}$/.test(path.basename(output))) fs.rmSync(output, { recursive: true, force: true });
  }
});
