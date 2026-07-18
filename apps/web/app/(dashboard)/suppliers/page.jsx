'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import { authStorage } from '../../../lib/auth';
import { Permission, hasAnyPermission, hasPermission } from '../../../lib/permissions';

const requiredPermissions = [
  Permission.VIEW_SUPPLIERS,
  Permission.VIEW_APPROVED_SUPPLIERS,
  Permission.CREATE_SUPPLIERS,
  Permission.MANAGE_SUPPLIERS,
  Permission.APPROVE_SUPPLIERS,
  Permission.VIEW_SUPPLIER_FINANCIALS,
];

const statusLabels = {
  NEW: 'مورد جديد',
  UNDER_REVIEW: 'قيد المراجعة',
  APPROVED: 'معتمد',
  SUSPENDED: 'موقوف',
  REJECTED: 'مرفوض',
  ARCHIVED: 'مؤرشف',
};

const statusClass = {
  NEW: 'status-todo',
  UNDER_REVIEW: 'status-submitted',
  APPROVED: 'status-approved',
  SUSPENDED: 'status-rejected',
  REJECTED: 'status-rejected',
  ARCHIVED: 'status-todo',
};

const supplierTypeOptions = [
  'كاميرات مراقبة',
  'شبكات',
  'أجهزة تقنية معلومات',
  'كهرباء',
  'تبريد',
  'منظومات حريق',
  'طاقة شمسية',
  'برامج وأنظمة',
  'مقاولات',
  'مواد بناء',
  'نقل ولوجستيات',
  'خدمات عامة',
  'أخرى',
];

const paymentOptions = [
  ['CASH', 'نقدي'],
  ['CREDIT', 'آجل'],
  ['INSTALLMENTS', 'دفعات'],
  ['TRANSFER', 'حوالة'],
  ['AGREEMENT', 'حسب الاتفاق'],
];

const emptySupplier = {
  supplierName: '',
  companyName: '',
  supplierType: supplierTypeOptions[0],
  mainPhone: '',
  secondPhone: '',
  email: '',
  website: '',
  governorate: '',
  city: '',
  address: '',
  contactPerson: '',
  position: '',
  salesManagerName: '',
  salesManagerPhone: '',
  salesManagerPosition: '',
  notes: '',
  services: [],
  linkedMaterials: [],
  brands: '',
  isOfficialAgent: false,
  hasWarranty: false,
  warrantyPeriod: '',
  deliveryTime: '',
  hasDelivery: false,
  coverageAreas: '',
  minimumOrder: '',
  pricingMethod: '',
  paymentMethod: 'AGREEMENT',
  creditDays: 0,
  currency: 'IQD',
  bankName: '',
  accountNumber: '',
  accountHolder: '',
  financialNotes: '',
  openingBalance: 0,
  hasOldDebt: false,
  oldDebtAmount: 0,
  classification: '',
};

const emptyFilters = {
  search: '',
  phone: '',
  supplierType: '',
  city: '',
  status: '',
  minRating: '',
  approvedOnly: false,
  hasDebt: false,
  includeArchived: false,
};

const evalFields = [
  ['materialQuality', 'جودة المواد'],
  ['supplySpeed', 'سرعة التجهيز'],
  ['timeCommitment', 'الالتزام بالوقت'],
  ['prices', 'الأسعار'],
  ['afterSales', 'خدمة ما بعد البيع'],
  ['support', 'التعامل والدعم'],
  ['warrantyCommitment', 'الالتزام بالضمان'],
];

const formatDate = (value) => (value ? new Date(value).toLocaleDateString('ar-IQ') : '-');
const formatMoney = (value, currency = 'IQD') => `${Number(value || 0).toLocaleString('ar-IQ')} ${currency}`;

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const toTextList = (value) => {
  if (Array.isArray(value)) return value.join('، ');
  return value || '';
};

const toId = (value) => String(value?._id || value?.id || value || '');

