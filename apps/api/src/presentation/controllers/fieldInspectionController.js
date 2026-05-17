import fs from 'fs/promises';
import path from 'path';
import { FieldInspectionTicketRepository } from '../../infrastructure/db/repositories/FieldInspectionTicketRepository.js';
import { CustomerRepository } from '../../infrastructure/db/repositories/CustomerRepository.js';
import { UserRepository } from '../../infrastructure/db/repositories/UserRepository.js';
import { DailyWorkPlanRepository } from '../../infrastructure/db/repositories/DailyWorkPlanRepository.js';
import { sequenceService } from '../../application/services/sequenceService.js';
import { notificationService } from '../../application/services/notificationService.js';
import { auditService } from '../../application/services/auditService.js';
import {
  buildCustomerSnapshot,
  buildFieldInspectionAttachment,
  buildFieldInspectionWhatsappMessage,
  buildTimelineEntry,
  FieldInspectionStatus,
  fieldInspectionStatusLabelMap,
  normalizeMeasurementRows,
  normalizeRequiredMaterialItems,
  normalizeStringArray,
  parseJsonField,
  toCleanString,
  toDateValue,
} from '../../application/services/fieldInspectionService.js';
import {
  buildTimelineEntry as buildDailyPlanTimelineEntry,
  DailyWorkPlanPriority,
  DailyWorkPlanStatus,
  DailyWorkPlanTaskType,
  formatPlanDateKey,
  toDateOnly,
} from '../../application/services/dailyWorkPlanService.js';
import { buildWhatsAppSendUrl } from '../../shared/attendanceUtils.js';
import { Permission, Roles } from '../../shared/constants.js';
import { hasPermission } from '../../shared/permissions.js';
import { AppError, asyncHandler } from '../../shared/errors.js';
import { buildFieldInspectionPdfBuffer } from '../../infrastructure/reports/fieldInspectionPdfBuilder.js';
import { env } from '../../config/env.js';

const ticketRepository = new FieldInspectionTicketRepository();
const customerRepository = new CustomerRepository();
const userRepository = new UserRepository();
const dailyWorkPlanRepository = new DailyWorkPlanRepository();

const uploadRootDir = path.resolve(process.cwd(), env.uploadsDir);
const toId = (value) => String(value?._id || value?.id || value || '').trim();
const resolvePublicBaseUrl = (req) => {
  if (env.publicBaseUrl) return env.publicBaseUrl;
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const protocol = forwardedProto || req.protocol;
  const host = forwardedHost || req.get('host');
  return `${protocol}://${host}`;
};
const buildFieldInspectionWhatsappUrl = (phone, message) =>
  buildWhatsAppSendUrl(phone, message) || `https://wa.me/?text=${encodeURIComponent(message || '')}`;
const actorLabel = (req) => req.user?.fullName || req.user?.name || 'مستخدم النظام';

const isManager = (user = {}) =>
  user.role === Roles.GENERAL_MANAGER
  || hasPermission(user, Permission.MANAGE_FIELD_INSPECTIONS)
  || hasPermission(user, Permission.CREATE_FIELD_INSPECTIONS);

const canHandle = (user = {}) =>
  isManager(user) || hasPermission(user, Permission.HANDLE_FIELD_INSPECTIONS);

const normalizeRequestFiles = (req) => {
  if (Array.isArray(req.files)) return req.files;
  if (req.files && Array.isArray(req.files.attachments)) return req.files.attachments;
  return [];
};

