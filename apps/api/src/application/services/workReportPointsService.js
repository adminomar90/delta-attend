const normalizePoints = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.round((parsed + Number.EPSILON) * 10000) / 10000;
};

const toId = (value) => String(value?._id || value?.id || value || '').trim();

const normalizeAwardEntry = (entry = {}) => ({
  userId: toId(entry.user || entry.userId),
  fullName: String(entry.fullName || entry.user?.fullName || '').trim(),
  employeeCode: String(entry.employeeCode || entry.user?.employeeCode || '').trim().toUpperCase(),
  distributionRole: entry.distributionRole === 'REPORT_OWNER' ? 'REPORT_OWNER' : 'PARTICIPANT',
  pointsAwarded: normalizePoints(entry.pointsAwarded),
});

const summarizePointAwards = (pointAwards = []) => {
  const normalizedAwards = pointAwards
    .map((entry) => normalizeAwardEntry(entry))
    .filter((entry) => entry.userId);
  const reporterAward = normalizedAwards.find((entry) => entry.distributionRole === 'REPORT_OWNER') || null;
  const participantAwards = normalizedAwards.filter((entry) => entry.distributionRole === 'PARTICIPANT');
  const participantsTotalPoints = normalizePoints(
    participantAwards.reduce((sum, entry) => sum + Number(entry.pointsAwarded || 0), 0),
  );
  const totalPoints = normalizePoints(
    normalizedAwards.reduce((sum, entry) => sum + Number(entry.pointsAwarded || 0), 0),
  );
  const hasUniformParticipantPoints =
    participantAwards.length > 0
    && participantAwards.every((entry) => entry.pointsAwarded === participantAwards[0].pointsAwarded);

  return {
    pointAwards: normalizedAwards,
    totalPoints,
    reporterPoints: normalizePoints(reporterAward?.pointsAwarded || 0),
    participantsTotalPoints,
    participantPoints: hasUniformParticipantPoints
      ? normalizePoints(participantAwards[0]?.pointsAwarded || 0)
      : 0,
    participantCount: participantAwards.length,
    hasUniformParticipantPoints,
  };
};

export const workReportPointsService = {
  calculateDistribution(totalPoints, participantCount) {
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
  },

  buildApprovalRecipients(report = {}) {
    const recipients = [];
    const ownerId = toId(report.user);
    if (ownerId) {
      recipients.push({
        userId: ownerId,
        fullName: String(report.employeeName || report.user?.fullName || 'صاحب التقرير').trim(),
        employeeCode: String(report.employeeCode || report.user?.employeeCode || '').trim().toUpperCase(),
        distributionRole: 'REPORT_OWNER',
      });
    }

    const seenIds = new Set(recipients.map((entry) => entry.userId));
    for (const participant of report.participants || []) {
      const participantId = toId(participant.user);
      if (!participantId || seenIds.has(participantId)) {
        continue;
      }

      recipients.push({
        userId: participantId,
        fullName: String(participant.fullName || participant.user?.fullName || 'مشارك').trim(),
        employeeCode: String(participant.employeeCode || participant.user?.employeeCode || '').trim().toUpperCase(),
        distributionRole: 'PARTICIPANT',
      });
      seenIds.add(participantId);
    }

    return recipients;
  },

  summarizePointAwards,

  resolveStoredPointAwards(report = {}) {
    if (Array.isArray(report.pointAwards) && report.pointAwards.length) {
      return summarizePointAwards(report.pointAwards);
    }

    const recipients = this.buildApprovalRecipients(report);
    const fallbackDistribution = this.calculateDistribution(
      report.pointsAwarded || 0,
      recipients.filter((entry) => entry.distributionRole === 'PARTICIPANT').length,
    );

    return summarizePointAwards(
      recipients.map((recipient) => ({
        ...recipient,
        pointsAwarded:
          recipient.distributionRole === 'REPORT_OWNER'
            ? normalizePoints(report.reporterPointsAwarded || fallbackDistribution.reporterPoints)
            : normalizePoints(report.participantPointsAwarded || fallbackDistribution.participantPoints),
      })),
    );
  },
};
