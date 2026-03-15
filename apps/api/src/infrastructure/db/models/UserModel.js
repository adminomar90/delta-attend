import mongoose from 'mongoose';
import { Permission, Roles } from '../../../shared/constants.js';

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    employeeCode: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true,
      trim: true,
    },
    personalEmail: {
      type: String,
      lowercase: true,
      trim: true,
      default: '',
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: Object.values(Roles),
      required: true,
    },
    customPermissions: {
      type: [String],
      enum: Object.values(Permission),
      default: [],
    },
    avatarUrl: {
      type: String,
      default: '',
      trim: true,
    },
    phone: {
      type: String,
      default: '',
      trim: true,
    },
    dateOfBirth: Date,
    gender: {
      type: String,
      enum: ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'],
      default: 'PREFER_NOT_TO_SAY',
    },
    maritalStatus: {
      type: String,
      enum: ['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'UNSPECIFIED'],
      default: 'UNSPECIFIED',
    },
    nationalId: {
      type: String,
      default: '',
      trim: true,
    },
    address: {
      country: {
        type: String,
        default: '',
        trim: true,
      },
      city: {
        type: String,
        default: '',
        trim: true,
      },
      street: {
        type: String,
        default: '',
        trim: true,
      },
      postalCode: {
        type: String,
        default: '',
        trim: true,
      },
    },
    emergencyContact: {
      name: {
        type: String,
        default: '',
        trim: true,
      },
      phone: {
        type: String,
        default: '',
        trim: true,
      },
      relation: {
        type: String,
        default: '',
        trim: true,
      },
    },
    hireDate: Date,
    employmentType: {
      type: String,
      enum: ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'],
      default: 'FULL_TIME',
    },
    department: {
      type: String,
      default: 'General',
      trim: true,
    },
    jobTitle: {
      type: String,
      default: '',
      trim: true,
    },
    specialization: {
      type: String,
      default: '',
      trim: true,
    },
    manager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    pointsTotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    level: {
      type: Number,
      default: 1,
      min: 1,
    },
    badges: {
      type: [String],
      default: [],
    },
    team: {
      type: String,
      default: 'Delta Plus',
      trim: true,
    },
    workMinutesTotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    workSessionsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastAttendanceAt: Date,
    lastCheckInAt: Date,
    lastCheckOutAt: Date,
    active: {
      type: Boolean,
      default: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    forcePasswordChange: {
      type: Boolean,
      default: false,
    },
    authFailureCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lockedUntil: Date,
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    otpCodeHash: {
      type: String,
      default: '',
    },
    otpExpiresAt: Date,
    sessionVersion: {
      type: Number,
      default: 1,
      min: 1,
    },
    lastLoginAt: Date,
  },
  {
    timestamps: true,
  },
);

export const UserModel = mongoose.model('User', userSchema);