const serializeTicket = (ticket) => ({
  id: toId(ticket),
  ticketNo: ticket.ticketNo,
  status: ticket.status,
  statusLabel: fieldInspectionStatusLabelMap[ticket.status] || ticket.status,
  customer: ticket.customer,
  customerSnapshot: ticket.customerSnapshot || {},
  serviceType: ticket.serviceType || '',
  requestDescription: ticket.requestDescription || '',
  appointmentAt: ticket.appointmentAt || null,
  appointmentSentAt: ticket.appointmentSentAt || null,
  technicians: ticket.technicians || [],
  notes: ticket.notes || '',
  inspectionStartedAt: ticket.inspectionStartedAt || null,
  inspectionEndedAt: ticket.inspectionEndedAt || null,
  inspectionForm: ticket.inspectionForm || {},
  attachments: ticket.attachments || [],
  report: ticket.report || {},
  linkedDailyWorkPlan: ticket.linkedDailyWorkPlan || null,
  closedAt: ticket.closedAt || null,
  closedByName: ticket.closedByName || '',
  createdBy: ticket.createdBy,
  createdByName: ticket.createdByName || '',
  timeline: ticket.timeline || [],
  createdAt: ticket.createdAt,
  updatedAt: ticket.updatedAt,
});

const assertCanRead = (req, ticket) => {
  if (isManager(req.user)) return;
  const actorId = toId(req.user.id);
  const assigned = (ticket.technicians || []).some((item) => toId(item.user) === actorId);
  if (!assigned) {
    throw new AppError('Field inspection ticket not found', 404);
  }
};

const normalizeTechnicians = async (ids = []) => {
  const userIds = normalizeStringArray(ids);
  if (!userIds.length) return [];
  const users = await userRepository.listByIds(userIds);
  const byId = new Map(users.map((user) => [toId(user), user]));
  return userIds
    .map((userId) => byId.get(userId))
    .filter(Boolean)
    .map((user) => ({
      user: user._id,
      fullName: user.fullName || '',
      role: user.role || '',
    }));
};

const buildFilter = (req) => {
  const filter = {};
  const search = toCleanString(req.query.search);
  const status = toCleanString(req.query.status);
  const serviceType = toCleanString(req.query.serviceType);
  const technician = toCleanString(req.query.technician);
  const customerId = toCleanString(req.query.customerId);

  if (!isManager(req.user)) {
    filter['technicians.user'] = req.user.id;
  }
  if (status) filter.status = status;
  if (serviceType) filter.serviceType = new RegExp(serviceType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (technician) filter['technicians.user'] = technician;
  if (customerId) filter.customer = customerId;
  if (req.query.createdFrom || req.query.createdTo) {
    filter.createdAt = {};
    if (req.query.createdFrom) filter.createdAt.$gte = new Date(req.query.createdFrom);
    if (req.query.createdTo) filter.createdAt.$lte = new Date(req.query.createdTo);
  }
  if (req.query.appointmentFrom || req.query.appointmentTo) {
    filter.appointmentAt = {};
    if (req.query.appointmentFrom) filter.appointmentAt.$gte = new Date(req.query.appointmentFrom);
    if (req.query.appointmentTo) filter.appointmentAt.$lte = new Date(req.query.appointmentTo);
  }
  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { ticketNo: regex },
      { 'customerSnapshot.customerName': regex },
      { 'customerSnapshot.phone': regex },
      { 'customerSnapshot.address': regex },
      { serviceType: regex },
    ];
  }
  return filter;
};

export const listFieldInspectionTickets = asyncHandler(async (req, res) => {
  const tickets = await ticketRepository.list(buildFilter(req), { limit: 1000 });
  res.json({ tickets: tickets.map(serializeTicket) });
});

export const getFieldInspectionTicket = asyncHandler(async (req, res) => {
  const ticket = await ticketRepository.findById(req.params.id);
  if (!ticket) throw new AppError('Field inspection ticket not found', 404);
  assertCanRead(req, ticket);
  res.json({ ticket: serializeTicket(ticket) });
});

export const deleteFieldInspectionTicket = asyncHandler(async (req, res) => {
  if (!isManager(req.user)) throw new AppError('Insufficient permissions', 403);
  const ticket = await ticketRepository.findById(req.params.id);
  if (!ticket) throw new AppError('Field inspection ticket not found', 404);
  await ticketRepository.deleteById(ticket._id);
  await auditService.log({
    actorId: req.user.id,
    action: 'DELETE_FIELD_INSPECTION_TICKET',
    entityType: 'FieldInspectionTicket',
    entityId: ticket._id,
    before: { ticketNo: ticket.ticketNo, status: ticket.status },
    req,
  });
  res.json({ success: true, deletedId: toId(ticket), ticketNo: ticket.ticketNo });
});

