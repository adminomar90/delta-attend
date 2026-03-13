import dayjs from 'dayjs';
import { Permission } from '../../shared/constants.js';

export const ApprovalOperationType = {
  TASK: 'task',
  PROJECT: 'project',
  WORK_REPORT: 'work-report',
  ATTENDANCE: 'attendance',
  MATERIAL_REQUEST: 'material-request',
  MATERIAL_RECONCILIATION: 'material-reconciliation',
};

const operationMetadata = {
  [ApprovalOperationType.TASK]: {
    label: 'Task',
    permission: Permission.APPROVE_TASKS,
  },
  [ApprovalOperationType.PROJECT]: {
    label: 'Project',
    permission: Permission.APPROVE_PROJECTS,
  },
  [ApprovalOperationType.WORK_REPORT]: {
    label: 'Work Report',
    permission: Permission.APPROVE_TASKS,
  },
  [ApprovalOperationType.ATTENDANCE]: {
    label: 'Attendance',
    permission: Permission.APPROVE_TASKS,
  },
  [ApprovalOperationType.MATERIAL_REQUEST]: {
    label: 'Material Request',
    permission: Permission.REVIEW_MATERIAL_REQUESTS,
  },
  [ApprovalOperationType.MATERIAL_RECONCILIATION]: {
    label: 'Material Reconciliation',
    permission: Permission.REVIEW_MATERIAL_REQUESTS,
  },
};

const approvedProjectStatuses = new Set(['ACTIVE', 'ON_HOLD', 'DONE']);
const approvedMaterialRequestStatuses = new Set([
  'APPROVED',
  'PREPARING',
  'PREPARED',
  'DELIVERED',
  'PENDING_RECONCILIATION',
  'RECONCILED',
  'CLOSED',
]);

const safeText = (value) => String(value ?? '').trim();
const safeUpper = (value) => safeText(value).toUpperCase();
const shortId = (value) => safeText(value).slice(-6).toUpperCase();
const toId = (value) => safeText(value?._id || value?.id || value);
const compact = (items = []) => items.filter((item) => item !== null && item !== undefined && item !== '');

const toDateOrNull = (value) => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const roundPoints = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
};

const formatDateLabel = (value) => {
  const date = toDateOrNull(value);
  return date ? dayjs(date).format('YYYY-MM-DD') : '';
};

const formatTimeLabel = (value) => {
  const date = toDateOrNull(value);
  return date ? dayjs(date).format('HH:mm') : '';
};

const normalizeSearch = (value) => safeText(value).toLowerCase();
const contains = (value, expected) => normalizeSearch(value).includes(normalizeSearch(expected));

const withinDateRange = (value, from, to) => {
  const date = toDateOrNull(value);
  if (!date) {
    return false;
  }

  const normalized = dayjs(date);
  if (from) {
    const fromDate = dayjs(from).startOf('day');
    if (!fromDate.isValid() || normalized.isBefore(fromDate)) {
      return false;
    }
  }

  if (to) {
    const toDate = dayjs(to).endOf('day');
    if (!toDate.isValid() || normalized.isAfter(toDate)) {
      return false;
    }
  }

  return true;
};

const withinTimeRange = (value, from, to) => {
  if (!from && !to) {
    return true;
  }

  const token = formatTimeLabel(value);
  if (!token) {
    return false;
  }

  if (from && token < from) {
    return false;
  }

  if (to && token > to) {
    return false;
  }

  return true;
};

const normalizeUserSummary = (user, fallbackName = '') => ({
  id: toId(user),
  fullName: safeText(user?.fullName || fallbackName),
  role: safeUpper(user?.role),
  employeeCode: safeUpper(user?.employeeCode),
  department: safeText(user?.department),
  jobTitle: safeText(user?.jobTitle),
});

const buildItem = (label, value) => {
  const resolved = Array.isArray(value) ? value.filter(Boolean).join(', ') : value;
  const text = safeText(resolved);
  return text ? { label, value: text } : null;
};

