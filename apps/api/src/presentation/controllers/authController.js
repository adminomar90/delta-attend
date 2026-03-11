import bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';
import { UserRepository } from '../../infrastructure/db/repositories/UserRepository.js';
import { EmployeeFileRepository } from '../../infrastructure/db/repositories/EmployeeFileRepository.js';
import { authTokenService } from '../../application/services/authTokenService.js';
import { emailService } from '../../application/services/emailService.js';
import { Permission, Roles } from '../../shared/constants.js';
import { resolveManagedUserIds } from '../../shared/accessScope.js';
import { AppError, asyncHandler } from '../../shared/errors.js';
import { env } from '../../config/env.js';
import { generateOtpCode, hashOtp, validatePasswordStrength } from '../../shared/security.js';

const userRepository = new UserRepository();
const employeeFileRepository = new EmployeeFileRepository();

const toCleanString = (value) => {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim();
};

const toOptionalDate = (value) => {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const normalizeAddress = (body) => {
  const address = body.address || {};
  return {
    country: toCleanString(body.country ?? address.country),
    city: toCleanString(body.city ?? address.city),
    street: toCleanString(body.street ?? address.street),
    postalCode: toCleanString(body.postalCode ?? address.postalCode),
  };
};

const normalizeEmergencyContact = (body) => {
  const emergencyContact = body.emergencyContact || {};
  return {
    name: toCleanString(body.emergencyContactName ?? emergencyContact.name),
    phone: toCleanString(body.emergencyContactPhone ?? emergencyContact.phone),
    relation: toCleanString(body.emergencyContactRelation ?? emergencyContact.relation),
  };
};

const validateRole = (role) => {
  if (!Object.values(Roles).includes(role)) {
    throw new AppError('Invalid role value', 400);
  }
};

const validatePermissions = (permissions = []) => {
  if (!Array.isArray(permissions)) {
    throw new AppError('Permissions must be an array', 400);
  }

  const invalid = permissions.filter((item) => !Object.values(Permission).includes(item));
  if (invalid.length) {
    throw new AppError(`Invalid permissions: ${invalid.join(', ')}`, 400);
  }
};

const enforcePasswordPolicy = (password) => {
  const result = validatePasswordStrength(password);
  if (!result.valid) {
    throw new AppError(`Password policy mismatch: ${result.failures.join(', ')}`, 400);
  }
};

const serializeUser = (user) => ({
  id: String(user._id || user.id),
  fullName: user.fullName,
  email: user.email,
  role: user.role,
  customPermissions: user.customPermissions || [],
  employeeCode: user.employeeCode,
  personalEmail: user.personalEmail,
  avatarUrl: user.avatarUrl,
  phone: user.phone,
  dateOfBirth: user.dateOfBirth,
  gender: user.gender,
  maritalStatus: user.maritalStatus,
  nationalId: user.nationalId,
  address: user.address,
  emergencyContact: user.emergencyContact,
  hireDate: user.hireDate,
  employmentType: user.employmentType,
  department: user.department,
  jobTitle: user.jobTitle,
  manager: user.manager
    ? {
        id: String(user.manager._id || user.manager.id || user.manager),
        fullName: user.manager.fullName,
        role: user.manager.role,
        jobTitle: user.manager.jobTitle,
      }
    : null,
  pointsTotal: user.pointsTotal,
  level: user.level,
  badges: user.badges,
  team: user.team,
  workMinutesTotal: Number(user.workMinutesTotal || 0),
  workHoursTotal: Number((Number(user.workMinutesTotal || 0) / 60).toFixed(2)),
  workSessionsCount: Number(user.workSessionsCount || 0),
  lastAttendanceAt: user.lastAttendanceAt || null,
  lastCheckInAt: user.lastCheckInAt || null,
  lastCheckOutAt: user.lastCheckOutAt || null,
  active: user.active,
  twoFactorEnabled: !!user.twoFactorEnabled,
  forcePasswordChange: !!user.forcePasswordChange,
  lastLoginAt: user.lastLoginAt,
});

const issueAccessToken = (user) =>
  authTokenService.sign({
    sub: String(user._id || user.id),
    role: user.role,
    name: user.fullName,
    email: user.email,
    workMinutesTotal: Number(user.workMinutesTotal || 0),
    customPermissions: user.customPermissions || [],
    sv: user.sessionVersion || 1,
  });

const issueOtpToken = (user) =>
  authTokenService.sign({
    sub: String(user._id),
    type: 'otp',
    purpose: 'login_2fa',
  });

const lockAccountIfNeeded = async (user) => {
  const failures = (user.authFailureCount || 0) + 1;
  await userRepository.incrementAuthFailures(user._id);

  if (failures >= env.maxAuthFailures) {
    const until = new Date(Date.now() + env.lockMinutes * 60 * 1000);
    await userRepository.lockUser(user._id, until);
    throw new AppError(`Account locked for ${env.lockMinutes} minutes`, 423);
  }

  throw new AppError('Invalid credentials', 401);
};

const prepareUserPayload = async (body, { forUpdate = false, currentUserId = '' } = {}) => {
  const payload = {};
  const setField = (field, value) => {
    if (!forUpdate || body[field] !== undefined) {
      payload[field] = value;
    }
  };

  if (!forUpdate || body.fullName !== undefined) {
    const fullName = toCleanString(body.fullName);
    if (!forUpdate && !fullName) {
      throw new AppError('Full name is required', 400);
    }
    if (fullName) payload.fullName = fullName;
  }

  if (!forUpdate || body.email !== undefined) {
    const email = toCleanString(body.email).toLowerCase();
    if (!forUpdate && !email) {
      throw new AppError('Email is required', 400);
    }
    if (email) payload.email = email;
  }

  if (!forUpdate || body.role !== undefined) {
    if (!body.role && !forUpdate) {
      throw new AppError('Role is required', 400);
    }
    if (body.role) {
      validateRole(body.role);
      payload.role = body.role;
    }
  }

  if (body.employeeCode !== undefined) {
    payload.employeeCode = toCleanString(body.employeeCode).toUpperCase() || undefined;
  }

  setField('personalEmail', toCleanString(body.personalEmail));
  setField('avatarUrl', toCleanString(body.avatarUrl));
  setField('phone', toCleanString(body.phone));
  setField('dateOfBirth', toOptionalDate(body.dateOfBirth));
  setField('gender', toCleanString(body.gender) || undefined);
  setField('maritalStatus', toCleanString(body.maritalStatus) || undefined);
  setField('nationalId', toCleanString(body.nationalId));
  setField('address', normalizeAddress(body));
  setField('emergencyContact', normalizeEmergencyContact(body));
  setField('hireDate', toOptionalDate(body.hireDate));
  setField('employmentType', toCleanString(body.employmentType) || undefined);
  setField('department', toCleanString(body.department) || 'General');
  setField('jobTitle', toCleanString(body.jobTitle));
  setField('team', toCleanString(body.team) || 'Delta Plus');

  if (body.customPermissions !== undefined) {
    validatePermissions(body.customPermissions);
    payload.customPermissions = body.customPermissions;
  }

  if (body.twoFactorEnabled !== undefined) {
    payload.twoFactorEnabled = !!body.twoFactorEnabled;
  }

  if (body.forcePasswordChange !== undefined) {
    payload.forcePasswordChange = !!body.forcePasswordChange;
  }

  const managerId = toCleanString(body.managerId);
  if (managerId) {
    if (managerId === currentUserId) {
      throw new AppError('User cannot be manager of themselves', 400);
    }

    const manager = await userRepository.findById(managerId);
    if (!manager || !manager.active) {
      throw new AppError('Manager not found', 404);
    }
    payload.manager = manager._id;
  } else if (body.managerId !== undefined) {
    payload.manager = null;
  }

  return payload;
};

const parseExcelImport = async (buffer) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new AppError('Import file has no sheets', 400);
  }

  const headerRow = sheet.getRow(1);
  const headers = {};
  headerRow.eachCell((cell, colNumber) => {
    const name = toCleanString(cell.value).toLowerCase();
    headers[name] = colNumber;
  });

  const requiredHeaders = ['fullname', 'email', 'role', 'password'];
  const missing = requiredHeaders.filter((item) => !headers[item]);
  if (missing.length) {
    throw new AppError(`Import is missing headers: ${missing.join(', ')}`, 400);
  }

  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const fullName = toCleanString(row.getCell(headers.fullname).value);
    const email = toCleanString(row.getCell(headers.email).value).toLowerCase();
    const role = toCleanString(row.getCell(headers.role).value);
    const password = toCleanString(row.getCell(headers.password).value);

    if (!fullName && !email && !role && !password) {
      return;
    }

    rows.push({
      rowNumber,
      fullName,
      email,
      role,
      password,
      employeeCode: headers.employeecode ? toCleanString(row.getCell(headers.employeecode).value) : '',
      department: headers.department ? toCleanString(row.getCell(headers.department).value) : '',
      jobTitle: headers.jobtitle ? toCleanString(row.getCell(headers.jobtitle).value) : '',
      phone: headers.phone ? toCleanString(row.getCell(headers.phone).value) : '',
      managerEmail: headers.manageremail ? toCleanString(row.getCell(headers.manageremail).value).toLowerCase() : '',
      team: headers.team ? toCleanString(row.getCell(headers.team).value) : '',
    });
  });

  return rows;
};

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new AppError('Email and password are required', 400);
  }

  const normalizedEmail = toCleanString(email).toLowerCase();
  const user = await userRepository.findByEmail(normalizedEmail);

  if (!user || !user.active) {
    throw new AppError('Invalid credentials', 401);
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError(`Account is locked until ${user.lockedUntil.toISOString()}`, 423);
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    await lockAccountIfNeeded(user);
  }

  await userRepository.clearAuthFailures(user._id);

  if (user.twoFactorEnabled) {
    const code = generateOtpCode();
    const codeHash = hashOtp(code);
    const expires = new Date(Date.now() + env.otpMinutes * 60 * 1000);

    await userRepository.setOtp(user._id, codeHash, expires);
    await emailService.sendOtpCode({ to: user.email, code });

    return res.json({
      requiresOtp: true,
      otpToken: issueOtpToken(user),
      message: 'Verification code sent to your email',
    });
  }

  const token = issueAccessToken(user);

  res.json({
    token,
    user: serializeUser(user),
  });
});