export const listFieldInspectionMeta = asyncHandler(async (_req, res) => {
  const users = await userRepository.listForManagement({ includeManager: false, includeInactive: false });
  res.json({
    statuses: fieldInspectionStatusLabelMap,
    technicians: users.map((user) => ({
      id: toId(user),
      fullName: user.fullName || '',
      role: user.role || '',
      jobTitle: user.jobTitle || '',
    })),
  });
});

export const createFieldInspectionTicket = asyncHandler(async (req, res) => {
  if (!isManager(req.user)) throw new AppError('Insufficient permissions', 403);
  const customerId = toCleanString(req.body.customerId || req.body.customer);
  if (!customerId) throw new AppError('customerId is required', 400);
  const customer = await customerRepository.findById(customerId);
  if (!customer) throw new AppError('Customer not found', 404);
  const siteId = toCleanString(req.body.siteId);
  const site = (customer.sites || []).find((item) => toId(item) === siteId) || null;
  const appointmentAt = toDateValue(req.body.appointmentAt);
  const technicians = await normalizeTechnicians(parseJsonField(req.body.technicians, req.body.technicians || []));
  const status = appointmentAt ? FieldInspectionStatus.SCHEDULED : FieldInspectionStatus.AWAITING_SCHEDULE;
  const ticketNo = await sequenceService.next('FIELD_INSPECTION', { prefix: 'FI', digits: 5 });

  let ticket = await ticketRepository.create({
    ticketNo,
    status,
    customer: customer._id,
    customerSnapshot: buildCustomerSnapshot(customer, site),
    serviceType: toCleanString(req.body.serviceType),
    requestDescription: toCleanString(req.body.requestDescription),
    appointmentAt,
    technicians,
    notes: toCleanString(req.body.notes),
    createdBy: req.user.id,
    createdByName: actorLabel(req),
    timeline: [
      buildTimelineEntry({
        type: 'FIELD_INSPECTION_CREATED',
        actor: req.user.id,
        actorName: actorLabel(req),
        actorRole: req.user.role,
        message: 'تم إنشاء تذكرة كشف ميداني.',
      }),
    ],
  });

  await customerRepository.updateById(customer._id, { $addToSet: { linkedFieldInspections: ticket._id } });

  if (technicians.length) {
    await notificationService.notifyUsers(technicians.map((item) => item.user), {
      type: 'FIELD_INSPECTION_ASSIGNED',
      titleAr: 'موعد كشف ميداني جديد',
      messageAr: `تم إسناد تذكرة الكشف ${ticket.ticketNo} إليك.`,
      metadata: { ticketId: toId(ticket), ticketNo: ticket.ticketNo, appointmentAt },
    });
  }

  await auditService.log({
    actorId: req.user.id,
    action: 'FIELD_INSPECTION_CREATED',
    entityType: 'FIELD_INSPECTION_TICKET',
    entityId: ticket._id,
    after: { ticketNo, status },
    req,
  });

  ticket = await ticketRepository.findById(ticket._id);
  res.status(201).json({ ticket: serializeTicket(ticket) });
});

export const updateFieldInspectionTicket = asyncHandler(async (req, res) => {
  const ticket = await ticketRepository.findById(req.params.id);
  if (!ticket) throw new AppError('Field inspection ticket not found', 404);
  if (!isManager(req.user)) throw new AppError('Insufficient permissions', 403);

  const appointmentAt = req.body.appointmentAt !== undefined ? toDateValue(req.body.appointmentAt) : ticket.appointmentAt;
  const technicians = req.body.technicians !== undefined
    ? await normalizeTechnicians(parseJsonField(req.body.technicians, req.body.technicians || []))
    : ticket.technicians;
  const status = ticket.status === FieldInspectionStatus.AWAITING_SCHEDULE && appointmentAt
    ? FieldInspectionStatus.SCHEDULED
    : ticket.status;

  const updated = await ticketRepository.updateById(ticket._id, {
    serviceType: req.body.serviceType !== undefined ? toCleanString(req.body.serviceType) : ticket.serviceType,
    requestDescription: req.body.requestDescription !== undefined ? toCleanString(req.body.requestDescription) : ticket.requestDescription,
    appointmentAt,
    technicians,
    notes: req.body.notes !== undefined ? toCleanString(req.body.notes) : ticket.notes,
    status,
    $push: {
      timeline: buildTimelineEntry({
        type: 'FIELD_INSPECTION_UPDATED',
        actor: req.user.id,
        actorName: actorLabel(req),
        actorRole: req.user.role,
        message: 'تم تحديث بيانات تذكرة الكشف.',
      }),
    },
  });
  res.json({ ticket: serializeTicket(updated) });
});

