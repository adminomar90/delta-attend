import mongoose from 'mongoose';
import { PointsLedgerModel } from '../models/PointsLedgerModel.js';

export class PointsLedgerRepository {
  async create(payload) {
    return PointsLedgerModel.create(payload);
  }

  async findByAuditLog(auditLogId) {
    return PointsLedgerModel.findOne({ auditLog: auditLogId })
      .populate('user', 'fullName role level')
      .populate('approvedBy', 'fullName role');
  }

  async sumPointsForDay(userId, dayStart, dayEnd) {
    const result = await PointsLedgerModel.aggregate([
      {
        $match: {
          user: userId,
          createdAt: {
            $gte: dayStart,
            $lte: dayEnd,
          },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$points' },
        },
      },
    ]);

    return result[0]?.total || 0;
  }

  async leaderboard({ startDate, endDate, limit = 10, userIds = null }) {
    const match = {
      createdAt: {
        $gte: startDate,
        $lte: endDate,
      },
      points: { $gt: 0 },
    };

    if (Array.isArray(userIds)) {
      const objectIds = userIds
        .map((id) => {
          if (!id) {
            return null;
          }

          if (id instanceof mongoose.Types.ObjectId) {
            return id;
          }

          return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(String(id)) : null;
        })
        .filter(Boolean);

      if (!objectIds.length) {
        return [];
      }

      match.user = { $in: objectIds };
    }

    return PointsLedgerModel.aggregate([
      {
        $match: match,
      },
      {
        $group: {
          _id: '$user',
          points: { $sum: '$points' },
        },
      },
      {
        $sort: {
          points: -1,
        },
      },
      {
        $limit: limit,
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: '$user' },
      {
        $project: {
          _id: 0,
          userId: '$user._id',
          fullName: '$user.fullName',
          role: '$user.role',
          level: '$user.level',
          badges: '$user.badges',
          points: 1,
        },
      },
    ]);
  }

  async listLatest(limit = 20) {
    return PointsLedgerModel.find()
      .populate('user', 'fullName role level')
      .populate('task', 'title')
      .populate('approvedBy', 'fullName role')
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  async listByAuditLogIds(auditLogIds = []) {
    if (!Array.isArray(auditLogIds) || !auditLogIds.length) {
      return [];
    }

    return PointsLedgerModel.find({ auditLog: { $in: auditLogIds } })
      .populate('approvedBy', 'fullName role')
      .sort({ createdAt: -1 });
  }
}
