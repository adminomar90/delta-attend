export const FieldInspectionStatus = {
  AWAITING_SCHEDULE: 'AWAITING_SCHEDULE',
  SCHEDULED: 'SCHEDULED',
  IN_INSPECTION: 'IN_INSPECTION',
  INSPECTION_COMPLETED: 'INSPECTION_COMPLETED',
  AWAITING_DAILY_PLAN: 'AWAITING_DAILY_PLAN',
  IN_EXECUTION: 'IN_EXECUTION',
  CLOSED: 'CLOSED',
};

export const fieldInspectionStatusLabelMap = {
  [FieldInspectionStatus.AWAITING_SCHEDULE]: 'بانتظار تحديد الموعد',
  [FieldInspectionStatus.SCHEDULED]: 'تم تحديد الموعد',
  [FieldInspectionStatus.IN_INSPECTION]: 'قيد الكشف',
  [FieldInspectionStatus.INSPECTION_COMPLETED]: 'تم إكمال الكشف',
  [FieldInspectionStatus.AWAITING_DAILY_PLAN]: 'بانتظار تفعيل بلان العمل',
  [FieldInspectionStatus.IN_EXECUTION]: 'قيد التنفيذ',
  [FieldInspectionStatus.CLOSED]: 'مكتملة / مغلقة',
};

export const toCleanString = (value) => String(value || '').trim();

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

export const normalizeStringArray = (value) =>
  (Array.isArray(value) ? value : [])
    .map((item) => toCleanString(item))
    .filter(Boolean);

export const normalizeMeasurementRows = (value) =>
  (Array.isArray(value) ? value : [])
    .map((item = {}) => ({
      location: toCleanString(item.location),
      measurementType: toCleanString(item.measurementType),
      value: toCleanString(item.value),
      unit: toCleanString(item.unit),
      note: toCleanString(item.note),
      linkedPhoto: toCleanString(item.linkedPhoto),
    }))
    .filter((item) => Object.values(item).some(Boolean));

export const normalizeRequiredMaterialItems = (value) =>
  (Array.isArray(value) ? value : [])
    .map((item = {}) => ({
      materialName: toCleanString(item.materialName || item.name || item.material),
      quantity: toCleanString(item.quantity || item.qty || item.count),
      unit: toCleanString(item.unit),
      notes: toCleanString(item.notes || item.note || item.lineNotes),
    }))
    .filter((item) => Object.values(item).some(Boolean));

export const buildTimelineEntry = ({
  type,
  actor = null,
  actorName = '',
  actorRole = '',
  message = '',
  metadata = {},
} = {}) => ({
  type,
  actor: actor || null,
  actorName,
  actorRole,
  message,
  metadata,
  createdAt: new Date(),
});

export const buildFieldInspectionAttachment = (file, actor = {}, kind = 'attachment') => ({
  fileName: file.filename || '',
  originalName: file.originalname || '',
  mimeType: file.mimetype || '',
  size: Number(file.size || 0),
  storagePath: file.path || '',
  publicUrl: `/uploads/${file.filename}`,
  kind,
  uploadedBy: actor.id || actor._id || null,
  uploadedByName: actor.fullName || actor.name || '',
  uploadedAt: new Date(),
});

export const buildCustomerSnapshot = (customer = {}, site = null) => ({
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

export const buildFieldInspectionWhatsappMessage = (ticket = {}) => {
  const appointmentDate = ticket.appointmentAt ? new Date(ticket.appointmentAt) : null;
  const hasValidAppointment = appointmentDate && !Number.isNaN(appointmentDate.getTime());
  const appointmentDateText = hasValidAppointment
    ? appointmentDate.toLocaleDateString('ar-IQ', {
      timeZone: 'Asia/Baghdad',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    : '-';
  const appointmentTimeText = hasValidAppointment
    ? `${appointmentDate.toLocaleTimeString('ar-IQ', {
      timeZone: 'Asia/Baghdad',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).replace('ص', 'صباحا').replace('م', 'مساءا')}`
    : '-';
  const participants = (ticket.technicians || [])
    .map((item) => item.fullName || item.name || '')
    .filter(Boolean)
    .join('، ');

  return [
    'رسالة صادرة من نظام حجوزات دلتا بلص',
    `السيد ${ticket.customerSnapshot?.customerName || 'زبوننا الكريم'} المحترم`,
    'تحية طيبة',
    'نود إعلامكم بأنه تم تحديد موعد الكشف الميداني الخاص بكم.',
    `تاريخ الكشف: ${appointmentDateText}`,
    `وقت الكشف: ${appointmentTimeText}`,
    participants ? `الشخص المكلف بالكشف: ${participants}` : '',
    'شاكرين تعاونكم وتقديركم.',
    'الموقع الإلكتروني: https://deltaplus-iq.com/',
  ].filter(Boolean).join('\n');
};
