import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSubmissionPointEvents,
  FinancialDisbursementStatus,
  FinancialDisbursementType,
  resolveApprovalChain,
  resolveFinancialReviewers,
  shouldRequireGeneralManagerApproval,
  summarizeFinancialRequests,
} from '../src/application/services/financialDisbursementService.js';

test('shouldRequireGeneralManagerApproval detects threshold and special request types', () => {
  assert.equal(
    shouldRequireGeneralManagerApproval({
      amount: 1200000,
      requestType: FinancialDisbursementType.BUSINESS_EXPENSE,
    }),
    true,
  );

  assert.equal(
    shouldRequireGeneralManagerApproval({
      amount: 1000,
      requestType: FinancialDisbursementType.SALARY_ADVANCE,
    }),
    true,
  );

  assert.equal(
    shouldRequireGeneralManagerApproval({
      amount: 1000,
      requestType: FinancialDisbursementType.BUSINESS_EXPENSE,
    }),
    false,
  );

  assert.equal(
    shouldRequireGeneralManagerApproval({
      amount: 500000,
      requestType: FinancialDisbursementType.SALARY_ADVANCE,
      employeeRole: 'TECHNICAL_STAFF',
    }),
    false,
  );
});

test('buildSubmissionPointEvents includes rewards and penalties based on request details', () => {
  const events = buildSubmissionPointEvents({
    requestType: FinancialDisbursementType.SALARY_ADVANCE,
    attachmentCount: 0,
  });

  assert.deepEqual(
    events.map((entry) => entry.eventKey),
    ['REQUEST_SUBMITTED', 'SALARY_ADVANCE_PENALTY', 'MISSING_ATTACHMENT_PENALTY'],
  );
});

test('resolveFinancialReviewers climbs the hierarchy to nearest project manager and skips self reviewers', () => {
  const users = [
    { _id: 'gm-1', role: 'GENERAL_MANAGER', active: true, manager: null },
    { _id: 'fm-1', role: 'FINANCIAL_MANAGER', active: true, manager: 'gm-1' },
    { _id: 'pm-1', role: 'PROJECT_MANAGER', active: true, manager: 'gm-1' },
    { _id: 'lead-1', role: 'TEAM_LEAD', active: true, manager: 'pm-1' },
    { _id: 'emp-1', role: 'TECHNICAL_STAFF', active: true, manager: 'lead-1' },
  ];

  assert.deepEqual(
    resolveFinancialReviewers({
      employeeId: 'emp-1',
      users,
    }),
    {
      projectManagerId: 'pm-1',
      financialManagerId: 'fm-1',
      generalManagerId: 'gm-1',
    },
  );
});

test('resolveApprovalChain routes project manager requests to general manager first then financial manager', () => {
  const users = [
    { _id: 'gm-1', role: 'GENERAL_MANAGER', active: true, manager: null },
    { _id: 'fm-1', role: 'FINANCIAL_MANAGER', active: true, manager: 'gm-1' },
    { _id: 'pm-1', role: 'PROJECT_MANAGER', active: true, manager: 'gm-1' },
  ];

  assert.deepEqual(
    resolveApprovalChain({
      employeeId: 'pm-1',
      employeeRole: 'PROJECT_MANAGER',
      users,
    }),
    {
      projectManagerId: null,
      financialManagerId: 'fm-1',
      generalManagerId: 'gm-1',
      skipProjectManager: true,
      skipFinancialManager: false,
      initialStatus: FinancialDisbursementStatus.PENDING_GENERAL_MANAGER_APPROVAL,
      initialReviewerRole: 'GENERAL_MANAGER',
    },
  );
});

test('resolveApprovalChain keeps financial manager as disburser for own requests', () => {
  const users = [
    { _id: 'gm-1', role: 'GENERAL_MANAGER', active: true, manager: null },
    { _id: 'fm-1', role: 'FINANCIAL_MANAGER', active: true, manager: 'gm-1' },
  ];

  assert.deepEqual(
    resolveApprovalChain({
      employeeId: 'fm-1',
      employeeRole: 'FINANCIAL_MANAGER',
      users,
    }),
    {
      projectManagerId: null,
      financialManagerId: 'fm-1',
      generalManagerId: 'gm-1',
      skipProjectManager: true,
      skipFinancialManager: true,
      initialStatus: FinancialDisbursementStatus.PENDING_GENERAL_MANAGER_APPROVAL,
      initialReviewerRole: 'GENERAL_MANAGER',
    },
  );
});

test('summarizeFinancialRequests aggregates financial workflow states', () => {
  const summary = summarizeFinancialRequests([
    { status: FinancialDisbursementStatus.PENDING_PROJECT_MANAGER_APPROVAL, amount: 100 },
    { status: FinancialDisbursementStatus.PENDING_FINANCIAL_MANAGER_APPROVAL, amount: 200 },
    { status: FinancialDisbursementStatus.READY_FOR_DISBURSEMENT, amount: 300 },
    { status: FinancialDisbursementStatus.CLOSED, amount: 400 },
    { status: FinancialDisbursementStatus.REJECTED_BY_FINANCIAL_MANAGER, amount: 500 },
  ]);

  assert.equal(summary.total, 5);
  assert.equal(summary.pendingProjectManager, 1);
  assert.equal(summary.pendingFinancialManager, 1);
  assert.equal(summary.readyForDisbursement, 1);
  assert.equal(summary.closed, 1);
  assert.equal(summary.rejected, 1);
  assert.equal(summary.totalAmount, 1500);
  assert.equal(summary.closedAmount, 400);
});
