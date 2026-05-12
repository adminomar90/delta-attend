'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api, assetUrl } from '../../../lib/api';
import { authStorage } from '../../../lib/auth';
import { Permission, hasPermission } from '../../../lib/permissions';
import CustomerSearchModal from '../../../components/customers/CustomerSearchModal';
import CustomerModal from '../../../components/customers/CustomerModal';
import DailyWorkPlanAssigneePicker from '../../../components/daily-work-plans/DailyWorkPlanAssigneePicker';
import FieldInspectionCalendar from '../../../components/field-inspections/FieldInspectionCalendar';

const statusLabels = {
  AWAITING_SCHEDULE: 'بانتظار تحديد الموعد',
  SCHEDULED: 'تم تحديد الموعد',
  IN_INSPECTION: 'قيد الكشف',
  INSPECTION_COMPLETED: 'تم إكمال الكشف',
  AWAITING_DAILY_PLAN: 'بانتظار تفعيل بلان العمل',
  IN_EXECUTION: 'قيد التنفيذ',
  CLOSED: 'مكتملة / مغلقة',
};

const statusClass = {
  AWAITING_SCHEDULE: 'status-todo',
  SCHEDULED: 'status-submitted',
  IN_INSPECTION: 'status-inprogress',
  INSPECTION_COMPLETED: 'status-approved',
  AWAITING_DAILY_PLAN: 'status-submitted',
  IN_EXECUTION: 'status-inprogress',
  CLOSED: 'status-approved',
};

const emptyForm = {
  customerId: '',
  customerName: '',
  phone: '',
  address: '',
  siteId: '',
  serviceType: '',
  customServiceType: '',
  requestDescription: '',
  appointmentAt: '',
  technicians: [],
  notes: '',
};

const serviceTypeOptions = [
  'كاميرات مراقبة',
  'بدالة داخلية',
  'شبكة نيت ورك',
  'أنظمة إنذار وإطفاء الحريق',
  'برمجيات',
  'أنظمة الصوت',
  'طاقة شمسية',
  'أخرى',
];

const resolveServiceTypeForSave = (serviceType, customServiceType) =>
  serviceType === 'أخرى' ? customServiceType.trim() : serviceType;

const splitServiceTypeForEdit = (value) => {
  if (!value) return { serviceType: '', customServiceType: '' };
  if (serviceTypeOptions.includes(value)) return { serviceType: value, customServiceType: '' };
  return { serviceType: 'أخرى', customServiceType: value };
};

const emptyInspectionForm = {
  serviceType: '',
  requestType: '',
  customRequestType: '',
  siteStatus: '',
  customSiteStatus: '',
  urgency: '',
  serviceFields: {},
  materials: [],
  customMaterials: [],
  inspectionResult: '',
  technicianRecommendation: '',
  siteCondition: '',
  customerRequirements: '',
  requiredWorkType: '',
  existingSystems: '',
  proposedWorks: '',
  requiredMaterials: '',
  technicalMeasurements: '',
  finalRecommendations: '',
  generalNotes: '',
  requiredMaterialItems: [],
  measurements: [],
  measurementEmptyReason: '',
  customerSignature: {
    customerName: '',
    phone: '',
    signedAt: '',
    technicianName: '',
    technicianSignature: '',
    imageDataUrl: '',
    emptyReason: '',
  },
};

const requestTypeOptions = ['تنفيذ جديد', 'صيانة', 'توسعة', 'استبدال نظام قديم', 'كشف أولي للتسعير', 'أخرى'];
const siteStatusOptions = ['موقع جديد', 'موقع قائم ويحتاج تطوير', 'موقع قائم ويحتاج صيانة', 'غير مكتمل البناء', 'أخرى'];
const urgencyOptions = ['عادي', 'مستعجل', 'طارئ'];
const inspectionResultOptions = ['مناسب للتنفيذ', 'يحتاج تسعير', 'يحتاج زيارة ثانية', 'يحتاج معلومات إضافية من الزبون', 'غير مناسب حاليًا'];
const materialOptions = ['كيبل شبكة', 'كيبل كهرباء', 'راك', 'سويتش', 'راوتر', 'UPS', 'كاميرا', 'جهاز تسجيل', 'هاتف IP', 'سنترال', 'سماعات', 'لوحة تحكم', 'حساسات', 'بطاريات', 'ألواح شمسية'];

const yesNoOptions = ['نعم', 'لا'];
const yesNoCheckOptions = ['نعم', 'لا', 'يحتاج فحص'];

const serviceFieldConfig = {
  'كاميرات مراقبة': [
    { key: 'نوع النظام المطلوب', type: 'select', options: ['IP', 'Analog', 'غير محدد بعد'] },
    { key: 'نوع العمل', type: 'select', options: ['نظام جديد', 'توسعة نظام موجود', 'صيانة', 'استبدال'] },
    { key: 'عدد الكاميرات المطلوبة', type: 'number' },
    { key: 'أماكن التركيب', type: 'select', options: ['داخلي', 'خارجي', 'داخلي وخارجي'] },
    { key: 'هل يوجد جهاز تسجيل حالي؟', type: 'select', options: yesNoCheckOptions },
    { key: 'هل يحتاج مشاهدة عن بعد؟', type: 'select', options: yesNoOptions },
    { key: 'مدة التسجيل المطلوبة', type: 'select', options: ['7 أيام', '15 يوم', '30 يوم', 'أكثر', 'غير محدد'] },
  ],
  'بدالة داخلية': [
    { key: 'نوع النظام المطلوب', type: 'select', options: ['IP PBX', 'Analog', 'غير محدد'] },
    { key: 'نوع العمل', type: 'select', options: ['تركيب جديد', 'توسعة', 'صيانة', 'برمجة فقط'] },
    { key: 'عدد الخطوط الخارجية المطلوبة', type: 'number' },
    { key: 'عدد التحويلات الداخلية المطلوبة', type: 'number' },
    { key: 'هل يحتاج IVR؟', type: 'select', options: yesNoOptions },
    { key: 'هل يحتاج تسجيل مكالمات؟', type: 'select', options: yesNoOptions },
    { key: 'هل يوجد ربط بين فروع؟', type: 'select', options: yesNoOptions },
  ],
  'شبكة نيت ورك': [
    { key: 'نوع العمل', type: 'select', options: ['تأسيس شبكة جديدة', 'توسعة شبكة', 'صيانة', 'تنظيم وترتيب الشبكة'] },
    { key: 'نوع الشبكة المطلوبة', type: 'select', options: ['سلكية', 'لاسلكية', 'سلكية ولاسلكية'] },
    { key: 'عدد النقاط المطلوبة', type: 'number' },
    { key: 'هل يوجد راك؟', type: 'select', options: ['نعم', 'لا', 'يحتاج استبدال'] },
    { key: 'هل يوجد سويتشات حاليًا؟', type: 'select', options: yesNoCheckOptions },
    { key: 'هل يحتاج تقسيم VLAN؟', type: 'select', options: ['نعم', 'لا', 'يحدد لاحقًا'] },
    { key: 'هل يوجد ربط بين أكثر من موقع؟', type: 'select', options: yesNoOptions },
  ],
  'أنظمة إنذار وإطفاء الحريق': [
    { key: 'نوع النظام المطلوب', type: 'select', options: ['إنذار حريق', 'إطفاء حريق', 'إنذار وإطفاء معًا'] },
    { key: 'نوع العمل', type: 'select', options: ['تركيب جديد', 'توسعة', 'صيانة', 'فحص نظام موجود'] },
    { key: 'نوع الموقع', type: 'select', options: ['محل', 'شركة', 'مستشفى', 'مخزن', 'بناية', 'أخرى'] },
    { key: 'عدد الطوابق', type: 'number' },
    { key: 'هل توجد منظومة حالية؟', type: 'select', options: ['نعم', 'لا', 'تحتاج فحص'] },
    { key: 'هل يحتاج ربط مع أنظمة أخرى؟', type: 'select', options: yesNoOptions },
  ],
  برمجيات: [
    { key: 'نوع الطلب', type: 'select', options: ['برنامج جديد', 'تطوير برنامج موجود', 'موقع إلكتروني', 'تطبيق موبايل', 'نظام إدارة داخلي', 'أخرى'] },
    { key: 'هل يوجد نظام حالي؟', type: 'select', options: yesNoOptions },
    { key: 'نوع الاستخدام', type: 'select', options: ['داخلي للشركة', 'للزبائن', 'للموظفين', 'عام'] },
    { key: 'عدد المستخدمين المتوقع', type: 'select', options: ['1-10', '11-50', '51-100', 'أكثر من 100'] },
    { key: 'هل يحتاج صلاحيات متعددة للمستخدمين؟', type: 'select', options: yesNoOptions },
    { key: 'هل يحتاج تقارير؟', type: 'select', options: yesNoOptions },
  ],
  'أنظمة الصوت': [
    { key: 'نوع النظام المطلوب', type: 'select', options: ['إذاعة داخلية', 'نظام صوت للمناسبات', 'نظام تنبيه', 'نظام صوتي متكامل'] },
    { key: 'نوع العمل', type: 'select', options: ['تركيب جديد', 'توسعة', 'صيانة'] },
    { key: 'نوع الموقع', type: 'select', options: ['مسجد', 'شركة', 'مستشفى', 'قاعة', 'متجر', 'أخرى'] },
    { key: 'عدد المناطق الصوتية المطلوبة', type: 'number' },
    { key: 'هل يحتاج مايكروفونات؟', type: 'select', options: yesNoOptions },
    { key: 'هل يحتاج تشغيل موسيقى أو رسائل مسجلة؟', type: 'select', options: yesNoOptions },
  ],
  'طاقة شمسية': [
    { key: 'نوع النظام المطلوب', type: 'select', options: ['On Grid', 'Off Grid', 'Hybrid', 'غير محدد'] },
    { key: 'نوع الطلب', type: 'select', options: ['تركيب جديد', 'توسعة', 'صيانة'] },
    { key: 'نوع الموقع', type: 'select', options: ['منزل', 'شركة', 'مزرعة', 'مصنع', 'أخرى'] },
    { key: 'القدرة المطلوبة إن وجدت', type: 'number' },
    { key: 'هل توجد أحمال يجب تشغيلها؟', type: 'select', options: yesNoOptions },
    { key: 'هل يوجد مولد حالي؟', type: 'select', options: yesNoOptions },
    { key: 'هل يحتاج بطاريات؟', type: 'select', options: ['نعم', 'لا', 'يحدد لاحقًا'] },
  ],
  أخرى: [
    { key: 'وصف الخدمة المطلوبة', type: 'textarea' },
    { key: 'تفاصيل الطلب', type: 'textarea' },
    { key: 'الملاحظات الفنية', type: 'textarea' },
  ],
};