export const verifyOtp = asyncHandler(async (req, res) => {
  const { otpToken, code } = req.body;

  if (!otpToken || !code) {
    throw new AppError('otpToken and code are required', 400);
  }

  const payload = authTokenService.verify(otpToken);
  if (payload.type !== 'otp') {
    throw new AppError('Invalid OTP token', 401);
  }

  const user = await userRepository.findById(payload.sub);
  if (!user || !user.active) {
    throw new AppError('Invalid OTP session', 401);
  }

  if (!user.otpCodeHash || !user.otpExpiresAt || user.otpExpiresAt < new Date()) {
    throw new AppError('OTP expired', 401);
  }

  if (hashOtp(code) !== user.otpCodeHash) {
    throw new AppError('Invalid OTP code', 401);
  }

  await userRepository.clearOtp(user._id);
  const token = issueAccessToken(user);

  res.json({
    token,
    user: serializeUser(user),
  });
});

export const me = asyncHandler(async (req, res) => {
  const user = await userRepository.findById(req.user.id);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  if (user.manager) {
    await user.populate('manager', 'fullName role jobTitle');
  }

  res.json({
    user: serializeUser(user),
  });
});

export const listUsers = asyncHandler(async (req, res) => {
  // ?allUsers=1 returns every active employee regardless of managed scope
  if (req.query.allUsers === '1') {
    const users = await userRepository.listActive({ includeManager: true });
    return res.json({ users });
  }

  const managedUserIds = await resolveManagedUserIds({
    userRepository,
    actorId: req.user.id,
    actorRole: req.user.role,
  });

  const users = await userRepository.listActive({
    includeManager: true,
    userIds: managedUserIds,
  });
  res.json({ users });
});

