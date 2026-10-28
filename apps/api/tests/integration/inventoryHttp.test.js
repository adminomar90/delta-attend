import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import express from 'express';
import bcrypt from 'bcryptjs';
import { UserModel } from '../../src/infrastructure/db/models/UserModel.js';
import { WarehouseModel } from '../../src/infrastructure/db/models/WarehouseModel.js';
import { MaterialModel } from '../../src/infrastructure/db/models/MaterialModel.js';
import { StockBalanceModel } from '../../src/infrastructure/db/models/StockBalanceModel.js';

test('authenticated inventory endpoints enforce catalog selection, roles, recipient and approved return posting', { skip: !process.env.INVENTORY_WORKFLOW_TEST_URI }, async () => {
  const dbName = `codex_inventory_http_test_${randomUUID().replaceAll('-', '')}`;
  let server;
  try {
    process.env.MONGO_URI = process.env.INVENTORY_WORKFLOW_TEST_URI;
    process.env.JWT_SECRET = 'isolated-inventory-http-test-secret';
    await mongoose.connect(process.env.INVENTORY_WORKFLOW_TEST_URI, { dbName, autoIndex: false });
    const { default: routes } = await import('../../src/presentation/routes/materialsRoutes.js');
    const { errorHandler } = await import('../../src/presentation/middlewares/errorHandler.js');
    const { authTokenService } = await import('../../src/application/services/authTokenService.js');
    const { whatsappService } = await import('../../src/application/services/whatsappService.js');
    const { notificationService } = await import('../../src/application/services/notificationService.js');
    // The HTTP test must never send real WhatsApp, email or push messages.
    whatsappService.sendTextMessage = async () => ({ sent: false, attempted: false });
    notificationService.notifySystem = async () => {};
    notificationService.notifyOperationActivity = async () => {};
    const users = await UserModel.create([
      { fullName: 'Test Technician', email: 'tech@test.invalid', passwordHash: 'test', role: 'TECHNICAL_STAFF' },
      { fullName: 'Test Storekeeper', email: 'keeper@test.invalid', passwordHash: 'test', role: 'WAREHOUSE_KEEPER' },
      { fullName: 'Other Technician', email: 'other@test.invalid', passwordHash: 'test', role: 'TECHNICAL_STAFF' },
      { fullName: 'Primary Admin', email: 'admin@delta.com', passwordHash: await bcrypt.hash('Isolated-Admin-Password', 4), role: 'GENERAL_MANAGER' },
    ]);
    const tokens = users.map((user) => authTokenService.sign({ sub: String(user._id), role: user.role }));
    const warehouse = await WarehouseModel.create({ name: 'Main', code: 'MAIN' });
    const material = await MaterialModel.create({ name: 'Cable', code: 'CABLE', unit: 'METER' });
    await StockBalanceModel.create({ material: material._id, warehouse: warehouse._id, qtyOnHand: 10 });
    const app = express(); app.use(express.json()); app.use('/materials', routes); app.use(errorHandler);
    server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const call = async (user, method, path, body, expected = 200) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/materials${path}`, { method, headers: { Authorization: `Bearer ${tokens[user]}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const result = await response.json(); assert.equal(response.status, expected, JSON.stringify(result)); return result;
    };
    const input = { warehouseId: String(warehouse._id), manualProjectName: 'Test project', items: [{ materialId: String(material._id), materialName: 'Spoofed name', unit: 'PIECE', requestedQty: 4 }] };
    await call(0, 'POST', '/requests', { ...input, items: [{ materialName: 'Free text item', requestedQty: 1 }] }, 400);
    assert.equal(await MaterialModel.countDocuments(), 1);
    const created = await call(0, 'POST', '/requests', input, 201);
    assert.equal(created.request.items[0].materialName, 'Cable');
    assert.equal(created.request.items[0].unitSnapshot, 'METER');
    const requestId = created.request._id;
    await call(0, 'PATCH', `/requests/${requestId}/review`, { action: 'APPROVE_FULL' }, 403);
    await call(1, 'PATCH', `/requests/${requestId}/review`, { action: 'APPROVE_FULL' });
    const prepared = await call(1, 'PATCH', `/requests/${requestId}/prepare`, { warehouseId: warehouse._id, items: [{ materialId: material._id, preparedQty: 4 }] });
    await call(1, 'PATCH', `/requests/${requestId}/dispatch`, {}, 409);
    await call(2, 'PATCH', `/requests/${requestId}/confirm-receipt`, { receiptToken: prepared.request.pendingReceipt.id }, 403);
    const received = await call(0, 'PATCH', `/requests/${requestId}/confirm-receipt`, { receiptToken: prepared.request.pendingReceipt.id });
    assert.equal(received.custody.items[0].receivedQty, 4);
    const submitted = await call(0, 'POST', `/custodies/${received.custody._id}/reconcile`, { items: [{ materialId: material._id, consumedQty: 2, damagedQty: 1, lostQty: 0, remainingQty: 1, toReturnQty: 1 }] }, 200);
    await call(1, 'PATCH', `/reconciliations/${submitted.reconciliation._id}/review`, { action: 'APPROVE' });
    const completed = await call(1, 'POST', `/reconciliations/${submitted.reconciliation._id}/returns`, { operationKey: randomUUID(), warehouseId: warehouse._id, items: [{ materialId: material._id, returnedQty: 1, damagedReturnedQty: 1 }] });
    assert.equal(completed.custody.status, 'CLOSED');
    assert.equal((await StockBalanceModel.findOne({ material: material._id, warehouse: warehouse._id })).qtyOnHand, 7);
    const cart = await call(1, 'POST', '/stock/cart-issue', { employeeId: users[0]._id, referenceId: randomUUID(), items: [{ materialId: material._id, warehouseId: warehouse._id, quantity: 2 }] }, 201);
    assert.equal(cart.request.status, 'PENDING_MANAGER_APPROVAL');
    assert.equal((await StockBalanceModel.findOne({ material: material._id, warehouse: warehouse._id })).qtyOnHand, 7);
    await call(1, 'DELETE', `/requests/${cart.request._id}`, { adminPassword: 'Isolated-Admin-Password' }, 403);
    await call(3, 'DELETE', `/requests/${cart.request._id}`, {}, 400);
    await call(3, 'DELETE', `/requests/${cart.request._id}`, { adminPassword: 'wrong' }, 403);
    await call(3, 'DELETE', `/requests/${cart.request._id}`, { adminPassword: 'Isolated-Admin-Password' });
    const listed = await call(3, 'GET', '/requests?archived=all');
    assert.equal(listed.requests.some((request) => request._id === cart.request._id), false);
    assert.equal((await StockBalanceModel.findOne({ material: material._id, warehouse: warehouse._id })).qtyOnHand, 7);
  } finally {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    try { if (mongoose.connection.readyState === 1 && mongoose.connection.name === dbName && /^codex_inventory_http_test_[a-f0-9]{32}$/.test(dbName)) await mongoose.connection.dropDatabase(); }
    finally { await mongoose.disconnect(); }
  }
});
