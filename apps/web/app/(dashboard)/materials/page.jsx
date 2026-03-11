'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { api } from '../../../lib/api';
import { authStorage } from '../../../lib/auth';
import { Permission, hasAnyPermission, hasPermission } from '../../../lib/permissions';

/* ─── constants ─── */
const statusLabel = {
  NEW: 'جديد', UNDER_REVIEW: 'قيد المراجعة', APPROVED: 'معتمد', REJECTED: 'مرفوض',
  PREPARING: 'جاري التجهيز', PREPARED: 'تم التجهيز', DELIVERED: 'تم التسليم',
  PENDING_RECONCILIATION: 'بانتظار التصفية', RECONCILED: 'تمت التصفية',
  PARTIALLY_RECONCILED: 'تصفية جزئية', FULLY_RECONCILED: 'تصفية كاملة',
  SUBMITTED: 'مرسل', OPEN: 'مفتوح', CLOSED: 'مغلق',
};
const statusColor = {
  NEW: '#4fc3f7', APPROVED: '#81c784', REJECTED: '#e57373', PREPARING: '#ffb74d',
  PREPARED: '#aed581', DELIVERED: '#64b5f6', PENDING_RECONCILIATION: '#ffd54f',
  RECONCILED: '#81c784', PARTIALLY_RECONCILED: '#ffb74d', FULLY_RECONCILED: '#81c784',
  SUBMITTED: '#4fc3f7', OPEN: '#4fc3f7', CLOSED: '#90a4ae',
};
const unitLabels = { PIECE: 'قطعة', METER: 'متر', KG: 'كجم', TON: 'طن', LITER: 'لتر', SQM: 'م²', BAG: 'كيس', ROLL: 'لفة', SET: 'طقم', PAIR: 'زوج', BOX: 'صندوق' };

const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const makeItem = () => ({ id: uid(), materialName: '', unit: 'METER', requestedQty: '', notes: '' });

const flattenOrgChart = (roots = []) => {
  const q = Array.isArray(roots) ? [...roots] : [], list = [];
  while (q.length) {
    const n = q.shift(); if (!n) continue;
    list.push({ id: n.id, _id: n.id, fullName: n.fullName || '-', employeeCode: n.employeeCode || '', active: true });
    if (Array.isArray(n.children)) q.push(...n.children);
  }
  return list;
};

const downloadBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  window.URL.revokeObjectURL(url);
};

/* ─── Badge component ─── */
const Badge = ({ status }) => (
  <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: statusColor[status] || '#555', color: '#fff' }}>
    {statusLabel[status] || status}
  </span>
);

/* ─── Modal component ─── */
const Modal = ({ open, title, onClose, children }) => {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.55)' }} onClick={onClose}>
      <div style={{ background: 'var(--card-bg, #1e293b)', borderRadius: 12, padding: 24, minWidth: 420, maxWidth: '90vw', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,.4)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-soft)', fontSize: 22, cursor: 'pointer' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
};

