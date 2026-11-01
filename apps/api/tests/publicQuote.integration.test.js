import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';

test('supplier opens and submits its quote anonymously while purchases stay protected', { skip: process.env.RUN_PUBLIC_QUOTE_DB_TESTS !== '1', timeout: 120000 }, async () => {
  const database = `delta_quote_test_${randomUUID().replaceAll('-', '')}`;
  process.env.MONGO_URI = `mongodb://127.0.0.1:27017/${database}`;
  process.env.JWT_SECRET = randomUUID(); process.env.VAPID_PUBLIC_KEY = ''; process.env.VAPID_PRIVATE_KEY = ''; process.env.SMTP_HOST = '';
  const mongoose = (await import('mongoose')).default, express = (await import('express')).default;
  const routes = (await import('../src/presentation/routes/index.js')).default;
  const { errorHandler } = await import('../src/presentation/middlewares/errorHandler.js');
  const { UserModel } = await import('../src/infrastructure/db/models/UserModel.js');
  const { SupplierModel } = await import('../src/infrastructure/db/models/SupplierModel.js');
  const { MaterialModel } = await import('../src/infrastructure/db/models/MaterialModel.js');
  const { PurchaseRequestModel } = await import('../src/infrastructure/db/models/PurchaseRequestModel.js');
  const { AuditLogModel } = await import('../src/infrastructure/db/models/AuditLogModel.js');
  const { PointsLedgerModel } = await import('../src/infrastructure/db/models/PointsLedgerModel.js');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  let server;
  try {
    await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
    console.log('Quote fixture: database initialized');
    const creator = await UserModel.create({ fullName: 'Quote test manager', email: 'quote@fixture.test', role: 'GENERAL_MANAGER', passwordHash: 'fixture-only', active: true });
    const supplier = await SupplierModel.create({ supplierName: 'مورد الاختبار', supplierType: 'COMPANY', mainPhone: '07000000000', normalizedMainPhone: '07000000000', createdBy: creator._id });
    const material = await MaterialModel.create({ name: 'مادة اختبار التسعير', code: 'QUOTE-TEST' });
    const token = randomUUID(), otherToken = randomUUID(), expiredToken = randomUUID();
    const quote = (value, expired = false) => ({ supplier: supplier._id, supplierName: supplier.supplierName, tokenHash: createHash('sha256').update(value).digest('hex'), publicToken: value, tokenExpiresAt: new Date(Date.now() + (expired ? -60000 : 3600000)) });
    const purchase = await PurchaseRequestModel.create({ requestNo: 'PR-FIXTURE-1', createdBy: creator._id, internalNotes: 'internal-private-note', items: [{ material: material._id, materialName: material.name, requestedQty: 2 }], suppliers: [quote(token), quote(otherToken), quote(expiredToken, true)] });
    const app = express(); app.use(express.json()); app.use('/api', routes); app.use(errorHandler);
    server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    console.log('Quote fixture: anonymous HTTP checks');
    const get = (url) => fetch(origin + url, { signal: AbortSignal.timeout(10000) });
    assert.equal((await get('/api/purchases')).status, 401);
    const response = await get(`/api/purchases/public/quotes/${token}`); assert.equal(response.status, 200);
    const form = await response.json(); assert.equal(form.supplierName, supplier.supplierName); assert.equal(form.items.length, 1); assert.equal(form.internalNotes, undefined); assert.equal(form.suppliers, undefined);
    assert.equal((await get('/api/purchases/public/quotes/invalid-link')).status, 404);
    assert.equal((await get(`/api/purchases/public/quotes/${expiredToken}`)).status, 410);
    const payload = new FormData(); payload.append('payload', JSON.stringify({ lines: [{ itemId: form.items[0]._id, offeredQty: 2, unitPrice: 15000, availability: 'AVAILABLE' }], currency: 'IQD', generalNotes: 'عرض بدون تسجيل دخول' }));
    const submitted = await fetch(`${origin}/api/purchases/public/quotes/${token}`, { method: 'POST', body: payload, signal: AbortSignal.timeout(10000) });
    assert.equal(submitted.status, 200, await submitted.text());
    const stored = await PurchaseRequestModel.findById(purchase._id); assert.equal(stored.suppliers[0].status, 'QUOTED'); assert.equal(stored.suppliers[0].lines[0].unitPrice, 15000); assert.equal(stored.suppliers[1].status, 'NOT_SENT');
    const audit = await AuditLogModel.findOne({ action: 'PURCHASE_QUOTE_SUBMITTED', entityId: String(purchase._id) });
    assert.equal(audit.actorType, 'SUPPLIER'); assert.equal(audit.actor, undefined); assert.equal(audit.externalActor.name, supplier.supplierName); assert.equal(await PointsLedgerModel.countDocuments(), 0);
    const repeated = await fetch(`${origin}/api/purchases/public/quotes/${token}`, { method: 'POST', body: payload }); assert.equal(repeated.status, 409);
    assert.equal((await (await get(`/api/purchases/public/quotes/${token}`)).json()).locked, true);
    assert.equal((await get(`/api/purchases/${purchase._id}`)).status, 401);
    assert.equal((await fetch(`${origin}/api/purchases/${purchase._id}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
  } finally {
    if (server) await new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); });
    assert.equal(mongoose.connection.name, database); assert.match(database, /^delta_quote_test_[a-f0-9]{32}$/);
    await mongoose.connection.dropDatabase(); await mongoose.disconnect();
  }
});
