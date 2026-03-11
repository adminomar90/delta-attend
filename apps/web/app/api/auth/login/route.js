export async function POST(request) {
  const { email, password } = await request.json();

  // بيانات المستخدمين الافتراضية
  const users = [
    {
      id: '1',
      fullName: 'سامي العزاوي',
      email: 'gm@deltaplus.local',
      role: 'GENERAL_MANAGER',
      pointsTotal: 450,
      level: 5,
      badges: ['performance', 'team_player'],
      password: 'Delta@123',
    },
    {
      id: '2',
      fullName: 'مريم الحمداني',
      email: 'finance@deltaplus.local',
      role: 'FINANCIAL_MANAGER',
      pointsTotal: 380,
      level: 4,
      badges: ['accuracy'],
      password: 'Delta@123',
    },
    {
      id: '3',
      fullName: 'علي الساعدي',
      email: 'pm@deltaplus.local',
      role: 'PROJECT_MANAGER',
      pointsTotal: 520,
      level: 6,
      badges: ['leadership', 'performance'],
      password: 'Delta@123',
    },
    {
      id: '4',
      fullName: 'سارة علاء',
      email: 'assistant.pm@deltaplus.local',
      role: 'ASSISTANT_PROJECT_MANAGER',
      pointsTotal: 290,
      level: 3,
      badges: ['team_player'],
      password: 'Delta@123',
    },
    {
      id: '5',
      fullName: 'حيدر جاسم',
      email: 'lead@deltaplus.local',
      role: 'TEAM_LEAD',
      pointsTotal: 410,
      level: 5,
      badges: ['performance', 'leadership'],
      password: 'Delta@123',
    },
    {
      id: '6',
      fullName: 'محمد قيس',
      email: 'tech1@deltaplus.local',
      role: 'TECHNICAL_STAFF',
      pointsTotal: 320,
      level: 4,
      badges: ['accuracy'],
      password: 'Delta@123',
    },
  ];

  if (!email || !password) {
    return Response.json({ message: 'البريد وكلمة المرور مطلوبة' }, { status: 400 });
  }

  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());

  if (!user) {
    return Response.json({ message: 'بيانات الدخول غير صحيحة' }, { status: 401 });
  }

  if (user.password !== password) {
    return Response.json({ message: 'بيانات الدخول غير صحيحة' }, { status: 401 });
  }

  // إنشاء token بسيط
  const token = Buffer.from(JSON.stringify({ userId: user.id, email: user.email, role: user.role })).toString(
    'base64',
  );

  const { password: _, ...userWithoutPassword } = user;

  return Response.json({
    token,
    user: userWithoutPassword,
  });
}