export const createUser = asyncHandler(async (req, res) => {
  const { password } = req.body;
  if (!password) {
    throw new AppError('Password is required', 400);
  }

  enforcePasswordPolicy(password);

  const payload = await prepareUserPayload(req.body, { currentUserId: '' });

  const existingUser = await userRepository.findByEmail(payload.email);
  if (existingUser) {
    throw new AppError('Email already in use', 409);
  }

  if (payload.employeeCode) {
    const existingCode = await userRepository.findByEmployeeCode(payload.employeeCode);
    if (existingCode) {
      throw new AppError('Employee code already in use', 409);
    }
  }

  const passwordHash = await bcrypt.hash(String(password), 10);

  const user = await userRepository.create({
    ...payload,
    passwordHash,
    forcePasswordChange: !!req.body.forcePasswordChange,
  });

  if (user.manager) {
    await user.populate('manager', 'fullName role jobTitle');
  }

  res.status(201).json({
    user: serializeUser(user),
  });
});

export const updateUser = asyncHandler(async (req, res) => {
  const user = await userRepository.findById(req.params.id);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  const payload = await prepareUserPayload(req.body, {
    forUpdate: true,
    currentUserId: String(user._id),
  });

  if (payload.email && payload.email !== user.email) {
    const existingUser = await userRepository.findByEmail(payload.email);
    if (existingUser && String(existingUser._id) !== String(user._id)) {
      throw new AppError('Email already in use', 409);
    }
  }

  if (payload.employeeCode && payload.employeeCode !== user.employeeCode) {
    const existingCode = await userRepository.findByEmployeeCode(payload.employeeCode);
    if (existingCode && String(existingCode._id) !== String(user._id)) {
      throw new AppError('Employee code already in use', 409);
    }
  }

  const updated = await userRepository.updateById(req.params.id, payload);

  res.json({ user: updated });
});

