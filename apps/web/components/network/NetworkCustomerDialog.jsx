'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import NetworkCustomerLogoPicker from './NetworkCustomerLogoPicker';

export default function NetworkCustomerDialog({ form, setForm, saving, error, onSubmit, onClose, editing = false }) {
  const [processingLogo, setProcessingLogo] = useState(false);
  const busy = saving || processingLogo;
  const panel = useRef(null), state = useRef({ saving, onClose });
  state.current = { saving: busy, onClose };
  useEffect(() => {
    const previousFocus = document.activeElement, previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector('input')?.focus();
    const keyboard = (event) => {
      if (event.key === 'Escape' && !state.current.saving) { event.preventDefault(); state.current.onClose(); }
      if (event.key !== 'Tab') return;
      const elements = [...(panel.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)') || [])].filter((element) => !element.matches(':disabled'));
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keyboard);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', keyboard); previousFocus?.focus?.(); };
  }, []);
  const field = (name, value) => setForm((current) => ({ ...current, [name]: value }));
  const nested = (group, name, value) => setForm((current) => ({ ...current, [group]: { ...current[group], [name]: value } }));
  if (typeof document === 'undefined') return null;
  return createPortal(<div className="modal-backdrop customer-dialog-backdrop" dir="rtl" onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section ref={panel} className="modal-panel customer-create-dialog" role="dialog" aria-modal="true" aria-labelledby="new-network-customer-title">
      <div className="modal-header"><div><h3 id="new-network-customer-title">{editing ? 'تعديل معلومات الزبون' : 'إضافة زبون جديد'}</h3><p>بيانات الزبون وشعاره ومعلومات التواصل معه.</p></div><button type="button" className="modal-close" disabled={busy} aria-label="إغلاق" onClick={onClose}>&times;</button></div>
      <form onSubmit={(event) => { if (busy) { event.preventDefault(); return; } onSubmit(event); }}>
        <fieldset disabled={busy}><legend>بيانات الزبون</legend><div className="customer-form-grid">
          <label>اسم الزبون <span>*</span><input className="input" required value={form.name} onChange={(event) => field('name', event.target.value)} placeholder="اسم الشركة أو الزبون" /></label>
          <label>حالة العقد<select className="select" value={form.contractStatus} onChange={(event) => field('contractStatus', event.target.value)}><option value="ACTIVE">نشط</option><option value="SUSPENDED">معلق</option><option value="EXPIRED">منتهي</option><option value="UNDER_NEGOTIATION">قيد التفاوض</option></select></label>
          <label className="full-width">عنوان الشركة<input className="input" value={form.companyAddress} onChange={(event) => field('companyAddress', event.target.value)} /></label>
          <div className="full-width"><NetworkCustomerLogoPicker value={form.logoDataUrl || ''} onChange={(value) => field('logoDataUrl', value)} disabled={busy} onBusyChange={setProcessingLogo} /></div>
        </div></fieldset>
        <fieldset disabled={busy}><legend>الشخص المسؤول</legend><div className="customer-form-grid">
          <label>اسم المسؤول<input className="input" value={form.responsiblePerson.name} onChange={(event) => nested('responsiblePerson', 'name', event.target.value)} /></label>
          <label>المنصب<input className="input" value={form.responsiblePerson.title} onChange={(event) => nested('responsiblePerson', 'title', event.target.value)} /></label>
          <label>رقم الهاتف<input className="input" type="tel" dir="ltr" value={form.responsiblePerson.phone} onChange={(event) => nested('responsiblePerson', 'phone', event.target.value)} /></label>
          <label>البريد الإلكتروني<input className="input" type="email" dir="ltr" value={form.responsiblePerson.email} onChange={(event) => nested('responsiblePerson', 'email', event.target.value)} /></label>
        </div></fieldset>
        <fieldset disabled={busy}><legend>التواصل والملاحظات</legend><div className="customer-form-grid">
          <label>هواتف عامة<input className="input" dir="ltr" value={form.contactInfo.phones} onChange={(event) => nested('contactInfo', 'phones', event.target.value)} placeholder="0770..., 0780..." /></label>
          <label>بريد إلكتروني عام<input className="input" dir="ltr" value={form.contactInfo.emails} onChange={(event) => nested('contactInfo', 'emails', event.target.value)} placeholder="mail@example.com" /></label>
          <label className="full-width">الموقع الإلكتروني<input className="input" dir="ltr" value={form.contactInfo.website} onChange={(event) => nested('contactInfo', 'website', event.target.value)} placeholder="https://example.com" /></label>
          <label className="full-width">ملاحظات<textarea className="textarea" rows={3} value={form.notes} onChange={(event) => field('notes', event.target.value)} /></label>
        </div></fieldset>
        {error ? <p role="alert" className="dialog-error">{error}</p> : null}
        <div className="dialog-actions"><button type="submit" className="btn btn-primary" disabled={busy}>{processingLogo ? 'جارٍ تجهيز الشعار...' : saving ? 'جارٍ الحفظ...' : editing ? 'حفظ التعديلات' : 'حفظ الزبون'}</button><button type="button" className="btn btn-soft" disabled={busy} onClick={onClose}>إلغاء</button></div>
      </form>
    </section>
    <style jsx>{`.customer-dialog-backdrop{align-items:center}.customer-create-dialog{width:min(820px,calc(100vw - 24px));max-height:92dvh;padding:24px}.modal-header p{color:var(--text-soft);font-size:13px;line-height:1.8;margin:8px 0 0}fieldset{border:1px solid var(--border);border-radius:12px;padding:16px;margin:0 0 18px;min-width:0}legend{padding:0 8px;font-weight:700;font-size:14px}.customer-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.customer-form-grid label{display:grid;gap:8px;font-size:13px;min-width:0}.customer-form-grid .input,.customer-form-grid .select,.customer-form-grid .textarea{width:100%;min-width:0}.full-width{grid-column:1/-1}label span,.dialog-error{color:var(--danger)}.dialog-error{padding:12px;border:1px solid var(--danger);border-radius:10px}.dialog-actions{display:flex;gap:10px;flex-wrap:wrap;padding-top:4px}@media(max-width:600px){.customer-create-dialog{padding:18px}.customer-form-grid{grid-template-columns:1fr}.dialog-actions .btn{flex:1}}`}</style>
  </div>, document.body);
}
