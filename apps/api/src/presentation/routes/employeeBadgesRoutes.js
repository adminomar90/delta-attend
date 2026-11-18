import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import QRCode from 'qrcode';
import sharp from 'sharp';
import { badgeTemplateForDepartment, badgeTemplates } from '../../../../../shared/employeeBadgeTemplates.mjs';
import { env } from '../../config/env.js';
import { badgeToday, isBadgeDate, readBadgeToken } from '../../application/services/employeeBadgeTokens.js';
import { EmployeeBadgeModel } from '../../infrastructure/db/models/EmployeeBadgeModel.js';
import { UserRepository } from '../../infrastructure/db/repositories/UserRepository.js';
import { Permission } from '../../shared/constants.js';
import { AppError, asyncHandler } from '../../shared/errors.js';
import { requireCurrentAuth } from '../middlewares/authMiddleware.js';
import { requirePermission } from '../middlewares/authorizationMiddleware.js';

const router = Router();
const users = new UserRepository();
const pageSize = 25;
const maxPhotoDimension = 1600;
const jpegPrefix = 'data:image/jpeg;base64,';

function employeeDetails({ fullName, employeeCode, jobTitle }) {
  return { fullName, employeeCode: employeeCode || '', jobTitle: jobTitle || 'موظف' };
}

function badgeStatus(badge, employeeActive, today = badgeToday()) {
  if (!badge.active) return 'stopped';
  if (!employeeActive) return 'employeeInactive';
  if (today < badge.issuedOn) return 'pending';
  if (today > badge.expiresOn) return 'expired';
  return 'active';
}

function ensureId(value, message = 'رقم الهوية غير صالح.') {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) throw new AppError(message, 400);
  return value.toLowerCase();
}

function ensureRevision(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new AppError('إصدار سجل الهوية غير صالح.', 400);
}

function ensureCurrent(record, revision) {
  if (record.revision !== revision) throw new AppError('تغيّرت الهوية. أعد فتحها لتحميل آخر نسخة.', 409);
}

async function getBadge(id, fields = '') {
  const record = await EmployeeBadgeModel.findById(ensureId(id)).select(fields).lean();
  if (!record) throw new AppError('الهوية غير موجودة.', 404);
  return record;
}

async function activeEmployee(id) {
  const employee = await users.findBadgeEmployee(id);
  if (!employee) throw new AppError('الموظف غير موجود أو غير مفعّل.', 404);
  if (!employee.employeeCode) throw new AppError('أضف رقم الموظف من شاشة الموظفين قبل إصدار هويته.', 409);
  return employee;
}

function employeeSnapshot(employee) {
  return { ...employeeDetails(employee), department: employee.department || '' };
}

function badgeQr(req, token) {
  let site;
  try {
    site = new URL(req.get('origin') || req.get('referer') || env.frontendOrigin[0]);
  } catch {
    throw new AppError('عنوان تطبيق دلتا غير صالح لإنشاء رمز التحقق.', 400);
  }
  if (!['http:', 'https:'].includes(site.protocol)) {
    throw new AppError('عنوان تطبيق دلتا غير صالح لإنشاء رمز التحقق.', 400);
  }
  const url = new URL(`/verify-employee/${token}`, site.origin).href;
  const { modules } = QRCode.create(url, { errorCorrectionLevel: 'M' });
  return { size: modules.size, data: Array.from(modules.data).join('') };
}

function badgeSummary(record, status) {
  return {
    id: String(record._id), employee: record.employee, template: record.template,
    issuedOn: record.issuedOn, expiresOn: record.expiresOn,
    active: record.active, status, revision: record.revision,
  };
}

function badgeDetail(record, qr) {
  return {
    ...badgeSummary(record),
    employeeId: String(record.employeeId),
    nameEn: record.nameEn, jobEn: record.jobEn, crop: record.crop, photo: record.photo,
    qr,
  };
}

async function validatePhoto(photo) {
  const invalid = () => new AppError('تعذّر حفظ الصورة. اختر صورة شخصية صالحة.', 400);
  if (typeof photo !== 'string' || photo.length > 2_000_000 || !photo.startsWith(jpegPrefix)) throw invalid();
  const contents = photo.slice(jpegPrefix.length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(contents) || contents.length % 4 !== 0) throw invalid();
  try {
    const { format, width, height } = await sharp(Buffer.from(contents, 'base64'), {
      limitInputPixels: maxPhotoDimension ** 2,
    }).metadata();
    if (format !== 'jpeg' || !width || !height || width > maxPhotoDimension || height > maxPhotoDimension) throw invalid();
  } catch {
    throw invalid();
  }
}

