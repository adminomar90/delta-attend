import dayjs from 'dayjs';
import { env } from '../../config/env.js';
import { auditService } from '../../application/services/auditService.js';
import { whatsappService } from '../../application/services/whatsappService.js';
import { notificationService } from '../../application/services/notificationService.js';
import {
  NotificationWatchPermission,
  resolveNotificationAudience,
} from '../../application/services/notificationAudienceService.js';
import { levelService } from '../../application/services/levelService.js';
import { badgeService } from '../../application/services/badgeService.js';
import { UserRepository } from '../../infrastructure/db/repositories/UserRepository.js';
import { AttendanceRepository } from '../../infrastructure/db/repositories/AttendanceRepository.js';
import { PointsLedgerRepository } from '../../infrastructure/db/repositories/PointsLedgerRepository.js';
import { GoalRepository } from '../../infrastructure/db/repositories/GoalRepository.js';
import { buildAttendanceExcelBuffer } from '../../infrastructure/reports/attendanceExcelReportBuilder.js';
import { buildAttendancePdfBuffer } from '../../infrastructure/reports/attendancePdfReportBuilder.js';
import {
  buildAttendanceMessage,
  buildWhatsAppSendUrl,
  haversineDistanceMeters,
  isValidLatitude,
  isValidLongitude,
} from '../../shared/attendanceUtils.js';
import { isUserWithinManagedScope, resolveManagedUserIds } from '../../shared/accessScope.js';
import { AppError, asyncHandler } from '../../shared/errors.js';

const attendanceRepository = new AttendanceRepository();
const userRepository = new UserRepository();
const pointsLedgerRepository = new PointsLedgerRepository();
const goalRepository = new GoalRepository();

const toHours = (minutes) => Number((Math.max(0, Number(minutes || 0)) / 60).toFixed(2));

const attendanceDebugLog = (step, payload = {}) => {
  if (!env.attendanceDebug) {
    return;
  }

  console.log(`[attendance-debug] ${step}`, payload);
};

const sanitizeLocationInput = (body = {}) => ({
  latitude: body.latitude,
  longitude: body.longitude,
  accuracyMeters: body.accuracyMeters,
});

const buildRequestContext = (req, mode) => ({
  mode,
  userId: req.user?.id ? String(req.user.id) : '',
  ip: req.ip,
  userAgent: req.headers['user-agent'] || '',
});

const parseCoordinates = (body = {}, context = {}) => {
  attendanceDebugLog('parse-coordinates:input', {
    ...context,
    body: sanitizeLocationInput(body),
  });

  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  const accuracyMeters = Number(body.accuracyMeters);

  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
    attendanceDebugLog('parse-coordinates:invalid', {
      ...context,
      parsed: {
        latitude,
        longitude,
        accuracyMeters,
      },
    });
    throw new AppError('Valid latitude and longitude are required', 400);
  }

  const location = {
    latitude,
    longitude,
    accuracyMeters: Number.isFinite(accuracyMeters) ? Math.max(0, accuracyMeters) : null,
  };

  attendanceDebugLog('parse-coordinates:success', {
    ...context,
    location,
  });

  return location;
};

const resolveVerification = ({ latitude, longitude }, context = {}) => {
  if (env.attendanceAllowAnyLocation) {
    const verification = {
      policy: 'ANY_LOCATION',
      withinRange: true,
      distanceMeters: null,
      radiusMeters: null,
    };

    attendanceDebugLog('verification:any-location', {
      ...context,
      location: {
        latitude,
        longitude,
      },
      verification,
    });

    return verification;
  }

  const distanceMeters = haversineDistanceMeters(
    latitude,
    longitude,
    env.workSiteLatitude,
    env.workSiteLongitude,
  );
  const withinRange = distanceMeters <= env.workSiteRadiusMeters;

  const verification = {
    policy: 'GEOFENCE',
    withinRange,
    distanceMeters,
    radiusMeters: env.workSiteRadiusMeters,
  };

  attendanceDebugLog('verification:geofence', {
    ...context,
    location: {
      latitude,
      longitude,
    },
    verification,
  });

  return verification;
};

