export const levelThresholds = [
  { level: 1, minPoints: 0 },
  { level: 2, minPoints: 200 },
  { level: 3, minPoints: 500 },
  { level: 4, minPoints: 900 },
  { level: 5, minPoints: 1400 },
  { level: 6, minPoints: 2000 },
  { level: 7, minPoints: 2800 },
  { level: 8, minPoints: 3800 },
  { level: 9, minPoints: 5000 },
  { level: 10, minPoints: 6500 },
];

export const levelService = {
  resolveLevel(totalPoints) {
    let result = 1;
    for (const item of levelThresholds) {
      if (totalPoints >= item.minPoints) {
        result = item.level;
      }
    }
    return result;
  },

  nextLevel(totalPoints) {
    const next = levelThresholds.find((item) => item.minPoints > totalPoints);
    if (!next) {
      return null;
    }

    return {
      level: next.level,
      remainingPoints: next.minPoints - totalPoints,
    };
  },
};