const buildSection = (title, items = []) => {
  const resolved = items.filter(Boolean);
  return resolved.length ? { title, items: resolved } : null;
};

const detailSectionsToText = (sections = []) =>
  sections
    .flatMap((section) => [
      section.title,
      ...section.items.map((item) => `${item.label}: ${item.value}`),
    ])
    .join('\n');

const buildApprovalStep = ({
  sequence,
  operationType,
  approver,
  role,
  approvedAt,
  note = '',
  status = 'APPROVED',
  permission,
}) => ({
  sequence,
  approverId: toId(approver),
  approverName: safeText(approver?.fullName),
  approverRole: safeUpper(role || approver?.role),
  approverPermission: permission || operationMetadata[operationType]?.permission || '',
  status,
  approvedAt: toDateOrNull(approvedAt),
  approvalDate: formatDateLabel(approvedAt),
  approvalTime: formatTimeLabel(approvedAt),
  note: safeText(note),
});

const buildApprovalStepSummary = (steps = []) =>
  steps
    .map((step) =>
      compact([
        `${step.sequence}. ${step.approverName || 'Unknown approver'}`,
        step.approverRole ? `(${step.approverRole})` : '',
        step.approvalDate && step.approvalTime ? `@ ${step.approvalDate} ${step.approvalTime}` : '',
        step.status ? `- ${step.status}` : '',
        step.note ? `- ${step.note}` : '',
      ]).join(' '),
    )
    .join(' | ');

const finalizeRecord = (record) => {
  const approvedAt = toDateOrNull(record.approvedAt);
  const createdAt = toDateOrNull(record.createdAt);
  const detailSections = (record.detailSections || []).filter(Boolean);
  const approvalSteps = (record.approvalSteps || []).filter(Boolean);

  return {
    ...record,
    createdAt,
    approvedAt,
    createdDate: formatDateLabel(createdAt),
    createdTime: formatTimeLabel(createdAt),
    approvalDate: formatDateLabel(approvedAt),
    approvalTime: formatTimeLabel(approvedAt),
    detailSections,
    approvalSteps,
    fullDetails: detailSectionsToText(detailSections),
    approvalStepsSummary: buildApprovalStepSummary(approvalSteps),
  };
};

export const buildTaskRecord = (task) => {
  const approvalSteps = (task.approvalTrail || []).map((entry, index) =>
    buildApprovalStep({
      sequence: index + 1,
      operationType: ApprovalOperationType.TASK,
      approver: entry.approver,
      role: entry.role,
      approvedAt: entry.approvedAt,
      note: entry.note,
    }),
  );
  const creator = normalizeUserSummary(task.assignedBy);
  const employee = normalizeUserSummary(task.assignee);
  const lastStep = approvalSteps[approvalSteps.length - 1] || null;
  const finalApprover = normalizeUserSummary(task.approvedBy, lastStep?.approverName);
  const relatedProject = safeText(task.project?.name);
  const departmentName = safeText(task.assignee?.department);

  return finalizeRecord({
    id: toId(task),
    recordId: toId(task),
    operationType: ApprovalOperationType.TASK,
    operationTypeLabel: operationMetadata[ApprovalOperationType.TASK].label,
    operationNumber: `TASK-${shortId(task._id)}`,
    title: safeText(task.title) || `Task ${shortId(task._id)}`,
    approvalStatus: 'APPROVED',
    rawStatus: safeUpper(task.status),
    points: roundPoints(task.pointsAwarded),
    createdAt: task.createdAt,
    approvedAt: task.approvedAt || lastStep?.approvedAt || null,
    createdByName: creator.fullName,
    createdByRole: creator.role,
    employeeName: employee.fullName,
    employeeCode: employee.employeeCode,
    approverName: finalApprover.fullName || lastStep?.approverName || '',
    approverRole: finalApprover.role || lastStep?.approverRole || '',
    approverPermission: operationMetadata[ApprovalOperationType.TASK].permission,
    projectName: relatedProject,
    departmentName,
    relatedProjectOrDepartment: relatedProject || departmentName,
    notes: safeText(lastStep?.note),
    creator,
    subject: employee,
    finalApprover: {
      ...finalApprover,
      permission: operationMetadata[ApprovalOperationType.TASK].permission,
    },
    approvalSteps,
    detailSections: [
      buildSection('Summary', [
        buildItem('Operation Number', `TASK-${shortId(task._id)}`),
        buildItem('Status', task.status),
        buildItem('Points', String(roundPoints(task.pointsAwarded))),
        buildItem('Project', relatedProject),
        buildItem('Department', departmentName),
        buildItem('Required Approvals', String(task.requiredApprovals || 1)),
      ]),
      buildSection('Task Details', [
        buildItem('Title', task.title),
        buildItem('Description', task.description),
        buildItem('Due Date', formatDateLabel(task.dueDate)),
        buildItem('Estimated Hours', String(task.estimatedHours || 0)),
        buildItem('Difficulty', String(task.difficulty || 0)),
        buildItem('Urgency', String(task.urgency || 0)),
        buildItem('Quality Score', String(task.qualityScore || 0)),
        buildItem('Approval Note', lastStep?.note),
      ]),
    ],
    attachments: [],
  });
};

