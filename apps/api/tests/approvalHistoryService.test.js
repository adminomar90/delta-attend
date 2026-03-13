import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ApprovalOperationType,
  buildApprovalHistoryExportRows,
  filterApprovalHistoryRecords,
  normalizeApprovalHistoryRecords,
} from '../src/application/services/approvalHistoryService.js';

test('normalizeApprovalHistoryRecords keeps approved records and sorts by approval date descending', () => {
  const records = normalizeApprovalHistoryRecords({
    tasks: [
      {
        _id: 'task-1',
        title: 'Install system',
        status: 'APPROVED',
        pointsAwarded: 10,
        createdAt: '2026-03-01T08:00:00.000Z',
        approvedAt: '2026-03-04T10:00:00.000Z',
        assignedBy: { _id: 'u1', fullName: 'Manager', role: 'PROJECT_MANAGER' },
        assignee: { _id: 'u2', fullName: 'Tech One', role: 'TECHNICAL_STAFF', department: 'Ops' },
        project: { name: 'Project Alpha' },
        approvalTrail: [
          {
            approver: { _id: 'u3', fullName: 'Approver A', role: 'TEAM_LEAD' },
            role: 'TEAM_LEAD',
            note: 'Looks good',
            approvedAt: '2026-03-04T10:00:00.000Z',
          },
        ],
        approvedBy: { _id: 'u3', fullName: 'Approver A', role: 'TEAM_LEAD' },
      },
    ],
    workReports: [
      {
        _id: 'report-1',
        title: 'Daily report',
        status: 'APPROVED',
        createdAt: '2026-03-02T08:00:00.000Z',
        approvedAt: '2026-03-05T09:00:00.000Z',
        employeeName: 'Tech Two',
        user: { _id: 'u4', fullName: 'Tech Two', role: 'TECHNICAL_STAFF' },
        approvedBy: { _id: 'u5', fullName: 'Approver B', role: 'PROJECT_MANAGER' },
        details: 'Completed wiring',
        managerComment: 'Approved',
      },
    ],
  });

  assert.equal(records.length, 2);
  assert.equal(records[0].operationType, ApprovalOperationType.WORK_REPORT);
  assert.equal(records[1].operationType, ApprovalOperationType.TASK);
  assert.equal(records[1].approvalSteps[0].approverName, 'Approver A');
});

test('filterApprovalHistoryRecords applies text, type, points, date, and time filters', () => {
  const sample = [
    {
      operationType: ApprovalOperationType.TASK,
      operationTypeLabel: 'Task',
      operationNumber: 'TASK-AAA111',
      title: 'Task A',
      createdByName: 'Manager',
      employeeName: 'Employee A',
      approverName: 'Lead A',
      projectName: 'Project A',
      departmentName: 'Operations',
      relatedProjectOrDepartment: 'Project A',
      notes: 'Fast approval',
      fullDetails: 'Detail A',
      approvalStepsSummary: '',
      approvalStatus: 'APPROVED',
      rawStatus: 'APPROVED',
      points: 12,
      createdAt: '2026-03-01T08:00:00.000Z',
      approvedAt: '2026-03-04T10:15:00',
    },
    {
      operationType: ApprovalOperationType.PROJECT,
      operationTypeLabel: 'Project',
      operationNumber: 'PRJ-002',
      title: 'Project B',
      createdByName: 'Owner',
      employeeName: 'Owner',
      approverName: 'GM',
      projectName: 'Project B',
      departmentName: 'Finance',
      relatedProjectOrDepartment: 'Finance',
      notes: 'Budget approved',
      fullDetails: 'Detail B',
      approvalStepsSummary: '',
      approvalStatus: 'APPROVED',
      rawStatus: 'ACTIVE',
      points: 60,
      createdAt: '2026-03-02T08:00:00.000Z',
      approvedAt: '2026-03-05T12:30:00',
    },
  ];

  const filtered = filterApprovalHistoryRecords(sample, {
    query: 'budget',
    operationType: ApprovalOperationType.PROJECT,
    minPoints: 50,
    approvedFrom: '2026-03-05',
    approvedTo: '2026-03-05',
    timeFrom: '12:00',
    timeTo: '13:00',
  });

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].operationNumber, 'PRJ-002');
});

test('buildApprovalHistoryExportRows flattens approval history rows for export', () => {
  const rows = buildApprovalHistoryExportRows([
    {
      operationNumber: 'TASK-123456',
      title: 'Task A',
      operationTypeLabel: 'Task',
      createdByName: 'Manager',
      createdByRole: 'PROJECT_MANAGER',
      employeeName: 'Employee',
      employeeCode: 'EMP-1',
      relatedProjectOrDepartment: 'Project Alpha',
      approverName: 'Lead',
      approverRole: 'TEAM_LEAD',
      approverPermission: 'APPROVE_TASKS',
      approvalStatus: 'APPROVED',
      rawStatus: 'APPROVED',
      points: 10,
      createdDate: '2026-03-01',
      createdTime: '08:00',
      approvalDate: '2026-03-02',
      approvalTime: '09:30',
      notes: 'Approved',
      fullDetails: 'Some details',
      approvalStepsSummary: '1. Lead (TEAM_LEAD)',
    },
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].approvalSteps.includes('Lead'), true);
  assert.equal(rows[0].projectOrDepartment, 'Project Alpha');
});