const serializeAttendance = (record) => ({
  id: String(record._id),
  userId: String(record.user),
  employeeName: record.employeeName,
  employeeCode: record.employeeCode,
  status: record.status,
  checkInAt: record.checkInAt,
  checkOutAt: record.checkOutAt,
  durationMinutes: Number(record.durationMinutes || 0),
  durationHours: toHours(record.durationMinutes || 0),
  workSite: record.workSite,
  checkInLocation: record.checkInLocation,
  checkOutLocation: record.checkOutLocation,
  checkInDistanceMeters: Number.isFinite(record.checkInDistanceMeters)
    ? record.checkInDistanceMeters
    : null,
  checkOutDistanceMeters: Number.isFinite(record.checkOutDistanceMeters)
    ? record.checkOutDistanceMeters
    : null,
  approvalStatus: record.approvalStatus || 'PENDING',
  approvalNote: record.approvalNote || '',
  rejectionReason: record.rejectionReason || '',
  pointsAwarded: Number(record.pointsAwarded || 0),
  approvedBy: record.approvedBy ? String(record.approvedBy) : null,
  approvedAt: record.approvedAt || null,
});

const isToday = (date) => {
  if (!date) return false;
  const d = new Date(date);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
};

const resolveAttendanceStatus = ({ openRecord, todayRecords = [], lastLoginAt = null }) => {
  if (openRecord) {
    return 'OPEN';
  }

  if (todayRecords.length) {
    return 'CHECKED_OUT';
  }

  if (isToday(lastLoginAt)) {
    return 'LOGGED_IN';
  }

  return 'ABSENT';
};

const resolveScopedUserIds = async (req, requestedUserId = '') => {
  const managedUserIds = await resolveManagedUserIds({
    userRepository,
    actorId: req.user.id,
    actorRole: req.user.role,
  });

  if (!requestedUserId) {
    return managedUserIds;
  }

  if (!Array.isArray(managedUserIds)) {
    return [requestedUserId];
  }

  return managedUserIds.includes(String(requestedUserId)) ? [requestedUserId] : [];
};

const resolveSingleDayRange = (query = {}) => {
  const day = query.date ? dayjs(query.date) : dayjs();

  if (!day.isValid()) {
    throw new AppError('Invalid date query value', 400);
  }

  return {
    label: day.format('YYYY-MM-DD'),
    from: day.startOf('day').toDate(),
    to: day.endOf('day').toDate(),
  };
};

const resolveDateRange = (query = {}) => {
  const from = query.from ? dayjs(query.from).startOf('day') : dayjs().startOf('month');
  const to = query.to ? dayjs(query.to).endOf('day') : dayjs().endOf('month');

  if (!from.isValid() || !to.isValid()) {
    throw new AppError('Invalid date range query values', 400);
  }

  if (to.isBefore(from)) {
    throw new AppError('Invalid date range: "to" must be after "from"', 400);
  }

  return {
    from: from.toDate(),
    to: to.toDate(),
    fromLabel: from.format('YYYY-MM-DD'),
    toLabel: to.format('YYYY-MM-DD'),
  };
};

const resolveManagerPhone = (user) => {
  const managerPhone = user?.manager?.phone?.trim();
  if (managerPhone) {
    return managerPhone;
  }
  return env.attendanceAdminWhatsapp || '';
};

const sendAttendanceWhatsapp = async ({ message, to }) => {
  const recipient = to || env.attendanceAdminWhatsapp || '';
  const fallbackUrl = buildWhatsAppSendUrl(recipient, message);
  const delivery = await whatsappService.sendAttendanceNotification({
    to: recipient,
    message,
  });

  return {
    delivery,
    fallbackUrl,
    url: delivery.sent ? '' : fallbackUrl,
    message,
    adminPhone: recipient,
  };
};

