'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import KpiCard from '../KpiCard';
import NetworkCustomerDialog from './NetworkCustomerDialog';
import NetworkCustomerLogo from './NetworkCustomerLogo';
import { api } from '../../lib/api';
import { authStorage } from '../../lib/auth';
import { Permission, hasAnyPermission } from '../../lib/permissions';
import { filterNetworkCustomers, normalizeNetworkSearch } from '../../lib/networkCustomerSearch.mjs';

const statusLabels = { ACTIVE: 'نشط', SUSPENDED: 'معلق', EXPIRED: 'منتهي', UNDER_NEGOTIATION: 'قيد التفاوض' };
const statusClasses = { ACTIVE: 'status-approved', SUSPENDED: 'status-inprogress', EXPIRED: 'status-rejected', UNDER_NEGOTIATION: 'status-submitted' };
const emptyForm = () => ({ name: '', companyAddress: '', logoDataUrl: '', contractStatus: 'ACTIVE', notes: '', responsiblePerson: { name: '', title: '', phone: '', email: '' }, contactInfo: { phones: '', emails: '', website: '' } });
const id = (value) => String(value?.id || value?._id || '');
const date = (value) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleDateString('en-GB', { timeZone: 'Asia/Baghdad' }) : '—';
const changeLabel = (action = '') => action.includes('CREATED') ? 'إضافة معلومات جديدة' : action.includes('DELETED') ? 'حذف معلومات' : action.includes('IMPORTED') ? 'استيراد معلومات الأجهزة' : action.includes('EXPORTED') ? 'تصدير توثيق الشبكة' : action.includes('APPROVED') ? 'اعتماد التوثيق' : 'تحديث توثيق الشبكة';

