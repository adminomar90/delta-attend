'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';

const units = { PIECE: 'قطعة', METER: 'متر', ROLL: 'لفة', KG: 'كغم', TON: 'طن', LITER: 'لتر', SQM: 'م²', BOX: 'صندوق', SET: 'طقم', BAG: 'كيس', PAIR: 'زوج', CARTON: 'كارتون' };
const normalize = (value) => String(value || '').toLowerCase().normalize('NFKD').replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي');

export default function UnlinkedProductsDeleteModal({ onClose, onComplete }) {
  const [products, setProducts] = useState([]), [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [search, setSearch] = useState(''), [adminPassword, setAdminPassword] = useState('');
  const allCheckbox = useRef(null);
  const load = async () => {
    setLoading(true); setError(''); setSelected(new Set()); setAdminPassword('');
    try { const result = await api.get('/materials/catalog/unlinked-preview'); setProducts(result.products || []); }
    catch (err) { setError(err.message || 'تعذر تحميل قائمة المنتجات'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { if (allCheckbox.current) allCheckbox.current.indeterminate = selected.size > 0 && selected.size < products.length; }, [selected, products]);
  useEffect(() => { setAdminPassword(''); }, [selected]);
  useEffect(() => {
    const handle = (event) => { if (event.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', handle); return () => document.removeEventListener('keydown', handle);
  }, [busy, onClose]);
  const visible = useMemo(() => {
    const words = normalize(search).split(/\s+/).filter(Boolean);
    return products.filter((product) => { const text = normalize([product.name, product.code, product.barcode, product.category, product.brand, product.model, product.description].join(' ')); return words.every((word) => text.includes(word)); });
  }, [products, search]);
  const toggle = (id) => setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const submit = async (event) => {
    event.preventDefault(); if (!selected.size || !adminPassword || busy) return;
    setBusy(true); setError('');
    try {
      const result = await api.delete('/materials/catalog/unlinked', { materialIds: [...selected], expectedCount: selected.size, adminPassword });
      setAdminPassword('');
      await onComplete(result);
    } catch (err) { setError(err.message || 'تعذر حذف المنتجات المحددة'); }
    finally { setAdminPassword(''); setBusy(false); }
  };
  return <div className="modal-backdrop" onClick={() => { if (!busy) onClose(); }}>
    <form className="modal-panel warehouse-cart-modal" role="dialog" aria-modal="true" aria-labelledby="delete-products-title" dir="rtl" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
      <div className="modal-header"><div><h3 id="delete-products-title">حذف المنتجات المتبقية بلا مخزن</h3><p>اختر المنتجات المطلوب حذفها نهائياً. القائمة تشمل المنتجات المؤرشفة.</p></div><button type="button" className="modal-close" aria-label="إغلاق" disabled={busy} onClick={onClose}>&times;</button></div>
      <p style={{ color: 'var(--text-soft)' }}>تظهر المنتجات غير المرتبطة بأي مخزن موجود فقط. حذف المحدد يشمل أرصدته وحركاته المتبقية.</p>
      <div className="delete-products-controls">
        <label>البحث في التفاصيل<input className="input" autoFocus placeholder="اسم المنتج، الكود، الباركود، التصنيف، الماركة أو الموديل" value={search} disabled={busy} onChange={(event) => setSearch(event.target.value)} /></label>
        <button type="button" className="btn btn-soft" onClick={load} disabled={busy || loading}>تحديث القائمة</button>
      </div>
      <div className="delete-products-selection">
        <label><input ref={allCheckbox} type="checkbox" disabled={loading || busy || !products.length} checked={products.length > 0 && selected.size === products.length} onChange={(event) => setSelected(event.target.checked ? new Set(products.map((product) => product._id)) : new Set())} /> تحديد الكل ({products.length})</label>
        <strong>المحدد: {selected.size} من {products.length}</strong>
        <span>نتائج البحث: {visible.length}</span>
        <button type="button" className="btn btn-soft btn-sm" disabled={busy || !selected.size} onClick={() => setSelected(new Set())}>إلغاء التحديد</button>
      </div>
      {loading ? <p role="status">جار تحميل المنتجات...</p> : <div className="delete-products-list"><table className="table"><thead><tr><th>تحديد</th><th>المنتج والتفاصيل</th><th>الكود والباركود</th><th>التصنيف</th><th>الماركة والموديل</th><th>الوحدة</th><th>الحالة</th></tr></thead><tbody>{visible.map((product) => <tr key={product._id} className={selected.has(product._id) ? 'is-selected' : ''}>
        <td><input type="checkbox" aria-label={`تحديد ${product.name}`} checked={selected.has(product._id)} disabled={busy} onChange={() => toggle(product._id)} /></td>
        <td><strong>{product.name}</strong>{product.description ? <small>{product.description}</small> : null}{product.storageLocation || product.shelfSection ? <small>الموقع: {[product.storageLocation, product.shelfSection].filter(Boolean).join(' / ')}</small> : null}</td>
        <td><bdi>{product.code || '-'}</bdi><small><bdi>{product.barcode || 'بدون باركود'}</bdi></small></td><td>{product.category || '-'}</td>
        <td>{product.brand || '-'}<small>{product.model || '-'}</small></td><td>{units[product.unit] || product.unit || '-'}</td>
        <td>{product.active === false || product.productStatus === 'ARCHIVED' ? 'مؤرشف' : 'فعال'}</td>
      </tr>)}</tbody></table>{!visible.length ? <p>{products.length ? 'لا توجد نتائج مطابقة للبحث.' : 'لا توجد منتجات متبقية بلا مخزن.'}</p> : null}</div>}
      {search && selected.size ? <p>تحديد الكل يشمل القائمة كاملة، وتبقى المنتجات المحددة محفوظة عند البحث.</p> : null}
      {selected.size ? <div className="delete-products-confirm"><p>سيتم حذف <strong>{selected.size}</strong> منتجاً نهائياً. المنتجات غير المحددة تبقى محفوظة.</p><label>كلمة مرور الأدمن الرئيسي لتأكيد الحذف<input className="input" type="password" name="primaryAdminPassword" autoComplete="current-password" dir="ltr" required disabled={busy} value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} placeholder="أدخل كلمة مرور الأدمن الرئيسي" /></label></div> : null}
      {error ? <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p> : null}
      <div className="form-actions" style={{ justifyContent: 'space-between', marginTop: 16 }}><button type="button" className="btn btn-soft" disabled={busy} onClick={onClose}>إغلاق</button><button className="btn btn-danger" disabled={loading || busy || !selected.size || !adminPassword}>{busy ? 'جار التحقق والحذف...' : `حذف المحدد نهائياً (${selected.size})`}</button></div>
      <style jsx>{`.delete-products-controls{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:end}.delete-products-controls label{display:grid;gap:6px}.delete-products-selection{display:flex;gap:18px;align-items:center;flex-wrap:wrap;margin:16px 0}.delete-products-selection label{display:flex;align-items:center;gap:8px}.delete-products-list{overflow:auto;max-height:45vh;border:1px solid var(--border);border-radius:10px}.delete-products-list table{margin:0;min-width:820px}.delete-products-list th{position:sticky;top:0;background:var(--surface);z-index:1}.delete-products-list td{vertical-align:top}.delete-products-list small{display:block;color:var(--text-soft);margin-top:5px;max-width:330px;white-space:normal;overflow-wrap:anywhere}.delete-products-list .is-selected{background:rgba(220,38,38,.08)}.delete-products-list>p{padding:16px}.delete-products-confirm{margin-top:16px;padding:14px;border:1px solid var(--danger);border-radius:10px}.delete-products-confirm label{display:grid;gap:8px}input[type=checkbox]{width:18px;height:18px;cursor:pointer}@media(max-width:640px){.delete-products-controls{grid-template-columns:1fr}.delete-products-selection{gap:12px}}`}</style>
    </form>
  </div>;
}
