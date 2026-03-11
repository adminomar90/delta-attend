'use client';

import { useEffect } from 'react';

export default function DashboardError({ error, reset }) {
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
        minHeight: '60vh',
        gap: '1rem',
        direction: 'rtl',
      }}
    >
      <h2 style={{ fontSize: '1.25rem', color: '#dc2626' }}>حدث خطأ</h2>
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
