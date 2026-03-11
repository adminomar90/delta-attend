export async function GET(request) {
  // بيانات الألعاب والنقاط
  const gamificationData = {
    user: {
      level: 5,
      pointsTotal: 520,
      badges: ['performance', 'leadership', 'team_player'],
    },
    pointsThisMonth: 280,
    rank: 1,
    nextLevel: {
      remainingPoints: 100,
    },
    badgesEarned: 3,
  };

  return Response.json(gamificationData);
}
