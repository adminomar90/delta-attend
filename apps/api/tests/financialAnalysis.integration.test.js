import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

test('financial analysis requires its own permission and preserves record scope', { skip: process.env.RUN_FINANCIAL_ANALYSIS_DB_TESTS !== '1', timeout: 60000 }, async () => {
  const database = `delta_financial_analysis_test_${randomUUID().replaceAll('-', '')}`;
  process.env.MONGO_URI = `mongodb://127.0.0.1:27017/${database}`;
  process.env.JWT_SECRET = randomUUID(); process.env.SMTP_HOST = ''; process.env.VAPID_PUBLIC_KEY = ''; process.env.VAPID_PRIVATE_KEY = '';
  const mongoose = (await import('mongoose')).default, express = (await import('express')).default;
  const routes = (await import('../src/presentation/routes/index.js')).default;
  const { authTokenService } = await import('../src/application/services/authTokenService.js');
  const { errorHandler } = await import('../src/presentation/middlewares/errorHandler.js');
  const { UserModel } = await import('../src/infrastructure/db/models/UserModel.js');
  const { FinancialDisbursementModel } = await import('../src/infrastructure/db/models/FinancialDisbursementModel.js');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  let server;
  try {
    const user = (name, permissions = [], role = 'TECHNICAL_STAFF') => UserModel.create({ fullName: name, email: `${name}@analysis.test`, role, customPermissions: permissions, passwordHash: 'fixture', active: true });
    const manager = await user('manager', [], 'GENERAL_MANAGER');
    const employee = await user('analyst', ['VIEW_FINANCIAL_ANALYSIS']);
    const other = await user('other', ['VIEW_FINANCIAL_REPORTS']);
    const record = (owner, extra = {}) => ({ requestNo: randomUUID(), transactionNo: randomUUID(), employee: owner._id, description: 'مصاريف اختبار', amount: 100, approvedAmount: 80, currency: 'IQD', status: 'RECEIVED', requestType: 'MATERIALS_EXPENSE', transactionDate: new Date(), ...extra });
    await FinancialDisbursementModel.create([record(employee), record(other, { amount: 900, approvedAmount: 900 }), record(employee, { archived: true, amount: 20, approvedAmount: 20 })]);
    const app = express(); app.use(express.json()); app.use('/api', routes); app.use(errorHandler);
    server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
    const call = (actor, query = '') => fetch(`http://127.0.0.1:${server.address().port}/api/financial-disbursements/analysis${query}`, { headers: actor ? { Authorization: `Bearer ${authTokenService.sign({ sub: String(actor._id), role: actor.role })}` } : {} });
    assert.equal((await call(null)).status, 401);
    assert.equal((await call(other)).status, 403);
    const response = await call(employee); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    const scoped = await response.json(); assert.equal(scoped.scope, 'assigned'); assert.equal(scoped.summary.paid, 100); assert.equal(scoped.rows.length, 2);
    assert.ok(scoped.options.employees.every((item) => item.value === String(employee._id)));
    const forged = await (await call(employee, `?employee=${other._id}`)).json(); assert.equal(forged.summary.paid, 0);
    const active = await (await call(employee, '?archive=active')).json(); assert.equal(active.summary.paid, 80);
    const all = await (await call(manager)).json(); assert.equal(all.scope, 'all'); assert.equal(all.summary.paid, 1000);
    employee.customPermissions.push('VIEW_ALL_FINANCIAL_DISBURSEMENTS'); await employee.save();
    assert.equal((await (await call(employee)).json()).summary.paid, 1000);
    assert.equal((await call(employee, '?from=2026-99-99')).status, 400);
    assert.equal(await FinancialDisbursementModel.countDocuments(), 3);
  } finally {
    if (server) await new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); });
    assert.equal(mongoose.connection.name, database); assert.match(database, /^delta_financial_analysis_test_[a-f0-9]{32}$/);
    await mongoose.connection.dropDatabase(); await mongoose.disconnect();
  }
});
