import test from 'node:test';
import assert from 'node:assert/strict';
import { workReportPointsService } from '../src/application/services/workReportPointsService.js';

test('calculateDistribution keeps full points for report author when there are no participants', () => {
  const distribution = workReportPointsService.calculateDistribution(100, 0);

  assert.equal(distribution.totalPoints, 100);
  assert.equal(distribution.reporterPoints, 100);
  assert.equal(distribution.participantsTotalPoints, 0);
  assert.equal(distribution.participantPoints, 0);
});

test('calculateDistribution splits report points between author and participants', () => {
  const distribution = workReportPointsService.calculateDistribution(100, 4);

  assert.equal(distribution.totalPoints, 100);
  assert.equal(distribution.reporterPoints, 35);
  assert.equal(distribution.participantsTotalPoints, 65);
  assert.equal(distribution.participantPoints, 16.25);
});

test('buildApprovalRecipients returns report owner then unique participants', () => {
  const recipients = workReportPointsService.buildApprovalRecipients({
    user: { _id: 'owner-1' },
    employeeName: 'قائد الفريق',
    employeeCode: 'TL-1',
    participants: [
      { user: 'member-1', fullName: 'المشارك الأول', employeeCode: 'E-1' },
      { user: { _id: 'owner-1' }, fullName: 'مكرر', employeeCode: 'DUP' },
      { user: 'member-2', fullName: 'المشارك الثاني', employeeCode: 'E-2' },
    ],
  });

  assert.deepEqual(recipients, [
    {
      userId: 'owner-1',
      fullName: 'قائد الفريق',
      employeeCode: 'TL-1',
      distributionRole: 'REPORT_OWNER',
    },
    {
      userId: 'member-1',
      fullName: 'المشارك الأول',
      employeeCode: 'E-1',
      distributionRole: 'PARTICIPANT',
    },
    {
      userId: 'member-2',
      fullName: 'المشارك الثاني',
      employeeCode: 'E-2',
      distributionRole: 'PARTICIPANT',
    },
  ]);
});

test('summarizePointAwards keeps manual totals and detects non-uniform participant points', () => {
  const summary = workReportPointsService.summarizePointAwards([
    { user: 'owner-1', fullName: 'قائد الفريق', distributionRole: 'REPORT_OWNER', pointsAwarded: 30 },
    { user: 'member-1', fullName: 'الأول', distributionRole: 'PARTICIPANT', pointsAwarded: 12 },
    { user: 'member-2', fullName: 'الثاني', distributionRole: 'PARTICIPANT', pointsAwarded: 8 },
  ]);

  assert.equal(summary.totalPoints, 50);
  assert.equal(summary.reporterPoints, 30);
  assert.equal(summary.participantsTotalPoints, 20);
  assert.equal(summary.participantPoints, 0);
  assert.equal(summary.participantCount, 2);
  assert.equal(summary.hasUniformParticipantPoints, false);
});

test('resolveStoredPointAwards falls back to legacy automatic distribution when detailed awards are absent', () => {
  const summary = workReportPointsService.resolveStoredPointAwards({
    user: { _id: 'owner-1' },
    employeeName: 'قائد الفريق',
    employeeCode: 'TL-1',
    pointsAwarded: 100,
    reporterPointsAwarded: 35,
    participantPointsAwarded: 16.25,
    participants: [
      { user: 'member-1', fullName: 'الأول', employeeCode: 'E-1' },
      { user: 'member-2', fullName: 'الثاني', employeeCode: 'E-2' },
      { user: 'member-3', fullName: 'الثالث', employeeCode: 'E-3' },
      { user: 'member-4', fullName: 'الرابع', employeeCode: 'E-4' },
    ],
  });

  assert.equal(summary.totalPoints, 100);
  assert.equal(summary.reporterPoints, 35);
  assert.equal(summary.participantsTotalPoints, 65);
  assert.equal(summary.participantPoints, 16.25);
  assert.equal(summary.participantCount, 4);
  assert.equal(summary.pointAwards.length, 5);
});
