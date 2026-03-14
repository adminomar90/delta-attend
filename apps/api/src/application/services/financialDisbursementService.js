import { Roles } from '../../shared/constants.js';
import {
  buildUsersById,
  isActiveHierarchyUser,
  toHierarchyUserId,
} from '../../shared/employeeHierarchy.js';

export const FinancialDisbursementType = {
  TRANSPORT_EXPENSE: 'TRANSPORT_EXPENSE',
  FOOD_EXPENSE: 'FOOD_EXPENSE',
  MATERIALS_EXPENSE: 'MATERIALS_EXPENSE',
  WORK_ADVANCE: 'WORK_ADVANCE',
  BUSINESS_EXPENSE: 'BUSINESS_EXPENSE',
  SALARY_ADVANCE: 'SALARY_ADVANCE',
  EXCEPTIONAL_EXPENSE: 'EXCEPTIONAL_EXPENSE',
  TRAVEL_EXPENSE: 'TRAVEL_EXPENSE',
  PURCHASE_REIMBURSEMENT: 'PURCHASE_REIMBURSEMENT',
  OTHER: 'OTHER',
};

export const FinancialDisbursementStatus = {
  DRAFT: 'DRAFT',
  IN_SUBMISSION: 'IN_SUBMISSION',
  PENDING_PROJECT_MANAGER_APPROVAL: 'PENDING_PROJECT_MANAGER_APPROVAL',
  REJECTED_BY_PROJECT_MANAGER: 'REJECTED_BY_PROJECT_MANAGER',
  PROJECT_MANAGER_APPROVED: 'PROJECT_MANAGER_APPROVED',
  PENDING_FINANCIAL_MANAGER_APPROVAL: 'PENDING_FINANCIAL_MANAGER_APPROVAL',
  REJECTED_BY_FINANCIAL_MANAGER: 'REJECTED_BY_FINANCIAL_MANAGER',
  FINANCIALLY_APPROVED: 'FINANCIALLY_APPROVED',
  PENDING_GENERAL_MANAGER_APPROVAL: 'PENDING_GENERAL_MANAGER_APPROVAL',
  REJECTED_BY_GENERAL_MANAGER: 'REJECTED_BY_GENERAL_MANAGER',
  GENERAL_MANAGER_APPROVED: 'GENERAL_MANAGER_APPROVED',
  READY_FOR_DISBURSEMENT: 'READY_FOR_DISBURSEMENT',
  DISBURSED: 'DISBURSED',
  PENDING_RECEIPT_CONFIRMATION: 'PENDING_RECEIPT_CONFIRMATION',
  RECEIVED: 'RECEIVED',
  CLOSED: 'CLOSED',
  RETURNED_FOR_REVIEW: 'RETURNED_FOR_REVIEW',
};

export const FinancialWorkflowAction = {
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  RETURN_FOR_REVIEW: 'RETURN_FOR_REVIEW',
  REQUEST_GENERAL_MANAGER_APPROVAL: 'REQUEST_GENERAL_MANAGER_APPROVAL',
  DELIVER_FUNDS: 'DELIVER_FUNDS',
  CONFIRM_RECEIPT: 'CONFIRM_RECEIPT',
  SUBMIT: 'SUBMIT',
  SAVE_DRAFT: 'SAVE_DRAFT',
};

export const financialDisbursementPolicy = {
  generalManagerApprovalAmount: 1000000,
  generalManagerApprovalTypes: [
    FinancialDisbursementType.SALARY_ADVANCE,
    FinancialDisbursementType.WORK_ADVANCE,
    FinancialDisbursementType.EXCEPTIONAL_EXPENSE,
  ],
  fastTrackHours: 72,
  points: {
    REQUEST_SUBMITTED: 4,
    ATTACHMENT_BONUS: 3,
    SALARY_ADVANCE_PENALTY: -5,
    MISSING_ATTACHMENT_PENALTY: -3,
    REQUEST_APPROVED: 4,
    REQUEST_CLOSED: 8,
    FAST_TRACK_CLOSURE_BONUS: 2,
  },
};

