# Delta Plus Gamification Platform

منصة داخلية عربية (RTL) لشركة Delta Plus لتحويل إدارة العمل إلى نظام Gamification عادل وقابل للتوسع.

## Stack

- Frontend: Next.js (App Router) + React
- Backend: Node.js + Express
- Database: MongoDB + Mongoose
- Architecture: طبقات Clean Architecture مبسطة داخل `apps/api` مع فصل (`domain/application/infrastructure/presentation`)

## Features implemented

- Dashboard احترافية عربية RTL ومتجاوبة للموبايل والكمبيوتر
- نظام مهام كامل: إنشاء، تحديث الحالة، إرسال للاعتماد، اعتماد المهمة
- نظام مهام مع اعتماد متعدد المراحل (Multi-stage approvals)
- نظام نقاط عادل بعد الاعتماد فقط
- مستويات (Levels) وشارات (Badges)
- Leaderboard يومي/أسبوعي/شهري
- مشاريع + أهداف يومية/أسبوعية/شهرية
- إدارة موظفين متقدمة (HR) مع بيانات شخصية ووظيفية وصورة ومدير مباشر
- إدارة HR كاملة: تعديل/تعطيل/إعادة تعيين كلمة المرور + استيراد Excel + رفع ملفات
- تسجيل دخول آمن مع سياسة كلمات مرور + قفل محاولات + OTP اختياري
- عرض الهيكل الإداري الهرمي (Org Chart) داخل لوحة التحكم
- إشعارات داخلية مع تعليم كمقروء
- إشعارات بريد إلكتروني (SMTP أو mock logs)
- Audit Log للعمليات الحساسة
- تقارير تشغيلية + تقارير تنفيذية حسب الأقسام وعبء العمل
- صلاحيات حسب الدور + صلاحيات مخصصة لكل موظف
- نظام حضور وانصراف بالموقع الجغرافي (Geo Attendance) + رسالة واتساب تحقق للإدارة

## Roles

- `GENERAL_MANAGER`
- `FINANCIAL_MANAGER`
- `PROJECT_MANAGER`
- `ASSISTANT_PROJECT_MANAGER`
- `TEAM_LEAD`
- `TECHNICAL_STAFF`

## Fairness policy for points

- النقاط تعتمد على:
  - صعوبة المهمة
  - الاستعجال
  - الساعات التقديرية
  - الالتزام بالموعد
  - تقييم الجودة (1-5)
- لا يتم منح النقاط إلا بعد اعتماد المهمة من دور مخوّل.
- يوجد حد أعلى يومي للنقاط لتفادي التضخم.
- يوجد حد أدنى/أقصى للنقاط لكل مهمة.

## Project structure

```text
apps/
  api/
    src/
      domain/
      application/
      infrastructure/
      presentation/
    scripts/seed.js
  web/
    app/
    components/
    lib/
```

## Quick start

1) انسخ متغيرات البيئة:

```bash
cp apps/api/.env.example apps/api/.env
```

2) ثبّت الحزم:

```bash
npm install
```

3) شغّل الـ API:

```bash
npm run dev:api
```

4) شغّل الواجهة:

```bash
npm run dev:web
```

5) تفريغ قاعدة البيانات (بدون بيانات تجريبية):

```bash
npm run seed
```

6) إنشاء حساب المدير العام لأول مرة (مرة واحدة فقط بعد التفريغ):

```bash
curl -X POST http://localhost:4000/api/auth/admin/setup ^
  -H "Content-Type: application/json" ^
  -H "x-admin-secret: SETUP_SECRET_KEY_CHANGE_ME" ^
  -d "{\"fullName\":\"System Admin\",\"email\":\"admin@deltaplus.local\",\"password\":\"Admin@123\"}"
```

7) تشغيل اختبارات الـ API:

```bash
npm run test:api
```

8) أخذ نسخة احتياطية من قاعدة البيانات:

```bash
npm run backup
```

## API base

- `http://localhost:4000/api`

## Important routes

- `POST /auth/login`
- `POST /auth/verify-otp`
- `GET /auth/permissions`
- `PATCH /auth/users/:id`
- `PATCH /auth/users/:id/status`
- `PATCH /auth/users/:id/reset-password`
- `PATCH /auth/users/:id/permissions`
- `POST /auth/users/import`
- `POST /auth/users/:id/avatar`
- `POST /auth/users/:id/files`
- `GET /dashboard/summary`
- `GET /tasks`
- `POST /tasks`
- `PATCH /tasks/:id/status`
- `PATCH /tasks/:id/approve`
- `PATCH /projects/:id/approve`
- `PATCH /projects/:id/reject`
- `GET /gamification/leaderboard`
- `GET /reports/summary`
- `GET /reports/executive`
- `GET /reports/pdf`
- `GET /reports/excel`
- `GET /audit-logs`
- `GET /attendance/meta`
- `POST /attendance/check-in`
- `POST /attendance/check-out`
- `GET /attendance/history`