async function publicPortrait({ photo, crop }) {
  if (!photo?.startsWith(jpegPrefix) || !crop) return undefined;
  try {
    // Publish the framed portrait rather than the full source upload.
    const output = { width: 548, height: 528 };
    const image = sharp(Buffer.from(photo.slice(jpegPrefix.length), 'base64'), {
      limitInputPixels: maxPhotoDimension ** 2,
    });
    const { width, height } = await image.metadata();
    const scale = Math.max(output.width / width, output.height / height) * crop.zoom;
    const frameWidth = Math.min(width, Math.max(1, Math.round(output.width / scale)));
    const frameHeight = Math.min(height, Math.max(1, Math.round(output.height / scale)));
    const cropped = await image.extract({
      left: Math.round((width - frameWidth) * (1 - crop.x / 100) / 2),
      top: Math.round((height - frameHeight) * (1 - crop.y / 100) / 2),
      width: frameWidth, height: frameHeight,
    }).resize(output.width, output.height, { fit: 'fill' }).jpeg({ quality: 86 }).toBuffer();
    return jpegPrefix + cropped.toString('base64');
  } catch {
    return undefined;
  }
}

async function badgeFields(body, employee, requirePhoto = false) {
  const { issuedOn, expiresOn, templateChoice, photo, crop } = body;
  if (!isBadgeDate(issuedOn) || !isBadgeDate(expiresOn) || expiresOn < issuedOn) {
    throw new AppError('أدخل تاريخَي الإصدار والانتهاء بالترتيب الصحيح.', 400);
  }
  const nameEn = typeof body.nameEn === 'string' ? body.nameEn.trim() : '';
  const jobEn = typeof body.jobEn === 'string' ? body.jobEn.trim() : '';
  if (!nameEn || nameEn.length > 240 || !jobEn || jobEn.length > 160) {
    throw new AppError('أدخل الاسم والمسمى الوظيفي بالإنجليزية.', 400);
  }
  const template = templateChoice === 'auto'
    ? badgeTemplateForDepartment(employee.department)
    : typeof templateChoice === 'string' && Object.hasOwn(badgeTemplates, templateChoice) && badgeTemplates[templateChoice];
  if (!template) throw new AppError('اختر قالباً صالحاً للهوية.', 400);
  const within = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
  if (!crop || !within(crop.zoom, 1, 3) || !within(crop.x, -100, 100) || !within(crop.y, -100, 100)) {
    throw new AppError('إعدادات قص الصورة غير صالحة.', 400);
  }
  if (requirePhoto || photo !== undefined) await validatePhoto(photo);
  return {
    employee, issuedOn, expiresOn, nameEn, jobEn,
    template: { choice: templateChoice, ...template },
    crop: { zoom: crop.zoom, x: crop.x, y: crop.y },
    ...(photo !== undefined ? { photo } : {}),
  };
}

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.post('/verify', asyncHandler(async (req, res) => {
  const token = req.body?.token;
  const saved = typeof token === 'string' && /^[A-Za-z0-9_-]{32}$/.test(token)
    ? await EmployeeBadgeModel.findOne({ verificationToken: token })
      .select('active employee employeeId issuedOn expiresOn nameEn jobEn template.title crop photo').lean()
    : null;
  // Preserve verification for cards issued before the registry existed.
  const badge = saved || readBadgeToken(token, env.jwtSecret);
  if (!badge) return res.json({ status: 'invalid' });
  if (saved && !saved.active) return res.json({ status: 'inactive' });

  const employee = await users.findBadgeEmployee(badge.employeeId);
  const status = badgeStatus({ ...badge, active: true }, Boolean(employee?.employeeCode));
  if (status === 'employeeInactive') return res.json({ status: 'inactive' });
  if (status === 'pending') return res.json({ status });

  res.json({
    status, employee: employeeDetails(saved ? saved.employee : employee),
    issuedOn: badge.issuedOn, expiresOn: badge.expiresOn,
    ...(saved ? {
      title: saved.template.title, nameEn: saved.nameEn, jobEn: saved.jobEn, photo: await publicPortrait(saved),
    } : {}),
  });
}));

router.use(requireCurrentAuth, requirePermission(Permission.USE_EMPLOYEE_BADGES));

router.get('/employees', asyncHandler(async (req, res) => {
  const employees = await users.listBadgeEmployees();
  res.json({ employees: employees.map((employee) => ({ ...employeeSnapshot(employee), id: String(employee._id) })) });
}));

