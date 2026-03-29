'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import KpiCard from '../../../components/KpiCard';
import { api } from '../../../lib/api';
import { authStorage } from '../../../lib/auth';
import { Permission, hasAnyPermission } from '../../../lib/permissions';

const contractStatusLabels = {
  ACTIVE: 'نشط',
  SUSPENDED: 'معلق',
  EXPIRED: 'منتهي',
  UNDER_NEGOTIATION: 'قيد التفاوض',
};

const contractStatusClass = {
  ACTIVE: 'status-approved',
  SUSPENDED: 'status-inprogress',
  EXPIRED: 'status-rejected',
  UNDER_NEGOTIATION: 'status-submitted',
};

const emptyCustomerForm = {
  name: '',
  companyAddress: '',
  contractStatus: 'ACTIVE',
  notes: '',
  responsiblePerson: {
    name: '',
    title: '',
    phone: '',
    email: '',
  },
  contactInfo: {
    phones: '',
    emails: '',
    website: '',
  },
};

const downloadBlobToFile = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export default function NetworkDocumentationPage() {
  const router = useRouter();
  const currentUser = authStorage.getUser();
  const canManageCustomers = hasAnyPermission(currentUser, [
    Permission.MANAGE_NETWORK_CUSTOMERS,
    Permission.MANAGE_NETWORK_BRANCHES,
  ]);

  const [summary, setSummary] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState(emptyCustomerForm);
  const [search, setSearch] = useState('');
  const [contractStatus, setContractStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (contractStatus) params.set('contractStatus', contractStatus);
    return params.toString();
  }, [search, contractStatus]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [summaryRes, customersRes] = await Promise.all([
        api.get('/network-docs/dashboard/summary'),
        api.get(`/network-docs/customers${queryString ? `?${queryString}` : ''}`),
      ]);
      setSummary(summaryRes.summary || null);
      setCustomers(customersRes.customers || []);
    } catch (err) {
      setError(err.message || 'تعذر تحميل بيانات توثيق الشبكات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [queryString]);

  const submitCustomer = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setInfo('');
    try {
      await api.post('/network-docs/customers', {
        ...form,
        contactInfo: {
          ...form.contactInfo,
          phones: form.contactInfo.phones,
          emails: form.contactInfo.emails,
        },
      });
      setForm(emptyCustomerForm);
      setInfo('تم إنشاء الزبون وإضافته إلى وحدة توثيق الشبكات.');
      await load();
    } catch (err) {
      setError(err.message || 'تعذر إنشاء الزبون');
    } finally {
      setSaving(false);
    }
  };

  const downloadCustomerPdf = async (customer) => {
    try {
      const blob = await api.downloadBlob(`/network-docs/reports/customer/${customer.id || customer._id}/pdf`);
      downloadBlobToFile(blob, `network-docs-${customer.name || customer.id || customer._id}.pdf`);
    } catch (err) {
      setError(err.message || 'تعذر تنزيل تقرير الزبون');
    }
  };

  if (loading && !summary) {
    return <section className="card section">جارٍ تحميل لوحة توثيق الشبكات...</section>;
  }

  return (
    <>
      {error ? <section className="card section" style={{ color: 'var(--danger)' }}>{error}</section> : null}
      {info ? <section className="card section" style={{ color: 'var(--accent)' }}>{info}</section> : null}

      {summary ? (
        <section className="grid-4" style={{ marginBottom: 16 }}>
          <KpiCard label="الزبائن" value={summary.customers || 0} hint="إجمالي الحسابات الموثقة" tone="highlight" />
          <KpiCard label="الفروع" value={summary.branches || 0} hint="مواقع العمل المرتبطة" />
          <KpiCard label="الأجهزة" value={summary.devices || 0} hint="جميع الأصول الموثقة" />
          <KpiCard label="فروع تحتاج مراجعة" value={summary.outdatedBranches || 0} hint="توثيق تغير بعد الاعتماد" tone="warn" />
        </section>
      ) : null}

      <section className="card section" style={{ marginBottom: 16 }}>
        <div className="section-header">
          <h2>فلترة وقائمة الزبائن</h2>
        </div>
        <div className="grid-3">
          <label>
            بحث
            <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="اسم الزبون..." />
          </label>
          <label>
            حالة العقد
            <select className="select" value={contractStatus} onChange={(e) => setContractStatus(e.target.value)}>
              <option value="">الكل</option>
              <option value="ACTIVE">نشط</option>
              <option value="SUSPENDED">معلق</option>
              <option value="EXPIRED">منتهي</option>
              <option value="UNDER_NEGOTIATION">قيد التفاوض</option>
            </select>
          </label>
          <div style={{ display: 'flex', alignItems: 'end' }}>
            <button className="btn btn-soft" type="button" onClick={load}>تحديث</button>
          </div>
        </div>
      </section>

      {canManageCustomers ? (
        <section className="card section" style={{ marginBottom: 16 }}>
          <h2>إضافة زبون جديد</h2>
          <form className="grid-3" onSubmit={submitCustomer}>
            <label>
              اسم الزبون
              <input className="input" value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} required />
            </label>
            <label>
              حالة العقد
              <select className="select" value={form.contractStatus} onChange={(e) => setForm((current) => ({ ...current, contractStatus: e.target.value }))}>
                <option value="ACTIVE">نشط</option>
                <option value="SUSPENDED">معلق</option>
                <option value="EXPIRED">منتهي</option>
                <option value="UNDER_NEGOTIATION">قيد التفاوض</option>
              </select>
            </label>
            <label>
              عنوان الشركة
              <input className="input" value={form.companyAddress} onChange={(e) => setForm((current) => ({ ...current, companyAddress: e.target.value }))} />
            </label>
            <label>
              الشخص المسؤول
              <input className="input" value={form.responsiblePerson.name} onChange={(e) => setForm((current) => ({ ...current, responsiblePerson: { ...current.responsiblePerson, name: e.target.value } }))} />
            </label>
            <label>
              المنصب
              <input className="input" value={form.responsiblePerson.title} onChange={(e) => setForm((current) => ({ ...current, responsiblePerson: { ...current.responsiblePerson, title: e.target.value } }))} />
            </label>
            <label>
              هاتف المسؤول
              <input className="input" value={form.responsiblePerson.phone} onChange={(e) => setForm((current) => ({ ...current, responsiblePerson: { ...current.responsiblePerson, phone: e.target.value } }))} />
            </label>
            <label>
              بريد المسؤول
              <input className="input" value={form.responsiblePerson.email} onChange={(e) => setForm((current) => ({ ...current, responsiblePerson: { ...current.responsiblePerson, email: e.target.value } }))} />
            </label>
            <label>
              هواتف عامة
              <input className="input" value={form.contactInfo.phones} onChange={(e) => setForm((current) => ({ ...current, contactInfo: { ...current.contactInfo, phones: e.target.value } }))} placeholder="0770..., 0780..." />
            </label>
            <label>
              إيميلات عامة
              <input className="input" value={form.contactInfo.emails} onChange={(e) => setForm((current) => ({ ...current, contactInfo: { ...current.contactInfo, emails: e.target.value } }))} placeholder="mail@example.com" />
            </label>
            <label className="grid-span-full">
              ملاحظات
              <textarea className="textarea" rows={3} value={form.notes} onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))} />
            </label>
            <div className="form-actions">
              <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'إضافة الزبون'}</button>
            </div>
          </form>
        </section>
      ) : null}

      {summary?.recentChanges?.length ? (
        <section className="card section" style={{ marginBottom: 16 }}>
          <h2>آخر التغييرات</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {summary.recentChanges.map((change) => (
              <article key={change._id || change.id} className="card section" style={{ padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <strong>{change.action}</strong>
                  <span style={{ color: 'var(--text-soft)', fontSize: 13 }}>{change.customer?.name || '-'} / {change.branch?.name || 'عام'}</span>
                </div>
                <div style={{ color: 'var(--text-soft)', marginTop: 6 }}>
                  {change.changedBy?.fullName || '-'} - {change.createdAt ? new Date(change.createdAt).toLocaleString('ar-IQ', { timeZone: 'Asia/Baghdad' }) : '-'}
                </div>
                {change.reason ? <div style={{ marginTop: 6 }}>{change.reason}</div> : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="card section">
        <h2>الزبائن</h2>
        <div style={{ display: 'grid', gap: 12 }}>
          {customers.length ? customers.map((customer) => (
            <article key={customer.id || customer._id} className="card section" style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div>
                  <strong style={{ fontSize: 18 }}>{customer.name}</strong>
                  <div style={{ marginTop: 6, color: 'var(--text-soft)' }}>{customer.companyAddress || 'بدون عنوان مفصل'}</div>
                  <div style={{ marginTop: 6, color: 'var(--text-soft)' }}>
                    المسؤول: {customer.responsiblePerson?.name || '-'} {customer.responsiblePerson?.phone ? `- ${customer.responsiblePerson.phone}` : ''}
                  </div>
                </div>
                <span className={`status-pill ${contractStatusClass[customer.contractStatus] || 'status-todo'}`}>
                  {contractStatusLabels[customer.contractStatus] || customer.contractStatus || '-'}
                </span>
              </div>

              <div className="grid-3" style={{ marginTop: 12 }}>
                <div className="card section" style={{ padding: 10 }}>
                  <div style={{ color: 'var(--text-soft)' }}>عدد الفروع</div>
                  <strong>{customer.branchCount || 0}</strong>
                </div>
                <div className="card section" style={{ padding: 10 }}>
                  <div style={{ color: 'var(--text-soft)' }}>عدد الأجهزة</div>
                  <strong>{customer.deviceCount || 0}</strong>
                </div>
                <div className="card section" style={{ padding: 10 }}>
                  <div style={{ color: 'var(--text-soft)' }}>آخر تحديث</div>
                  <strong>{customer.updatedAt ? new Date(customer.updatedAt).toLocaleDateString('ar-IQ', { timeZone: 'Asia/Baghdad' }) : '-'}</strong>
                </div>
              </div>

              <div className="form-actions" style={{ marginTop: 14 }}>
                <button className="btn btn-primary" type="button" onClick={() => router.push(`/network-documentation/${customer.id || customer._id}`)}>فتح ملف الزبون</button>
                <button className="btn btn-soft" type="button" onClick={() => downloadCustomerPdf(customer)}>PDF</button>
              </div>
            </article>
          )) : <p style={{ color: 'var(--text-soft)' }}>لا توجد نتائج مطابقة.</p>}
        </div>
      </section>
    </>
  );
}
