'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api, assetUrl } from '../../../lib/api';
import { authStorage } from '../../../lib/auth';
import FinancialDisbursementCalendar from '../../../components/financial-disbursements/FinancialDisbursementCalendar';
import { toDateInputValue } from '../../../lib/dailyWorkPlans';
import { compressImage, formatFileSize } from '../../../lib/imageUtils';
import { Permission, hasPermission } from '../../../lib/permissions';

const MAX_FINANCIAL_ATTACHMENTS = 20;
const FINANCIAL_ATTACHMENT_MAX_SIZE = 50 * 1024 * 1024;
const FINANCIAL_UPLOAD_TIMEOUT_MS = 8 * 60 * 1000;

const createEmptyForm = () => ({
  id: '',
  currency: 'IQD',
  transactionDate: '',
  items: [
    {
      requestType: 'TRANSPORT_EXPENSE',
      amount: '',
      description: '',
      notes: '',
    },
  ],
  files: [],
  existingAttachments: [],
});

const makeAttachmentId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const buildFileSignature = (file) =>
  [file?.name || '', Number(file?.size || 0), Number(file?.lastModified || 0), file?.type || ''].join('::');
const isImageFile = (file) => String(file?.type || '').startsWith('image/');

const typeLabelMap = {
  TRANSPORT_EXPENSE: 'نقل',
  FOOD_EXPENSE: 'طعام',
  MATERIALS_EXPENSE: 'مواد',
  WORK_ADVANCE: 'سلفة عمل',
  SALARY_ADVANCE: 'سلفة من راتب',
  BUSINESS_EXPENSE: 'مصروف تشغيلي',
  EXCEPTIONAL_EXPENSE: 'مصروف استثنائي',
  TRAVEL_EXPENSE: 'مصروف السفر',
  PURCHASE_REIMBURSEMENT: 'استرداد شراء',
  OTHER: 'أخرى',
};

const typeOptions = [
  ['TRANSPORT_EXPENSE', 'نقل'],
  ['FOOD_EXPENSE', 'طعام'],
  ['MATERIALS_EXPENSE', 'مواد'],
  ['WORK_ADVANCE', 'سلفة عمل'],
  ['SALARY_ADVANCE', 'سلفة من راتب'],
  ['BUSINESS_EXPENSE', 'مصروف تشغيلي'],
  ['EXCEPTIONAL_EXPENSE', 'مصروف استثنائي'],
  ['TRAVEL_EXPENSE', 'مصروف السفر'],
  ['PURCHASE_REIMBURSEMENT', 'استرداد شراء'],
  ['OTHER', 'أخرى'],
];

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ar-IQ');
};

const formatMoney = (value, currency = 'IQD') => {
  const amount = Number(value || 0);
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const rendered = Number.isInteger(safeAmount)
    ? String(safeAmount)
    : safeAmount.toFixed(2).replace(/\.?0+$/, '');
  return `${rendered} ${currency || 'IQD'}`;
};

const normalizeSearchText = (value) => String(value || '').trim().toLowerCase();

const getRequestApprovedAmount = (request) =>
  Number(request?.approvedAmount != null ? request.approvedAmount : request?.amount || 0);

const getRequestTotalAmount = (request) =>
  Number(request?.transactionTotalAmount || request?.amount || 0);

const sumUniqueTransactionTotalsByStatuses = (requests = [], statuses = []) => {
  const seenTransactions = new Set();

  return requests
    .filter((request) => statuses.includes(request.status))
    .reduce((sum, request) => {
      const transactionKey = String(request.transactionNo || request.id || request.requestNo || '').trim();
      if (transactionKey && seenTransactions.has(transactionKey)) {
        return sum;
      }

      if (transactionKey) {
        seenTransactions.add(transactionKey);
      }

      return sum + getRequestTotalAmount(request);
    }, 0);
};

const pendingManagementApprovalStatuses = [
  'PENDING_PROJECT_MANAGER_APPROVAL',
  'PENDING_FINANCIAL_MANAGER_APPROVAL',
  'PENDING_GENERAL_MANAGER_APPROVAL',
];

const approvedNotDeliveredStatuses = [
  'READY_FOR_DISBURSEMENT',
];

const deliveredAmountStatuses = [
  'DISBURSED',
  'PENDING_RECEIPT_CONFIRMATION',
  'RECEIVED',
  'CLOSED',
];

const createMonthAnchor = (value = new Date()) => {
  const safeValue = value || new Date();
  if (typeof safeValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(safeValue)) {
    const [year, month] = safeValue.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, 1, 12, 0, 0, 0));
  }
  const date = safeValue instanceof Date ? safeValue : new Date(safeValue);
  const resolvedDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return new Date(Date.UTC(resolvedDate.getUTCFullYear(), resolvedDate.getUTCMonth(), 1, 12, 0, 0, 0));
};

const isImageAttachment = (attachment = {}) => {
  const mimeType = String(attachment.mimeType || '').toLowerCase();
  const target = `${String(attachment.originalName || '').toLowerCase()} ${String(attachment.url || '').toLowerCase()}`;
  return mimeType.startsWith('image/')
    || /\.(jpg|jpeg|png|webp|gif|bmp|heic|heif)$/i.test(target);
};

const statusClassMap = {
  DRAFT: 'status-todo',
  PENDING_PROJECT_MANAGER_APPROVAL: 'status-submitted',
  PENDING_FINANCIAL_MANAGER_APPROVAL: 'status-submitted',
  PENDING_GENERAL_MANAGER_APPROVAL: 'status-submitted',
  READY_FOR_DISBURSEMENT: 'status-inprogress',
  DISBURSED: 'status-approved',
  CLOSED: 'status-approved',
  RETURNED_FOR_REVIEW: 'status-inprogress',
  REJECTED_BY_PROJECT_MANAGER: 'status-rejected',
  REJECTED_BY_FINANCIAL_MANAGER: 'status-rejected',
  REJECTED_BY_GENERAL_MANAGER: 'status-rejected',
};

