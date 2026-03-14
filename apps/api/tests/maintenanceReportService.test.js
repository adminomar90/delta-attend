import test from 'node:test';
import assert from 'node:assert/strict';
import { Roles } from '../src/shared/constants.js';
import {
  createMaintenanceFeedbackToken,
  isMaintenanceFeedbackTokenValid,
  MaintenanceReportStatus,
  resolveMaintenanceManagerReviewerId,
  summarizeMaintenanceReports,
} from '../src/application/services/maintenanceReportService.js';

test('maintenance feedback token is valid before expiry and invalid after use', () => {
  const feedback = createMaintenanceFeedbackToken({ validHours: 2 });

  assert.equal(
    isMaintenanceFeedbackTokenValid({
      tokenHash: feedback.tokenHash,
      rawToken: feedback.rawToken,
      expiresAt: feedback.expiresAt,
      usedAt: null,
    }),
    true,
  );

  assert.equal(
    isMaintenanceFeedbackTokenValid({
      tokenHash: feedback.tokenHash,
      rawToken: feedback.rawToken,
      expiresAt: feedback.expiresAt,
      usedAt: new Date(),
    }),
    false,
  );
});

test('resolveMaintenanceManagerReviewerId returns the active direct manager when available', () => {
  const users = [
    { _id: 'gm-1', role: Roles.GENERAL_MANAGER, active: true, manager: null },
    { _id: 'lead-1', role: Roles.TEAM_LEAD, active: true, manager: 'gm-1' },
    { _id: 'tech-1', role: Roles.TECHNICAL_STAFF, active: true, manager: 'lead-1' },
  ];

  assert.equal(
    resolveMaintenanceManagerReviewerId({
      employeeId: 'tech-1',
      users,
    }),
    'lead-1',
  );
});

test('summarizeMaintenanceReports aggregates pending and rating metrics', () => {
  const summary = summarizeMaintenanceReports([
    {
      status: MaintenanceReportStatus.AWAITING_ACCEPTANCE,
    },
    {
      status: MaintenanceReportStatus.PENDING_MANAGER_APPROVAL,
      customerFeedback: { companyRating: 4, employeeRating: 5 },
    },
    {
      status: MaintenanceReportStatus.APPROVED,
      customerFeedback: { companyRating: 5, employeeRating: 4 },
    },
  ]);

  assert.equal(summary.total, 3);
  assert.equal(summary.awaitingAcceptance, 1);
  assert.equal(summary.pendingApproval, 1);
  assert.equal(summary.approved, 1);
  assert.equal(summary.averageCompanyRating, 4.5);
  assert.equal(summary.averageEmployeeRating, 4.5);
});