const toCleanString = (value) => {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim();
};

const normalizeAwardedPoints = (value) => {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1000) {
    throw new AppError('points must be between 0 and 1000', 400);
  }
  return Math.round(parsed);
};

export const attendanceMeta = asyncHandler(async (req, res) => {
  const [todayRecords, persistedOpenRecord, currentUserDoc] = await Promise.all([
    attendanceRepository.findTodayForUser(req.user.id),
    attendanceRepository.findOpenByUser(req.user.id),
    userRepository.findById(req.user.id),
  ]);
  const openRecord = persistedOpenRecord || todayRecords.find((item) => item.status === 'OPEN') || null;
  const todayWorkedMinutes = todayRecords
    .filter((item) => item.status === 'CLOSED')
    .reduce((sum, item) => sum + Number(item.durationMinutes || 0), 0);
  const lastLoginAt = currentUserDoc?.lastLoginAt || null;

  attendanceDebugLog('meta:loaded', {
    userId: String(req.user.id),
    todayRecordsCount: todayRecords.length,
    openRecordId: openRecord ? String(openRecord._id) : null,
  });

  res.json({
    policy: {
      mode: env.attendanceAllowAnyLocation ? 'ANY_LOCATION' : 'GEOFENCE',
      geofenceEnabled: !env.attendanceAllowAnyLocation,
    },
    workSite: env.attendanceAllowAnyLocation
      ? null
      : {
          name: env.workSiteName,
          latitude: env.workSiteLatitude,
          longitude: env.workSiteLongitude,
          radiusMeters: env.workSiteRadiusMeters,
        },
    whatsappAdminConfigured: !!env.attendanceAdminWhatsapp,
    todayWorkedMinutes,
    todayWorkedHours: toHours(todayWorkedMinutes),
    todayRecords: todayRecords.map((item) => serializeAttendance(item)),
    openRecord: openRecord ? serializeAttendance(openRecord) : null,
    lastLoginAt,
    currentStatus: resolveAttendanceStatus({
      openRecord,
      todayRecords,
      lastLoginAt,
    }),
  });
});

export const attendanceHistory = asyncHandler(async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
  const rows = await attendanceRepository.listForUser(req.user.id, limit);

  attendanceDebugLog('history:loaded', {
    userId: String(req.user.id),
    limit,
    itemsCount: rows.length,
  });

  const totalWorkedMinutes = rows
    .filter((item) => item.status === 'CLOSED')
    .reduce((sum, item) => sum + Number(item.durationMinutes || 0), 0);

  res.json({
    totalWorkedMinutes,
    totalWorkedHours: toHours(totalWorkedMinutes),
    items: rows.map((item) => serializeAttendance(item)),
  });
});

