# API (Node.js + Express + MongoDB)

## Layers

- `domain`: تعريفات الكيانات والمفاهيم
- `application`: Use Cases وخدمات منطق الأعمال
- `infrastructure`: قواعد البيانات والمخازن والتقارير
- `presentation`: Controllers, Routes, Middlewares

## Run

```bash
npm run dev
```

## Seed

```bash
npm run seed
```

`seed` يقوم الآن بتفريغ قاعدة البيانات فقط (بدون بيانات تجريبية).

## Backup

```bash
npm run backup
```

يعتمد على توفر `mongodump` في الجهاز.

## Tests

```bash
npm run test
```

## First admin setup

بعد التفريغ وإن لم يوجد أي مستخدم، أنشئ المدير العام عبر:

`POST /api/auth/admin/setup`

Header:

- `x-admin-secret: <ADMIN_SETUP_SECRET>`

## Notes

- المصادقة: JWT Bearer Token
- التحقق الثنائي: OTP اختياري لكل مستخدم عند تفعيله
- التفويض: Role-based + custom permissions per user
- الحضور والانصراف: Geofence حسب موقع العمل + رسائل واتساب تحقق للإدارة
- إدارة HR: تعديل/تعطيل/إعادة تعيين كلمة المرور + استيراد Excel + رفع مستندات
- المشاريع: Workflow موافقات متعددة المراحل
- المهام: موافقات متعددة قبل الاعتماد النهائي
- التقارير: Excel (`exceljs`) وPDF (`pdfkit`)
- بريد إلكتروني: عبر SMTP (أو mock log عند عدم ضبط SMTP)
- الحضور: يدعم التسجيل من أي مكان + إرسال واتساب تلقائي عبر Cloud API مع fallback يدوي

### Attendance env vars

- `WORK_SITE_NAME`
- `WORK_SITE_LAT`
- `WORK_SITE_LNG`
- `WORK_SITE_RADIUS_METERS`
- `ATTENDANCE_ALLOW_ANY_LOCATION` (default `true` - allows check-in/check-out from any location)
- `ATTENDANCE_ADMIN_WHATSAPP`
- `ATTENDANCE_WHATSAPP_AUTO_SEND` (default `true`)
- `WHATSAPP_CLOUD_API_TOKEN` (required for automatic sending from server)
- `WHATSAPP_CLOUD_PHONE_NUMBER_ID` (required for automatic sending from server)
- `ATTENDANCE_DEBUG` (set to `true` to print attendance geolocation debug logs and include debug payload in check-in/check-out responses)


