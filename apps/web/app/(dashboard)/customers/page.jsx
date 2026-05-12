'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, assetUrl } from '../../../lib/api';
import { authStorage } from '../../../lib/auth';
import { Permission, hasAnyPermission, hasPermission } from '../../../lib/permissions';
import {
  buildCustomerFormData,
  createEmptyCustomerFilters,
  customerStatusLabelMap,
  customerTypeLabelMap,
  followUpStatusLabelMap,
  followUpTypeLabelMap,
} from '../../../lib/customers';
import CustomerModal from '../../../components/customers/CustomerModal';
import ContactActionBar from '../../../components/ContactActionBar';

const customerFormStatusLabelMap = {
  NEW: 'جديد',
  PENDING_REVIEW: 'بانتظار المراجعة',
  APPROVED: 'معتمد',
  REJECTED: 'مرفوض',
  SAVED_TO_CUSTOMERS: 'محفوظ في الزبائن',
  CANCELLED: 'ملغى',
  EXPIRED: 'منتهي الصلاحية',
};

const customerFormTypeOptions = [
  ['INDIVIDUAL', 'فرد'],
  ['COMPANY', 'شركة'],
  ['INSTITUTION', 'مؤسسة'],
  ['GOVERNMENT', 'دائرة حكومية'],
];

const requiredPermissions = [
  Permission.VIEW_CUSTOMERS,
  Permission.CREATE_CUSTOMERS,
  Permission.MANAGE_CUSTOMERS,
  Permission.VIEW_CUSTOMER_FINANCIAL_INFO,
];

const formatDate = (value) => {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('ar-IQ');
};

const buildCustomerFormMessage = (link) => {
  return [
    'عزيزي الزبون الكريم،',
    'حرصًا منا على تنظيم بياناتكم وتقديم خدمة أفضل، يرجى التفضل بملء استمارة معلومات الزبائن من خلال الرابط أدناه:',
    link,
    '',
    'شاكرين تعاونكم،',
    'شركة دلتا بلس',
  ].join('\n');
};