function SupplierModal({ supplier, materialOptions = [], saving, onClose, onSubmit }) {
  const [tab, setTab] = useState('basic');
  const [form, setForm] = useState(() => ({
    ...emptySupplier,
    ...(supplier || {}),
    services: Array.isArray(supplier?.services) ? supplier.services : [],
    linkedMaterials: Array.isArray(supplier?.linkedMaterials) ? supplier.linkedMaterials.map(toId).filter(Boolean) : [],
    brands: toTextList(supplier?.brands),
    coverageAreas: toTextList(supplier?.coverageAreas),
  }));
  const [customSupplierType, setCustomSupplierType] = useState(
    form.supplierType && !supplierTypeOptions.includes(form.supplierType),
  );

  const setValue = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const toggleListValue = (key, value) => {
    setForm((prev) => {
      const current = Array.isArray(prev[key]) ? prev[key] : [];
      return {
        ...prev,
        [key]: current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
      };
    });
  };

  const submit = (event) => {
    event.preventDefault();
    const formData = new FormData();
    Object.entries(form).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        formData.append(key, value.join('\n'));
        return;
      }
      formData.append(key, value ?? '');
    });
    onSubmit(formData);
  };

  const tabs = [
    ['basic', 'البيانات الأساسية'],
    ['work', 'بيانات العمل'],
    ['finance', 'البيانات المالية'],
    ['rating', 'التقييم'],
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal-panel supplier-modal" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>{supplier?._id ? 'تعديل مورد' : 'إضافة مورد جديد'}</h3>
            <p className="daily-plan-modal-subtitle">نموذج مقسم حتى تبقى البيانات واضحة وقابلة للمراجعة.</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="tabs-bar supplier-tabs">
          {tabs.map(([value, label]) => (
            <button key={value} type="button" className={`btn ${tab === value ? 'btn-primary' : 'btn-soft'}`} onClick={() => setTab(value)}>{label}</button>
          ))}
        </div>

        {tab === 'basic' ? (
          <div className="daily-plan-form-grid">
            <label>اسم المورد<input className="input" required value={form.supplierName} onChange={(e) => setValue('supplierName', e.target.value)} /></label>
            <label>اسم الشركة<input className="input" value={form.companyName} onChange={(e) => setValue('companyName', e.target.value)} /></label>
            <label>
              نوع المورد
              <select
                className="select"
                required
                value={customSupplierType ? '__CUSTOM__' : form.supplierType}
                onChange={(e) => {
                  if (e.target.value === '__CUSTOM__') {
                    setCustomSupplierType(true);
                    setValue('supplierType', '');
                    return;
                  }
                  setCustomSupplierType(false);
                  setValue('supplierType', e.target.value);
                }}
              >
                {supplierTypeOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                <option value="__CUSTOM__">نوع جديد</option>
              </select>
            </label>
            {customSupplierType ? (
              <label>اسم النوع الجديد<input className="input" required value={form.supplierType} onChange={(e) => setValue('supplierType', e.target.value)} /></label>
            ) : null}
            <label>رقم الهاتف الأساسي<input className="input" required value={form.mainPhone} onChange={(e) => setValue('mainPhone', e.target.value)} /></label>
            <label>رقم هاتف إضافي<input className="input" value={form.secondPhone} onChange={(e) => setValue('secondPhone', e.target.value)} /></label>
            <label>البريد الإلكتروني<input className="input" type="email" value={form.email} onChange={(e) => setValue('email', e.target.value)} /></label>
            <label>الموقع الإلكتروني<input className="input" value={form.website} onChange={(e) => setValue('website', e.target.value)} /></label>
            <label>المحافظة<input className="input" value={form.governorate} onChange={(e) => setValue('governorate', e.target.value)} /></label>
            <label>المدينة<input className="input" value={form.city} onChange={(e) => setValue('city', e.target.value)} /></label>
            <label>اسم الشخص المسؤول<input className="input" value={form.contactPerson} onChange={(e) => setValue('contactPerson', e.target.value)} /></label>
            <label>المنصب<input className="input" value={form.position} onChange={(e) => setValue('position', e.target.value)} /></label>
            <label>اسم مدير المبيعات<input className="input" value={form.salesManagerName} onChange={(e) => setValue('salesManagerName', e.target.value)} /></label>
            <label>هاتف مدير المبيعات<input className="input" value={form.salesManagerPhone} onChange={(e) => setValue('salesManagerPhone', e.target.value)} /></label>
            <label>منصب مدير المبيعات<input className="input" value={form.salesManagerPosition} onChange={(e) => setValue('salesManagerPosition', e.target.value)} /></label>
            <label className="grid-span-full">العنوان التفصيلي<textarea className="textarea" value={form.address} onChange={(e) => setValue('address', e.target.value)} /></label>
            <label className="grid-span-full">ملاحظات عامة<textarea className="textarea" value={form.notes} onChange={(e) => setValue('notes', e.target.value)} /></label>
          </div>
        ) : null}

        {tab === 'work' ? (
          <div className="daily-plan-form-grid">
            <section className="daily-plan-form-section grid-span-full supplier-checkbox-section">
              <h4>أصناف الخدمات أو المواد</h4>
              <div className="supplier-checkbox-grid">
                {supplierTypeOptions.map((item) => (
                  <label className="supplier-checkbox" key={item}>
                    <input
                      type="checkbox"
                      checked={form.services.includes(item)}
                      onChange={() => toggleListValue('services', item)}
                    />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
            </section>
            <label className="grid-span-full">العلامات التجارية<textarea className="textarea" value={form.brands} onChange={(e) => setValue('brands', e.target.value)} /></label>
            <label>وكيل رسمي<select className="select" value={String(form.isOfficialAgent)} onChange={(e) => setValue('isOfficialAgent', e.target.value === 'true')}><option value="false">لا</option><option value="true">نعم</option></select></label>
            <label>يوفر ضمان<select className="select" value={String(form.hasWarranty)} onChange={(e) => setValue('hasWarranty', e.target.value === 'true')}><option value="false">لا</option><option value="true">نعم</option></select></label>
            <label>مدة الضمان<input className="input" value={form.warrantyPeriod} onChange={(e) => setValue('warrantyPeriod', e.target.value)} /></label>
            <label>مدة التجهيز المتوقعة<input className="input" value={form.deliveryTime} onChange={(e) => setValue('deliveryTime', e.target.value)} /></label>
            <label>يوفر توصيل<select className="select" value={String(form.hasDelivery)} onChange={(e) => setValue('hasDelivery', e.target.value === 'true')}><option value="false">لا</option><option value="true">نعم</option></select></label>
            <label>مناطق التغطية<input className="input" value={form.coverageAreas} onChange={(e) => setValue('coverageAreas', e.target.value)} /></label>
          </div>
        ) : null}

        {tab === 'finance' ? (
          <div className="daily-plan-form-grid">
            <label>طريقة الدفع<select className="select" value={form.paymentMethod} onChange={(e) => setValue('paymentMethod', e.target.value)}>{paymentOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>مدة الدفع الآجل بالأيام<input className="input" type="number" min="0" value={form.creditDays} onChange={(e) => setValue('creditDays', e.target.value)} /></label>
            <label>العملة<select className="select" value={form.currency} onChange={(e) => setValue('currency', e.target.value)}><option value="IQD">دينار عراقي</option><option value="USD">دولار أمريكي</option></select></label>
            <label>اسم المصرف<input className="input" value={form.bankName} onChange={(e) => setValue('bankName', e.target.value)} /></label>
            <label>رقم الحساب<input className="input" value={form.accountNumber} onChange={(e) => setValue('accountNumber', e.target.value)} /></label>
            <label>اسم صاحب الحساب<input className="input" value={form.accountHolder} onChange={(e) => setValue('accountHolder', e.target.value)} /></label>
            <label>توجد ديون سابقة<select className="select" value={String(form.hasOldDebt)} onChange={(e) => setValue('hasOldDebt', e.target.value === 'true')}><option value="false">لا</option><option value="true">نعم</option></select></label>
            <label className="grid-span-full">ملاحظات مالية<textarea className="textarea" value={form.financialNotes} onChange={(e) => setValue('financialNotes', e.target.value)} /></label>
          </div>
        ) : null}

        {tab === 'rating' ? (
          <section className="daily-plan-form-section">
            <h4>التقييم الحالي</h4>
            <p className="supplier-stars">{'★'.repeat(Math.round(supplier?.ratingAverage || 0))}{'☆'.repeat(5 - Math.round(supplier?.ratingAverage || 0))} <span>{supplier?.ratingAverage || 0}/5</span></p>
            <p className="daily-plan-modal-subtitle">يمكن إضافة تقييمات تفصيلية من صفحة التفاصيل بعد حفظ المورد.</p>
          </section>
        ) : null}

        <div className="form-actions form-actions-end">
          <button type="button" className="btn btn-soft" onClick={onClose}>إلغاء</button>
          <button className="btn btn-primary" disabled={saving}>{saving ? 'جار الحفظ...' : 'حفظ المورد'}</button>
        </div>
      </form>
    </div>
  );
}

function EvaluationModal({ supplier, saving, onClose, onSubmit }) {
  const [form, setForm] = useState({ reason: '', notes: '', materialQuality: 5, supplySpeed: 5, timeCommitment: 5, prices: 5, afterSales: 5, support: 5, warrantyCommitment: 5 });
  const setValue = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal-panel supplier-eval-modal" onSubmit={(event) => { event.preventDefault(); onSubmit(form); }} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div><h3>تقييم المورد</h3><p className="daily-plan-modal-subtitle">{supplier?.supplierName}</p></div>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="daily-plan-form-grid">
          <label className="grid-span-full">سبب التقييم<input className="input" value={form.reason} onChange={(e) => setValue('reason', e.target.value)} /></label>
          {evalFields.map(([key, label]) => (
            <label key={key}>{label}<input className="input" type="number" min="1" max="5" value={form[key]} onChange={(e) => setValue(key, e.target.value)} /></label>
          ))}
          <label className="grid-span-full">ملاحظات<textarea className="textarea" value={form.notes} onChange={(e) => setValue('notes', e.target.value)} /></label>
        </div>
        <div className="form-actions form-actions-end">
          <button type="button" className="btn btn-soft" onClick={onClose}>إلغاء</button>
          <button className="btn btn-primary" disabled={saving}>{saving ? 'جار الحفظ...' : 'حفظ التقييم'}</button>
        </div>
      </form>
    </div>
  );
}

export default function SuppliersPage() {
  const currentUser = authStorage.getUser();
  const canView = hasAnyPermission(currentUser, requiredPermissions);
  const canCreate = hasAnyPermission(currentUser, [Permission.CREATE_SUPPLIERS, Permission.MANAGE_SUPPLIERS]);
  const canManage = hasPermission(currentUser, Permission.MANAGE_SUPPLIERS);
  const canApprove = hasAnyPermission(currentUser, [Permission.APPROVE_SUPPLIERS, Permission.MANAGE_SUPPLIERS]);
  const canFinance = hasPermission(currentUser, Permission.VIEW_SUPPLIER_FINANCIALS);
  const canEvaluate = hasAnyPermission(currentUser, [Permission.EVALUATE_SUPPLIERS, Permission.MANAGE_SUPPLIERS]);
  const canExport = hasAnyPermission(currentUser, [Permission.EXPORT_SUPPLIER_REPORTS, Permission.VIEW_SUPPLIER_FINANCIALS]);

  const [filters, setFilters] = useState(emptyFilters);
  const [suppliers, setSuppliers] = useState([]);
  const [materialOptions, setMaterialOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [detailsSupplier, setDetailsSupplier] = useState(null);
  const [evaluatingSupplier, setEvaluatingSupplier] = useState(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== '' && value !== false) params.set(key, value);
    });
    return params.toString();
  }, [filters]);

  const load = async (silent = false) => {
    if (!canView) { setLoading(false); return; }
    if (!silent) { setLoading(true); setError(''); }
    try {
      const response = await api.get(`/suppliers${queryString ? `?${queryString}` : ''}`);
      setSuppliers(response.suppliers || []);
      setMaterialOptions(response.materials || []);
    } catch (err) {
      if (!silent) setError(err.message || 'تعذر تحميل الموردين');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { load(); }, [queryString]);

  const saveSupplier = async (formData) => {
    setSaving(true); setError(''); setInfo('');
    try {
      if (editingSupplier?._id) await api.patch(`/suppliers/${editingSupplier._id}`, formData);
      else await api.post('/suppliers', formData);
      setEditingSupplier(null);
      setInfo(editingSupplier?._id ? 'تم تحديث بيانات المورد.' : 'تمت إضافة المورد بنجاح.');
      await load(true);
    } catch (err) {
      setError(err.message || 'تعذر حفظ المورد');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (supplier, status) => {
    let reason = '';
    if (status === 'ARCHIVED') {
      reason = 'أرشفة من صفحة الموردين';
    } else if (status !== 'APPROVED') {
      reason = window.prompt('سبب تغيير الحالة', '');
      if (reason === null) return;
    }
    setSaving(true); setError(''); setInfo('');
    try {
      await api.patch(`/suppliers/${supplier._id}/status`, { status, reason });
      setInfo('تم تغيير حالة المورد.');
      await load(true);
      if (status === 'APPROVED') {
        setDetailsSupplier(null);
        return;
      }
      if (detailsSupplier?._id === supplier._id) {
        const response = await api.get(`/suppliers/${supplier._id}`);
        setDetailsSupplier(response.supplier);
      }
    } catch (err) {
      setError(err.message || 'تعذر تغيير حالة المورد');
    } finally {
      setSaving(false);
    }
  };

  const addEvaluation = async (form) => {
    setSaving(true); setError(''); setInfo('');
    try {
      const response = await api.post(`/suppliers/${evaluatingSupplier._id}/evaluations`, form);
      setEvaluatingSupplier(null);
      setInfo('تم حفظ تقييم المورد.');
      await load(true);
    } catch (err) {
      setError(err.message || 'تعذر حفظ التقييم');
    } finally {
      setSaving(false);
    }
  };

  const exportReport = async (type) => {
    setError('');
    try {
      const blob = await api.downloadBlob(`/suppliers/reports/${type}${queryString ? `?${queryString}` : ''}`);
      downloadBlob(blob, type === 'excel' ? 'suppliers-report.xlsx' : 'suppliers-report.pdf');
    } catch (err) {
      setError(err.message || 'فشل تصدير التقرير');
    }
  };

  if (!canView) return <section className="card section">لا تملك صلاحية الوصول إلى معلومات الموردين.</section>;

  const totals = {
    total: suppliers.length,
    approved: suppliers.filter((item) => item.status === 'APPROVED').length,
    debt: suppliers.filter((item) => item.hasOldDebt || Number(item.oldDebtAmount || 0) > 0).length,
    avg: suppliers.length ? (suppliers.reduce((sum, item) => sum + Number(item.ratingAverage || 0), 0) / suppliers.length).toFixed(1) : '0.0',
  };

  return (
    <>
      {error ? <section className="card section" style={{ color: 'var(--danger)' }}>{error}</section> : null}
      {info ? <section className="card section" style={{ color: 'var(--accent)' }}>{info}</section> : null}

      <section className="card section daily-plan-hero supplier-hero">
        <div>
          <h2>معلومات الموردين</h2>
          <p>قاعدة مركزية للموردين، التصنيفات، المستحقات، المرفقات، والتقييمات.</p>
        </div>
        <div className="action-row">
          {canCreate ? <button className="btn btn-primary" onClick={() => setEditingSupplier({})}>إضافة مورد</button> : null}
          {canExport ? <button className="btn btn-soft" onClick={() => exportReport('excel')}>Excel</button> : null}
          {canExport ? <button className="btn btn-soft" onClick={() => exportReport('pdf')}>PDF</button> : null}
          <button className="btn btn-soft" onClick={() => load()} disabled={loading}>{loading ? 'جار التحديث...' : 'تحديث'}</button>
        </div>
      </section>

      <section className="grid-4" style={{ marginTop: 16 }}>
        <article className="card section"><p className="maintenance-kpi-label">إجمالي الموردين</p><h2>{totals.total}</h2></article>
        <article className="card section"><p className="maintenance-kpi-label">المعتمدون</p><h2>{totals.approved}</h2></article>
        <article className="card section"><p className="maintenance-kpi-label">لديهم ديون</p><h2>{totals.debt}</h2></article>
        <article className="card section"><p className="maintenance-kpi-label">متوسط التقييم</p><h2>{totals.avg}</h2></article>
      </section>

      <section className="card section" style={{ marginTop: 16 }}>
        <div className="daily-plan-filter-grid">
          <label>البحث بالاسم<input className="input" value={filters.search} onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))} /></label>
          <label>رقم الهاتف<input className="input" value={filters.phone} onChange={(e) => setFilters((prev) => ({ ...prev, phone: e.target.value }))} /></label>
          <label>نوع المورد<select className="select" value={filters.supplierType} onChange={(e) => setFilters((prev) => ({ ...prev, supplierType: e.target.value }))}><option value="">الكل</option>{supplierTypeOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>المدينة<input className="input" value={filters.city} onChange={(e) => setFilters((prev) => ({ ...prev, city: e.target.value }))} /></label>
          <label>الحالة<select className="select" value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}><option value="">الكل</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>التقييم الأدنى<select className="select" value={filters.minRating} onChange={(e) => setFilters((prev) => ({ ...prev, minRating: e.target.value }))}><option value="">الكل</option><option value="4">4+</option><option value="3">3+</option><option value="2">2+</option></select></label>
          <label className="supplier-check"><input type="checkbox" checked={filters.approvedOnly} onChange={(e) => setFilters((prev) => ({ ...prev, approvedOnly: e.target.checked }))} /> المعتمدين فقط</label>
          <label className="supplier-check"><input type="checkbox" checked={filters.hasDebt} onChange={(e) => setFilters((prev) => ({ ...prev, hasDebt: e.target.checked }))} /> لديهم ديون</label>
        </div>
        <div className="action-row" style={{ marginTop: 12 }}>
          <button className="btn btn-soft" onClick={() => setFilters(emptyFilters)}>إعادة ضبط</button>
        </div>
      </section>

      <section className="card section" style={{ marginTop: 16 }}>
        <div className="daily-plan-card-grid supplier-card-grid">
          {suppliers.length ? suppliers.map((supplier) => (
            <article className="daily-plan-card supplier-card" key={supplier._id}>
              <div className="maintenance-card-header">
                <div>
                  <strong>{supplier.supplierName}</strong>
                  <div className="daily-plan-card-subtitle">{supplier.companyName || supplier.supplierType}</div>
                </div>
                <span className={`status-pill ${statusClass[supplier.status] || 'status-todo'}`}>{statusLabels[supplier.status] || supplier.status}</span>
              </div>

              <div className="daily-plan-mini-grid supplier-mini-grid">
                <div><span>نوع المورد</span><strong>{supplier.supplierType || '-'}</strong></div>
                <div><span>الهاتف</span><strong dir="ltr">{supplier.mainPhone || '-'}</strong></div>
                <div><span>الموقع</span><strong>{supplier.governorate || '-'} / {supplier.city || '-'}</strong></div>
                <div><span>آخر تعامل</span><strong>{formatDate(supplier.lastInteractionAt)}</strong></div>
                <div><span>التقييم</span><strong className="supplier-stars">{'★'.repeat(Math.round(supplier.ratingAverage || 0))}{'☆'.repeat(5 - Math.round(supplier.ratingAverage || 0))}</strong></div>
                {canFinance ? <div><span>الرصيد</span><strong>{formatMoney(supplier.financialBalance, supplier.currency)}</strong></div> : null}
              </div>

              <div className="daily-plan-card-subtitle supplier-card-note">
                {supplier.services?.length ? supplier.services.slice(0, 3).join('، ') : supplier.notes || 'لا توجد ملاحظات مختصرة.'}
              </div>

              <div className="form-actions daily-plan-actions supplier-row-actions">
                <button className="btn btn-soft btn-sm" onClick={() => setDetailsSupplier(supplier)}>عرض</button>
                {canManage ? <button className="btn btn-soft btn-sm" onClick={() => setEditingSupplier(supplier)}>تعديل</button> : null}
                {canManage ? <button className="btn btn-soft btn-sm" onClick={() => changeStatus(supplier, 'ARCHIVED')} disabled={saving}>أرشفة</button> : null}
                {canManage ? <button className="btn btn-soft btn-sm supplier-delete-btn" onClick={() => changeStatus(supplier, 'ARCHIVED')} disabled={saving}>حذف المورد</button> : null}
              </div>
            </article>
          )) : (
            <p className="maintenance-empty supplier-empty">لا توجد موردين مطابقين للفلاتر الحالية.</p>
          )}
        </div>
      </section>

      {editingSupplier ? <SupplierModal supplier={editingSupplier} materialOptions={materialOptions} saving={saving} onClose={() => setEditingSupplier(null)} onSubmit={saveSupplier} /> : null}
      {evaluatingSupplier ? <EvaluationModal supplier={evaluatingSupplier} saving={saving} onClose={() => setEvaluatingSupplier(null)} onSubmit={addEvaluation} /> : null}

      {detailsSupplier ? (
        <div className="modal-backdrop" onClick={() => setDetailsSupplier(null)}>
          <div className="modal-panel supplier-details" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>{detailsSupplier.supplierName}</h3>
                <p className="daily-plan-modal-subtitle">{detailsSupplier.companyName || detailsSupplier.supplierType}</p>
              </div>
              <button type="button" className="modal-close" onClick={() => setDetailsSupplier(null)}>&times;</button>
            </div>
            <div className="supplier-detail-header">
              <span className={`status-pill ${statusClass[detailsSupplier.status] || 'status-todo'}`}>{statusLabels[detailsSupplier.status] || detailsSupplier.status}</span>
              <span className="supplier-stars">{'★'.repeat(Math.round(detailsSupplier.ratingAverage || 0))}{'☆'.repeat(5 - Math.round(detailsSupplier.ratingAverage || 0))} {detailsSupplier.ratingAverage || 0}/5</span>
            </div>
            <div className="supplier-detail-grid">
              <section className="daily-plan-form-section"><h4>بيانات الاتصال</h4><p>{detailsSupplier.mainPhone} / {detailsSupplier.secondPhone || '-'}</p><p>{detailsSupplier.email || '-'} / {detailsSupplier.website || '-'}</p><p>{detailsSupplier.governorate || '-'} - {detailsSupplier.city || '-'} - {detailsSupplier.address || '-'}</p><p>{detailsSupplier.contactPerson || '-'} - {detailsSupplier.position || '-'}</p><p>مدير المبيعات: {detailsSupplier.salesManagerName || '-'} / {detailsSupplier.salesManagerPhone || '-'} / {detailsSupplier.salesManagerPosition || '-'}</p></section>
              <section className="daily-plan-form-section"><h4>بيانات العمل</h4><p>الخدمات: {toTextList(detailsSupplier.services) || '-'}</p><p>العلامات: {toTextList(detailsSupplier.brands) || '-'}</p><p>ضمان: {detailsSupplier.hasWarranty ? 'نعم' : 'لا'} - {detailsSupplier.warrantyPeriod || '-'}</p><p>توصيل: {detailsSupplier.hasDelivery ? 'نعم' : 'لا'} - {toTextList(detailsSupplier.coverageAreas) || '-'}</p></section>
              {canFinance ? <section className="daily-plan-form-section"><h4>البيانات المالية</h4><p>طريقة الدفع: {paymentOptions.find(([value]) => value === detailsSupplier.paymentMethod)?.[1] || '-'}</p><p>العملة: {detailsSupplier.currency}</p><p>المصرف: {detailsSupplier.bankName || '-'} / {detailsSupplier.accountNumber || '-'}</p><p>الرصيد: {formatMoney(detailsSupplier.financialBalance, detailsSupplier.currency)}</p><p>{detailsSupplier.financialNotes || '-'}</p></section> : null}
              <section className="daily-plan-form-section"><h4>المواد أو الخدمات المرتبطة</h4>{detailsSupplier.linkedMaterials?.length ? detailsSupplier.linkedMaterials.map((item) => <p key={toId(item)}>{item.code ? `${item.code} - ` : ''}{item.name || item}</p>) : <p>جاهز للربط لاحقاً مع المواد والمشتريات والمشاريع.</p>}</section>
            </div>
            <section className="daily-plan-form-section"><h4>التقييمات</h4>{detailsSupplier.evaluations?.length ? detailsSupplier.evaluations.slice().reverse().map((evaluation) => <div className="customer-detail-row" key={evaluation._id}><strong>{evaluation.score}/5 - {evaluation.reason || 'تقييم تعامل'}</strong><span>{evaluation.evaluatorName || '-'} - {formatDate(evaluation.evaluatedAt)}</span><span>{evaluation.notes || '-'}</span></div>) : <p>لا توجد تقييمات بعد.</p>}</section>
            <section className="daily-plan-form-section"><h4>سجل التعديلات والحالات</h4>{detailsSupplier.statusHistory?.length ? detailsSupplier.statusHistory.slice().reverse().map((item) => <div className="customer-detail-row" key={item._id}><strong>{statusLabels[item.from] || item.from || '-'} ← {statusLabels[item.to] || item.to}</strong><span>{item.changedByName || '-'} - {formatDate(item.changedAt)}</span><span>{item.reason || '-'}</span></div>) : <p>لا توجد تغييرات حالة مسجلة.</p>}</section>
            <div className="form-actions form-actions-end">
              {canManage ? <button className="btn btn-soft" onClick={() => { setEditingSupplier(detailsSupplier); setDetailsSupplier(null); }}>تعديل</button> : null}
              {canApprove ? <button className="btn btn-primary" onClick={() => changeStatus(detailsSupplier, 'APPROVED')}>اعتماد</button> : null}
              {canApprove ? <button className="btn btn-soft" onClick={() => changeStatus(detailsSupplier, 'SUSPENDED')}>إيقاف</button> : null}
              {canEvaluate ? <button className="btn btn-soft" onClick={() => { setEvaluatingSupplier(detailsSupplier); setDetailsSupplier(null); }}>إضافة تقييم</button> : null}
              {canManage ? <button className="btn btn-soft" onClick={() => changeStatus(detailsSupplier, 'ARCHIVED')}>أرشفة</button> : null}
            </div>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .supplier-hero h2 { margin-bottom: 6px; }
        .supplier-hero p { margin: 0; color: var(--text-soft); }
        .supplier-tabs { flex-wrap: wrap; margin-bottom: 16px; }
        .supplier-modal, .supplier-details { width: min(1040px, calc(100vw - 24px)); max-height: 92vh; overflow: auto; }
        .supplier-eval-modal { width: min(760px, calc(100vw - 24px)); max-height: 92vh; overflow: auto; }
        .supplier-card-grid { grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
        .supplier-card { min-height: 260px; }
        .supplier-mini-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .supplier-card-note { min-height: 22px; margin-top: 10px; }
        .supplier-row-actions { display: flex; gap: 6px; flex-wrap: wrap; }
        .supplier-delete-btn { color: var(--danger); border-color: rgba(220, 38, 38, 0.25); }
        .supplier-checkbox-section h4 { margin-top: 0; }
        .supplier-checkbox-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; }
        .supplier-checkbox { display: flex; align-items: center; gap: 8px; padding: 9px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text); }
        .supplier-checkbox span { overflow-wrap: anywhere; }
        .supplier-stars { color: #d97706; white-space: nowrap; font-weight: 700; }
        .supplier-stars span { color: var(--text-soft); margin-inline-start: 6px; }
        .supplier-check { display: flex; align-items: center; gap: 8px; min-height: 42px; }
        .supplier-empty { color: var(--text-soft); }
        .supplier-detail-header { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
        .supplier-detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        @media (max-width: 760px) {
          .supplier-detail-grid { grid-template-columns: 1fr; }
          .supplier-card-grid { grid-template-columns: 1fr; }
          .supplier-mini-grid { grid-template-columns: 1fr; }
          .supplier-row-actions { min-width: 190px; }
        }
      `}</style>
    </>
  );
}