/* ─── Main Component ─── */
export default function MaterialsPage() {
  const currentUser = authStorage.getUser();

  /* state */
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [allUsers, setAllUsers] = useState([]); /* all employees — used for preparer dropdown */
  const [materials, setMaterials] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [custodies, setCustodies] = useState([]);
  const [reconciliations, setReconciliations] = useState([]);
  const [summary, setSummary] = useState(null);
  const [activeTab, setActiveTab] = useState('requests');

  /* modals */
  const [reviewModal, setReviewModal] = useState(null);
  const [prepareModal, setPrepareModal] = useState(null);
  const [dispatchModal, setDispatchModal] = useState(null);
  const [reconcileModal, setReconcileModal] = useState(null);
  const [returnModal, setReturnModal] = useState(null);
  const [detailModal, setDetailModal] = useState(null);

  /* request form */
  const [requestForm, setRequestForm] = useState({
    projectId: '', priority: 'NORMAL', clientName: '', requestedForId: '',
    assignedPreparerId: '', warehouseId: '', generalNotes: '', items: [makeItem()],
  });

  /* permissions */
  const canAccess = useMemo(() => hasAnyPermission(currentUser, [
    Permission.CREATE_MATERIAL_REQUESTS, Permission.REVIEW_MATERIAL_REQUESTS,
    Permission.PREPARE_MATERIAL_REQUESTS, Permission.DISPATCH_MATERIAL_REQUESTS,
    Permission.RECONCILE_MATERIAL_CUSTODY, Permission.CLOSE_MATERIAL_CUSTODY,
    Permission.VIEW_MATERIAL_REPORTS, Permission.MANAGE_MATERIAL_INVENTORY,
    Permission.MANAGE_MATERIAL_CATALOG,
  ]), [currentUser?.role, currentUser?.customPermissions, currentUser?.permissions]);

  const canReview = hasPermission(currentUser, Permission.REVIEW_MATERIAL_REQUESTS);
  const canPrepare = hasPermission(currentUser, Permission.PREPARE_MATERIAL_REQUESTS);
  const canDispatch = hasPermission(currentUser, Permission.DISPATCH_MATERIAL_REQUESTS);
  const canReconcile = hasPermission(currentUser, Permission.RECONCILE_MATERIAL_CUSTODY);
  const canClose = hasPermission(currentUser, Permission.CLOSE_MATERIAL_CUSTODY);
  const canReports = hasPermission(currentUser, Permission.VIEW_MATERIAL_REPORTS);

  /* check if current user is the assigned preparer for a request (or GM fallback) */
  const myId = currentUser?.id || currentUser?._id || '';
  const isGM = currentUser?.role === 'GENERAL_MANAGER';
  const isMyPreparer = (req) => {
    const pid = req.assignedPreparer?._id || req.assignedPreparer?.id || req.assignedPreparer;
    if (!pid) return isGM; /* no preparer assigned → only GM */
    return pid === myId || isGM;
  };

  /* data loader */
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [mRes, wRes, pRes, uRes, allURes, rqRes, cuRes, rcRes, smRes] = await Promise.all([
        api.get('/materials/catalog'),
        api.get('/materials/warehouses'),
        api.get('/projects').catch(() => ({ projects: [] })),
        api.get('/auth/users').catch(async () => {
          const chart = await api.get('/auth/org-chart').catch(() => ({ roots: [] }));
          return { users: flattenOrgChart(chart.roots || []) };
        }),
        api.get('/materials/employees').catch(async () => {
          const fromAuth = await api.get('/auth/users?allUsers=1').catch(async () => {
            const chart = await api.get('/auth/org-chart').catch(() => ({ roots: [] }));
            return { users: flattenOrgChart(chart.roots || []) };
          });
          return fromAuth;
        }),
        api.get('/materials/requests'),
        api.get('/materials/custodies'),
        api.get('/materials/reconciliations'),
        canReports ? api.get('/materials/reports/summary').catch(() => null) : Promise.resolve(null),
      ]);
      setMaterials(mRes.materials || []);
      setWarehouses(wRes.warehouses || []);
      setProjects(pRes.projects || []);
      setUsers((uRes.users || []).filter((u) => u?.active));
      setAllUsers((allURes.users || []).filter((u) => u?.active));
      setRequests(rqRes.requests || []);
      setCustodies(cuRes.custodies || []);
      setReconciliations(rcRes.reconciliations || []);
      setSummary(smRes);
    } catch (err) { setError(err.message || 'تعذر تحميل البيانات'); }
    finally { setLoading(false); }
  }, [canReports]);

  useEffect(() => { if (canAccess) load(); }, [canAccess, load]);

  /* helpers */
  const sendWhatsapp = async (path) => {
    setError('');
    try {
      const r = await api.post(path, {});
      const url = r?.whatsapp?.url || '';
      if (!url) { setError('تعذر توليد رابط واتساب'); return; }
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) { setError(err.message || 'فشل فتح واتساب'); }
  };

  const doAction = async (fn) => {
    setError(''); setInfo('');
    try { await fn(); await load(); } catch (err) { setError(err.message || 'فشلت العملية'); }
    finally { setBusy(''); }
  };

  const updateRequestItem = (itemId, changes) => {
    setRequestForm((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it.id === itemId ? { ...it, ...changes } : it)),
    }));
  };

  const getMaterialOption = (mat) => `${mat.code} - ${mat.name} (${unitLabels[mat.unit] || mat.unit})`;

  /* ────────── CREATE REQUEST ────────── */
  const createRequest = async (e) => {
    e.preventDefault(); setBusy('create'); setError(''); setInfo('');
    try {
      const items = requestForm.items
        .filter((it) => it.materialName?.trim() && toNum(it.requestedQty) > 0)
        .map((it) => ({ materialName: it.materialName.trim(), unit: it.unit || 'PIECE', requestedQty: toNum(it.requestedQty), notes: it.notes }));
      if (!items.length) throw new Error('يرجى إضافة مادة واحدة على الأقل مع كمية أكبر من صفر.');
      await api.post('/materials/requests', { ...requestForm, items });
      setRequestForm({ projectId: '', priority: 'NORMAL', clientName: '', requestedForId: '', assignedPreparerId: '', warehouseId: '', generalNotes: '', items: [makeItem()] });
      setInfo('تم إنشاء الطلب بنجاح'); await load();
    } catch (err) { setError(err.message || 'فشل إنشاء الطلب'); }
    finally { setBusy(''); }
  };

  /* ────────── REVIEW ────────── */
  const openReview = (req) => setReviewModal({ request: req, action: 'APPROVE_FULL', rejectReason: '' });
  const submitReview = async () => {
    if (!reviewModal) return;
    setBusy('review');
    await doAction(async () => {
      const body = { action: reviewModal.action };
      if (reviewModal.action === 'REJECT') body.rejectReason = reviewModal.rejectReason;
      await api.patch(`/materials/requests/${reviewModal.request._id}/review`, body);
      setInfo(reviewModal.action === 'REJECT' ? 'تم رفض الطلب' : 'تم اعتماد الطلب');
      setReviewModal(null);
    });
  };

  /* ────────── PREPARE ────────── */
  const openPrepare = (req) => {
    const items = (req.items || [])
      .filter((x) => toNum(x.approvedQty) > toNum(x.preparedQty))
      .map((x) => ({ materialId: x.material?._id || x.material, materialName: x.materialName, preparedQty: toNum(x.approvedQty) - toNum(x.preparedQty) }));
    setPrepareModal({ request: req, items, warehouseId: req.warehouse?._id || '' });
  };
  const submitPrepare = async () => {
    if (!prepareModal) return;
    setBusy('prepare');
    await doAction(async () => {
      await api.patch(`/materials/requests/${prepareModal.request._id}/prepare`, {
        warehouseId: prepareModal.warehouseId || undefined,
        items: prepareModal.items.filter((x) => toNum(x.preparedQty) > 0),
      });
      setInfo('تم تجهيز الطلب'); setPrepareModal(null);
    });
  };

  /* ────────── DISPATCH ────────── */
  const openDispatch = (req) => {
    const items = (req.items || [])
      .filter((x) => toNum(x.preparedQty) > toNum(x.deliveredQty))
      .map((x) => ({ materialId: x.material?._id || x.material, materialName: x.materialName, deliveredQty: toNum(x.preparedQty) - toNum(x.deliveredQty) }));
    setDispatchModal({ request: req, items, warehouseId: req.warehouse?._id || '', recipientId: req.requestedFor?._id || req.requestedBy?._id || '' });
  };
  const submitDispatch = async () => {
    if (!dispatchModal) return;
    setBusy('dispatch');
    await doAction(async () => {
      await api.patch(`/materials/requests/${dispatchModal.request._id}/dispatch`, {
        warehouseId: dispatchModal.warehouseId || undefined,
        items: dispatchModal.items.filter((x) => toNum(x.deliveredQty) > 0),
      });
      setInfo('تم تسليم المواد وتسجيلها كذمة'); setDispatchModal(null);
    });
  };

  /* ────────── RECONCILE ────────── */
  const openReconcile = (custody) => {
    const items = (custody.items || [])
      .filter((x) => x.lineStatus !== 'CLOSED')
      .map((x) => ({
        materialId: x.material?._id || x.material, materialName: x.materialName,
        receivedQty: toNum(x.receivedQty), consumedQty: 0, remainingQty: toNum(x.remainingQty),
        damagedQty: 0, lostQty: 0, toReturnQty: toNum(x.remainingQty),
      }));
    setReconcileModal({ custody, items });
  };
  const submitReconcile = async () => {
    if (!reconcileModal) return;
    setBusy('reconcile');
    await doAction(async () => {
      await api.post(`/materials/custodies/${reconcileModal.custody._id}/reconcile`, {
        items: reconcileModal.items.map((x) => ({
          materialId: x.materialId, consumedQty: toNum(x.consumedQty), remainingQty: toNum(x.remainingQty),
          damagedQty: toNum(x.damagedQty), lostQty: toNum(x.lostQty), toReturnQty: toNum(x.toReturnQty),
        })),
      });
      setInfo('تم إرسال التصفية للاعتماد'); setReconcileModal(null);
    });
  };

  /* ────────── RECEIVE RETURNS ────────── */
  const openReturn = (recon) => {
    const items = (recon.items || [])
      .filter((x) => toNum(x.toReturnQty) > toNum(x.returnedQtyConfirmed || 0))
      .map((x) => ({
        materialId: x.material?._id || x.material, materialName: x.materialName,
        returnedQty: toNum(x.toReturnQty) - toNum(x.returnedQtyConfirmed || 0), condition: 'NEW',
      }));
    setReturnModal({ recon, items, warehouseId: '' });
  };
  const submitReturn = async () => {
    if (!returnModal) return;
    setBusy('return');
    await doAction(async () => {
      await api.post(`/materials/reconciliations/${returnModal.recon._id}/returns`, {
        warehouseId: returnModal.warehouseId || undefined,
        items: returnModal.items.filter((x) => toNum(x.returnedQty) > 0),
      });
      setInfo('تم استلام المواد الراجعة وإرجاعها للمخزن'); setReturnModal(null);
    });
  };

  if (!canAccess) return <section className="card section">لا تملك صلاحية الوصول.</section>;

  /* ════════════════════════ RENDER ════════════════════════ */
  const tabStyle = (t) => ({ padding: '8px 20px', cursor: 'pointer', border: 'none', borderBottom: activeTab === t ? '3px solid var(--primary, #4fc3f7)' : '3px solid transparent', background: 'none', color: activeTab === t ? 'var(--primary, #4fc3f7)' : 'var(--text-soft)', fontWeight: 600, fontSize: 14 });

  return (
    <>
      {error && <div style={{ padding: '10px 16px', margin: '0 0 12px', borderRadius: 8, background: 'rgba(229,115,115,.15)', color: '#e57373', fontWeight: 500 }}>{error}</div>}
      {info && <div style={{ padding: '10px 16px', margin: '0 0 12px', borderRadius: 8, background: 'rgba(129,199,132,.15)', color: '#81c784', fontWeight: 500 }}>{info}</div>}

      {/* KPI */}
      <section className="grid-4" style={{ marginBottom: 16 }}>
        <article className="card section"><p style={{ marginTop: 0, color: 'var(--text-soft)' }}>الطلبات</p><h2>{requests.length}</h2></article>
        <article className="card section"><p style={{ marginTop: 0, color: 'var(--text-soft)' }}>الذمم المفتوحة</p><h2>{custodies.filter((c) => c.status !== 'CLOSED').length}</h2></article>
        <article className="card section"><p style={{ marginTop: 0, color: 'var(--text-soft)' }}>التصفيات</p><h2>{reconciliations.length}</h2></article>
        <article className="card section"><p style={{ marginTop: 0, color: 'var(--text-soft)' }}>المواد بالكتلوج</p><h2>{materials.length}</h2></article>
      </section>

      {/* TABS */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border, #334155)', marginBottom: 16 }}>
        <button type="button" style={tabStyle('requests')} onClick={() => setActiveTab('requests')}>طلبات المواد</button>
        <button type="button" style={tabStyle('custodies')} onClick={() => setActiveTab('custodies')}>الذمم والتصفية</button>
        {canReports && <button type="button" style={tabStyle('reports')} onClick={() => setActiveTab('reports')}>التقارير</button>}
        <div style={{ flex: 1 }} />
        <button className="btn btn-soft" type="button" onClick={load} disabled={loading} style={{ alignSelf: 'center', fontSize: 12 }}>{loading ? 'جارٍ...' : 'تحديث ↻'}</button>
      </div>

      {/* ══════ TAB: REQUESTS ══════ */}
      {activeTab === 'requests' && (
        <>
          {/* new request form */}
          <section className="card section" style={{ marginBottom: 16 }}>
            <h2 style={{ marginTop: 0 }}>طلب مواد جديد</h2>
            <form onSubmit={createRequest}>
              <div className="grid-3" style={{ marginBottom: 12 }}>
                <label>المشروع *<select className="select" value={requestForm.projectId} onChange={(e) => setRequestForm((p) => ({ ...p, projectId: e.target.value }))} required><option value="">اختر المشروع</option>{projects.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}</select></label>
                <label>المخزن<select className="select" value={requestForm.warehouseId} onChange={(e) => setRequestForm((p) => ({ ...p, warehouseId: e.target.value }))}><option value="">افتراضي</option>{warehouses.map((w) => <option key={w._id} value={w._id}>{w.name}</option>)}</select></label>
                <label>مجهز الطلب<select className="select" value={requestForm.assignedPreparerId} onChange={(e) => setRequestForm((p) => ({ ...p, assignedPreparerId: e.target.value }))}><option value="">بدون تعيين</option>{allUsers.map((u) => <option key={u.id || u._id} value={u.id || u._id}>{u.fullName}{u.employeeCode ? ` (${u.employeeCode})` : ''}</option>)}</select></label>
                <label>المستلم (طالب المواد)<select className="select" value={requestForm.requestedForId} onChange={(e) => setRequestForm((p) => ({ ...p, requestedForId: e.target.value }))}><option value="">نفس المستخدم</option>{users.map((u) => <option key={u.id || u._id} value={u.id || u._id}>{u.fullName}{u.employeeCode ? ` (${u.employeeCode})` : ''}</option>)}</select></label>
                <label>العميل<input className="input" value={requestForm.clientName} onChange={(e) => setRequestForm((p) => ({ ...p, clientName: e.target.value }))} /></label>
                <label>الأولوية<select className="select" value={requestForm.priority} onChange={(e) => setRequestForm((p) => ({ ...p, priority: e.target.value }))}><option value="URGENT">عاجل</option><option value="NORMAL">طبيعي</option><option value="LOW">منخفض</option></select></label>
              </div>
              <label style={{ display: 'block', marginBottom: 12 }}>ملاحظات عامة<input className="input" value={requestForm.generalNotes} onChange={(e) => setRequestForm((p) => ({ ...p, generalNotes: e.target.value }))} style={{ width: '100%' }} /></label>

              <h4 style={{ margin: '8px 0' }}>بنود الطلب</h4>
              <table className="table" style={{ marginBottom: 8 }}>
                <thead><tr><th>المادة</th><th>الكمية</th><th>الوحدة</th><th>ملاحظات</th><th></th></tr></thead>
                <tbody>
                  {requestForm.items.map((it) => (
                    <tr key={it.id}>
                      <td><input className="input" value={it.materialName} onChange={(e) => updateRequestItem(it.id, { materialName: e.target.value })} placeholder="اسم المادة" style={{ minWidth: 200 }} /></td>
                      <td><input className="input" type="number" min={0} step="any" value={it.requestedQty} onChange={(e) => updateRequestItem(it.id, { requestedQty: e.target.value })} placeholder="الكمية" style={{ width: 100 }} /></td>
                      <td><select className="select" value={it.unit} onChange={(e) => updateRequestItem(it.id, { unit: e.target.value })} style={{ minWidth: 90 }}><option value="METER">متر</option><option value="PIECE">قطعة</option><option value="ROLL">لفة</option></select></td>
                      <td><input className="input" value={it.notes} onChange={(e) => updateRequestItem(it.id, { notes: e.target.value })} placeholder="ملاحظات" /></td>
                      <td>{requestForm.items.length > 1 && <button type="button" className="btn btn-soft" style={{ color: '#e57373', padding: '2px 8px' }} onClick={() => setRequestForm((p) => ({ ...p, items: p.items.filter((x) => x.id !== it.id) }))}>✕</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-soft" type="button" onClick={() => setRequestForm((p) => ({ ...p, items: [...p.items, makeItem()] }))}>+ إضافة بند</button>
                <div style={{ flex: 1 }} />
                <button className="btn btn-primary" type="submit" disabled={busy === 'create'}>{busy === 'create' ? 'جارٍ الإرسال...' : 'إرسال الطلب'}</button>
              </div>
            </form>
          </section>

          {/* requests table */}
          <section className="card section">
            <h2 style={{ marginTop: 0 }}>طلبات المواد ({requests.length})</h2>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead><tr><th>رقم الطلب</th><th>المشروع</th><th>الطالب</th><th>مجهز الطلب</th><th>الحالة</th><th>بنود</th><th>إجراءات</th></tr></thead>
                <tbody>
                  {requests.length ? requests.map((req) => (
                    <tr key={req._id}>
                      <td><button type="button" className="btn btn-soft" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => setDetailModal(req)}>{req.requestNo}</button></td>
                      <td>{req.project?.name || '-'}</td>
                      <td>{req.requestedFor?.fullName || req.requestedBy?.fullName || '-'}</td>
                      <td>{req.assignedPreparer?.fullName || <span style={{ color: 'var(--text-soft)' }}>غير معين</span>}</td>
                      <td><Badge status={req.status} /></td>
                      <td>{(req.items || []).length}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          <button className="btn btn-soft" style={{ fontSize: 11, padding: '3px 8px' }} type="button" onClick={() => sendWhatsapp(`/materials/requests/${req._id}/whatsapp-link`)}>واتساب</button>
                          {isMyPreparer(req) && ['NEW', 'UNDER_REVIEW'].includes(req.status) && <button className="btn btn-soft" style={{ fontSize: 11, padding: '3px 8px', color: '#81c784' }} type="button" disabled={!!busy} onClick={() => openReview(req)}>مراجعة</button>}
                          {isMyPreparer(req) && ['APPROVED', 'PREPARING'].includes(req.status) && <button className="btn btn-soft" style={{ fontSize: 11, padding: '3px 8px', color: '#ffb74d' }} type="button" disabled={!!busy} onClick={() => openPrepare(req)}>تجهيز</button>}
                          {isMyPreparer(req) && ['PREPARED', 'PREPARING'].includes(req.status) && <button className="btn btn-soft" style={{ fontSize: 11, padding: '3px 8px', color: '#64b5f6' }} type="button" disabled={!!busy} onClick={() => openDispatch(req)}>تسليم</button>}
                        </div>
                      </td>
                    </tr>
                  )) : <tr><td colSpan={7} style={{ color: 'var(--text-soft)', textAlign: 'center' }}>لا توجد طلبات حالياً</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* ══════ TAB: CUSTODIES & RECONCILIATION ══════ */}
      {activeTab === 'custodies' && (
        <>
          <section className="card section" style={{ marginBottom: 16 }}>
            <h2 style={{ marginTop: 0 }}>الذمم ({custodies.length})</h2>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead><tr><th>رقم الذمة</th><th>المستلم</th><th>المشروع</th><th>الحالة</th><th>البنود</th><th>إجراءات</th></tr></thead>
                <tbody>
                  {custodies.length ? custodies.map((cu) => (
                    <tr key={cu._id}>
                      <td>{cu.custodyNo}</td>
                      <td>{cu.holder?.fullName || '-'}</td>
                      <td>{cu.project?.name || '-'}</td>
                      <td><Badge status={cu.status} /></td>
                      <td>{(cu.items || []).length}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          <button className="btn btn-soft" style={{ fontSize: 11, padding: '3px 8px' }} type="button" onClick={() => sendWhatsapp(`/materials/custodies/${cu._id}/whatsapp-link`)}>واتساب</button>
                          {(() => { const pid = cu.request?.assignedPreparer; return (!pid && isGM) || pid === myId || isGM; })() && ['OPEN', 'PARTIALLY_RECONCILED'].includes(cu.status) && (
                            <button className="btn btn-soft" style={{ fontSize: 11, padding: '3px 8px', color: '#ffd54f' }} type="button" disabled={!!busy} onClick={() => openReconcile(cu)}>تصفية الذمة</button>
                          )}
                          {(isGM || (() => { const pid = cu.request?.assignedPreparer; return pid === myId; })()) && ['FULLY_RECONCILED'].includes(cu.status) && (
                            <button className="btn btn-soft" style={{ fontSize: 11, padding: '3px 8px', color: '#90a4ae' }} type="button" disabled={!!busy} onClick={async () => { setBusy('close'); await doAction(async () => { await api.patch(`/materials/custodies/${cu._id}/close`, {}); setInfo('تم إغلاق الذمة'); }); }}>إغلاق</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )) : <tr><td colSpan={6} style={{ color: 'var(--text-soft)', textAlign: 'center' }}>لا توجد ذمم</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card section">
            <h2 style={{ marginTop: 0 }}>التصفيات ({reconciliations.length})</h2>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead><tr><th>رقم التصفية</th><th>الذمة</th><th>الحالة</th><th>إجراءات</th></tr></thead>
                <tbody>
                  {reconciliations.length ? reconciliations.map((rc) => (
                    <tr key={rc._id}>
                      <td>{rc.reconcileNo}</td>
                      <td>{rc.custody?.custodyNo || '-'}</td>
                      <td><Badge status={rc.status} /></td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          <button className="btn btn-soft" style={{ fontSize: 11, padding: '3px 8px' }} type="button" onClick={() => sendWhatsapp(`/materials/reconciliations/${rc._id}/whatsapp-link`)}>واتساب</button>
                          {(() => { const pid = rc.request?.assignedPreparer; return (!pid && isGM) || pid === myId || isGM; })() && rc.status === 'SUBMITTED' && (
                            <button className="btn btn-soft" style={{ fontSize: 11, padding: '3px 8px', color: '#81c784' }} type="button" disabled={!!busy} onClick={async () => { setBusy('approve-recon'); await doAction(async () => { await api.patch(`/materials/reconciliations/${rc._id}/review`, { action: 'APPROVE', points: 100 }); setInfo('تم اعتماد التصفية'); }); }}>اعتماد التصفية</button>
                          )}
                          {(() => { const pid = rc.request?.assignedPreparer; return (!pid && isGM) || pid === myId || isGM; })() && rc.status === 'SUBMITTED' && (
                            <button className="btn btn-soft" style={{ fontSize: 11, padding: '3px 8px', color: '#e57373' }} type="button" disabled={!!busy} onClick={async () => { setBusy('reject-recon'); await doAction(async () => { await api.patch(`/materials/reconciliations/${rc._id}/review`, { action: 'REJECT', rejectReason: 'مطلوب مراجعة البيانات' }); setInfo('تم رفض التصفية'); }); }}>رفض التصفية</button>
                          )}
                          {(() => { const pid = rc.request?.assignedPreparer; return (!pid && isGM) || pid === myId || isGM; })() && rc.status === 'APPROVED' && (rc.items || []).some((x) => toNum(x.toReturnQty) > toNum(x.returnedQtyConfirmed || 0)) && (
                            <button className="btn btn-soft" style={{ fontSize: 11, padding: '3px 8px', color: '#4fc3f7' }} type="button" disabled={!!busy} onClick={() => openReturn(rc)}>استلام راجع</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )) : <tr><td colSpan={4} style={{ color: 'var(--text-soft)', textAlign: 'center' }}>لا توجد تصفيات</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* ══════ TAB: REPORTS ══════ */}
      {activeTab === 'reports' && canReports && (
        <section className="card section">
          <h2 style={{ marginTop: 0 }}>تقارير المواد</h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <button className="btn btn-primary" type="button" onClick={async () => { try { const blob = await api.get('/materials/reports/excel'); downloadBlob(blob, 'materials-report.xlsx'); } catch { setError('فشل تصدير Excel'); } }}>تصدير Excel</button>
            <button className="btn btn-soft" type="button" onClick={async () => { try { const blob = await api.get('/materials/reports/pdf'); downloadBlob(blob, 'materials-report.pdf'); } catch { setError('فشل تصدير PDF'); } }}>تصدير PDF</button>
            <button className="btn btn-soft" type="button" onClick={() => sendWhatsapp('/materials/reports/whatsapp-link')}>واتساب</button>
          </div>
          {summary?.totals && (
            <div className="grid-3">
              <article className="card section"><p style={{ marginTop: 0, color: 'var(--text-soft)' }}>إجمالي الطلبات</p><h2>{summary.totals.requests || 0}</h2></article>
              <article className="card section"><p style={{ marginTop: 0, color: 'var(--text-soft)' }}>إجمالي التسليمات</p><h2>{summary.totals.dispatches || 0}</h2></article>
              <article className="card section"><p style={{ marginTop: 0, color: 'var(--text-soft)' }}>ذمم مفتوحة</p><h2>{summary.totals.openCustodies || 0}</h2></article>
            </div>
          )}
        </section>
      )}

      {/* ═══════════ MODALS ═══════════ */}

      {/* Review Modal */}
      <Modal open={!!reviewModal} title="مراجعة واعتماد الطلب" onClose={() => setReviewModal(null)}>
        {reviewModal && (
          <>
            <p>طلب رقم: <strong>{reviewModal.request.requestNo}</strong> — {reviewModal.request.project?.name}</p>
            <table className="table" style={{ marginBottom: 12 }}>
              <thead><tr><th>المادة</th><th>الكمية المطلوبة</th><th>الوحدة</th></tr></thead>
              <tbody>
                {(reviewModal.request.items || []).map((it, i) => (
                  <tr key={i}><td>{it.materialName}</td><td>{it.requestedQty}</td><td>{unitLabels[it.unitSnapshot] || it.unitSnapshot}</td></tr>
                ))}
              </tbody>
            </table>
            <label>القرار<select className="select" value={reviewModal.action} onChange={(e) => setReviewModal((p) => ({ ...p, action: e.target.value }))}>
              <option value="APPROVE_FULL">اعتماد كامل</option>
              <option value="REJECT">رفض</option>
            </select></label>
            {reviewModal.action === 'REJECT' && <label style={{ display: 'block', marginTop: 8 }}>سبب الرفض<input className="input" value={reviewModal.rejectReason} onChange={(e) => setReviewModal((p) => ({ ...p, rejectReason: e.target.value }))} style={{ width: '100%' }} /></label>}
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button className="btn btn-soft" type="button" onClick={() => setReviewModal(null)}>إلغاء</button>
              <button className="btn btn-primary" type="button" disabled={busy === 'review'} onClick={submitReview} style={{ background: reviewModal.action === 'REJECT' ? '#e57373' : undefined }}>{busy === 'review' ? 'جارٍ...' : reviewModal.action === 'REJECT' ? 'رفض الطلب' : 'اعتماد الطلب'}</button>
            </div>
          </>
        )}
      </Modal>

      {/* Prepare Modal */}
      <Modal open={!!prepareModal} title="تجهيز المواد" onClose={() => setPrepareModal(null)}>
        {prepareModal && (
          <>
            <p>طلب رقم: <strong>{prepareModal.request.requestNo}</strong></p>
            <label>المخزن<select className="select" value={prepareModal.warehouseId} onChange={(e) => setPrepareModal((p) => ({ ...p, warehouseId: e.target.value }))}><option value="">افتراضي</option>{warehouses.map((w) => <option key={w._id} value={w._id}>{w.name}</option>)}</select></label>
            <table className="table" style={{ margin: '12px 0' }}>
              <thead><tr><th>المادة</th><th>الكمية</th></tr></thead>
              <tbody>
                {prepareModal.items.map((it, i) => (
                  <tr key={i}>
                    <td>{it.materialName}</td>
                    <td><input className="input" type="number" min={0} step="any" value={it.preparedQty} onChange={(e) => setPrepareModal((p) => ({ ...p, items: p.items.map((x, j) => j === i ? { ...x, preparedQty: e.target.value } : x) }))} style={{ width: 100 }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-soft" type="button" onClick={() => setPrepareModal(null)}>إلغاء</button>
              <button className="btn btn-primary" type="button" disabled={busy === 'prepare'} onClick={submitPrepare}>{busy === 'prepare' ? 'جارٍ...' : 'تأكيد التجهيز'}</button>
            </div>
          </>
        )}
      </Modal>

      {/* Dispatch Modal */}
      <Modal open={!!dispatchModal} title="تسليم المواد للمستلم" onClose={() => setDispatchModal(null)}>
        {dispatchModal && (
          <>
            <p>طلب رقم: <strong>{dispatchModal.request.requestNo}</strong> — المستلم: <strong>{dispatchModal.request.requestedFor?.fullName || dispatchModal.request.requestedBy?.fullName || '-'}</strong></p>
            <p style={{ color: 'var(--text-soft)', fontSize: 12 }}>بعد التسليم ستسجّل المواد كذمة على المستلم</p>
            <table className="table" style={{ margin: '12px 0' }}>
              <thead><tr><th>المادة</th><th>الكمية</th></tr></thead>
              <tbody>
                {dispatchModal.items.map((it, i) => (
                  <tr key={i}>
                    <td>{it.materialName}</td>
                    <td><input className="input" type="number" min={0} step="any" value={it.deliveredQty} onChange={(e) => setDispatchModal((p) => ({ ...p, items: p.items.map((x, j) => j === i ? { ...x, deliveredQty: e.target.value } : x) }))} style={{ width: 100 }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-soft" type="button" onClick={() => setDispatchModal(null)}>إلغاء</button>
              <button className="btn btn-primary" type="button" disabled={busy === 'dispatch'} onClick={submitDispatch}>{busy === 'dispatch' ? 'جارٍ...' : 'تأكيد التسليم وتسجيل الذمة'}</button>
            </div>
          </>
        )}
      </Modal>

      {/* Reconcile Modal */}
      <Modal open={!!reconcileModal} title="تصفية ذمة المواد" onClose={() => setReconcileModal(null)}>
        {reconcileModal && (
          <>
            <p>ذمة رقم: <strong>{reconcileModal.custody.custodyNo}</strong> — {reconcileModal.custody.holder?.fullName}</p>
            <p style={{ color: 'var(--text-soft)', fontSize: 12 }}>حدد الكميات المصروفة على المشروع والكميات المتبقية للإرجاع</p>
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ margin: '12px 0' }}>
                <thead><tr><th>المادة</th><th>المستلم</th><th>المصروف</th><th>تالف</th><th>مفقود</th><th>للإرجاع</th></tr></thead>
                <tbody>
                  {reconcileModal.items.map((it, i) => {
                    const consumed = toNum(it.consumedQty);
                    const damaged = toNum(it.damagedQty);
                    const lost = toNum(it.lostQty);
                    const remaining = Math.max(0, it.receivedQty - consumed - damaged - lost);
                    return (
                      <tr key={i}>
                        <td>{it.materialName}</td>
                        <td style={{ color: 'var(--text-soft)' }}>{it.receivedQty}</td>
                        <td><input className="input" type="number" min={0} step="any" value={it.consumedQty} onChange={(e) => setReconcileModal((p) => ({ ...p, items: p.items.map((x, j) => j === i ? { ...x, consumedQty: e.target.value, remainingQty: Math.max(0, x.receivedQty - toNum(e.target.value) - toNum(x.damagedQty) - toNum(x.lostQty)), toReturnQty: Math.max(0, x.receivedQty - toNum(e.target.value) - toNum(x.damagedQty) - toNum(x.lostQty)) } : x) }))} style={{ width: 70 }} /></td>
                        <td><input className="input" type="number" min={0} step="any" value={it.damagedQty} onChange={(e) => setReconcileModal((p) => ({ ...p, items: p.items.map((x, j) => j === i ? { ...x, damagedQty: e.target.value, remainingQty: Math.max(0, x.receivedQty - toNum(x.consumedQty) - toNum(e.target.value) - toNum(x.lostQty)), toReturnQty: Math.max(0, x.receivedQty - toNum(x.consumedQty) - toNum(e.target.value) - toNum(x.lostQty)) } : x) }))} style={{ width: 70 }} /></td>
                        <td><input className="input" type="number" min={0} step="any" value={it.lostQty} onChange={(e) => setReconcileModal((p) => ({ ...p, items: p.items.map((x, j) => j === i ? { ...x, lostQty: e.target.value, remainingQty: Math.max(0, x.receivedQty - toNum(x.consumedQty) - toNum(x.damagedQty) - toNum(e.target.value)), toReturnQty: Math.max(0, x.receivedQty - toNum(x.consumedQty) - toNum(x.damagedQty) - toNum(e.target.value)) } : x) }))} style={{ width: 70 }} /></td>
                        <td style={{ color: '#4fc3f7', fontWeight: 600 }}>{remaining}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-soft" type="button" onClick={() => setReconcileModal(null)}>إلغاء</button>
              <button className="btn btn-primary" type="button" disabled={busy === 'reconcile'} onClick={submitReconcile}>{busy === 'reconcile' ? 'جارٍ...' : 'إرسال التصفية للاعتماد'}</button>
            </div>
          </>
        )}
      </Modal>

      {/* Return Modal */}
      <Modal open={!!returnModal} title="استلام المواد الراجعة للمخزن" onClose={() => setReturnModal(null)}>
        {returnModal && (
          <>
            <p style={{ color: 'var(--text-soft)', fontSize: 12 }}>المواد الراجعة سترجع لرصيد المخزن مباشرة دون تسجيلها كذمة</p>
            <label>المخزن الوجهة<select className="select" value={returnModal.warehouseId} onChange={(e) => setReturnModal((p) => ({ ...p, warehouseId: e.target.value }))}><option value="">افتراضي</option>{warehouses.map((w) => <option key={w._id} value={w._id}>{w.name}</option>)}</select></label>
            <table className="table" style={{ margin: '12px 0' }}>
              <thead><tr><th>المادة</th><th>الكمية</th><th>الحالة</th></tr></thead>
              <tbody>
                {returnModal.items.map((it, i) => (
                  <tr key={i}>
                    <td>{it.materialName}</td>
                    <td><input className="input" type="number" min={0} step="any" value={it.returnedQty} onChange={(e) => setReturnModal((p) => ({ ...p, items: p.items.map((x, j) => j === i ? { ...x, returnedQty: e.target.value } : x) }))} style={{ width: 100 }} /></td>
                    <td><select className="select" value={it.condition} onChange={(e) => setReturnModal((p) => ({ ...p, items: p.items.map((x, j) => j === i ? { ...x, condition: e.target.value } : x) }))}><option value="NEW">جديد</option><option value="USED_PARTIAL">مستخدم جزئياً</option><option value="DAMAGED">تالف</option></select></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-soft" type="button" onClick={() => setReturnModal(null)}>إلغاء</button>
              <button className="btn btn-primary" type="button" disabled={busy === 'return'} onClick={submitReturn}>{busy === 'return' ? 'جارٍ...' : 'تأكيد استلام الراجع'}</button>
            </div>
          </>
        )}
      </Modal>

      {/* Detail Modal */}
      <Modal open={!!detailModal} title={`تفاصيل الطلب ${detailModal?.requestNo || ''}`} onClose={() => setDetailModal(null)}>
        {detailModal && (
          <>
            <div className="grid-3" style={{ gap: 8, marginBottom: 12 }}>
              <div><span style={{ color: 'var(--text-soft)' }}>المشروع:</span> {detailModal.project?.name || '-'}</div>
              <div><span style={{ color: 'var(--text-soft)' }}>الطالب:</span> {detailModal.requestedBy?.fullName || '-'}</div>
              <div><span style={{ color: 'var(--text-soft)' }}>المستلم:</span> {detailModal.requestedFor?.fullName || detailModal.requestedBy?.fullName || '-'}</div>
              <div><span style={{ color: 'var(--text-soft)' }}>المجهز:</span> {detailModal.assignedPreparer?.fullName || 'غير معين'}</div>
              <div><span style={{ color: 'var(--text-soft)' }}>الحالة:</span> <Badge status={detailModal.status} /></div>
              <div><span style={{ color: 'var(--text-soft)' }}>الأولوية:</span> {detailModal.priority || '-'}</div>
            </div>
            <table className="table">
              <thead><tr><th>المادة</th><th>المطلوب</th><th>المعتمد</th><th>المجهز</th><th>المسلم</th><th>الوحدة</th></tr></thead>
              <tbody>
                {(detailModal.items || []).map((it, i) => (
                  <tr key={i}>
                    <td>{it.materialName}</td>
                    <td>{it.requestedQty}</td>
                    <td>{it.approvedQty}</td>
                    <td>{it.preparedQty}</td>
                    <td>{it.deliveredQty}</td>
                    <td>{unitLabels[it.unitSnapshot] || it.unitSnapshot}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {detailModal.generalNotes && <p style={{ marginTop: 8, color: 'var(--text-soft)' }}>ملاحظات: {detailModal.generalNotes}</p>}
          </>
        )}
      </Modal>
    </>
  );
}