export const sendFieldInspectionAppointment = asyncHandler(async (req, res) => {
  const ticket = await ticketRepository.findById(req.params.id);
  if (!ticket) throw new AppError('Field inspection ticket not found', 404);
  if (!isManager(req.user)) throw new AppError('Insufficient permissions', 403);
  if (!ticket.appointmentAt) throw new AppError('Appointment date is required', 400);

  const updated = await ticketRepository.updateById(ticket._id, {
    appointmentSentAt: new Date(),
    status: FieldInspectionStatus.SCHEDULED,
    $push: {
      timeline: buildTimelineEntry({
        type: 'FIELD_INSPECTION_APPOINTMENT_SENT',
        actor: req.user.id,
        actorName: actorLabel(req),
        actorRole: req.user.role,
        message: 'تم تجهيز تفاصيل موعد الكشف للإرسال.',
      }),
    },
  });

  const technicianIds = (updated.technicians || []).map((item) => toId(item.user)).filter(Boolean);
  if (technicianIds.length) {
    await notificationService.notifyUsers(technicianIds, {
      type: 'FIELD_INSPECTION_APPOINTMENT',
      titleAr: 'تفاصيل موعد كشف ميداني',
      messageAr: `موعد تذكرة الكشف ${updated.ticketNo}: ${new Date(updated.appointmentAt).toLocaleString('ar-IQ', { timeZone: 'Asia/Baghdad' })}.`,
      metadata: { ticketId: toId(updated), ticketNo: updated.ticketNo, appointmentAt: updated.appointmentAt },
    });
  }

  const phone = updated.customerSnapshot?.whatsapp || updated.customerSnapshot?.phone || '';
  const message = buildFieldInspectionWhatsappMessage(updated);
  res.json({ ticket: serializeTicket(updated), whatsappUrl: buildFieldInspectionWhatsappUrl(phone, message), message });
});

export const startFieldInspection = asyncHandler(async (req, res) => {
  const ticket = await ticketRepository.findById(req.params.id);
  if (!ticket) throw new AppError('Field inspection ticket not found', 404);
  assertCanRead(req, ticket);
  if (!canHandle(req.user)) throw new AppError('Insufficient permissions', 403);
  if (![FieldInspectionStatus.SCHEDULED, FieldInspectionStatus.AWAITING_SCHEDULE].includes(ticket.status)) {
    throw new AppError('Ticket cannot be started from current status', 409);
  }

  const updated = await ticketRepository.updateById(ticket._id, {
    status: FieldInspectionStatus.IN_INSPECTION,
    inspectionStartedAt: ticket.inspectionStartedAt || new Date(),
    $push: {
      timeline: buildTimelineEntry({
        type: 'FIELD_INSPECTION_STARTED',
        actor: req.user.id,
        actorName: actorLabel(req),
        actorRole: req.user.role,
        message: 'بدأ الفني الكشف الميداني.',
      }),
    },
  });
  res.json({ ticket: serializeTicket(updated) });
});

