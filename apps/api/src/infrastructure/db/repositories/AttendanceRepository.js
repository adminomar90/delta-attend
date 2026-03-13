import dayjs from 'dayjs';
import { AttendanceModel } from '../models/AttendanceModel.js';

export class AttendanceRepository {
  async findById(id) {
    return AttendanceModel.findById(id);
  }

  async findOpenByUser(userId) {
    return AttendanceModel.findOne({
      user: userId,
      status: 'OPEN',
    }).sort({ checkInAt: -1 });
  }

  async create(payload) {
    return AttendanceModel.create(payload);
  }

  async closeById(id, payload) {
    return AttendanceModel.findByIdAndUpdate(
      id,
      {
        ...payload,
        status: 'CLOSED',
      },
      { new: true },
    );
  }

  async listForUser(userId, limit = 20) {
    return AttendanceModel.find({ user: userId })
      .sort({ checkInAt: -1 })
      .limit(limit);
  }

  async listPendingApprovals({ userIds, limit = 200 }) {
    const filter = {
      status: 'CLOSED',
      approvalStatus: 'PENDING',
    };

    if (Array.isArray(userIds)) {
      filter.user = { $in: userIds };
    }

    return AttendanceModel.find(filter)
      .sort({ checkOutAt: -1, checkInAt: -1 })
      .limit(limit);
  }

  async listOpenSessions({ userIds } = {}) {
    const filter = {
      status: 'OPEN',
    };

    if (Array.isArray(userIds)) {
      filter.user = { $in: userIds };
    }

    return AttendanceModel.find(filter).sort({ checkInAt: -1 });
  }

  async updateApprovalById(id, payload) {
    return AttendanceModel.findByIdAndUpdate(id, payload, { new: true });
  }

  async findTodayForUser(userId) {
    const start = dayjs().startOf('day').toDate();
    const end = dayjs().endOf('day').toDate();

    return AttendanceModel.find({
      user: userId,
      checkInAt: {
        $gte: start,
        $lte: end,
      },
    }).sort({ checkInAt: -1 });
  }

  async listByDateRange({ from, to, userIds, limit = 500 }) {
    const filter = {
      checkInAt: {
        $gte: from,
        $lte: to,
      },
    };

    if (Array.isArray(userIds)) {
      filter.user = { $in: userIds };
    }

    return AttendanceModel.find(filter)
      .sort({ checkInAt: -1 })
      .limit(limit);
  }

  async aggregateByUserForDateRange({ from, to, userIds }) {
    const match = {
      checkInAt: {
        $gte: from,
        $lte: to,
      },
    };

    if (Array.isArray(userIds)) {
      match.user = { $in: userIds };
    }

    return AttendanceModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$user',
          sessionsCount: { $sum: 1 },
          openSessions: {
            $sum: {
              $cond: [{ $eq: ['$status', 'OPEN'] }, 1, 0],
            },
          },
          closedSessions: {
            $sum: {
              $cond: [{ $eq: ['$status', 'CLOSED'] }, 1, 0],
            },
          },
          workedMinutes: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'CLOSED'] },
                { $ifNull: ['$durationMinutes', 0] },
                0,
              ],
            },
          },
          latestCheckInAt: { $max: '$checkInAt' },
          latestCheckOutAt: { $max: '$checkOutAt' },
        },
      },
    ]);
  }
}
