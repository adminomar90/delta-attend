import { UserModel } from '../models/UserModel.js';

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
    const filter = { active: true };
    if (Array.isArray(userIds)) {
      filter._id = { $in: userIds };
    }

    let query = UserModel.find(filter).select('-passwordHash -otpCodeHash').sort({ fullName: 1 });

    if (includeManager) {
      query = query.populate('manager', 'fullName role jobTitle');
    }

    return query;
  }

  async listHierarchyNodes() {
    return UserModel.find({ active: true })
      .select('_id manager department')
      .lean();
  }

  async listOrgNodes() {
    return UserModel.find({ active: true })
      .select('fullName role jobTitle department avatarUrl manager employeeCode team')
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
    return UserModel.find({ _id: { $in: ids }, active: true }).select('fullName role email employeeCode department jobTitle');
  }

  async incrementPointsAndSetLevel(userId, pointsDelta, level) {
    return UserModel.findByIdAndUpdate(
      userId,
      {
        $inc: { pointsTotal: pointsDelta },
        $set: { level },
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