export const checkIn = asyncHandler(async (req, res) => {
  const requestContext = buildRequestContext(req, 'CHECK_IN');
  attendanceDebugLog('check-in:start', requestContext);

  const currentOpen = await attendanceRepository.findOpenByUser(req.user.id);
  if (currentOpen) {
    attendanceDebugLog('check-in:blocked-open-session', {
      ...requestContext,
      openAttendanceId: String(currentOpen._id),
    });
    throw new AppError('You already have an open attendance session', 409);
  }

  const location = parseCoordinates(req.body, requestContext);
  const verification = resolveVerification(location, requestContext);

  if (!env.attendanceAllowAnyLocation && !verification.withinRange) {
    attendanceDebugLog('check-in:out-of-range', {
      ...requestContext,
      distanceMeters: verification.distanceMeters,
      radiusMeters: verification.radiusMeters,
    });
    throw new AppError('You must be inside the work site range to check in', 403);
  }

  const user = await userRepository.findByIdWithManager(req.user.id);
  if (!user) {
    attendanceDebugLog('check-in:user-not-found', requestContext);
    throw new AppError('User not found', 404);
  }

  const now = new Date();
  const record = await attendanceRepository.create({
    user: user._id,
    employeeName: user.fullName,
    employeeCode: user.employeeCode || '',
    workSite: {
      name: env.attendanceAllowAnyLocation ? 'Any Location' : env.workSiteName,
      latitude: env.workSiteLatitude,
      longitude: env.workSiteLongitude,
      radiusMeters: env.workSiteRadiusMeters,
    },
    checkInAt: now,
    checkInLocation: location,
    checkInDistanceMeters: Number.isFinite(verification.distanceMeters) ? verification.distanceMeters : 0,
    status: 'OPEN',
    approvalStatus: 'PENDING',
    pointsAwarded: 0,
  });

  await userRepository.markAttendanceCheckIn(user._id, now);

  const whatsappMessage = buildAttendanceMessage({
    mode: 'CHECK_IN',
    employeeName: user.fullName,
    employeeCode: user.employeeCode || '',
    workSiteName: env.attendanceAllowAnyLocation ? 'Any Location' : env.workSiteName,
    policy: verification.policy,
    timestamp: now,
    latitude: location.latitude,
    longitude: location.longitude,
    distanceMeters: verification.distanceMeters,
    radiusMeters: verification.radiusMeters,
  });

  const managerPhone = resolveManagerPhone(user);
  const whatsapp = await sendAttendanceWhatsapp({
    message: whatsappMessage,
    to: managerPhone,
  });

  await auditService.log({
    actorId: req.user.id,
    action: 'ATTENDANCE_CHECK_IN',
    entityType: 'ATTENDANCE',
    entityId: record._id,
    after: {
      checkInAt: now,
      location,
      verification,
      whatsappDelivery: whatsapp.delivery,
    },
    req,
  });

  const attendanceRecipients = await resolveNotificationAudience({
    userRepository,
    actorId: user._id,
    watchPermission: NotificationWatchPermission.ATTENDANCE,
  });
  await notificationService.notifyAttendanceActivity(attendanceRecipients, {
    employeeName: user.fullName,
    operationLabel: 'تسجيل الحضور',
    occurredAt: now,
    metadata: {
      attendanceId: String(record._id),
      employeeId: String(user._id),
      action: 'CHECK_IN',
    },
  });

  const responsePayload = {
    attendance: serializeAttendance(record),
    verification: {
      policy: verification.policy,
      locationCaptured: true,
      withinRange: verification.withinRange,
      distanceMeters: Number.isFinite(verification.distanceMeters)
        ? Math.round(verification.distanceMeters)
        : null,
      radiusMeters: Number.isFinite(verification.radiusMeters) ? verification.radiusMeters : null,
    },
    whatsapp,
  };

  if (env.attendanceDebug) {
    responsePayload.debug = {
      request: requestContext,
      receivedLocation: location,
      verification,
      whatsappDelivery: whatsapp.delivery,
    };
  }

  attendanceDebugLog('check-in:success', {
    ...requestContext,
    attendanceId: String(record._id),
    whatsappDelivery: whatsapp.delivery,
  });

  res.status(201).json(responsePayload);
});