router.get('/', asyncHandler(async (req, res) => {
  const page = Math.max(1, Math.min(100_000, parseInt(req.query.page, 10) || 1));
  const records = await EmployeeBadgeModel.find()
    .select('employee employeeId template issuedOn expiresOn active revision createdAt')
    .sort({ createdAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize + 1)
    .populate('employeeId', 'active deletedAt employeeCode').lean();
  const today = badgeToday();
  const badges = records.slice(0, pageSize).map((record) => badgeSummary(record, badgeStatus(
    record, Boolean(record.employeeId?.active && !record.employeeId.deletedAt && record.employeeId.employeeCode), today,
  )));
  res.json({ badges, hasMore: records.length > pageSize });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const record = await getBadge(req.params.id, '+photo +verificationToken');
  res.json({ badge: badgeDetail(record, badgeQr(req, record.verificationToken)) });
}));

router.post('/', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const id = ensureId(body.id);
  const employeeId = ensureId(body.employeeId, 'اختر موظفًا مسجّلًا في النظام.');
  const employee = employeeSnapshot(await activeEmployee(employeeId));
  const fields = await badgeFields(body, employee, true);
  const verificationToken = randomBytes(24).toString('base64url');
  // Validate that this deployment can render the QR before persisting a new issuance.
  const qr = badgeQr(req, verificationToken);
  try {
    const created = await EmployeeBadgeModel.create({
      _id: id, employeeId, createdBy: req.user.id, verificationToken, ...fields,
    });
    res.status(201).json({ badge: badgeDetail(created.toObject(), qr) });
  } catch (error) {
    if (error.code !== 11000 || !error.keyPattern?._id) throw error;
    const existing = await getBadge(id, '+photo +verificationToken');
    if (String(existing.createdBy) !== req.user.id || String(existing.employeeId) !== employeeId) {
      throw new AppError('تعذّر استخدام رقم الهوية المحدد.', 409);
    }
    res.json({ badge: badgeDetail(existing, badgeQr(req, existing.verificationToken)) });
  }
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const body = req.body || {};
  ensureRevision(body.revision);
  const record = await getBadge(req.params.id, '+verificationToken');
  ensureCurrent(record, body.revision);
  const currentEmployee = await users.findBadgeEmployee(record.employeeId, { includeInactive: true });
  const employee = currentEmployee?.employeeCode ? employeeSnapshot(currentEmployee) : record.employee;
  const fields = await badgeFields(body, employee);
  const qr = badgeQr(req, record.verificationToken);
  const updated = await EmployeeBadgeModel.findOneAndUpdate(
    { _id: record._id, revision: body.revision },
    { $set: fields, $inc: { revision: 1 } },
    { new: true, runValidators: true },
  ).select('+photo').lean();
  if (!updated) throw new AppError('تغيّرت الهوية. أعد فتحها لتحميل آخر نسخة.', 409);
  res.json({ badge: badgeDetail(updated, qr) });
}));

router.patch('/:id/status', asyncHandler(async (req, res) => {
  const { active, revision } = req.body || {};
  ensureRevision(revision);
  if (typeof active !== 'boolean') throw new AppError('حالة الهوية غير صالحة.', 400);
  const record = await getBadge(req.params.id);
  ensureCurrent(record, revision);
  const updated = await EmployeeBadgeModel.findOneAndUpdate(
    { _id: record._id, revision }, { $set: { active }, $inc: { revision: 1 } }, { new: true },
  ).lean();
  if (!updated) throw new AppError('تغيّرت الهوية. أعد فتحها لتحميل آخر نسخة.', 409);
  res.json({ id: String(updated._id), active: updated.active });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const { revision } = req.body || {};
  ensureRevision(revision);
  const record = await getBadge(req.params.id);
  ensureCurrent(record, revision);
  const deleted = await EmployeeBadgeModel.deleteOne({ _id: record._id, revision });
  if (!deleted.deletedCount) throw new AppError('تغيّرت الهوية. أعد فتحها لتحميل آخر نسخة.', 409);
  res.json({ id: String(record._id) });
}));

router.post('/:id/prepare', asyncHandler(async (req, res) => {
  const { revision } = req.body || {};
  ensureRevision(revision);
  const record = await getBadge(req.params.id, '+verificationToken');
  ensureCurrent(record, revision);
  if (!record.active) throw new AppError('أعد تفعيل الهوية قبل الطباعة أو التصدير.', 409);
  await activeEmployee(record.employeeId);
  res.json({ employee: record.employee, qr: badgeQr(req, record.verificationToken) });
}));

export default router;