export const updateUserStatus = asyncHandler(async (req, res) => {
  const { active } = req.body;
  const target = await userRepository.findById(req.params.id);

  if (!target) {
    throw new AppError('User not found', 404);
  }

  if (String(target._id) === req.user.id && active === false) {
    throw new AppError('You cannot deactivate your own account', 400);
  }

  const updated = await userRepository.setActiveStatus(req.params.id, !!active, {
    revokeSessions: !active,
  });

  res.json({ user: updated });
});

export const resetUserPassword = asyncHandler(async (req, res) => {
  const target = await userRepository.findById(req.params.id);
  if (!target) {
    throw new AppError('User not found', 404);
  }

  const requestedPassword = toCleanString(req.body.newPassword);
  const temporaryPassword = requestedPassword || `Temp@${Math.random().toString(36).slice(2, 8)}A1!`;

  enforcePasswordPolicy(temporaryPassword);

  const passwordHash = await bcrypt.hash(temporaryPassword, 10);

  await userRepository.setPassword(target._id, passwordHash, {
    forcePasswordChange: true,
    revokeSessions: true,
  });

  await emailService.sendPasswordReset({
    to: target.email,
    temporaryPassword,
  });

  res.json({
    message: 'Password reset successfully',
    temporaryPassword,
  });
});

export const setUserPermissions = asyncHandler(async (req, res) => {
  const target = await userRepository.findById(req.params.id);
  if (!target) {
    throw new AppError('User not found', 404);
  }

  validatePermissions(req.body.customPermissions || []);

  const updated = await userRepository.setCustomPermissions(
    target._id,
    req.body.customPermissions || [],
  );

  res.json({ user: updated });
});

export const uploadAvatar = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError('File is required', 400);
  }

  const user = await userRepository.findById(req.params.id);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  const publicUrl = `/uploads/${req.file.filename}`;

  await employeeFileRepository.create({
    user: user._id,
    category: 'AVATAR',
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
    storagePath: req.file.path,
    publicUrl,
    uploadedBy: req.user.id,
  });

  const updated = await userRepository.updateById(user._id, { avatarUrl: publicUrl });

  res.json({
    user: updated,
    avatarUrl: publicUrl,
  });
});

export const uploadMyAvatar = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError('File is required', 400);
  }

  const publicUrl = `/uploads/${req.file.filename}`;

  await employeeFileRepository.create({
    user: req.user.id,
    category: 'AVATAR',
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
    storagePath: req.file.path,
    publicUrl,
    uploadedBy: req.user.id,
  });

  const updated = await userRepository.updateById(req.user.id, { avatarUrl: publicUrl });

  res.json({
    user: updated,
    avatarUrl: publicUrl,
  });
});

export const uploadEmployeeDocument = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError('File is required', 400);
  }

  const user = await userRepository.findById(req.params.id);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  const category = toCleanString(req.body.category) || 'OTHER';
  const allowedCategories = ['AVATAR', 'CONTRACT', 'NATIONAL_ID', 'CERTIFICATE', 'OTHER'];
  if (!allowedCategories.includes(category)) {
    throw new AppError('Invalid document category', 400);
  }

  const publicUrl = `/uploads/${req.file.filename}`;
  const record = await employeeFileRepository.create({
    user: user._id,
    category,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
    storagePath: req.file.path,
    publicUrl,
    uploadedBy: req.user.id,
  });

  res.status(201).json({ file: record });
});

