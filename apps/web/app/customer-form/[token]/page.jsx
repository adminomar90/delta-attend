'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

const resolveApiUrl = () => {
  if (typeof window === 'undefined') return configuredApiUrl;
  try {
    const url = new URL(configuredApiUrl);
    const openedFromNetwork = !['localhost', '127.0.0.1'].includes(window.location.hostname);
    if (openedFromNetwork && ['localhost', '127.0.0.1'].includes(url.hostname)) {
      url.hostname = window.location.hostname;
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return configuredApiUrl.replace(/\/$/, '');
  }
};

const typeOptions = [
  ['INDIVIDUAL', 'فرد'],
  ['COMPANY', 'شركة'],
  ['INSTITUTION', 'مؤسسة'],
  ['GOVERNMENT', 'دائرة حكومية'],
];

const initialForm = {
  customerName: '',
  customerType: 'COMPANY',
  responsibleName: '',
  position: '',
  phone: '',
  whatsapp: '',
  email: '',
  province: '',
  city: '',
  address: '',
  mapUrl: '',
  requestedService: '',
  notes: '',
  attachments: [],
};

const requestJson = async (url, options = {}) => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      ...options,
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || 'تعذر الاتصال بالخادم');
    return payload;
  } finally {
    window.clearTimeout(timeout);
  }
};

export default function CustomerFormPage() {
  const params = useParams();
  const token = typeof params?.token === 'string' ? params.token : '';
  const apiUrl = useMemo(() => resolveApiUrl(), []);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [request, setRequest] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!token) {
        setError('رابط الاستمارة غير صحيح.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');
      try {
        const payload = await requestJson(`${apiUrl}/customer-forms/public/${token}`);
        setRequest(payload.request || null);
      } catch (err) {
        setError(err.name === 'AbortError' ? 'انتهت مهلة الاتصال بالخادم. تأكد من تشغيل السيرفر.' : err.message || 'تعذر فتح رابط الاستمارة');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [apiUrl, token]);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

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
        update('mapUrl', `https://www.google.com/maps?q=${latitude},${longitude}`);
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

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const formData = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        if (key !== 'attachments') formData.append(key, value || '');
      });
      Array.from(form.attachments || []).forEach((file) => formData.append('attachments', file));

      await requestJson(`${apiUrl}/customer-forms/public/${token}`, {
        method: 'POST',
        body: formData,
      });
      setSuccess('تم إرسال المعلومات بنجاح. سيتم مراجعتها من قبل الإدارة.');
    } catch (err) {
      setError(err.name === 'AbortError' ? 'انتهت مهلة الإرسال. حاول مرة أخرى.' : err.message || 'تعذر إرسال الاستمارة');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="customer-public-page" dir="rtl">
        <section className="customer-public-card customer-public-loading">جاري تحميل الاستمارة...</section>
      </main>
    );
  }

  return (
    <main className="customer-public-page" dir="rtl">
      <section className="customer-public-hero">
        <img src="/brand/delta-plus-logo.png" alt="Delta Plus" />
        <h1>استمارة معلومات الزبون</h1>
        <p>يرجى ملء المعلومات بدقة حتى يتمكن فريق Delta Plus من مراجعة الطلب والتواصل معكم.</p>
      </section>

      <section className="customer-public-card">
        {error ? <p className="customer-public-error">{error}</p> : null}
        {success ? <p className="customer-public-success">{success}</p> : null}

        {!success && request ? (
          <form onSubmit={submit} className="customer-public-form">
            <label>اسم الزبون / اسم الشركة<input required value={form.customerName} onChange={(e) => update('customerName', e.target.value)} /></label>
            <label>نوع الزبون<select value={form.customerType} onChange={(e) => update('customerType', e.target.value)}>{typeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>اسم الشخص المسؤول<input value={form.responsibleName} onChange={(e) => update('responsibleName', e.target.value)} /></label>
            <label>المنصب<input value={form.position} onChange={(e) => update('position', e.target.value)} /></label>
            <label>رقم الهاتف<input required inputMode="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} /></label>
            <label>رقم الواتساب<input inputMode="tel" value={form.whatsapp} onChange={(e) => update('whatsapp', e.target.value)} /></label>
            <label>البريد الإلكتروني<input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} /></label>
            <label>المحافظة<input value={form.province} onChange={(e) => update('province', e.target.value)} /></label>
            <label>المدينة / المنطقة<input value={form.city} onChange={(e) => update('city', e.target.value)} /></label>
            <label className="customer-public-wide">العنوان التفصيلي<textarea rows={3} value={form.address} onChange={(e) => update('address', e.target.value)} /></label>
            <label className="customer-public-wide">
              رابط الموقع على Google Maps
              <div className="customer-public-map-row">
                <input value={form.mapUrl} onChange={(e) => update('mapUrl', e.target.value)} />
                <button type="button" onClick={fillCurrentLocation} disabled={locating}>
                  {locating ? 'جار التحديد...' : 'تحديد موقعي'}
                </button>
              </div>
              {locationMessage ? <small className="customer-public-location-message">{locationMessage}</small> : null}
            </label>
            <label className="customer-public-wide">نوع الخدمة المطلوبة<input value={form.requestedService} onChange={(e) => update('requestedService', e.target.value)} /></label>
            <label className="customer-public-wide">ملاحظات إضافية<textarea rows={4} value={form.notes} onChange={(e) => update('notes', e.target.value)} /></label>
            <label className="customer-public-wide">المرفقات أو الصور<input type="file" multiple onChange={(e) => update('attachments', e.target.files)} /></label>
            <button type="submit" disabled={submitting}>{submitting ? 'جاري الإرسال...' : 'إرسال المعلومات'}</button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
