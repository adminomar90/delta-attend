'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '../../../lib/api';
import { authStorage } from '../../../lib/auth';
import { Permission, hasPermission } from '../../../lib/permissions';
import { buildWhatsAppSendUrl } from '../../../lib/whatsapp';
import QuoteDocument, { QuoteProductImage, quoteMoney, quoteDate, unitLabel } from '../../../components/customer-quotes/QuoteDocument';

const blank = () => ({ customerMode: 'EXISTING', customerId: '', customerName: '', phone: '', address: '', title: 'عرض أسعار', warehouseId: '', currency: 'IQD', items: [], installationFee: 0, programmingFee: 0, notes: '', terms: '', validUntil: new Date(Date.now() + 30 * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' }) });
const normalize = (value) => String(value || '').normalize('NFKC').replace(/[\u064B-\u065Fـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').toLowerCase();

function ActionIcon({ name }) {
  const paths = {
    view: 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
    file: 'M14 2H5v20h14V7l-5-5Zm0 0v6h5M8 13h8M8 17h6',
    download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
    edit: 'm15 5 4 4M4 20l5-1L21 7l-4-4L5 15l-1 5Z',
    share: 'M21 11.5a9 9 0 0 1-13.5 7.8L3 21l1.7-4.5A9 9 0 1 1 21 11.5ZM8 8c0 4 4 8 8 8',
  };
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

function ShareDialog({ quote, onClose, onShared }) {
  const dialog = useRef(null);
  const [phone, setPhone] = useState(quote.phone || ''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState(null);
  useEffect(() => { dialog.current.showModal(); }, []);
  const prepare = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try { const data = await api.post(`/customer-quotes/${quote._id}/whatsapp-link`, { phone, publicOrigin: window.location.origin }); setResult(data); onShared(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return <dialog ref={dialog} className="cq-dialog" aria-labelledby="cq-share-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={prepare}><h3 id="cq-share-title">إرسال عرض السعر عبر واتساب</h3><p className="cq-muted">يُرسل رابط العرض للزبون، ويمكنه فتح التفاصيل وتحميل PDF دون تسجيل دخول.</p>
      <label className="cq-field">رقم واتساب الزبون<input type="tel" dir="ltr" required autoFocus value={phone} disabled={busy} onChange={(event) => { setPhone(event.target.value); setResult(null); }} placeholder="07xxxxxxxxx" /></label>
      {error ? <p role="alert" className="cq-error">{error}</p> : null}
      {result ? <div className="cq-share-link"><label className="cq-field">رابط العرض<input aria-label="رابط العرض" readOnly value={result.link} onFocus={(event) => event.target.select()} /></label><a className="btn btn-primary" href={buildWhatsAppSendUrl({ phone, message: result.message })} target="_blank" rel="noreferrer">فتح واتساب وإرسال العرض</a><a className="btn btn-soft" href={result.link} target="_blank" rel="noreferrer">معاينة رابط الزبون</a></div> : null}
      <div className="cq-toolbar"><button type="button" className="btn btn-soft" disabled={busy} onClick={onClose}>إغلاق</button>{!result ? <button className="btn btn-primary" disabled={busy}>{busy ? 'جارٍ التجهيز…' : 'تجهيز رابط واتساب'}</button> : null}</div>
    </form>
  </dialog>;
}

function QuoteEditor({ initial, metadata, saving, onSave, onCancel, onRefresh }) {
  const [form, setForm] = useState({ ...blank(), ...initial, discount: initial?.discount ?? 0 });
  const [productSearch, setProductSearch] = useState(''), [customerSearch, setCustomerSearch] = useState('');
  const set = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));
  const words = normalize(productSearch).split(/\s+/).filter(Boolean);
  const materials = metadata.materials.filter((m) => m.warehouseId === form.warehouseId && !form.items.some((line) => line.materialId === m._id) && words.every((word) => normalize(`${m.name} ${m.code} ${m.brand} ${m.model} ${m.description}`).includes(word)));
  const customers = metadata.customers.filter((c) => c._id === form.customerId || normalize(c.name + ' ' + c.phone).includes(normalize(customerSearch)));
  const lineTotal = (line) => Math.round(Number(line.quantity || 0) * Math.round(Number(line.unitPrice || 0) * 100));
  const productsCents = form.items.reduce((sum, line) => sum + lineTotal(line), 0);
  const subtotalCents = productsCents + Math.round(Number(form.installationFee || 0) * 100) + Math.round(Number(form.programmingFee || 0) * 100);
  const discountCents = Math.round(Number(form.discount || 0) * 100);
  const invalidDiscount = !Number.isFinite(discountCents) || discountCents < 0 || discountCents > subtotalCents;
  const total = (subtotalCents - discountCents) / 100;
  const chooseCustomer = (id) => { const customer = metadata.customers.find((c) => c._id === id); setForm((previous) => ({ ...previous, customerId: id, customerName: customer?.name || '', phone: customer?.phone || '', address: customer?.address || '' })); };
  const addProduct = (id) => { const product = materials.find((m) => m._id === id); if (!product) return; set('items', [...form.items, { materialId: id, name: product.name, code: product.code, unit: product.unit, imageUrl: product.imageUrl, brand: product.brand, model: product.model, quantity: 1, unitPrice: '' }]); setProductSearch(''); };
  const updateLine = (index, key, value) => set('items', form.items.map((line, i) => i === index ? { ...line, [key]: value } : line));
  return <form className="card" onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
    <div className="cq-toolbar"><h2>{form._id ? `تعديل ${form.quoteNo}` : 'عرض سعر جديد'}</h2><button type="button" className="btn btn-soft" disabled={saving} onClick={onCancel}>رجوع</button></div>
    <fieldset disabled={saving} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <div className="cq-modes" role="radiogroup" aria-label="طريقة إدخال الزبون">{[['EXISTING', 'من قائمة الزبائن'], ['MANUAL', 'إدخال الزبون يدويًا'], ['NONE', 'بدون اسم زبون']].map(([value, label]) => <label key={value}><input type="radio" name="customer-mode" value={value} checked={form.customerMode === value} onChange={() => setForm((previous) => ({ ...previous, customerMode: value, customerId: '', customerName: '', phone: '', address: '' }))} />{label}</label>)}</div>
      <div className="cq-form-grid">
        {form.customerMode === 'EXISTING' ? <><label className="cq-field">البحث عن زبون<input aria-label="البحث عن زبون" value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder="الاسم أو رقم الهاتف" /></label><label className="cq-field">الزبون *<select aria-label="الزبون" required value={form.customerId} onChange={(event) => chooseCustomer(event.target.value)}><option value="">اختر الزبون</option>{customers.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select>{!metadata.customers.length ? <small className="cq-muted">لا توجد زبائن متاحة ضمن صلاحياتك.</small> : null}</label></> : form.customerMode === 'MANUAL' ? <label className="cq-field">اسم الزبون *<input aria-label="اسم الزبون" required maxLength={200} value={form.customerName} onChange={(event) => set('customerName', event.target.value)} /></label> : null}
        <label className="cq-field">رقم واتساب<input aria-label="رقم واتساب" type="tel" dir="ltr" value={form.phone} maxLength={40} onChange={(event) => set('phone', event.target.value)} /></label>
        <label className="cq-field">عنوان العرض<input aria-label="عنوان العرض" value={form.title} maxLength={200} onChange={(event) => set('title', event.target.value)} /></label>
        <label className="cq-field">عنوان الزبون / الموقع<input aria-label="عنوان الزبون" value={form.address} maxLength={500} onChange={(event) => set('address', event.target.value)} /></label>
        <label className="cq-field">المخزن *<select aria-label="المخزن" required value={form.warehouseId} disabled={form.items.length > 0} onChange={(event) => set('warehouseId', event.target.value)}><option value="">اختر المخزن</option>{metadata.warehouses.map((w) => <option key={w._id} value={w._id}>{w.name} - {w.code}</option>)}</select>{form.items.length ? <small className="cq-muted">لتغيير المخزن، احذف بنود المنتجات أولًا.</small> : null}</label>
        <label className="cq-field">العملة<select aria-label="العملة" value={form.currency} onChange={(event) => set('currency', event.target.value)}><option value="IQD">دينار عراقي - IQD</option><option value="USD">دولار أمريكي - USD</option></select></label>
        <label className="cq-field">صالح لغاية *<input aria-label="صالح لغاية" type="date" required value={form.validUntil} onChange={(event) => set('validUntil', event.target.value)} /></label>
      </div>
      <div className="cq-toolbar"><h3>منتجات المخزن</h3><button type="button" className="btn btn-soft" onClick={onRefresh}>تحديث المتوفر</button></div>
      <div className="cq-picker"><label className="cq-field">البحث عن منتج<input aria-label="البحث عن منتج" disabled={!form.warehouseId} value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="الاسم أو الكود أو الموديل" /></label><label className="cq-field">إضافة منتج<select aria-label="إضافة منتج" value="" disabled={!form.warehouseId} onChange={(event) => addProduct(event.target.value)}><option value="">اختر منتجًا لإضافته</option>{materials.slice(0, 150).map((m) => <option key={m._id} value={m._id}>{m.name} | {m.code} | المتاح: {quoteMoney(m.available)}</option>)}</select></label></div>
      {form.warehouseId && !materials.length ? <p className="cq-muted">لا توجد منتجات إضافية تطابق البحث في المخزن المحدد.</p> : null}
      <div className="cq-table-scroll"><table className="cq-edit-lines"><thead><tr><th>المنتج</th><th>الكمية</th><th>سعر البيع ({form.currency})</th><th>الإجمالي</th><th>إجراء</th></tr></thead><tbody>{form.items.map((line, i) => <tr key={line.materialId}><td><div className="cq-product"><QuoteProductImage url={line.imageUrl} name={line.name} /><div>{line.name}<small>{line.code} · {unitLabel(line.unit)}</small></div></div></td><td><input aria-label={`كمية ${line.name}`} type="number" min="0.001" max="100000" step="0.001" required value={line.quantity} onChange={(event) => updateLine(i, 'quantity', event.target.value)} /></td><td><input aria-label={`سعر بيع ${line.name}`} type="number" min="0" max="100000000" step="0.01" required value={line.unitPrice} onChange={(event) => updateLine(i, 'unitPrice', event.target.value)} /></td><td><bdi>{quoteMoney(lineTotal(line) / 100)}</bdi></td><td><button type="button" className="btn btn-danger" aria-label={`حذف ${line.name}`} onClick={() => set('items', form.items.filter((_, index) => index !== i))}>حذف</button></td></tr>)}</tbody></table></div>
      {!form.items.length ? <p className="cq-muted">أضف منتجًا واحدًا على الأقل من المخزن.</p> : null}
      <div className="cq-form-grid"><label className="cq-field">أجور التركيب ({form.currency})<input aria-label="أجور التركيب" type="number" min="0" max="100000000" step="0.01" required value={form.installationFee} onChange={(event) => set('installationFee', event.target.value)} /></label><label className="cq-field">أجور البرمجة ({form.currency})<input aria-label="أجور البرمجة" type="number" min="0" max="100000000" step="0.01" required value={form.programmingFee} onChange={(event) => set('programmingFee', event.target.value)} /></label></div>
      <div className="cq-form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))' }}><label className="cq-field">ملاحظات العرض<textarea aria-label="ملاحظات العرض" maxLength={3000} value={form.notes} onChange={(event) => set('notes', event.target.value)} /></label><label className="cq-field">الشروط والأحكام<textarea aria-label="الشروط والأحكام" maxLength={3000} value={form.terms} onChange={(event) => set('terms', event.target.value)} /></label></div>
      {form.sharedAt ? <p className="cq-muted">حفظ التعديلات يُلغي رابط المشاركة السابق. جهّز رابطًا جديدًا للنسخة المحدّثة.</p> : null}
      <label className="cq-field" style={{ maxWidth: 350 }}>الخصم ({form.currency})<input aria-label="الخصم" type="number" min="0" max={subtotalCents / 100} step="0.01" required value={form.discount} onChange={(event) => set('discount', event.target.value)} /><small className="cq-muted">مبلغ يُخصم من إجمالي العرض شامل الخدمات.</small></label>
      {invalidDiscount ? <p className="cq-error" role="alert">الخصم يجب أن يكون بين صفر وإجمالي العرض قبل الخصم.</p> : null}
      <div className="cq-form-summary"><span>{discountCents > 0 ? 'الإجمالي بعد الخصم' : 'الإجمالي شامل المنتجات والتركيب والبرمجة'}</span><strong><bdi>{quoteMoney(total)} {form.currency}</bdi></strong><button className="btn btn-primary" disabled={!form.items.length || invalidDiscount}>{saving ? 'جارٍ الحفظ…' : 'حفظ عرض السعر'}</button></div>
    </fieldset>
  </form>;
}

export default function CustomerQuotesPage() {
  const canManage = hasPermission(authStorage.getUser(), Permission.MANAGE_CUSTOMER_QUOTES);
  const [quotes, setQuotes] = useState([]), [metadata, setMetadata] = useState({ customers: [], warehouses: [], materials: [] });
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [search, setSearch] = useState(''), [editor, setEditor] = useState(null), [selected, setSelected] = useState(null), [share, setShare] = useState(null);
  const refreshMetadata = async () => { try { setMetadata(await api.get('/customer-quotes/metadata')); } catch (err) { setError(err.message); } };
  const load = async () => {
    setLoading(true); setError('');
    try { const data = await api.get('/customer-quotes'); setQuotes(data.quotes); if (canManage) setMetadata(await api.get('/customer-quotes/metadata')); }
    catch (err) { setError(err.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const save = async (form) => {
    setSaving(true); setError('');
    try { const result = form._id ? await api.patch(`/customer-quotes/${form._id}`, form) : await api.post('/customer-quotes', form); setEditor(null); setSelected(result.quote); setMessage('تم حفظ عرض السعر.'); await load(); }
    catch (err) { setError(err.message); } finally { setSaving(false); }
  };
  const edit = (quote) => { setSelected(null); setMessage(''); setError(''); setEditor({ ...quote, customerId: quote.customer || '', warehouseId: quote.warehouse, validUntil: quote.validUntil.slice(0, 10), items: quote.items.map((line) => ({ ...line, materialId: line.material })) }); };
  const pdf = async (quote, download = false) => {
    const popup = download ? null : window.open('', '_blank'); setSaving(true); setError('');
    try { const blob = await api.get(`/customer-quotes/${quote._id}/pdf${download ? '?download=1' : ''}`); const url = URL.createObjectURL(blob); if (download) { const link = document.createElement('a'); link.href = url; link.download = `${quote.quoteNo}.pdf`; document.body.appendChild(link); link.click(); link.remove(); } else if (popup) popup.location.href = url; else { const link = document.createElement('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener'; link.click(); } setTimeout(() => URL.revokeObjectURL(url), 60000); }
    catch (err) { popup?.close(); setError(err.message); } finally { setSaving(false); }
  };
  const actions = (quote) => <div className="cq-quote-actions">
    <div className="cq-main-actions"><button className="btn btn-primary" disabled={saving} onClick={() => { setEditor(null); setSelected(quote); }}><ActionIcon name="view" />تفاصيل</button>{canManage ? <button className="btn cq-whatsapp-btn" disabled={saving} onClick={() => setShare(quote)}><ActionIcon name="share" />واتساب</button> : null}</div>
    <div className="cq-file-actions"><button className="btn btn-soft" disabled={saving} onClick={() => pdf(quote)}><ActionIcon name="file" />عرض PDF</button><button className="btn btn-soft" disabled={saving} onClick={() => pdf(quote, true)}><ActionIcon name="download" />تحميل PDF</button>{canManage ? <button className="btn btn-soft" disabled={saving} onClick={() => edit(quote)}><ActionIcon name="edit" />تعديل</button> : null}</div>
  </div>;
  const visible = quotes.filter((quote) => normalize(`${quote.quoteNo} ${quote.customerName} ${quote.title} ${quote.items.map((i) => i.name).join(' ')}`).includes(normalize(search)));
  return <div className="customer-quotes" dir="rtl">
    <section className="card cq-no-print"><div className="cq-toolbar"><div><h2>عروض الأسعار للزبائن</h2><p className="cq-muted">عروض المنتجات وخدمات التركيب والبرمجة، مع PDF ورابط واتساب للزبون.</p></div><div className="cq-actions"><button className="btn btn-soft" disabled={saving} onClick={() => { setEditor(null); setSelected(null); setError(''); }}>جميع العروض ({quotes.length})</button>{canManage ? <button className="btn btn-primary" disabled={saving || loading} onClick={() => { setEditor(blank()); setSelected(null); setError(''); setMessage(''); }}>+ عرض سعر جديد</button> : null}<button className="btn btn-soft" disabled={saving || loading} onClick={load}>تحديث</button></div></div></section>
    {error ? <section className="card cq-error" role="alert">{error}</section> : null}{message ? <p className="cq-success" role="status">{message}</p> : null}
    {loading ? <section className="card" role="status">جارٍ تحميل عروض الأسعار…</section> : editor ? <QuoteEditor key={editor._id || 'new'} initial={editor} metadata={metadata} saving={saving} onSave={save} onCancel={() => setEditor(null)} onRefresh={refreshMetadata} /> : selected ? <><section className="card cq-no-print"><div className="cq-toolbar"><h3>{selected.quoteNo}</h3>{actions(selected)}</div></section><QuoteDocument quote={selected} /></> : <section className="card cq-list-section">
      <div className="cq-list-toolbar"><label className="cq-field cq-list-search">البحث في العروض<div className="cq-search-wrap"><ActionIcon name="view" /><input className="cq-search" aria-label="البحث في العروض" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="رقم العرض أو اسم الزبون أو المنتج" /></div></label><p className="cq-results" aria-live="polite"><strong>{visible.length}</strong> عرض من أصل {quotes.length}</p></div>
      <div className="cq-cards">{visible.map((quote) => {
        const expired = new Date(quote.validUntil) < new Date();
        return <article className="cq-card" key={quote._id}>
          <div className="cq-card-top"><span className="cq-quote-number" dir="ltr">{quote.quoteNo}</span><span className={`cq-status ${expired ? 'expired' : quote.sharedAt ? 'shared' : ''}`}>{expired ? 'منتهي الصلاحية' : quote.sharedAt ? 'رابط مشاركة جاهز' : 'غير مشارك'}</span></div>
          <div className="cq-card-customer"><span className="cq-customer-symbol" aria-hidden="true">{(quote.customerName || 'ع').trim().charAt(0)}</span><div><small>مقدم إلى</small><h3>{quote.customerName || 'عرض بدون اسم زبون'}</h3></div></div>
          <p className="cq-card-title">{quote.title}</p>
          <div className="cq-card-amount"><span>{quote.discount > 0 ? 'الإجمالي بعد الخصم' : 'إجمالي العرض'}</span><strong className="cq-card-total"><bdi>{quoteMoney(quote.total)} <small>{quote.currency}</small></bdi></strong>{quote.discount > 0 ? <small className="cq-card-discount">خصم <bdi>{quoteMoney(quote.discount)} {quote.currency}</bdi></small> : null}</div>
          <dl className="cq-card-meta"><div><dt>المنتجات</dt><dd>{quote.items.length} منتج</dd></div><div><dt>صالح لغاية</dt><dd><bdi>{quoteDate(quote.validUntil)}</bdi></dd></div></dl>
          {actions(quote)}
        </article>;
      })}</div>
      {!visible.length ? <div className="cq-empty"><ActionIcon name="file" /><h3>{search ? 'لا توجد نتائج مطابقة' : 'لا توجد عروض أسعار بعد'}</h3><p className="cq-muted">{search ? 'جرّب رقم العرض أو اسم الزبون أو المنتج.' : 'ستظهر عروض الأسعار هنا عند إنشائها.'}</p>{search ? <button className="btn btn-soft" onClick={() => setSearch('')}>مسح البحث</button> : null}</div> : null}
    </section>}
    {share ? <ShareDialog quote={share} onClose={() => setShare(null)} onShared={() => { api.get('/customer-quotes').then((data) => setQuotes(data.quotes)).catch(() => {}); }} /> : null}
  </div>;
}
