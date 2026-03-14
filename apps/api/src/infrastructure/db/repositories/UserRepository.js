import { UserModel } from '../models/UserModel.js';

const buildManagementFilter = ({ includeInactive = false, includeDeleted = false, userIds } = {}) => {
  const filter = {};

  if (!includeDeleted) {
    filter.deletedAt = null;
  }

  if (!includeInactive) {
    filter.active = true;
  }

  if (Array.isArray(userIds)) {
    filter._id = { $in: userIds };
  }

  return filter;
};

export class UserRepository {
  async findByEmail(email) {
    return UserModel.findOne({ email }).lean(false);
  }

  async findByEmployeeCode(employeeCode) {
    return UserModel.findOne({ employeeCode }).lean(false);
  }

  async findById(id) {
    return UserModel.findById(id).lean(false);
  }

  async findByIdWithManager(id) {
    return UserModel.findById(id)
      .populate('manager', 'fullName phone')
      .lean(false);
  }

  async countAll() {
    return UserModel.countDocuments({});
  }

  async listActive({ includeManager = true, userIds } = {}) {
    const filter = buildManagementFilter({ includeManager, includeInactive: false, includeDeleted: false, userIds });

    let query = UserModel.find(filter).select('-passwordHash -otpCodeHash').sort({ fullName: 1 });

    if (includeManager) {
      query = query.populate('manager', 'fullName role jobTitle');
    }

    return query;
  }

  async listForManagement({ includeManager = true, userIds, includeInactive = false } = {}) {
    let query = UserModel.find(
      buildManagementFilter({ includeInactive, includeDeleted: false, userIds }),
    )
      .select('-passwordHash -otpCodeHash')
      .sort({ fullName: 1 });

    if (includeManager) {
      query = query.populate('manager', 'fullName role jobTitle active');
    }

    return query;
  }

  async listHierarchyNodes() {
    return UserModel.find({ deletedAt: null })
      .select('_id manager department active deletedAt')
      .lean();
  }

  async listOrgNodes() {
    return UserModel.find({ deletedAt: null })
      .select('fullName role jobTitle department avatarUrl manager employeeCode team active deletedAt')
      .sort({ fullName: 1 })
      .lean();
  }

  async create(payload) {
    return UserModel.create(payload);
  }

  async updateById(id, payload) {
    return UserModel.findByIdAndUpdate(id, payload, { new: true })
      .select('-passwordHash -otpCodeHash')
      .populate('manager', 'fullName role jobTitle');
  }

  async setPassword(userId, passwordHash, { forcePasswordChange = false, revokeSessions = true } = {}) {
    const update = {
      $set: {
        passwordHash,
        forcePasswordChange,
        authFailureCount: 0,
        lockedUntil: null,
        otpCodeHash: '',
        otpExpiresAt: null,
      },
    };

    if (revokeSessions) {
      update.$inc = { sessionVersion: 1 };
    }

    return UserModel.findByIdAndUpdate(userId, update, { new: true });
  }

  async setActiveStatus(userId, active, { revokeSessions = true } = {}) {
    const update = {
      $set: {
        active: !!active,
        lockedUntil: null,
        authFailureCount: 0,
      },
    };

    if (!active && revokeSessions) {
      update.$inc = { sessionVersion: 1 };
    }

    return UserModel.findByIdAndUpdate(userId, update, { new: true })
      .select('-passwordHash -otpCodeHash')
      .populate('manager', 'fullName role jobTitle');
  }

  async setCustomPermissions(userId, customPermissions = []) {
    return UserModel.findByIdAndUpdate(
      userId,
      { customPermissions },
      { new: true },
    )
      .select('-passwordHash -otpCodeHash')
      .populate('manager', 'fullName role jobTitle');
  }

  async incrementAuthFailures(userId) {
    return UserModel.findByIdAndUpdate(
      userId,
      { $inc: { authFailureCount: 1 } },
      { new: true },
    );
  }

  async clearAuthFailures(userId) {
    return UserModel.findByIdAndUpdate(
      userId,
      {
        authFailureCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
      { new: true },
    );
  }

  async updateLastLogin(userId) {
    return UserModel.findByIdAndUpdate(
      userId,
      { $set: { lastLoginAt: new Date() } },
      { new: true },
    );
  }

  async lockUser(userId, until) {
    return UserModel.findByIdAndUpdate(
      userId,
      {
        lockedUntil: until,
      },
      { new: true },
    );
  }

  async setOtp(userId, otpCodeHash, otpExpiresAt) {
    return UserModel.findByIdAndUpdate(
      userId,
      {
        otpCodeHash,
        otpExpiresAt,
      },
      { new: true },
    );
  }

  async clearOtp(userId) {
    return UserModel.findByIdAndUpdate(
      userId,
      {
        otpCodeHash: '',
        otpExpiresAt: null,
      },
      { new: true },
    );
  }

  async listByIds(ids = []) {
    return UserModel.find({ _id: { $in: ids }, active: true, deletedAt: null }).select('fullName role email employeeCode department jobTitle');
  }

  async listDirectReports(managerId) {
    return UserModel.find({
      manager: managerId,
      deletedAt: null,
    })
      .select('-passwordHash -otpCodeHash')
      .populate('manager', 'fullName role jobTitle active')
      .sort({ fullName: 1 });
  }

  async reassignDirectReports(managerId, nextManagerId = null) {
    return UserModel.updateMany(
      {
        manager: managerId,
        deletedAt: null,
      },
      {
        $set: {
          manager: nextManagerId || null,
        },
      },
    );
  }

  async softDeleteById(userId, { deletedBy = null, revokeSessions = true } = {}) {
    const update = {
      $set: {
        active: false,
        deletedAt: new Date(),
        deletedBy: deletedBy || null,
        lockedUntil: null,
        authFailureCount: 0,
      },
    };

    if (revokeSessions) {
      update.$inc = { sessionVersion: 1 };
    }

    return UserModel.findByIdAndUpdate(userId, update, { new: true })
      .select('-passwordHash -otpCodeHash')
      .populate('manager', 'fullName role jobTitle active');
  }

  async incrementPointsAndSetLevel(userId, pointsDelta, level) {
    const user = await UserModel.findById(userId);
    if (!user) {
      return null;
    }

    const safePointsDelta = Number(pointsDelta || 0);
    const nextPointsTotal = Math.max(0, Number(user.pointsTotal || 0) + safePointsDelta);
    const nextLevel = Math.max(Number(user.level || 1), Number(level || 1));

    return UserModel.findByIdAndUpdate(
      userId,
      {
        $set: {
          pointsTotal: nextPointsTotal,
          level: nextLevel,
        },
      },
      { new: true },
    );
  }

  async attachBadge(userId, badgeCode) {
    return UserModel.findByIdAndUpdate(
      userId,
      {
        $addToSet: { badges: badgeCode },
      },
      { new: true },
    );
  }

  async markAttendanceCheckIn(userId, checkInAt) {
    return UserModel.findByIdAndUpdate(
      userId,
      {
        $set: {
          lastCheckInAt: checkInAt,
          lastAttendanceAt: checkInAt,
        },
      },
      { new: true },
    );
  }

  async registerAttendanceCheckOut(userId, { durationMinutes = 0, checkOutAt }) {
    const safeDuration = Math.max(0, Number(durationMinutes || 0));

    return UserModel.findByIdAndUpdate(
      userId,
      {
        $inc: {
          workMinutesTotal: safeDuration,
          workSessionsCount: 1,
        },
        $set: {
          lastCheckOutAt: checkOutAt,
          lastAttendanceAt: checkOutAt,
        },
      },
      { new: true },
    );
  }
}