const measurementOptionsByService = {
  'كاميرات مراقبة': ['عدد الكاميرات المقترح', 'أماكن التركيب', 'داخلي / خارجي', 'ارتفاع التركيب', 'طول الكيبل التقريبي', 'نوع الكاميرات IP / Analog', 'عدد القنوات المطلوبة في NVR / DVR', 'مدة التسجيل المطلوبة', 'حجم الهارد المقترح', 'هل يحتاج مشاهدة عن بعد'],
  'بدالة داخلية': ['عدد التحويلات الداخلية', 'عدد الخطوط الخارجية', 'عدد الهواتف المطلوبة', 'هل يحتاج IVR', 'هل يحتاج تسجيل مكالمات', 'هل يوجد ربط بين فروع', 'مواقع الأجهزة والهواتف'],
  'شبكة نيت ورك': ['عدد نقاط الشبكة', 'عدد نقاط Wi-Fi', 'طول الكيبل التقريبي', 'عدد السويتشات', 'حجم الراك', 'هل يحتاج VLAN', 'هل يحتاج ربط بين مواقع', 'هل يوجد راوتر / فايروول'],
  'أنظمة إنذار وإطفاء الحريق': ['عدد الطوابق', 'عدد المناطق / Zones', 'عدد الحساسات', 'عدد الكاسرات اليدوية', 'عدد الأجراس', 'نوع النظام Conventional / Addressable', 'هل يحتاج ربط مع أنظمة أخرى'],
  'أنظمة الصوت': ['عدد السماعات', 'عدد المناطق الصوتية', 'نوع الاستخدام', 'قدرة الأمبليفاير', 'هل يحتاج مايكروفون', 'هل يحتاج رسائل مسجلة'],
  'طاقة شمسية': ['القدرة المطلوبة KW', 'الأحمال المطلوب تشغيلها', 'عدد الألواح', 'قدرة الانفرتر', 'عدد البطاريات', 'ساعات التشغيل المطلوبة', 'هل النظام On Grid / Off Grid / Hybrid'],
  برمجيات: ['نوع النظام المطلوب', 'عدد المستخدمين', 'عدد الصلاحيات', 'عدد الشاشات أو الأقسام', 'هل يحتاج تقارير', 'هل يحتاج تطبيق موبايل', 'هل يحتاج لوحة تحكم'],
  أخرى: ['قياس عام', 'ملاحظة فنية', 'متطلب خاص'],
};

const measurementUnits = ['قطعة', 'عدد', 'متر', 'متر مربع', 'طابق', 'غرفة', 'KW', 'KVA', 'ساعة', 'جهاز', 'نقطة', 'أخرى'];

const emptyCustomer = {
  name: '',
  customerType: 'COMPANY',
  phone: '',
  whatsapp: '',
  email: '',
  province: '',
  address: '',
  mapUrl: '',
  notes: '',
  status: 'NEW',
  contactPersons: [],
  sites: [],
  followUps: [],
};

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ar-IQ');
};

const toInputDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const toDateInputValue = (value) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

const createMonthAnchor = (value = new Date()) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month] = value.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, 1, 12, 0, 0, 0));
  }
  const date = value instanceof Date ? value : new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return new Date(Date.UTC(safeDate.getUTCFullYear(), safeDate.getUTCMonth(), 1, 12, 0, 0, 0));
};

const ticketMatches = (ticket, filters) => {
  const q = filters.search.trim().toLowerCase();
  const haystack = [
    ticket.ticketNo,
    ticket.customerSnapshot?.customerName,
    ticket.customerSnapshot?.phone,
    ticket.customerSnapshot?.address,
    ticket.serviceType,
  ].join(' ').toLowerCase();
  if (q && !haystack.includes(q)) return false;
  if (filters.status && ticket.status !== filters.status) return false;
  if (filters.technician) {
    const hasTech = (ticket.technicians || []).some((item) => String(item.user?._id || item.user) === String(filters.technician));
    if (!hasTech) return false;
  }
  if (filters.serviceType && !String(ticket.serviceType || '').toLowerCase().includes(filters.serviceType.toLowerCase())) return false;
  return true;
};

