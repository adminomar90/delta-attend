'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { authStorage } from '../../lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpToken, setOtpToken] = useState('');
  const [otpRequired, setOtpRequired] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!email || !password) {
        setError('البريد الإلكتروني وكلمة المرور مطلوبة');
        setLoading(false);
        return;
      }

      const payload = otpRequired
        ? await api.post('/auth/verify-otp', { otpToken, code: otpCode })
        : await api.post('/auth/login', { email, password });

      if (!payload) {
        setError('فشل في الحصول على الرد من الخادم');
        setLoading(false);
        return;
      }

      if (payload.requiresOtp) {
        setOtpRequired(true);
        setOtpToken(payload.otpToken);
        setError('');
        setLoading(false);
        return;
      }

      if (!payload.token || !payload.user) {
        setError('بيانات غير صحيحة من الخادم');
        setLoading(false);
        return;
      }

      authStorage.setToken(payload.token);
      authStorage.setUser(payload.user);
      
      // Ensure data is saved before redirecting
      setTimeout(() => {
        router.push('/dashboard');
      }, 100);
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'فشل تسجيل الدخول');
      setLoading(false);
    }
  };

  return (
    <div className="container" style={{ padding: '34px 0' }}>
      <section className="card auth-layout">
        <div style={{ padding: 28, background: 'linear-gradient(150deg, #081229, #1b3567)', color: '#fff' }}>
          <img
            src="/brand/delta-plus-logo.png"
            alt="Delta Plus"
            style={{ width: 86, height: 86, objectFit: 'contain', filter: 'brightness(0) invert(1)', marginBottom: 12 }}
          />
          <span className="badge" style={{ background: 'rgba(196,215,67,0.2)', color: '#e7f28c' }}>Delta Plus Internal</span>
          <h1 style={{ fontSize: 42, margin: '16px 0 10px' }}>إدارة عمل محفزة وعادلة</h1>
          <p style={{ lineHeight: 1.9, opacity: 0.92 }}>
            منصة داخلية تجمع إدارة المهام، التقييم، النقاط، المستويات، الشارات، والتقارير التشغيلية في تجربة عربية كاملة.
          </p>
          <ul style={{ lineHeight: 2 }}>
            <li>توزيع مهام ذكي من المدير إلى الموظف</li>
            <li>نقاط تُحتسب بعد الاعتماد وفق قواعد عادلة</li>
            <li>لوحات تحكم فورية وسجل تدقيق شامل</li>
          </ul>
        </div>

        <form onSubmit={onSubmit} style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 14, justifyContent: 'center' }}>
          <h2 style={{ margin: 0 }}>تسجيل الدخول</h2>
          <p style={{ marginTop: 4, color: 'var(--text-soft)' }}>ادخل بيانات الحساب للوصول إلى لوحة Delta Plus</p>

          <label>
            البريد الإلكتروني
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={otpRequired} />
          </label>

          <label>
            كلمة المرور
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={otpRequired} />
          </label>

          {otpRequired ? (
            <label>
              رمز التحقق (OTP)
              <input className="input" value={otpCode} onChange={(e) => setOtpCode(e.target.value)} required />
            </label>
          ) : null}

          {error ? <p style={{ color: 'var(--danger)', margin: 0 }}>{error}</p> : null}

          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'جارٍ الدخول...' : otpRequired ? 'تأكيد التحقق' : 'دخول'}
          </button>

          <small style={{ color: 'var(--text-soft)' }}>
            في أول تشغيل بعد التفريغ: أنشئ حساب المدير العام عبر endpoint الإعداد ثم سجّل الدخول.
          </small>
        </form>
      </section>
    </div>
  );
}