export default function CustomersPage() {
  const searchParams = useSearchParams();
  const currentUser = authStorage.getUser();
  const canView = hasAnyPermission(currentUser, requiredPermissions);
  const canCreate = hasPermission(currentUser, Permission.CREATE_CUSTOMERS);
  const canManage = hasPermission(currentUser, Permission.MANAGE_CUSTOMERS);
  const [filters, setFilters] = useState(createEmptyCustomerFilters());
  const [customers, setCustomers] = useState([]);
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') === 'forms' ? 'forms' : 'customers');
  const [formRequests, setFormRequests] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [requestDuplicates, setRequestDuplicates] = useState([]);
  const [generatedLink, setGeneratedLink] = useState('');
  const [reviewForm, setReviewForm] = useState(null);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [detailsCustomer, setDetailsCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locatingRequest, setLocatingRequest] = useState(false);
  const [requestLocationMessage, setRequestLocationMessage] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [whatsappMessage, setWhatsappMessage] = useState('السلام عليكم، معكم شركة دلتا بلس بخصوص طلبكم.');

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
    return params.toString();
  }, [filters]);

  const load = async (silent = false) => {
    if (!canView) { setLoading(false); return; }
    if (!silent) { setLoading(true); setError(''); }
    try {
      const response = await api.get(`/customers${queryString ? `?${queryString}` : ''}`);
      setCustomers(response.customers || []);
    } catch (err) {
      if (!silent) setError(err.message || 'تعذر تحميل الزبائن');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadFormRequests = async (silent = false) => {
    if (!canView) return;
    if (!silent) { setLoading(true); setError(''); }
    try {
      const response = await api.get('/customer-forms');
      setFormRequests(response.requests || []);
    } catch (err) {
      if (!silent) setError(err.message || 'تعذر تحميل طلبات معلومات الزبائن');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { load(); }, [queryString]);
  useEffect(() => {
    setActiveTab(searchParams.get('tab') === 'forms' ? 'forms' : 'customers');
  }, [searchParams]);
  useEffect(() => { if (activeTab === 'forms') loadFormRequests(); }, [activeTab]);

  const saveCustomer = async (form) => {
    setSaving(true); setError(''); setInfo('');
    try {
      const formData = buildCustomerFormData(form);
      if (editingCustomer?._id || editingCustomer?.id) await api.patch(`/customers/${editingCustomer._id || editingCustomer.id}`, formData);
      else await api.post('/customers', formData);
      setEditingCustomer(null);
      setInfo(editingCustomer ? 'تم تحديث ملف الزبون.' : 'تم إنشاء ملف الزبون.');
      await load(true);
    } catch (err) {
      setError(err.message || 'تعذر حفظ ملف الزبون');
    } finally {
      setSaving(false);
    }
  };

  const archiveCustomer = async (customer) => {
    if (!window.confirm(`هل تريد أرشفة "${customer.name}"؟`)) return;
    setSaving(true); setError('');
    try {
      await api.patch(`/customers/${customer._id || customer.id}/archive`, {});
      setInfo('تمت أرشفة الزبون.');
      await load(true);
    } catch (err) {
      setError(err.message || 'تعذر أرشفة الزبون');
    } finally {
      setSaving(false);
    }
  };

  const createFormLink = async () => {
    setSaving(true); setError(''); setInfo(''); setGeneratedLink('');
    try {
      const response = await api.post('/customer-forms/links', { expiresInDays: 7 });
      setGeneratedLink(response.url);
      setInfo('تم إنشاء رابط الاستمارة.');
      await loadFormRequests(true);
    } catch (err) {
      setError(err.message || 'تعذر إنشاء رابط الاستمارة');
    } finally {
      setSaving(false);
    }
  };

  const copyLink = async (link) => {
    await navigator.clipboard?.writeText(buildCustomerFormMessage(link));
    setInfo('تم نسخ رسالة الاستمارة مع الرابط.');
  };

  const openRequest = async (request) => {
    setSaving(true); setError('');
    try {
      const response = await api.get(`/customer-forms/${request._id || request.id}`);
      const nextRequest = response.request;
      setSelectedRequest(nextRequest);
      setRequestDuplicates(response.duplicateCustomers || []);
      setReviewForm({ ...(nextRequest.data || {}) });
    } catch (err) {
      setError(err.message || 'تعذر فتح الطلب');
    } finally {
      setSaving(false);
    }
  };

  const updateRequest = async () => {
    if (!selectedRequest) return;
    setSaving(true); setError(''); setInfo('');
    try {
      const response = await api.patch(`/customer-forms/${selectedRequest._id || selectedRequest.id}`, reviewForm);
      setSelectedRequest(response.request);
      setRequestDuplicates(response.duplicateCustomers || []);
      setInfo('تم تحديث بيانات الطلب.');
      await loadFormRequests(true);
    } catch (err) {
      setError(err.message || 'تعذر تحديث الطلب');
    } finally {
      setSaving(false);
    }
  };

  const fillReviewLocation = () => {
    setRequestLocationMessage('');
    if (!navigator?.geolocation) {
      setRequestLocationMessage('المتصفح لا يدعم تحديد الموقع.');
      return;
    }

    setLocatingRequest(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setReviewForm((prev) => ({
          ...prev,
          mapUrl: `https://www.google.com/maps?q=${latitude},${longitude}`,
        }));
        setRequestLocationMessage('تم تحديد الموقع وإضافة رابط الخريطة.');
        setLocatingRequest(false);
      },
      () => {
        setRequestLocationMessage('تعذر تحديد الموقع. تأكد من السماح للموقع من المتصفح.');
        setLocatingRequest(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 60000,
      },
    );
  };

  const rejectRequest = async () => {
    const reason = window.prompt('سبب الرفض');
    if (!reason) return;
    setSaving(true); setError(''); setInfo('');
    try {
      await api.patch(`/customer-forms/${selectedRequest._id || selectedRequest.id}/reject`, { reason });
      setSelectedRequest(null);
      setInfo('تم رفض الطلب.');
      await loadFormRequests(true);
    } catch (err) {
      setError(err.message || 'تعذر رفض الطلب');
    } finally {
      setSaving(false);
    }
  };

  const cancelRequest = async (request) => {
    if (!window.confirm('هل تريد إلغاء رابط الاستمارة؟')) return;
    setSaving(true); setError(''); setInfo('');
    try {
      await api.patch(`/customer-forms/${request._id || request.id}/cancel`, {});
      setInfo('تم إلغاء رابط الاستمارة.');
      await loadFormRequests(true);
    } catch (err) {
      setError(err.message || 'تعذر إلغاء رابط الاستمارة');
    } finally {
      setSaving(false);
    }
  };

  const approveRequest = async (duplicateAction = 'create', existingCustomerId = '') => {
    if (!selectedRequest) return;
    setSaving(true); setError(''); setInfo('');
    try {
      const response = await api.post(`/customer-forms/${selectedRequest._id || selectedRequest.id}/approve`, {
        duplicateAction,
        existingCustomerId,
      });
      setSelectedRequest(null);
      setInfo('تم اعتماد الطلب وحفظه في معلومات الزبائن.');
      await Promise.all([load(true), loadFormRequests(true)]);
      if (response.customer?._id || response.customer?.id) setDetailsCustomer(response.customer);
    } catch (err) {
      setError(err.message || 'هذا الزبون موجود مسبقاً');
    } finally {
      setSaving(false);
    }
  };

  if (!canView) return <section className="card section">لا تملك صلاحية الوصول إلى معلومات الزبائن.</section>;

  const totals = {
    total: customers.length,
    active: customers.filter((item) => item.status === 'ACTIVE').length,
    vip: customers.filter((item) => item.status === 'VIP').length,
    followUps: customers.reduce((sum, item) => sum + Number(item.followUps?.length || 0), 0),
  };

  return (
    <>
      {error ? <section className="card section" style={{ color: 'var(--danger)' }}>{error}</section> : null}
      {info ? <section className="card section" style={{ color: 'var(--accent)' }}>{info}</section> : null}

      <section className="card section daily-plan-hero">
        <div>
          <h2 style={{ marginBottom: 6 }}>معلومات الزبائن</h2>
          <p style={{ margin: 0, color: 'var(--text-soft)' }}>ملفات الزبائن، المسؤولين، الفروع، المتابعات، وأزرار التواصل السريع للفنيين.</p>
        </div>
        <div className="action-row">
          {canCreate ? <button className="btn btn-primary" onClick={() => setEditingCustomer({})}>إضافة زبون</button> : null}
          <button className="btn btn-soft" onClick={() => load()} disabled={loading}>{loading ? 'جارٍ التحديث...' : 'تحديث'}</button>
        </div>
      </section>

      <section className="card section" style={{ marginTop: 16 }}>
        <div className="tabs-bar" style={{ marginBottom: 0 }}>
          <button className={`btn ${activeTab === 'customers' ? 'btn-primary' : 'btn-soft'}`} onClick={() => setActiveTab('customers')}>الزبائن</button>
          <button className={`btn ${activeTab === 'forms' ? 'btn-primary' : 'btn-soft'}`} onClick={() => setActiveTab('forms')}>الاستمارات</button>
        </div>
      </section>

      {activeTab === 'forms' ? (
        <>
          <section className="card section" style={{ marginTop: 16 }}>
            <div className="section-header">
              <div>
                <h2>طلبات معلومات الزبائن</h2>
                <p style={{ margin: 0, color: 'var(--text-soft)' }}>إنشاء روابط آمنة، مراجعة الطلبات، ثم اعتمادها وحفظها داخل ملفات الزبائن.</p>
              </div>
              <div className="action-row">
                {canCreate ? <button className="btn btn-primary" onClick={createFormLink} disabled={saving}>إنشاء رابط استمارة</button> : null}
                <button className="btn btn-soft" onClick={() => loadFormRequests()} disabled={loading}>تحديث</button>
              </div>
            </div>
            {generatedLink ? (
              <div className="customer-link-panel">
                <strong>الرابط الجديد</strong>
                <input className="input" value={generatedLink} readOnly dir="ltr" />
                <div className="action-row" style={{ marginTop: 10 }}>
                  <button className="btn btn-soft btn-sm" onClick={() => copyLink(generatedLink)}>نسخ الرسالة</button>
                  <a className="btn btn-soft btn-sm" href={`https://wa.me/?text=${encodeURIComponent(buildCustomerFormMessage(generatedLink))}`} target="_blank" rel="noreferrer">إرسال عبر واتساب</a>
                </div>
              </div>
            ) : null}
          </section>

          <section className="card section" style={{ marginTop: 16 }}>
            <div className="daily-plan-card-grid">
              {formRequests.length ? formRequests.map((request) => {
                const link = `${typeof window !== 'undefined' ? window.location.origin : ''}/customer-form/${request.token}`;
                return (
                  <article className="daily-plan-card customer-card" key={request._id || request.id}>
                    <div className="maintenance-card-header">
                      <div>
                        <strong>{request.data?.customerName || 'رابط استمارة جديد'}</strong>
                        <div className="daily-plan-card-subtitle">{request.data?.phone || request.data?.whatsapp || 'لم يتم الإرسال بعد'}</div>
                      </div>
                      <span className={`status-pill ${request.status === 'SAVED_TO_CUSTOMERS' ? 'status-approved' : request.status === 'REJECTED' || request.status === 'CANCELLED' ? 'status-rejected' : 'status-submitted'}`}>{customerFormStatusLabelMap[request.status] || request.status}</span>
                    </div>
                    <div className="daily-plan-mini-grid">
                      <div><span>تاريخ الإرسال</span><strong>{formatDate(request.sentAt)}</strong></div>
                      <div><span>الموظف</span><strong>{request.sentByName || '-'}</strong></div>
                      <div><span>تاريخ الاعتماد</span><strong>{formatDate(request.approvedAt)}</strong></div>
                      <div><span>المرفقات</span><strong>{request.attachments?.length || 0}</strong></div>
                    </div>
                    <div className="form-actions daily-plan-actions">
                      <button className="btn btn-soft btn-sm" onClick={() => openRequest(request)}>عرض الطلب</button>
                      <button className="btn btn-soft btn-sm" onClick={() => copyLink(link)}>نسخ الرسالة</button>
                      <a className="btn btn-soft btn-sm" href={`https://wa.me/?text=${encodeURIComponent(buildCustomerFormMessage(link))}`} target="_blank" rel="noreferrer">إرسال عبر واتساب</a>
                      {canManage && !['CANCELLED', 'SAVED_TO_CUSTOMERS', 'REJECTED'].includes(request.status) ? <button className="btn btn-soft btn-sm" onClick={() => cancelRequest(request)} disabled={saving}>إلغاء الرابط</button> : null}
                      {request.savedCustomer ? <button className="btn btn-soft btn-sm" onClick={() => setDetailsCustomer(request.savedCustomer)}>فتح ملف الزبون</button> : null}
                    </div>
                  </article>
                );
              }) : <p className="maintenance-empty">لا توجد طلبات استمارات حالياً.</p>}
            </div>
          </section>
        </>
      ) : (
        <>

      <section className="grid-4" style={{ marginTop: 16 }}>
        <article className="card section"><p className="maintenance-kpi-label">إجمالي الزبائن</p><h2>{totals.total}</h2></article>
        <article className="card section"><p className="maintenance-kpi-label">فعال</p><h2>{totals.active}</h2></article>
        <article className="card section"><p className="maintenance-kpi-label">VIP</p><h2>{totals.vip}</h2></article>
        <article className="card section"><p className="maintenance-kpi-label">المتابعات</p><h2>{totals.followUps}</h2></article>
      </section>

      <section className="card section" style={{ marginTop: 16 }}>
        <div className="daily-plan-filter-grid">
          <label>بحث<input className="input" value={filters.search} onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))} placeholder="الاسم، الرقم، العنوان، المحافظة، الموقع" /></label>
          <label>رقم الهاتف<input className="input" value={filters.phone} onChange={(e) => setFilters((prev) => ({ ...prev, phone: e.target.value }))} /></label>
          <label>المحافظة<input className="input" value={filters.province} onChange={(e) => setFilters((prev) => ({ ...prev, province: e.target.value }))} /></label>
          <label>الحالة<select className="select" value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}><option value="">الكل</option>{Object.entries(customerStatusLabelMap).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        <div className="action-row" style={{ marginTop: 12 }}>
          <button className="btn btn-soft" onClick={() => load()} disabled={loading}>بحث</button>
          <button className="btn btn-soft" onClick={() => setFilters(createEmptyCustomerFilters())}>إعادة ضبط</button>
        </div>
      </section>

      <section className="card section" style={{ marginTop: 16 }}>
        <div className="daily-plan-card-grid">
          {customers.length ? customers.map((customer) => {
            return (
              <article className="daily-plan-card customer-card" key={customer._id || customer.id}>
                <div className="maintenance-card-header">
                  <div>
                    <strong>{customer.name}</strong>
                    <div className="daily-plan-card-subtitle">{customerTypeLabelMap[customer.customerType] || customer.customerType || '-'} - {customer.province || '-'}</div>
                  </div>
                  <span className={`status-pill ${customer.status === 'VIP' ? 'status-submitted' : customer.status === 'ACTIVE' ? 'status-approved' : customer.status === 'STOPPED' ? 'status-rejected' : 'status-todo'}`}>{customerStatusLabelMap[customer.status] || customer.status || '-'}</span>
                </div>
                <div className="daily-plan-mini-grid">
                  <div><span>الهاتف</span><strong>{customer.phone || '-'}</strong></div>
                  <div><span>واتساب</span><strong>{customer.whatsapp || '-'}</strong></div>
                  <div><span>الفروع</span><strong>{customer.sites?.length || 0}</strong></div>
                  <div><span>آخر تعديل</span><strong>{formatDate(customer.lastModifiedAt)}</strong></div>
                </div>
                <div className="daily-plan-card-subtitle">{customer.address || 'بدون عنوان'}</div>
                {customer.lastModifiedByName ? <div className="daily-plan-card-subtitle">آخر تعديل بواسطة: {customer.lastModifiedByName}</div> : null}
                <label className="customer-inline-message">رسالة واتساب<input className="input" value={whatsappMessage} onChange={(e) => setWhatsappMessage(e.target.value)} /></label>
                <ContactActionBar
                  phone={customer.phone}
                  whatsapp={customer.whatsapp || customer.phone}
                  mapUrl={customer.mapUrl}
                  address={customer.address}
                  whatsappMessage={whatsappMessage}
                />
                <div className="form-actions daily-plan-actions">
                  <button className="btn btn-soft btn-sm" onClick={() => setDetailsCustomer(customer)}>التفاصيل</button>
                  {canManage ? <button className="btn btn-soft btn-sm" onClick={() => setEditingCustomer(customer)}>تعديل</button> : null}
                  {canManage ? <button className="btn btn-soft btn-sm" onClick={() => archiveCustomer(customer)} disabled={saving}>أرشفة</button> : null}
                </div>
              </article>
            );
          }) : <p className="maintenance-empty">لا توجد زبائن مطابقة للفلاتر الحالية.</p>}
        </div>
      </section>
        </>
      )}

      <CustomerModal open={!!editingCustomer} customer={editingCustomer} saving={saving} onClose={() => setEditingCustomer(null)} onSubmit={saveCustomer} />

      {selectedRequest && reviewForm ? (
        <div className="modal-backdrop" onClick={() => setSelectedRequest(null)}>
          <div className="modal-panel customer-modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>مراجعة طلب معلومات الزبون</h3>
                <p className="daily-plan-modal-subtitle">{customerFormStatusLabelMap[selectedRequest.status] || selectedRequest.status}</p>
              </div>
              <button type="button" className="modal-close" onClick={() => setSelectedRequest(null)}>&times;</button>
            </div>
            {requestDuplicates.length ? (
              <section className="daily-plan-form-section">
                <h4>هذا الزبون موجود مسبقاً</h4>
                {requestDuplicates.map((customer) => (
                  <div className="customer-detail-row" key={customer._id || customer.id}>
                    <strong>{customer.name}</strong>
                    <span>{customer.phone || '-'} / {customer.whatsapp || '-'}</span>
                    <div className="action-row">
                      <button className="btn btn-soft btn-sm" onClick={() => setDetailsCustomer(customer)}>فتح ملف الزبون الموجود</button>
                      {canManage ? <button className="btn btn-soft btn-sm" onClick={() => approveRequest('update', customer._id || customer.id)} disabled={saving}>تحديث بيانات الزبون الموجود</button> : null}
                    </div>
                  </div>
                ))}
              </section>
            ) : null}
            <div className="daily-plan-form-grid">
              <label>اسم الزبون / الشركة<input className="input" value={reviewForm.customerName || ''} onChange={(e) => setReviewForm((prev) => ({ ...prev, customerName: e.target.value }))} /></label>
              <label>نوع الزبون<select className="select" value={reviewForm.customerType || 'COMPANY'} onChange={(e) => setReviewForm((prev) => ({ ...prev, customerType: e.target.value }))}>{customerFormTypeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>المسؤول<input className="input" value={reviewForm.responsibleName || ''} onChange={(e) => setReviewForm((prev) => ({ ...prev, responsibleName: e.target.value }))} /></label>
              <label>المنصب<input className="input" value={reviewForm.position || ''} onChange={(e) => setReviewForm((prev) => ({ ...prev, position: e.target.value }))} /></label>
              <label>الهاتف<input className="input" value={reviewForm.phone || ''} onChange={(e) => setReviewForm((prev) => ({ ...prev, phone: e.target.value }))} /></label>
              <label>واتساب<input className="input" value={reviewForm.whatsapp || ''} onChange={(e) => setReviewForm((prev) => ({ ...prev, whatsapp: e.target.value }))} /></label>
              <label>البريد<input className="input" value={reviewForm.email || ''} onChange={(e) => setReviewForm((prev) => ({ ...prev, email: e.target.value }))} /></label>
              <label>المحافظة<input className="input" value={reviewForm.province || ''} onChange={(e) => setReviewForm((prev) => ({ ...prev, province: e.target.value }))} /></label>
              <label>المدينة / المنطقة<input className="input" value={reviewForm.city || ''} onChange={(e) => setReviewForm((prev) => ({ ...prev, city: e.target.value }))} /></label>
              <label className="grid-span-full">العنوان<textarea className="textarea" value={reviewForm.address || ''} onChange={(e) => setReviewForm((prev) => ({ ...prev, address: e.target.value }))} /></label>
              <label className="grid-span-full">
                رابط Google Maps
                <div className="customer-map-input-row">
                  <input className="input" value={reviewForm.mapUrl || ''} onChange={(e) => setReviewForm((prev) => ({ ...prev, mapUrl: e.target.value }))} />
                  <button className="btn btn-soft" type="button" onClick={fillReviewLocation} disabled={locatingRequest}>
                    {locatingRequest ? 'جارٍ التحديد...' : 'تحديد موقعي'}
                  </button>
                </div>
                {requestLocationMessage ? <small className="customer-location-message">{requestLocationMessage}</small> : null}
              </label>
              <label className="grid-span-full">الخدمة المطلوبة<input className="input" value={reviewForm.requestedService || ''} onChange={(e) => setReviewForm((prev) => ({ ...prev, requestedService: e.target.value }))} /></label>
              <label className="grid-span-full">ملاحظات<textarea className="textarea" value={reviewForm.notes || ''} onChange={(e) => setReviewForm((prev) => ({ ...prev, notes: e.target.value }))} /></label>
            </div>
            {selectedRequest.attachments?.length ? (
              <section className="daily-plan-form-section">
                <h4>المرفقات المرسلة من الزبون</h4>
                <div className="daily-plan-attachment-grid">
                  {selectedRequest.attachments.map((attachment) => (
                    <a className="daily-plan-attachment-card" key={attachment._id || attachment.publicUrl} href={assetUrl(attachment.publicUrl)} target="_blank" rel="noreferrer">
                      <strong>{attachment.originalName || attachment.fileName}</strong>
                      <span>{formatDate(attachment.uploadedAt)}</span>
                    </a>
                  ))}
                </div>
              </section>
            ) : null}
            <div className="form-actions form-actions-end" style={{ marginTop: 16 }}>
              <button className="btn btn-soft" onClick={updateRequest} disabled={saving}>حفظ التعديلات</button>
              <button className="btn btn-soft" onClick={rejectRequest} disabled={saving}>رفض الطلب</button>
              <button className="btn btn-primary" onClick={() => approveRequest('create')} disabled={saving}>اعتماد وحفظ في الزبائن</button>
            </div>
          </div>
        </div>
      ) : null}

      {detailsCustomer ? (
        <div className="modal-backdrop" onClick={() => setDetailsCustomer(null)}>
          <div className="modal-panel customer-modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>{detailsCustomer.name}</h3>
                <p className="daily-plan-modal-subtitle">{detailsCustomer.address || 'تفاصيل ملف الزبون'}</p>
              </div>
              <button type="button" className="modal-close" onClick={() => setDetailsCustomer(null)}>&times;</button>
            </div>
            <div className="customer-detail-stack">
              <ContactActionBar
                phone={detailsCustomer.phone}
                whatsapp={detailsCustomer.whatsapp || detailsCustomer.phone}
                mapUrl={detailsCustomer.mapUrl}
                address={detailsCustomer.address}
              />
              <section className="daily-plan-form-section">
                <h4>الأشخاص المسؤولون</h4>
                {(detailsCustomer.contactPersons || []).map((person) => (
                  <div className="customer-detail-row" key={person._id || person.name}>
                    <strong>{person.name || '-'}</strong>
                    <span>{person.position || '-'} - {person.phone || '-'}</span>
                    <span>{[person.isDecisionMaker && 'صاحب قرار', person.isTechnical && 'فني', person.isFinancial && 'مالي'].filter(Boolean).join(' / ')}</span>
                  </div>
                ))}
              </section>
              <section className="daily-plan-form-section">
                <h4>المواقع والفروع</h4>
                {(detailsCustomer.sites || []).map((site) => (
                  <div className="customer-detail-row" key={site._id || site.name}>
                    <strong>{site.name || '-'}</strong>
                    <span>{site.address || '-'}</span>
                    <span>{site.managerName || '-'} - {site.managerPhone || '-'}</span>
                    <ContactActionBar phone={site.managerPhone} mapUrl={site.mapUrl} address={site.address} compact />
                  </div>
                ))}
              </section>
              <section className="daily-plan-form-section">
                <h4>سجل المتابعات</h4>
                {(detailsCustomer.followUps || []).map((followUp) => (
                  <div className="customer-detail-row" key={followUp._id || followUp.createdAt}>
                    <strong>{followUpTypeLabelMap[followUp.type] || followUp.type}</strong>
                    <span>{followUp.employeeName || '-'} - {followUpStatusLabelMap[followUp.status] || followUp.status}</span>
                    <span>{followUp.note || '-'}</span>
                    <span>القادمة: {formatDate(followUp.nextFollowUpAt)}</span>
                  </div>
                ))}
              </section>
              {detailsCustomer.attachments?.length ? (
                <section className="daily-plan-form-section">
                  <h4>المرفقات</h4>
                  <div className="daily-plan-attachment-grid">
                    {detailsCustomer.attachments.map((attachment) => (
                      <a className="daily-plan-attachment-card" key={attachment._id || attachment.publicUrl} href={assetUrl(attachment.publicUrl)} target="_blank" rel="noreferrer">
                        <strong>{attachment.originalName || attachment.fileName}</strong>
                        <span>{attachment.uploadedByName || '-'} - {formatDate(attachment.uploadedAt)}</span>
                      </a>
                    ))}
                  </div>
                </section>
              ) : null}
              {detailsCustomer.formSubmissions?.length ? (
                <section className="daily-plan-form-section">
                  <h4>الاستمارات</h4>
                  <div className="daily-plan-attachment-grid">
                    {detailsCustomer.formSubmissions.map((formSubmission) => (
                      <div className="daily-plan-attachment-card" key={formSubmission._id || formSubmission.formRequest}>
                        <strong>{customerFormStatusLabelMap[formSubmission.status] || formSubmission.status || '-'}</strong>
                        <span>الإرسال: {formatDate(formSubmission.sentAt)} - الموظف: {formSubmission.sentByName || '-'}</span>
                        <span>الاعتماد: {formatDate(formSubmission.approvedAt)} - المرفقات: {formSubmission.attachments?.length || 0}</span>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
              {detailsCustomer.linkedFieldInspections?.length ? (
                <section className="daily-plan-form-section">
                  <h4>سجل الكشف الميداني</h4>
                  <div className="daily-plan-attachment-grid">
                    {detailsCustomer.linkedFieldInspections.map((ticket) => (
                      <a className="daily-plan-attachment-card" key={ticket._id || ticket.id} href={`/field-inspections?ticket=${ticket._id || ticket.id}`}>
                        <strong>{ticket.ticketNo || '-'}</strong>
                        <span>{ticket.serviceType || '-'} - {ticket.status || '-'}</span>
                        <span>موعد الكشف: {formatDate(ticket.appointmentAt)} - الإغلاق: {formatDate(ticket.closedAt)}</span>
                      </a>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