export default function FieldInspectionsPage() {
  const currentUser = authStorage.getUser();
  const canCreate = hasPermission(currentUser, Permission.CREATE_FIELD_INSPECTIONS) || hasPermission(currentUser, Permission.MANAGE_FIELD_INSPECTIONS);
  const canManage = hasPermission(currentUser, Permission.MANAGE_FIELD_INSPECTIONS) || currentUser?.role === 'GENERAL_MANAGER';
  const canHandle = canManage || hasPermission(currentUser, Permission.HANDLE_FIELD_INSPECTIONS);

  const [tickets, setTickets] = useState([]);
  const [meta, setMeta] = useState({ technicians: [], statuses: statusLabels });
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [inspectionForm, setInspectionForm] = useState(emptyInspectionForm);
  const [filters, setFilters] = useState({ search: '', status: '', technician: '', serviceType: '' });
  const [showForm, setShowForm] = useState(false);
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [editingInspectionForm, setEditingInspectionForm] = useState(false);
  const [scrollToTicketDetails, setScrollToTicketDetails] = useState(false);
  const [scrollToInspectionForm, setScrollToInspectionForm] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarTickets, setCalendarTickets] = useState([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => createMonthAnchor(new Date()));
  const [calendarSelectedDate, setCalendarSelectedDate] = useState(() => toDateInputValue(new Date()));
  const selectedTicketRef = useRef(null);
  const inspectionFormRef = useRef(null);
  const calendarSectionRef = useRef(null);
  const signatureCanvasRef = useRef(null);
  const isSigningRef = useRef(false);

  const filteredTickets = useMemo(() => tickets.filter((ticket) => ticketMatches(ticket, filters)), [tickets, filters]);

  const calendarQueryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.search) params.set('search', filters.search);
    if (filters.status) params.set('status', filters.status);
    if (filters.technician) params.set('technician', filters.technician);
    if (filters.serviceType) params.set('serviceType', filters.serviceType);
    const monthStart = createMonthAnchor(calendarMonth);
    const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1, 12, 0, 0, 0));
    params.set('appointmentFrom', monthStart.toISOString());
    params.set('appointmentTo', monthEnd.toISOString());
    return params.toString();
  }, [calendarMonth, filters.search, filters.serviceType, filters.status, filters.technician]);

  const resetTicketPanels = () => {
    setSelected(null);
    setInspectionForm(emptyInspectionForm);
    setAttachments([]);
    setEditingInspectionForm(false);
    setScrollToTicketDetails(false);
    setScrollToInspectionForm(false);
  };

  const load = async ({ preserveSelected = true } = {}) => {
    setLoading(true);
    try {
      const [ticketResponse, metaResponse] = await Promise.all([
        api.get('/field-inspections'),
        api.get('/field-inspections/meta').catch(() => ({ technicians: [], statuses: statusLabels })),
      ]);
      setTickets(ticketResponse.tickets || []);
      setMeta(metaResponse);
      if (preserveSelected && selected?.id) {
        const fresh = (ticketResponse.tickets || []).find((item) => item.id === selected.id);
        if (fresh) {
          setSelected(fresh);
          setInspectionForm({ ...emptyInspectionForm, ...(fresh.inspectionForm || {}) });
        }
      }
      setError('');
    } catch (err) {
      setError(err.message || 'تعذر تحميل تذاكر الكشف الميداني');
    } finally {
      setLoading(false);
    }
  };

  const loadCalendar = async (silent = false) => {
    if (!calendarOpen) return;
    if (!silent) setCalendarLoading(true);
    try {
      const response = await api.get(`/field-inspections?${calendarQueryString}`);
      setCalendarTickets(response.tickets || []);
    } catch (err) {
      if (!silent) setError(err.message || 'تعذر تحميل تقويم الكشف الميداني');
    } finally {
      if (!silent) setCalendarLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);
  useEffect(() => { if (calendarOpen) loadCalendar(); }, [calendarOpen, calendarQueryString]);
  useEffect(() => {
    if (!calendarOpen) return undefined;
    const interval = window.setInterval(() => loadCalendar(true), 30000);
    return () => window.clearInterval(interval);
  }, [calendarOpen, calendarQueryString]);
  useEffect(() => {
    if (!calendarOpen) return undefined;
    const rafId = window.requestAnimationFrame(() => {
      const el = calendarSectionRef.current;
      if (!el) return;
      const targetTop = el.getBoundingClientRect().top + window.scrollY - 88;
      window.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [calendarOpen]);
  useEffect(() => {
    if (!scrollToInspectionForm || !selected || !editingInspectionForm) return undefined;
    const rafId = window.requestAnimationFrame(() => {
      const el = inspectionFormRef.current;
      if (!el) return;
      const targetTop = el.getBoundingClientRect().top + window.scrollY - 88;
      window.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
      setScrollToInspectionForm(false);
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [editingInspectionForm, scrollToInspectionForm, selected]);
  useEffect(() => {
    if (!scrollToTicketDetails || !selected) return undefined;
    const rafId = window.requestAnimationFrame(() => {
      const el = selectedTicketRef.current;
      if (!el) return;
      const targetTop = el.getBoundingClientRect().top + window.scrollY - 88;
      window.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
      setScrollToTicketDetails(false);
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [scrollToTicketDetails, selected]);

  const handleCalendarToggle = () => {
    setCalendarOpen((previous) => {
      const nextOpen = !previous;
      if (nextOpen) {
        const nextDate = calendarSelectedDate || toDateInputValue(new Date());
        setCalendarSelectedDate(nextDate);
        setCalendarMonth(createMonthAnchor(nextDate));
      }
      return nextOpen;
    });
  };

  const handleCalendarDateSelect = (dateKey) => {
    setCalendarSelectedDate(dateKey || '');
    if (dateKey) setCalendarMonth(createMonthAnchor(dateKey));
  };

  const handleCalendarMonthChange = (nextMonth) => {
    const nextAnchor = createMonthAnchor(nextMonth);
    setCalendarMonth(nextAnchor);
    if (!calendarSelectedDate) return;
    const selectedAnchor = createMonthAnchor(calendarSelectedDate);
    const sameMonth = selectedAnchor.getUTCFullYear() === nextAnchor.getUTCFullYear()
      && selectedAnchor.getUTCMonth() === nextAnchor.getUTCMonth();
    if (!sameMonth) setCalendarSelectedDate('');
  };

  const openActivatedDailyPlan = (response) => {
    const planId = response?.plan?._id || response?.plan?.id;
    if (planId && typeof window !== 'undefined') {
      window.location.href = `/daily-work-plans?planId=${planId}`;
    }
  };

  const selectTicket = async (ticket) => {
    try {
      const response = await api.get(`/field-inspections/${ticket.id}`);
      setSelected(response.ticket);
      setInspectionForm({ ...emptyInspectionForm, ...(response.ticket.inspectionForm || {}) });
      setAttachments([]);
      setError('');
      setInfo('');
      setShowForm(false);
      setEditingInspectionForm(false);
      setScrollToTicketDetails(true);
    } catch (err) {
      setError(err.message || 'تعذر فتح التذكرة');
    }
  };

  const chooseCustomer = (snapshot, customer, site) => {
    setForm((prev) => ({
      ...prev,
        customerId: customer._id || customer.id || snapshot.customerId || '',
        customerName: snapshot.customerName || customer.name || '',
        phone: snapshot.phone || customer.phone || '',
        address: snapshot.address || customer.address || '',
      siteId: site?._id || site?.id || '',
    }));
    setCustomerSearchOpen(false);
  };

  const saveNewCustomer = async (payload) => {
    setSaving(true);
    try {
      const body = new FormData();
      Object.entries(payload).forEach(([key, value]) => {
        if (Array.isArray(value)) body.append(key, JSON.stringify(value));
        else if (value != null) body.append(key, value);
      });
      const response = await api.post('/customers', body);
      const customer = response.customer;
      chooseCustomer({
        customerId: customer._id || customer.id,
        customerName: customer.name,
        phone: customer.phone,
        address: customer.address,
      }, customer, null);
      setCustomerModalOpen(false);
      setInfo('تم إضافة الزبون وربطه بالتذكرة.');
    } catch (err) {
      setError(err.message || 'تعذر إضافة الزبون');
    } finally {
      setSaving(false);
    }
  };

  const createTicket = async () => {
    if (!form.customerId) {
      setError('اختر زبونًا أولًا من زر البحث عن زبون.');
      return;
    }
    setSaving(true);
    try {
      const response = await api.post('/field-inspections', {
        customerId: form.customerId,
        siteId: form.siteId,
        serviceType: resolveServiceTypeForSave(form.serviceType, form.customServiceType),
        requestDescription: form.requestDescription,
        appointmentAt: form.appointmentAt,
        technicians: form.technicians,
        notes: form.notes,
      });
      setTickets((prev) => [response.ticket, ...prev]);
      setShowForm(false);
      setForm(emptyForm);
      resetTicketPanels();
      setInfo('تم إنشاء تذكرة الكشف.');
      setError('');
      if (calendarOpen) await loadCalendar(true);
    } catch (err) {
      setError(err.message || 'تعذر إنشاء التذكرة');
    } finally {
      setSaving(false);
    }
  };

  const updateTicket = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const response = await api.patch(`/field-inspections/${selected.id}`, {
        serviceType: resolveServiceTypeForSave(
          selected.serviceTypeChoice ?? splitServiceTypeForEdit(selected.serviceType).serviceType,
          selected.customServiceType ?? splitServiceTypeForEdit(selected.serviceType).customServiceType,
        ),
        requestDescription: selected.requestDescription,
        appointmentAt: toInputDateTime(selected.appointmentAt),
        technicians: (selected.technicians || []).map((item) => item.user?._id || item.user),
        notes: selected.notes,
      });
      await load({ preserveSelected: false });
      if (calendarOpen) await loadCalendar(true);
      resetTicketPanels();
      setInfo('تم تحديث التذكرة.');
    } catch (err) {
      setError(err.message || 'تعذر تحديث التذكرة');
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (path, options = {}) => {
    if (!selected) return null;
    setSaving(true);
    try {
      const response = await api.post(`/field-inspections/${selected.id}/${path}`, options.body || {});
      if (response.whatsappUrl) window.open(response.whatsappUrl, '_blank', 'noopener,noreferrer');
      if (response.plan) setInfo('تم إنشاء بلان العمل اليومي وربطه بالتذكرة.');
      else setInfo(options.message || 'تم تنفيذ العملية.');
      if (path === 'close') {
        resetTicketPanels();
      } else if (response.ticket) {
        setSelected(response.ticket);
        setInspectionForm({ ...emptyInspectionForm, ...(response.ticket.inspectionForm || {}) });
        if (path === 'start') {
          setEditingInspectionForm(true);
          setScrollToInspectionForm(true);
        }
      }
      await load({ preserveSelected: path !== 'close' });
      if (calendarOpen) await loadCalendar(true);
      if (path === 'close') resetTicketPanels();
      if (path === 'activate-daily-plan') openActivatedDailyPlan(response);
      return response;
    } catch (err) {
      setError(err.message || 'فشلت العملية');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const sendTicketAppointment = async (ticket) => {
    if (!ticket?.id) return;
    setSaving(true);
    try {
      const response = await api.post(`/field-inspections/${ticket.id}/send-appointment`, {});
      if (response.whatsappUrl) window.open(response.whatsappUrl, '_blank', 'noopener,noreferrer');
      if (response.ticket) {
        setTickets((prev) => prev.map((item) => (item.id === response.ticket.id ? response.ticket : item)));
        if (selected?.id === response.ticket.id) {
          setSelected(response.ticket);
          setInspectionForm({ ...emptyInspectionForm, ...(response.ticket.inspectionForm || {}) });
        }
      }
      setError('');
      setInfo('تم فتح واتساب لإرسال تفاصيل الموعد.');
      await load();
      if (calendarOpen) await loadCalendar(true);
    } catch (err) {
      setError(err.message || 'تعذر إرسال الموعد للزبون');
    } finally {
      setSaving(false);
    }
  };

  const startTicketInspection = async (ticket) => {
    if (!ticket?.id) return;
    setSaving(true);
    try {
      const response = await api.post(`/field-inspections/${ticket.id}/start`, {});
      if (response.ticket) {
        setTickets((prev) => prev.map((item) => (item.id === response.ticket.id ? response.ticket : item)));
        setSelected(response.ticket);
        setInspectionForm({ ...emptyInspectionForm, ...(response.ticket.inspectionForm || {}) });
        setAttachments([]);
        setShowForm(false);
        setEditingInspectionForm(true);
        setScrollToInspectionForm(true);
      }
      setError('');
      setInfo('بدأ الكشف.');
      await load();
      if (calendarOpen) await loadCalendar(true);
    } catch (err) {
      setError(err.message || 'تعذر بدء الكشف');
    } finally {
      setSaving(false);
    }
  };

  const activateTicketDailyPlan = async (ticket) => {
    if (!ticket?.id) return;
    setSaving(true);
    try {
      const response = await api.post(`/field-inspections/${ticket.id}/activate-daily-plan`, {});
      if (response.ticket) {
        setTickets((prev) => prev.map((item) => (item.id === response.ticket.id ? response.ticket : item)));
        if (selected?.id === response.ticket.id) setSelected(response.ticket);
      }
      setError('');
      setInfo('تم إنشاء بلان العمل اليومي وربطه بالتذكرة.');
      await load({ preserveSelected: false });
      if (calendarOpen) await loadCalendar(true);
      resetTicketPanels();
      openActivatedDailyPlan(response);
    } catch (err) {
      setError(err.message || 'تعذر تفعيل بلان العمل اليومي');
    } finally {
      setSaving(false);
    }
  };

  const sendTicketReport = async (ticket) => {
    if (!ticket?.report?.publicUrl) return;
    const whatsappWindow = window.open('', '_blank', 'noopener,noreferrer');
    setSaving(true);
    try {
      const response = await api.post(`/field-inspections/${ticket.id}/send-report`, {});
      if (response.message && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(response.message).catch(() => {});
      }
      if (response.whatsappUrl) {
        if (whatsappWindow) whatsappWindow.location.href = response.whatsappUrl;
        else window.open(response.whatsappUrl, '_blank', 'noopener,noreferrer');
      } else if (whatsappWindow) {
        whatsappWindow.close();
      }
      if (response.ticket) {
        setTickets((prev) => prev.map((item) => (item.id === response.ticket.id ? response.ticket : item)));
        if (selected?.id === response.ticket.id) setSelected(response.ticket);
      }
      setError('');
      setInfo('تم فتح واتساب مع رسالة التقرير، وتم نسخ الرسالة احتياطيًا.');
    } catch (err) {
      if (whatsappWindow) whatsappWindow.close();
      setError(err.message || 'تعذر إرسال التقرير للزبون');
    } finally {
      setSaving(false);
    }
  };
  const deleteTicket = async (ticketToDelete = selected) => {
    if (!ticketToDelete || !canManage) return;
    const confirmed = window.confirm(`هل تريد حذف التذكرة ${ticketToDelete.ticketNo} نهائيًا؟`);
    if (!confirmed) return;
    setSaving(true);
    try {
      await api.delete(`/field-inspections/${ticketToDelete.id}`);
      setTickets((prev) => prev.filter((ticket) => ticket.id !== ticketToDelete.id));
      if (selected?.id === ticketToDelete.id) {
        resetTicketPanels();
      }
      setError('');
      setInfo('تم حذف التذكرة.');
    } catch (err) {
      setError(err.message || 'تعذر حذف التذكرة');
    } finally {
      setSaving(false);
    }
  };

  const buildInspectionFormBody = () => {
    const effectiveServiceType = inspectionForm.serviceType || selected.serviceType || '';
    if (!effectiveServiceType) {
      setError('نوع الخدمة مطلوب داخل استمارة الكشف.');
      return null;
    }

    const body = new FormData();
    Object.entries({ ...inspectionForm, serviceType: effectiveServiceType }).forEach(([key, value]) => {
      if (['serviceFields', 'materials', 'customMaterials', 'requiredMaterialItems', 'measurements', 'customerSignature'].includes(key)) {
        body.append(key, JSON.stringify(value || (key === 'serviceFields' ? {} : [])));
      } else {
        body.append(key, value || '');
      }
    });
    Array.from(attachments || []).forEach((file) => body.append('attachments', file));
    return body;
  };

  const saveInspectionForm = async () => {
    if (!selected) return;
    const body = buildInspectionFormBody();
    if (!body) return;
    setSaving(true);
    try {
      const response = await api.patch(`/field-inspections/${selected.id}/form`, body);
      setTickets((prev) => prev.map((ticket) => (ticket.id === response.ticket.id ? response.ticket : ticket)));
      resetTicketPanels();
      if (calendarOpen) await loadCalendar(true);
      setInfo('تم حفظ استمارة الكشف.');
    } catch (err) {
      setError(err.message || 'تعذر حفظ الاستمارة');
    } finally {
      setSaving(false);
    }
  };

  const completeInspection = async () => {
    if (!selected) return;
    const body = buildInspectionFormBody();
    if (!body) return;
    setSaving(true);
    try {
      await api.patch(`/field-inspections/${selected.id}/form`, body);
      const response = await api.post(`/field-inspections/${selected.id}/complete`, {});
      if (response.ticket) {
        setTickets((prev) => prev.map((ticket) => (ticket.id === response.ticket.id ? response.ticket : ticket)));
      }
      await load({ preserveSelected: false });
      if (calendarOpen) await loadCalendar(true);
      resetTicketPanels();
      setError('');
      setInfo('تم حفظ بيانات الاستمارة وإنهاء الكشف وإصدار التقرير.');
    } catch (err) {
      setError(err.message || 'تعذر إنهاء الكشف');
    } finally {
      setSaving(false);
    }
  };

  const renderServiceTypeFields = ({ serviceType, customServiceType = '', onChange, disabled = false }) => (
    <>
      <label>
        نوع الخدمة المطلوبة
        <select
          className="select"
          value={serviceType || ''}
          disabled={disabled}
          onChange={(event) => onChange({ serviceType: event.target.value, customServiceType })}
        >
          <option value="">اختر نوع الخدمة</option>
          {serviceTypeOptions.map((option, index) => (
            <option key={`${option}-${index}`} value={option}>{option}</option>
          ))}
        </select>
      </label>
      {serviceType === 'أخرى' ? (
        <label>
          نوع الكشف
          <input
            className="input"
            value={customServiceType || ''}
            disabled={disabled}
            onChange={(event) => onChange({ serviceType, customServiceType: event.target.value })}
            placeholder="اكتب نوع الكشف"
          />
        </label>
      ) : null}
    </>
  );

  const setInspectionField = (key, value) => setInspectionForm((prev) => ({ ...prev, [key]: value }));
  const setServiceField = (key, value) => setInspectionForm((prev) => ({
    ...prev,
    serviceFields: {
      ...(prev.serviceFields || {}),
      [key]: value,
    },
  }));
  const toggleMaterial = (material) => setInspectionForm((prev) => {
    const current = new Set(prev.materials || []);
    if (current.has(material)) current.delete(material);
    else current.add(material);
    return { ...prev, materials: [...current] };
  });
  const addCustomMaterial = () => {
    const value = window.prompt('اكتب اسم المادة أو الجهاز المطلوب');
    const clean = String(value || '').trim();
    if (!clean) return;
    setInspectionForm((prev) => ({ ...prev, customMaterials: [...(prev.customMaterials || []), clean] }));
  };
  const removeCustomMaterial = (material) => setInspectionForm((prev) => ({
    ...prev,
    customMaterials: (prev.customMaterials || []).filter((item) => item !== material),
  }));
  const addRequiredMaterialItem = () => setInspectionForm((prev) => ({
    ...prev,
    requiredMaterialItems: [
      ...(prev.requiredMaterialItems || []),
      { materialName: '', quantity: '1', unit: 'قطعة', notes: '', isEditing: true },
    ],
  }));
  const updateRequiredMaterialItem = (index, key, value) => setInspectionForm((prev) => ({
    ...prev,
    requiredMaterialItems: (prev.requiredMaterialItems || []).map((item, itemIndex) => (
      itemIndex === index ? { ...item, [key]: value } : item
    )),
  }));
  const removeRequiredMaterialItem = (index) => setInspectionForm((prev) => ({
    ...prev,
    requiredMaterialItems: (prev.requiredMaterialItems || []).filter((_, itemIndex) => itemIndex !== index),
  }));
  const saveRequiredMaterialItem = (index) => {
    const item = (inspectionForm.requiredMaterialItems || [])[index];
    if (!String(item?.materialName || '').trim()) {
      setError('اسم المادة مطلوب قبل حفظ البند.');
      return;
    }
    setError('');
    updateRequiredMaterialItem(index, 'isEditing', false);
  };
  const editRequiredMaterialItem = (index) => updateRequiredMaterialItem(index, 'isEditing', true);
  const updateCustomerSignature = (patch) => setInspectionForm((prev) => ({
    ...prev,
    customerSignature: {
      ...(prev.customerSignature || {}),
      ...patch,
    },
  }));
  const getCanvasPoint = (event) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const point = event.touches?.[0] || event;
    return {
      x: (point.clientX - rect.left) * (canvas.width / rect.width),
      y: (point.clientY - rect.top) * (canvas.height / rect.height),
    };
  };
  const startSignature = (event) => {
    const canvas = signatureCanvasRef.current;
    const point = getCanvasPoint(event);
    if (!canvas || !point) return;
    event.preventDefault();
    isSigningRef.current = true;
    const context = canvas.getContext('2d');
    context.strokeStyle = '#0d1f3c';
    context.lineWidth = 3;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(point.x, point.y);
  };
  const drawSignature = (event) => {
    if (!isSigningRef.current) return;
    const canvas = signatureCanvasRef.current;
    const point = getCanvasPoint(event);
    if (!canvas || !point) return;
    event.preventDefault();
    const context = canvas.getContext('2d');
    context.lineTo(point.x, point.y);
    context.stroke();
  };
  const endSignature = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas || !isSigningRef.current) return;
    isSigningRef.current = false;
    updateCustomerSignature({
      imageDataUrl: canvas.toDataURL('image/png'),
      signedAt: new Date().toISOString(),
    });
  };
  const clearSignature = () => {
    const canvas = signatureCanvasRef.current;
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    updateCustomerSignature({ imageDataUrl: '', signedAt: '' });
  };
  const renderSelect = (label, value, options, onChange, required = false) => (
    <label key={label}>
      {label}
      <select className="select" value={value || ''} onChange={(event) => onChange(event.target.value)} required={required}>
        <option value="">اختر</option>
        {options.map((option, index) => <option key={`${label}-${option}-${index}`} value={option}>{option}</option>)}
      </select>
    </label>
  );
  const renderDynamicField = (field) => {
    const value = inspectionForm.serviceFields?.[field.key] || '';
    if (field.type === 'number') {
      return (
        <label key={field.key}>
          {field.key}
          <input className="input" type="number" min="0" value={value} onChange={(event) => setServiceField(field.key, event.target.value)} />
        </label>
      );
    }
    if (field.type === 'textarea') {
      return (
        <label key={field.key} style={{ gridColumn: '1 / -1' }}>
          {field.key}
          <textarea className="input" rows={3} value={value} onChange={(event) => setServiceField(field.key, event.target.value)} />
        </label>
      );
    }
    return renderSelect(field.key, value, field.options || [], (next) => setServiceField(field.key, next));
  };

  return (
    <div>
      <section className="card section">
        <div className="maintenance-card-header">
          <div>
            <h2 style={{ margin: 0 }}>الكشف الميداني</h2>
            <p className="daily-plan-modal-subtitle">إدارة دورة الكشف من طلب الزبون إلى البلان والإغلاق.</p>
          </div>
          {canCreate ? <button className="btn btn-primary" type="button" onClick={() => {
            resetTicketPanels();
            setShowForm((value) => !value);
          }}>إنشاء تذكرة كشف جديدة</button> : null}
        </div>
      </section>

      {error ? <div className="alert error">{error}</div> : null}
      {info ? <div className="alert success">{info}</div> : null}

      {showForm ? (
        <section className="card section" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>تذكرة كشف جديدة</h3>
          <div className="action-row" style={{ marginBottom: 12 }}>
            <button className="btn btn-soft" type="button" onClick={() => setCustomerSearchOpen(true)}>البحث عن زبون</button>
            <button className="btn btn-soft" type="button" onClick={() => setCustomerModalOpen(true)}>إضافة زبون جديد</button>
          </div>
          <div className="grid-3">
            <label>اسم الزبون<input className="input" value={form.customerName} disabled /></label>
            <label>رقم الهاتف<input className="input" value={form.phone} disabled /></label>
            <label>العنوان<input className="input" value={form.address} disabled /></label>
            {renderServiceTypeFields({
              serviceType: form.serviceType,
              customServiceType: form.customServiceType,
              onChange: (patch) => setForm((prev) => ({ ...prev, ...patch })),
            })}
            <label>تاريخ ووقت موعد الكشف<input className="input" type="datetime-local" value={form.appointmentAt} onChange={(e) => setForm((prev) => ({ ...prev, appointmentAt: e.target.value }))} /></label>
            <div style={{ gridColumn: '1 / -1' }}>
              <DailyWorkPlanAssigneePicker
                users={meta.technicians || []}
                selectedIds={form.technicians}
                onChange={(technicians) => setForm((prev) => ({ ...prev, technicians }))}
              />
            </div>
            <label style={{ gridColumn: '1 / -1' }}>وصف مختصر لطلب الزبون<textarea className="input" rows={3} value={form.requestDescription} onChange={(e) => setForm((prev) => ({ ...prev, requestDescription: e.target.value }))} /></label>
            <label style={{ gridColumn: '1 / -1' }}>ملاحظات إضافية<textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} /></label>
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" type="button" onClick={createTicket} disabled={saving}>حفظ التذكرة</button>
            <button className="btn btn-soft" type="button" onClick={() => {
              setShowForm(false);
              resetTicketPanels();
            }}>إلغاء</button>
          </div>
        </section>
      ) : null}

      <section className="card section" style={{ marginTop: 16 }}>
        <div className="grid-4">
          <label>بحث<input className="input" value={filters.search} onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))} placeholder="رقم التذكرة، الزبون، الهاتف..." /></label>
          <label>الحالة<select className="select" value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}><option value="">الكل</option>{Object.entries(meta.statuses || statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>الفني<select className="select" value={filters.technician} onChange={(e) => setFilters((prev) => ({ ...prev, technician: e.target.value }))}><option value="">الكل</option>{(meta.technicians || []).map((user) => <option key={user.id} value={user.id}>{user.fullName}</option>)}</select></label>
          <label>نوع الخدمة<input className="input" value={filters.serviceType} onChange={(e) => setFilters((prev) => ({ ...prev, serviceType: e.target.value }))} /></label>
        </div>
        <div className="form-actions" style={{ marginTop: 12 }}>
          <button className="btn btn-soft" type="button" onClick={handleCalendarToggle}>
            {calendarOpen ? 'إخفاء التقويم' : 'عرض التقويم'}
          </button>
        </div>
      </section>

      <div ref={calendarSectionRef}>
        <FieldInspectionCalendar
          open={calendarOpen}
          loading={calendarLoading}
          monthDate={calendarMonth}
          tickets={calendarTickets}
          selectedDate={calendarSelectedDate}
          statusClass={statusClass}
          statusLabels={meta.statuses || statusLabels}
          saving={saving}
          canManage={canManage}
          canHandle={canHandle}
          onSelectDate={handleCalendarDateSelect}
          onChangeMonth={handleCalendarMonthChange}
          onOpenTicket={selectTicket}
          onSendAppointment={sendTicketAppointment}
          onStartInspection={startTicketInspection}
          onActivateDailyPlan={activateTicketDailyPlan}
        />
      </div>

      <section className="card section" style={{ marginTop: 16 }}>
        <div className="daily-plan-card-grid">
          {loading ? <p className="maintenance-empty">جارٍ تحميل التذاكر...</p> : null}
          {!loading && !filteredTickets.length ? <p className="maintenance-empty">لا توجد تذاكر مطابقة.</p> : null}
          {filteredTickets.map((ticket) => (
            <article className="daily-plan-card" key={ticket.id}>
              <div className="maintenance-card-header">
                <div>
                  <strong>{ticket.ticketNo}</strong>
                  <div className="daily-plan-card-subtitle">{ticket.customerSnapshot?.customerName || '-'} - {ticket.customerSnapshot?.phone || '-'}</div>
                </div>
                <span className={`status-pill ${statusClass[ticket.status] || 'status-todo'}`}>{ticket.statusLabel || statusLabels[ticket.status] || ticket.status}</span>
              </div>
              <div className="daily-plan-mini-grid">
                <div><span>الخدمة</span><strong>{ticket.serviceType || '-'}</strong></div>
                <div><span>موعد الكشف</span><strong>{formatDateTime(ticket.appointmentAt)}</strong></div>
                <div><span>الفنيون</span><strong>{(ticket.technicians || []).length}</strong></div>
                <div><span>البلان</span><strong>{ticket.linkedDailyWorkPlan ? 'مرتبط' : '-'}</strong></div>
              </div>
              <div className="daily-plan-card-subtitle">{ticket.customerSnapshot?.address || '-'}</div>
              <div className="form-actions daily-plan-actions">
                <button className="btn btn-soft btn-sm" type="button" onClick={() => selectTicket(ticket)}>فتح التذكرة</button>
                <button className="btn btn-soft btn-sm" type="button" onClick={() => selectTicket(ticket)}>تعديل التذكرة</button>
                {canManage && ticket.appointmentAt ? <button className="btn btn-soft btn-sm" type="button" onClick={() => sendTicketAppointment(ticket)} disabled={saving}>إرسال الموعد إلى الزبون</button> : null}
                {canHandle && ['SCHEDULED', 'AWAITING_SCHEDULE'].includes(ticket.status) ? <button className="btn btn-primary btn-sm" type="button" onClick={() => startTicketInspection(ticket)} disabled={saving}>بدء الكشف</button> : null}
                {canManage && ['AWAITING_DAILY_PLAN', 'INSPECTION_COMPLETED'].includes(ticket.status) && !ticket.linkedDailyWorkPlan ? <button className="btn btn-primary btn-sm" type="button" onClick={() => activateTicketDailyPlan(ticket)} disabled={saving}>تفعيل بلان العمل اليومي</button> : null}
                {ticket.report?.publicUrl ? <a className="btn btn-soft btn-sm" href={assetUrl(`/api/field-inspections/${ticket.id}/report/download`)} target="_blank" rel="noreferrer">تحميل PDF</a> : null}
                {ticket.report?.publicUrl ? <button className="btn btn-soft btn-sm" type="button" onClick={() => sendTicketReport(ticket)} disabled={saving}>إرسال التقرير للزبون</button> : null}
                {canManage ? <button className="btn btn-danger btn-sm" type="button" onClick={() => deleteTicket(ticket)} disabled={saving}>حذف التذكرة</button> : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      {selected ? (
        <section ref={selectedTicketRef} className="card section" style={{ marginTop: 16 }}>
          <div className="maintenance-card-header">
            <div>
              <h3 style={{ margin: 0 }}>{selected.ticketNo} - {selected.customerSnapshot?.customerName}</h3>
              <p className="daily-plan-modal-subtitle">{selected.statusLabel || statusLabels[selected.status]} - أنشئت في {formatDateTime(selected.createdAt)}</p>
            </div>
            <span className={`status-pill ${statusClass[selected.status] || 'status-todo'}`}>{selected.statusLabel || statusLabels[selected.status]}</span>
          </div>

          <div className="grid-3">
            <label>اسم الزبون<input className="input" value={selected.customerSnapshot?.customerName || ''} disabled /></label>
            <label>رقم الهاتف<input className="input" value={selected.customerSnapshot?.phone || ''} disabled /></label>
            <label>العنوان<input className="input" value={selected.customerSnapshot?.address || ''} disabled /></label>
            {renderServiceTypeFields({
              ...splitServiceTypeForEdit(selected.serviceType),
              serviceType: selected.serviceTypeChoice ?? splitServiceTypeForEdit(selected.serviceType).serviceType,
              customServiceType: selected.customServiceType ?? splitServiceTypeForEdit(selected.serviceType).customServiceType,
              disabled: !canManage,
              onChange: (patch) => setSelected((prev) => ({
                ...prev,
                serviceTypeChoice: patch.serviceType,
                customServiceType: patch.customServiceType,
                serviceType: resolveServiceTypeForSave(patch.serviceType, patch.customServiceType),
              })),
            })}
            <label>موعد الكشف<input className="input" type="datetime-local" value={toInputDateTime(selected.appointmentAt)} disabled={!canManage} onChange={(e) => setSelected((prev) => ({ ...prev, appointmentAt: e.target.value }))} /></label>
            <div style={{ gridColumn: '1 / -1' }}>
              <DailyWorkPlanAssigneePicker
                users={meta.technicians || []}
                selectedIds={(selected.technicians || []).map((item) => item.user?._id || item.user)}
                onChange={(technicians) => setSelected((prev) => ({ ...prev, technicians: technicians.map((id) => ({ user: id })) }))}
              />
            </div>
            <label style={{ gridColumn: '1 / -1' }}>وصف الطلب<textarea className="input" rows={2} disabled={!canManage} value={selected.requestDescription || ''} onChange={(e) => setSelected((prev) => ({ ...prev, requestDescription: e.target.value }))} /></label>
            <label style={{ gridColumn: '1 / -1' }}>ملاحظات<textarea className="input" rows={2} disabled={!canManage} value={selected.notes || ''} onChange={(e) => setSelected((prev) => ({ ...prev, notes: e.target.value }))} /></label>
          </div>

          <div className="form-actions daily-plan-actions">
            {canManage ? <button className="btn btn-soft" type="button" onClick={updateTicket} disabled={saving}>حفظ التعديلات</button> : null}
            {canManage && selected.appointmentAt ? <button className="btn btn-soft" type="button" onClick={() => runAction('send-appointment', { message: 'تم فتح واتساب لإرسال تفاصيل الموعد.' })} disabled={saving}>إرسال تفاصيل الموعد</button> : null}
            {canHandle && ['SCHEDULED', 'AWAITING_SCHEDULE'].includes(selected.status) ? <button className="btn btn-primary" type="button" onClick={() => runAction('start', { message: 'بدأ الكشف.' })} disabled={saving}>بدء الكشف</button> : null}
            {canHandle && selected.status === 'IN_INSPECTION' && !editingInspectionForm ? <button className="btn btn-soft" type="button" onClick={() => {
              setEditingInspectionForm(true);
              setScrollToInspectionForm(true);
            }} disabled={saving}>تعديل الكشف</button> : null}
            {canHandle && selected.status === 'IN_INSPECTION' ? <button className="btn btn-primary" type="button" onClick={completeInspection} disabled={saving}>إنهاء الكشف</button> : null}
            {selected.report?.publicUrl ? <a className="btn btn-soft" href={assetUrl(`/api/field-inspections/${selected.id}/report/download`)} target="_blank" rel="noreferrer">فتح تقرير PDF</a> : null}
            {selected.report?.publicUrl ? <button className="btn btn-soft" type="button" onClick={() => runAction('send-report', { message: 'تم فتح واتساب لإرسال التقرير.' })} disabled={saving}>إرسال نسخة للزبون</button> : null}
            {canManage && ['AWAITING_DAILY_PLAN', 'INSPECTION_COMPLETED'].includes(selected.status) && !selected.linkedDailyWorkPlan ? <button className="btn btn-primary" type="button" onClick={() => runAction('activate-daily-plan')} disabled={saving}>تفعيل بلان عمل يومي</button> : null}
            {selected.linkedDailyWorkPlan ? <a className="btn btn-soft" href={`/daily-work-plans?planId=${selected.linkedDailyWorkPlan._id || selected.linkedDailyWorkPlan.id || selected.linkedDailyWorkPlan}`}>فتح البلان المرتبط</a> : null}
            {canManage && selected.linkedDailyWorkPlan && selected.status !== 'CLOSED' ? <button className="btn btn-soft" type="button" onClick={() => runAction('close', { message: 'تم إغلاق التذكرة.' })} disabled={saving}>إغلاق التذكرة</button> : null}
            {canManage ? <button className="btn btn-danger" type="button" onClick={deleteTicket} disabled={saving}>حذف التذكرة</button> : null}
          </div>

          {canHandle && selected.status === 'IN_INSPECTION' && editingInspectionForm ? (
            <div ref={inspectionFormRef} className="card section" style={{ marginTop: 16, padding: 12 }}>
              <h3 style={{ marginTop: 0 }}>استمارة الكشف الإلكترونية</h3>
              <div className="daily-plan-mini-grid" style={{ marginBottom: 14 }}>
                <div><span>الزبون</span><strong>{selected.customerSnapshot?.customerName || '-'}</strong></div>
                <div><span>الهاتف</span><strong>{selected.customerSnapshot?.phone || '-'}</strong></div>
                <div><span>العنوان</span><strong>{selected.customerSnapshot?.address || '-'}</strong></div>
                <div><span>موعد الكشف</span><strong>{formatDateTime(selected.appointmentAt)}</strong></div>
                <div><span>الفريق</span><strong>{(selected.technicians || []).map((item) => item.fullName || item.user?.fullName).filter(Boolean).join('، ') || '-'}</strong></div>
              </div>
              <div className="grid-2">
                {renderSelect('نوع الخدمة', inspectionForm.serviceType || selected.serviceType || '', serviceTypeOptions, (value) => {
                  setInspectionForm((prev) => ({
                    ...prev,
                    serviceType: value,
                    serviceFields: {},
                  }));
                }, true)}
                {renderSelect('نوع الطلب', inspectionForm.requestType, requestTypeOptions, (value) => setInspectionField('requestType', value), true)}
                {inspectionForm.requestType === 'أخرى' ? (
                  <label>نوع الطلب الآخر<input className="input" value={inspectionForm.customRequestType || ''} onChange={(event) => setInspectionField('customRequestType', event.target.value)} /></label>
                ) : null}
                {renderSelect('حالة الموقع', inspectionForm.siteStatus, siteStatusOptions, (value) => setInspectionField('siteStatus', value), true)}
                {inspectionForm.siteStatus === 'أخرى' ? (
                  <label>حالة الموقع الأخرى<input className="input" value={inspectionForm.customSiteStatus || ''} onChange={(event) => setInspectionField('customSiteStatus', event.target.value)} /></label>
                ) : null}
                {renderSelect('درجة الاستعجال', inspectionForm.urgency, urgencyOptions, (value) => setInspectionField('urgency', value), true)}
              </div>

              {(serviceFieldConfig[inspectionForm.serviceType || selected.serviceType] || []).length ? (
                <div className="card section" style={{ marginTop: 12, padding: 12 }}>
                  <h4 style={{ marginTop: 0 }}>حقول {inspectionForm.serviceType || selected.serviceType}</h4>
                  <div className="grid-2">
                    {(serviceFieldConfig[inspectionForm.serviceType || selected.serviceType] || []).map(renderDynamicField)}
                  </div>
                </div>
              ) : null}

              <div className="card section" style={{ marginTop: 12, padding: 12 }}>
                <div className="form-actions" style={{ justifyContent: 'space-between', marginTop: 0 }}>
                  <h4 style={{ margin: 0 }}>بنود الطلب</h4>
                  <button className="btn btn-soft btn-sm" type="button" onClick={addRequiredMaterialItem}>+ إضافة بند</button>
                </div>
                {(inspectionForm.requiredMaterialItems || []).length ? (
                  <div className="inspection-material-items" style={{ marginTop: 12 }}>
                    <div className="inspection-material-header">
                      <span>المادة</span>
                      <span>الكمية</span>
                      <span>الوحدة</span>
                      <span>الملاحظات</span>
                      <span>الإجراء</span>
                    </div>
                    {(inspectionForm.requiredMaterialItems || []).map((item, index) => (
                      <div key={index} className="inspection-material-row">
                        <input
                          className="input"
                          value={item.materialName || ''}
                          disabled={!item.isEditing}
                          onChange={(event) => updateRequiredMaterialItem(index, 'materialName', event.target.value)}
                          placeholder="اسم المادة"
                        />
                        <input
                          className="input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.quantity || ''}
                          disabled={!item.isEditing}
                          onChange={(event) => updateRequiredMaterialItem(index, 'quantity', event.target.value)}
                          placeholder="الكمية"
                        />
                        <select
                          className="select"
                          value={item.unit || 'قطعة'}
                          disabled={!item.isEditing}
                          onChange={(event) => updateRequiredMaterialItem(index, 'unit', event.target.value)}
                        >
                          {measurementUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                        </select>
                        <input
                          className="input"
                          value={item.notes || ''}
                          disabled={!item.isEditing}
                          onChange={(event) => updateRequiredMaterialItem(index, 'notes', event.target.value)}
                          placeholder="ملاحظات"
                        />
                        <div className="inspection-material-actions">
                          {item.isEditing ? (
                            <button className="btn btn-primary btn-sm" type="button" onClick={() => saveRequiredMaterialItem(index)}>حفظ</button>
                          ) : (
                            <button className="btn btn-soft btn-sm" type="button" onClick={() => editRequiredMaterialItem(index)}>تعديل</button>
                          )}
                          <button className="btn btn-danger btn-sm" type="button" onClick={() => removeRequiredMaterialItem(index)}>حذف</button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="maintenance-empty" style={{ marginTop: 12 }}>لا توجد بنود مضافة بعد.</p>
                )}
              </div>

              <div className="card section" style={{ marginTop: 12, padding: 12 }}>
                <h4 style={{ marginTop: 0 }}>الحقول المشتركة</h4>
                <div className="daily-plan-chip-row">
                  {materialOptions.map((material) => {
                    const active = (inspectionForm.materials || []).includes(material);
                    return (
                      <button
                        key={material}
                        type="button"
                        className={`status-pill ${active ? 'status-approved' : 'status-todo'}`}
                        onClick={() => toggleMaterial(material)}
                        style={{ border: 0, cursor: 'pointer' }}
                      >
                        {material}
                      </button>
                    );
                  })}
                  {(inspectionForm.customMaterials || []).map((material) => (
                    <button key={material} type="button" className="status-pill status-submitted" onClick={() => removeCustomMaterial(material)} style={{ border: 0, cursor: 'pointer' }}>
                      {material} ×
                    </button>
                  ))}
                  <button className="btn btn-soft btn-sm" type="button" onClick={addCustomMaterial}>إضافة مادة</button>
                </div>
                <div className="grid-2" style={{ marginTop: 12 }}>
                  {renderSelect('نتيجة الكشف', inspectionForm.inspectionResult, inspectionResultOptions, (value) => setInspectionField('inspectionResult', value), true)}
                  <label style={{ gridColumn: '1 / -1' }}>توصية الفني<textarea className="input" rows={2} value={inspectionForm.technicianRecommendation || ''} onChange={(event) => setInspectionField('technicianRecommendation', event.target.value)} /></label>
                  <label style={{ gridColumn: '1 / -1' }}>ملاحظات عامة<textarea className="input" rows={2} value={inspectionForm.generalNotes || ''} onChange={(event) => setInspectionField('generalNotes', event.target.value)} /></label>
                  <label style={{ gridColumn: '1 / -1' }}>الصور والمرفقات<input className="input" type="file" multiple onChange={(event) => setAttachments(event.target.files)} /></label>
                </div>
              </div>
              <div className="card section" style={{ marginTop: 12, padding: 12 }}>
                <h4 style={{ marginTop: 0 }}>توقيع الزبون على صحة معلومات الكشف</h4>
                <p className="daily-plan-card-subtitle">
                  أقر أنا الزبون بأن المعلومات والقياسات المذكورة في هذا التقرير تم تسجيلها أثناء الكشف الميداني، وهي تمثل المتطلبات والملاحظات الفنية الأولية لغرض التسعير أو التنفيذ.
                </p>
                <div className="grid-2">
                  <label>اسم الزبون<input className="input" value={inspectionForm.customerSignature?.customerName || selected.customerSnapshot?.customerName || ''} onChange={(event) => updateCustomerSignature({ customerName: event.target.value })} /></label>
                  <label>رقم الهاتف<input className="input" value={inspectionForm.customerSignature?.phone || selected.customerSnapshot?.phone || ''} onChange={(event) => updateCustomerSignature({ phone: event.target.value })} /></label>
                  <label>اسم الفني / ممثل الشركة<input className="input" value={inspectionForm.customerSignature?.technicianName || currentUser?.fullName || currentUser?.name || ''} onChange={(event) => updateCustomerSignature({ technicianName: event.target.value })} /></label>
                  <label>توقيع الفني إن وجد<input className="input" value={inspectionForm.customerSignature?.technicianSignature || ''} onChange={(event) => updateCustomerSignature({ technicianSignature: event.target.value })} /></label>
                </div>
                <canvas
                  ref={signatureCanvasRef}
                  width={720}
                  height={220}
                  onMouseDown={startSignature}
                  onMouseMove={drawSignature}
                  onMouseUp={endSignature}
                  onMouseLeave={endSignature}
                  onTouchStart={startSignature}
                  onTouchMove={drawSignature}
                  onTouchEnd={endSignature}
                  style={{ width: '100%', height: 180, border: '1px solid var(--border)', borderRadius: 8, background: '#fff', touchAction: 'none', marginTop: 10 }}
                />
                <div className="form-actions" style={{ marginTop: 8 }}>
                  <button className="btn btn-soft btn-sm" type="button" onClick={clearSignature}>مسح التوقيع</button>
                  <span className="daily-plan-card-subtitle">{inspectionForm.customerSignature?.signedAt ? `وقت التوقيع: ${formatDateTime(inspectionForm.customerSignature.signedAt)}` : 'لم يتم توقيع الزبون بعد'}</span>
                </div>
                {!inspectionForm.customerSignature?.imageDataUrl ? (
                  <label style={{ display: 'block', marginTop: 10 }}>
                    سبب عدم توقيع الزبون
                    <textarea className="input" rows={2} value={inspectionForm.customerSignature?.emptyReason || ''} onChange={(event) => updateCustomerSignature({ emptyReason: event.target.value })} placeholder="يُستخدم هذا الحقل فقط إذا تعذر أخذ توقيع الزبون" />
                  </label>
                ) : null}
              </div>
              <div className="form-actions inspection-form-actions">
                <button className="btn btn-primary" type="button" onClick={saveInspectionForm} disabled={saving}>حفظ الاستمارة</button>
                <button className="btn btn-primary" type="button" onClick={completeInspection} disabled={saving}>إنهاء الكشف</button>
                <button className="btn btn-primary" type="button" onClick={resetTicketPanels} disabled={saving}>إغلاق الكشف</button>
              </div>
            </div>
          ) : null}

          <div className="grid-2" style={{ marginTop: 16 }}>
            <div className="card section" style={{ padding: 12 }}>
              <h3 style={{ marginTop: 0 }}>المرفقات</h3>
              {(selected.attachments || []).length ? selected.attachments.map((file) => (
                <div key={file._id || file.publicUrl} className="daily-plan-card-subtitle">
                  <a href={assetUrl(file.publicUrl)} target="_blank" rel="noreferrer">{file.originalName || file.fileName}</a> - {file.kind}
                </div>
              )) : <p className="maintenance-empty">لا توجد مرفقات.</p>}
            </div>
            <div className="card section" style={{ padding: 12 }}>
              <h3 style={{ marginTop: 0 }}>السجل الزمني</h3>
              {(selected.timeline || []).slice().reverse().map((item, index) => (
                <div key={`${item.type}-${index}`} className="daily-plan-card-subtitle">
                  <strong>{item.actorName || 'النظام'}</strong> - {item.message || item.type}
                  <br />
                  <small>{formatDateTime(item.createdAt)}</small>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <CustomerSearchModal open={customerSearchOpen} onClose={() => setCustomerSearchOpen(false)} onSelect={chooseCustomer} />
      <CustomerModal open={customerModalOpen} customer={emptyCustomer} saving={saving} onClose={() => setCustomerModalOpen(false)} onSubmit={saveNewCustomer} />
    </div>
  );
}