export const buildProjectRecord = (project) => {
  const approvalSteps = (project.approvalTrail || []).map((entry, index) =>
    buildApprovalStep({
      sequence: index + 1,
      operationType: ApprovalOperationType.PROJECT,
      approver: entry.approver,
      role: entry.role,
      approvedAt: entry.approvedAt,
      note: entry.comment,
    }),
  );
  const creator = normalizeUserSummary(project.owner);
  const finalStep = approvalSteps[approvalSteps.length - 1] || null;
  const relatedProject = safeText(project.name);

  return finalizeRecord({
    id: toId(project),
    recordId: toId(project),
    operationType: ApprovalOperationType.PROJECT,
    operationTypeLabel: operationMetadata[ApprovalOperationType.PROJECT].label,
    operationNumber: safeText(project.code) || `PROJECT-${shortId(project._id)}`,
    title: safeText(project.name) || `Project ${shortId(project._id)}`,
    approvalStatus: 'APPROVED',
    rawStatus: safeUpper(project.status),
    points: roundPoints(project.approvalPointsAwarded),
    createdAt: project.createdAt,
    approvedAt: project.approvedAt || finalStep?.approvedAt || null,
    createdByName: creator.fullName,
    createdByRole: creator.role,
    employeeName: creator.fullName,
    employeeCode: creator.employeeCode,
    approverName: finalStep?.approverName || '',
    approverRole: finalStep?.approverRole || '',
    approverPermission: operationMetadata[ApprovalOperationType.PROJECT].permission,
    projectName: relatedProject,
    departmentName: creator.department,
    relatedProjectOrDepartment: relatedProject || creator.department,
    notes: safeText(finalStep?.note),
    creator,
    subject: creator,
    finalApprover: {
      id: finalStep?.approverId || '',
      fullName: finalStep?.approverName || '',
      role: finalStep?.approverRole || '',
      permission: operationMetadata[ApprovalOperationType.PROJECT].permission,
    },
    approvalSteps,
    detailSections: [
      buildSection('Summary', [
        buildItem('Operation Number', safeText(project.code) || `PROJECT-${shortId(project._id)}`),
        buildItem('Project Name', project.name),
        buildItem('Status', project.status),
        buildItem('Points', String(roundPoints(project.approvalPointsAwarded))),
        buildItem('Required Approval Roles', (project.requiredApprovalRoles || []).join(', ')),
      ]),
      buildSection('Project Details', [
        buildItem('Description', project.description),
        buildItem('Budget', String(roundPoints(project.budget))),
        buildItem('Start Date', formatDateLabel(project.startDate)),
        buildItem('End Date', formatDateLabel(project.endDate)),
        buildItem('Team Members', (project.teamMembers || []).map((member) => member.fullName).join(', ')),
        buildItem('Final Approval Note', finalStep?.note),
      ]),
    ],
    attachments: [],
  });
};