const PROJECT_REVIEWER_ROLES = [Roles.PROJECT_MANAGER, Roles.ASSISTANT_PROJECT_MANAGER];

const uniqueByUserId = (users = []) => {
  const seen = new Set();
  const result = [];

  for (const user of users || []) {
    const userId = toHierarchyUserId(user);
    if (!userId || seen.has(userId)) {
      continue;
    }
    seen.add(userId);
    result.push(user);
  }

  return result;
};

export const getFinancialStatusLabel = (status) => ({
  [FinancialDisbursementStatus.DRAFT]: 'مسودة',
  [FinancialDisbursementStatus.IN_SUBMISSION]: 'قيد الإرسال',
  [FinancialDisbursementStatus.PENDING_PROJECT_MANAGER_APPROVAL]: 'بانتظار اعتماد مدير المشاريع',
  [FinancialDisbursementStatus.REJECTED_BY_PROJECT_MANAGER]: 'مرفوض من مدير المشاريع',
  [FinancialDisbursementStatus.PROJECT_MANAGER_APPROVED]: 'تم اعتماد مدير المشاريع',
  [FinancialDisbursementStatus.PENDING_FINANCIAL_MANAGER_APPROVAL]: 'بانتظار اعتماد المدير المالي',
  [FinancialDisbursementStatus.REJECTED_BY_FINANCIAL_MANAGER]: 'مرفوض من المدير المالي',
  [FinancialDisbursementStatus.FINANCIALLY_APPROVED]: 'معتمد ماليا',
  [FinancialDisbursementStatus.PENDING_GENERAL_MANAGER_APPROVAL]: 'بانتظار اعتماد المدير العام',
  [FinancialDisbursementStatus.REJECTED_BY_GENERAL_MANAGER]: 'مرفوض من المدير العام',
  [FinancialDisbursementStatus.GENERAL_MANAGER_APPROVED]: 'تم اعتماد المدير العام',
  [FinancialDisbursementStatus.READY_FOR_DISBURSEMENT]: 'جاهز لتسليم المبلغ',
  [FinancialDisbursementStatus.DISBURSED]: 'تم تسليم المبلغ',
  [FinancialDisbursementStatus.PENDING_RECEIPT_CONFIRMATION]: 'بانتظار تأكيد الاستلام من الموظف',
  [FinancialDisbursementStatus.RECEIVED]: 'تم الاستلام',
  [FinancialDisbursementStatus.CLOSED]: 'مغلق',
  [FinancialDisbursementStatus.RETURNED_FOR_REVIEW]: 'معاد للمراجعة',
}[status] || status || '');

export const shouldRequireGeneralManagerApproval = ({
  amount,
  requestType,
  forceGeneralManagerApproval = false,
  policy = financialDisbursementPolicy,
} = {}) => {
  if (forceGeneralManagerApproval) {
    return true;
  }

  const safeAmount = Math.max(0, Number(amount || 0));
  if (safeAmount >= Number(policy.generalManagerApprovalAmount || 0)) {
    return true;
  }

  return (policy.generalManagerApprovalTypes || []).includes(requestType);
};

export const buildSubmissionPointEvents = ({
  requestType,
  attachmentCount = 0,
  policy = financialDisbursementPolicy,
} = {}) => {
  const points = policy.points || {};
  const events = [
    {
      eventKey: 'REQUEST_SUBMITTED',
      points: Number(points.REQUEST_SUBMITTED || 0),
      reason: 'إنشاء طلب صرف مالي وإرساله',
    },
  ];

  if (attachmentCount > 0 && Number(points.ATTACHMENT_BONUS || 0) !== 0) {
    events.push({
      eventKey: 'ATTACHMENT_BONUS',
      points: Number(points.ATTACHMENT_BONUS || 0),
      reason: 'إرفاق فاتورة أو مستند رسمي بطلب الصرف',
    });
  }

  if (requestType === FinancialDisbursementType.SALARY_ADVANCE && Number(points.SALARY_ADVANCE_PENALTY || 0) !== 0) {
    events.push({
      eventKey: 'SALARY_ADVANCE_PENALTY',
      points: Number(points.SALARY_ADVANCE_PENALTY || 0),
      reason: 'طلب سلفة مالية',
    });
  }

  if (attachmentCount <= 0 && Number(points.MISSING_ATTACHMENT_PENALTY || 0) !== 0) {
    events.push({
      eventKey: 'MISSING_ATTACHMENT_PENALTY',
      points: Number(points.MISSING_ATTACHMENT_PENALTY || 0),
      reason: 'إرسال طلب صرف بدون مرفقات داعمة',
    });
  }

  return events.filter((event) => Number(event.points || 0) !== 0);
};

