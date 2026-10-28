import test from 'node:test';
import assert from 'node:assert/strict';
import { isWarehouseOperator, workflowCustodyStatus } from '../src/application/services/inventoryWorkflowService.js';

test('custody remains open until all quantities are settled and damaged stock is physically received', () => {
  const line = { receivedQty: 10, consumedQty: 5, returnedQty: 3, damagedQty: 2, damagedReturnedQty: 0, lostQty: 0 };
  assert.equal(workflowCustodyStatus([line]), 'PARTIALLY_RECONCILED');
  assert.equal(workflowCustodyStatus([{ ...line, damagedReturnedQty: 2 }]), 'CLOSED');
  assert.equal(workflowCustodyStatus([{ receivedQty: 10 }]), 'OPEN');
  assert.equal(workflowCustodyStatus([{ receivedQty: 10, consumedQty: 4 }]), 'PARTIALLY_RECONCILED');
  assert.equal(workflowCustodyStatus([]), 'OPEN');
  assert.equal(workflowCustodyStatus([{ receivedQty: 0.3, consumedQty: 0.1, returnedQty: 0.2 }]), 'CLOSED');
});

test('warehouse workflow is restricted to inventory operators', () => {
  assert.equal(isWarehouseOperator({ role: 'WAREHOUSE_KEEPER' }), true);
  assert.equal(isWarehouseOperator({ role: 'GENERAL_MANAGER' }), true);
  assert.equal(isWarehouseOperator({ role: 'TECHNICAL_STAFF' }), false);
  assert.equal(isWarehouseOperator({ role: 'PROJECT_MANAGER' }), false);
  assert.equal(isWarehouseOperator({ customPermissions: ['MANAGE_MATERIAL_INVENTORY'] }), true);
});
