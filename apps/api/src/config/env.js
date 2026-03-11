import dotenv from 'dotenv';

dotenv.config();

const required = ['MONGO_URI', 'JWT_SECRET'];

required.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
});

const toNumberOr = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
};

export const env = {
  port: process.env.PORT || 4000,
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  frontendOrigin: (process.env.FRONTEND_ORIGIN || 'http://localhost:3000').split(',').map(s => s.trim()).filter(Boolean),
  adminSetupSecret: process.env.ADMIN_SETUP_SECRET || 'SETUP_SECRET_KEY_CHANGE_ME',
  maxAuthFailures: Number(process.env.MAX_AUTH_FAILURES || 5),
  lockMinutes: Number(process.env.AUTH_LOCK_MINUTES || 15),
  otpMinutes: Number(process.env.OTP_EXPIRY_MINUTES || 10),
  uploadsDir: process.env.UPLOADS_DIR || 'uploads',
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpSecure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  smtpFrom: process.env.SMTP_FROM || '',
  workSiteName: process.env.WORK_SITE_NAME || 'موقع العمل الرئيسي',
  workSiteLatitude: toNumberOr(process.env.WORK_SITE_LAT, 33.3152),
  workSiteLongitude: toNumberOr(process.env.WORK_SITE_LNG, 44.3661),
  workSiteRadiusMeters: toNumberOr(process.env.WORK_SITE_RADIUS_METERS, 250),
  attendanceAllowAnyLocation: toBoolean(process.env.ATTENDANCE_ALLOW_ANY_LOCATION, true),
  attendanceAdminWhatsapp: process.env.ATTENDANCE_ADMIN_WHATSAPP || '',
  attendanceWhatsappAutoSend: toBoolean(process.env.ATTENDANCE_WHATSAPP_AUTO_SEND, true),
  whatsappCloudApiToken: process.env.WHATSAPP_CLOUD_API_TOKEN || '',
  whatsappCloudPhoneNumberId: process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID || '',
  attendanceDebug: toBoolean(process.env.ATTENDANCE_DEBUG, false),
};

