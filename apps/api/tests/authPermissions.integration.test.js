import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import express from 'express';
import session from 'express-session';
import mongoose from 'mongoose';
import { Permission, Roles } from '../src/shared/constants.js';

test('full manager permissions fit in a browser session and remain available after login', {
  skip: !process.env.AUTH_TEST_MONGO_URI,
}, async () => {
  const database = `delta_auth_test_${randomUUID().replaceAll('-', '')}`;
  process.env.MONGO_URI = process.env.AUTH_TEST_MONGO_URI;
  process.env.JWT_SECRET = randomUUID();

  const { default: authRoutes } = await import('../src/presentation/routes/authRoutes.js');
  const { default: badgeRoutes } = await import('../src/presentation/routes/employeeBadgesRoutes.js');
  const { authTokenService } = await import('../src/application/services/authTokenService.js');
  const { errorHandler } = await import('../src/presentation/middlewares/errorHandler.js');
  const { UserModel } = await import('../src/infrastructure/db/models/UserModel.js');

  let server;
  await mongoose.connect(process.env.MONGO_URI, { dbName: database, serverSelectionTimeoutMS: 5000 });
  try {
    const password = 'auth-fixture-password!';
    const passwordHash = await bcrypt.hash(password, 4);
    const manager = await UserModel.create({
      email: 'manager@fixture.test', passwordHash, fullName: 'مدير الاختبار', role: Roles.GENERAL_MANAGER,
    });
    const employee = await UserModel.create({
      email: 'employee@fixture.test', passwordHash, fullName: 'موظف الاختبار', role: Roles.TECHNICAL_STAFF,
    });
    const app = express();
    app.use(express.json(), cookieParser(), session({ secret: randomUUID(), resave: false, saveUninitialized: false }));
    app.use('/auth', authRoutes);
    app.use('/badges', badgeRoutes);
    app.use(errorHandler);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const origin = `http://127.0.0.1:${server.address().port}`;
    const login = (email) => fetch(`${origin}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const accessCookie = (response) => {
      const cookie = response.headers.getSetCookie().find((value) => value.startsWith('token='));
      assert.ok(cookie);
      assert.ok(Buffer.byteLength(cookie, 'utf8') < 1024);
      return cookie.split(';')[0];
    };

    const firstLogin = await login(manager.email);
    assert.equal(firstLogin.status, 200);
    const customPermissions = Object.values(Permission);
    const grant = await fetch(`${origin}/auth/users/${manager.id}/permissions`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: accessCookie(firstLogin) },
      body: JSON.stringify({ customPermissions }),
    });
    assert.equal(grant.status, 200);

    const managerLogin = await login(manager.email);
    assert.equal(managerLogin.status, 200);
    const managerCookie = accessCookie(managerLogin);
    const { token, user } = await managerLogin.json();
    assert.equal(authTokenService.verify(token).customPermissions, undefined);
    assert.deepEqual(user.customPermissions, customPermissions);
    assert.ok(user.permissions.includes(Permission.USE_EMPLOYEE_BADGES));
    assert.equal((await fetch(`${origin}/badges/employees`, { headers: { Cookie: managerCookie } })).status, 200);

    const legacyToken = authTokenService.sign({
      sub: manager.id, role: manager.role, name: manager.fullName, email: manager.email,
      customPermissions, sv: manager.sessionVersion,
    });
    assert.ok(legacyToken.length > 4096);
    const refreshed = await fetch(`${origin}/auth/me`, { headers: { Authorization: `Bearer ${legacyToken}` } });
    assert.equal(refreshed.status, 200);
    accessCookie(refreshed);
    assert.deepEqual((await refreshed.json()).user.customPermissions, customPermissions);

    const employeeLogin = await login(employee.email);
    assert.equal(employeeLogin.status, 200);
    const employeeCookie = accessCookie(employeeLogin);
    assert.equal((await fetch(`${origin}/auth/me`, { headers: { Cookie: employeeCookie } })).status, 200);
    assert.equal((await fetch(`${origin}/badges/employees`, { headers: { Cookie: employeeCookie } })).status, 403);
  } finally {
    if (server) await new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); });
    if (mongoose.connection.name === database) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
