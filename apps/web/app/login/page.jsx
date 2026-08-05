'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { authStorage } from '../../lib/auth';
import { useAuth } from '../../lib/AuthContext';

export default function LoginPage() {
  const router = useRouter();
  const { login: ctxLogin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpToken, setOtpToken] = useState('');
  const [otpRequired, setOtpRequired] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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
      ctxLogin(payload);
      
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
    <div className="auth-page">
      <section className="auth-layout">
        <form onSubmit={onSubmit} className="auth-form">
          <div className="auth-form-heading">
            <span className="auth-form-kicker">Delta Plus ERP</span>
            <h2>تسجيل الدخول</h2>
            <p>أدخل بيانات حسابك للوصول إلى نظام Delta Plus ERP</p>
          </div>

          <label className="auth-field">
            <span>البريد الإلكتروني</span>
            <div className="auth-input-wrap">
              <span className="auth-input-icon" aria-hidden="true">✉</span>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={otpRequired} autoComplete="email" />
            </div>
          </label>

          <label className="auth-field">
            <span>كلمة المرور</span>
            <div className="auth-input-wrap">
              <span className="auth-input-icon" aria-hidden="true">⌕</span>
              <input className="input" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required disabled={otpRequired} autoComplete="current-password" />
              <button className="auth-password-toggle" type="button" onClick={() => setShowPassword((value) => !value)} disabled={otpRequired} aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}>
                {showPassword ? 'إخفاء' : 'إظهار'}
              </button>
            </div>
          </label>

          {otpRequired ? (
            <label className="auth-field">
              <span>رمز التحقق</span>
              <div className="auth-input-wrap">
                <span className="auth-input-icon" aria-hidden="true">●</span>
                <input className="input" value={otpCode} onChange={(e) => setOtpCode(e.target.value)} required inputMode="numeric" />
              </div>
            </label>
          ) : null}

          {error ? <p className="auth-error">{error}</p> : null}

          <button className="btn btn-primary auth-submit" type="submit" disabled={loading}>
            <span>{loading ? 'جارٍ الدخول...' : otpRequired ? 'تأكيد التحقق' : 'تسجيل الدخول'}</span>
            {loading ? <span className="auth-loader" aria-hidden="true" /> : null}
          </button>
        </form>

        <div className="auth-hero">
          <div className="auth-brand">
            <img
              src="/brand/delta-logo-transparent.png"
              alt="Delta Plus for Technical Solutions"
              className="auth-logo-wide"
            />
            <span>Delta Plus ERP</span>
          </div>
          <h1 className="auth-title">نظام متكامل لإدارة أعمال الشركة</h1>
          <p className="auth-copy">
            منصة مركزية تجمع إدارة المشاريع، الموارد البشرية، الحسابات، المخازن، المشتريات، المبيعات، العملاء، الصيانة، الأصول، الموافقات والتقارير التشغيلية ضمن نظام واحد.
          </p>
          <div className="auth-feature-grid">
            <article><span>▣</span><strong>المشاريع والمهام</strong></article>
            <article><span>◴</span><strong>الموظفون والحضور</strong></article>
            <article><span>▥</span><strong>المالية والمخازن</strong></article>
            <article><span>◎</span><strong>الموافقات والتقارير</strong></article>
          </div>
          <p className="auth-footer-line">بيانات مركزية — صلاحيات دقيقة — تقارير فورية — إدارة متكاملة</p>
        </div>
      </section>
    </div>
  );
}