export const checkOut = asyncHandler(async (req, res) => {
  const requestContext = buildRequestContext(req, 'CHECK_OUT');
  attendanceDebugLog('check-out:start', requestContext);

  const open = await attendanceRepository.findOpenByUser(req.user.id);
  if (!open) {
    attendanceDebugLog('check-out:no-open-session', requestContext);
    throw new AppError('No open attendance session found for check out', 404);
  }

  const location = parseCoordinates(req.body, requestContext);
  const verification = resolveVerification(location, requestContext);

  if (!env.attendanceAllowAnyLocation && !verification.withinRange) {
    attendanceDebugLog('check-out:out-of-range', {
      ...requestContext,
      distanceMeters: verification.distanceMeters,
      radiusMeters: verification.radiusMeters,
    });
    throw new AppError('You must be inside the work site range to check out', 403);
  }

  const checkoutAt = new Date();
  const durationMinutes = Math.max(0, dayjs(checkoutAt).diff(dayjs(open.checkInAt), 'minute'));

  const updated = await attendanceRepository.closeById(open._id, {
    checkOutAt: checkoutAt,
    checkOutLocation: location,
    checkOutDistanceMeters: Number.isFinite(verification.distanceMeters) ? verification.distanceMeters : 0,
    durationMinutes,
  });

  const updatedUser = await userRepository.registerAttendanceCheckOut(req.user.id, {
    durationMinutes,
    checkOutAt: checkoutAt,
  });

  const checkOutUser = await userRepository.findByIdWithManager(req.user.id);

  const whatsappMessage = buildAttendanceMessage({
    mode: 'CHECK_OUT',
    employeeName: open.employeeName,
    employeeCode: open.employeeCode || '',
    workSiteName: env.attendanceAllowAnyLocation ? 'Any Location' : open.workSite?.name || env.workSiteName,
    policy: verification.policy,
    timestamp: checkoutAt,
    latitude: location.latitude,
    longitude: location.longitude,
    distanceMeters: verification.distanceMeters,
    radiusMeters: verification.radiusMeters,
    durationMinutes,
  });

  const checkOutManagerPhone = resolveManagerPhone(checkOutUser);
  const whatsapp = await sendAttendanceWhatsapp({
    message: whatsappMessage,
    to: checkOutManagerPhone,
  });

  await auditService.log({
    actorId: req.user.id,
    action: 'ATTENDANCE_CHECK_OUT',
    entityType: 'ATTENDANCE',
    entityId: open._id,
    before: {
      checkInAt: open.checkInAt,
      checkInLocation: open.checkInLocation,
    },
    after: {
      checkOutAt: checkoutAt,
      checkOutLocation: location,
      durationMinutes,
      verification,
      whatsappDelivery: whatsapp.delivery,
    },
    req,
  });

  const checkoutRecipients = await resolveNotificationAudience({
    userRepository,
    actorId: checkOutUser?._id || req.user.id,
    watchPermission: NotificationWatchPermission.ATTENDANCE,
  });
  await notificationService.notifyAttendanceActivity(checkoutRecipients, {
    employeeName: open.employeeName,
    operationLabel: 'تسجيل الانصراف',
    occurredAt: checkoutAt,
    metadata: {
      attendanceId: String(open._id),
      employeeId: String(req.user.id),
      action: 'CHECK_OUT',
      durationMinutes,
    },
  });

  const responsePayload = {
    attendance: serializeAttendance(updated),
    verification: {
      policy: verification.policy,
      locationCaptured: true,
      withinRange: verification.withinRange,
      distanceMeters: Number.isFinite(verification.distanceMeters)
        ? Math.round(verification.distanceMeters)
        : null,
      radiusMeters: Number.isFinite(verification.radiusMeters) ? verification.radiusMeters : null,
    },
    workSummary: {
      sessionMinutes: durationMinutes,
      sessionHours: toHours(durationMinutes),
      totalMinutes: Number(updatedUser?.workMinutesTotal || 0),
      totalHours: toHours(updatedUser?.workMinutesTotal || 0),
      totalSessions: Number(updatedUser?.workSessionsCount || 0),
    },
    whatsapp,
  };

  if (env.attendanceDebug) {
    responsePayload.debug = {
      request: requestContext,
      openAttendanceId: String(open._id),
      receivedLocation: location,
      verification,
      durationMinutes,
      whatsappDelivery: whatsapp.delivery,
    };
  }

  attendanceDebugLog('check-out:success', {
    ...requestContext,
    attendanceId: String(open._id),
    durationMinutes,
    whatsappDelivery: whatsapp.delivery,
  });

  res.json(responsePayload);
});

