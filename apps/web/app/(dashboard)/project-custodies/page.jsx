'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, assetUrl } from '../../../lib/api';
import { authStorage } from '../../../lib/auth';
import { Permission, hasAnyPermission } from '../../../lib/permissions';

const statusLabels = { NO_MATERIALS: 'لم يتم صرف مواد', OPEN: 'ذمة مفتوحة', ACTIVE: 'ذمة نشطة', PARTIAL: 'تسوية جزئية', ATTENTION: 'تالفة أو مفقودة', CLOSED: 'ذمة مغلقة' };
const statusTone = { NO_MATERIALS: 'neutral', OPEN: 'warning', ACTIVE: 'info', PARTIAL: 'warning', ATTENTION: 'danger', CLOSED: 'success' };
const projectStatus = { PENDING_APPROVAL: 'قيد الموافقة', ACTIVE: 'نشط', ON_HOLD: 'معلق', DONE: 'مكتمل', REJECTED: 'مرفوض' };
const money = (value) => Number(value || 0).toLocaleString('en-US');
const date = (value) => value ? new Date(value).toLocaleString('ar-IQ') : '-';

function Status({ value }) { return <span className={`pc-status pc-status-${statusTone[value] || 'neutral'}`}>{statusLabels[value] || value}</span>; }

