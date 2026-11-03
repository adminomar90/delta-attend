import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('customer quotations include out-of-stock catalog products, preserve stock and share safe public PDF links', { skip: process.env.RUN_CUSTOMER_QUOTE_DB_TESTS !== '1', timeout: 120000 }, async () => {
  const database = `delta_customer_quote_test_${randomUUID().replaceAll('-', '')}`;
  process.env.MONGO_URI = `mongodb://127.0.0.1:27017/${database}`; process.env.JWT_SECRET = randomUUID(); process.env.VAPID_PUBLIC_KEY = ''; process.env.VAPID_PRIVATE_KEY = ''; process.env.SMTP_HOST = '';
  const uploads = await fs.mkdtemp(path.join(os.tmpdir(), 'delta-quote-uploads-')); process.env.UPLOADS_DIR = uploads;
  await fs.copyFile(new URL('../../web/public/icon-512.png', import.meta.url), path.join(uploads, 'camera.png'));
  const mongoose = (await import('mongoose')).default, express = (await import('express')).default, jwt = (await import('jsonwebtoken')).default;
  const routes = (await import('../src/presentation/routes/index.js')).default;
  const { errorHandler } = await import('../src/presentation/middlewares/errorHandler.js');
  const { UserModel } = await import('../src/infrastructure/db/models/UserModel.js');
  const { CustomerModel } = await import('../src/infrastructure/db/models/CustomerModel.js');
  const { MaterialModel } = await import('../src/infrastructure/db/models/MaterialModel.js');
  const { WarehouseModel } = await import('../src/infrastructure/db/models/WarehouseModel.js');
  const { StockBalanceModel } = await import('../src/infrastructure/db/models/StockBalanceModel.js');
  const { CustomerQuoteModel } = await import('../src/infrastructure/db/models/CustomerQuoteModel.js');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  let server;
  try {
    await CustomerQuoteModel.init();
    const manager = await UserModel.create({ fullName: 'Quote manager', email: 'manager@quote.test', role: 'GENERAL_MANAGER', passwordHash: 'fixture', active: true });
    const staff = await UserModel.create({ fullName: 'Quote staff', email: 'staff@quote.test', role: 'TECHNICAL_STAFF', passwordHash: 'fixture', active: true });
    const customer = await CustomerModel.create({ name: 'شركة الاختبار', phone: '07700000000', address: 'بغداد', createdBy: manager._id });
    const warehouse = await WarehouseModel.create({ name: 'المخزن الرئيسي', code: 'CQ-TEST' });
    const damaged = await WarehouseModel.create({ name: 'التالف', code: 'CQ-DAMAGED', type: 'DAMAGED' });
    const material = await MaterialModel.create({ name: 'كاميرا مراقبة', code: 'CQ-CAMERA', imageUrl: '/uploads/camera.png', brand: 'Dahua', model: 'IPC-HFW', estimatedUnitCost: 1200 });
    const unavailable = await MaterialModel.create({ name: 'بلا رصيد', code: 'CQ-NO-STOCK' });
    const noBalance = await MaterialModel.create({ name: 'New product', code: 'CQ-NEW', productStatus: 'OUT_OF_STOCK' });
    const zeroStock = await MaterialModel.create({ name: 'Zero stock', code: 'CQ-ZERO' });
    const reserved = await MaterialModel.create({ name: 'Fully reserved', code: 'CQ-RESERVED' });
    const excluded = await MaterialModel.create([
      { name: 'Inactive', code: 'CQ-INACTIVE', active: false },
      { name: 'Archived', code: 'CQ-ARCHIVED', productStatus: 'ARCHIVED' },
      { name: 'Damaged', code: 'CQ-DAMAGED-PRODUCT', productStatus: 'DAMAGED' },
    ]);
    const balance = await StockBalanceModel.create({ material: material._id, warehouse: warehouse._id, qtyOnHand: 10, qtyReserved: 2, avgCost: 1200 });
    await StockBalanceModel.create({ material: unavailable._id, warehouse: damaged._id, qtyOnHand: 3 });
    await StockBalanceModel.create({ material: zeroStock._id, warehouse: warehouse._id, qtyOnHand: 0 });
    await StockBalanceModel.create({ material: reserved._id, warehouse: warehouse._id, qtyOnHand: 5, qtyReserved: 5 });
    const app = express(); app.use(express.json()); app.use('/uploads', express.static(uploads)); app.use('/api', routes); app.use(errorHandler);
    server = app.listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const token = (u) => jwt.sign({ sub: String(u._id), role: u.role }, process.env.JWT_SECRET);
    const call = (url, method = 'GET', body, u = manager) => fetch(origin + '/api/customer-quotes' + url, { method, headers: { ...(u ? { Authorization: `Bearer ${token(u)}` } : {}), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal((await call('', 'GET', null, null)).status, 401);
    assert.equal((await call('', 'GET', null, staff)).status, 403);
    const meta = await (await call('/metadata')).json();
    assert.equal(meta.materials.length, 5);
    const catalogItem = meta.materials.find((item) => item._id === String(material._id));
    assert.equal(catalogItem.availableByWarehouse[String(warehouse._id)], 8);
    for (const product of [unavailable, noBalance, zeroStock, reserved]) {
      const item = meta.materials.find((item) => item._id === String(product._id));
      assert.ok(item);
      assert.equal(item.availableByWarehouse[String(warehouse._id)] ?? 0, 0);
    }
    assert.ok(meta.materials.every((item) => item.estimatedUnitCost === undefined));
    assert.equal(meta.warehouses.length, 1); assert.equal(meta.customers[0].name, customer.name);
    const form = { customerMode: 'EXISTING', customerId: String(customer._id), warehouseId: String(warehouse._id), currency: 'IQD', validUntil: '2030-12-31', items: [{ materialId: String(material._id), quantity: 2, unitPrice: 15000 }], installationFee: 10000, programmingFee: 5000, notes: 'كفالة سنة', total: 1 };
    let response = await call('', 'POST', form); assert.equal(response.status, 201, response.status === 201 ? '' : await response.text());
    let quote = (await response.json()).quote;
    assert.equal(quote.items[0].imageUrl, '/uploads/camera.png'); assert.equal(quote.items[0].brand, 'Dahua');
    assert.equal(quote.total, 45000); assert.equal(quote.customerName, customer.name); assert.match(quote.quoteNo, /^CQ-\d{4}-\d{5}$/);
    assert.equal((await StockBalanceModel.findById(balance._id)).qtyOnHand, 10); assert.equal((await StockBalanceModel.findById(balance._id)).qtyReserved, 2);
    for (const product of [unavailable, noBalance, zeroStock, reserved]) {
      const response = await call('', 'POST', { ...form, items: [{ materialId: String(product._id), quantity: 2, unitPrice: 100 }] });
      assert.equal(response.status, 201);
      const saved = (await response.json()).quote;
      assert.equal(saved.items[0].material, String(product._id));
      assert.equal((await call(`/${saved._id}`, 'PATCH', { ...form, revision: 0, items: [{ materialId: String(product._id), quantity: 3, unitPrice: 100 }] })).status, 200);
    }
    assert.equal(await StockBalanceModel.countDocuments({ material: noBalance._id }), 0);
    const reservedBalance = await StockBalanceModel.findOne({ material: reserved._id, warehouse: warehouse._id });
    assert.equal(reservedBalance.qtyOnHand, 5); assert.equal(reservedBalance.qtyReserved, 5);
    for (const product of excluded) assert.equal((await call('', 'POST', { ...form, items: [{ materialId: String(product._id), quantity: 1, unitPrice: 1 }] })).status, 400);
    assert.equal((await call('', 'POST', { ...form, items: [{ materialId: String(new mongoose.Types.ObjectId()), quantity: 1, unitPrice: 1 }] })).status, 400);
    assert.equal((await call('', 'POST', { ...form, warehouseId: String(damaged._id) })).status, 400);
    assert.equal((await call('', 'POST', { ...form, items: [form.items[0], form.items[0]] })).status, 400);
    assert.equal((await call('', 'POST', { ...form, items: [{ ...form.items[0], unitPrice: -1 }] })).status, 400);
    assert.equal((await call('', 'POST', { ...form, customerMode: 'MANUAL', customerName: '' })).status, 400);
    assert.equal((await call('', 'POST', { ...form, discount: -1 })).status, 400);
    assert.equal((await call('', 'POST', { ...form, discount: 45000.01 })).status, 400);
    const discountedResponse = await call('', 'POST', { ...form, discount: 5000, total: 1 });
    assert.equal(discountedResponse.status, 201);
    const discounted = (await discountedResponse.json()).quote;
    assert.equal(discounted.discount, 5000); assert.equal(discounted.total, 40000);
    const discountedShare = await (await call(`/${discounted._id}/whatsapp-link`, 'POST', { phone: '07700000000' })).json();
    assert.ok(discountedShare.message.includes('40,000'));
    const discountedPublic = await (await call('/public/' + discountedShare.link.split('/').at(-1), 'GET', null, null)).json();
    assert.equal(discountedPublic.quote.discount, 5000); assert.equal(discountedPublic.quote.total, 40000);
    assert.equal((await call(`/${discounted._id}/pdf`)).status, 200);
    response = await call('', 'POST', { ...form, customerMode: 'MANUAL', customerName: 'زبون يدوي' }); assert.equal(response.status, 201); assert.equal((await response.json()).quote.customerName, 'زبون يدوي');
    response = await call('', 'POST', { ...form, customerMode: 'NONE', customerName: 'must not be saved' }); assert.equal(response.status, 201); assert.equal((await response.json()).quote.customerName, '');
    const pdf = await call(`/${quote._id}/pdf`); assert.equal(pdf.status, 200); assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), '%PDF');
    const share = await (await call(`/${quote._id}/whatsapp-link`, 'POST', { phone: '07700000000', publicOrigin: 'https://example.test' })).json();
    assert.match(share.link, /^https:\/\/example.test\/customer-quote\/[a-f0-9]{64}$/); assert.ok(share.whatsappUrl.includes('9647700000000'));
    const publicToken = share.link.split('/').at(-1);
    response = await call(`/public/${publicToken}`, 'GET', null, null); assert.equal(response.status, 200);
    const publicQuote = (await response.json()).quote;
    assert.equal(publicQuote.items[0].imageUrl, '/uploads/camera.png');
    assert.equal((await fetch(origin + publicQuote.items[0].imageUrl)).status, 200);
    // Existing quotes without an image snapshot can show the current catalog image.
    await CustomerQuoteModel.updateOne({ _id: quote._id }, { $unset: { 'items.0.imageUrl': 1 } });
    const legacyQuote = await (await call(`/${quote._id}`)).json();
    assert.equal(legacyQuote.quote.items[0].imageUrl, '/uploads/camera.png');
    await MaterialModel.updateOne({ _id: material._id }, { $set: { imageUrl: '/uploads/new-camera.png' } });
    const discountedStored = await (await call(`/${discounted._id}`)).json();
    assert.equal(discountedStored.quote.items[0].imageUrl, '/uploads/camera.png');
    assert.equal(publicQuote.total, 45000); for (const field of ['createdBy', 'customer', 'warehouse', 'phone', 'shareToken', 'shareTokenHash']) assert.equal(publicQuote[field], undefined);
    assert.equal(publicQuote.items[0].material, undefined); assert.equal(publicQuote.items[0].estimatedUnitCost, undefined);
    assert.equal((await call(`/public/${publicToken}/pdf`, 'GET', null, null)).status, 200);
    response = await call(`/${quote._id}`, 'PATCH', { ...form, revision: 0, installationFee: 20000 }); assert.equal(response.status, 200); quote = (await response.json()).quote; assert.equal(quote.total, 55000);
    assert.equal((await call(`/${quote._id}`, 'PATCH', { ...form, revision: 0 })).status, 409);
    assert.equal((await call(`/public/${publicToken}`, 'GET', null, null)).status, 404);
    const secondShare = await (await call(`/${quote._id}/whatsapp-link`, 'POST', { phone: '07700000000' })).json();
    await CustomerQuoteModel.updateOne({ _id: quote._id }, { $set: { validUntil: new Date('2000-01-01') } });
    assert.equal((await call('/public/' + secondShare.link.split('/').at(-1), 'GET', null, null)).status, 410);
    assert.equal((await call(`/${quote._id}/whatsapp-link`, 'POST', { phone: '07700000000' })).status, 409);
    await UserModel.updateOne({ _id: staff._id }, { $set: { customPermissions: ['VIEW_CUSTOMER_QUOTES', 'MANAGE_CUSTOMER_QUOTES'] } });
    assert.equal((await call(`/${quote._id}`, 'GET', null, staff)).status, 404);
    assert.equal((await call('', 'POST', form, staff)).status, 403);
    assert.equal((await StockBalanceModel.findById(balance._id)).qtyOnHand, 10);
  } finally {
    if (server) { server.closeAllConnections(); await new Promise((r) => server.close(r)); }
    assert.equal(mongoose.connection.name, database); assert.match(database, /^delta_customer_quote_test_[a-f0-9]{32}$/); await mongoose.connection.dropDatabase(); await mongoose.disconnect();
    assert.ok(path.basename(uploads).startsWith('delta-quote-uploads-')); await fs.rm(uploads, { recursive: true, force: true });
  }
});
