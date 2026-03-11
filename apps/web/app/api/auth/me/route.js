export async function GET(request) {
  const authHeader = request.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return Response.json({ message: 'غير مصرح' }, { status: 401 });
  }

  const token = authHeader.substring(7);

  try {
    // فك التشفير البسيط (Base64)
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));

    // بيانات المستخدمين
    const users = [
      {
        id: '1',
        fullName: 'سامي العزاوي',
        email: 'gm@deltaplus.local',
        role: 'GENERAL_MANAGER',
        pointsTotal: 450,
        level: 5,
        badges: ['performance', 'team_player'],
      },
      {
        id: '2',
        fullName: 'مريم الحمداني',
        email: 'finance@deltaplus.local',
        role: 'FINANCIAL_MANAGER',
        pointsTotal: 380,
        level: 4,
        badges: ['accuracy'],
      },
      {
        id: '3',
        fullName: 'علي الساعدي',
        email: 'pm@deltaplus.local',
        role: 'PROJECT_MANAGER',
        pointsTotal: 520,
        level: 6,
        badges: ['leadership', 'performance'],
      },
      {
        id: '4',
        fullName: 'سارة علاء',
        email: 'assistant.pm@deltaplus.local',
        role: 'ASSISTANT_PROJECT_MANAGER',
        pointsTotal: 290,
        level: 3,
        badges: ['team_player'],
      },
      {
        id: '5',
        fullName: 'حيدر جاسم',
        email: 'lead@deltaplus.local',
        role: 'TEAM_LEAD',
        pointsTotal: 410,
        level: 5,
        badges: ['performance', 'leadership'],
      },
      {
        id: '6',
        fullName: 'محمد قيس',
        email: 'tech1@deltaplus.local',
        role: 'TECHNICAL_STAFF',
        pointsTotal: 320,
        level: 4,
        badges: ['accuracy'],
      },
    ];

    const user = users.find((u) => u.email === decoded.email);

    if (!user) {
      return Response.json({ message: 'المستخدم غير موجود' }, { status: 404 });
    }

    return Response.json(user);
  } catch (error) {
    return Response.json({ message: 'بيانات token غير صالحة' }, { status: 401 });
  }
}