export default function NetworkCustomerDirectory() {
  const router = useRouter(), currentUser = authStorage.getUser();
  const canManageCustomers = hasAnyPermission(currentUser, [Permission.MANAGE_NETWORK_CUSTOMERS]);
  const [summary, setSummary] = useState(null), [customers, setCustomers] = useState([]);
  const [form, setForm] = useState(emptyForm), [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState(''), [contractStatus, setContractStatus] = useState('');
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [downloading, setDownloading] = useState('');
  const [error, setError] = useState(''), [info, setInfo] = useState(''), [expanded, setExpanded] = useState({});
  const [editingId, setEditingId] = useState('');
  const requestVersion = useRef(0), submitting = useRef(false);
  const visibleCustomers = useMemo(() => filterNetworkCustomers(customers, { search, contractStatus }), [customers, search, contractStatus]);
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true); setError('');
    try {
      const [summaryRes, customersRes] = await Promise.all([api.get('/network-docs/dashboard/summary'), api.get('/network-docs/customers')]);
      if (version !== requestVersion.current) return;
      setSummary(summaryRes.summary || null); setCustomers(customersRes.customers || []);
    } catch (err) { if (version === requestVersion.current) setError(err.message || 'تعذر تحميل بيانات توثيق الشبكة'); }
    finally { if (version === requestVersion.current) setLoading(false); }
  }, []);
  useEffect(() => { load(); return () => { requestVersion.current++; }; }, [load]);
  const submitCustomer = async (event) => {
    event.preventDefault(); if (submitting.current) return;
    submitting.current = true; setSaving(true); setError(''); setInfo('');
    try {
      if (editingId) await api.patch(`/network-docs/customers/${editingId}`, { ...form, name: form.name.trim() });
      else await api.post('/network-docs/customers', { ...form, name: form.name.trim() });
      setForm(emptyForm()); setShowAdd(false); setSearch(''); setContractStatus('');
      setInfo(editingId ? 'تم تحديث معلومات الزبون وشعاره بنجاح.' : 'تمت إضافة الزبون بنجاح. افتح ملفه لإضافة الفروع وتوثيق أجهزته.'); setEditingId(''); await load();
    } catch (err) { setError(err.message || 'تعذر حفظ معلومات الزبون'); }
    finally { setSaving(false); submitting.current = false; }
  };
  const downloadCustomerPdf = async (customer) => {
    setDownloading(id(customer)); setError('');
    try {
      const blob = await api.downloadBlob(`/network-docs/reports/customer/${id(customer)}/pdf`);
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = `توثيق الشبكة-${String(customer.name || id(customer)).replace(/[\\/:*?"<>|]/g, '-')}.pdf`;
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { setError(err.message || 'تعذر تنزيل تقرير الزبون'); }
    finally { setDownloading(''); }
  };
  const openCustomer = (customer, branch) => router.push(`/network-documentation/${id(customer)}${branch ? `?branch=${encodeURIComponent(id(branch))}` : ''}`);
  const openAdd = () => { setError(''); setEditingId(''); setForm(emptyForm()); setShowAdd(true); };
  const editCustomer = (customer) => {
    const defaults = emptyForm();
    setForm({ ...defaults, name: customer.name || '', companyAddress: customer.companyAddress || '', logoDataUrl: customer.logoDataUrl || '', contractStatus: customer.contractStatus || 'ACTIVE', notes: customer.notes || '',
      responsiblePerson: { ...defaults.responsiblePerson, ...customer.responsiblePerson }, contactInfo: { website: customer.contactInfo?.website || '', phones: (customer.contactInfo?.phones || []).join(', '), emails: (customer.contactInfo?.emails || []).join(', ') } });
    setEditingId(id(customer)); setError(''); setShowAdd(true);
  };
  return <div className="network-directory" dir="rtl">
    <header className="directory-heading"><div><span className="eyebrow">إدارة وتوثيق الشبكات</span><h1>توثيق الشبكة</h1><p>ملفات الزبائن وفروعهم وأجهزتهم، في مكان واحد.</p></div><div className="heading-actions"><button className="btn btn-soft" type="button" onClick={load} disabled={loading}>{loading ? 'جارٍ التحديث...' : 'تحديث'}</button>{canManageCustomers ? <button type="button" className="btn btn-primary" onClick={openAdd}>+ إضافة زبون</button> : null}</div></header>
    {error && !showAdd ? <div className="directory-message error" role="alert">{error}</div> : null}
    {info ? <div className="directory-message success" role="status">{info}</div> : null}
    {summary ? <section className="grid-4 directory-kpis" aria-label="إحصائيات توثيق الشبكة"><KpiCard label="الزبائن" value={summary.customers || 0} hint="الملفات الموثقة" tone="highlight" /><KpiCard label="الفروع" value={summary.branches || 0} hint="مواقع العمل المرتبطة" /><KpiCard label="الأجهزة" value={summary.devices || 0} hint="الأجهزة المسجلة" /><KpiCard label="فروع تحتاج مراجعة" value={summary.outdatedBranches || 0} hint="تغييرات بعد اعتماد التوثيق" tone="warn" /></section> : null}
    <section className="card section directory-filters" aria-label="البحث والفلترة">
      <label className="directory-search">بحث عن زبون أو فرع<div className="search-control"><input className="input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="اكتب اسم الزبون، اسم الفرع أو المدينة..." />{search ? <button type="button" className="clear-search" aria-label="مسح البحث" onClick={() => setSearch('')}>&times;</button> : null}</div></label>
      <label className="status-filter">حالة العقد<select className="select" value={contractStatus} onChange={(event) => setContractStatus(event.target.value)}><option value="">جميع الحالات</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <div className="results-count" role="status" aria-live="polite"><strong>{visibleCustomers.length}</strong><span>زبون من أصل {customers.length}</span></div>
    </section>
    <section aria-label="بطاقات الزبائن" aria-busy={loading}>
      <div className="directory-section-title"><h2>ملفات الزبائن</h2><span>{search || contractStatus ? 'نتائج البحث والفلترة' : 'أحدث الملفات تحديثًا'}</span></div>
      {loading && !customers.length ? <div className="card section empty-directory" role="status">جارٍ تحميل ملفات الزبائن...</div> : visibleCustomers.length ? <div className="customer-cards">{visibleCustomers.map((customer) => {
        const customerId = id(customer), branches = customer.branches || [], query = normalizeNetworkSearch(search).split(' ').filter(Boolean);
        const branchMatches = (branch) => query.length > 0 && query.every((word) => normalizeNetworkSearch(`${branch.name} ${branch.city} ${branch.address}`).includes(word));
        const sortedBranches = [...branches].sort((a, b) => Number(branchMatches(b)) - Number(branchMatches(a)));
        return <article className="customer-card" key={customerId}>
          <div className="customer-card-top"><span className="customer-avatar"><NetworkCustomerLogo src={customer.logoDataUrl} name={customer.name} /></span><div className="customer-identity"><h3>{customer.name}</h3><p>{customer.companyAddress || 'العنوان غير مسجل'}</p></div><span className={`status-pill ${statusClasses[customer.contractStatus] || 'status-todo'}`}>{statusLabels[customer.contractStatus] || 'غير محدد'}</span></div>
          <div className="customer-contact"><span>الشخص المسؤول</span><strong>{customer.responsiblePerson?.name || 'غير محدد'}</strong>{customer.responsiblePerson?.phone ? <a dir="ltr" href={`tel:${customer.responsiblePerson.phone}`}>{customer.responsiblePerson.phone}</a> : null}</div>
          <div className="customer-metrics"><div><span>الفروع</span><strong>{customer.branchCount ?? branches.length}</strong></div><div><span>الأجهزة</span><strong>{customer.deviceCount || 0}</strong></div><div><span>آخر تحديث</span><time dateTime={customer.updatedAt}>{date(customer.updatedAt)}</time></div></div>
          <div className="customer-branches"><div className="branches-heading"><strong>الفروع والمواقع</strong>{branches.length > 3 ? <button type="button" onClick={() => setExpanded((current) => ({ ...current, [customerId]: !current[customerId] }))} aria-expanded={!!expanded[customerId]}>{expanded[customerId] ? 'عرض أقل' : `عرض الكل (${branches.length})`}</button> : null}</div>{branches.length ? <div className="branch-chips">{(expanded[customerId] ? sortedBranches : sortedBranches.slice(0, 3)).map((branch) => <button key={id(branch)} className={`branch-chip ${branchMatches(branch) ? 'matched' : ''}`} type="button" title={`فتح فرع ${branch.name}`} onClick={() => openCustomer(customer, branch)}><span>{branch.name}</span>{branch.city ? <small>{branch.city}</small> : null}</button>)}</div> : <p className="no-branches">لم تُضف فروع لهذا الزبون بعد.</p>}</div>
          <div className="customer-card-actions">{canManageCustomers ? <button className="btn btn-soft btn-sm" type="button" onClick={() => editCustomer(customer)}>تعديل المعلومات</button> : null}<button className="btn btn-primary" type="button" onClick={() => openCustomer(customer)}>فتح ملف الزبون</button><button className="btn btn-soft" type="button" disabled={!!downloading} onClick={() => downloadCustomerPdf(customer)}>{downloading === customerId ? 'جارٍ التنزيل...' : 'تنزيل PDF'}</button></div>
        </article>;
      })}</div> : <div className="card section empty-directory"><span className="empty-icon" aria-hidden="true">⌕</span><h3>{customers.length ? 'لا توجد نتائج مطابقة' : 'ابدأ بإضافة أول زبون'}</h3><p>{customers.length ? 'جرّب اسم زبون أو فرع آخر، أو غيّر حالة العقد.' : 'أضف الزبون، ثم أنشئ فروعه ووثّق أجهزته ومعلومات الشبكة.'}</p>{search || contractStatus ? <button className="btn btn-soft" type="button" onClick={() => { setSearch(''); setContractStatus(''); }}>مسح البحث والفلترة</button> : canManageCustomers ? <button className="btn btn-primary" type="button" onClick={openAdd}>+ إضافة زبون</button> : null}</div>}
    </section>
    {summary?.recentChanges?.length ? <details className="card section directory-changes"><summary>آخر التغييرات <span>({summary.recentChanges.length})</span></summary><div className="changes-list">{summary.recentChanges.map((change) => <article key={id(change)}><div><strong>{changeLabel(change.action)}</strong><p>{change.customer?.name || 'عام'}{change.branch?.name ? ` · ${change.branch.name}` : ''}</p>{change.reason ? <small>{change.reason}</small> : null}</div><div><span>{change.changedBy?.fullName || '—'}</span><time>{date(change.createdAt)}</time></div></article>)}</div></details> : null}
    {showAdd && canManageCustomers ? <NetworkCustomerDialog editing={!!editingId} form={form} setForm={setForm} saving={saving} error={error} onSubmit={submitCustomer} onClose={() => { if (!submitting.current) { setShowAdd(false); setError(''); } }} /> : null}
    <style jsx>{`.network-directory{display:grid;gap:24px}.directory-heading{display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap}.eyebrow{font-size:12px;color:var(--accent);font-weight:700}.directory-heading h1{margin:7px 0;font-size:28px}.directory-heading p{margin:0;color:var(--text-soft);line-height:1.8}.heading-actions{display:flex;gap:10px;flex-wrap:wrap}.directory-message{padding:16px;border:1px solid var(--border);border-radius:12px}.directory-message.error{color:var(--danger);border-color:var(--danger)}.directory-message.success{color:var(--accent)}.directory-filters{display:flex;align-items:end;gap:18px;flex-wrap:wrap;margin:0}.directory-filters label{display:grid;gap:9px;font-size:13px}.directory-search{flex:1;min-width:240px}.search-control{position:relative}.search-control input{width:100%;padding-inline-end:40px}.search-control input::-webkit-search-cancel-button{display:none}.clear-search{position:absolute;inset-inline-end:12px;top:50%;transform:translateY(-50%);border:0;background:none;color:var(--text-soft);font-size:24px;cursor:pointer}.status-filter{width:195px}.results-count{display:flex;align-items:center;gap:10px;min-height:48px;padding:0 8px;color:var(--text-soft);font-size:12px}.results-count strong{font-size:24px;color:var(--text)}.directory-section-title{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:0 0 16px}.directory-section-title h2{font-size:19px;margin:0}.directory-section-title span{color:var(--text-soft);font-size:12px}.customer-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,330px),1fr));gap:20px;align-items:stretch}.customer-card{background:var(--surface);border:1px solid var(--border);border-radius:18px;padding:20px;display:flex;flex-direction:column;gap:18px;min-width:0;transition:border-color .2s,box-shadow .2s}.customer-card:hover{border-color:var(--primary);box-shadow:0 8px 24px rgba(0,0,0,.12)}.customer-card-top{display:flex;align-items:start;gap:12px}.customer-avatar{display:grid;place-items:center;width:44px;height:44px;flex-shrink:0;border-radius:13px;background:rgba(14,130,200,.15);color:var(--accent);font-weight:800;font-size:21px}.customer-identity{min-width:0;flex:1}.customer-identity h3{margin:0;font-size:18px;line-height:1.6;overflow-wrap:anywhere}.customer-identity p{margin:4px 0 0;color:var(--text-soft);font-size:12px;line-height:1.7;overflow-wrap:anywhere}.customer-card-top .status-pill{font-size:10px;white-space:nowrap}.customer-contact{display:flex;align-items:center;gap:7px 12px;flex-wrap:wrap;font-size:12px}.customer-contact>span{color:var(--text-soft)}.customer-contact strong{font-weight:600}.customer-contact a{color:var(--accent);margin-inline-start:auto;font-size:13px}.customer-metrics{display:grid;grid-template-columns:1fr 1fr 1.4fr;background:var(--surface-soft);border:1px solid var(--border);border-radius:12px;padding:14px 10px;gap:8px}.customer-metrics>div{display:grid;gap:8px;text-align:center}.customer-metrics>div+div{border-inline-start:1px solid var(--border)}.customer-metrics span{font-size:11px;color:var(--text-soft)}.customer-metrics strong{font-size:21px;line-height:1.2}.customer-metrics time{font-size:12px;align-self:center;direction:ltr}.customer-branches{flex:1}.branches-heading{display:flex;justify-content:space-between;align-items:center;font-size:12px;margin-bottom:12px;gap:8px}.branches-heading button{border:0;background:none;color:var(--accent);font:inherit;cursor:pointer;padding:0}.branch-chips{display:flex;flex-wrap:wrap;gap:8px;max-height:220px;overflow:auto}.branch-chip{display:flex;align-items:center;gap:8px;max-width:100%;border:1px solid var(--border);border-radius:9px;padding:8px 10px;background:var(--surface-soft);color:var(--text);font:inherit;font-size:12px;cursor:pointer;text-align:start}.branch-chip span{overflow-wrap:anywhere}.branch-chip small{color:var(--text-soft);font-size:10px}.branch-chip:hover,.branch-chip.matched{border-color:var(--primary);background:rgba(14,130,200,.14)}.no-branches{color:var(--text-soft);font-size:12px}.customer-card-actions{display:flex;flex-wrap:wrap;gap:9px;border-top:1px solid var(--border);padding-top:16px}.customer-card-actions .btn-primary{flex:1}.empty-directory{text-align:center;padding:40px 20px}.empty-icon{font-size:42px;color:var(--text-soft)}.empty-directory h3{margin:8px 0}.empty-directory p{color:var(--text-soft);font-size:13px;line-height:1.8}.directory-changes{margin:0}.directory-changes summary{cursor:pointer;font-weight:700}.directory-changes summary span{color:var(--text-soft);font-size:12px}.changes-list{display:grid;gap:0;margin-top:16px}.changes-list article{display:flex;justify-content:space-between;gap:14px;border-top:1px solid var(--border);padding:14px 0;font-size:12px}.changes-list p{color:var(--text-soft);margin:6px 0}.changes-list article>div:last-child{display:grid;align-content:start;gap:8px;color:var(--text-soft);text-align:end}.changes-list time{direction:ltr}@media(min-width:1500px){.customer-cards{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:600px){.directory-heading h1{font-size:24px}.heading-actions{width:100%}.heading-actions .btn{flex:1}.directory-search{min-width:100%}.status-filter{width:auto;flex:1}.directory-filters{gap:14px}.customer-card{padding:16px}.directory-section-title{align-items:start;flex-direction:column;gap:6px}.customer-card-actions .btn{font-size:12px}.network-directory{gap:18px}}`}</style>
  </div>;
}
