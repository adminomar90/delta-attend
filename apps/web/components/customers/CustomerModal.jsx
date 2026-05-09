'use client';

import { useEffect, useState } from 'react';
import {
  createCustomerFormDefaults,
  customerStatusOptions,
  customerTypeOptions,
  emptyContactPerson,
  emptyFollowUp,
  emptySite,
  followUpStatusOptions,
  followUpTypeOptions,
} from '../../lib/customers';
import ContactActionBar from '../ContactActionBar';

const updateAt = (items, index, patch) => items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item));
const removeAt = (items, index) => items.filter((_, itemIndex) => itemIndex !== index);

export default function CustomerModal({ open, customer, saving, onClose, onSubmit }) {
  const [form, setForm] = useState(createCustomerFormDefaults());
  const [whatsappMessage, setWhatsappMessage] = useState('السلام عليكم، معكم شركة دلتا بلس بخصوص طلبكم.');
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');

  useEffect(() => {
    if (open) setForm(createCustomerFormDefaults(customer));
  }, [open, customer]);

  if (!open) return null;

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const fillCurrentLocation = () => {
    setLocationMessage('');
    if (!navigator?.geolocation) {
      setLocationMessage('المتصفح لا يدعم تحديد الموقع.');
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const mapUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
        setForm((prev) => ({ ...prev, mapUrl }));
        setLocationMessage('تم تحديد الموقع وإضافة رابط الخريطة.');
        setLocating(false);
      },
      () => {
        setLocationMessage('تعذر تحديد الموقع. تأكد من السماح للموقع من المتصفح.');
        setLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 60000,
      },
    );
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel customer-modal-panel" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>{customer?._id || customer?.id ? 'تعديل ملف الزبون' : 'إضافة زبون جديد'}</h3>
            <p className="daily-plan-modal-subtitle">ملف موحد للتواصل، المواقع، المسؤولين، والمتابعات.</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <form className="daily-plan-form" onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}>
          <div className="daily-plan-form-section">
            <div className="daily-plan-form-grid">
              <label>اسم الزبون / الشركة<input className="input" value={form.name} onChange={(e) => setField('name', e.target.value)} required /></label>
              <label>نوع الزبون<select className="select" value={form.customerType} onChange={(e) => setField('customerType', e.target.value)}>{customerTypeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>رقم الهاتف<input className="input" value={form.phone} onChange={(e) => setField('phone', e.target.value)} /></label>
              <label>رقم الواتساب<input className="input" value={form.whatsapp} onChange={(e) => setField('whatsapp', e.target.value)} /></label>
              <label>البريد الإلكتروني<input className="input" type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} /></label>
              <label>المحافظة<input className="input" value={form.province} onChange={(e) => setField('province', e.target.value)} /></label>
              <label className="grid-span-full">العنوان<input className="input" value={form.address} onChange={(e) => setField('address', e.target.value)} /></label>
              <label className="grid-span-full">
                رابط Google Maps
                <div className="customer-map-input-row">
                  <input className="input" value={form.mapUrl} onChange={(e) => setField('mapUrl', e.target.value)} />
                  <button className="btn btn-soft" type="button" onClick={fillCurrentLocation} disabled={locating}>
                    {locating ? 'جارٍ التحديد...' : 'إضافة الموقع'}
                  </button>
                </div>
                {locationMessage ? <small className="customer-location-message">{locationMessage}</small> : null}
              </label>
              <label>حالة الزبون<select className="select" value={form.status} onChange={(e) => setField('status', e.target.value)}>{customerStatusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="grid-span-full">ملاحظات عامة<textarea className="textarea" rows={3} value={form.notes} onChange={(e) => setField('notes', e.target.value)} /></label>
              <label className="grid-span-full">مرفقات الزبون<input className="input" type="file" multiple onChange={(e) => setField('attachments', Array.from(e.target.files || []))} /></label>
            </div>
          </div>

          <div className="customer-contact-box">
            <label className="grid-span-full">رسالة واتساب جاهزة<input className="input" value={whatsappMessage} onChange={(e) => setWhatsappMessage(e.target.value)} /></label>
            <ContactActionBar
              phone={form.phone}
              whatsapp={form.whatsapp || form.phone}
              mapUrl={form.mapUrl}
              address={form.address}
              whatsappMessage={whatsappMessage}
            />
          </div>

          <div className="daily-plan-form-section">
            <div className="customer-section-head">
              <h4>الأشخاص المسؤولون</h4>
              <button type="button" className="btn btn-soft btn-sm" onClick={() => setField('contactPersons', [...form.contactPersons, emptyContactPerson()])}>إضافة مسؤول</button>
            </div>
            <div className="customer-repeat-list">
              {form.contactPersons.map((person, index) => (
                <div className="customer-repeat-item" key={person._id || index}>
                  <div className="daily-plan-form-grid">
                    <label>الاسم<input className="input" value={person.name || ''} onChange={(e) => setField('contactPersons', updateAt(form.contactPersons, index, { name: e.target.value }))} /></label>
                    <label>المنصب<input className="input" value={person.position || ''} onChange={(e) => setField('contactPersons', updateAt(form.contactPersons, index, { position: e.target.value }))} /></label>
                    <label>الهاتف<input className="input" value={person.phone || ''} onChange={(e) => setField('contactPersons', updateAt(form.contactPersons, index, { phone: e.target.value }))} /></label>
                    <label>واتساب<input className="input" value={person.whatsapp || ''} onChange={(e) => setField('contactPersons', updateAt(form.contactPersons, index, { whatsapp: e.target.value }))} /></label>
                  </div>
                  <div className="customer-check-row">
                    <label><input type="checkbox" checked={!!person.isDecisionMaker} onChange={(e) => setField('contactPersons', updateAt(form.contactPersons, index, { isDecisionMaker: e.target.checked }))} /> صاحب قرار</label>
                    <label><input type="checkbox" checked={!!person.isTechnical} onChange={(e) => setField('contactPersons', updateAt(form.contactPersons, index, { isTechnical: e.target.checked }))} /> مسؤول فني</label>
                    <label><input type="checkbox" checked={!!person.isFinancial} onChange={(e) => setField('contactPersons', updateAt(form.contactPersons, index, { isFinancial: e.target.checked }))} /> مسؤول مالي</label>
                    <button type="button" className="btn btn-soft btn-sm" onClick={() => setField('contactPersons', removeAt(form.contactPersons, index))}>حذف</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="daily-plan-form-section">
            <div className="customer-section-head">
              <h4>المواقع والفروع</h4>
              <button type="button" className="btn btn-soft btn-sm" onClick={() => setField('sites', [...form.sites, emptySite()])}>إضافة موقع</button>
            </div>
            <div className="customer-repeat-list">
              {form.sites.map((site, index) => (
                <div className="customer-repeat-item" key={site._id || index}>
                  <div className="daily-plan-form-grid">
                    <label>اسم الموقع<input className="input" value={site.name || ''} onChange={(e) => setField('sites', updateAt(form.sites, index, { name: e.target.value }))} /></label>
                    <label>مسؤول الموقع<input className="input" value={site.managerName || ''} onChange={(e) => setField('sites', updateAt(form.sites, index, { managerName: e.target.value }))} /></label>
                    <label>رقم المسؤول<input className="input" value={site.managerPhone || ''} onChange={(e) => setField('sites', updateAt(form.sites, index, { managerPhone: e.target.value }))} /></label>
                    <label>رابط الخريطة<input className="input" value={site.mapUrl || ''} onChange={(e) => setField('sites', updateAt(form.sites, index, { mapUrl: e.target.value }))} /></label>
                    <label className="grid-span-full">العنوان<input className="input" value={site.address || ''} onChange={(e) => setField('sites', updateAt(form.sites, index, { address: e.target.value }))} /></label>
                    <label className="grid-span-full">ملاحظات<input className="input" value={site.notes || ''} onChange={(e) => setField('sites', updateAt(form.sites, index, { notes: e.target.value }))} /></label>
                  </div>
                  <button type="button" className="btn btn-soft btn-sm" onClick={() => setField('sites', removeAt(form.sites, index))}>حذف الموقع</button>
                </div>
              ))}
            </div>
          </div>

          <div className="daily-plan-form-section">
            <div className="customer-section-head">
              <h4>سجل المتابعات</h4>
              <button type="button" className="btn btn-soft btn-sm" onClick={() => setField('followUps', [emptyFollowUp(), ...form.followUps])}>إضافة متابعة</button>
            </div>
            <div className="customer-repeat-list">
              {form.followUps.map((followUp, index) => (
                <div className="customer-repeat-item" key={followUp._id || index}>
                  <div className="daily-plan-form-grid">
                    <label>نوع المتابعة<select className="select" value={followUp.type || 'CALL'} onChange={(e) => setField('followUps', updateAt(form.followUps, index, { type: e.target.value }))}>{followUpTypeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                    <label>الموظف المسؤول<input className="input" value={followUp.employeeName || ''} onChange={(e) => setField('followUps', updateAt(form.followUps, index, { employeeName: e.target.value }))} /></label>
                    <label>تاريخ المتابعة القادمة<input className="input" type="date" value={(followUp.nextFollowUpAt || '').slice(0, 10)} onChange={(e) => setField('followUps', updateAt(form.followUps, index, { nextFollowUpAt: e.target.value }))} /></label>
                    <label>حالة المتابعة<select className="select" value={followUp.status || 'OPEN'} onChange={(e) => setField('followUps', updateAt(form.followUps, index, { status: e.target.value }))}>{followUpStatusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                    <label className="grid-span-full">الملاحظة<textarea className="textarea" rows={2} value={followUp.note || ''} onChange={(e) => setField('followUps', updateAt(form.followUps, index, { note: e.target.value }))} /></label>
                  </div>
                  <button type="button" className="btn btn-soft btn-sm" onClick={() => setField('followUps', removeAt(form.followUps, index))}>حذف المتابعة</button>
                </div>
              ))}
            </div>
          </div>

          <div className="maintenance-modal-actions">
            <button type="button" className="btn btn-soft" onClick={onClose}>إلغاء</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'حفظ ملف الزبون'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
