import crypto from 'crypto';
import {
  buildCustomerAttachment,
  CustomerStatus,
  CustomerType,
  normalizePhone,
  toCleanString,
} from './customerService.js';

export const CustomerFormStatus = {
  NEW: 'NEW',
  PENDING_REVIEW: 'PENDING_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  SAVED_TO_CUSTOMERS: 'SAVED_TO_CUSTOMERS',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
};

export const customerFormStatusLabelMap = {
  [CustomerFormStatus.NEW]: 'جديد',
  [CustomerFormStatus.PENDING_REVIEW]: 'بانتظار المراجعة',
  [CustomerFormStatus.APPROVED]: 'معتمد',
  [CustomerFormStatus.REJECTED]: 'مرفوض',
  [CustomerFormStatus.SAVED_TO_CUSTOMERS]: 'محفوظ في الزبائن',
  [CustomerFormStatus.CANCELLED]: 'ملغى',
  [CustomerFormStatus.EXPIRED]: 'منتهي الصلاحية',
};

export const generateCustomerFormToken = () => crypto.randomBytes(32).toString('hex');

export const normalizeCustomerFormPayload = (body = {}) => {
  const phone = toCleanString(body.phone);
  const whatsapp = toCleanString(body.whatsapp || phone);
  const customerType = Object.values(CustomerType).includes(body.customerType)
    ? body.customerType
    : CustomerType.COMPANY;

  return {
    customerName: toCleanString(body.customerName || body.name),
    customerType,
    responsibleName: toCleanString(body.responsibleName),
    position: toCleanString(body.position),
    phone,
    normalizedPhone: normalizePhone(phone),
    whatsapp,
    normalizedWhatsapp: normalizePhone(whatsapp),
    email: toCleanString(body.email).toLowerCase(),
    province: toCleanString(body.province),
    city: toCleanString(body.city),
    address: toCleanString(body.address),
    mapUrl: toCleanString(body.mapUrl),
    requestedService: toCleanString(body.requestedService),
    notes: toCleanString(body.notes),
  };
};

export const buildCustomerPayloadFromForm = (formRequest, actor = {}) => {
  const data = normalizeCustomerFormPayload(formRequest?.data || {});
  return {
    name: data.customerName,
    customerType: data.customerType,
    phone: data.phone,
    normalizedPhone: data.normalizedPhone,
    whatsapp: data.whatsapp,
    normalizedWhatsapp: data.normalizedWhatsapp,
    email: data.email,
    province: data.province,
    address: [data.city, data.address].filter(Boolean).join(' - '),
    mapUrl: data.mapUrl,
    notes: [data.requestedService ? `الخدمة المطلوبة: ${data.requestedService}` : '', data.notes].filter(Boolean).join('\n'),
    status: CustomerStatus.NEW,
    contactPersons: data.responsibleName
      ? [{
          name: data.responsibleName,
          position: data.position,
          phone: data.phone,
          whatsapp: data.whatsapp,
          isDecisionMaker: true,
        }]
      : [],
    sites: data.address || data.city
      ? [{
          name: data.city || data.province || 'الموقع الرئيسي',
          address: [data.city, data.address].filter(Boolean).join(' - '),
          mapUrl: data.mapUrl,
          managerName: data.responsibleName,
          managerPhone: data.phone,
          notes: data.requestedService,
        }]
      : [],
    attachments: (formRequest.attachments || []).map((attachment) => ({
      fileName: attachment.fileName,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      size: attachment.size,
      storagePath: attachment.storagePath,
      publicUrl: attachment.publicUrl,
      uploadedBy: actor.id || actor._id || null,
      uploadedByName: actor.fullName || actor.name || '',
      uploadedAt: new Date(),
      comment: 'مرفق من استمارة الزبون',
    })),
    formSubmissions: [{
      formRequest: formRequest._id,
      sentAt: formRequest.sentAt,
      sentBy: formRequest.sentBy,
      sentByName: formRequest.sentByName,
      status: CustomerFormStatus.SAVED_TO_CUSTOMERS,
      approvedAt: new Date(),
      attachments: formRequest.attachments || [],
    }],
    createdBy: actor.id || actor._id,
    lastModifiedBy: actor.id || actor._id,
    lastModifiedByName: actor.fullName || actor.name || '',
    lastModifiedAt: new Date(),
  };
};

export const buildCustomerFormAttachment = (file) => buildCustomerAttachment(file, {}, 'مرفق من استمارة الزبون');
