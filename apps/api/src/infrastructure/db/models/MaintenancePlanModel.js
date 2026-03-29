import mongoose from 'mongoose';
import {
  MaintenanceDurationUnit,
  MaintenancePlanStatus,
  MaintenancePlanType,
  MaintenanceRecurrenceType,
  MaintenanceReminderBefore,
} from '../../../application/services/maintenancePlanService.js';

const scheduledVisitSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      trim: true,
    },
    sequence: {
      type: Number,
      required: true,
      min: 1,
    },
    scheduledDate: {
      type: Date,
      required: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    visitReport: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MaintenanceVisit',
      default: null,
    },
    isAdHoc: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false },
);

const maintenancePlanSchema = new mongoose.Schema(
  {
    customerId: {
      type: String,
      default: '',
      trim: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      default: null,
      index: true,
    },
    workReport: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WorkReport',
      default: null,
      index: true,
    },
    customerName: {
      type: String,
      required: true,
      trim: true,
    },
    projectNumber: {
      type: String,
      default: '',
      trim: true,
    },
    projectName: {
      type: String,
      default: '',
      trim: true,
    },
    location: {
      type: String,
      default: '',
      trim: true,
    },
    phone: {
      type: String,
      default: '',
      trim: true,
    },
    executorName: {
      type: String,
      default: '',
      trim: true,
    },
    completedWorkDate: {
      type: Date,
      default: null,
    },
    maintenanceType: {
      type: String,
      enum: Object.values(MaintenancePlanType),
      required: true,
      index: true,
    },
    freeDurationPreset: {
      type: String,
      default: '',
      trim: true,
    },
    freeDurationValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    freeDurationUnit: {
      type: String,
      enum: [...Object.values(MaintenanceDurationUnit), ''],
      default: '',
    },
    startDate: {
      type: Date,
      required: true,
      index: true,
    },
    endDate: {
      type: Date,
      default: null,
      index: true,
    },
    recurrenceType: {
      type: String,
      enum: Object.values(MaintenanceRecurrenceType),
      required: true,
    },
    customRecurrenceIntervalValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    customRecurrenceIntervalUnit: {
      type: String,
      enum: [...Object.values(MaintenanceDurationUnit), ''],
      default: '',
    },
    customVisitCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    expectedVisits: {
      type: Number,
      default: 0,
      min: 0,
    },
    completedVisits: {
      type: Number,
      default: 0,
      min: 0,
    },
    remainingVisits: {
      type: Number,
      default: 0,
      min: 0,
    },
    nextVisitDate: {
      type: Date,
      default: null,
    },
    lastVisitDate: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: Object.values(MaintenancePlanStatus),
      default: MaintenancePlanStatus.ACTIVE,
      index: true,
    },
    assignedEmployee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
    reminderBefore: {
      type: String,
      enum: Object.values(MaintenanceReminderBefore),
      default: MaintenanceReminderBefore.NONE,
    },
    scheduledVisits: {
      type: [scheduledVisitSchema],
      default: [],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

export const MaintenancePlanModel = mongoose.model('MaintenancePlan', maintenancePlanSchema);
