'use client';

import { useEffect } from 'react';

export default function Error({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: '1rem',
        fontFamily: 'sans-serif',
        direction: 'rtl',
      }}
    >
      <h2 style={{ fontSize: '1.5rem', color: '#dc2626' }}>حدث خطأ غير متوقع</h2>
      <p style={{ color: '#6b7280' }}>{error?.message || 'يرجى المحاولة مجدداً'}</p>
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
    </div>
  );
}
