import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCustodyWhatsapp, custodyLoginUrl, resolveCustodyReturnPath } from '../../web/lib/custodyWhatsapp.mjs';

const origin = 'http://localhost:3000';
const custody = { custodyId: 'custody-1', custodyNo: 'CU-00001', project: 'مشروع الاختبار', status: 'OPEN', items: [{ unit: 'METER', remainingQty: 50 }, { unit: 'PIECE', remainingQty: 2 }] };
const holder = { holderId: 'technician-1', holderName: 'فني الاختبار', employeeCode: 'T-001', custodies: [custody] };

test('WhatsApp uses a prepared settlement message and chooser link like work reports', () => {
  const result = buildCustodyWhatsapp({ origin, holder, custody });
  const whatsapp = new URL(result.url), link = new URL(result.link);
  assert.equal(whatsapp.origin, 'https://wa.me');
  assert.equal(whatsapp.pathname, '/');
  assert.equal(whatsapp.searchParams.get('text'), result.message);
  assert.match(result.message, /طلب تصفية/);
  assert.match(result.message, /CU-00001/);
  assert.match(result.message, /مشروع الاختبار/);
  assert.match(result.message, /متر/);
  assert.match(result.message, /قطعة/);
  assert.ok(result.message.includes(result.link));
  assert.equal(link.pathname, '/warehouses');
  assert.equal(link.searchParams.get('tab'), 'custodies');
  assert.equal(link.searchParams.get('holderId'), holder.holderId);
  assert.equal(link.searchParams.get('custodyId'), custody.custodyId);
  assert.equal(link.searchParams.get('action'), 'reconcile');
  assert.equal(link.hash, '#custody-custody-1');
});

test('whole technician link selects the holder without choosing an arbitrary custody', () => {
  const result = buildCustodyWhatsapp({ origin, holder, includeClosed: true });
  const link = new URL(result.link);
  assert.equal(link.searchParams.get('holderId'), holder.holderId);
  assert.equal(link.searchParams.has('custodyId'), false);
  assert.equal(link.searchParams.get('includeClosed'), 'true');
});

test('closed and unassigned records receive view links with the appropriate scope', () => {
  const result = buildCustodyWhatsapp({ origin, holder: { ...holder, holderId: 'unknown' }, custody: { ...custody, status: 'CLOSED' } });
  const link = new URL(result.link);
  assert.equal(link.searchParams.get('action'), 'view');
  assert.equal(link.searchParams.get('includeClosed'), 'true');
  assert.equal(link.searchParams.get('holderId'), 'unassigned');
  assert.doesNotMatch(result.message, /طلب تصفية/);
});

test('custody deep link survives login without permitting external redirects', () => {
  const { link } = buildCustodyWhatsapp({ origin, holder, custody });
  const location = new URL(link);
  const login = new URL(custodyLoginUrl(location), origin);
  const next = login.searchParams.get('next');
  assert.equal(origin + resolveCustodyReturnPath(next, origin), link);
  for (const invalid of [null, '//evil.example/warehouses?tab=custodies', '/\\evil.example/warehouses?tab=custodies', 'https://evil.example/', '/dashboard', 'javascript:alert(1)']) {
    assert.equal(resolveCustodyReturnPath(invalid, origin), '');
  }
  assert.equal(custodyLoginUrl(new URL(origin + '/dashboard')), '/login');
});
