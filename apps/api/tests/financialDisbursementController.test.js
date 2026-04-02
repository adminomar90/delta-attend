import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getFinancialDisbursement,
  reviewFinancialDisbursementAsFinancialManager,
  reviewFinancialDisbursementAsGeneralManager,
  reviewFinancialDisbursementAsProjectManager,
} from '../src/presentation/controllers/financialDisbursementController.js';
import {
  FinancialDisbursementStatus,
  FinancialWorkflowAction,
} from '../src/application/services/financialDisbursementService.js';
import { FinancialDisbursementRepository } from '../src/infrastructure/db/repositories/FinancialDisbursementRepository.js';
import { notificationService } from '../src/application/services/notificationService.js';
import { auditService } from '../src/application/services/auditService.js';
import { Roles } from '../src/shared/constants.js';

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const buildBaseRequest = ({
  status,
  employeeRole = Roles.TECHNICAL_STAFF,
  projectManagerApprovedAt = null,
  financiallyApprovedAt = null,
  generalManagerApprovedAt = null,
  approvedAmount = 135000,
  approvedAmountSetBy = { _id: 'fm-1', fullName: 'المدير المالي', role: Roles.FINANCIAL_MANAGER },
  approvedAmountSetAt = new Date('2026-04-01T09:00:00.000Z'),
  requiresGeneralManagerApproval = false,
  generalManagerRequestReason = '',
}) => ({
  _id: 'fd-1',
  id: 'fd-1',
  requestNo: 'FD-001',
  transactionNo: 'TX-001',
  transactionDate: new Date('2026-04-01T08:00:00.000Z'),
  createdAt: new Date('2026-04-01T08:00:00.000Z'),
  updatedAt: new Date('2026-04-01T08:00:00.000Z'),
  requestType: 'BUSINESS_EXPENSE',
  amount: 150000,
  currency: 'IQD',
  description: 'طلب صرف لاختبار الإرجاع',
  notes: 'ملاحظات أصلية',
  status,
  currentReviewerRole: null,
  employeeRole,
  projectManagerStepSkipped: false,
  employee: {
    _id: 'emp-1',
    fullName: 'الموظف',
    role: Roles.TECHNICAL_STAFF,
    level: 1,
    pointsTotal: 0,
    employeeCode: 'EMP-1',
  },
  projectManagerReviewer: {
    _id: 'pm-1',
    fullName: 'مدير المشاريع',
    role: Roles.PROJECT_MANAGER,
  },
  financialManagerReviewer: {
    _id: 'fm-1',
    fullName: 'المدير المالي',
    role: Roles.FINANCIAL_MANAGER,
  },
  generalManagerReviewer: {
    _id: 'gm-1',
    fullName: 'المدير العام',
    role: Roles.GENERAL_MANAGER,
  },
  projectManagerApprovedAt,
  financiallyApprovedAt,
  generalManagerApprovedAt,
  approvedAmount,
  approvedAmountSetBy,
  approvedAmountSetAt,
  requiresGeneralManagerApproval,
  generalManagerRequestReason,
  attachments: [],
  workflowTrail: [],
  pointsEvents: [],
  archived: false,
});

const applyRepositoryUpdate = (request, payload) => ({
  ...request,
  ...(hasOwn(payload, 'status') ? { status: payload.status } : {}),
  ...(hasOwn(payload, 'currentReviewerRole') ? { currentReviewerRole: payload.currentReviewerRole } : {}),
  ...(hasOwn(payload, 'projectManagerApprovedAt') ? { projectManagerApprovedAt: payload.projectManagerApprovedAt } : {}),
  ...(hasOwn(payload, 'financiallyApprovedAt') ? { financiallyApprovedAt: payload.financiallyApprovedAt } : {}),
  ...(hasOwn(payload, 'generalManagerApprovedAt') ? { generalManagerApprovedAt: payload.generalManagerApprovedAt } : {}),
  ...(hasOwn(payload, 'approvedAmount') ? { approvedAmount: payload.approvedAmount } : {}),
  ...(hasOwn(payload, 'approvedAmountSetBy') ? { approvedAmountSetBy: payload.approvedAmountSetBy } : {}),
  ...(hasOwn(payload, 'approvedAmountSetAt') ? { approvedAmountSetAt: payload.approvedAmountSetAt } : {}),
  ...(hasOwn(payload, 'requiresGeneralManagerApproval')
    ? { requiresGeneralManagerApproval: payload.requiresGeneralManagerApproval }
    : {}),
  ...(hasOwn(payload, 'generalManagerRequestReason')
    ? { generalManagerRequestReason: payload.generalManagerRequestReason }
    : {}),
  workflowTrail: payload.$push?.workflowTrail
    ? [...(request.workflowTrail || []), payload.$push.workflowTrail]
    : (request.workflowTrail || []),
  updatedAt: new Date(),
});

const invokeController = (handler, req) =>
  new Promise((resolve, reject) => {
    const res = {
      json(payload) {
        resolve(payload);
      },
    };

    handler(req, res, (error) => {
      if (error) {
        reject(error);
      }
    });
  });

