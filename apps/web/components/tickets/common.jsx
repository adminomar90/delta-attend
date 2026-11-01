'use client';
import { useEffect, useRef } from 'react';
export const statuses = { DRAFT: 'مسودة', TODO: 'جديد', ASSIGNED: 'مسند', IN_PROGRESS: 'قيد التنفيذ', WAITING: 'بانتظار معلومات أو إجراء خارجي', SUBMITTED: 'بانتظار المراجعة', REJECTED: 'معاد للتعديل', APPROVED: 'مكتمل', CANCELLED: 'ملغى' };
export const priorities = { LOW: 'منخفضة', NORMAL: 'عادية', HIGH: 'عالية', URGENT: 'عاجلة' };
export const outputs = { CONFIRMATION: 'تأكيد تنفيذ', EXCEL: 'ملف Excel', PDF: 'فاتورة PDF', REPORT: 'تقرير', PHOTOS: 'صور' };
export const id = (v) => String(v?._id || v?.id || v || '');
export const date = (v) => v ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Baghdad', dateStyle: 'short', timeStyle: 'short' }).format(new Date(v)) : '—';
export const localDate = (v) => v ? new Date(new Date(v).getTime() + 3 * 3600000).toISOString().slice(0, 16) : '';
export const keyDate = (v) => localDate(v).slice(0, 10);
export function Select({ label, value, onChange, items = [], empty = 'اختر', ...rest }) { return <label>{label}<select className="select" value={value || ''} onChange={(e) => onChange(e.target.value)} {...rest}><option value="">{empty}</option>{items.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>; }
let openModals = 0, previousOverflow = '';
export function Modal({ title, close, children, wide = false }) {
  const panel = useRef(null), callback = useRef(close); callback.current = close;
  useEffect(() => {
    const priorFocus = document.activeElement;
    if (!openModals++) { previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    panel.current?.querySelector('button')?.focus();
    const onKey = (event) => {
      const dialogs = document.querySelectorAll('.ticket-modal [role=dialog]');
      if (dialogs[dialogs.length - 1] !== panel.current) return;
      if (event.key === 'Escape') { event.preventDefault(); callback.current(); }
      if (event.key === 'Tab') {
        const items = [...panel.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')].filter((item) => item.getClientRects().length);
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); if (!--openModals) document.body.style.overflow = previousOverflow; priorFocus?.isConnected && priorFocus.focus?.(); };
  }, []);
  return <div className="modal-backdrop ticket-modal"><section ref={panel} className={`modal-panel ${wide ? 'ticket-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><header className="ticket-row"><h2>{title}</h2><button type="button" className="btn btn-soft" onClick={close} aria-label="إغلاق">إغلاق ×</button></header>{children}</section></div>;
}
export function Recipients({ form, change, meta }) {
  const users = meta.users.filter((u) => u.active || form.mode === 'REMOVE').map((u) => ({ value: id(u), label: `${u.fullName} — ${u.department || ''}${u.active ? '' : ' (غير نشط)'}` }));
  if (form.mode === 'REMOVE') return <label>المستلمون المطلوب إزالتهم (اختيار متعدد)<select className="select ticket-multi" multiple value={form.recipients || []} onChange={(e) => change({ ...form, recipients: [...e.target.selectedOptions].map((option) => option.value) })}>{users.map((user) => <option key={user.value} value={user.value}>{user.label}</option>)}</select></label>;
  return <><Select label="المستلمون" value={form.recipientMode || 'SINGLE'} onChange={(recipientMode) => change({ ...form, recipientMode, assignee: '', leadAssignee: '', recipients: [] })} items={Object.entries({ SINGLE: 'موظف واحد', MULTIPLE: 'عدة موظفين', DEPARTMENT: 'قسم محدد', TECHNICAL: 'جميع الكادر الفني', ALL: 'جميع الموظفين' }).map(([value, label]) => ({ value, label }))} />
    {(!form.recipientMode || form.recipientMode === 'SINGLE') ? <Select label="الموظف المسؤول" value={form.assignee} onChange={(assignee) => change({ ...form, assignee })} items={users} /> : form.recipientMode === 'DEPARTMENT' ? <Select label="القسم" value={form.department} onChange={(department) => change({ ...form, department })} items={[...new Set(meta.users.map((u) => u.department).filter(Boolean))].map((v) => ({ value: v, label: v }))} /> : form.recipientMode === 'MULTIPLE' ? <label>الموظفون (اختيار متعدد)<select className="select ticket-multi" multiple value={form.recipients || []} onChange={(e) => change({ ...form, recipients: [...e.target.selectedOptions].map((o) => o.value) })}>{users.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}</select></label> : <p className="ticket-hint">يُحفظ المستلمون النشطون ضمن نطاق إدارتك عند الإسناد.</p>}</>;
}
const fields = { contactName: 'مسؤول الموقع', contactPhone: 'رقم هاتف الموقع', location: 'الموقع', mapUrl: 'رابط الخريطة', device: 'الجهاز', model: 'الموديل', serial: 'السيريال', fault: 'وصف العطل', impact: 'تأثير العطل', visitDate: 'موعد الزيارة', diagnosis: 'التشخيص *', actionTaken: 'الإجراء المنفذ *', materialsUsed: 'المواد المستخدمة', replacedParts: 'القطع المستبدلة', testResult: 'نتيجة اختبار التشغيل *', recommendations: 'توصيات الفني', customerSignature: 'توقيع / إقرار الزبون', signatureUnavailableReason: 'سبب تعذر الحصول على التوقيع', workMinutes: 'وقت العمل بالدقائق', travelMinutes: 'وقت التنقل بالدقائق' };
export function Technical({ value = {}, change, editable = true, disabled = false }) { return <div className="grid-3">{Object.entries(fields).map(([key, label]) => editable ? <label key={key}>{label}<input className="input" type={key === 'visitDate' ? 'datetime-local' : ['workMinutes', 'travelMinutes'].includes(key) ? 'number' : 'text'} min="0" disabled={disabled} value={key === 'visitDate' ? localDate(value[key]) : value[key] ?? ''} onChange={(e) => change({ ...value, [key]: key === 'visitDate' && e.target.value ? `${e.target.value}+03:00` : e.target.value })} /></label> : <div key={key}><small>{label.replace(' *', '')}</small><p>{key === 'visitDate' ? date(value[key]) : value[key] || '—'}</p></div>)}<Select label="التغطية" value={value.coverage} onChange={(coverage) => change({ ...value, coverage })} disabled={!editable || disabled} items={[{ value: 'CONTRACT', label: 'عقد' }, { value: 'WARRANTY', label: 'ضمان' }, { value: 'PAID', label: 'مدفوعة' }]} /></div>; }