function SortableHeader({ label, sortKey, activeSortKey, sortDirection, onSort, disabled }) {
  if (disabled) return <th>{label}</th>;
  const isActive = activeSortKey === sortKey;
  return (
    <th
      style={{ cursor: 'pointer', userSelect: 'none' }}
      onClick={() => onSort(sortKey)}
    >
      {label} {isActive ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
    </th>
  );
}

export default function FinancialDisbursementsPage() {
  const currentUser = authStorage.getUser();
  const canCreate = hasPermission(currentUser, Permission.CREATE_FINANCIAL_DISBURSEMENTS);
  const canReview = hasPermission(currentUser, Permission.REVIEW_FINANCIAL_DISBURSEMENTS);
  const canDisburse = hasPermission(currentUser, Permission.DISBURSE_FINANCIAL_FUNDS);
  const canViewFinancial = hasPermission(currentUser, Permission.VIEW_FINANCIAL_REPORTS);

  const [requests, setRequests] = useState([]);
  const [archivedRequests, setArchivedRequests] = useState([]);
  const [summary, setSummary] = useState(null);
  const [form, setForm] = useState(createEmptyForm);
  const [rowNotes, setRowNotes] = useState({});
  const [rowApprovedAmounts, setRowApprovedAmounts] = useState({});
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [activeAttachmentPreview, setActiveAttachmentPreview] = useState(null);
  const [activeTab, setActiveTab] = useState('active');
  const [viewMode, setViewMode] = useState('table');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => createMonthAnchor(new Date()));
  const [calendarSelectedDate, setCalendarSelectedDate] = useState(() => toDateInputValue(new Date()));
  const formRef = useRef(null);
  const detailsRef = useRef(null);
  const calendarSectionRef = useRef(null);
  const tableRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [statusFilter, setStatusFilter] = useState(null);

  const ownRequests = useMemo(
    () => requests.filter((request) => String(request.employee?.id || '') === String(currentUser?.id || '')),
    [requests, currentUser?.id],
  );
  const allRequests = useMemo(() => [...requests, ...archivedRequests], [requests, archivedRequests]);
  const pendingFilePreparations = useMemo(
    () => (form.files || []).some((file) => file.status === 'compressing'),
    [form.files],
  );
  const selectedAttachmentsCount = useMemo(
    () => (form.files || []).length,
    [form.files],
  );
  const selectedAttachmentsTotalSize = useMemo(
    () => (form.files || []).reduce((sum, file) => sum + Number(file.compressedSize || file.originalSize || 0), 0),
    [form.files],
  );
  const existingAttachmentsCount = useMemo(
    () => (form.existingAttachments || []).length,
    [form.existingAttachments],
  );
  const selectedTransactionRequests = useMemo(() => {
    if (!selectedRequest) {
      return [];
    }

    const transactionKey = String(selectedRequest.transactionNo || selectedRequest.id || selectedRequest.requestNo || '').trim();
    const groupedRequests = allRequests.filter((request) => (
      String(request.transactionNo || request.id || request.requestNo || '').trim() === transactionKey
    ));
    const source = groupedRequests.length ? groupedRequests : [selectedRequest];

    return [...source].sort((a, b) => {
      const dateDiff = new Date(a.transactionDate || a.createdAt || 0).getTime()
        - new Date(b.transactionDate || b.createdAt || 0).getTime();
      if (dateDiff !== 0) {
        return dateDiff;
      }
      return String(a.requestNo || '').localeCompare(String(b.requestNo || ''), 'ar');
    });
  }, [selectedRequest, allRequests]);
  const selectedTransactionCurrency = selectedRequest?.currency || selectedTransactionRequests[0]?.currency || 'IQD';
  const selectedTransactionTotal = useMemo(
    () => selectedTransactionRequests.reduce((sum, request) => sum + Number(request.amount || 0), 0),
    [selectedTransactionRequests],
  );
  const selectedApprovedTotal = useMemo(
    () => selectedTransactionRequests.reduce(
      (sum, request) => sum + Number(request.approvedAmount != null ? request.approvedAmount : request.amount || 0),
      0,
    ),
    [selectedTransactionRequests],
  );
  const selectedTransactionAttachments = useMemo(() => {
    const seen = new Set();
    const attachments = [];

    selectedTransactionRequests.forEach((request) => {
      (request.attachments || []).forEach((attachment) => {
        const key = `${attachment.url || ''}::${attachment.originalName || ''}`;
        if (!key.trim() || seen.has(key)) {
          return;
        }
        seen.add(key);
        attachments.push(attachment);
      });
    });

    return attachments;
  }, [selectedTransactionRequests]);
  const selectedImageAttachments = useMemo(
    () => selectedTransactionAttachments.filter(isImageAttachment),
    [selectedTransactionAttachments],
  );
  const selectedDocumentAttachments = useMemo(
    () => selectedTransactionAttachments.filter((attachment) => !isImageAttachment(attachment)),
    [selectedTransactionAttachments],
  );

  const load = async () => {
    setLoading(true);
    setError('');

    try {
      const [requestsRes, archivedRes, summaryRes] = await Promise.all([
        api.get('/financial-disbursements'),
        api.get('/financial-disbursements?archived=true').catch(() => ({ requests: [] })),
        api.get('/financial-disbursements/summary').catch(() => ({ summary: null })),
      ]);
      setRequests(requestsRes.requests || []);
      setArchivedRequests(archivedRes.requests || []);
      setSummary(summaryRes.summary || null);
    } catch (err) {
      setError(err.message || 'تعذر تحميل بيانات الصرف المالي');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (viewMode !== 'calendar') {
      return undefined;
    }

    const rafId = window.requestAnimationFrame(() => {
      const el = calendarSectionRef.current;
      if (!el) return;
      const targetTop = el.getBoundingClientRect().top + window.scrollY - 88;
      window.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [viewMode, activeTab]);

  const resetForm = ({ close = true } = {}) => {
    setForm(createEmptyForm());
    setIsUploading(false);
    setUploadProgress(0);
    if (close) {
      setIsFormOpen(false);
    }
  };

  const openCreateForm = () => {
    setForm(createEmptyForm());
    setIsUploading(false);
    setUploadProgress(0);
    setSelectedRequest(null);
    setActiveAttachmentPreview(null);
    setError('');
    setInfo('');
    setStatusFilter(null);
    setActiveTab('active');
    setIsFormOpen(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  const updateFormItem = (index, key, value) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => (
        itemIndex === index
          ? { ...item, [key]: value }
          : item
      )),
    }));
  };

  const addFormItem = () => {
    setForm((current) => ({
      ...current,
      items: [
        ...(current.items || []),
        {
          requestType: 'TRANSPORT_EXPENSE',
          amount: '',
          description: '',
          notes: '',
        },
      ],
    }));
  };

  const removeFormItem = (index) => {
    setForm((current) => {
      if ((current.items || []).length <= 1) {
        return current;
      }

      return {
        ...current,
        items: current.items.filter((_, itemIndex) => itemIndex !== index),
      };
    });
  };

  const buildFormData = ({ forUpdate = false } = {}) => {
    const formData = new FormData();
    formData.append('currency', form.currency || 'IQD');

    if (form.transactionDate) {
      formData.append('transactionDate', form.transactionDate);
    }

    const normalizedItems = (form.items || []).map((item) => ({
      requestType: item.requestType,
      amount: String(item.amount || ''),
      description: item.description || '',
      notes: item.notes || '',
    }));

    if (forUpdate || normalizedItems.length <= 1) {
      const firstItem = normalizedItems[0] || {
        requestType: 'TRANSPORT_EXPENSE',
        amount: '',
        description: '',
        notes: '',
      };
      formData.append('requestType', firstItem.requestType);
      formData.append('amount', firstItem.amount);
      formData.append('description', firstItem.description);
      formData.append('notes', firstItem.notes);
    } else {
      formData.append('requests', JSON.stringify(normalizedItems));
    }

    (form.files || []).forEach((file) => {
      formData.append('attachments', file.uploadFile || file.file || file);
    });
    return formData;
  };

  const validateFormItems = () => {
    const normalizedItems = form.items || [];
    if (!normalizedItems.length) {
      setError('أضف طلب صرف واحد على الأقل.');
      return false;
    }

    for (const item of normalizedItems) {
      if (!item.requestType || !item.amount || !item.description?.trim()) {
        setError('يرجى تعبئة نوع الصرف والمبلغ والوصف لكل الطلبات داخل المعاملة.');
        return false;
      }
    }

    return true;
  };

  const appendFiles = async (fileList) => {
    const incomingFiles = Array.from(fileList || []);
    if (!incomingFiles.length) {
      return;
    }

    const existingFiles = form.files || [];
    const knownSignatures = new Set(existingFiles.map((file) => file.signature));
    const acceptedFiles = [];
    let skippedDuplicates = 0;
    let skippedOversized = 0;
    let skippedByLimit = 0;

    for (const file of incomingFiles) {
      const signature = buildFileSignature(file);

      if (knownSignatures.has(signature)) {
        skippedDuplicates += 1;
        continue;
      }

      if ((existingFiles.length + acceptedFiles.length) >= MAX_FINANCIAL_ATTACHMENTS) {
        skippedByLimit += 1;
        continue;
      }

      if (Number(file.size || 0) > FINANCIAL_ATTACHMENT_MAX_SIZE) {
        skippedOversized += 1;
        continue;
      }

      knownSignatures.add(signature);
      acceptedFiles.push({
        id: makeAttachmentId(),
        signature,
        originalName: file.name || 'attachment',
        mimeType: file.type || '',
        originalSize: Number(file.size || 0),
        compressedSize: Number(file.size || 0),
        uploadFile: file,
        status: isImageFile(file) ? 'compressing' : 'ready',
        error: '',
      });
    }

    if (!acceptedFiles.length) {
      const reasons = [];
      if (skippedDuplicates) reasons.push(`تم تجاهل ${skippedDuplicates} ملف مكرر.`);
      if (skippedOversized) reasons.push('بعض الملفات أكبر من 50 ميجابايت.');
      if (skippedByLimit) reasons.push(`الحد الأقصى هو ${MAX_FINANCIAL_ATTACHMENTS} مرفقًا.`);
      setError(reasons.join(' ') || 'لم يتم قبول أي ملف جديد.');
      return;
    }

    setError('');
    setForm((current) => ({
      ...current,
      files: [...(current.files || []), ...acceptedFiles],
    }));

    const notices = [];
    if (skippedDuplicates) notices.push(`تم تجاهل ${skippedDuplicates} ملف مكرر.`);
    if (skippedOversized) notices.push('بعض الملفات لم تُقبل لأن حجمها أكبر من 50 ميجابايت.');
    if (skippedByLimit) notices.push(`تم الوصول إلى الحد الأقصى ${MAX_FINANCIAL_ATTACHMENTS} مرفقًا.`);
    if (notices.length) {
      setInfo(notices.join(' '));
    }

    for (const item of acceptedFiles) {
      if (!isImageFile(item.uploadFile)) {
        continue;
      }

      try {
        const compressed = await compressImage(item.uploadFile);
        setForm((current) => ({
          ...current,
          files: (current.files || []).map((file) => (
            file.id === item.id
              ? {
                  ...file,
                  uploadFile: compressed,
                  compressedSize: Number(compressed.size || file.compressedSize || file.originalSize),
                  status: 'ready',
                  error: '',
                }
              : file
          )),
        }));
      } catch {
        setForm((current) => ({
          ...current,
          files: (current.files || []).map((file) => (
            file.id === item.id
              ? { ...file, status: 'ready', error: '' }
              : file
          )),
        }));
      }
    }
  };

  const removeSelectedFile = (fileId) => {
    setForm((current) => ({
      ...current,
      files: (current.files || []).filter((file) => file.id !== fileId),
    }));
  };

  const clearSelectedFiles = () => {
    setForm((current) => ({
      ...current,
      files: [],
    }));
  };

  const submitForm = async (mode = 'draft') => {
    if (!canCreate) {
      return;
    }

    if (!validateFormItems()) {
      return;
    }

    if (pendingFilePreparations) {
      setError('يرجى الانتظار حتى يكتمل تجهيز الصور والمرفقات.');
      return;
    }

    const hasAttachments = (form.files || []).length > 0;
    setSaving(true);
    setIsUploading(hasAttachments);
    setUploadProgress(0);
    setError('');
    setInfo('');

    try {
      if (form.id) {
        await api.patchWithProgress(`/financial-disbursements/${form.id}`, buildFormData({ forUpdate: true }), {
          timeoutMs: FINANCIAL_UPLOAD_TIMEOUT_MS,
          onProgress: hasAttachments ? ({ percent }) => setUploadProgress(percent) : undefined,
        });
        if (mode === 'submit') {
          await api.patch(`/financial-disbursements/${form.id}/submit`, {});
        }
      } else {
        const payload = buildFormData();
        payload.append('submitNow', mode === 'submit' ? '1' : '0');
        const created = await api.postWithProgress('/financial-disbursements', payload, {
          timeoutMs: FINANCIAL_UPLOAD_TIMEOUT_MS,
          onProgress: hasAttachments ? ({ percent }) => setUploadProgress(percent) : undefined,
        });

        if (Array.isArray(created?.requests) && created.requests.length > 1) {
          const total = Number(created.transactionTotalAmount || 0);
          setInfo(
            mode === 'submit'
              ? `تم إرسال المعاملة بنجاح. إجمالي مبالغ الطلبات: ${total} ${form.currency || 'IQD'}`
              : `تم حفظ المعاملة. إجمالي مبالغ الطلبات: ${total} ${form.currency || 'IQD'}`,
          );
          resetForm();
          await load();
          return;
        }
      }

      setInfo(mode === 'submit' ? 'تم حفظ الطلب وإرساله بنجاح.' : 'تم حفظ الطلب.');
      if (hasAttachments) {
        setUploadProgress(100);
      }
      resetForm();
      await load();
    } catch (err) {
      setUploadProgress(0);
      setError(err.message || 'فشل حفظ طلب الصرف');
    } finally {
      setSaving(false);
      setIsUploading(false);
    }
  };

  const beginEdit = (request) => {
    setForm({
      id: request.id,
      currency: request.currency || 'IQD',
      transactionDate: request.transactionDate
        ? new Date(request.transactionDate).toISOString().split('T')[0]
        : '',
      items: [
        {
          requestType: request.requestType || 'TRANSPORT_EXPENSE',
          amount: request.amount || '',
          description: request.description || '',
          notes: request.notes || '',
        },
      ],
      files: [],
      existingAttachments: request.attachments || [],
    });
    setSelectedRequest(null);
    setActiveAttachmentPreview(null);
    setActiveTab('active');
    setIsFormOpen(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  const setRowNote = (requestId, value) => {
    setRowNotes((current) => ({
      ...current,
      [requestId]: value,
    }));
  };

  const setRowApprovedAmount = (requestId, value) => {
    setRowApprovedAmounts((current) => ({
      ...current,
      [requestId]: value,
    }));
  };

  const runAction = async (request, stage, action) => {
    setSaving(true);
    setError('');
    setInfo('');

    const note = rowNotes[request.id] || '';
    const approvedAmount = rowApprovedAmounts[request.id];
    const routeByStage = {
      projectManager: `/financial-disbursements/${request.id}/project-manager-review`,
      financialManager: `/financial-disbursements/${request.id}/financial-manager-review`,
      generalManager: `/financial-disbursements/${request.id}/general-manager-review`,
    };

    try {
      await api.patch(routeByStage[stage], {
        action,
        notes: note,
        ...(approvedAmount !== undefined && approvedAmount !== ''
          ? { approvedAmount: Number(approvedAmount) }
          : {}),
      });
      setInfo('تم تنفيذ الإجراء بنجاح.');
      setRowNote(request.id, '');
      setRowApprovedAmount(request.id, '');
      await load();
    } catch (err) {
      setError(err.message || 'فشل تنفيذ الإجراء');
    } finally {
      setSaving(false);
    }
  };

  const submitExistingRequest = async (request) => {
    setSaving(true);
    setError('');
    setInfo('');

    try {
      await api.patch(`/financial-disbursements/${request.id}/submit`, {});
      setInfo('تم إرسال الطلب بنجاح.');
      await load();
    } catch (err) {
      setError(err.message || 'فشل إرسال الطلب');
    } finally {
      setSaving(false);
    }
  };

  const deliverRequest = async (request) => {
    setSaving(true);
    setError('');
    setInfo('');
    try {
      await api.patch(`/financial-disbursements/${request.id}/deliver`, {
        notes: rowNotes[request.id] || '',
      });
      setInfo('تم تسجيل تسليم المبلغ.');
      setRowNote(request.id, '');
      await load();
    } catch (err) {
      setError(err.message || 'فشل تسجيل تسليم المبلغ');
    } finally {
      setSaving(false);
    }
  };

  const confirmReceipt = async (request) => {
    setSaving(true);
    setError('');
    setInfo('');
    try {
      await api.patch(`/financial-disbursements/${request.id}/confirm-receipt`, {
        notes: rowNotes[request.id] || '',
      });
      setInfo('تم تأكيد استلام المبلغ وإغلاق الطلب.');
      setRowNote(request.id, '');
      await load();
    } catch (err) {
      setError(err.message || 'فشل تأكيد الاستلام');
    } finally {
      setSaving(false);
    }
  };

  const deleteRequest = async (request) => {
    if (!window.confirm(`هل أنت متأكد من مسح الطلب ${request.requestNo}؟ لا يمكن التراجع عن هذا الإجراء.`)) {
      return;
    }

    setSaving(true);
    setError('');
    setInfo('');
    try {
      await api.delete(`/financial-disbursements/${request.id}`);
      setInfo('تم مسح المعاملة بنجاح.');
      if (form.id === request.id) {
        resetForm();
      }
      await load();
    } catch (err) {
      setError(err.message || 'فشل مسح المعاملة');
    } finally {
      setSaving(false);
    }
  };

  const sendWhatsappReminder = (request) => {
    const lines = [
      '[ تذكير - طلب صرف مالي - Delta Plus ]',
      '----------------------------------',
      `رقم الطلب: ${request.requestNo}`,
      `نوع الصرف: ${typeLabelMap[request.requestType] || request.requestType}`,
      `المبلغ: ${request.amount} ${request.currency}`,
      `الحالة: ${request.statusLabel || request.status}`,
      `الموظف: ${request.employee?.fullName || '-'}`,
      request.description ? `الوصف: ${request.description}` : '',
      '----------------------------------',
      'يرجى متابعة الطلب في أقرب وقت.',
      '[ صادر من نظام Delta Plus ]',
    ].filter(Boolean).join('\n');

    const url = `https://wa.me/?text=${encodeURIComponent(lines)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const showTransactionDetails = (request) => {
    setSelectedRequest(request);
    setActiveAttachmentPreview(null);
    setInfo('تم فتح تفاصيل المعاملة.');
    setError('');
    setTimeout(() => detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  const archiveRequest = async (request) => {
    if (!window.confirm(`هل تريد أرشفة المعاملة المالية ${request.requestNo}؟`)) {
      return;
    }

    setSaving(true);
    setError('');
    setInfo('');
    try {
      await api.patch(`/financial-disbursements/${request.id}/archive`, {});
      if (selectedRequest?.id === request.id) {
        closeTransactionDetails();
      }
      setInfo('تمت أرشفة المعاملة المالية. يمكنك مراجعتها من الأرشيف المالي.');
      await load();
    } catch (err) {
      setError(err.message || 'فشلت أرشفة المعاملة المالية');
    } finally {
      setSaving(false);
    }
  };

  const unarchiveRequest = async (request) => {
    if (!window.confirm(`هل تريد استرجاع المعاملة المالية ${request.requestNo} من الأرشيف؟`)) {
      return;
    }

    setSaving(true);
    setError('');
    setInfo('');
    try {
      await api.patch(`/financial-disbursements/${request.id}/unarchive`, {});
      if (selectedRequest?.id === request.id) {
        closeTransactionDetails();
      }
      setInfo('تم استرجاع المعاملة المالية من الأرشيف.');
      await load();
    } catch (err) {
      setError(err.message || 'فشل استرجاع المعاملة المالية من الأرشيف');
    } finally {
      setSaving(false);
    }
  };

  const closeTransactionDetails = () => {
    setSelectedRequest(null);
    setActiveAttachmentPreview(null);
  };

  const downloadTransactionPdf = async (request) => {
    try {
      const blob = await api.downloadBlob(`/financial-disbursements/${request.id}/pdf?download=1`);
      const link = document.createElement('a');
      const fileName = `financial-disbursement-${request.requestNo || request.id}.pdf`;
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      setError(err.message || 'فشل تحميل مستند الصرف PDF');
    }
  };

  const sendWhatsapp = (request) => {
    const lines = [
      '[ طلب صرف مالي - Delta Plus ]',
      '----------------------------------',
      `رقم الطلب: ${request.requestNo}`,
      `نوع الصرف: ${typeLabelMap[request.requestType] || request.requestType}`,
      `المبلغ: ${request.amount} ${request.currency}`,
      `الحالة: ${request.statusLabel || request.status}`,
      `الموظف: ${request.employee?.fullName || '-'}`,
      request.description ? `الوصف: ${request.description}` : '',
      '----------------------------------',
      'يرجى متابعة الطلب في أقرب وقت.',
      '[ صادر من نظام Delta Plus ]',
    ].filter(Boolean).join('\n');

    const url = `https://wa.me/?text=${encodeURIComponent(lines)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const renderAttachments = (request) => {
    const attachmentsCount = Array.isArray(request.attachments) ? request.attachments.length : 0;
    return (
      <span style={{ color: attachmentsCount ? 'var(--text)' : 'var(--text-soft)', fontWeight: 700 }}>
        {attachmentsCount}
      </span>
    );
  };

  const isReviewable = (request) =>
    request.canReviewAsProjectManager || request.canReviewAsFinancialManager || request.canReviewAsGeneralManager;

  const [searchText, setSearchText] = useState('');
  const visibleRequests = activeTab === 'archive' ? archivedRequests : requests;
  const employeeSearchText = normalizeSearchText(searchText);
  const employeeOptions = useMemo(() => {
    const employees = new Map();
    visibleRequests.forEach((request) => {
      const employeeName = String(request.employee?.fullName || '').trim();
      if (employeeName) {
        employees.set(employeeName, employeeName);
      }
    });
    return Array.from(employees.values()).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [visibleRequests]);
  const employeeSummaryRequests = useMemo(() => {
    if (!employeeSearchText) {
      return [];
    }

    return visibleRequests.filter((request) =>
      normalizeSearchText(request.employee?.fullName).includes(employeeSearchText),
    );
  }, [employeeSearchText, visibleRequests]);
  const employeeFinancialSummary = useMemo(() => {
    const emptySummary = {
      hasSearch: Boolean(employeeSearchText),
      requests: [],
      currency: 'IQD',
      cards: [],
    };

    if (!employeeSearchText) {
      return emptySummary;
    }

    const summaryRequests = employeeSummaryRequests;
    const currency = summaryRequests.find((request) => request.currency)?.currency || 'IQD';
    const sumByStatuses = (statuses, amountResolver = getRequestTotalAmount) =>
      summaryRequests
        .filter((request) => statuses.includes(request.status))
        .reduce((sum, request) => sum + amountResolver(request), 0);
    const financialApprovedAmount = sumByStatuses(['READY_FOR_DISBURSEMENT', 'DISBURSED', 'CLOSED'], getRequestApprovedAmount);
    const financialPendingAmount = sumUniqueTransactionTotalsByStatuses(summaryRequests, ['PENDING_FINANCIAL_MANAGER_APPROVAL']);
    const projectPendingAmount = sumUniqueTransactionTotalsByStatuses(summaryRequests, ['PENDING_PROJECT_MANAGER_APPROVAL']);
    const generalPendingAmount = sumUniqueTransactionTotalsByStatuses(summaryRequests, ['PENDING_GENERAL_MANAGER_APPROVAL']);
    const deliveredAmount = sumByStatuses(deliveredAmountStatuses, getRequestApprovedAmount);
    const totalPendingAndApprovedAmount = financialPendingAmount
      + projectPendingAmount
      + generalPendingAmount
      + financialApprovedAmount
      - deliveredAmount;

    return {
      hasSearch: true,
      requests: summaryRequests,
      currency,
      cards: [
        {
          key: 'financial-approved',
          label: 'المعتمد من المدير المالي',
          statuses: ['READY_FOR_DISBURSEMENT', 'DISBURSED', 'CLOSED'],
          amount: financialApprovedAmount,
        },
        {
          key: 'financial-pending',
          label: 'بانتظار المدير المالي',
          statuses: ['PENDING_FINANCIAL_MANAGER_APPROVAL'],
          amount: financialPendingAmount,
        },
        {
          key: 'project-pending',
          label: 'متوقف عند مدير المشاريع',
          statuses: ['PENDING_PROJECT_MANAGER_APPROVAL'],
          amount: projectPendingAmount,
        },
        {
          key: 'general-pending',
          label: 'متوقف عند المدير العام',
          statuses: ['PENDING_GENERAL_MANAGER_APPROVAL'],
          amount: generalPendingAmount,
        },
        {
          key: 'delivered',
          label: 'المبالغ التي تم تسليمها فعليًا للموظف',
          statuses: deliveredAmountStatuses,
          amount: deliveredAmount,
        },
        {
          key: 'total',
          label: 'المجموع الكلي',
          statuses: [...pendingManagementApprovalStatuses, ...approvedNotDeliveredStatuses],
          amount: totalPendingAndApprovedAmount,
        },
      ],
    };
  }, [employeeSearchText, employeeSummaryRequests]);
  const filteredRequests = useMemo(() => {
    let result = visibleRequests;
    if (statusFilter) {
      result = result.filter(r => statusFilter.includes(r.status));
    }
    if (searchText) {
      const lower = searchText.toLowerCase();
      result = result.filter(r =>
        String(r.requestNo || '').toLowerCase().includes(lower) ||
        String(r.employee?.fullName || '').toLowerCase().includes(lower) ||
        String(typeLabelMap[r.requestType] || r.requestType).toLowerCase().includes(lower) ||
        String(r.description || '').toLowerCase().includes(lower)
      );
    }
    return result;
  }, [searchText, statusFilter, visibleRequests]);

  const transactionItemCounts = useMemo(() => {
    const counts = new Map();
    visibleRequests.forEach((request) => {
      const key = String(request.transactionNo || request.id || request.requestNo || '').trim();
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
  }, [visibleRequests]);

  const [finSK, setFinSK] = useState('');
  const [finSD, setFinSD] = useState('asc');

  const sortAccessors = {
    requestNo: (r) => r.requestNo,
    transactionDate: (r) => r.transactionDate || r.createdAt || '',
    employee: (r) => r.employee?.fullName || '',
    amount: (r) => Number(r.amount || 0),
    totalAmount: (r) => Number(r.transactionTotalAmount || r.amount || 0),
    status: (r) => r.status,
    attachments: (r) => (r.attachments || []).length,
    points: (r) => Number(r.pointsImpact || 0),
  };

  const finSort = (key) => {
    if (finSK === key) {
      setFinSD((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setFinSK(key);
      setFinSD('asc');
    }
  };

  const sortedRequests = useMemo(() => {
    if (!finSK) return filteredRequests;
    const accessor = sortAccessors[finSK];
    if (!accessor) return filteredRequests;
    return [...filteredRequests].sort((a, b) => {
      const va = accessor(a);
      const vb = accessor(b);
      let cmp = 0;
      if (typeof va === 'number' && typeof vb === 'number') {
        cmp = va - vb;
      } else {
        cmp = String(va).localeCompare(String(vb), 'ar');
      }
      return finSD === 'asc' ? cmp : -cmp;
    });
  }, [filteredRequests, finSK, finSD]);

  const getRequestDateKey = (request) =>
    toDateInputValue(request?.transactionDate || request?.createdAt || request?.submittedAt);

  const getRequestStatusClass = (request) =>
    request?.archived ? 'status-archived' : (statusClassMap[request?.status] || 'status-todo');

  const handleCalendarDateSelect = (dateKey) => {
    setCalendarSelectedDate(dateKey || '');
    if (dateKey) {
      setCalendarMonth(createMonthAnchor(dateKey));
    }
  };

  const handleCalendarMonthChange = (nextMonth) => {
    const nextAnchor = createMonthAnchor(nextMonth);
    setCalendarMonth(nextAnchor);

    if (!calendarSelectedDate) {
      return;
    }

    const selectedAnchor = createMonthAnchor(calendarSelectedDate);
    const sameMonth = selectedAnchor.getUTCFullYear() === nextAnchor.getUTCFullYear()
      && selectedAnchor.getUTCMonth() === nextAnchor.getUTCMonth();

    if (!sameMonth) {
      setCalendarSelectedDate('');
    }
  };

  const renderRequestActionPanel = (request, { compact = false } = {}) => {
    const softButtonClass = compact ? 'btn btn-soft btn-sm' : 'btn btn-soft';
    const primaryButtonClass = compact ? 'btn btn-primary btn-sm' : 'btn btn-primary';
    const showNoteInput = !request.archived && (!compact || isReviewable(request) || request.canDeliverFunds || request.canConfirmReceipt);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {showNoteInput ? (
          <textarea
            className="input"
            rows={compact ? 2 : 2}
            placeholder="ملاحظات الإجراء"
            value={rowNotes[request.id] || ''}
            onChange={(e) => setRowNote(request.id, e.target.value)}
          />
        ) : null}

        {!request.archived && isReviewable(request) ? (
          <label style={{ fontSize: 12 }}>
            المبلغ المعتمد
            <input
              className="input"
              type="number"
              min={0}
              max={request.amount}
              placeholder={String(request.amount)}
              value={rowApprovedAmounts[request.id] ?? ''}
              onChange={(e) => setRowApprovedAmount(request.id, e.target.value)}
              style={{ width: '100%' }}
            />
            <small style={{ color: 'var(--text-soft)' }}>اتركه فارغًا لاعتماد المبلغ الكامل</small>
          </label>
        ) : null}

        {request.archivedBy?.fullName ? (
          <div style={{ color: 'var(--text-soft)', fontSize: 12 }}>
            تم الأرشفة بواسطة: {request.archivedBy.fullName}
          </div>
        ) : null}

        <div className={compact ? 'daily-plan-actions' : ''} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <button className={softButtonClass} type="button" onClick={() => showTransactionDetails(request)}>عرض المعاملة</button>
          <button className={softButtonClass} type="button" onClick={() => downloadTransactionPdf(request)}>PDF</button>
          <button className={softButtonClass} type="button" onClick={() => sendWhatsapp(request)}>واتساب</button>
          {request.canEdit ? <button className={softButtonClass} type="button" onClick={() => beginEdit(request)}>تعديل</button> : null}
          {request.canSubmit ? <button className={primaryButtonClass} type="button" onClick={() => submitExistingRequest(request)}>إرسال</button> : null}
          {request.canReviewAsProjectManager ? <button className={primaryButtonClass} type="button" onClick={() => runAction(request, 'projectManager', 'APPROVE')}>اعتماد مدير المشاريع</button> : null}
          {request.canReviewAsProjectManager ? <button className={softButtonClass} type="button" onClick={() => runAction(request, 'projectManager', 'RETURN_FOR_REVIEW')}>إعادة للمراجعة</button> : null}
          {request.canReviewAsProjectManager ? <button className={softButtonClass} type="button" style={{ color: '#ff9b9b' }} onClick={() => runAction(request, 'projectManager', 'REJECT')}>رفض</button> : null}
          {request.canReviewAsFinancialManager ? <button className={primaryButtonClass} type="button" onClick={() => runAction(request, 'financialManager', 'APPROVE')}>اعتماد مالي</button> : null}
          {request.canRequestGeneralManager ? <button className={softButtonClass} type="button" onClick={() => runAction(request, 'financialManager', 'REQUEST_GENERAL_MANAGER_APPROVAL')}>طلب اعتماد المدير العام</button> : null}
          {request.canReviewAsFinancialManager ? <button className={softButtonClass} type="button" onClick={() => runAction(request, 'financialManager', 'RETURN_FOR_REVIEW')}>إعادة للمراجعة</button> : null}
          {request.canReviewAsFinancialManager ? <button className={softButtonClass} type="button" style={{ color: '#ff9b9b' }} onClick={() => runAction(request, 'financialManager', 'REJECT')}>رفض</button> : null}
          {request.canReviewAsGeneralManager ? <button className={primaryButtonClass} type="button" onClick={() => runAction(request, 'generalManager', 'APPROVE')}>اعتماد المدير العام</button> : null}
          {request.canReviewAsGeneralManager ? <button className={softButtonClass} type="button" onClick={() => runAction(request, 'generalManager', 'RETURN_FOR_REVIEW')}>إعادة للمراجعة</button> : null}
          {request.canReviewAsGeneralManager ? <button className={softButtonClass} type="button" style={{ color: '#ff9b9b' }} onClick={() => runAction(request, 'generalManager', 'REJECT')}>رفض</button> : null}
          {request.canDeliverFunds ? <button className={primaryButtonClass} type="button" onClick={() => deliverRequest(request)}>تسليم المبلغ</button> : null}
          {request.canConfirmReceipt ? <button className={primaryButtonClass} type="button" onClick={() => confirmReceipt(request)}>تم استلام المبلغ</button> : null}
          {request.canDelete ? <button className={softButtonClass} type="button" style={{ color: '#ff9b9b' }} onClick={() => deleteRequest(request)}>مسح</button> : null}
          {request.canArchive ? <button className={softButtonClass} type="button" style={{ color: '#78909c' }} onClick={() => archiveRequest(request)}>أرشفة</button> : null}
          {request.canUnarchive ? <button className={softButtonClass} type="button" onClick={() => unarchiveRequest(request)}>استرجاع من الأرشيف</button> : null}
          <button className={softButtonClass} type="button" onClick={() => sendWhatsappReminder(request)}>تذكير واتساب</button>
        </div>
      </div>
    );
  };

  const renderRequestCard = (request, { compact = false } = {}) => {
    const transactionKey = String(request.transactionNo || request.id || request.requestNo || '').trim();
    const transactionItemsCount = transactionItemCounts.get(transactionKey) || 1;

    return (
      <article
        key={request.id}
        className={`daily-plan-card ${request.archived ? 'daily-plan-card-archived' : ''}`}
      >
        <div className="maintenance-card-header">
          <div>
            <strong>{request.requestNo}</strong>
            <div className="daily-plan-card-subtitle">
              {request.employee?.fullName || '-'} • عدد المعاملات: {transactionItemsCount}
            </div>
          </div>
          <div className="daily-plan-chip-row">
            {request.archived ? <span className="status-pill status-archived">مؤرشف</span> : null}
            <span className={`status-pill ${getRequestStatusClass(request)}`}>
              {request.archived ? 'مؤرشف' : (request.statusLabel || request.status)}
            </span>
          </div>
        </div>

        <div className="daily-plan-mini-grid">
          <div>
            <span>تاريخ المعاملة</span>
            <strong>{formatDateTime(request.transactionDate || request.createdAt || request.submittedAt)}</strong>
          </div>
          <div>
            <span>النوع</span>
            <strong>{typeLabelMap[request.requestType] || request.requestType || '-'}</strong>
          </div>
          <div>
            <span>المبلغ</span>
            <strong>{formatMoney(request.amount, request.currency)}</strong>
          </div>
          <div>
            <span>إجمالي المعاملة</span>
            <strong>{formatMoney(request.transactionTotalAmount || request.amount, request.currency)}</strong>
          </div>
          <div>
            <span>المرفقات</span>
            <strong>{Array.isArray(request.attachments) ? request.attachments.length : 0}</strong>
          </div>
          <div>
            <span>النقاط</span>
            <strong>{request.pointsImpact > 0 ? `+${request.pointsImpact}` : request.pointsImpact}</strong>
          </div>
        </div>

        {request.approvedAmount != null ? (
          <div className="daily-plan-card-subtitle">
            المبلغ المعتمد: {formatMoney(request.approvedAmount, request.currency)}
          </div>
        ) : null}
        {request.archivedAt ? (
          <div className="daily-plan-archive-meta">
            <span>تاريخ الأرشفة: {formatDateTime(request.archivedAt)}</span>
            <span>بواسطة: {request.archivedBy?.fullName || '-'}</span>
          </div>
        ) : null}

        {!compact && request.description ? (
          <div className="daily-plan-card-subtitle" style={{ lineHeight: 1.8 }}>
            {request.description}
          </div>
        ) : null}

        <div style={{ marginTop: 14 }}>
          {renderRequestActionPanel(request, { compact })}
        </div>
      </article>
    );
  };

  if (loading) {
    return <section className="card section">جارٍ تحميل نظام الصرف المالي...</section>;
  }

  return (
    <>
      {error ? <section className="card section" style={{ color: 'var(--danger)' }}>{error}</section> : null}
      {info ? <section className="card section" style={{ color: 'var(--accent)' }}>{info}</section> : null}

      <section className="card section" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: '0 0 6px' }}>{activeTab === 'archive' ? 'أرشيف الصرف المالي' : 'طلبات الصرف المالي'}</h2>
            <p style={{ margin: 0, color: 'var(--text-soft)' }}>
              {activeTab === 'archive'
                ? `عدد المعاملات المؤرشفة: ${archivedRequests.length}`
                : `عدد المعاملات الحالية: ${requests.length}`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {canCreate ? (
              <button className="btn btn-primary" type="button" onClick={openCreateForm}>
                طلب صرف مالي
              </button>
            ) : null}
            <button
              className="btn btn-soft"
              type="button"
              onClick={() => {
                setActiveTab('active');
                setStatusFilter(null);
              }}
              style={activeTab === 'active' ? { outline: '2px solid var(--accent)' } : undefined}
            >
              المعاملات الحالية ({requests.length})
            </button>
            <button
              className="btn btn-soft"
              type="button"
              onClick={() => {
                setActiveTab('archive');
                setIsFormOpen(false);
                setStatusFilter(null);
                closeTransactionDetails();
              }}
              style={activeTab === 'archive' ? { outline: '2px solid var(--accent)' } : undefined}
            >
              أرشيف مالي ({archivedRequests.length})
            </button>
          </div>
        </div>
      </section>

      {activeTab === 'active' && (canReview || canDisburse || canViewFinancial || currentUser?.role === 'GENERAL_MANAGER') && summary ? (
        <section className="grid-4" style={{ marginBottom: 16 }}>
          {[
            { key: null, label: 'إجمالي الطلبات', count: summary.total || 0 },
            { key: ['PENDING_PROJECT_MANAGER_APPROVAL'], label: 'بانتظار مدير المشاريع', count: summary.pendingProjectManager || 0 },
            { key: ['PENDING_FINANCIAL_MANAGER_APPROVAL', 'PENDING_GENERAL_MANAGER_APPROVAL'], label: 'بانتظار المدير المالي', count: summary.pendingFinancialManager || 0 },
            { key: ['READY_FOR_DISBURSEMENT'], label: 'جاهزة للتسليم', count: summary.readyForDisbursement || 0 },
          ].map((item) => {
            const isActive = statusFilter === item.key || (statusFilter === null && item.key === null);
            return (
              <article
                key={item.label}
                className="card section"
                onClick={() => {
                  const next = isActive && item.key !== null ? null : item.key;
                  setStatusFilter(next);
                  setTimeout(() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
                }}
                style={{
                  cursor: 'pointer',
                  outline: isActive && item.key !== null ? '2px solid var(--accent)' : 'none',
                  transition: 'outline .15s, transform .15s',
                }}
              >
                <p style={{ marginTop: 0, color: 'var(--text-soft)' }}>{item.label}</p>
                <h2>{item.count}</h2>
              </article>
            );
          })}
        </section>
      ) : null}

      {canCreate && activeTab === 'active' && isFormOpen ? (
        <section ref={formRef} className="card section" style={{ marginBottom: 16 }}>
          <h2>{form.id ? 'تعديل طلب صرف مالي' : 'طلب صرف مالي جديد'}</h2>
          <form className="grid-3" onSubmit={(event) => event.preventDefault()}>
            <label>
              العملة
              <input className="input" value={form.currency} onChange={(e) => setForm((current) => ({ ...current, currency: e.target.value.toUpperCase() }))} />
            </label>

            <label>
              تاريخ المعاملة
              <input
                className="input"
                type="date"
                value={form.transactionDate}
                onChange={(e) => setForm((current) => ({ ...current, transactionDate: e.target.value }))}
              />
            </label>

            <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {form.items.map((item, index) => (
                <div key={`financial-item-${index}`} className="card section" style={{ padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <strong>طلب #{index + 1}</strong>
                    {(form.items || []).length > 1 ? (
                      <button className="btn btn-soft" type="button" onClick={() => removeFormItem(index)}>حذف</button>
                    ) : null}
                  </div>

                  <div className="grid-3">
                    <label>
                      نوع الصرف
                      <select className="select" value={item.requestType} onChange={(e) => updateFormItem(index, 'requestType', e.target.value)}>
                        {typeOptions.map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </label>

                    <label>
                      المبلغ
                      <input className="input" type="number" min={1} value={item.amount} onChange={(e) => updateFormItem(index, 'amount', e.target.value)} required />
                    </label>

                    <label style={{ gridColumn: '1 / -1' }}>
                      وصف الطلب
                      <textarea className="input" rows={2} value={item.description} onChange={(e) => updateFormItem(index, 'description', e.target.value)} required />
                    </label>

                    <label style={{ gridColumn: '1 / -1' }}>
                      ملاحظات
                      <textarea className="input" rows={2} value={item.notes} onChange={(e) => updateFormItem(index, 'notes', e.target.value)} />
                    </label>
                  </div>
                </div>
              ))}

              {!form.id ? (
                <div>
                  <button className="btn btn-soft" type="button" onClick={addFormItem}>+ إضافة طلب جديد بنفس المعاملة</button>
                </div>
              ) : null}
            </div>

            <label style={{ gridColumn: '1 / -1' }}>
              المرفقات
              <input
                className="input"
                type="file"
                multiple
                onChange={(e) => {
                  const selectedFiles = Array.from(e.target.files || []);
                  e.target.value = '';
                  appendFiles(selectedFiles);
                }}
              />
              <small style={{ color: 'var(--text-soft)' }}>
                يمكنك إضافة المرفقات على دفعات. الحد الأقصى {MAX_FINANCIAL_ATTACHMENTS} ملفًا وبحجم يصل إلى 50 ميجابايت لكل ملف، مع ضغط الصور تلقائيًا عند الحاجة.
              </small>
            </label>

            {form.id && existingAttachmentsCount ? (
              <div style={{ gridColumn: '1 / -1', border: '1px solid var(--stroke)', borderRadius: 12, padding: 10 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>المرفقات الحالية محفوظة مع الطلب</div>
                <div style={{ color: 'var(--text-soft)', fontSize: 13 }}>
                  عدد المرفقات الحالية: {existingAttachmentsCount}
                </div>
              </div>
            ) : null}

            {selectedAttachmentsCount ? (
              <div style={{ gridColumn: '1 / -1', border: '1px solid var(--stroke)', borderRadius: 12, padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>المرفقات الجديدة</div>
                    <div style={{ color: 'var(--text-soft)', fontSize: 12, marginTop: 4 }}>
                      تم اختيار {selectedAttachmentsCount} مرفق من أصل {MAX_FINANCIAL_ATTACHMENTS}
                    </div>
                    <div style={{ color: 'var(--text-soft)', fontSize: 12, marginTop: 2 }}>
                      الحجم الإجمالي التقريبي: {formatFileSize(selectedAttachmentsTotalSize)}
                    </div>
                    <div style={{ color: 'var(--text-soft)', fontSize: 12, marginTop: 2 }}>
                      {pendingFilePreparations ? 'جارٍ تجهيز بعض الصور للرفع...' : 'كل المرفقات جاهزة للرفع'}
                    </div>
                  </div>
                  <button
                    className="btn btn-soft"
                    type="button"
                    disabled={saving || isUploading}
                    onClick={clearSelectedFiles}
                  >
                    مسح المرفقات الجديدة
                  </button>
                </div>
              </div>
            ) : null}

            {isUploading ? (
              <div style={{ gridColumn: '1 / -1', border: '1px solid var(--stroke)', borderRadius: 12, padding: 10 }}>
                <div style={{ marginBottom: 8, fontWeight: 700 }}>جارٍ رفع المرفقات... {uploadProgress}%</div>
                <progress value={uploadProgress} max="100" style={{ width: '100%' }} />
              </div>
            ) : null}

            {form.id ? (
              <div className="form-actions">
                <button className="btn btn-primary" type="button" disabled={saving || pendingFilePreparations || isUploading} onClick={() => submitForm('draft')}>{saving ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}</button>
                <button className="btn btn-soft" type="button" disabled={saving || pendingFilePreparations || isUploading} onClick={() => submitForm('submit')}>حفظ وإرسال</button>
                <button className="btn btn-soft" type="button" disabled={saving || isUploading} onClick={() => resetForm()}>إلغاء</button>
              </div>
            ) : (
              <div className="form-actions">
                <button className="btn btn-soft" type="button" disabled={saving || pendingFilePreparations || isUploading} onClick={() => submitForm('draft')}>
                  {saving ? 'جارٍ الحفظ...' : (form.items.length > 1 ? 'حفظ المعاملة كمسودة' : 'حفظ كمسودة')}
                </button>
                <button className="btn btn-primary" type="button" disabled={saving || pendingFilePreparations || isUploading} onClick={() => submitForm('submit')}>
                  {form.items.length > 1 ? 'إرسال المعاملة' : 'إرسال الطلب'}
                </button>
                <button className="btn btn-soft" type="button" disabled={saving || isUploading} onClick={() => resetForm()}>
                  إغلاق
                </button>
              </div>
            )}
          </form>
        </section>
      ) : null}

      {canCreate && activeTab === 'active' ? (
        <section className="card section" style={{ marginBottom: 16 }}>
          <h2>طلباتي</h2>
          <p style={{ color: 'var(--text-soft)' }}>عدد طلباتك الحالية: {ownRequests.length}</p>
        </section>
      ) : null}

      {selectedRequest ? (
        <div
          className="modal-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) closeTransactionDetails(); }}
        >
          <div
            ref={detailsRef}
            className="modal-panel"
            style={{
              animation: 'fadeIn .2s ease',
              width: 'min(1100px, calc(100vw - 32px))',
              maxHeight: 'calc(100vh - 32px)',
              overflowY: 'auto',
            }}
          >
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>تفاصيل المعاملة قبل الصرف</h3>
              <button className="modal-close" type="button" onClick={closeTransactionDetails}>✕</button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 10,
                marginBottom: 14,
              }}
            >
              {[
                { label: 'رقم المعاملة', value: selectedRequest.transactionNo || selectedRequest.requestNo || '-' },
                { label: 'عدد البنود', value: String(selectedTransactionRequests.length || 1) },
                { label: 'إجمالي المبلغ الكلي', value: formatMoney(selectedTransactionTotal, selectedTransactionCurrency) },
                { label: 'إجمالي المبلغ المعتمد', value: formatMoney(selectedApprovedTotal, selectedTransactionCurrency) },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    border: '1px solid var(--stroke)',
                    borderRadius: 12,
                    padding: 12,
                    background: 'var(--card)',
                  }}
                >
                  <div style={{ color: 'var(--text-soft)', fontSize: 12, marginBottom: 6 }}>{item.label}</div>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>{item.value}</div>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 10px' }}>ملخص المعاملة</h4>
              <div className="grid-3" style={{ gap: 10 }}>
                <div><strong>رقم الطلب المرجعي:</strong> {selectedRequest.requestNo}</div>
                <div><strong>تاريخ المعاملة:</strong> {formatDateTime(selectedRequest.transactionDate || selectedRequest.createdAt)}</div>
                <div><strong>الموظف:</strong> {selectedRequest.employee?.fullName || '-'}</div>
                <div><strong>الحالة:</strong> {selectedRequest.statusLabel || selectedRequest.status || '-'}</div>
                <div><strong>العملة:</strong> {selectedTransactionCurrency}</div>
                <div><strong>عدد المرفقات:</strong> {selectedTransactionAttachments.length}</div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 10px' }}>تفاصيل البنود</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {selectedTransactionRequests.map((item, index) => (
                  <div
                    key={item.id || `${item.requestNo}-${index}`}
                    style={{
                      border: '1px solid var(--stroke)',
                      borderRadius: 12,
                      padding: 12,
                      background: 'rgba(255,255,255,0.02)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 8,
                        marginBottom: 10,
                      }}
                    >
                      <div style={{ fontWeight: 800 }}>الطلب {item.requestNo || `#${index + 1}`}</div>
                      <div style={{ color: 'var(--text-soft)', fontSize: 12 }}>
                        {typeLabelMap[item.requestType] || item.requestType} • {formatDateTime(item.transactionDate || item.createdAt)}
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: 10,
                        marginBottom: 10,
                      }}
                    >
                      <div>
                        <div style={{ color: 'var(--text-soft)', fontSize: 12 }}>المبلغ المطلوب</div>
                        <div style={{ fontWeight: 700 }}>{formatMoney(item.amount, item.currency)}</div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-soft)', fontSize: 12 }}>المبلغ المعتمد</div>
                        <div style={{ fontWeight: 700 }}>
                          {item.approvedAmount != null ? formatMoney(item.approvedAmount, item.currency) : 'لم يحدد بعد'}
                        </div>
                      </div>
                    </div>

                    <div className="grid-2" style={{ gap: 10 }}>
                      <div>
                        <div style={{ color: 'var(--text-soft)', fontSize: 12, marginBottom: 6 }}>التفاصيل</div>
                        <div style={{ lineHeight: 1.8 }}>{item.description || '-'}</div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-soft)', fontSize: 12, marginBottom: 6 }}>الملاحظات</div>
                        <div style={{ lineHeight: 1.8 }}>{item.notes || '-'}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 10px' }}>المرفقات</h4>
              {selectedTransactionAttachments.length ? (
                <>
                  {selectedImageAttachments.length ? (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                        gap: 12,
                        marginBottom: selectedDocumentAttachments.length ? 12 : 0,
                      }}
                    >
                      {selectedImageAttachments.map((attachment, index) => (
                        <button
                          key={`${attachment.url || attachment.originalName}-${index}`}
                          type="button"
                          onClick={() => setActiveAttachmentPreview({
                            src: assetUrl(attachment.url),
                            name: attachment.originalName || `مرفق ${index + 1}`,
                          })}
                          style={{
                            border: '1px solid var(--stroke)',
                            borderRadius: 12,
                            padding: 8,
                            background: 'var(--card)',
                            cursor: 'pointer',
                            textAlign: 'right',
                          }}
                        >
                          <img
                            src={assetUrl(attachment.url)}
                            alt={attachment.originalName || `مرفق ${index + 1}`}
                            style={{
                              width: '100%',
                              height: 120,
                              objectFit: 'cover',
                              borderRadius: 8,
                              display: 'block',
                              marginBottom: 8,
                            }}
                          />
                          <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>
                            صورة مرفقة {index + 1}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {selectedDocumentAttachments.length ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {selectedDocumentAttachments.map((attachment, index) => (
                        <a
                          key={`${attachment.url || attachment.originalName}-doc-${index}`}
                          href={assetUrl(attachment.url)}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            border: '1px solid var(--stroke)',
                            borderRadius: 10,
                            padding: 10,
                            color: 'var(--text)',
                            textDecoration: 'none',
                          }}
                        >
                          <strong>{attachment.originalName || `مستند ${index + 1}`}</strong>
                          <div style={{ color: 'var(--text-soft)', fontSize: 12, marginTop: 4 }}>
                            {attachment.mimeType || 'مستند'}{attachment.size ? ` • ${formatFileSize(attachment.size)}` : ''}
                          </div>
                        </a>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <p style={{ color: 'var(--text-soft)', margin: 0 }}>لا توجد مرفقات لهذه المعاملة.</p>
              )}
            </div>

            <div style={{ marginTop: 10 }}>
              <strong>سجل الإجراءات:</strong>
              {(selectedRequest.workflowTrail || []).length ? (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {selectedRequest.workflowTrail.map((entry) => (
                    <div key={entry.id || `${entry.action}-${entry.occurredAt}`} style={{ border: '1px solid var(--stroke)', borderRadius: 8, padding: 8 }}>
                      <div style={{ fontSize: 13 }}><strong>{entry.action}</strong> - {entry.actor?.fullName || '-'} - {formatDateTime(entry.occurredAt)}</div>
                      <div style={{ color: 'var(--text-soft)', fontSize: 12 }}>
                        {entry.beforeStatusLabel || entry.beforeStatus || '-'} {' -> '} {entry.afterStatusLabel || entry.afterStatus || '-'}
                      </div>
                      {entry.notes ? <div style={{ marginTop: 4 }}>{entry.notes}</div> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--text-soft)', marginTop: 6 }}>لا يوجد سجل إجراءات بعد.</p>
              )}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
              <button className="btn btn-primary" type="button" onClick={() => downloadTransactionPdf(selectedRequest)}>
                تحميل PDF
              </button>
              <button className="btn btn-soft" type="button" onClick={() => sendWhatsapp(selectedRequest)}>
                مشاركة واتساب
              </button>
              <button className="btn btn-soft" type="button" onClick={closeTransactionDetails}>إغلاق</button>
            </div>
          </div>
        </div>
      ) : null}

      {activeAttachmentPreview ? (
        <div
          className="modal-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) setActiveAttachmentPreview(null); }}
        >
          <div
            style={{
              width: 'min(96vw, 1200px)',
              maxHeight: '96vh',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              alignItems: 'stretch',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#fff' }}>
              <strong>{activeAttachmentPreview.name}</strong>
              <button className="modal-close" type="button" onClick={() => setActiveAttachmentPreview(null)}>✕</button>
            </div>
            <img
              src={activeAttachmentPreview.src}
              alt={activeAttachmentPreview.name}
              style={{
                width: '100%',
                maxHeight: 'calc(96vh - 56px)',
                objectFit: 'contain',
                borderRadius: 12,
                background: 'rgba(0,0,0,0.65)',
              }}
            />
          </div>
        </div>
      ) : null}

      <section className="card section" style={{ marginTop: 16 }}>
        <div className="daily-plan-toolbar">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ margin: 0 }}>{activeTab === 'archive' ? 'خيارات عرض الأرشيف المالي' : 'خيارات عرض الصرف المالي'}</h2>
            <div className="action-row">
              {activeTab === 'active' && statusFilter ? (
                <button className="btn btn-soft" type="button" style={{ fontSize: 13 }} onClick={() => setStatusFilter(null)}>
                  إلغاء الفلتر
                </button>
              ) : null}
              <button className="btn btn-soft" type="button" onClick={() => load()} disabled={loading}>
                {loading ? 'جارٍ التحديث...' : 'تحديث'}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              className="input"
              type="text"
              list="financial-disbursement-employee-options"
              placeholder="بحث برقم الطلب، اسم الموظف، نوع الصرف، أو الوصف..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ maxWidth: 400, flex: '1 1 280px' }}
            />
            <datalist id="financial-disbursement-employee-options">
              {employeeOptions.map((employeeName) => (
                <option key={employeeName} value={employeeName} />
              ))}
            </datalist>
            <button className={`btn ${viewMode === 'table' ? 'btn-primary' : 'btn-soft'}`} type="button" onClick={() => setViewMode('table')}>
              عرض جدولي
            </button>
            <button className={`btn ${viewMode === 'cards' ? 'btn-primary' : 'btn-soft'}`} type="button" onClick={() => setViewMode('cards')}>
              عرض بطاقات
            </button>
            <button
              className={`btn ${viewMode === 'calendar' ? 'btn-primary' : 'btn-soft'}`}
              type="button"
              onClick={() => {
                if (!calendarSelectedDate) {
                  setCalendarSelectedDate(toDateInputValue(new Date()));
                }
                setCalendarMonth(createMonthAnchor(calendarSelectedDate || new Date()));
                setViewMode('calendar');
              }}
            >
              عرض التقويم
            </button>
          </div>
        </div>
      </section>

      {employeeFinancialSummary.hasSearch ? (
        <section className="card section" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <div>
              <h2 style={{ margin: '0 0 6px' }}>ملخص مبالغ الموظف</h2>
              <p style={{ margin: 0, color: 'var(--text-soft)' }}>
                {employeeFinancialSummary.requests.length
                  ? `تم احتساب ${employeeFinancialSummary.requests.length} طلب مطابق لاسم الموظف.`
                  : 'لا توجد طلبات صرف مطابقة لاسم الموظف الحالي.'}
              </p>
            </div>
            {statusFilter ? (
              <button className="btn btn-soft" type="button" onClick={() => setStatusFilter(null)}>
                عرض كل حالات الموظف
              </button>
            ) : null}
          </div>

          <div className="grid-4">
            {employeeFinancialSummary.cards.map((card) => {
              const isActive = (
                (!statusFilter && !card.statuses)
                || (
                  Array.isArray(statusFilter)
                  && Array.isArray(card.statuses)
                  && statusFilter.length === card.statuses.length
                  && statusFilter.every((status) => card.statuses.includes(status))
                )
              );

              return (
                <article
                  key={card.key}
                  className="card section"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setStatusFilter(isActive ? null : card.statuses);
                    setTimeout(() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setStatusFilter(isActive ? null : card.statuses);
                      setTimeout(() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
                    }
                  }}
                  style={{
                    cursor: 'pointer',
                    borderColor: isActive ? 'var(--accent)' : 'var(--border)',
                    outline: isActive ? '2px solid var(--accent)' : 'none',
                    transition: 'border-color .15s, outline .15s, transform .15s',
                  }}
                >
                  <p style={{ marginTop: 0, color: 'var(--text-soft)', minHeight: 38 }}>{card.label}</p>
                  <h2 style={{ marginBottom: 0 }}>{formatMoney(card.amount, employeeFinancialSummary.currency)}</h2>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <section ref={tableRef} className="card section" style={{ display: viewMode === 'table' ? 'block' : 'none', marginTop: 16 }}>
        <div style={{ display: 'none' }}>
          <h2 style={{ margin: 0 }}>{activeTab === 'archive' ? 'أرشيف الصرف المالي' : 'طلبات الصرف المالي'} {statusFilter ? `(${filteredRequests.length})` : ''}</h2>
          {activeTab === 'active' && statusFilter ? (
            <button className="btn btn-soft" type="button" style={{ fontSize: 13 }} onClick={() => setStatusFilter(null)}>
              ✕ إلغاء الفلتر
            </button>
          ) : null}
        </div>
        <div style={{ display: 'none' }}>
          <input
            className="input"
            type="text"
            placeholder="بحث برقم الطلب، اسم الموظف، نوع الصرف، أو الوصف..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ maxWidth: 400 }}
          />
        </div>
        <table className="table">
          <thead>
            <tr>
              <SortableHeader label="الطلب" sortKey="requestNo" accessor={(r) => r.requestNo} activeSortKey={finSK} sortDirection={finSD} onSort={finSort} />
              <SortableHeader label="تاريخ المعاملة" sortKey="transactionDate" accessor={(r) => r.transactionDate || r.createdAt || ''} activeSortKey={finSK} sortDirection={finSD} onSort={finSort} />
              <SortableHeader label="الموظف" sortKey="employee" accessor={(r) => r.employee?.fullName || ''} activeSortKey={finSK} sortDirection={finSD} onSort={finSort} />
              <SortableHeader label="القيمة" sortKey="amount" accessor={(r) => Number(r.amount || 0)} activeSortKey={finSK} sortDirection={finSD} onSort={finSort} />
              <SortableHeader label="إجمالي المعاملة" sortKey="totalAmount" accessor={(r) => Number(r.transactionTotalAmount || r.amount || 0)} activeSortKey={finSK} sortDirection={finSD} onSort={finSort} />
              <SortableHeader label="الحالة" sortKey="status" accessor={(r) => r.status} activeSortKey={finSK} sortDirection={finSD} onSort={finSort} />
              <SortableHeader label="المرفقات" sortKey="attachments" accessor={(r) => (r.attachments || []).length} activeSortKey={finSK} sortDirection={finSD} onSort={finSort} />
              <SortableHeader label="النقاط" sortKey="points" accessor={(r) => Number(r.pointsImpact || 0)} activeSortKey={finSK} sortDirection={finSD} onSort={finSort} />
              <SortableHeader label="الإجراءات" disabled />
            </tr>
          </thead>
          <tbody>
            {sortedRequests.length ? sortedRequests.map((request) => (
              <tr key={request.id}>
                <td>
                  <strong>{request.requestNo}</strong>
                  <div style={{ color: 'var(--text-soft)', fontSize: 12, marginTop: 4 }}>
                    عدد المعاملات: {transactionItemCounts.get(String(request.transactionNo || request.id || request.requestNo || '').trim()) || 1}
                  </div>
                </td>
                <td>{formatDateTime(request.transactionDate || request.createdAt || request.submittedAt)}</td>
                <td>{request.employee?.fullName || '-'}</td>
                <td>
                  {request.amount} {request.currency}
                  {request.approvedAmount != null && request.approvedAmount !== request.amount ? (
                    <div style={{ color: 'var(--accent)', fontSize: 12, marginTop: 4 }}>
                      المعتمد: {request.approvedAmount} {request.currency}
                    </div>
                  ) : null}
                </td>
                <td>{request.transactionTotalAmount || request.amount} {request.currency}</td>
                <td>
                  <span className={`status-pill ${request.archived ? 'status-archived' : (statusClassMap[request.status] || 'status-inprogress')}`}>
                    {request.archived ? 'مؤرشف' : (request.statusLabel || request.status)}
                  </span>
                  {request.requiresGeneralManagerApproval ? <div style={{ color: 'var(--text-soft)', fontSize: 12, marginTop: 4 }}>يتطلب اعتماد المدير العام</div> : null}
                  {request.projectManagerStepSkipped ? <div style={{ color: 'var(--text-soft)', fontSize: 12, marginTop: 2 }}>مباشر للمدير العام</div> : null}
                  {request.archivedAt ? <div style={{ color: 'var(--text-soft)', fontSize: 12, marginTop: 4 }}>أرشفة: {formatDateTime(request.archivedAt)}</div> : null}
                </td>
                <td>{renderAttachments(request)}</td>
                <td>{request.pointsImpact > 0 ? `+${request.pointsImpact}` : request.pointsImpact}</td>
                <td style={{ minWidth: 280 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {!request.archived ? (
                      <textarea
                        className="input"
                        rows={2}
                        placeholder="ملاحظات الإجراء"
                        value={rowNotes[request.id] || ''}
                        onChange={(e) => setRowNote(request.id, e.target.value)}
                      />
                    ) : request.archivedBy?.fullName ? (
                      <div style={{ color: 'var(--text-soft)', fontSize: 12 }}>
                        تم الأرشفة بواسطة: {request.archivedBy.fullName}
                      </div>
                    ) : null}

                    {!request.archived && isReviewable(request) ? (
                      <label style={{ fontSize: 12 }}>
                        المبلغ المعتمد
                        <input
                          className="input"
                          type="number"
                          min={0}
                          max={request.amount}
                          placeholder={String(request.amount)}
                          value={rowApprovedAmounts[request.id] ?? ''}
                          onChange={(e) => setRowApprovedAmount(request.id, e.target.value)}
                          style={{ width: '100%' }}
                        />
                        <small style={{ color: 'var(--text-soft)' }}>اترك فارغا لاعتماد المبلغ الكامل</small>
                      </label>
                    ) : null}

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {!request.archived && request.status !== 'DISBURSED' && request.status !== 'CLOSED' ? (
                        <button className="btn btn-soft" type="button" onClick={() => showTransactionDetails(request)}>عرض المعاملة</button>
                      ) : null}
                      {!request.archived && request.status !== 'DISBURSED' && request.status !== 'CLOSED' ? (
                        <button className="btn btn-soft" type="button" onClick={() => downloadTransactionPdf(request)}>PDF</button>
                      ) : null}
                      {request.archived ? (
                        <button className="btn btn-soft" type="button" onClick={() => showTransactionDetails(request)}>عرض المعاملة</button>
                      ) : null}
                      {request.archived ? (
                        <button className="btn btn-soft" type="button" onClick={() => downloadTransactionPdf(request)}>PDF</button>
                      ) : null}
                      <button className="btn btn-soft" type="button" onClick={() => sendWhatsapp(request)}>واتساب</button>
                      {request.canEdit ? <button className="btn btn-soft" type="button" onClick={() => beginEdit(request)}> تعديل</button> : null}
                      {request.canSubmit ? <button className="btn btn-primary" type="button" onClick={() => submitExistingRequest(request)}>إرسال</button> : null}
                      {request.canReviewAsProjectManager ? <button className="btn btn-primary" type="button" onClick={() => runAction(request, 'projectManager', 'APPROVE')}>اعتماد مدير المشاريع</button> : null}
                      {request.canReviewAsProjectManager ? <button className="btn btn-soft" type="button" onClick={() => runAction(request, 'projectManager', 'RETURN_FOR_REVIEW')}>إعادة للمراجعة</button> : null}
                      {request.canReviewAsProjectManager ? <button className="btn btn-soft" type="button" style={{ color: '#ff9b9b' }} onClick={() => runAction(request, 'projectManager', 'REJECT')}>رفض</button> : null}

                      {request.canReviewAsFinancialManager ? <button className="btn btn-primary" type="button" onClick={() => runAction(request, 'financialManager', 'APPROVE')}>اعتماد مالي</button> : null}
                      {request.canRequestGeneralManager ? <button className="btn btn-soft" type="button" onClick={() => runAction(request, 'financialManager', 'REQUEST_GENERAL_MANAGER_APPROVAL')}>طلب اعتماد المدير العام</button> : null}
                      {request.canReviewAsFinancialManager ? <button className="btn btn-soft" type="button" onClick={() => runAction(request, 'financialManager', 'RETURN_FOR_REVIEW')}>إعادة للمراجعة</button> : null}
                      {request.canReviewAsFinancialManager ? <button className="btn btn-soft" type="button" style={{ color: '#ff9b9b' }} onClick={() => runAction(request, 'financialManager', 'REJECT')}>رفض</button> : null}

                      {request.canReviewAsGeneralManager ? <button className="btn btn-primary" type="button" onClick={() => runAction(request, 'generalManager', 'APPROVE')}>اعتماد المدير العام</button> : null}
                      {request.canReviewAsGeneralManager ? <button className="btn btn-soft" type="button" onClick={() => runAction(request, 'generalManager', 'RETURN_FOR_REVIEW')}>إعادة للمراجعة</button> : null}
                      {request.canReviewAsGeneralManager ? <button className="btn btn-soft" type="button" style={{ color: '#ff9b9b' }} onClick={() => runAction(request, 'generalManager', 'REJECT')}>رفض</button> : null}

                      {request.canDeliverFunds ? <button className="btn btn-primary" type="button" onClick={() => deliverRequest(request)}>تسليم المبلغ</button> : null}
                      {request.canConfirmReceipt ? <button className="btn btn-primary" type="button" onClick={() => confirmReceipt(request)}>تم استلام المبلغ</button> : null}
                      {request.canDelete ? <button className="btn btn-soft" type="button" style={{ color: '#ff9b9b' }} onClick={() => deleteRequest(request)}>مسح</button> : null}
                      {request.canArchive ? <button className="btn btn-soft" type="button" style={{ color: '#78909c' }} onClick={() => archiveRequest(request)}>أرشفة</button> : null}
                      {request.canUnarchive ? <button className="btn btn-soft" type="button" onClick={() => unarchiveRequest(request)}>استرجاع من الأرشيف</button> : null}
                      <button className="btn btn-soft" type="button" onClick={() => sendWhatsappReminder(request)}>تذكير واتساب</button>
                    </div>
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-soft)' }}>{activeTab === 'archive' ? 'لا توجد معاملات مؤرشفة' : 'لا توجد طلبات'}</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {viewMode === 'cards' ? (
        <section className="card section" style={{ marginTop: 16 }}>
          <div className="daily-plan-card-grid">
            {sortedRequests.length ? sortedRequests.map((request) => renderRequestCard(request)) : (
              <p className="maintenance-empty">{activeTab === 'archive' ? 'لا توجد معاملات مؤرشفة مطابقة للعرض الحالي.' : 'لا توجد معاملات مطابقة للعرض الحالي.'}</p>
            )}
          </div>
        </section>
      ) : null}

      {viewMode === 'calendar' ? (
        <div ref={calendarSectionRef}>
          <FinancialDisbursementCalendar
            requests={sortedRequests}
            monthDate={calendarMonth}
            selectedDate={calendarSelectedDate}
            onSelectDate={handleCalendarDateSelect}
            onChangeMonth={handleCalendarMonthChange}
            renderRequestCard={renderRequestCard}
            getStatusClass={getRequestStatusClass}
            formatMoney={formatMoney}
            activeTab={activeTab}
          />
        </div>
      ) : null}
    </>
  );
}
