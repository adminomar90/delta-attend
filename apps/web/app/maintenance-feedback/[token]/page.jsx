'use client';

import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

const projectTypeOptions = [
  ['COMMERCIAL', 'تجاري'],
  ['RESIDENTIAL', 'سكني'],
  ['GOVERNMENTAL', 'حكومي'],
];

function StarRating({ value, onChange, label }) {
  return (
    <div>
      <div style={{ marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: 30,
              cursor: 'pointer',
              color: star <= value ? '#f59e0b' : '#cbd5e1',
            }}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}

export default function MaintenanceFeedbackPage({ params }) {
  const token = params?.token || '';
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [report, setReport] = useState(null);
  const [form, setForm] = useState({
    customerName: '',
    projectType: 'COMMERCIAL',
    companyRating: 0,
    employeeRating: 0,
    notes: '',
    suggestions: '',
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`${API_URL}/maintenance-reports/public/feedback/${token}`, {
          cache: 'no-store',
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.message || 'تعذر تحميل رابط التقييم');
        }
        setReport(payload.report || null);
        setForm((current) => ({
          ...current,
          customerName: payload.report?.customerName || '',
        }));
      } catch (err) {
        setError(err.message || 'تعذر تحميل رابط التقييم');
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      load();
    }
  }, [token]);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch(`${API_URL}/maintenance-reports/public/feedback/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || 'تعذر إرسال التقييم');
      }
      setSuccess('تم إرسال التقييم بنجاح. شكرًا لتعاونكم.');
    } catch (err) {
      setError(err.message || 'تعذر إرسال التقييم');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f8fafc' }}>جارٍ تحميل صفحة التقييم...</main>;
  }

  return (
    <main style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 28%, #f8fafc 28%, #f8fafc 100%)', padding: '24px 16px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <section style={{ textAlign: 'center', color: '#fff', marginBottom: 24 }}>
          <img src="/brand/delta-plus-logo.png" alt="Delta Plus" style={{ width: 92, height: 92, objectFit: 'contain' }} />
          <h1 style={{ marginBottom: 8 }}>نظام تقييم الخدمة</h1>
          <p style={{ margin: 0, color: '#cbd5e1' }}>يهدف هذا التقييم إلى تحسين جودة الخدمة ورفع مستوى رضا الزبائن عن خدمات شركة دلتا بلس للحلول التقنية.</p>
        </section>

        <section className="card section" style={{ background: '#fff', borderRadius: 24 }}>
          {error ? <p style={{ color: '#dc2626' }}>{error}</p> : null}
          {success ? <p style={{ color: '#0f766e' }}>{success}</p> : null}

          {report ? (
            <div style={{ marginBottom: 18, color: '#475569' }}>
              <div>رقم الطلب: {report.requestNo}</div>
              <div>الزبون: {report.customerName}</div>
              <div>الموقع: {report.siteLocation}</div>
              <div>رقم المشروع: {report.projectNumber}</div>
              <div>الفني: {report.technicianName || '-'}</div>
            </div>
          ) : null}

          {!success ? (
            <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
              <label>
                اسم الزبون
                <input className="input" value={form.customerName} onChange={(e) => setForm((current) => ({ ...current, customerName: e.target.value }))} />
              </label>

              <label>
                نوع المشروع
                <select className="select" value={form.projectType} onChange={(e) => setForm((current) => ({ ...current, projectType: e.target.value }))}>
                  {projectTypeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>

              <StarRating label="تقييم الشركة من 5 نجوم" value={form.companyRating} onChange={(companyRating) => setForm((current) => ({ ...current, companyRating }))} />
              <StarRating label="تقييم الموظف من 5 نجوم" value={form.employeeRating} onChange={(employeeRating) => setForm((current) => ({ ...current, employeeRating }))} />

              <label>
                الملاحظات
                <textarea className="input" rows={4} value={form.notes} onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))} />
              </label>

              <label>
                الاقتراحات
                <textarea className="input" rows={4} value={form.suggestions} onChange={(e) => setForm((current) => ({ ...current, suggestions: e.target.value }))} />
              </label>

              <button className="btn btn-primary" type="submit" disabled={submitting || !form.companyRating || !form.employeeRating}>
                {submitting ? 'جارٍ الإرسال...' : 'إرسال التقييم'}
              </button>
            </form>
          ) : null}

          <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #e2e8f0', color: '#475569' }}>
            <strong>معلومات التواصل مع الشركة</strong>
            <div style={{ marginTop: 8 }}>الهاتف: 07721661664</div>
            <div>البريد الإلكتروني: info@deltaplus-iq.com</div>
          </div>
        </section>
      </div>
    </main>
  );
}