export const saveFieldInspectionForm = asyncHandler(async (req, res) => {
  const ticket = await ticketRepository.findById(req.params.id);
  if (!ticket) throw new AppError('Field inspection ticket not found', 404);
  assertCanRead(req, ticket);
  if (!canHandle(req.user)) throw new AppError('Insufficient permissions', 403);
  const files = normalizeRequestFiles(req);
  const photoAttachments = files
    .map((file) => buildFieldInspectionAttachment(file, req.user, String(file.mimetype || '').startsWith('image/') ? 'photo' : 'attachment'));
  const currentForm = ticket.inspectionForm?.toObject?.() || ticket.inspectionForm || {};
  const serviceFields = parseJsonField(req.body.serviceFields, currentForm.serviceFields || {});
  const materials = parseJsonField(req.body.materials, currentForm.materials || []);
  const customMaterials = parseJsonField(req.body.customMaterials, currentForm.customMaterials || []);
  const requiredMaterialItems = parseJsonField(req.body.requiredMaterialItems, currentForm.requiredMaterialItems || []);
  const measurements = parseJsonField(req.body.measurements, currentForm.measurements || []);
  const customerSignature = parseJsonField(req.body.customerSignature, currentForm.customerSignature || {});

  const form = {
    ...currentForm,
    serviceType: toCleanString(req.body.serviceType ?? currentForm.serviceType ?? ticket.serviceType),
    requestType: toCleanString(req.body.requestType ?? currentForm.requestType),
    customRequestType: toCleanString(req.body.customRequestType ?? currentForm.customRequestType),
    siteStatus: toCleanString(req.body.siteStatus ?? currentForm.siteStatus),
    customSiteStatus: toCleanString(req.body.customSiteStatus ?? currentForm.customSiteStatus),
    urgency: toCleanString(req.body.urgency ?? currentForm.urgency),
    serviceFields: serviceFields && typeof serviceFields === 'object' && !Array.isArray(serviceFields) ? serviceFields : {},
    materials: normalizeStringArray(materials),
    customMaterials: normalizeStringArray(customMaterials),
    inspectionResult: toCleanString(req.body.inspectionResult ?? currentForm.inspectionResult),
    technicianRecommendation: toCleanString(req.body.technicianRecommendation ?? currentForm.technicianRecommendation),
    siteCondition: toCleanString(req.body.siteCondition ?? ticket.inspectionForm?.siteCondition),
    customerRequirements: toCleanString(req.body.customerRequirements ?? ticket.inspectionForm?.customerRequirements),
    requiredWorkType: toCleanString(req.body.requiredWorkType ?? ticket.inspectionForm?.requiredWorkType),
    existingSystems: toCleanString(req.body.existingSystems ?? ticket.inspectionForm?.existingSystems),
    proposedWorks: toCleanString(req.body.proposedWorks ?? ticket.inspectionForm?.proposedWorks),
    requiredMaterials: toCleanString(req.body.requiredMaterials ?? ticket.inspectionForm?.requiredMaterials),
    technicalMeasurements: toCleanString(req.body.technicalMeasurements ?? ticket.inspectionForm?.technicalMeasurements),
    finalRecommendations: toCleanString(req.body.finalRecommendations ?? ticket.inspectionForm?.finalRecommendations),
    generalNotes: toCleanString(req.body.generalNotes ?? ticket.inspectionForm?.generalNotes),
    requiredMaterialItems: normalizeRequiredMaterialItems(requiredMaterialItems),
    measurements: normalizeMeasurementRows(measurements),
    measurementEmptyReason: toCleanString(req.body.measurementEmptyReason ?? currentForm.measurementEmptyReason),
    customerSignature: {
      customerName: toCleanString(customerSignature.customerName ?? currentForm.customerSignature?.customerName),
      phone: toCleanString(customerSignature.phone ?? currentForm.customerSignature?.phone),
      signedAt: toDateValue(customerSignature.signedAt ?? currentForm.customerSignature?.signedAt),
      technicianName: toCleanString(customerSignature.technicianName ?? currentForm.customerSignature?.technicianName),
      technicianSignature: toCleanString(customerSignature.technicianSignature ?? currentForm.customerSignature?.technicianSignature),
      imageDataUrl: toCleanString(customerSignature.imageDataUrl ?? currentForm.customerSignature?.imageDataUrl),
      emptyReason: toCleanString(customerSignature.emptyReason ?? currentForm.customerSignature?.emptyReason),
    },
    completedBy: req.user.id,
    completedByName: actorLabel(req),
  };
  const nextServiceType = form.serviceType || ticket.serviceType;

  const updated = await ticketRepository.updateById(ticket._id, {
    serviceType: nextServiceType,
    inspectionForm: form,
    ...(photoAttachments.length ? { $push: { attachments: { $each: photoAttachments }, timeline: buildTimelineEntry({
      type: 'FIELD_INSPECTION_FORM_SAVED',
      actor: req.user.id,
      actorName: actorLabel(req),
      actorRole: req.user.role,
      message: 'تم حفظ استمارة الكشف والمرفقات.',
    }) } } : { $push: { timeline: buildTimelineEntry({
      type: 'FIELD_INSPECTION_FORM_SAVED',
      actor: req.user.id,
      actorName: actorLabel(req),
      actorRole: req.user.role,
      message: 'تم حفظ استمارة الكشف.',
    }) } }),
  });
  res.json({ ticket: serializeTicket(updated) });
});

