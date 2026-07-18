'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, assetUrl } from '../../../lib/api';

const availabilityLabels = [
  ['AVAILABLE', 'متوفرة'],
  ['PARTIAL', 'متوفرة جزئياً'],
  ['UNAVAILABLE', 'غير متوفرة'],
];

const money = (value) => Number(value || 0).toLocaleString('en-US');

export default function SupplierQuotePage() {
  const params = useParams();
  const token = typeof params?.token === 'string' ? params.token : '';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [locked, setLocked] = useState(false);
  const [data, setData] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [form, setForm] = useState({
    deliveryDays: 0,
    validUntil: '',
    deliveryFee: '',
    currency: 'IQD',
    generalNotes: '',
    lines: [],
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        if (!token) {
          throw new Error('رابط التسعير غير مكتمل، يرجى فتح الرابط المرسل عبر واتساب مرة أخرى.');
        }
        const response = await api.get(`/purchases/public/quotes/${token}`);
        setLocked(!!response.locked);
        setData(response);
        if (!response.locked) {
          setForm({
            deliveryDays: response.quote?.deliveryDays || 0,
            validUntil: response.quote?.validUntil ? String(response.quote.validUntil).slice(0, 10) : '',
            deliveryFee: response.quote?.deliveryFee || '',
            currency: response.quote?.currency || 'IQD',
            generalNotes: response.quote?.generalNotes || '',
            lines: (response.items || []).map((item) => {
              const oldLine = (response.quote?.lines || []).find((line) => String(line.material) === String(item.material?._id || item.material));
              return {
                itemId: item._id,
                materialId: item.material?._id || item.material,
                materialName: item.materialName,
                materialCode: item.materialCode || '',
                model: item.model || '',
                barcode: item.barcode || '',
                brand: item.brand || '',
                imageUrl: item.imageUrl || '',
                requestedQty: Number(item.requestedQty || 0),
                availability: oldLine?.availability || 'AVAILABLE',
                offeredQty: oldLine ? oldLine.offeredQty : '',
                unitPrice: oldLine ? oldLine.unitPrice : '',
                alternativeName: oldLine?.alternativeName || '',
                alternativeUnitPrice: oldLine ? oldLine.alternativeUnitPrice : '',
                alternativeNotes: oldLine?.alternativeNotes || '',
                notes: oldLine?.notes || '',
              };
            }),
          });
        }
      } catch (err) {
        setError(err.message || 'تعذر فتح رابط التسعير');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  const total = useMemo(() => (
    form.lines.reduce((sum, line) => sum + (Number(line.offeredQty || 0) * Number(line.unitPrice || 0)), 0)
      + Number(form.deliveryFee || 0)
  ), [form.lines, form.deliveryFee]);

  const updateLine = (index, patch) => {
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)),
    }));
  };

  const addAttachments = (fileList) => {
    const incoming = Array.from(fileList || []);
    const oversized = incoming.find((file) => file.size > 20 * 1024 * 1024);
    if (oversized) {
      setError(`حجم الملف ${oversized.name} أكبر من 20 ميغابايت.`);
      return;
    }
    setError('');
    setAttachments((current) => [...current, ...incoming]
      .filter((file, index, files) => files.findIndex((item) => item.name === file.name && item.size === file.size) === index)
      .slice(0, 5));
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = new FormData();
      payload.append('payload', JSON.stringify(form));
      attachments.forEach((file) => payload.append('attachments', file));
      await api.post(`/purchases/public/quotes/${token}`, payload);
      setSent(true);
    } catch (err) {
      setError(err.message || 'تعذر إرسال العرض');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <main className="quote-page"><section className="quote-panel">جار تحميل طلب التسعير...</section></main>;
  if (locked || sent) {
    return (
      <main className="quote-page">
        <section className="quote-panel quote-done">
          <img src="/brand/delta-plus-logo.png" alt="Delta Plus" />
          <h1>تم إرسال العرض</h1>
          <p>شكراً لكم. تم استلام عرض السعر ولا يمكن تعديله إلا بعد إعادة فتحه من الإدارة.</p>
        </section>
        <QuoteStyles />
      </main>
    );
  }

  return (
    <main className="quote-page" dir="rtl">
      <form className="quote-panel" onSubmit={submit}>
        <header className="quote-header">
          <img src="/brand/delta-plus-logo.png" alt="Delta Plus" />
          <div className="quote-heading">
            <span>قسم المشتريات</span>
            <h1>طلب عرض سعر</h1>
            <p>يرجى تزويدنا بأفضل الأسعار والتوفر للمواد الموضحة أدناه</p>
          </div>
          <div className="quote-request-meta">
            <div><small>رقم الطلب</small><strong>{data?.requestNo}</strong></div>
            <div><small>المورد</small><strong>{data?.supplierName}</strong></div>
            <div><small>تاريخ الطلب</small><strong>{data?.requestDate ? new Date(data.requestDate).toLocaleDateString('ar-IQ') : '-'}</strong></div>
          </div>
        </header>

        {error ? <div className="quote-error">{error}</div> : null}

        <section className="quote-lines">
          <div className="quote-section-title"><div><span>01</span><h2>تفاصيل المواد المطلوبة</h2></div><p>أدخل حالة التوفر والكمية وسعر الوحدة لكل مادة</p></div>
          {!form.lines.length ? (
            <div className="quote-error">لا توجد مواد مطلوبة في هذا الطلب. يرجى التواصل مع قسم المشتريات.</div>
          ) : null}
          {form.lines.length ? <div className="quote-table-wrap"><table className="quote-table">
            <thead><tr><th>#</th><th>المادة المطلوبة</th><th>الكمية</th><th>التوفر</th><th>الكمية المتوفرة</th><th>سعر الوحدة</th><th>المجموع</th></tr></thead>
            <tbody>{form.lines.map((line, index) => {
              const lineTotal = Number(line.offeredQty || 0) * Number(line.unitPrice || 0);
              const showAlternative = line.availability !== 'AVAILABLE';
              return [
                <tr className="quote-product-row" key={`${line.materialId}-main`}>
                  <td className="quote-index">{index + 1}</td>
                  <td><div className="quote-product">
                    <div className="quote-product-image">{line.imageUrl ? <img src={assetUrl(line.imageUrl)} alt={line.materialName} /> : <span>لا توجد صورة</span>}</div>
                    <div className="quote-product-info"><strong>{line.materialName}</strong>{line.brand ? <span>{line.brand}</span> : null}<div className="quote-product-tags">{line.materialCode ? <em>الكود: {line.materialCode}</em> : null}{line.model ? <em>الموديل: {line.model}</em> : null}{line.barcode ? <em>الباركود: {line.barcode}</em> : null}</div></div>
                  </div></td>
                  <td><b className="quote-qty">{money(line.requestedQty)}</b></td>
                  <td><select aria-label={`توفر ${line.materialName}`} value={line.availability} onChange={(e) => updateLine(index, { availability: e.target.value })}>{availabilityLabels.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
                  <td><input required aria-label={`الكمية المتوفرة من ${line.materialName}`} placeholder="اكتب الكمية" type="number" min="0" step="any" value={line.offeredQty} onChange={(e) => updateLine(index, { offeredQty: e.target.value })} /></td>
                  <td><input required aria-label={`سعر ${line.materialName}`} placeholder="اكتب السعر" type="number" min="0" step="any" value={line.unitPrice} onChange={(e) => updateLine(index, { unitPrice: e.target.value })} /></td>
                  <td><strong className="quote-line-total" dir="ltr">{money(lineTotal)} {form.currency}</strong></td>
                </tr>,
                <tr className="quote-details-row" key={`${line.materialId}-details`}><td colSpan="7"><div className="quote-line-details">
                  {showAlternative ? <><label>اسم المادة البديلة<input value={line.alternativeName} onChange={(e) => updateLine(index, { alternativeName: e.target.value })} /></label><label>سعر البديل<input type="number" min="0" step="any" value={line.alternativeUnitPrice} onChange={(e) => updateLine(index, { alternativeUnitPrice: e.target.value })} /></label><label>ملاحظات البديل<input value={line.alternativeNotes} onChange={(e) => updateLine(index, { alternativeNotes: e.target.value })} /></label></> : null}
                  <label className={showAlternative ? '' : 'quote-full'}>ملاحظات المادة<input value={line.notes} onChange={(e) => updateLine(index, { notes: e.target.value })} placeholder="أي تفاصيل إضافية عن المادة أو السعر" /></label>
                </div></td></tr>,
              ];
            })}</tbody>
          </table></div> : null}
        </section>

        <section className="quote-card quote-summary-card">
          <div className="quote-section-title"><div><span>02</span><h2>تفاصيل العرض</h2></div></div>
          <div className="quote-grid">
            <label>مدة التجهيز بالأيام<input type="number" min="0" value={form.deliveryDays} onChange={(e) => setForm((p) => ({ ...p, deliveryDays: e.target.value }))} /></label>
            <label>صلاحية السعر<input type="date" value={form.validUntil} onChange={(e) => setForm((p) => ({ ...p, validUntil: e.target.value }))} /></label>
            <label>أجور النقل<input type="number" min="0" step="any" value={form.deliveryFee} onChange={(e) => setForm((p) => ({ ...p, deliveryFee: e.target.value }))} /></label>
            <label>العملة<select value={form.currency} onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))}><option value="IQD">دينار عراقي (IQD)</option><option value="USD">دولار أمريكي (USD)</option></select></label>
          </div>
          <label>ملاحظات عامة<textarea value={form.generalNotes} onChange={(e) => setForm((p) => ({ ...p, generalNotes: e.target.value }))} /></label>
          <div className="quote-total"><span>إجمالي العرض</span><strong dir="ltr">{money(total)} {form.currency}</strong></div>
        </section>

        <section className="quote-upload-card">
          <div className="quote-upload-copy">
            <span className="quote-upload-icon">↥</span>
            <div><h2>إرفاق ملف عرض السعر <small>اختياري</small></h2><p>يمكنك رفع PDF أو مستند أو صورة جاهزة، أو تصوير العرض مباشرة بكاميرا الهاتف.</p></div>
          </div>
          <div className="quote-upload-actions">
            <label className="quote-upload-action">
              <input className="quote-file-input" type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" onChange={(e) => { addAttachments(e.target.files); e.target.value = ''; }} />
              اختيار ملف
            </label>
            <label className="quote-upload-action quote-camera-action">
              <input className="quote-file-input" type="file" accept="image/*" capture="environment" onChange={(e) => { addAttachments(e.target.files); e.target.value = ''; }} />
              استخدام الكاميرا
            </label>
          </div>
          {attachments.length ? <div className="quote-upload-list">{attachments.map((file, index) => <div key={`${file.name}-${file.size}`}><span>✓</span><p><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(2)} MB</small></p><button type="button" onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}>حذف</button></div>)}</div> : <div className="quote-upload-empty">لم يتم اختيار ملف — يمكنك إرسال العرض من دون مرفق.</div>}
        </section>

        <button className="quote-submit" disabled={saving}>{saving ? 'جار الإرسال...' : 'إرسال العرض'}</button>
      </form>
      <QuoteStyles />
    </main>
  );
}

