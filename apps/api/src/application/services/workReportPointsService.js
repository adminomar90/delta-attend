const normalizePoints = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.round((parsed + Number.EPSILON) * 10000) / 10000;
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
};
