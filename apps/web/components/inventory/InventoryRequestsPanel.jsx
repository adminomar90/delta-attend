'use client';
import { useState } from 'react';

const id = (value) => String(value?._id || value?.id || value || '');
const qty = (value) => new Intl.NumberFormat('ar-IQ', { maximumFractionDigits: 3 }).format(Number(value || 0));
const states = { PENDING_MANAGER_APPROVAL: 'بانتظار اعتماد أمين المخزن', NEW: 'طلب جديد', UNDER_REVIEW: 'قيد المراجعة', APPROVED: 'معتمد للتجهيز', PENDING_SUPPLIER_APPROVAL: 'معتمد للتجهيز', PREPARING: 'قيد التجهيز', IN_PROGRESS: 'بانتظار تجهيز بقية الكمية', PENDING_RECEIPT: 'بانتظار قبول الفني', PREPARED: 'بانتظار قبول الفني', RECEIVED: 'استلام جزئي', PENDING_SETTLEMENT: 'على ذمة الفني', PENDING_RECONCILIATION: 'تصفية / مرتجعات معلقة', RECONCILED: 'مصفى', CLOSED: 'مغلق', REJECTED: 'مرفوض' };

export default function InventoryRequestsPanel({ requests, warehouses, stockByMaterial, actor, saving, canManage, onReview, onPrepare, onConfirm, onCancel }) {
  const [modal, setModal] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('active');
  const [busy, setBusy] = useState(false);
  const own = (request) => id(request.requestedFor || request.requestedBy) === id(actor?.id || actor?._id);
  const open = (request, mode) => {
    const batch = request.pendingReceipt;
    const items = request.items.map((line) => ({ materialId: id(line.material), name: line.materialName || line.material?.name, requested: Number(line.requestedQty), approved: Number(line.approvedQty), prepared: Number(line.preparedQty), delivered: Number(line.deliveredQty),
      quantity: mode === 'review' ? Number(line.requestedQty) : mode === 'receipt' ? Number(batch?.items.find((entry) => id(entry.material) === id(line.material))?.quantity ?? (line.preparedQty - line.deliveredQty)) : Math.max(0, line.approvedQty - line.preparedQty) }));
    setError(''); setModal({ request, mode, warehouseId: id(request.warehouse) || warehouses[0]?._id || '', items, notes: '' });
  };
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (modal.mode === 'review') await onReview(modal.request, 'APPROVE_PARTIAL', { items: modal.items.map((line) => ({ materialId: line.materialId, approvedQty: Number(line.quantity) })), notes: modal.notes });
      else if (modal.mode === 'prepare') await onPrepare(modal.request, { warehouseId: modal.warehouseId, notes: modal.notes, items: modal.items.filter((line) => line.quantity > 0).map((line) => ({ materialId: line.materialId, preparedQty: Number(line.quantity) })) });
      else await onConfirm(modal.request, 'ACCEPT', modal.notes);
      setModal(null);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const visible = requests.filter((request) => filter === 'all' || (filter === 'mine' ? own(request) : !['CLOSED', 'RECONCILED', 'REJECTED', 'CANCELLED'].includes(request.status)));
  return <section className="card section" style={{ marginTop: 16 }} dir="rtl">
    <div className="section-header"><div><h2>دورة طلب المواد واستلام الفني</h2><p style={{ color: 'var(--text-soft)' }}>الحجز عند التجهيز، والخصم وإنشاء الذمة عند قبول الفني حصراً.</p></div><select className="select" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="active">الطلبات النشطة</option><option value="mine">طلباتي للاستلام</option><option value="all">كل الطلبات والسجل</option></select></div>
    <div className="workflow-steps">{['الفني يطلب', 'أمين المخزن يعتمد الكميات', 'التجهيز وحجز الرصيد', 'الفني يقبل الاستلام', 'صرف وتسجيل الذمة', 'تصفية وإرجاع الفائض والتالف'].map((step, i) => <span key={step}><b>{i + 1}</b>{step}</span>)}</div>
    {error && !modal ? <p role="alert" style={{ color: '#fca5a5' }}>{error}</p> : null}
    <div className="daily-plan-card-grid">{visible.map((request) => <article className="daily-plan-card" key={request._id}>
      <div className="maintenance-card-header"><strong dir="ltr">{request.requestNo}</strong><span className="workflow-state">{request.status === 'CANCELLED' ? 'ألغي غير المستلم' : states[request.status] || request.status}</span></div>
      <h3>{request.requestedFor?.fullName || request.requestedBy?.fullName || 'الفني المستلم'}</h3><p>{request.project?.name || request.manualProjectName || request.clientName || 'طلب مواد'}</p><small>{request.warehouse?.name || 'مخزن يحدد عند التجهيز'}</small>
      <div className="request-lines">{request.items.map((line) => <div key={line._id || id(line.material)}><strong>{line.materialName || line.material?.name}</strong><small>المطلوب {qty(line.requestedQty)} · المعتمد {qty(line.approvedQty)} · المجهز {qty(line.preparedQty)} · المستلم {qty(line.deliveredQty)}</small></div>)}</div>
      <div className="form-actions" style={{ flexWrap: 'wrap', gap: 8 }}>
        {canManage && !own(request) && ['PENDING_MANAGER_APPROVAL', 'NEW', 'UNDER_REVIEW'].includes(request.status) ? <><button className="btn btn-primary btn-sm" onClick={() => open(request, 'review')} disabled={saving}>اعتماد وتحديد الكميات</button><button className="btn btn-soft btn-sm" disabled={saving} onClick={async () => { try { await onReview(request, 'REJECT'); } catch (err) { setError(err.message); } }}>رفض الطلب</button></> : null}
        {canManage && !own(request) && ['APPROVED', 'PENDING_SUPPLIER_APPROVAL', 'PREPARING', 'IN_PROGRESS', 'RECEIVED'].includes(request.status) ? <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => open(request, 'prepare')}>تجهيز وحجز دفعة</button> : null}
        {own(request) && ['PENDING_RECEIPT', 'PREPARED'].includes(request.status) ? <><button className="btn btn-primary btn-sm" disabled={saving} onClick={() => open(request, 'receipt')}>مراجعة وقبول الاستلام</button><button className="btn btn-soft btn-sm" disabled={saving} onClick={async () => { const reason = window.prompt('سبب رفض الدفعة المجهزة'); if (!reason?.trim()) return; try { await onConfirm(request, 'REJECT', reason); } catch (err) { setError(err.message); } }}>رفض الاستلام</button></> : null}
        <a className="btn btn-soft btn-sm" href={`/materials?requestId=${request._id}`}>تفاصيل الطلب</a>
        {(canManage || own(request)) && !['CLOSED', 'RECONCILED', 'CANCELLED', 'REJECTED'].includes(request.status) ? <button type="button" className="btn btn-soft btn-sm" disabled={saving} onClick={async () => { const reason = window.prompt('سبب إلغاء الكميات غير المستلمة (المواد المستلمة تبقى على الذمة)'); if (!reason?.trim()) return; try { await onCancel(request, reason); } catch (err) { setError(err.message); } }}>إلغاء غير المستلم</button> : null}
      </div>
      {request.pendingReceipt?.state === 'ISSUING' ? <p style={{ color: 'var(--accent)' }}>بدأ تسجيل هذه الدفعة. أعد قبول الاستلام لاستكمال العملية دون تكرار الخصم.</p> : null}
    </article>)}</div>
    {!visible.length ? <p>لا توجد طلبات ضمن الاختيار الحالي.</p> : null}
    {modal ? <div className="modal-backdrop" onClick={() => { if (!busy) setModal(null); }}><form className="modal-panel warehouse-cart-modal" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
      <div className="modal-header"><h3>{modal.mode === 'review' ? 'اعتماد كميات الطلب' : modal.mode === 'prepare' ? 'تجهيز وحجز دفعة' : 'إقرار استلام المواد'} <bdi>{modal.request.requestNo}</bdi></h3><button type="button" className="modal-close" disabled={busy} onClick={() => setModal(null)}>&times;</button></div>
      {modal.mode === 'receipt' ? <p>بتأكيد الاستلام تقر باستلام الكميات الموضحة فعلياً. سيُخصم رصيدها من المخزن وتُسجل على ذمتك.</p> : null}
      {modal.mode === 'prepare' ? <label>المخزن الصالح *<select className="select" required value={modal.warehouseId} onChange={(event) => setModal((prev) => ({ ...prev, warehouseId: event.target.value }))}><option value="">اختر المخزن</option>{warehouses.filter((warehouse) => warehouse.type !== 'DAMAGED').map((warehouse) => <option value={warehouse._id} key={warehouse._id}>{warehouse.name}</option>)}</select></label> : null}
      <div style={{ overflowX: 'auto' }}><table className="table"><thead><tr><th>المادة</th><th>المطلوب</th><th>المعتمد</th><th>{modal.mode === 'receipt' ? 'كمية الدفعة المستلمة' : modal.mode === 'review' ? 'الكمية المعتمدة' : 'كمية التجهيز'}</th></tr></thead><tbody>{modal.items.map((line, index) => <tr key={line.materialId}><td>{line.name}</td><td>{qty(line.requested)}</td><td>{qty(line.approved)}</td><td><input className="input" type="number" step="any" min="0" max={modal.mode === 'review' ? line.requested : modal.mode === 'prepare' ? Math.max(0, line.approved - line.prepared) : undefined} readOnly={modal.mode === 'receipt'} value={line.quantity} onChange={(event) => setModal((prev) => ({ ...prev, items: prev.items.map((item, i) => i === index ? { ...item, quantity: event.target.value } : item) }))} /></td></tr>)}</tbody></table></div>
      <label>ملاحظات<textarea className="textarea" value={modal.notes} onChange={(event) => setModal((prev) => ({ ...prev, notes: event.target.value }))} /></label>
      {error ? <p role="alert" style={{ color: '#fca5a5' }}>{error}</p> : null}
      <div className="form-actions"><button type="button" className="btn btn-soft" disabled={busy} onClick={() => setModal(null)}>إلغاء</button><button className="btn btn-primary" disabled={busy || saving}>{busy ? 'جار التسجيل...' : modal.mode === 'receipt' ? 'أؤكد الاستلام وتسجيل الذمة' : modal.mode === 'review' ? 'اعتماد الكميات' : 'حجز وتجهيز الدفعة'}</button></div>
    </form></div> : null}
    <style jsx>{`.workflow-steps{display:grid;grid-template-columns:repeat(6,minmax(100px,1fr));gap:8px;margin:16px 0}.workflow-steps span{display:grid;gap:5px;text-align:center;padding:12px 8px;border:1px solid var(--border);border-radius:10px;background:var(--surface-soft);font-size:13px}.workflow-steps b{color:var(--accent)}.workflow-state{font-size:12px;color:var(--accent)}.request-lines{display:grid;gap:8px;margin:14px 0}.request-lines div{display:grid;gap:5px;border-bottom:1px solid var(--border);padding-bottom:8px}.request-lines small{color:var(--text-soft)}@media(max-width:1000px){.workflow-steps{grid-template-columns:repeat(3,1fr)}}@media(max-width:600px){.workflow-steps{grid-template-columns:repeat(2,1fr)}}`}</style>
  </section>;
}