function QuoteStyles() {
  return (
    <style jsx global>{`
      body { margin: 0; background: #071225; }
      .quote-page { min-height: 100vh; padding: 28px 18px; font-family: "Cairo", "Tajawal", system-ui, sans-serif; color: #172033; background: radial-gradient(circle at 10% 0%, #18376b 0%, #0a1935 35%, #050a14 100%); }
      .quote-panel { width: min(1240px, 100%); margin: 0 auto; overflow: hidden; background: #fff; border: 1px solid #284777; border-radius: 16px; padding: 0 24px 24px; box-shadow: 0 24px 70px rgba(0, 0, 0, .38); }
      .quote-header { position: relative; display: grid; justify-items: center; gap: 12px; margin: 0 -24px 24px; padding: 28px 24px 20px; overflow: hidden; color: #edf3ff; text-align: center; background: linear-gradient(135deg, #0d182e, #152f61); border-bottom: 4px solid #c4d743; }
      .quote-header::before { content: ""; position: absolute; width: 280px; height: 280px; inset: -190px auto auto -80px; border: 45px solid rgba(196, 215, 67, .08); border-radius: 50%; }
      .quote-header img, .quote-done img { position: relative; width: 112px; height: 84px; object-fit: contain; }
      .quote-heading span { display: inline-block; margin-bottom: 3px; color: #c4d743; font-size: 12px; font-weight: 800; letter-spacing: .08em; }
      .quote-header h1 { margin: 0 0 4px; font-size: clamp(24px, 4vw, 34px); }
      .quote-header p { margin: 0; color: #b8c7df; }
      .quote-request-meta { display: grid; grid-template-columns: repeat(3, minmax(160px, 1fr)); gap: 8px; width: min(760px, 100%); margin-top: 6px; }
      .quote-request-meta div { display: grid; gap: 2px; padding: 9px 14px; border: 1px solid rgba(255,255,255,.12); border-radius: 9px; background: rgba(255,255,255,.06); }
      .quote-request-meta small { color: #a7b7d3; }
      .quote-request-meta strong { color: #fff; font-size: 14px; }
      .quote-lines { display: grid; gap: 12px; }
      .quote-section-title { display: flex; justify-content: space-between; gap: 14px; align-items: end; margin: 2px 0 12px; }
      .quote-section-title > div { display: flex; gap: 9px; align-items: center; }
      .quote-section-title span { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 9px; color: #0d182e; background: #c4d743; font-weight: 900; }
      .quote-section-title h2 { margin: 0; color: #152f61; font-size: 19px; }
      .quote-section-title p { margin: 0; color: #64748b; font-size: 13px; }
      .quote-table-wrap { overflow-x: auto; margin-bottom: 20px; border: 1px solid #d7dfeb; border-radius: 12px; box-shadow: 0 8px 20px rgba(21, 47, 97, .06); }
      .quote-table { width: 100%; min-width: 1040px; border-collapse: collapse; }
      .quote-table th { padding: 11px 9px; color: #edf3ff; background: #152f61; font-size: 12px; white-space: nowrap; }
      .quote-table td { padding: 10px 9px; border-bottom: 1px solid #e7ebf1; vertical-align: middle; }
      .quote-product-row:hover { background: #f8faed; }
      .quote-index { color: #6b7b92; text-align: center; font-weight: 900; }
      .quote-product { display: flex; gap: 12px; align-items: center; min-width: 330px; }
      .quote-product-image { display: grid; flex: 0 0 76px; width: 76px; height: 68px; place-items: center; overflow: hidden; border: 1px solid #dce3ec; border-radius: 9px; color: #94a3b8; background: #f7f9fc; text-align: center; font-size: 10px; }
      .quote-product-image img { width: 100%; height: 100%; object-fit: contain; }
      .quote-product-info { display: grid; gap: 3px; }
      .quote-product-info > strong { color: #152f61; font-size: 14px; }
      .quote-product-info > span { color: #64748b; font-size: 11px; }
      .quote-product-tags { display: flex; flex-wrap: wrap; gap: 4px; }
      .quote-product-tags em { padding: 2px 6px; border-radius: 5px; color: #53627a; background: #edf1f6; font-size: 10px; font-style: normal; }
      .quote-qty { display: inline-grid; min-width: 42px; min-height: 32px; place-items: center; border-radius: 8px; color: #152f61; background: #eef2c9; }
      .quote-line-total { color: #152f61; white-space: nowrap; }
      .quote-details-row td { padding: 8px 12px 13px; background: #f7f9fc; }
      .quote-line-details { display: grid; grid-template-columns: repeat(4, 1fr); gap: 9px; }
      .quote-line-details .quote-full { grid-column: 1 / -1; }
      .quote-card { border: 1px solid #d7dfeb; border-radius: 12px; padding: 16px; background: #f8fafc; margin-bottom: 14px; }
      .quote-summary-card { border-top: 4px solid #c4d743; }
      .quote-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
      .quote-span { grid-column: 1 / -1; }
      .quote-panel label { display: grid; gap: 6px; font-size: 13px; font-weight: 700; color: #334155; }
      .quote-panel input, .quote-panel select, .quote-panel textarea { width: 100%; box-sizing: border-box; border: 1px solid #cbd5e1; border-radius: 7px; min-height: 40px; padding: 8px 9px; color: #172033; font: inherit; background: #fff; outline: none; }
      .quote-panel input:focus, .quote-panel select:focus, .quote-panel textarea:focus { border-color: #829125; box-shadow: 0 0 0 3px rgba(196, 215, 67, .22); }
      .quote-panel textarea { min-height: 78px; resize: vertical; }
      .quote-total { display: flex; justify-content: space-between; align-items: center; margin-top: 14px; padding-top: 12px; border-top: 1px solid #e5eaf2; }
      .quote-total strong { color: #152f61; font-size: 24px; }
      .quote-upload-card { display: grid; gap: 14px; margin: 4px 0 18px; padding: 18px; border: 1px dashed #829125; border-radius: 12px; background: linear-gradient(135deg, #fbfdec, #f7f9fc); }
      .quote-upload-copy { display: flex; gap: 12px; align-items: center; }
      .quote-upload-icon { display: grid; flex: 0 0 44px; width: 44px; height: 44px; place-items: center; border-radius: 12px; color: #152f61; background: #c4d743; font-size: 25px; font-weight: 900; }
      .quote-upload-copy h2 { margin: 0 0 3px; color: #152f61; font-size: 17px; }
      .quote-upload-copy h2 small { display: inline-block; margin-inline-start: 5px; padding: 2px 7px; border-radius: 999px; color: #52600e; background: #eaf0b5; font-size: 10px; }
      .quote-upload-copy p { margin: 0; color: #64748b; font-size: 12px; }
      .quote-upload-actions { display: flex; flex-wrap: wrap; gap: 9px; }
      .quote-panel .quote-upload-action { display: inline-flex; width: auto; min-height: 42px; padding: 9px 16px; align-items: center; justify-content: center; border: 1px solid #152f61; border-radius: 8px; color: #fff; background: #152f61; cursor: pointer; }
      .quote-panel .quote-camera-action { color: #152f61; border-color: #a9bb30; background: #c4d743; }
      .quote-panel .quote-file-input { display: none !important; }
      .quote-upload-list { display: grid; gap: 7px; }
      .quote-upload-list > div { display: flex; gap: 9px; align-items: center; padding: 9px 11px; border: 1px solid #d7dfeb; border-radius: 8px; background: #fff; }
      .quote-upload-list > div > span { color: #71810e; font-weight: 900; }
      .quote-upload-list p { display: grid; flex: 1; gap: 1px; min-width: 0; margin: 0; }
      .quote-upload-list strong { overflow: hidden; color: #334155; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
      .quote-upload-list small { color: #94a3b8; }
      .quote-upload-list button { border: 0; color: #b91c1c; background: transparent; font-family: inherit; cursor: pointer; }
      .quote-upload-empty { padding: 8px 10px; border-radius: 7px; color: #64748b; background: rgba(255,255,255,.65); font-size: 12px; }
      .quote-submit { width: 100%; min-height: 52px; border: 0; border-radius: 10px; background: linear-gradient(135deg, #c4d743, #9eb629); color: #0d182e; box-shadow: 0 10px 22px rgba(158, 182, 41, .24); font-size: 17px; font-weight: 900; cursor: pointer; }
      .quote-submit:hover { filter: brightness(1.04); }
      .quote-submit:disabled { opacity: .65; cursor: wait; }
      .quote-error { color: #b91c1c; background: #fee2e2; border: 1px solid #fecaca; border-radius: 8px; padding: 10px; margin-bottom: 12px; }
      .quote-done { text-align: center; padding: 36px 18px; border-top: 5px solid #c4d743; }
      @media (max-width: 760px) {
        .quote-page { padding: 10px; }
        .quote-panel { padding: 0 12px 14px; border-radius: 12px; }
        .quote-header { margin-inline: -12px; padding: 22px 12px 16px; }
        .quote-header img { width: 96px; height: 72px; }
        .quote-request-meta { grid-template-columns: 1fr; }
        .quote-section-title { display: grid; align-items: start; }
        .quote-line-details { grid-template-columns: 1fr 1fr; }
      }
    `}</style>
  );
}
