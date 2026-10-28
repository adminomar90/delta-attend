import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMaterialRequestTarget } from '../src/application/services/materialRequestTargetService.js';

const dependencies = {
  findProject: async () => ({ _id: 'project-1', name: 'Project One', clientName: 'Project Client' }),
  findCustomer: async () => ({ _id: 'customer-1', name: 'Customer One' }),
  canSeeCustomer: async () => true,
};

test('customer requests need no project and use the registered customer name', async () => {
  const target = await resolveMaterialRequestTarget({ requestTarget: 'CUSTOMER', customerId: 'customer-1', projectId: 'stale-project', manualProjectName: 'stale name', clientName: 'forged name' }, dependencies);
  assert.deepEqual(target, { requestTarget: 'CUSTOMER', customer: 'customer-1', project: null, projectName: '', manualProjectName: '', clientName: 'Customer One' });
});

test('switching to a project clears the customer association', async () => {
  const target = await resolveMaterialRequestTarget({ requestTarget: 'PROJECT', projectId: 'project-1', customerId: 'stale-customer' }, dependencies);
  assert.equal(target.project, 'project-1');
  assert.equal(target.customer, null);
  assert.equal(target.projectName, 'Project One');
  assert.equal(target.clientName, 'Project Client');
});

test('existing manual project payloads remain supported', async () => {
  const target = await resolveMaterialRequestTarget({ manualProjectName: 'Manual Project' }, dependencies);
  assert.equal(target.requestTarget, 'PROJECT');
  assert.equal(target.project, null);
  assert.equal(target.manualProjectName, 'Manual Project');
});

test('missing, archived and inaccessible customers are rejected', async () => {
  const body = { requestTarget: 'CUSTOMER', customerId: 'customer-1' };
  await assert.rejects(resolveMaterialRequestTarget({ requestTarget: 'CUSTOMER' }, dependencies), { statusCode: 400 });
  await assert.rejects(resolveMaterialRequestTarget(body, { ...dependencies, findCustomer: async () => null }), { statusCode: 404 });
  await assert.rejects(resolveMaterialRequestTarget(body, { ...dependencies, findCustomer: async () => ({ archived: true }) }), { statusCode: 404 });
  await assert.rejects(resolveMaterialRequestTarget(body, { ...dependencies, canSeeCustomer: async () => false }), { statusCode: 403 });
});

test('invalid targets and missing projects are rejected', async () => {
  await assert.rejects(resolveMaterialRequestTarget({ requestTarget: 'OTHER' }, dependencies), { statusCode: 400 });
  await assert.rejects(resolveMaterialRequestTarget({ requestTarget: 'PROJECT' }, dependencies), { statusCode: 400 });
  await assert.rejects(resolveMaterialRequestTarget({ projectId: 'missing' }, { ...dependencies, findProject: async () => null }), { statusCode: 404 });
});