export const buildWorkReportRecord = (report) => {
  const creator = normalizeUserSummary(report.user, report.employeeName);
  const finalApprover = normalizeUserSummary(report.approvedBy);
  const participantNames = (report.participants || []).map((participant) => participant.fullName).filter(Boolean);
  const approvalSteps = [
    buildApprovalStep({
      sequence: 1,
      operationType: ApprovalOperationType.WORK_REPORT,
      approver: report.approvedBy,
      approvedAt: report.approvedAt,
      note: report.managerComment,
    }),
  ].filter((step) => step.approverId || step.approvedAt);

  return finalizeRecord({
    id: toId(report),
    recordId: toId(report),
    operationType: ApprovalOperationType.WORK_REPORT,
    operationTypeLabel: operationMetadata[ApprovalOperationType.WORK_REPORT].label,
    operationNumber: `WR-${shortId(report._id)}`,
    title: safeText(report.title) || `Work Report ${shortId(report._id)}`,
    approvalStatus: 'APPROVED',
    rawStatus: safeUpper(report.status),
    points: roundPoints(report.pointsAwarded),
    createdAt: report.createdAt,
    approvedAt: report.approvedAt,
    createdByName: creator.fullName,
    createdByRole: creator.role,
    employeeName: safeText(report.employeeName) || creator.fullName,
    employeeCode: safeUpper(report.employeeCode) || creator.employeeCode,
    approverName: finalApprover.fullName,
    approverRole: finalApprover.role,
    approverPermission: operationMetadata[ApprovalOperationType.WORK_REPORT].permission,
    projectName: safeText(report.project?.name || report.projectName),
    departmentName: creator.department,
    relatedProjectOrDepartment: safeText(report.project?.name || report.projectName) || creator.department,
    notes: safeText(report.managerComment),
    creator,
    subject: creator,
    finalApprover: {
      ...finalApprover,
      permission: operationMetadata[ApprovalOperationType.WORK_REPORT].permission,
    },
    approvalSteps,
    detailSections: [
      buildSection('Summary', [
        buildItem('Operation Number', `WR-${shortId(report._id)}`),
        buildItem('Project', report.project?.name || report.projectName),
        buildItem('Status', report.status),
        buildItem('Points', String(roundPoints(report.pointsAwarded))),
        buildItem('Work Date', formatDateLabel(report.workDate)),
        buildItem('Activity Type', report.activityType),
      ]),
      buildSection('Report Details', [
        buildItem('Title', report.title),
        buildItem('Details', report.details),
        buildItem('Accomplishments', report.accomplishments),
        buildItem('Challenges', report.challenges),
        buildItem('Next Steps', report.nextSteps),
        buildItem('Progress Percent', `${Number(report.progressPercent || 0)}%`),
        buildItem('Hours Spent', String(report.hoursSpent || 0)),
        buildItem('Participant Count', String(report.participantCount || participantNames.length || 0)),
        buildItem('Participants', participantNames.join(', ')),
        buildItem('Manager Comment', report.managerComment),
        buildItem('Reporter Points', String(roundPoints(report.reporterPointsAwarded))),
        buildItem('Participant Points', String(roundPoints(report.participantPointsAwarded))),
      ]),
    ],
    attachments: [
      ...(report.pdfFile?.publicUrl
        ? [{
            type: 'pdf',
            label: 'Work Report PDF',
            url: report.pdfFile.publicUrl,
            downloadName: report.pdfFile.filename || `work-report-${shortId(report._id)}.pdf`,
          }]
        : []),
      ...(report.images || []).map((image, index) => ({
        type: 'image',
        label: image.comment || `Image ${index + 1}`,
        url: image.publicUrl,
        downloadName: image.originalName || `work-report-image-${index + 1}`,
      })),
    ],
  });
};