export const attendancePendingApprovals = asyncHandler(async (req, res) => {
  const managedUserIds = await resolveManagedUserIds({
    userRepository,
    actorId: req.user.id,
    actorRole: req.user.role,
  });

  const limit = Math.min(500, Math.max(1, Number(req.query.limit || 150)));
  const rows = await attendanceRepository.listPendingApprovals({
    userIds: managedUserIds,
    limit,
  });

  res.json({
    items: rows.map((item) => serializeAttendance(item)),
  });
});

export const approveAttendance = asyncHandler(async (req, res) => {
  const attendance = await attendanceRepository.findById(req.params.id);
  if (!attendance) {
    throw new AppError('Attendance record not found', 404);
  }

  if (attendance.status !== 'CLOSED') {
    throw new AppError('Only closed attendance sessions can be approved', 400);
  }

  if ((attendance.approvalStatus || 'PENDING') !== 'PENDING') {
    throw new AppError('Attendance session already reviewed', 409);
  }

  if (String(attendance.user) === req.user.id) {
    throw new AppError('You cannot approve your own attendance session', 403);
  }

  const managedUserIds = await resolveManagedUserIds({
    userRepository,
    actorId: req.user.id,
    actorRole: req.user.role,
  });

  if (!isUserWithinManagedScope({ managedUserIds, userId: attendance.user })) {
    throw new AppError('You can only approve attendance for employees in your management scope', 403);
  }

  const points = normalizeAwardedPoints(req.body.points || 0);
  const approvalNote = toCleanString(req.body.approvalNote);

  const updated = await attendanceRepository.updateApprovalById(attendance._id, {
    approvalStatus: 'APPROVED',
    approvalNote,
    rejectionReason: '',
    pointsAwarded: points,
    approvedBy: req.user.id,
    approvedAt: new Date(),
  });

  if (points > 0) {
    await pointsLedgerRepository.create({
      user: attendance.user,
      points,
      category: 'ATTENDANCE_APPROVAL',
      reason: `اعتماد حضور/انصراف: ${attendance.employeeName}`,
      approvedBy: req.user.id,
    });

    const targetUser = await userRepository.findById(attendance.user);
    if (targetUser) {
      const updatedPoints = Number(targetUser.pointsTotal || 0) + points;
      const nextLevel = levelService.resolveLevel(updatedPoints);
      const updatedUser = await userRepository.incrementPointsAndSetLevel(targetUser._id, points, nextLevel);
      const generatedBadges = badgeService.evaluate(updatedUser, 0);

      for (const badgeCode of generatedBadges) {
        if (!updatedUser.badges.includes(badgeCode)) {
          await userRepository.attachBadge(updatedUser._id, badgeCode);
        }
      }

      const goalUpdates = await goalRepository.incrementActiveGoals(updatedUser._id, points);
      for (const goal of goalUpdates) {
        if (goal.achieved) {
          await notificationService.notifyGoalAchieved(updatedUser._id, goal);
        }
      }
    }
  }

  await notificationService.notifySystem(
    attendance.user,
    'اعتماد الحضور والانصراف',
    `تم اعتماد جلسة الحضور/الانصراف وإضافة ${points} نقطة.`,
    {
      attendanceId: String(attendance._id),
      points,
    },
  );

  await auditService.log({
    actorId: req.user.id,
    action: 'ATTENDANCE_APPROVED',
    entityType: 'ATTENDANCE',
    entityId: attendance._id,
    after: {
      approvalStatus: 'APPROVED',
      pointsAwarded: points,
    },
    req,
  });

  res.json({
    attendance: serializeAttendance(updated),
    grantedPoints: points,
  });
});

