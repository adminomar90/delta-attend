import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicRoute } from '../../web/lib/publicRoutes.mjs';
import { AuditLogModel } from '../src/infrastructure/db/models/AuditLogModel.js';
test('supplier quote and existing token forms are public without opening internal pages', () => {
  for (const route of ['/purchase-quote/supplier-token', '/customer-form/token', '/customer-evaluation/token', '/maintenance-feedback/token', '/login']) assert.equal(isPublicRoute(route), true, route);
  for (const route of ['/purchases', '/purchases/123', '/dashboard', '/tasks', '/purchase-quote-admin/token', '/customer-forms', undefined, null]) assert.equal(isPublicRoute(route), false, String(route));
});
test('external supplier audit needs no employee while internal audit still requires one', () => {
  const base = { action: 'PURCHASE_QUOTE_SUBMITTED', entityType: 'PURCHASE_REQUEST', entityId: 'example' };
  assert.equal(new AuditLogModel({ ...base, actorType: 'SUPPLIER', externalActor: { name: 'Test supplier' } }).validateSync(), undefined);
  assert.ok(new AuditLogModel(base).validateSync()?.errors.actor);
});
