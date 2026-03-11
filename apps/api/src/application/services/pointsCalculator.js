import dayjs from 'dayjs';

const MIN_POINTS = 10;
const MAX_POINTS = 220;
const DAILY_CAP = 320;

export const pointsPolicy = {
  minPointsPerTask: MIN_POINTS,
  maxPointsPerTask: MAX_POINTS,
  dailyCap: DAILY_CAP,
};

export const pointsCalculator = {
  calculateTaskPoints(task, qualityScore = 3) {
    const plannedPoints = Number(task?.plannedPoints || 0);
    if (plannedPoints > 0) {
      return Math.round(plannedPoints);
    }

    const base = task.difficulty * 20 + task.urgency * 12 + Math.min(task.estimatedHours, 10) * 4;

    const onTime = dayjs(task.completedAt || new Date()).isBefore(dayjs(task.dueDate).add(1, 'day'));
    const timelinessMultiplier = onTime ? 1.2 : 0.8;

    const normalizedQuality = Math.max(1, Math.min(5, qualityScore));
    const qualityMultiplier = 0.7 + normalizedQuality * 0.1;

    const rawPoints = Math.round(base * timelinessMultiplier * qualityMultiplier);

    return Math.max(MIN_POINTS, Math.min(MAX_POINTS, rawPoints));
  },

  applyDailyCap(candidatePoints, currentDayPoints) {
    const remaining = Math.max(0, DAILY_CAP - currentDayPoints);
    return Math.min(candidatePoints, remaining);
  },
};