export const buildAttendanceRecord = (attendance) => {
  const creator = normalizeUserSummary(attendance.user, attendance.employeeName);
  const finalApprover = normalizeUserSummary(attendance.approvedBy);
  const approvalSteps = [
    buildApprovalStep({
      sequence: 1,
      operationType: ApprovalOperationType.ATTENDANCE,
      approver: attendance.approvedBy,
      approvedAt: attendance.approvedAt,
      note: attendance.approvalNote,
    }),
  ].filter((step) => step.approverId || step.approvedAt);

  return finalizeRecord({
    id: toId(attendance),
    recordId: toId(attendance),
    operationType: ApprovalOperationType.ATTENDANCE,
    operationTypeLabel: operationMetadata[ApprovalOperationType.ATTENDANCE].label,
    operationNumber: `ATT-${shortId(attendance._id)}`,
    title: `Attendance ${safeText(attendance.employeeName) || shortId(attendance._id)}`,
    approvalStatus: 'APPROVED',
    rawStatus: safeUpper(attendance.approvalStatus || attendance.status),
    points: roundPoints(attendance.pointsAwarded),
    createdAt: attendance.createdAt || attendance.checkInAt,
    approvedAt: attendance.approvedAt,
    createdByName: creator.fullName,
    createdByRole: creator.role,
    employeeName: safeText(attendance.employeeName) || creator.fullName,
    employeeCode: safeUpper(attendance.employeeCode) || creator.employeeCode,
    approverName: finalApprover.fullName,
    approverRole: finalApprover.role,
    approverPermission: operationMetadata[ApprovalOperationType.ATTENDANCE].permission,
    projectName: '',
    departmentName: creator.department,
    relatedProjectOrDepartment: creator.department || attendance.workSite?.name || '',
    notes: safeText(attendance.approvalNote),
    creator,
    subject: creator,
    finalApprover: {
      ...finalApprover,
      permission: operationMetadata[ApprovalOperationType.ATTENDANCE].permission,
    },
    approvalSteps,
    detailSections: [
      buildSection('Summary', [
        buildItem('Operation Number', `ATT-${shortId(attendance._id)}`),
        buildItem('Work Site', attendance.workSite?.name),
        buildItem('Approval Status', attendance.approvalStatus),
        buildItem('Points', String(roundPoints(attendance.pointsAwarded))),
        buildItem('Duration Minutes', String(attendance.durationMinutes || 0)),
      ]),
      buildSection('Attendance Details', [
        buildItem('Check-In', attendance.checkInAt ? dayjs(attendance.checkInAt).format('YYYY-MM-DD HH:mm') : ''),
        buildItem('Check-Out', attendance.checkOutAt ? dayjs(attendance.checkOutAt).format('YYYY-MM-DD HH:mm') : ''),
        buildItem(
          'Check-In Location',
          attendance.checkInLocation
            ? `${attendance.checkInLocation.latitude}, ${attendance.checkInLocation.longitude}`
            : '',
        ),
        buildItem(
          'Check-Out Location',
          attendance.checkOutLocation
            ? `${attendance.checkOutLocation.latitude}, ${attendance.checkOutLocation.longitude}`
            : '',
        ),
        buildItem('Approval Note', attendance.approvalNote),
      ]),
    ],
    attachments: [],
  });
};