export const rejectAttendance = asyncHandler(async (req, res) => {
  const attendance = await attendanceRepository.findById(req.params.id);
  if (!attendance) {
    throw new AppError('Attendance record not found', 404);
  }

  if (attendance.status !== 'CLOSED') {
    throw new AppError('Only closed attendance sessions can be rejected', 400);
  }

  if ((attendance.approvalStatus || 'PENDING') !== 'PENDING') {
    throw new AppError('Attendance session already reviewed', 409);
  }

  if (String(attendance.user) === req.user.id) {
    throw new AppError('You cannot reject your own attendance session', 403);
  }

  const managedUserIds = await resolveManagedUserIds({
    userRepository,
    actorId: req.user.id,
    actorRole: req.user.role,
  });

  if (!isUserWithinManagedScope({ managedUserIds, userId: attendance.user })) {
    throw new AppError('You can only reject attendance for employees in your management scope', 403);
  }

  const rejectionReason = toCleanString(req.body.reason);
  if (!rejectionReason) {
    throw new AppError('reason is required', 400);
  }

  const updated = await attendanceRepository.updateApprovalById(attendance._id, {
    approvalStatus: 'REJECTED',
    rejectionReason,
    approvalNote: toCleanString(req.body.approvalNote),
    pointsAwarded: 0,
    approvedBy: req.user.id,
    approvedAt: new Date(),
  });

  await notificationService.notifySystem(
    attendance.user,
    'رفض اعتماد الحضور والانصراف',
    `تم رفض جلسة الحضور/الانصراف. السبب: ${rejectionReason}`,
    {
      attendanceId: String(attendance._id),
      reason: rejectionReason,
    },
  );

  await auditService.log({
    actorId: req.user.id,
    action: 'ATTENDANCE_REJECTED',
    entityType: 'ATTENDANCE',
    entityId: attendance._id,
    after: {
      approvalStatus: 'REJECTED',
      rejectionReason,
    },
    req,
  });

  res.json({
    attendance: serializeAttendance(updated),
  });
});

