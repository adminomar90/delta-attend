const normalizePoints = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.round((parsed + Number.EPSILON) * 10000) / 10000;
};

const toId = (value) => String(value?._id || value?.id || value || '').trim();

export const calculateWorkReportDistribution = (totalPoints, participantCount) => {
  const safeTotal = normalizePoints(totalPoints);
  const safeParticipantCount = Math.max(0, Number(participantCount || 0));

  if (!safeParticipantCount) {
    return {
      totalPoints: safeTotal,
      reporterPoints: safeTotal,
      participantsTotalPoints: 0,
      participantPoints: 0,
      participantCount: 0,
    };
  }

  const reporterPoints = normalizePoints(safeTotal * 0.35);
  const participantsTotalPoints = normalizePoints(safeTotal - reporterPoints);
  const participantPoints = normalizePoints(participantsTotalPoints / safeParticipantCount);

  return {
    totalPoints: safeTotal,
    reporterPoints,
    participantsTotalPoints,
    participantPoints,
    participantCount: safeParticipantCount,
  };
};

export const buildWorkReportAwardees = (report = {}) => {
  const awardees = [];
  const ownerId = toId(report.user);
  if (ownerId) {
    awardees.push({
      userId: ownerId,
      fullName: String(report.employeeName || report.user?.fullName || 'صاحب التقرير').trim(),
      employeeCode: String(report.employeeCode || report.user?.employeeCode || '').trim().toUpperCase(),
      distributionRole: 'REPORT_OWNER',
    });
  }

  const seenIds = new Set(awardees.map((entry) => entry.userId));
  for (const participant of report.participants || []) {
    const participantId = toId(participant.user);
    if (!participantId || seenIds.has(participantId)) {
      continue;
    }

    awardees.push({
      userId: participantId,
      fullName: String(participant.fullName || participant.user?.fullName || 'مشارك').trim(),
      employeeCode: String(participant.employeeCode || participant.user?.employeeCode || '').trim().toUpperCase(),
      distributionRole: 'PARTICIPANT',
    });
    seenIds.add(participantId);
  }

  return awardees;
};

export const resolveWorkReportPointAwards = (report = {}) => {
  if (Array.isArray(report.pointAwards) && report.pointAwards.length) {
    return report.pointAwards
      .map((entry) => ({
        userId: toId(entry.user),
        fullName: String(entry.fullName || entry.user?.fullName || '').trim(),
        employeeCode: String(entry.employeeCode || entry.user?.employeeCode || '').trim().toUpperCase(),
        distributionRole: entry.distributionRole === 'REPORT_OWNER' ? 'REPORT_OWNER' : 'PARTICIPANT',
        pointsAwarded: normalizePoints(entry.pointsAwarded),
      }))
      .filter((entry) => entry.userId);
  }

  const awardees = buildWorkReportAwardees(report);
  const participantCount = awardees.filter((entry) => entry.distributionRole === 'PARTICIPANT').length;
  const distribution = calculateWorkReportDistribution(report.pointsAwarded || 0, participantCount);

  return awardees.map((entry) => ({
    ...entry,
    pointsAwarded:
      entry.distributionRole === 'REPORT_OWNER'
        ? normalizePoints(report.reporterPointsAwarded || distribution.reporterPoints)
        : normalizePoints(report.participantPointsAwarded || distribution.participantPoints),
  }));
};

export const summarizeWorkReportPointAwards = (report = {}) => {
  const pointAwards = resolveWorkReportPointAwards(report);
  const ownerEntry = pointAwards.find((entry) => entry.distributionRole === 'REPORT_OWNER') || null;
  const participantEntries = pointAwards.filter((entry) => entry.distributionRole === 'PARTICIPANT');
  const totalPoints = normalizePoints(
    pointAwards.reduce((sum, entry) => sum + Number(entry.pointsAwarded || 0), 0),
  );
  const participantsTotalPoints = normalizePoints(
    participantEntries.reduce((sum, entry) => sum + Number(entry.pointsAwarded || 0), 0),
  );
  const uniformParticipantPoints =
    participantEntries.length > 0
    && participantEntries.every((entry) => entry.pointsAwarded === participantEntries[0].pointsAwarded)
      ? participantEntries[0].pointsAwarded
      : null;

  return {
    pointAwards,
    ownerEntry,
    participantEntries,
    totalPoints,
    ownerPoints: normalizePoints(ownerEntry?.pointsAwarded || 0),
    participantsTotalPoints,
    participantCount: participantEntries.length,
    uniformParticipantPoints,
  };
};

export const buildWorkReportApprovalPointsMap = (report = {}) =>
  Object.fromEntries(
    resolveWorkReportPointAwards(report)
      .map((entry) => [entry.userId, String(normalizePoints(entry.pointsAwarded))]),
  );

export const buildWorkReportApprovalPayload = (pointsByUser = {}) =>
  Object.fromEntries(
    Object.entries(pointsByUser || {}).map(([userId, value]) => [userId, Math.max(0, Math.round(Number(value) || 0))]),
  );

export const formatWorkReportPoints = (value) => {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) {
    return '0';
  }

  return Number.isInteger(parsed)
    ? String(parsed)
    : parsed.toFixed(2).replace(/\.?0+$/, '');
};