export const buildMaterialRequestRecord = (request) => {
  const creator = normalizeUserSummary(request.requestedBy);
  const employee = normalizeUserSummary(request.requestedFor, creator.fullName);
  const finalApprover = normalizeUserSummary(request.approvalSummary?.approvedBy);
  const approvalSteps = (request.approvals || []).map((entry, index) =>
    buildApprovalStep({
      sequence: index + 1,
      operationType: ApprovalOperationType.MATERIAL_REQUEST,
      approver: entry.approvedBy,
      approvedAt: entry.approvedAt,
      note: entry.comment,
      status: entry.action === 'REJECT' ? 'REJECTED' : 'APPROVED',
    }),
  );
  const itemsSummary = (request.items || []).map((item) =>
    compact([
      item.materialName || item.material?.name || '',
      `requested ${item.requestedQty || 0}`,
      `approved ${item.approvedQty || 0}`,
      item.lineStatus || '',
    ]).join(' | '),
  );

  return finalizeRecord({
    id: toId(request),
    recordId: toId(request),
    operationType: ApprovalOperationType.MATERIAL_REQUEST,
    operationTypeLabel: operationMetadata[ApprovalOperationType.MATERIAL_REQUEST].label,
    operationNumber: safeText(request.requestNo) || `MR-${shortId(request._id)}`,
    title: `Material Request ${safeText(request.requestNo) || shortId(request._id)}`,
    approvalStatus: 'APPROVED',
    rawStatus: safeUpper(request.status),
    points: 0,
    createdAt: request.createdAt || request.requestDate,
    approvedAt: request.approvalSummary?.approvedAt,
    createdByName: creator.fullName,
    createdByRole: creator.role,
    employeeName: employee.fullName || creator.fullName,
    employeeCode: employee.employeeCode || creator.employeeCode,
    approverName: finalApprover.fullName,
    approverRole: finalApprover.role,
    approverPermission: operationMetadata[ApprovalOperationType.MATERIAL_REQUEST].permission,
    projectName: safeText(request.project?.name || request.projectName),
    departmentName: employee.department || creator.department,
    relatedProjectOrDepartment: safeText(request.project?.name || request.projectName)
      || employee.department
      || creator.department,
    notes: safeText(request.approvalSummary?.notes),
    creator,
    subject: employee,
    finalApprover: {
      ...finalApprover,
      permission: operationMetadata[ApprovalOperationType.MATERIAL_REQUEST].permission,
    },
    approvalSteps,
    detailSections: [
      buildSection('Summary', [
        buildItem('Operation Number', request.requestNo || `MR-${shortId(request._id)}`),
        buildItem('Project', request.project?.name || request.projectName),
        buildItem('Status', request.status),
        buildItem('Priority', request.priority),
        buildItem('Approval Type', request.approvalSummary?.approvalType),
        buildItem('Points', '0'),
      ]),
      buildSection('Request Details', [
        buildItem('General Notes', request.generalNotes),
        buildItem('Requested For', employee.fullName),
        buildItem('Assigned Preparer', request.assignedPreparer?.fullName),
        buildItem('Items', itemsSummary.join(' || ')),
        buildItem('Approval Notes', request.approvalSummary?.notes),
      ]),
    ],
    attachments: [],
  });
};

