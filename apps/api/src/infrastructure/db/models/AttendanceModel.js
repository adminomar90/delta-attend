import mongoose from 'mongoose';

const locationSchema = new mongoose.Schema(
  {
    latitude: {
      type: Number,
      required: true,
    },
    longitude: {
      type: Number,
      required: true,
    },
    accuracyMeters: {
      type: Number,
      default: null,
    },
  },
  { _id: false },
);

const attendanceSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    employeeName: {
      type: String,
      required: true,
      trim: true,
    },
    employeeCode: {
      type: String,
      default: '',
      trim: true,
    },
    workSite: {
      name: {
        type: String,
        required: true,
      },
      latitude: {
        type: Number,
        required: true,
      },
      longitude: {
        type: Number,
        required: true,
      },
      radiusMeters: {
        type: Number,
        required: true,
      },
    },
    checkInAt: {
      type: Date,
      required: true,
      index: true,
    },
    checkInLocation: {
      type: locationSchema,
      required: true,
    },
    checkInDistanceMeters: {
      type: Number,
      required: true,
    },
    checkOutAt: {
      type: Date,
      default: null,
    },
    checkOutLocation: {
      type: locationSchema,
      default: null,
    },
    checkOutDistanceMeters: {
      type: Number,
      default: null,
    },
    durationMinutes: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['OPEN', 'CLOSED'],
      default: 'OPEN',
      index: true,
    },
    approvalStatus: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
      index: true,
    },
    approvalNote: {
      type: String,
      default: '',
      trim: true,
    },
    rejectionReason: {
      type: String,
      default: '',
      trim: true,
    },
    pointsAwarded: {
      type: Number,
      default: 0,
      min: 0,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

export const AttendanceModel = mongoose.model('Attendance', attendanceSchema);
