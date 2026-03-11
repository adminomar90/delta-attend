'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          gap: '1rem',
          fontFamily: 'sans-serif',
          margin: 0,
          backgroundColor: '#f9fafb',
        }}
      >
        <h2 style={{ fontSize: '1.5rem', color: '#dc2626' }}>خطأ عام في التطبيق</h2>
        <p style={{ color: '#6b7280' }}>{error?.message || 'يرجى تحديث الصفحة'}</p>
        <button
          onClick={reset}
          style={{
            padding: '0.5rem 1.5rem',
            backgroundColor: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
          }}
        >
          إعادة المحاولة
        </button>
      </body>
    </html>
  );
}