export const attendanceAdminOverview = asyncHandler(async (req, res) => {
  const { from, to, label } = resolveSingleDayRange(req.query);
  const scopedUserIds = await resolveScopedUserIds(req, req.query.userId || '');

  const [users, sessions, aggregates, openSessions] = await Promise.all([
    userRepository.listActive({
      includeManager: false,
      userIds: Array.isArray(scopedUserIds) ? scopedUserIds : undefined,
    }),
    attendanceRepository.listByDateRange({
      from,
      to,
      userIds: scopedUserIds,
      limit: 5000,
    }),
    attendanceRepository.aggregateByUserForDateRange({
      from,
      to,
      userIds: scopedUserIds,
    }),
    attendanceRepository.listOpenSessions({
      userIds: scopedUserIds,
    }),
  ]);

  const latestSessionByUser = new Map();
  sessions.forEach((session) => {
    const userId = String(session.user);
    if (!latestSessionByUser.has(userId)) {
      latestSessionByUser.set(userId, session);
    }
  });
  const openSessionByUser = new Map();
  (openSessions || []).forEach((session) => {
    const userId = String(session.user);
    if (!openSessionByUser.has(userId)) {
      openSessionByUser.set(userId, session);
    }
  });

  const aggregateByUser = new Map(
    aggregates.map((item) => [String(item._id), item]),
  );

  const employees = users
    .map((user) => {
      const userId = String(user._id);
      const latest = latestSessionByUser.get(userId) || null;
      const openSession = openSessionByUser.get(userId) || null;
      const aggregate = aggregateByUser.get(userId) || {
        sessionsCount: 0,
        openSessions: 0,
        closedSessions: 0,
        workedMinutes: 0,
        latestCheckInAt: null,
        latestCheckOutAt: null,
      };
      const openSessionsCount = Math.max(Number(aggregate.openSessions || 0), openSession ? 1 : 0);

      let status = 'ABSENT';
      if (openSession) {
        status = 'OPEN';
      } else if (aggregate.sessionsCount > 0) {
        status = latest?.status === 'OPEN' ? 'OPEN' : 'CHECKED_OUT';
      } else if (isToday(user.lastLoginAt)) {
        status = 'LOGGED_IN';
      }

      return {
        userId,
        fullName: user.fullName,
        employeeCode: user.employeeCode || '',
        role: user.role,
        department: user.department || '',
        status,
        sessionsCount: Number(aggregate.sessionsCount || 0),
        openSessions: openSessionsCount,
        closedSessions: Number(aggregate.closedSessions || 0),
        todayWorkedMinutes: Number(aggregate.workedMinutes || 0),
        todayWorkedHours: toHours(aggregate.workedMinutes || 0),
        lastCheckInAt: openSession?.checkInAt || latest?.checkInAt || aggregate.latestCheckInAt || null,
        lastCheckOutAt: latest?.checkOutAt || aggregate.latestCheckOutAt || null,
        lastCheckInLocation: openSession?.checkInLocation || latest?.checkInLocation || null,
        lastCheckOutLocation: latest?.checkOutLocation || null,
        lastLocation: openSession?.checkInLocation || latest?.checkOutLocation || latest?.checkInLocation || null,
      };
    })
    .sort((a, b) => {
      if (a.status === 'OPEN' && b.status !== 'OPEN') return -1;
      if (a.status !== 'OPEN' && b.status === 'OPEN') return 1;
      return a.fullName.localeCompare(b.fullName);
    });

  const totals = employees.reduce(
    (acc, employee) => {
      acc.totalEmployees += 1;
      acc.totalWorkedMinutes += employee.todayWorkedMinutes;
      acc.totalSessions += employee.sessionsCount;
      acc.openSessions += employee.openSessions;
      acc.closedSessions += employee.closedSessions;

      if (employee.status === 'OPEN') acc.checkedInNow += 1;
      if (employee.status === 'CHECKED_OUT') acc.checkedOutToday += 1;
      if (employee.status === 'LOGGED_IN') acc.loggedInToday += 1;
      if (employee.status === 'ABSENT') acc.absentToday += 1;

      return acc;
    },
    {
      totalEmployees: 0,
      checkedInNow: 0,
      checkedOutToday: 0,
      loggedInToday: 0,
      absentToday: 0,
      totalSessions: 0,
      openSessions: 0,
      closedSessions: 0,
      totalWorkedMinutes: 0,
    },
  );

  res.json({
    date: label,
    totals: {
      ...totals,
      totalWorkedHours: toHours(totals.totalWorkedMinutes),
    },
    employees,
    sessions: sessions.map((item) => serializeAttendance(item)),
  });
});

export const attendanceAdminExportExcel = asyncHandler(async (req, res) => {
  const { from, to, fromLabel, toLabel } = resolveDateRange(req.query);
  const scopedUserIds = await resolveScopedUserIds(req, req.query.userId || '');
  const rows = await attendanceRepository.listByDateRange({
    from,
    to,
    userIds: scopedUserIds,
    limit: 20000,
  });

  const buffer = await buildAttendanceExcelBuffer(rows, {
    fromLabel,
    toLabel,
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="attendance-report-${fromLabel}-to-${toLabel}.xlsx"`,
  );
  res.send(Buffer.from(buffer));
});

export const attendanceAdminExportPdf = asyncHandler(async (req, res) => {
  const { from, to, fromLabel, toLabel } = resolveDateRange(req.query);
  const scopedUserIds = await resolveScopedUserIds(req, req.query.userId || '');
  const rows = await attendanceRepository.listByDateRange({
    from,
    to,
    userIds: scopedUserIds,
    limit: 5000,
  });

  const buffer = await buildAttendancePdfBuffer(rows, {
    fromLabel,
    toLabel,
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="attendance-report-${fromLabel}-to-${toLabel}.pdf"`,
  );
  res.send(buffer);
});
