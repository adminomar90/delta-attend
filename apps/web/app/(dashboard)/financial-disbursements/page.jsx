'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, assetUrl } from '../../../lib/api';
import { authStorage } from '../../../lib/auth';
import { Permission, hasPermission } from '../../../lib/permissions';

const emptyForm = {
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
};

const typeLabelMap = {
  TRANSPORT_EXPENSE: 'نقل',
  FOOD_EXPENSE: 'طعام',
  MATERIALS_EXPENSE: 'مواد',
  WORK_ADVANCE: 'سلفة عمل',
  SALARY_ADVANCE: 'سلفة من راتب',
  BUSINESS_EXPENSE: 'مصروف تشغيلي',
  EXCEPTIONAL_EXPENSE: 'مصروف استثنائي',
  TRAVEL_EXPENSE: 'مصروف سفر',
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
  ['TRAVEL_EXPENSE', 'مصروف سفر'],
  ['PURCHASE_REIMBURSEMENT', 'استرداد شراء'],
  ['OTHER', 'أخرى'],
];

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ar-IQ');
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

export default function FinancialDisbursementsPage() {
  const currentUser = authStorage.getUser();
  const canCreate = hasPermission(currentUser, Permission.CREATE_FINANCIAL_DISBURSEMENTS);
  const canReview = hasPermission(currentUser, Permission.REVIEW_FINANCIAL_DISBURSEMENTS);
  const canDisburse = hasPermission(currentUser, Permission.DISBURSE_FINANCIAL_FUNDS);
  const canViewFinancial = hasPermission(currentUser, Permission.VIEW_FINANCIAL_REPORTS);

  const [requests, setRequests] = useState([]);
  const [summary, setSummary] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [rowNotes, setRowNotes] = useState({});
  const [rowApprovedAmounts, setRowApprovedAmounts] = useState({});
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const ownRequests = useMemo(
    () => requests.filter((request) => String(request.employee?.id || '') === String(currentUser?.id || '')),
    [requests, currentUser?.id],
  );

  const load = async () => {
    setLoading(true);
    setError('');

    try {
      const [requestsRes, summaryRes] = await Promise.all([
        api.get('/financial-disbursements'),
        api.get('/financial-disbursements/summary').catch(() => ({ summary: null })),
      ]);
      setRequests(requestsRes.requests || []);
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

  const resetForm = () => {
    setForm(emptyForm);
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
      formData.append('attachments', file);
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

  const submitForm = async (mode = 'draft') => {
    if (!canCreate) {
      return;
    }

    if (!validateFormItems()) {
      return;
    }

    setSaving(true);
    setError('');
    setInfo('');

    try {
      if (form.id) {
        await api.patch(`/financial-disbursements/${form.id}`, buildFormData({ forUpdate: true }));
        if (mode === 'submit') {
          await api.patch(`/financial-disbursements/${form.id}/submit`, {});
        }
      } else {
        const payload = buildFormData();
        payload.append('submitNow', mode === 'submit' ? '1' : '0');
        const created = await api.post('/financial-disbursements', payload);

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
      resetForm();
      await load();
    } catch (err) {
      setError(err.message || 'فشل حفظ طلب الصرف');
    } finally {
      setSaving(false);
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
    });
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
    setInfo('تم فتح تفاصيل المعاملة.');
    setError('');
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
    if (!request.attachments?.length) {
      return <span style={{ color: 'var(--text-soft)' }}>بدون مرفقات</span>;
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {request.attachments.map((attachment) => (
          <a
            key={attachment.id}
            href={assetUrl(attachment.url)}
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--accent)' }}
          >
            {attachment.originalName || 'مرفق'}
          </a>
        ))}
      </div>
    );
  };

  const isReviewable = (request) =>
    request.canReviewAsProjectManager || request.canReviewAsFinancialManager || request.canReviewAsGeneralManager;

  if (loading) {
    return <section className="card section">جارٍ تحميل نظام الصرف المالي...</section>;
  }

  return (
    <>
      {error ? <section className="card section" style={{ color: 'var(--danger)' }}>{error}</section> : null}
      {info ? <section className="card section" style={{ color: 'var(--accent)' }}>{info}</section> : null}

      {(canReview || canDisburse || canViewFinancial || currentUser?.role === 'GENERAL_MANAGER') && summary ? (
        <section className="grid-4" style={{ marginBottom: 16 }}>
          <article className="card section"><p style={{ marginTop: 0, color: 'var(--text-soft)' }}>إجمالي الطلبات</p><h2>{summary.total || 0}</h2></article>
          <article className="card section"><p style={{ marginTop: 0, color: 'var(--text-soft)' }}>بانتظار مدير المشاريع</p><h2>{summary.pendingProjectManager || 0}</h2></article>
          <article className="card section"><p style={{ marginTop: 0, color: 'var(--text-soft)' }}>بانتظار المدير المالي</p><h2>{summary.pendingFinancialManager || 0}</h2></article>
          <article className="card section"><p style={{ marginTop: 0, color: 'var(--text-soft)' }}>جاهزة للتسليم</p><h2>{summary.readyForDisbursement || 0}</h2></article>
        </section>
      ) : null}

      {canCreate ? (
        <section className="card section" style={{ marginBottom: 16 }}>
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
                onChange={(e) => setForm((current) => ({ ...current, files: Array.from(e.target.files || []) }))}
              />
              <small style={{ color: 'var(--text-soft)' }}>يمكنك إرفاق فواتير أو مستندات رسمية لدعم الطلب.</small>
            </label>

            {form.id ? (
              <div className="form-actions">
                <button className="btn btn-primary" type="button" disabled={saving} onClick={() => submitForm('draft')}>{saving ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}</button>
                <button className="btn btn-soft" type="button" disabled={saving} onClick={() => submitForm('submit')}>حفظ وإرسال</button>
                <button className="btn btn-soft" type="button" disabled={saving} onClick={resetForm}>إلغاء</button>
              </div>
            ) : (
              <div className="form-actions">
                <button className="btn btn-soft" type="button" disabled={saving} onClick={() => submitForm('draft')}>
                  {saving ? 'جارٍ الحفظ...' : (form.items.length > 1 ? 'حفظ المعاملة كمسودة' : 'حفظ كمسودة')}
                </button>
                <button className="btn btn-primary" type="button" disabled={saving} onClick={() => submitForm('submit')}>
                  {form.items.length > 1 ? 'إرسال المعاملة' : 'إرسال الطلب'}
                </button>
              </div>
            )}
          </form>
        </section>
      ) : null}

      {canCreate ? (
        <section className="card section" style={{ marginBottom: 16 }}>
          <h2>طلباتي</h2>
          <p style={{ color: 'var(--text-soft)' }}>عدد طلباتك الحالية: {ownRequests.length}</p>
        </section>
      ) : null}

      {selectedRequest ? (
        <section className="card section" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <h2 style={{ margin: 0 }}>تفاصيل المعاملة قبل الصرف</h2>
            <button className="btn btn-soft" type="button" onClick={() => setSelectedRequest(null)}>إغلاق</button>
          </div>

          <div className="grid-3" style={{ marginTop: 12 }}>
            <div><strong>رقم الطلب:</strong> {selectedRequest.requestNo}</div>
            <div><strong>رقم المعاملة:</strong> {selectedRequest.transactionNo || '-'}</div>
            <div><strong>تاريخ المعاملة:</strong> {formatDateTime(selectedRequest.transactionDate || selectedRequest.createdAt)}</div>
            <div><strong>نوع الصرف:</strong> {typeLabelMap[selectedRequest.requestType] || selectedRequest.requestType}</div>
            <div><strong>المبلغ المطلوب:</strong> {selectedRequest.amount} {selectedRequest.currency}</div>
            <div>
              <strong>المبلغ المعتمد:</strong>{' '}
              {selectedRequest.approvedAmount != null
                ? `${selectedRequest.approvedAmount} ${selectedRequest.currency}`
                : 'لم يحدد بعد'}
            </div>
            <div><strong>إجمالي المعاملة:</strong> {selectedRequest.transactionTotalAmount || selectedRequest.amount} {selectedRequest.currency}</div>
          </div>

          <div style={{ marginTop: 10 }}>
            <strong>الوصف:</strong>
            <p style={{ marginTop: 6 }}>{selectedRequest.description || '-'}</p>
          </div>

          <div style={{ marginTop: 10 }}>
            <strong>سجل الإجراءات:</strong>
            {(selectedRequest.workflowTrail || []).length ? (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {selectedRequest.workflowTrail.map((entry) => (
                  <div key={entry.id || `${entry.action}-${entry.occurredAt}`} style={{ border: '1px solid var(--stroke)', borderRadius: 8, padding: 8 }}>
                    <div><strong>{entry.action}</strong> - {entry.actor?.fullName || '-'} - {formatDateTime(entry.occurredAt)}</div>
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

          <div className="form-actions" style={{ marginTop: 12 }}>
            <button className="btn btn-primary" type="button" onClick={() => downloadTransactionPdf(selectedRequest)}>
              تحميل مستند الصرف PDF
            </button>
            <button className="btn btn-soft" type="button" onClick={() => sendWhatsapp(selectedRequest)}>
              مشاركة عبر واتساب
            </button>
          </div>
        </section>
      ) : null}

      <section className="card section">
        <h2>طلبات الصرف المالي</h2>
        <table className="table">
          <thead>
            <tr>
              <th>الطلب</th>
              <th>تاريخ المعاملة</th>
              <th>الموظف</th>
              <th>القيمة</th>
              <th>إجمالي المعاملة</th>
              <th>الحالة</th>
              <th>المرفقات</th>
              <th>النقاط</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {requests.length ? requests.map((request) => (
              <tr key={request.id}>
                <td>
                  <strong>{request.requestNo}</strong>
                  {request.transactionNo ? (
                    <div style={{ color: 'var(--text-soft)', fontSize: 12, marginTop: 4 }}>
                      رقم المعاملة: {request.transactionNo}
                    </div>
                  ) : null}
                  <div style={{ color: 'var(--text-soft)', fontSize: 12, marginTop: 4 }}>{typeLabelMap[request.requestType] || request.requestType}</div>
                  <div style={{ color: 'var(--text-soft)', fontSize: 12 }}>{request.description}</div>
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
                  <span className={`status-pill ${statusClassMap[request.status] || 'status-inprogress'}`}>
                    {request.statusLabel || request.status}
                  </span>
                  {request.requiresGeneralManagerApproval ? <div style={{ color: 'var(--text-soft)', fontSize: 12, marginTop: 4 }}>يتطلب اعتماد المدير العام</div> : null}
                  {request.projectManagerStepSkipped ? <div style={{ color: 'var(--text-soft)', fontSize: 12, marginTop: 2 }}>مباشر للمدير العام</div> : null}
                </td>
                <td>{renderAttachments(request)}</td>
                <td>{request.pointsImpact > 0 ? `+${request.pointsImpact}` : request.pointsImpact}</td>
                <td style={{ minWidth: 280 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <textarea
                      className="input"
                      rows={2}
                      placeholder="ملاحظات الإجراء"
                      value={rowNotes[request.id] || ''}
                      onChange={(e) => setRowNote(request.id, e.target.value)}
                    />

                    {isReviewable(request) ? (
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
                      {request.status !== 'DISBURSED' && request.status !== 'CLOSED' ? (
                        <button className="btn btn-soft" type="button" onClick={() => showTransactionDetails(request)}>عرض المعاملة</button>
                      ) : null}
                      {request.status !== 'DISBURSED' && request.status !== 'CLOSED' ? (
                        <button className="btn btn-soft" type="button" onClick={() => downloadTransactionPdf(request)}>PDF</button>
                      ) : null}
                      <button className="btn btn-soft" type="button" onClick={() => sendWhatsapp(request)}>واتساب</button>
                      {request.canEdit ? <button className="btn btn-soft" type="button" onClick={() => beginEdit(request)}>تعديل</button> : null}
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
                      <button className="btn btn-soft" type="button" onClick={() => sendWhatsappReminder(request)}>تذكير واتساب</button>
                    </div>
                  </div>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={9} style={{ color: 'var(--text-soft)' }}>لا توجد طلبات صرف مالي حالياً.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
