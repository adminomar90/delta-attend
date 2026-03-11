import crypto from 'crypto';

export const validatePasswordStrength = (password = '') => {
  const value = String(password);
  const rules = [
    { ok: value.length >= 8, reason: 'at least 8 characters' },
    { ok: /[A-Z]/.test(value), reason: 'one uppercase letter' },
    { ok: /[a-z]/.test(value), reason: 'one lowercase letter' },
    { ok: /[0-9]/.test(value), reason: 'one number' },
    { ok: /[^A-Za-z0-9]/.test(value), reason: 'one special character' },
  ];

  const failures = rules.filter((rule) => !rule.ok).map((rule) => rule.reason);

  return {
    valid: failures.length === 0,
    failures,
  };
};

export const generateOtpCode = () => String(Math.floor(100000 + Math.random() * 900000));

export const hashOtp = (otp) => crypto.createHash('sha256').update(String(otp)).digest('hex');
