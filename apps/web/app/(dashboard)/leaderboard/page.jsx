'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { authStorage } from '../../../lib/auth';
import { Permission, hasPermission } from '../../../lib/permissions';

export default function LeaderboardPage() {
  const currentUser = authStorage.getUser();
  const [period, setPeriod] = useState('monthly');
  const [data, setData] = useState([]);
  const [error, setError] = useState('');
  const canViewLeaderboard = hasPermission(currentUser, Permission.VIEW_LEADERBOARD);
  const scopeLabel = currentUser?.role === 'GENERAL_MANAGER'
    ? 'مستوى الشركة'
    : ['PROJECT_MANAGER', 'ASSISTANT_PROJECT_MANAGER', 'TEAM_LEAD'].includes(currentUser?.role)
      ? 'مستوى الفريق/الإدارة'
      : 'مستواك الشخصي';

  const load = async (p) => {
    if (!canViewLeaderboard) {
      setData([]);
      return;
    }

    try {
      setError('');
      const response = await api.get(`/gamification/leaderboard?period=${p}&limit=20`);
      setData(response.leaderboard || []);
    } catch (err) {
      setError(err.message || 'تعذر تحميل لوحة الصدارة');
    }
  };

  useEffect(() => {
    load(period);
  }, [period, canViewLeaderboard]);

  if (!canViewLeaderboard) {
    return (
      <section className="card section" style={{ color: 'var(--text-soft)' }}>
        لا تملك صلاحية عرض لوحة الصدارة.
      </section>
    );
  }

  return (
    <section className="card section">
      <div className="section-header">
        <div>
          <h2 style={{ marginBottom: 6 }}>لوحة الصدارة</h2>
          <p style={{ margin: 0, color: 'var(--text-soft)' }}>النطاق الحالي: {scopeLabel}</p>
        </div>
        <select className="select select-compact" value={period} onChange={(e) => setPeriod(e.target.value)}>
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
