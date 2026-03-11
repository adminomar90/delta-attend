export async function GET(request) {
  // بيانات ملخص لوحة التحكم
  const summary = {
    summary: {
      totalTasks: 42,
      pendingApprovals: 9,
      inProgress: 15,
      activeProjects: 8,
    },
    leaderboard: [
      { userId: '3', rank: 1, fullName: 'علي الساعدي', role: 'PROJECT_MANAGER', level: 6, points: 520 },
      { userId: '1', rank: 2, fullName: 'سامي العزاوي', role: 'GENERAL_MANAGER', level: 5, points: 450 },
      { userId: '5', rank: 3, fullName: 'حيدر جاسم', role: 'TEAM_LEAD', level: 5, points: 410 },
      { userId: '2', rank: 4, fullName: 'مريم الحمداني', role: 'FINANCIAL_MANAGER', level: 4, points: 380 },
      { userId: '6', rank: 5, fullName: 'محمد قيس', role: 'TECHNICAL_STAFF', level: 4, points: 320 },
    ],
    taskStatusBreakdown: [
      { _id: 'TODO', count: 9 },
      { _id: 'IN_PROGRESS', count: 15 },
      { _id: 'SUBMITTED', count: 8 },
      { _id: 'APPROVED', count: 8 },
      { _id: 'REJECTED', count: 2 },
    ],
    goals: [
      {
        _id: '1',
        title: 'تطوير النظام الجديد',
        user: { fullName: 'علي الساعدي' },
        currentPoints: 75,
        targetPoints: 100,
        achieved: false,
      },
      {
        _id: '2',
        title: 'إكمال التوثيق',
        user: { fullName: 'محمد قيس' },
        currentPoints: 100,
        targetPoints: 100,
        achieved: true,
      },
      {
        _id: '3',
        title: 'تدريب الفريق',
        user: { fullName: 'حيدر جاسم' },
        currentPoints: 60,
        targetPoints: 80,
        achieved: false,
      },
    ],
  };

  return Response.json(summary);
}