export const buildApprovalPointEvents = ({
  policy = financialDisbursementPolicy,
} = {}) => {
  const points = policy.points || {};
  const events = [];

  if (Number(points.REQUEST_APPROVED || 0) !== 0) {
    events.push({
      eventKey: 'REQUEST_APPROVED',
      points: Number(points.REQUEST_APPROVED || 0),
      reason: 'اعتماد معاملة الصرف المالي',
    });
  }

  return events.filter((event) => Number(event.points || 0) !== 0);
};

export const buildClosurePointEvents = ({
  request,
  policy = financialDisbursementPolicy,
} = {}) => {
  const points = policy.points || {};
  const events = [];

  if (Number(points.REQUEST_CLOSED || 0) !== 0) {
    events.push({
      eventKey: 'REQUEST_CLOSED',
      points: Number(points.REQUEST_CLOSED || 0),
      reason: 'إغلاق معاملة الصرف المالي بنجاح',
    });
  }

  const submittedAt = request?.submittedAt ? new Date(request.submittedAt) : null;
  const closedAt = request?.closedAt ? new Date(request.closedAt) : new Date();
  if (
    submittedAt
    && Number(points.FAST_TRACK_CLOSURE_BONUS || 0) !== 0
    && ((closedAt.getTime() - submittedAt.getTime()) / (1000 * 60 * 60)) <= Number(policy.fastTrackHours || 72)
  ) {
    events.push({
      eventKey: 'FAST_TRACK_CLOSURE_BONUS',
      points: Number(points.FAST_TRACK_CLOSURE_BONUS || 0),
      reason: 'إغلاق معاملة الصرف بسرعة وانضباط',
    });
  }

  return events.filter((event) => Number(event.points || 0) !== 0);
};

const findNearestProjectManagerId = ({ employeeId, users = [] } = {}) => {
  const activeUsers = uniqueByUserId(users).filter((user) => isActiveHierarchyUser(user));
  const usersById = buildUsersById(activeUsers);
  const normalizedEmployeeId = toHierarchyUserId(employeeId);
  const employee = usersById.get(normalizedEmployeeId);

  const visited = new Set(normalizedEmployeeId ? [normalizedEmployeeId] : []);
  let managerId = toHierarchyUserId(employee?.manager);

  while (managerId && !visited.has(managerId)) {
    visited.add(managerId);
    const manager = usersById.get(managerId);

    if (!manager) {
      break;
    }

    if (PROJECT_REVIEWER_ROLES.includes(manager.role)) {
      return managerId;
    }

    managerId = toHierarchyUserId(manager.manager);
  }

  return toHierarchyUserId(
    activeUsers.find((user) =>
      PROJECT_REVIEWER_ROLES.includes(user.role)
      && toHierarchyUserId(user) !== normalizedEmployeeId),
  );
};

const findRoleReviewerId = ({ employeeId, users = [], role }) => {
  const normalizedEmployeeId = toHierarchyUserId(employeeId);
  return toHierarchyUserId(
    uniqueByUserId(users).find((user) =>
      isActiveHierarchyUser(user)
      && user.role === role
      && toHierarchyUserId(user) !== normalizedEmployeeId),
  );
};