export const buildMaterialReconciliationRecord = (reconciliation) => {
  const creator = normalizeUserSummary(reconciliation.submittedBy);
  const finalApprover = normalizeUserSummary(reconciliation.reviewedBy);
  const approvalSteps = [
    buildApprovalStep({
      sequence: 1,
      operationType: ApprovalOperationType.MATERIAL_RECONCILIATION,
      approver: reconciliation.reviewedBy,
      approvedAt: reconciliation.reviewedAt,
      note: reconciliation.reviewNotes,
    }),
  ].filter((step) => step.approverId || step.approvedAt);
  const itemsSummary = (reconciliation.items || []).map((item) =>
    compact([
      item.materialName || item.material?.name || '',
      `received ${item.receivedQty || 0}`,
      `consumed ${item.consumedQty || 0}`,
      `return ${item.toReturnQty || 0}`,
    ]).join(' | '),
  );

  return finalizeRecord({
    id: toId(reconciliation),
    recordId: toId(reconciliation),
    operationType: ApprovalOperationType.MATERIAL_RECONCILIATION,
    operationTypeLabel: operationMetadata[ApprovalOperationType.MATERIAL_RECONCILIATION].label,
    operationNumber: safeText(reconciliation.reconcileNo) || `RC-${shortId(reconciliation._id)}`,
    title: `Material Reconciliation ${safeText(reconciliation.reconcileNo) || shortId(reconciliation._id)}`,
    approvalStatus: 'APPROVED',
    rawStatus: safeUpper(reconciliation.status),
    points: roundPoints(reconciliation.pointsAwarded),
    createdAt: reconciliation.createdAt || reconciliation.submittedAt,
    approvedAt: reconciliation.reviewedAt,
    createdByName: creator.fullName,
    createdByRole: creator.role,
    employeeName: creator.fullName,
    employeeCode: creator.employeeCode,
    approverName: finalApprover.fullName,
    approverRole: finalApprover.role,
    approverPermission: operationMetadata[ApprovalOperationType.MATERIAL_RECONCILIATION].permission,
    projectName: safeText(reconciliation.project?.name),
    departmentName: creator.department,
    relatedProjectOrDepartment: safeText(reconciliation.project?.name) || creator.department,
    notes: safeText(reconciliation.reviewNotes),
    creator,
    subject: creator,
    finalApprover: {
      ...finalApprover,
      permission: operationMetadata[ApprovalOperationType.MATERIAL_RECONCILIATION].permission,
    },
    approvalSteps,
    detailSections: [
      buildSection('Summary', [
        buildItem('Operation Number', reconciliation.reconcileNo || `RC-${shortId(reconciliation._id)}`),
        buildItem('Status', reconciliation.status),
        buildItem('Points', String(roundPoints(reconciliation.pointsAwarded))),
        buildItem('Project', reconciliation.project?.name),
        buildItem('Custody Number', reconciliation.custody?.custodyNo),
        buildItem('Request Number', reconciliation.request?.requestNo),
      ]),
      buildSection('Reconciliation Details', [
        buildItem('Submitted Notes', reconciliation.notes),
        buildItem('Review Notes', reconciliation.reviewNotes),
        buildItem('Items', itemsSummary.join(' || ')),
      ]),
    ],
    attachments: [],
  });
};

export const isApprovedProjectRecord = (project) =>
  Boolean(project?.approvedAt) || approvedProjectStatuses.has(safeUpper(project?.status));

export const isApprovedMaterialRequestRecord = (request) =>
  safeUpper(request?.status) !== 'REJECTED'
  && (Boolean(request?.approvalSummary?.approvedAt) || approvedMaterialRequestStatuses.has(safeUpper(request?.status)));

export const normalizeApprovalHistoryRecords = ({
  tasks = [],
  projects = [],
  workReports = [],
  attendanceRecords = [],
  materialRequests = [],
  materialReconciliations = [],
} = {}) =>
  [
    ...tasks.filter((task) => safeUpper(task.status) === 'APPROVED').map(buildTaskRecord),
    ...projects.filter(isApprovedProjectRecord).map(buildProjectRecord),
    ...workReports.filter((report) => safeUpper(report.status) === 'APPROVED').map(buildWorkReportRecord),
    ...attendanceRecords
      .filter((attendance) => safeUpper(attendance.approvalStatus) === 'APPROVED')
      .map(buildAttendanceRecord),
    ...materialRequests.filter(isApprovedMaterialRequestRecord).map(buildMaterialRequestRecord),
    ...materialReconciliations
      .filter((reconciliation) => safeUpper(reconciliation.status) === 'APPROVED')
      .map(buildMaterialReconciliationRecord),
  ].sort((left, right) => {
    const rightTime = toDateOrNull(right.approvedAt)?.getTime() || 0;
    const leftTime = toDateOrNull(left.approvedAt)?.getTime() || 0;
    if (rightTime !== leftTime) {
      return rightTime - leftTime;
    }

    const rightCreated = toDateOrNull(right.createdAt)?.getTime() || 0;
    const leftCreated = toDateOrNull(left.createdAt)?.getTime() || 0;
    return rightCreated - leftCreated;
  });

