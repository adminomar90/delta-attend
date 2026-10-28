'use client';
import { useState } from 'react';
const id = (value) => String(value?._id || value || '');
const q = (value) => Math.max(0, Number(value || 0));
const token = () => globalThis.crypto?.randomUUID?.() || `RETURN-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function InventorySettlementsPanel({ reconciliations, warehouses, actor, canManage, saving, onReview, onReceive }) {
  const [modal, setModal] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const pending = reconciliations.filter((record) => ['SUBMITTED', 'UNDER_REVIEW'].includes(record.status));
  const awaiting = reconciliations.filter((record) => record.status === 'APPROVED' && (record.pendingReturnBatch || record.items.some((line) => q(line.toReturnQty) > q(line.returnedQtyConfirmed) || q(line.damagedToReturnQty) > q(line.damagedReturnedConfirmed))));
  const open = (record) => {
    const batch = record.pendingReturnBatch;
    setError(''); setModal({ record, operationKey: batch?.id || token(), warehouseId: id(batch?.warehouse) || warehouses.find((warehouse) => warehouse.type !== 'DAMAGED')?._id || '', resume: !!batch,
      items: record.items.map((line) => ({ materialId: id(line.material), name: line.materialName || line.material?.name,
        goodMax: q(line.toReturnQty) - q(line.returnedQtyConfirmed), damagedMax: q(line.damagedToReturnQty) - q(line.damagedReturnedConfirmed),
        returnedQty: batch?.items.find((entry) => entry.material === id(line.material))?.good ?? Math.max(0, q(line.toReturnQty) - q(line.returnedQtyConfirmed)),
        damagedReturnedQty: batch?.items.find((entry) => entry.material === id(line.material))?.damaged ?? Math.max(0, q(line.damagedToReturnQty) - q(line.damagedReturnedConfirmed)),
      })) });
  };
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await onReceive(modal.record, { operationKey: modal.operationKey, warehouseId: modal.warehouseId, items: modal.items.map((line) => ({ materialId: line.materialId, returnedQty: Number(line.returnedQty), damagedReturnedQty: Number(line.damagedReturnedQty) })) }); setModal(null); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const card = (record, returning) => <article className="daily-plan-card" key={record._id}>
    <div className="maintenance-card-header"><strong dir="ltr">{record.reconcileNo}</strong><span>{returning ? 'معتمدة - بانتظار الاستلام الفعلي' : 'بانتظار مراجعة أمين المخزن'}</span></div>
    <h3>{record.submittedBy?.fullName || record.custody?.holder?.fullName || 'الفني'}</h3><p>الذمة: <bdi>{record.custody?.custodyNo || '-'}</bdi> · {record.project?.name || 'بدون مشروع'}</p>
    <div style={{ overflowX: 'auto' }}><table className="table"><thead><tr><th>المادة</th><th>المستهلك</th><th>المتبقي</th><th>فائض للاستلام</th><th>تالف للاستلام</th></tr></thead><tbody>{record.items.map((line) => <tr key={line._id}><td>{line.materialName}</td><td>{line.consumedQty}</td><td>{line.remainingQty}</td><td>{Math.max(0, q(line.toReturnQty) - q(line.returnedQtyConfirmed))}</td><td>{Math.max(0, q(line.damagedToReturnQty) - q(line.damagedReturnedConfirmed))}</td></tr>)}</tbody></table></div>
    {record.notes ? <p>{record.notes}</p> : null}
    {canManage ? <div className="form-actions">{returning ? <button className="btn btn-primary" disabled={saving} onClick={() => open(record)}>{record.pendingReturnBatch ? 'استئناف تسجيل المرتجعات' : 'استلام الفائض والتالف'}</button> : <>
      <button className="btn btn-primary" disabled={saving || id(record.submittedBy) === id(actor?.id || actor?._id)} onClick={async () => { try { await onReview(record, 'APPROVE'); } catch (err) { setError(err.message); } }}>اعتماد التصفية</button>
      <button className="btn btn-soft" disabled={saving || id(record.submittedBy) === id(actor?.id || actor?._id)} onClick={async () => { try { await onReview(record, 'REJECT'); } catch (err) { setError(err.message); } }}>رفض مع ملاحظات</button>
    </>}</div> : <p style={{ color: 'var(--text-soft)' }}>تتم مراجعة التصفية واستلام المرتجعات بواسطة أمين المخزن.</p>}
  </article>;
  return <section className="card section" style={{ marginTop: 16 }} dir="rtl"><h2>التصفية واستلام الفائض والتالف</h2><p>اعتماد الكميات لا يعيد الرصيد وحده. يستلم أمين المخزن الفائض الصالح والتالف فعلياً لإكمال التصفية.</p>
    {error && !modal ? <p role="alert" style={{ color: '#fca5a5' }}>{error}</p> : null}
    <h3>تصفية بانتظار المراجعة ({pending.length})</h3><div className="daily-plan-card-grid">{pending.map((record) => card(record, false))}</div>{!pending.length ? <p>لا توجد تصفيات بانتظار الاعتماد.</p> : null}
    <h3>مرتجعات معتمدة بانتظار الاستلام ({awaiting.length})</h3><div className="daily-plan-card-grid">{awaiting.map((record) => card(record, true))}</div>{!awaiting.length ? <p>لا توجد مرتجعات معلقة.</p> : null}
    {modal ? <div className="modal-backdrop" onClick={() => { if (!busy) setModal(null); }}><form className="modal-panel warehouse-cart-modal" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
      <div className="modal-header"><h3>استلام الفائض والتالف <bdi>{modal.record.reconcileNo}</bdi></h3><button type="button" className="modal-close" disabled={busy} onClick={() => setModal(null)}>&times;</button></div>
      <p>الفائض الصالح يعود للمخزن المختار. التالف يسجل تلقائياً في «مخزن التالف»، ولا يدخل الرصيد الصالح للصرف.</p>
      {modal.resume ? <p>سيتم استكمال العملية المحفوظة دون إعادة إضافة أي كمية سبق تسجيلها.</p> : null}
      <label>مخزن الفائض الصالح<select className="select" value={modal.warehouseId} disabled={modal.resume || busy} required={modal.items.some((line) => Number(line.returnedQty) > 0)} onChange={(event) => setModal((prev) => ({ ...prev, warehouseId: event.target.value }))}><option value="">اختر المخزن</option>{warehouses.filter((warehouse) => warehouse.type !== 'DAMAGED').map((warehouse) => <option key={warehouse._id} value={warehouse._id}>{warehouse.name}</option>)}</select></label>
      <div style={{ overflowX: 'auto' }}><table className="table"><thead><tr><th>المادة</th><th>الفائض الصالح المستلم</th><th>التالف المستلم</th></tr></thead><tbody>{modal.items.map((line, index) => <tr key={line.materialId}><td>{line.name}</td>{['returnedQty', 'damagedReturnedQty'].map((field) => <td key={field}><input type="number" className="input" min="0" step="any" max={modal.resume ? undefined : field === 'returnedQty' ? line.goodMax : line.damagedMax} value={line[field]} readOnly={modal.resume} onChange={(event) => setModal((prev) => ({ ...prev, items: prev.items.map((item, i) => index === i ? { ...item, [field]: event.target.value } : item) }))} /></td>)}</tr>)}</tbody></table></div>
      {error ? <p role="alert" style={{ color: '#fca5a5' }}>{error}</p> : null}
      <div className="form-actions"><button type="button" className="btn btn-soft" disabled={busy} onClick={() => setModal(null)}>إلغاء</button><button className="btn btn-primary" disabled={busy || saving}>{busy ? 'جار التسجيل...' : 'تأكيد الاستلام وتحديث الأرصدة'}</button></div>
    </form></div> : null}
  </section>;
}