export const resolveFinancialReviewers = ({
  employeeId,
  users = [],
} = {}) => {
  const activeUsers = uniqueByUserId(users).filter((user) => isActiveHierarchyUser(user));

  return {
    projectManagerId: findNearestProjectManagerId({ employeeId, users: activeUsers }),
    financialManagerId: findRoleReviewerId({ employeeId, users: activeUsers, role: Roles.FINANCIAL_MANAGER }),
    generalManagerId: findRoleReviewerId({ employeeId, users: activeUsers, role: Roles.GENERAL_MANAGER }),
  };
};

export const resolveApprovalChain = ({
  employeeId,
  employeeRole,
  users = [],
} = {}) => {
  const activeUsers = uniqueByUserId(users).filter((user) => isActiveHierarchyUser(user));

  const chain = {
    projectManagerId: null,
    financialManagerId: null,
    generalManagerId: null,
    skipProjectManager: false,
    skipFinancialManager: false,
    initialStatus: null,
    initialReviewerRole: null,
  };

  const generalManagerId = findRoleReviewerId({ employeeId, users: activeUsers, role: Roles.GENERAL_MANAGER });

  if (employeeRole === Roles.PROJECT_MANAGER || employeeRole === Roles.FINANCIAL_MANAGER) {
    chain.generalManagerId = generalManagerId;
    chain.skipProjectManager = true;
    chain.skipFinancialManager = true;
    chain.initialStatus = FinancialDisbursementStatus.PENDING_GENERAL_MANAGER_APPROVAL;
    chain.initialReviewerRole = Roles.GENERAL_MANAGER;
  } else {
    chain.projectManagerId = findNearestProjectManagerId({ employeeId, users: activeUsers });
    chain.financialManagerId = findRoleReviewerId({ employeeId, users: activeUsers, role: Roles.FINANCIAL_MANAGER });
    chain.generalManagerId = generalManagerId;
    chain.skipProjectManager = false;
    chain.skipFinancialManager = false;
    chain.initialStatus = FinancialDisbursementStatus.PENDING_PROJECT_MANAGER_APPROVAL;
    chain.initialReviewerRole = Roles.PROJECT_MANAGER;
  }

  return chain;
};

export const summarizeFinancialRequests = (requests = []) => {
  const summary = {
    total: requests.length,
    pendingProjectManager: 0,
    pendingFinancialManager: 0,
    pendingGeneralManager: 0,
    readyForDisbursement: 0,
    disbursed: 0,
    closed: 0,
    rejected: 0,
    returnedForReview: 0,
    totalAmount: 0,
    closedAmount: 0,
  };

  for (const request of requests || []) {
    const amount = Math.max(0, Number(request.amount || 0));
    summary.totalAmount += amount;

    switch (request.status) {
      case FinancialDisbursementStatus.PENDING_PROJECT_MANAGER_APPROVAL:
        summary.pendingProjectManager += 1;
        break;
      case FinancialDisbursementStatus.PENDING_FINANCIAL_MANAGER_APPROVAL:
        summary.pendingFinancialManager += 1;
        break;
      case FinancialDisbursementStatus.PENDING_GENERAL_MANAGER_APPROVAL:
        summary.pendingGeneralManager += 1;
        break;
      case FinancialDisbursementStatus.READY_FOR_DISBURSEMENT:
        summary.readyForDisbursement += 1;
        break;
      case FinancialDisbursementStatus.DISBURSED:
      case FinancialDisbursementStatus.PENDING_RECEIPT_CONFIRMATION:
        summary.disbursed += 1;
        break;
      case FinancialDisbursementStatus.RECEIVED:
      case FinancialDisbursementStatus.CLOSED:
        summary.closed += 1;
        summary.closedAmount += amount;
        break;
      case FinancialDisbursementStatus.RETURNED_FOR_REVIEW:
        summary.returnedForReview += 1;
        break;
      case FinancialDisbursementStatus.REJECTED_BY_PROJECT_MANAGER:
      case FinancialDisbursementStatus.REJECTED_BY_FINANCIAL_MANAGER:
      case FinancialDisbursementStatus.REJECTED_BY_GENERAL_MANAGER:
        summary.rejected += 1;
        break;
      default:
        break;
    }
  }

  return summary;
};