export const filterApprovalHistoryRecords = (records = [], filters = {}) => {
  const query = safeText(filters.query);
  const operationType = safeText(filters.operationType);
  const employeeName = safeText(filters.employeeName);
  const approverName = safeText(filters.approverName);
  const projectOrDepartment = safeText(filters.projectOrDepartment);
  const status = safeUpper(filters.status);
  const createdFrom = safeText(filters.createdFrom);
  const createdTo = safeText(filters.createdTo);
  const approvedFrom = safeText(filters.approvedFrom);
  const approvedTo = safeText(filters.approvedTo);
  const timeFrom = safeText(filters.timeFrom);
  const timeTo = safeText(filters.timeTo);
  const minPoints = filters.minPoints === '' || filters.minPoints === undefined ? null : Number(filters.minPoints);
  const maxPoints = filters.maxPoints === '' || filters.maxPoints === undefined ? null : Number(filters.maxPoints);

  return records.filter((record) => {
    if (operationType && record.operationType !== operationType) {
      return false;
    }

    if (employeeName && !contains(compact([record.employeeName, record.employeeCode]).join(' '), employeeName)) {
      return false;
    }

    if (approverName && !contains(compact([record.approverName, record.approverRole]).join(' '), approverName)) {
      return false;
    }

    if (
      projectOrDepartment
      && !contains(compact([record.projectName, record.departmentName, record.relatedProjectOrDepartment]).join(' '), projectOrDepartment)
    ) {
      return false;
    }

    if (status && safeUpper(record.approvalStatus) !== status && safeUpper(record.rawStatus) !== status) {
      return false;
    }

    if ((createdFrom || createdTo) && !withinDateRange(record.createdAt, createdFrom, createdTo)) {
      return false;
    }

    if ((approvedFrom || approvedTo) && !withinDateRange(record.approvedAt, approvedFrom, approvedTo)) {
      return false;
    }

    if ((timeFrom || timeTo) && !withinTimeRange(record.approvedAt, timeFrom, timeTo)) {
      return false;
    }

    if (Number.isFinite(minPoints) && record.points < minPoints) {
      return false;
    }

    if (Number.isFinite(maxPoints) && record.points > maxPoints) {
      return false;
    }

    if (query) {
      const searchBlob = compact([
        record.operationNumber,
        record.title,
        record.operationTypeLabel,
        record.createdByName,
        record.employeeName,
        record.approverName,
        record.projectName,
        record.departmentName,
        record.notes,
        record.fullDetails,
        record.approvalStepsSummary,
      ]).join('\n');

      if (!contains(searchBlob, query)) {
        return false;
      }
    }

    return true;
  });
};

export const buildApprovalHistoryExportRows = (records = []) =>
  records.map((record) => ({
    operationNumber: record.operationNumber,
    title: record.title,
    operationType: record.operationTypeLabel,
    createdBy: record.createdByName,
    createdByRole: record.createdByRole || '',
    employeeName: record.employeeName,
    employeeCode: record.employeeCode || '',
    projectOrDepartment: record.relatedProjectOrDepartment || '',
    approverName: record.approverName || '',
    approverRole: record.approverRole || '',
    approverPermission: record.approverPermission || '',
    approvalStatus: record.approvalStatus,
    rawStatus: record.rawStatus || '',
    points: roundPoints(record.points),
    createdDate: record.createdDate || '',
    createdTime: record.createdTime || '',
    approvalDate: record.approvalDate || '',
    approvalTime: record.approvalTime || '',
    notes: record.notes || '',
    fullDetails: record.fullDetails || '',
    approvalSteps: record.approvalStepsSummary || '',
  }));

export const findApprovalHistoryRecord = ({
  records = [],
  operationType = '',
  recordId = '',
} = {}) =>
  records.find(
    (record) => record.operationType === operationType && record.recordId === safeText(recordId),
  ) || null;