export const listEmployeeFiles = asyncHandler(async (req, res) => {
  const user = await userRepository.findById(req.params.id);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  const files = await employeeFileRepository.listByUser(user._id);
  res.json({ files });
});

export const importUsers = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError('Import file is required', 400);
  }

  const rows = await parseExcelImport(req.file.buffer);
  const report = {
    created: 0,
    skipped: 0,
    failed: 0,
    details: [],
  };

  for (const row of rows) {
    try {
      validateRole(row.role);
      enforcePasswordPolicy(row.password);

      const existing = await userRepository.findByEmail(row.email);
      if (existing) {
        report.skipped += 1;
        report.details.push({ row: row.rowNumber, status: 'skipped', reason: 'Email exists' });
        continue;
      }

      let managerId;
      if (row.managerEmail) {
        const manager = await userRepository.findByEmail(row.managerEmail);
        managerId = manager ? manager._id : undefined;
      }

      const payload = await prepareUserPayload(
        {
          fullName: row.fullName,
          email: row.email,
          role: row.role,
          employeeCode: row.employeeCode,
          department: row.department,
          jobTitle: row.jobTitle,
          phone: row.phone,
          team: row.team,
          managerId,
        },
        { currentUserId: '' },
      );

      const passwordHash = await bcrypt.hash(row.password, 10);

      await userRepository.create({
        ...payload,
        passwordHash,
      });

      report.created += 1;
      report.details.push({ row: row.rowNumber, status: 'created' });
    } catch (error) {
      report.failed += 1;
      report.details.push({ row: row.rowNumber, status: 'failed', reason: error.message });
    }
  }

  res.json({ report });
});

export const orgChart = asyncHandler(async (req, res) => {
  const allUsers = await userRepository.listOrgNodes();
  const managedUserIds = await resolveManagedUserIds({
    userRepository,
    actorId: req.user.id,
    actorRole: req.user.role,
  });

  const users = Array.isArray(managedUserIds)
    ? allUsers.filter((item) => managedUserIds.includes(String(item._id)))
    : allUsers;
  const nodesById = new Map();

  users.forEach((item) => {
    nodesById.set(String(item._id), {
      id: String(item._id),
      fullName: item.fullName,
      role: item.role,
      employeeCode: item.employeeCode || '',
      jobTitle: item.jobTitle || '',
      department: item.department || '',
      avatarUrl: item.avatarUrl || '',
      team: item.team || '',
      children: [],
    });
  });

  const roots = [];

  users.forEach((item) => {
    const node = nodesById.get(String(item._id));
    const managerId = item.manager ? String(item.manager) : '';

    if (managerId && managerId !== node.id && nodesById.has(managerId)) {
      nodesById.get(managerId).children.push(node);
      return;
    }

    roots.push(node);
  });

  const sortNodes = (items) => {
    items.sort((a, b) => a.fullName.localeCompare(b.fullName, 'ar'));
    items.forEach((item) => sortNodes(item.children));
  };

  sortNodes(roots);

  res.json({
    totalEmployees: users.length,
    roots,
  });
});

export const listAvailablePermissions = asyncHandler(async (req, res) => {
  res.json({
    permissions: Object.values(Permission),
  });
});

export const createSuperAdmin = asyncHandler(async (req, res) => {
  const secretKey = req.headers['x-admin-secret'];

  if (secretKey !== env.adminSetupSecret) {
    throw new AppError('Unauthorized', 401);
  }

  const totalUsers = await userRepository.countAll();
  if (totalUsers > 0) {
    throw new AppError('Setup disabled because users already exist', 409);
  }

  const fullName = toCleanString(req.body.fullName) || 'System Admin';
  const email = toCleanString(req.body.email).toLowerCase() || 'admin@deltaplus.local';
  const password = String(req.body.password || 'Admin@123Aa!');

  enforcePasswordPolicy(password);

  const existingUser = await userRepository.findByEmail(email);
  if (existingUser) {
    throw new AppError('Email already in use', 409);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await userRepository.create({
    fullName,
    email,
    passwordHash,
    role: Roles.GENERAL_MANAGER,
    team: toCleanString(req.body.team) || 'Delta Plus',
    department: toCleanString(req.body.department) || 'Management',
    jobTitle: toCleanString(req.body.jobTitle) || 'General Manager',
  });

  res.status(201).json({
    message: 'Super admin created successfully',
    user: {
      id: String(user._id),
      fullName: user.fullName,
      email: user.email,
      role: user.role,
    },
  });
});