export const completeFieldInspection = asyncHandler(async (req, res) => {
  const ticket = await ticketRepository.findById(req.params.id);
  if (!ticket) throw new AppError('Field inspection ticket not found', 404);
  assertCanRead(req, ticket);
  if (!canHandle(req.user)) throw new AppError('Insufficient permissions', 403);
  if (ticket.status !== FieldInspectionStatus.IN_INSPECTION) {
    throw new AppError('Ticket is not in inspection', 409);
  }
  const currentForm = ticket.inspectionForm?.toObject?.() || ticket.inspectionForm || {};
  if (!(currentForm.requiredMaterialItems || []).length && !toCleanString(currentForm.requiredMaterials)) {
    throw new AppError('Required material items are required', 400);
  }
  if (!toCleanString(currentForm.customerSignature?.imageDataUrl) && !toCleanString(currentForm.customerSignature?.emptyReason)) {
    throw new AppError('Customer signature is required or must have an empty reason', 400);
  }

  const pdfBuffer = await buildFieldInspectionPdfBuffer(
    { ticket, generatedAt: new Date() },
    { publicBaseUrl: resolvePublicBaseUrl(req), uploadRootDir },
  );
  await fs.mkdir(uploadRootDir, { recursive: true });
  const fileName = `field-inspection-${ticket.ticketNo}-${Date.now()}.pdf`;
  await fs.writeFile(path.join(uploadRootDir, fileName), pdfBuffer);

  const updated = await ticketRepository.updateById(ticket._id, {
    status: FieldInspectionStatus.INSPECTION_COMPLETED,
    inspectionEndedAt: new Date(),
    report: {
      fileName,
      publicUrl: `/uploads/${fileName}`,
      generatedAt: new Date(),
      sentToCustomerAt: ticket.report?.sentToCustomerAt || null,
    },
    $push: {
      attachments: buildFieldInspectionAttachment({
        filename: fileName,
        originalname: fileName,
        mimetype: 'application/pdf',
        size: pdfBuffer.length,
        path: path.join(uploadRootDir, fileName),
      }, req.user, 'report'),
      timeline: buildTimelineEntry({
        type: 'FIELD_INSPECTION_COMPLETED',
        actor: req.user.id,
        actorName: actorLabel(req),
        actorRole: req.user.role,
        message: 'تم إنهاء الكشف وإصدار تقرير PDF.',
      }),
    },
  });
  res.json({ ticket: serializeTicket(updated) });
});

