'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';

export default function LeaderboardPage() {
  const [period, setPeriod] = useState('monthly');
  const [data, setData] = useState([]);
  const [error, setError] = useState('');

  const load = async (p) => {
    try {
      const response = await api.get(`/gamification/leaderboard?period=${p}&limit=20`);
      setData(response.leaderboard || []);
    } catch (err) {
      setError(err.message || 'تعذر تحميل لوحة الصدارة');
    }
  };

  useEffect(() => {
    load(period);
  }, [period]);

  return (
    <section className="card section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>لوحة الصدارة</h2>
        <select className="select" style={{ width: 180 }} value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="daily">يومي</option>
          <option value="weekly">أسبوعي</option>
          <option value="monthly">شهري</option>
        </select>
      </div>

      {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}

      <table className="table">
        <thead>
          <tr>
            <th>الترتيب</th>
            <th>الموظف</th>
            <th>الدور</th>
            <th>المستوى</th>
            <th>النقاط</th>
            <th>الشارات</th>
          </tr>
        </thead>
        <tbody>
          {data.map((entry) => (
            <tr key={String(entry.userId)}>
              <td>
                <strong style={{ color: entry.rank <= 3 ? 'var(--accent)' : 'inherit' }}>#{entry.rank}</strong>
              </td>
              <td>{entry.fullName}</td>
              <td>{entry.role}</td>
              <td>{entry.level}</td>
              <td>{entry.points}</td>
              <td>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(entry.badges || []).length ? entry.badges.map((badge) => <span key={badge} className="badge">{badge}</span>) : '-'}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
