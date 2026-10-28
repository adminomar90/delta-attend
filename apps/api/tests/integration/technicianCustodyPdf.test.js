import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import express from 'express';

test('PDF routes respect holder scope and return valid inline PDFs', { skip: !process.env.CUSTODY_PDF_TEST_URI }, async () => {
  const databaseName = `codex_custody_pdf_test_${randomUUID().replaceAll('-', '')}`;
  let server;
  try {
    process.env.MONGO_URI = `${process.env.CUSTODY_PDF_TEST_URI}/${databaseName}`;
    process.env.JWT_SECRET ||= 'isolated-pdf-test-secret';
    await mongoose.connect(process.env.CUSTODY_PDF_TEST_URI, { dbName: databaseName, autoIndex: false, autoCreate: false });
    const { exportTechnicianCustodyPdf } = await import('../../src/presentation/controllers/materialsCustodyController.js');
    const id = () => new mongoose.Types.ObjectId();
    const own = id(), other = id(), material = id(), ownCustody = id(), otherCustody = id();
    const db = mongoose.connection.db;
    await db.collection('users').insertMany([{ _id: own, fullName: 'فني الاختبار', role: 'TECHNICAL_STAFF' }, { _id: other, fullName: 'الفني الآخر', role: 'TECHNICAL_STAFF' }]);
    await db.collection('materials').insertOne({ _id: material, name: 'كيبل شبكة', code: 'CAT6' });
    await db.collection('materialcustodies').insertMany([
      { _id: ownCustody, holder: own, custodyNo: 'TEST-OWN', status: 'OPEN', items: [{ material, materialName: 'كيبل شبكة', unit: 'METER', receivedQty: 10, remainingQty: 10 }] },
      { _id: otherCustody, holder: other, custodyNo: 'TEST-OTHER', status: 'OPEN', items: [] },
    ]);
    const app = express();
    app.use((req, res, next) => { req.user = { id: String(own), role: req.headers['x-test-role'] || 'TECHNICAL_STAFF' }; next(); });
    app.get('/custodies/statement/pdf', exportTechnicianCustodyPdf);
    app.get('/custodies/:id/pdf', exportTechnicianCustodyPdf);
    app.use((error, req, res, next) => res.status(error.statusCode || 500).json({ message: error.message }));
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const path of [`/custodies/${ownCustody}/pdf`, `/custodies/statement/pdf?holderId=${own}`]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /application\/pdf/);
      assert.match(response.headers.get('content-disposition'), /^inline;/);
      assert.match(response.headers.get('cache-control'), /no-store/);
      assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 4).toString(), '%PDF');
    }
    assert.equal((await fetch(`${base}/custodies/${otherCustody}/pdf`)).status, 403);
    assert.equal((await fetch(`${base}/custodies/statement/pdf?holderId=${other}`)).status, 403);
    assert.equal((await fetch(`${base}/custodies/${otherCustody}/pdf`, { headers: { 'x-test-role': 'GENERAL_MANAGER' } })).status, 200);
    assert.equal((await fetch(`${base}/custodies/statement/pdf?holderId=invalid`)).status, 400);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    try {
      if (mongoose.connection.readyState === 1 && mongoose.connection.name === databaseName && /^codex_custody_pdf_test_[a-f0-9]{32}$/.test(databaseName)) await mongoose.connection.dropDatabase();
    } finally { await mongoose.disconnect(); }
  }
});