export const downloadFieldInspectionReport = asyncHandler(async (req, res) => {
  const ticket = await ticketRepository.findById(req.params.id);
  if (!ticket) throw new AppError('Field inspection ticket not found', 404);
  assertCanRead(req, ticket);
  if (!ticket.inspectionForm || !ticket.inspectionEndedAt) {
    throw new AppError('Inspection report is not generated yet', 400);
  }

  const pdfBuffer = await buildFieldInspectionPdfBuffer(
    { ticket, generatedAt: new Date() },
    { publicBaseUrl: resolvePublicBaseUrl(req), uploadRootDir },
  );
  const fileName = `field-inspection-${ticket.ticketNo || toId(ticket)}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(pdfBuffer);
});

export const sendFieldInspectionReport = asyncHandler(async (req, res) => {
  const ticket = await ticketRepository.findById(req.params.id);
  if (!ticket) throw new AppError('Field inspection ticket not found', 404);
  assertCanRead(req, ticket);
  if (!ticket.report?.publicUrl) throw new AppError('Inspection report is not generated yet', 400);
  const updated = await ticketRepository.updateById(ticket._id, {
    'report.sentToCustomerAt': new Date(),
    $push: {
      timeline: buildTimelineEntry({
        type: 'FIELD_INSPECTION_REPORT_SENT',
        actor: req.user.id,
        actorName: actorLabel(req),
        actorRole: req.user.role,
        message: 'تم تجهيز تقرير الكشف للإرسال إلى الزبون.',
      }),
    },
  });
  const publicBaseUrl = resolvePublicBaseUrl(req);
  const customerName = updated.customerSnapshot?.customerName || 'زبوننا الكريم';
  const reportUrl = `${publicBaseUrl}${updated.report.publicUrl}`;
  const message = [
    `مرحبًا ${customerName}`,
    'تحية طيبة من شركة Delta Plus،',
    'نود إعلامكم بأن الرابط أدناه يحتوي على ملف الكشف الميداني المسجل لطلبكم، ويمكنكم الاطلاع على تفاصيل الكشف والقياسات والملاحظات الفنية من خلاله.',
    `رقم تذكرة الكشف: ${updated.ticketNo}`,
    `رابط ملف الكشف الميداني: ${reportUrl}`,
    'شاكرين ثقتكم بنا.',
  ].join('\n');
  const phone = updated.customerSnapshot?.whatsapp || updated.customerSnapshot?.phone || '';
  res.json({ ticket: serializeTicket(updated), whatsappUrl: buildFieldInspectionWhatsappUrl(phone, message), message });
});

export const activateFieldInspectionDailyPlan = asyncHandler(async (req, res) => {
  const ticket = await ticketRepository.findById(req.params.id);
  if (!ticket) throw new AppError('Field inspection ticket not found', 404);
  if (!isManager(req.user)) throw new AppError('Insufficient permissions', 403);
  if (ticket.linkedDailyWorkPlan) throw new AppError('Daily work plan already activated', 409);
  if (![FieldInspectionStatus.AWAITING_DAILY_PLAN, FieldInspectionStatus.INSPECTION_COMPLETED].includes(ticket.status)) {
    throw new AppError('Inspection must be completed before activating daily plan', 409);
  }

  const planDate = toDateOnly(new Date());
  const form = ticket.inspectionForm || {};
  const description = [
    ticket.requestDescription,
    form.proposedWorks ? `الأعمال المقترحة: ${form.proposedWorks}` : '',
    form.requiredMaterials ? `المواد المطلوبة: ${form.requiredMaterials}` : '',
    form.technicalMeasurements ? `ملاحظات فنية: ${form.technicalMeasurements}` : '',
    form.finalRecommendations ? `التوصيات: ${form.finalRecommendations}` : '',
  ].filter(Boolean).join('\n');
  const inspectionReportAttachments = (ticket.attachments || [])
    .filter((item) => item.kind === 'report')
    .map((item) => ({
      fileName: item.fileName || '',
      originalName: item.originalName || item.fileName || `field-inspection-${ticket.ticketNo}.pdf`,
      mimeType: item.mimeType || 'application/pdf',
      size: Number(item.size || 0),
      storagePath: item.storagePath || '',
      publicUrl: item.publicUrl || '',
      uploadedBy: req.user.id,
      uploadedByName: actorLabel(req),
      uploadedAt: new Date(),
      comment: `ملف الكشف الأصلي للتذكرة ${ticket.ticketNo}`,
    }));
  if (!inspectionReportAttachments.length && ticket.report?.fileName) {
    inspectionReportAttachments.push({
      fileName: ticket.report.fileName,
      originalName: ticket.report.fileName,
      mimeType: 'application/pdf',
      size: 0,
      storagePath: path.join(uploadRootDir, ticket.report.fileName),
      publicUrl: ticket.report.publicUrl || `/uploads/${ticket.report.fileName}`,
      uploadedBy: req.user.id,
      uploadedByName: actorLabel(req),
      uploadedAt: ticket.report.generatedAt || new Date(),
      comment: `ملف الكشف الأصلي للتذكرة ${ticket.ticketNo}`,
    });
  }

  const plan = await dailyWorkPlanRepository.create({
    title: `تنفيذ كشف ${ticket.ticketNo} - ${ticket.customerSnapshot?.customerName || ''}`,
    description,
    customer: ticket.customer?._id || ticket.customer,
    customerName: ticket.customerSnapshot?.customerName || '',
    customerSnapshot: ticket.customerSnapshot,
    location: ticket.customerSnapshot?.address || '',
    planDate,
    startTime: '',
    expectedEndTime: '',
    dueAt: null,
    priority: DailyWorkPlanPriority.MEDIUM,
    taskType: DailyWorkPlanTaskType.INSPECTION,
    status: DailyWorkPlanStatus.NEW,
    assignees: [],
    createdBy: req.user.id,
    supervisor: req.user.id,
    adminNotes: `مرتبط بتذكرة الكشف ${ticket.ticketNo}`,
    attachments: inspectionReportAttachments,
    fieldInspection: {
      ticket: ticket._id,
      ticketNo: ticket.ticketNo,
    },
    timeline: [
      buildDailyPlanTimelineEntry({
        type: 'DAILY_WORK_PLAN_CREATED_FROM_FIELD_INSPECTION',
        actor: req.user.id,
        actorName: actorLabel(req),
        actorRole: req.user.role,
        message: `تم إنشاء البلان من تذكرة الكشف ${ticket.ticketNo}.`,
        metadata: { fieldInspectionTicketId: toId(ticket), ticketNo: ticket.ticketNo },
      }),
    ],
  });

  await customerRepository.updateById(ticket.customer?._id || ticket.customer, {
    $addToSet: { linkedDailyWorkPlans: plan._id, linkedFieldInspections: ticket._id },
  });

  const updated = await ticketRepository.updateById(ticket._id, {
    status: FieldInspectionStatus.IN_EXECUTION,
    linkedDailyWorkPlan: plan._id,
    $push: {
      timeline: buildTimelineEntry({
        type: 'FIELD_INSPECTION_DAILY_PLAN_ACTIVATED',
        actor: req.user.id,
        actorName: actorLabel(req),
        actorRole: req.user.role,
        message: 'تم تفعيل بلان عمل يومي مرتبط بتذكرة الكشف.',
        metadata: { planId: toId(plan) },
      }),
    },
  });

  res.status(201).json({ ticket: serializeTicket(updated), plan });
});

export const closeFieldInspectionTicket = asyncHandler(async (req, res) => {
  const ticket = await ticketRepository.findById(req.params.id);
  if (!ticket) throw new AppError('Field inspection ticket not found', 404);
  if (!isManager(req.user)) throw new AppError('Insufficient permissions', 403);
  if (!ticket.linkedDailyWorkPlan) throw new AppError('Daily work plan must be activated first', 409);

  const updated = await ticketRepository.updateById(ticket._id, {
    status: FieldInspectionStatus.CLOSED,
    closedAt: new Date(),
    closedBy: req.user.id,
    closedByName: actorLabel(req),
    $push: {
      timeline: buildTimelineEntry({
        type: 'FIELD_INSPECTION_CLOSED',
        actor: req.user.id,
        actorName: actorLabel(req),
        actorRole: req.user.role,
        message: 'تم إغلاق تذكرة الكشف نهائيًا.',
      }),
    },
  });
  res.json({ ticket: serializeTicket(updated) });
});
