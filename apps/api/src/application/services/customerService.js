const normalizeLocalizedDigits = (value) =>
  String(value ?? '')
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));

export const CustomerStatus = {
  NEW: 'NEW',
  ACTIVE: 'ACTIVE',
  STOPPED: 'STOPPED',
  VIP: 'VIP',
};

export const CustomerType = {
  COMPANY: 'COMPANY',
  INDIVIDUAL: 'INDIVIDUAL',
  INSTITUTION: 'INSTITUTION',
  GOVERNMENT: 'GOVERNMENT',
  PROJECT: 'PROJECT',
  OTHER: 'OTHER',
};

export const FollowUpType = {
  CALL: 'CALL',
  WHATSAPP: 'WHATSAPP',
  VISIT: 'VISIT',
  QUOTATION: 'QUOTATION',
  MAINTENANCE: 'MAINTENANCE',
};

export const FollowUpStatus = {
  OPEN: 'OPEN',
  WAITING: 'WAITING',
  DONE: 'DONE',
  CANCELLED: 'CANCELLED',
};

export const normalizePhone = (value) => {
  const digits = normalizeLocalizedDigits(value).replace(/[^\d+]/g, '');
  if (!digits) return '';
  const compact = digits.replace(/[^\d]/g, '');
  if (compact.startsWith('00964')) return compact.slice(2);
  if (compact.startsWith('964')) return compact;
  if (compact.startsWith('0')) return `964${compact.slice(1)}`;
  if (compact.length === 10 && compact.startsWith('7')) return `964${compact}`;
  return compact;
};

export const toCleanString = (value) => {
  if (value === undefined || value === null) return '';
  return String(value).trim();
};

export const toDateValue = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const parseJsonField = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

export const customerStatusLabelMap = {
  [CustomerStatus.NEW]: 'جديد',
  [CustomerStatus.ACTIVE]: 'فعال',
  [CustomerStatus.STOPPED]: 'متوقف',
  [CustomerStatus.VIP]: 'VIP',
};

export const customerTypeLabelMap = {
  [CustomerType.COMPANY]: 'شركة',
  [CustomerType.INDIVIDUAL]: 'فرد',
  [CustomerType.INSTITUTION]: 'مؤسسة',
  [CustomerType.GOVERNMENT]: 'جهة حكومية',
  [CustomerType.PROJECT]: 'مشروع',
  [CustomerType.OTHER]: 'أخرى',
};

export const followUpTypeLabelMap = {
  [FollowUpType.CALL]: 'اتصال',
  [FollowUpType.WHATSAPP]: 'واتساب',
  [FollowUpType.VISIT]: 'زيارة',
  [FollowUpType.QUOTATION]: 'عرض سعر',
  [FollowUpType.MAINTENANCE]: 'صيانة',
};

export const followUpStatusLabelMap = {
  [FollowUpStatus.OPEN]: 'مفتوحة',
  [FollowUpStatus.WAITING]: 'بانتظار إجراء',
  [FollowUpStatus.DONE]: 'منجزة',
  [FollowUpStatus.CANCELLED]: 'ملغاة',
};

export const buildCustomerAttachment = (file, actor = {}, comment = '') => ({
  fileName: file.filename || '',
  originalName: file.originalname || file.filename || '',
  mimeType: file.mimetype || '',
  size: Number(file.size || 0),
  storagePath: file.path || '',
  publicUrl: file.filename ? `/uploads/${file.filename}` : '',
  uploadedBy: actor.id || actor._id || null,
  uploadedByName: actor.fullName || actor.name || '',
  uploadedAt: new Date(),
  comment: toCleanString(comment),
});

export const createCustomerSnapshot = (customer = {}, site = null) => ({
  customerId: customer._id || customer.id || null,
  customerName: customer.name || '',
  customerType: customer.customerType || '',
  phone: customer.phone || '',
  whatsapp: customer.whatsapp || customer.phone || '',
  email: customer.email || '',
  province: customer.province || '',
  address: site?.address || customer.address || '',
  mapUrl: site?.mapUrl || customer.mapUrl || '',
  siteId: site?._id || site?.id || null,
  siteName: site?.name || '',
  siteManagerName: site?.managerName || '',
  siteManagerPhone: site?.managerPhone || '',
});
