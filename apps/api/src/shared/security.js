import crypto from 'crypto';
import { env } from '../config/env.js';

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

const buildAesKey = () =>
  crypto.createHash('sha256').update(String(env.networkSecretKey || env.jwtSecret || 'network-secret')).digest();

export const encryptSensitiveValue = (value = '') => {
  const plainText = String(value || '');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', buildAesKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    keyVersion: 1,
  };
};

export const decryptSensitiveValue = (payload = {}) => {
  if (!payload?.ciphertext || !payload?.iv || !payload?.authTag) {
    return '';
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    buildAesKey(),
    Buffer.from(payload.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]);

  return plaintext.toString('utf8');
};