const assertRejectReturnsRequestToEmployee = async ({
  reviewHandler,
  reviewerUser,
  request,
}) => {
  const repositoryPrototype = FinancialDisbursementRepository.prototype;
  const originalFindById = repositoryPrototype.findById;
  const originalUpdateById = repositoryPrototype.updateById;
  const originalNotifyFinancialRequestStatus = notificationService.notifyFinancialRequestStatus;
  const originalAuditLog = auditService.log;

  let currentRequest = request;
  let capturedPayload = null;

  repositoryPrototype.findById = async () => currentRequest;
  repositoryPrototype.updateById = async (_id, payload) => {
    capturedPayload = payload;
    currentRequest = applyRepositoryUpdate(currentRequest, payload);
    return currentRequest;
  };
  notificationService.notifyFinancialRequestStatus = async () => [];
  auditService.log = async () => ({});

  try {
    await invokeController(reviewHandler, {
      params: { id: String(request._id) },
      body: {
        action: FinancialWorkflowAction.REJECT,
        notes: 'يرجى تعديل البيانات ثم إعادة الإرسال',
      },
      user: reviewerUser,
      headers: {},
      ip: '127.0.0.1',
    });

    assert.ok(capturedPayload, 'expected the request to be updated');
    assert.equal(capturedPayload.status, FinancialDisbursementStatus.RETURNED_FOR_REVIEW);
    assert.equal(capturedPayload.currentReviewerRole, 'EMPLOYEE');
    assert.equal(capturedPayload.projectManagerApprovedAt, null);
    assert.equal(capturedPayload.financiallyApprovedAt, null);
    assert.equal(capturedPayload.generalManagerApprovedAt, null);
    assert.equal(capturedPayload.approvedAmount, null);
    assert.equal(capturedPayload.approvedAmountSetBy, null);
    assert.equal(capturedPayload.approvedAmountSetAt, null);
    assert.equal(capturedPayload.requiresGeneralManagerApproval, false);
    assert.equal(capturedPayload.generalManagerRequestReason, '');
    assert.equal(capturedPayload.$push.workflowTrail.action, FinancialWorkflowAction.REJECT);
    assert.equal(
      capturedPayload.$push.workflowTrail.afterStatus,
      FinancialDisbursementStatus.RETURNED_FOR_REVIEW,
    );

    const employeeView = await invokeController(getFinancialDisbursement, {
      params: { id: String(request._id) },
      user: {
        id: 'emp-1',
        role: Roles.TECHNICAL_STAFF,
      },
      headers: {},
      ip: '127.0.0.1',
    });

    assert.equal(employeeView.request.status, FinancialDisbursementStatus.RETURNED_FOR_REVIEW);
    assert.equal(employeeView.request.currentReviewerRole, 'EMPLOYEE');
    assert.equal(employeeView.request.projectManagerApprovedAt, null);
    assert.equal(employeeView.request.financiallyApprovedAt, null);
    assert.equal(employeeView.request.generalManagerApprovedAt, null);
    assert.equal(employeeView.request.approvedAmount, null);
    assert.equal(employeeView.request.requiresGeneralManagerApproval, false);
    assert.equal(employeeView.request.generalManagerRequestReason, '');
    assert.equal(employeeView.request.canEdit, true);
    assert.equal(employeeView.request.canSubmit, true);
  } finally {
    repositoryPrototype.findById = originalFindById;
    repositoryPrototype.updateById = originalUpdateById;
    notificationService.notifyFinancialRequestStatus = originalNotifyFinancialRequestStatus;
    auditService.log = originalAuditLog;
  }
};

test('project manager rejection returns the request to the employee for editing and resubmission', async () => {
  await assertRejectReturnsRequestToEmployee({
    reviewHandler: reviewFinancialDisbursementAsProjectManager,
    reviewerUser: {
      id: 'pm-1',
      role: Roles.PROJECT_MANAGER,
    },
    request: buildBaseRequest({
      status: FinancialDisbursementStatus.PENDING_PROJECT_MANAGER_APPROVAL,
      approvedAmount: null,
      approvedAmountSetBy: null,
      approvedAmountSetAt: null,
    }),
  });
});

test('financial manager rejection clears prior approvals and reopens the request for the employee', async () => {
  await assertRejectReturnsRequestToEmployee({
    reviewHandler: reviewFinancialDisbursementAsFinancialManager,
    reviewerUser: {
      id: 'fm-1',
      role: Roles.FINANCIAL_MANAGER,
    },
    request: buildBaseRequest({
      status: FinancialDisbursementStatus.PENDING_FINANCIAL_MANAGER_APPROVAL,
      projectManagerApprovedAt: new Date('2026-04-01T10:00:00.000Z'),
    }),
  });
});

test('general manager rejection clears the approval chain and returns the request to the employee', async () => {
  await assertRejectReturnsRequestToEmployee({
    reviewHandler: reviewFinancialDisbursementAsGeneralManager,
    reviewerUser: {
      id: 'gm-1',
      role: Roles.GENERAL_MANAGER,
    },
    request: buildBaseRequest({
      status: FinancialDisbursementStatus.PENDING_GENERAL_MANAGER_APPROVAL,
      projectManagerApprovedAt: new Date('2026-04-01T10:00:00.000Z'),
      financiallyApprovedAt: new Date('2026-04-01T11:00:00.000Z'),
      requiresGeneralManagerApproval: true,
      generalManagerRequestReason: 'Requires executive approval',
    }),
  });
});
