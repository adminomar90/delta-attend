'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';

export default function AuditLogPage() {
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const response = await api.get('/audit-logs?limit=150');
        setLogs(response.logs || []);
      } catch (err) {
        setError(err.message || 'لا تملك صلاحية عرض سجل التدقيق أو حدث خطأ في التحميل');
      }
    };

    load();
  }, []);

  return (
    <section className="card section">
      <h2>سجل التدقيق Audit Log</h2>
      {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}

      {!error ? (
        <table className="table">
          <thead>
            <tr>
              <th>الوقت</th>
              <th>المنفذ</th>
              <th>الإجراء</th>
              <th>الكيان</th>
              <th>المعرّف</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log._id}>
                <td>{new Date(log.createdAt).toLocaleString('ar-IQ')}</td>
                <td>{log.actor?.fullName || '-'}</td>
                <td>{log.action}</td>
                <td>{log.entityType}</td>
                <td>{log.entityId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
