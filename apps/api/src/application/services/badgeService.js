import { BadgeCodes } from '../../shared/constants.js';

export const badgeService = {
  evaluate(user, leaderboardRank) {
    const granted = [];

    if (user.pointsTotal >= 500) {
      granted.push(BadgeCodes.POINTS_500);
    }

    if (user.pointsTotal >= 1000) {
      granted.push(BadgeCodes.POINTS_1000);
    }

    if (leaderboardRank > 0 && leaderboardRank <= 3) {
      granted.push(BadgeCodes.MONTHLY_TOP_3);
    }

    return granted;
  },
};
