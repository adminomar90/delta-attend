import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import sharp from 'sharp';
import { createBadgeToken } from '../src/application/services/employeeBadgeTokens.js';
import { isPublicRoute } from '../../web/lib/publicRoutes.mjs';

test('only employee verification is a public badge page', () => {
  assert.equal(isPublicRoute('/verify-employee/token'), true);
  assert.equal(isPublicRoute('/employee-badges'), false);
});

test('issued badge registry, authorization, and public verification track independent card and employee status', {
  skip: !process.env.EMPLOYEE_BADGE_TEST_MONGO_URI,
}, async () => {
  const database = `delta_badges_test_${randomUUID().replaceAll('-', '')}`;
  const secret = randomUUID();
  process.env.MONGO_URI = process.env.EMPLOYEE_BADGE_TEST_MONGO_URI;
  process.env.JWT_SECRET = secret;

  const { default: mongoose } = await import('mongoose');
  const { default: express } = await import('express');
  const { default: badgeRoutes } = await import('../src/presentation/routes/employeeBadgesRoutes.js');
  const { default: authRoutes } = await import('../src/presentation/routes/authRoutes.js');
  const { errorHandler } = await import('../src/presentation/middlewares/errorHandler.js');
  const { UserModel } = await import('../src/infrastructure/db/models/UserModel.js');
  const { EmployeeBadgeModel } = await import('../src/infrastructure/db/models/EmployeeBadgeModel.js');
  const { authTokenService } = await import('../src/application/services/authTokenService.js');
  const { Permission, Roles } = await import('../src/shared/constants.js');

  let server;
  await mongoose.connect(process.env.MONGO_URI, { dbName: database, serverSelectionTimeoutMS: 5000 });
  try {
    const common = { department: 'قسم الاختبار', role: Roles.TECHNICAL_STAFF, jobTitle: 'قائد فريق', passwordHash: 'fixture-only' };
    const [admin, operator, coworker] = await UserModel.create([
      { ...common, fullName: 'مدير الاختبار', email: 'admin@fixture.test', role: Roles.GENERAL_MANAGER },
      { ...common, fullName: 'أحمد محمد عبد العزيز إبراهيم عبد الرحمن مصطفى حسين علي', email: 'operator@fixture.test', employeeCode: '00042' },
      { ...common, fullName: 'علي محمد', email: 'coworker@fixture.test', employeeCode: '00043' },
    ]);
    const tokenFor = (user) => authTokenService.sign({ sub: user.id, role: user.role, sv: user.sessionVersion });
    const adminToken = tokenFor(admin);
    const operatorToken = tokenFor(operator);
    const coworkerToken = tokenFor(coworker);
    const app = express();
    app.use(express.json());
    app.use('/badges', badgeRoutes);
    app.use('/auth', authRoutes);
    app.use(errorHandler);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const origin = `http://127.0.0.1:${server.address().port}`;
    const request = (route, { body, method = body ? 'POST' : 'GET', token } = {}) => fetch(origin + route, {
      method,
      headers: { 'Content-Type': 'application/json', Origin: origin, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const list = (token) => request('/badges/employees', { token });
    const create = (token, body) => request('/badges', { token, body });
    const prepare = (token, id, revision) => request(`/badges/${id}/prepare`, { token, body: { revision } });
    const setPermissions = (customPermissions) => request(`/auth/users/${operator.id}/permissions`, {
      method: 'PATCH', token: adminToken, body: { customPermissions },
    });
    const verify = async (token) => {
      const response = await request('/badges/verify', { body: { token } });
      assert.equal(response.headers.get('cache-control'), 'no-store');
      return response.json();
    };

    assert.equal((await list()).status, 401);
    assert.equal((await list(adminToken)).status, 403);
    assert.equal((await list(operatorToken)).status, 403);
    assert.equal((await setPermissions([Permission.USE_EMPLOYEE_BADGES])).status, 200);
    assert.equal((await list(coworkerToken)).status, 403);
    assert.equal((await list(authTokenService.sign({ sub: operator.id, type: 'otp' }))).status, 401);
    const directory = await list(operatorToken);
    assert.equal(directory.status, 200);
    const { employees } = await directory.json();
    assert.deepEqual(employees.find(({ id }) => id === operator.id), {
      id: operator.id, fullName: operator.fullName, employeeCode: '00042',
      jobTitle: operator.jobTitle, department: operator.department,
    });

    const photo = await sharp({ create: { width: 24, height: 24, channels: 3, background: '#234567' } }).jpeg().toBuffer();
    const dates = { issuedOn: '2020-01-01', expiresOn: '2100-01-01' };
    const id = new mongoose.Types.ObjectId().toHexString();
    const fields = {
      ...dates, nameEn: 'Ali Mohammed', jobEn: 'Team Leader', templateChoice: 'maintenance',
      crop: { zoom: 1.2, x: 5, y: -10 }, photo: `data:image/jpeg;base64,${photo.toString('base64')}`,
    };
    const body = { ...fields, id, employeeId: coworker.id };
    assert.equal((await create(operatorToken, { ...body, employeeId: new mongoose.Types.ObjectId().toHexString() })).status, 404);
    assert.equal((await create(operatorToken, { ...body, issuedOn: '2025-02-29' })).status, 400);
    assert.equal((await create(operatorToken, { ...body, expiresOn: '2019-12-31' })).status, 400);
    assert.equal((await create(operatorToken, { ...body, photo: 'data:image/jpeg;base64,AAAA' })).status, 400);
    assert.equal((await create(coworkerToken, body)).status, 403);
    const created = await create(operatorToken, body);
    assert.equal(created.status, 201);
    const { badge } = await created.json();
    assert.equal(badge.employee.employeeCode, '00043');
    assert.equal(badge.template.footer, 'MAINTENANCE TEAM');
    assert.equal(badge.photo, body.photo);
    assert.equal(badge.verificationToken, undefined);
    assert.equal((await create(operatorToken, body)).status, 200);
    assert.equal(await EmployeeBadgeModel.countDocuments(), 1);
    const { badges } = await (await request('/badges', { token: operatorToken })).json();
    assert.equal(badges[0].photo, undefined);
    assert.equal(badges[0].status, 'active');
    assert.equal((await request(`/badges/${id}`, { token: coworkerToken })).status, 403);
    const prepared = await prepare(operatorToken, id, badge.revision);
    assert.equal(prepared.status, 200);
    const { employee, qr } = await prepared.json();
    assert.equal(employee.employeeCode, '00043');
    assert.equal(qr.data.length, qr.size ** 2);

    const { verificationToken: token } = await EmployeeBadgeModel.findById(id).select('+verificationToken').lean();
    const secondResponse = await create(operatorToken, { ...body, id: new mongoose.Types.ObjectId().toHexString() });
    const { badge: second } = await secondResponse.json();
    assert.equal(secondResponse.status, 201);
    const { verificationToken: secondToken } = await EmployeeBadgeModel.findById(second.id).select('+verificationToken').lean();
    assert.notEqual(token, secondToken);
    const publicEmployee = { fullName: employee.fullName, employeeCode: employee.employeeCode, jobTitle: employee.jobTitle };
    const { photo: publicPhoto, ...identity } = await verify(token);
    assert.deepEqual(identity, {
      status: 'active', employee: publicEmployee, ...dates,
      title: 'هوية كادر الصيانة', nameEn: 'Ali Mohammed', jobEn: 'Team Leader',
    });
    assert.match(publicPhoto, /^data:image\/jpeg;base64,/);
    assert.notEqual(publicPhoto, body.photo);
    const portrait = await sharp(Buffer.from(publicPhoto.split(',')[1], 'base64')).metadata();
    assert.deepEqual([portrait.width, portrait.height], [548, 528]);
    const { photo: originalPhoto, ...editableFields } = fields;
    const edit = (revision) => request(`/badges/${id}`, {
      method: 'PATCH', token: operatorToken,
      body: { ...editableFields, employeeId: operator.id, revision, jobEn: 'Site Supervisor', expiresOn: '2099-12-31', templateChoice: 'administrative' },
    });
    const editedResponse = await edit(0);
    assert.equal(editedResponse.status, 200);
    const { badge: edited } = await editedResponse.json();
    assert.equal(edited.employeeId, coworker.id);
    assert.equal(edited.jobEn, 'Site Supervisor');
    assert.equal(edited.template.footer, 'ADMINISTRATIVE TEAM');
    assert.equal(edited.photo, originalPhoto);
    assert.deepEqual(edited.qr, badge.qr);
    assert.equal((await verify(token)).expiresOn, '2099-12-31');
    assert.equal((await edit(0)).status, 409);

    const changeStatus = (active, revision) => request(`/badges/${id}/status`, {
      method: 'PATCH', token: operatorToken, body: { active, revision },
    });
    assert.equal((await changeStatus(false, 1)).status, 200);
    assert.equal((await prepare(operatorToken, id, 2)).status, 409);
    assert.deepEqual(await verify(token), { status: 'inactive' });
    assert.equal((await verify(secondToken)).status, 'active');
    assert.equal((await changeStatus(true, 2)).status, 200);
    assert.equal((await verify(token)).status, 'active');
    await EmployeeBadgeModel.updateOne({ _id: second.id }, { $set: { expiresOn: '2020-01-02' } });
    const expired = await verify(secondToken);
    assert.equal(expired.status, 'expired');
    assert.deepEqual(expired.employee, publicEmployee);
    assert.match(expired.photo, /^data:image\/jpeg;base64,/);

    const legacy = { employeeId: coworker.id, ...dates };
    const legacyToken = createBadgeToken(legacy, secret);
    assert.equal((await verify(legacyToken)).status, 'active');
    assert.deepEqual(await verify(createBadgeToken({ ...legacy, expiresOn: '2020-01-02' }, secret)), {
      status: 'expired', employee: publicEmployee, issuedOn: dates.issuedOn, expiresOn: '2020-01-02',
    });
    assert.deepEqual(await verify(createBadgeToken({ ...legacy, issuedOn: '2099-01-01' }, secret)), { status: 'pending' });
    assert.deepEqual(await verify(createBadgeToken(legacy, randomUUID())), { status: 'invalid' });

    const deleted = await request(`/badges/${id}`, { method: 'DELETE', token: operatorToken, body: { revision: 3 } });
    assert.equal(deleted.status, 200);
    assert.deepEqual(await verify(token), { status: 'invalid' });
    assert.equal((await request(`/badges/${id}`, { token: operatorToken })).status, 404);
    assert.equal((await setPermissions([])).status, 200);
    assert.equal((await list(operatorToken)).status, 403);
    assert.equal((await prepare(operatorToken, second.id, 0)).status, 403);
    const disabled = await request(`/auth/users/${coworker.id}/status`, {
      method: 'PATCH', token: adminToken, body: { active: false },
    });
    assert.equal(disabled.status, 200);
    assert.deepEqual(await verify(secondToken), { status: 'inactive' });
    assert.deepEqual(await verify(legacyToken), { status: 'inactive' });
  } finally {
    if (server) await new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); });
    if (mongoose.connection.name === database) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
