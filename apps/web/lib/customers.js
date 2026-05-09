'use client';

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

export const customerStatusOptions = [
  [CustomerStatus.NEW, 'جديد'],
  [CustomerStatus.ACTIVE, 'فعال'],
  [CustomerStatus.STOPPED, 'متوقف'],
  [CustomerStatus.VIP, 'VIP'],
];

export const customerTypeOptions = [
  [CustomerType.COMPANY, 'شركة'],
  [CustomerType.INDIVIDUAL, 'فرد'],
  [CustomerType.INSTITUTION, 'مؤسسة'],
  [CustomerType.GOVERNMENT, 'جهة حكومية'],
  [CustomerType.PROJECT, 'مشروع'],
  [CustomerType.OTHER, 'أخرى'],
];

export const followUpTypeOptions = [
  [FollowUpType.CALL, 'اتصال'],
  [FollowUpType.WHATSAPP, 'واتساب'],
  [FollowUpType.VISIT, 'زيارة'],
  [FollowUpType.QUOTATION, 'عرض سعر'],
  [FollowUpType.MAINTENANCE, 'صيانة'],
];

export const followUpStatusOptions = [
  [FollowUpStatus.OPEN, 'مفتوحة'],
  [FollowUpStatus.WAITING, 'بانتظار إجراء'],
  [FollowUpStatus.DONE, 'منجزة'],
  [FollowUpStatus.CANCELLED, 'ملغاة'],
];

export const customerStatusLabelMap = Object.fromEntries(customerStatusOptions);
export const customerTypeLabelMap = Object.fromEntries(customerTypeOptions);
export const followUpTypeLabelMap = Object.fromEntries(followUpTypeOptions);
export const followUpStatusLabelMap = Object.fromEntries(followUpStatusOptions);

export const normalizeLocalizedDigits = (value) =>
  String(value ?? '')
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));

export const normalizePhoneForWa = (value) => {
  const digits = normalizeLocalizedDigits(value).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00964')) return digits.slice(2);
  if (digits.startsWith('964')) return digits;
  if (digits.startsWith('0')) return `964${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith('7')) return `964${digits}`;
  return digits;
};

export const buildTelHref = (phone) => {
  const value = normalizeLocalizedDigits(phone).replace(/[^\d+]/g, '');
  return value ? `tel:${value}` : '';
};

export const buildWhatsappHref = (phone, message = 'السلام عليكم، معكم شركة دلتا بلس بخصوص طلبكم.') => {
  const normalized = normalizePhoneForWa(phone);
  if (!normalized) return '';
  const params = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${normalized}${params}`;
};

export const createEmptyCustomerFilters = () => ({
  search: '',
  province: '',
  status: '',
  phone: '',
});

export const createCustomerFormDefaults = (customer = null) => ({
  name: customer?.name || '',
  customerType: customer?.customerType || CustomerType.COMPANY,
  phone: customer?.phone || '',
  whatsapp: customer?.whatsapp || '',
  email: customer?.email || '',
  province: customer?.province || '',
  address: customer?.address || '',
  mapUrl: customer?.mapUrl || '',
  notes: customer?.notes || '',
  status: customer?.status || CustomerStatus.NEW,
  contactPersons: customer?.contactPersons?.length ? customer.contactPersons : [],
  sites: customer?.sites?.length ? customer.sites : [],
  followUps: customer?.followUps?.length ? customer.followUps : [],
  attachments: [],
});

export const emptyContactPerson = () => ({
  name: '',
  position: '',
  phone: '',
  whatsapp: '',
  isDecisionMaker: false,
  isTechnical: false,
  isFinancial: false,
});

export const emptySite = () => ({
  name: '',
  address: '',
  mapUrl: '',
  managerName: '',
  managerPhone: '',
  notes: '',
});

export const emptyFollowUp = () => ({
  type: FollowUpType.CALL,
  employeeName: '',
  note: '',
  nextFollowUpAt: '',
  status: FollowUpStatus.OPEN,
});

export const buildCustomerFormData = (form) => {
  const formData = new FormData();
  ['name', 'customerType', 'phone', 'whatsapp', 'email', 'province', 'address', 'mapUrl', 'notes', 'status']
    .forEach((key) => formData.append(key, form[key] || ''));
  formData.append('contactPersons', JSON.stringify(form.contactPersons || []));
  formData.append('sites', JSON.stringify(form.sites || []));
  formData.append('followUps', JSON.stringify(form.followUps || []));
  Array.from(form.attachments || []).forEach((file) => formData.append('attachments', file));
  return formData;
};

export const pickPlanCustomerSnapshot = (customer, site = null) => ({
  customer: customer?._id || customer?.id || '',
  customerSiteId: site?._id || site?.id || '',
  customerName: customer?.name || '',
  customerPhone: customer?.phone || '',
  customerWhatsapp: customer?.whatsapp || customer?.phone || '',
  location: site?.address || customer?.address || '',
  customerMapUrl: site?.mapUrl || customer?.mapUrl || '',
  customerSiteName: site?.name || '',
  siteManagerName: site?.managerName || '',
  siteManagerPhone: site?.managerPhone || '',
});