export default function ProjectCustodiesPage() {
  const user = authStorage.getUser();
  const canAccess = hasAnyPermission(user, [Permission.VIEW_PROJECT_CUSTODIES, Permission.MANAGE_PROJECTS, Permission.MANAGE_MATERIAL_INVENTORY]);
  const canManage = hasAnyPermission(user, [Permission.ISSUE_PROJECT_CUSTODY, Permission.ADJUST_PROJECT_CUSTODY, Permission.CANCEL_PROJECT_CUSTODY_ITEM, Permission.TRANSFER_PROJECT_CUSTODY_TECHNICIAN, Permission.MANAGE_MATERIAL_INVENTORY]);
  const canAddProject = hasAnyPermission(user, [Permission.ADD_PROJECT_FROM_WAREHOUSE, Permission.MANAGE_MATERIAL_INVENTORY, Permission.MANAGE_PROJECTS]);
  const canClose = hasAnyPermission(user, [Permission.CLOSE_PROJECT_CUSTODY, Permission.CLOSE_MATERIAL_CUSTODY]);
  const canReopen = hasAnyPermission(user, [Permission.REOPEN_PROJECT_CUSTODY]);
  const canValue = hasAnyPermission(user, [Permission.VIEW_PROJECT_CUSTODY_COST, Permission.VIEW_MATERIAL_REPORTS, Permission.MANAGE_MATERIAL_INVENTORY]);
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState({});
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [technicianId, setTechnicianId] = useState('');
  const [view, setView] = useState('cards');
  const [selected, setSelected] = useState(null);
  const [details, setDetails] = useState(null);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [itemAction, setItemAction] = useState(null);
  const [form, setForm] = useState({ name: '', code: '', clientName: '', clientPhone: '', location: '', description: '', startDate: '', expectedEndDate: '', projectManager: '', teamMembers: [], notes: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [deepLinkOpened, setDeepLinkOpened] = useState(false);

  const load = async () => {
    if (!canAccess) return setLoading(false);
    setLoading(true); setError('');
    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set('search', search.trim());
      if (status) query.set('status', status);
      if (technicianId) query.set('technicianId', technicianId);
      const [custodyRes, projectsRes, employeesRes] = await Promise.all([
        api.get(`/materials/project-custodies?${query}`), api.get('/projects'), api.get('/materials/employees'),
      ]);
      setRows(custodyRes.projects || []); setTotals(custodyRes.totals || {}); setProjects(projectsRes.projects || []); setEmployees(employeesRes.employees || employeesRes.users || []);
    } catch (err) { setError(err.message || 'تعذر تحميل ذمم المشاريع'); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [status, technicianId]);

  const technicians = useMemo(() => { const map = new Map(); rows.forEach((row) => row.technicians?.forEach((item) => map.set(item.id, item.name))); return [...map.entries()]; }, [rows]);

  const openDetails = async (row) => {
    setSelected(row); setError('');
    try { const response = await api.get(`/materials/project-custodies/${row.project._id}`); setDetails(response); }
    catch (err) { setError(err.message || 'تعذر تحميل تفاصيل الذمة'); }
  };
  useEffect(() => {
    const projectId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('projectId') : '';
    if (!deepLinkOpened && projectId && rows.length) {
      const row = rows.find((item) => item.project?._id === projectId);
      if (row) { setDeepLinkOpened(true); openDetails(row); }
    }
  }, [rows, deepLinkOpened]);

  const createProject = async (event) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const duplicate = projects.some((project) => project.code?.toLowerCase() === form.code.trim().toLowerCase() || project.name?.trim().toLowerCase() === form.name.trim().toLowerCase());
      if (duplicate) throw new Error('يوجد مشروع مسجل بنفس الاسم أو الرمز');
      await api.post('/projects', { ...form, teamMembers: form.teamMembers, endDate: form.expectedEndDate });
      setInfo('تم إنشاء المشروع وإضافته إلى القائمة الموحدة.'); setShowProjectForm(false); await load();
    } catch (err) { setError(err.message || 'تعذر إنشاء المشروع'); } finally { setSaving(false); }
  };

  const closeProject = async () => {
    const reason = window.prompt('اكتب سبب إغلاق ذمة المشروع:'); if (!reason) return;
    setSaving(true);
    try { await api.patch(`/materials/project-custodies/${selected.project._id}/close`, { reason }); setInfo('تم إغلاق ذمة المشروع.'); setSelected(null); setDetails(null); await load(); }
    catch (err) { setError(err.message || 'تعذر إغلاق الذمة'); } finally { setSaving(false); }
  };

  const reopenProject = async (row = selected) => {
    if (!row?.project?._id) return;
    const reason = window.prompt('اكتب سبب إعادة تفعيل ذمة المشروع:');
    if (!reason?.trim()) return;
    setSaving(true); setError(''); setInfo('');
    try {
      await api.patch(`/materials/project-custodies/${row.project._id}/reopen`, { reason: reason.trim() });
      setInfo('تمت إعادة تفعيل ذمة المشروع بنجاح.');
      await load();
      if (selected?.project?._id === row.project._id) {
        await openDetails({ ...row, custodyStatus: 'PARTIAL' });
      }
    } catch (err) {
      setError(err.message || 'تعذر إعادة تفعيل الذمة');
    } finally {
      setSaving(false);
    }
  };

  const submitItemAction = async (event) => {
    event.preventDefault();
    if (!itemAction?.reason.trim() || !itemAction?.note.trim()) return setError('سبب العملية والملاحظة إلزاميان.');
    setSaving(true); setError('');
    try {
      await api.patch(`/materials/project-custodies/${selected.project._id}/custodies/${itemAction.item.custodyId}/items/${itemAction.item.itemId}`, { action: itemAction.action, quantity: itemAction.quantity, technicianId: itemAction.technicianId, reason: itemAction.reason, note: itemAction.note });
      setInfo('تم تحديث مادة الذمة مع حفظ سجل التعديل.'); setItemAction(null); await openDetails(selected); await load();
    } catch (err) { setError(err.message || 'تعذر تحديث المادة'); } finally { setSaving(false); }
  };

  const exportPdf = async (projectId, code) => {
    try { const blob = await api.downloadBlob(`/materials/reports/pdf?projectId=${projectId}`); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `project-custody-${code}.pdf`; a.click(); URL.revokeObjectURL(url); }
    catch (err) { setError(err.message || 'تعذر تصدير التقرير'); }
  };

  const exportExcel = async (projectId, code) => {
    try { const blob = await api.downloadBlob(`/materials/reports/excel?projectId=${projectId}`); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `project-custody-${code}.xlsx`; a.click(); URL.revokeObjectURL(url); }
    catch (err) { setError(err.message || 'تعذر تصدير Excel'); }
  };

  const shareWhatsapp = async (projectId) => {
    try { const response = await api.post(`/materials/reports/whatsapp-link?projectId=${projectId}`, {}); if (response.whatsapp?.url) window.open(response.whatsapp.url, '_blank', 'noopener,noreferrer'); }
    catch (err) { setError(err.message || 'تعذر تجهيز رسالة واتساب'); }
  };

  if (!canAccess) return <section className="card section">لا تملك صلاحية مشاهدة ذمم المشاريع.</section>;
  return <>
    <section className="card section pc-hero"><div><span>المخازن والمواد</span><h1>ذمم المشاريع</h1><p>متابعة المواد المصروفة والمستخدمة والمرتجعة وربطها بالمشاريع والفنيين من سجل موحد.</p></div><div className="pc-actions">{canAddProject ? <button className="btn btn-primary" onClick={() => { window.location.href = '/projects'; }}>إضافة مشروع جديد</button> : null}<button className="btn btn-soft" onClick={load}>تحديث</button></div></section>
    {error ? <div className="card section pc-alert pc-error">{error}</div> : null}{info ? <div className="card section pc-alert pc-info">{info}</div> : null}
    <section className="pc-kpis"><article><span>المشاريع ذات الذمم</span><strong>{totals.projects || 0}</strong></article><article><span>الذمم المفتوحة</span><strong>{totals.open || 0}</strong></article><article><span>القيمة الإجمالية</span><strong>{canValue ? `${money(totals.value)} IQD` : 'محجوبة'}</strong></article></section>
    <section className="card section pc-filters"><label>البحث<input className="input" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} placeholder="اسم المشروع أو الرمز أو العميل" /></label><label>حالة الذمة<select className="select" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">جميع الحالات</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>الفني<select className="select" value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}><option value="">جميع الفنيين</option>{technicians.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><button className="btn btn-primary" onClick={load}>بحث</button><div className="pc-view"><button className={view === 'cards' ? 'is-active' : ''} onClick={() => setView('cards')}>كروت</button><button className={view === 'table' ? 'is-active' : ''} onClick={() => setView('table')}>جدول</button></div></section>
    {loading ? <section className="card section">جار تحميل ذمم المشاريع...</section> : view === 'cards' ? <section className="pc-grid">{rows.map((row) => <article className="pc-card" key={row.project._id}><header><div><small>{row.project.code}</small><h2>{row.project.name}</h2><p>{row.project.clientName || 'بدون عميل'} · {row.project.location || 'الموقع غير محدد'}</p></div><Status value={row.custodyStatus} /></header><div className="pc-mini"><div><span>حالة المشروع</span><strong>{projectStatus[row.project.status] || row.project.status}</strong></div><div><span>مدير المشروع</span><strong>{row.project.projectManager?.fullName || row.project.owner?.fullName || '-'}</strong></div><div><span>عدد المواد</span><strong>{row.totals.lines}</strong></div><div><span>إجمالي المصروف</span><strong>{money(row.totals.issued)}</strong></div><div><span>الفنيون</span><strong>{row.techniciansCount}</strong></div><div><span>آخر حركة</span><strong>{date(row.lastMovementAt)}</strong></div></div>{canValue ? <div className="pc-value"><span>قيمة المواد المصروفة</span><strong dir="ltr">{money(row.totals.value)} IQD</strong></div> : null}<footer><button className="btn btn-primary btn-sm" onClick={() => openDetails(row)}>عرض التفاصيل</button>{canManage ? <button className="btn btn-soft btn-sm" onClick={() => { window.location.href = `/materials?projectId=${row.project._id}&action=request`; }}>إضافة مواد</button> : null}<button className="btn btn-soft btn-sm" onClick={() => exportPdf(row.project._id, row.project.code)}>PDF</button>{canReopen && row.custodyStatus === "CLOSED" ? <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => reopenProject(row)}>إعادة تفعيل الذمة</button> : null}</footer></article>)}{!rows.length ? <div className="card section">لا توجد مشاريع صُرفت عليها مواد وفق عوامل البحث.</div> : null}</section> : <section className="card section pc-table-wrap"><table className="table"><thead><tr><th>المشروع</th><th>العميل</th><th>الحالة</th><th>المواد</th><th>المصروف</th><th>الفنيون</th><th>آخر حركة</th><th></th></tr></thead><tbody>{rows.map((row) => <tr key={row.project._id}><td><strong>{row.project.name}</strong><small>{row.project.code}</small></td><td>{row.project.clientName || '-'}</td><td><Status value={row.custodyStatus} /></td><td>{row.totals.lines}</td><td>{money(row.totals.issued)}</td><td>{row.techniciansCount}</td><td>{date(row.lastMovementAt)}</td><td><div className="pc-row-actions"><button className="btn btn-primary btn-sm" onClick={() => openDetails(row)}>تفاصيل</button>{canReopen && row.custodyStatus === "CLOSED" ? <button className="btn btn-soft btn-sm" disabled={saving} onClick={() => reopenProject(row)}>إعادة تفعيل</button> : null}</div></td></tr>)}</tbody></table></section>}

    {selected && details ? <div className="pc-modal" onMouseDown={(e) => e.target === e.currentTarget && setSelected(null)}><section className="pc-modal-panel"><header><div><small>{selected.project.code}</small><h2>{selected.project.name}</h2><p>{selected.project.clientName || '-'} · {selected.project.location || '-'}</p></div><button onClick={() => { setSelected(null); setDetails(null); }}>×</button></header><div className="pc-detail-actions">{canManage ? <button className="btn btn-primary" onClick={() => { window.location.href = `/materials?projectId=${selected.project._id}&action=request`; }}>إضافة مواد</button> : null}<button className="btn btn-soft" onClick={() => { window.location.href = `/materials?projectId=${selected.project._id}&tab=custodies`; }}>إرجاع أو تسوية مواد</button><button className="btn btn-soft" onClick={() => exportPdf(selected.project._id, selected.project.code)}>تصدير PDF</button>{selected.custodyStatus === "CLOSED" ? (canReopen ? <button className="btn btn-primary" disabled={saving} onClick={() => reopenProject(selected)}>إعادة تفعيل الذمة</button> : null) : (canClose ? <button className="btn btn-soft" disabled={saving} onClick={closeProject}>إغلاق الذمة</button> : null)}</div><div className="pc-detail-table"><table className="table"><thead><tr><th>المادة</th><th>الموديل/الباركود</th><th>المصروف</th><th>المستخدم</th><th>المرتجع</th><th>التالف/المفقود</th><th>المتبقي</th><th>الفني</th><th>السند</th>{canManage ? <th>إجراءات</th> : null}</tr></thead><tbody>{details.items.map((item) => <tr key={`${item.custodyId}-${item.itemId}`}><td><div className="pc-material">{item.material?.imageUrl ? <img src={assetUrl(item.material.imageUrl)} alt="" /> : <span>—</span>}<div><strong>{item.materialName}</strong><small>{item.material?.category || ''}</small></div></div></td><td>{item.material?.model || '-'}<small>{item.material?.barcode || item.material?.code || '-'}</small></td><td>{money(item.receivedQty)}</td><td>{money(item.consumedQty)}</td><td>{money(item.returnedQty)}</td><td>{money(item.damagedQty)} / {money(item.lostQty)}</td><td><strong>{money(item.remainingQty)}</strong></td><td>{item.assignedTechnician?.fullName || item.holder?.fullName || 'على ذمة المشروع'}</td><td>{item.dispatchNo || item.custodyNo}<small>{date(item.deliveredAt)}</small></td>{canManage ? <td><div className="pc-row-actions"><button className="btn btn-soft btn-sm" onClick={() => setItemAction({ item, action: 'ADJUST', quantity: item.receivedQty, technicianId: '', reason: '', note: '' })}>تعديل</button><button className="btn btn-soft btn-sm" onClick={() => setItemAction({ item, action: 'TRANSFER_TECHNICIAN', quantity: '', technicianId: '', reason: '', note: '' })}>نقل فني</button><button className="btn btn-soft btn-sm" onClick={() => setItemAction({ item, action: 'UNASSIGN_TECHNICIAN', quantity: '', technicianId: '', reason: '', note: '' })}>فك الارتباط</button><button className="btn btn-soft btn-sm" onClick={() => setItemAction({ item, action: 'CANCEL', quantity: '', technicianId: '', reason: '', note: '' })}>إلغاء</button></div></td> : null}</tr>)}</tbody></table></div></section></div> : null}

    {itemAction ? <div className="pc-modal pc-modal-top"><form className="pc-modal-panel pc-action-form" onSubmit={submitItemAction}><header><div><h2>{itemAction.action === 'ADJUST' ? 'تعديل كمية المادة' : itemAction.action === 'TRANSFER_TECHNICIAN' ? 'نقل المادة إلى فني' : itemAction.action === 'UNASSIGN_TECHNICIAN' ? 'إلغاء ارتباط المادة بالفني' : 'إلغاء مادة مصروفة'}</h2><p>{itemAction.item.materialName}</p></div><button type="button" onClick={() => setItemAction(null)}>×</button></header>{itemAction.action === 'ADJUST' ? <label>الكمية الجديدة<input required className="input" type="number" min="0" step="any" value={itemAction.quantity} onChange={(e) => setItemAction((p) => ({ ...p, quantity: e.target.value }))} /></label> : null}{itemAction.action === 'TRANSFER_TECHNICIAN' ? <label>الفني الجديد<select required className="select" value={itemAction.technicianId} onChange={(e) => setItemAction((p) => ({ ...p, technicianId: e.target.value }))}><option value="">اختر الفني</option>{employees.map((employee) => <option key={employee._id} value={employee._id}>{employee.fullName}</option>)}</select></label> : null}<label>سبب العملية<input required className="input" value={itemAction.reason} onChange={(e) => setItemAction((p) => ({ ...p, reason: e.target.value }))} /></label><label>ملاحظة إلزامية<textarea required className="textarea" value={itemAction.note} onChange={(e) => setItemAction((p) => ({ ...p, note: e.target.value }))} /></label><div className="pc-detail-actions"><button className="btn btn-primary" disabled={saving}>{saving ? 'جار الحفظ...' : 'تأكيد العملية'}</button><button type="button" className="btn btn-soft" onClick={() => setItemAction(null)}>إلغاء</button></div></form></div> : null}

    {showProjectForm ? <div className="pc-modal"><form className="pc-modal-panel pc-project-form" onSubmit={createProject}><header><div><h2>إضافة مشروع جديد</h2><p>سيُضاف إلى قائمة المشاريع الموحدة داخل النظام.</p></div><button type="button" onClick={() => setShowProjectForm(false)}>×</button></header><div className="pc-form-grid"><label>اسم المشروع<input required className="input" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></label><label>رمز المشروع<input required className="input" dir="ltr" value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} /></label><label>اسم العميل<input className="input" value={form.clientName} onChange={(e) => setForm((p) => ({ ...p, clientName: e.target.value }))} /></label><label>هاتف العميل<input className="input" dir="ltr" value={form.clientPhone} onChange={(e) => setForm((p) => ({ ...p, clientPhone: e.target.value }))} /></label><label>الموقع<input className="input" value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} /></label><label>مدير المشروع<select className="select" value={form.projectManager} onChange={(e) => setForm((p) => ({ ...p, projectManager: e.target.value }))}><option value="">المستخدم الحالي</option>{employees.map((employee) => <option key={employee._id} value={employee._id}>{employee.fullName}</option>)}</select></label><label>تاريخ البدء<input className="input" type="date" value={form.startDate} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} /></label><label>الانتهاء المتوقع<input className="input" type="date" value={form.expectedEndDate} onChange={(e) => setForm((p) => ({ ...p, expectedEndDate: e.target.value }))} /></label><label className="pc-full">الوصف<textarea className="textarea" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} /></label><label className="pc-full">ملاحظات<textarea className="textarea" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} /></label></div><div className="pc-detail-actions"><button className="btn btn-primary" disabled={saving}>{saving ? 'جار الحفظ...' : 'حفظ المشروع'}</button><button type="button" className="btn btn-soft" onClick={() => setShowProjectForm(false)}>إلغاء</button></div></form></div> : null}
    <style jsx global>{`
      .pc-hero{display:flex;justify-content:space-between;gap:20px;align-items:center}.pc-hero span{color:var(--accent);font-size:12px;font-weight:900}.pc-hero h1{margin:4px 0}.pc-hero p{margin:0;color:var(--text-soft)}.pc-actions,.pc-detail-actions{display:flex;flex-wrap:wrap;gap:8px}.pc-alert{margin-top:12px}.pc-error{color:var(--danger)}.pc-info{color:var(--accent)}
      .pc-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:14px 0}.pc-kpis article{display:grid;gap:8px;padding:16px;border:1px solid var(--border);border-radius:14px;background:linear-gradient(180deg,var(--surface),#08101f)}.pc-kpis span{color:var(--text-soft)}.pc-kpis strong{font-size:24px;color:var(--accent)}
      .pc-filters{display:grid;grid-template-columns:2fr 1fr 1fr auto auto;gap:10px;align-items:end;margin-bottom:14px}.pc-filters label,.pc-form-grid label{display:grid;gap:6px;font-size:12px;font-weight:800}.pc-view{display:flex;border:1px solid var(--border);border-radius:9px;overflow:hidden}.pc-view button{border:0;padding:10px;color:var(--text-soft);background:var(--surface);cursor:pointer}.pc-view .is-active{color:var(--surface);background:var(--accent)}
      .pc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:14px}.pc-card{display:flex;flex-direction:column;gap:14px;padding:16px;border:1px solid var(--border);border-radius:16px;background:linear-gradient(180deg,rgba(13,24,46,.98),rgba(6,13,26,.98));box-shadow:0 14px 30px rgba(0,0,0,.18)}.pc-card header,.pc-modal-panel>header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.pc-card h2,.pc-card p,.pc-modal-panel h2,.pc-modal-panel p{margin:0}.pc-card header small,.pc-modal-panel header small{color:var(--accent)}.pc-card header p,.pc-modal-panel header p{color:var(--text-soft);font-size:12px}.pc-status{display:inline-flex;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:900;white-space:nowrap}.pc-status-success{color:#a9f7c6;background:rgba(34,197,94,.15)}.pc-status-warning{color:#fcd887;background:rgba(245,158,11,.15)}.pc-status-danger{color:#ffb1b1;background:rgba(239,68,68,.15)}.pc-status-info{color:#9bc8ff;background:rgba(59,130,246,.15)}.pc-status-neutral{color:var(--text-soft);background:var(--surface-soft)}
      .pc-mini{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.pc-mini div{padding:9px;border:1px solid rgba(78,111,167,.2);border-radius:10px;background:rgba(16,33,64,.55)}.pc-mini span{display:block;color:var(--text-soft);font-size:11px;margin-bottom:3px}.pc-mini strong{font-size:12px}.pc-value{display:flex;justify-content:space-between;align-items:center;padding:11px;border-radius:10px;background:rgba(196,215,67,.07);border:1px solid rgba(196,215,67,.2)}.pc-value span{color:var(--text-soft);font-size:12px}.pc-value strong{color:var(--accent)}.pc-card footer{display:flex;flex-wrap:wrap;gap:7px;margin-top:auto}
      .pc-table-wrap{overflow:auto}.pc-table-wrap td small,.pc-detail-table td small{display:block;color:var(--text-soft);font-size:10px;margin-top:3px}.pc-modal{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:18px;background:rgba(2,6,14,.78);backdrop-filter:blur(5px)}.pc-modal-panel{width:min(1180px,100%);max-height:92vh;overflow:auto;padding:18px;border:1px solid var(--border);border-radius:18px;background:var(--surface);box-shadow:var(--shadow)}.pc-modal-panel>header>button{border:0;color:var(--text);background:transparent;font-size:28px;cursor:pointer}.pc-detail-actions{margin:16px 0}.pc-detail-table{overflow:auto;border:1px solid var(--border);border-radius:12px}.pc-material{display:flex;gap:8px;align-items:center;min-width:160px}.pc-material img,.pc-material>span{display:grid;width:44px;height:44px;place-items:center;object-fit:contain;border-radius:8px;background:var(--surface-soft)}.pc-material small{display:block}.pc-form-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.pc-full{grid-column:1/-1}
      .pc-row-actions{display:flex;flex-wrap:wrap;gap:5px;min-width:190px}.pc-action-form{display:grid;gap:12px;width:min(560px,100%)}.pc-action-form label{display:grid;gap:6px;font-size:12px;font-weight:800}.pc-modal-top{z-index:1010}
      @media(max-width:850px){.pc-hero{align-items:stretch;flex-direction:column}.pc-actions .btn{flex:1}.pc-kpis{grid-template-columns:1fr}.pc-filters{grid-template-columns:1fr}.pc-view{width:100%}.pc-view button{flex:1}.pc-form-grid{grid-template-columns:1fr}.pc-full{grid-column:auto}.pc-modal{padding:0;align-items:end}.pc-modal-panel{max-height:95dvh;border-radius:20px 20px 0 0}.pc-detail-actions .btn{width:100%}.pc-table-wrap{display:none}}
    `}</style>
  </>;
}
