'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import { authStorage } from '../../../lib/auth';

export default function GoalsPage() {
  const [goals, setGoals] = useState([]);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    userId: '',
    title: '',
    period: 'DAILY',
    targetPoints: 50,
    startDate: '',
    endDate: '',
  });

  const user = authStorage.getUser();

  const canCreateForOthers = useMemo(() => {
    const allowed = ['GENERAL_MANAGER', 'PROJECT_MANAGER', 'ASSISTANT_PROJECT_MANAGER', 'TEAM_LEAD'];
    return allowed.includes(user?.role);
  }, [user?.role]);

  const load = async () => {
    try {
      const [goalsRes, usersRes] = await Promise.all([
        api.get('/goals'),
        api.get('/auth/users').catch(() => ({ users: [] })),
      ]);

      setGoals(goalsRes.goals || []);
      setUsers(usersRes.users || []);
    } catch (err) {
      setError(err.message || 'تعذر تحميل الأهداف');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const createGoal = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      const payload = {
        title: form.title,
        period: form.period,
        targetPoints: Number(form.targetPoints),
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
      };

      if (canCreateForOthers && form.userId) {
        payload.userId = form.userId;
      }

      await api.post('/goals', payload);
      setForm({
        userId: '',
        title: '',
        period: 'DAILY',
        targetPoints: 50,
        startDate: '',
        endDate: '',
      });
      await load();
    } catch (err) {
      setError(err.message || 'فشل إنشاء الهدف');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {error ? <section className="card section" style={{ color: 'var(--danger)' }}>{error}</section> : null}

      <section className="card section" style={{ marginBottom: 16 }}>
        <h2>إنشاء هدف جديد</h2>
        <form className="grid-3" onSubmit={createGoal}>
          {canCreateForOthers ? (
            <label>
              الموظف
              <select className="select" value={form.userId} onChange={(e) => setForm((p) => ({ ...p, userId: e.target.value }))}>
                <option value="">أنا</option>
                {users.map((item) => (
                  <option key={item._id} value={item._id}>{item.fullName}</option>
                ))}
              </select>
            </label>
          ) : null}

          <label>
            العنوان
            <input className="input" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} required />
          </label>

          <label>
            الفترة
            <select className="select" value={form.period} onChange={(e) => setForm((p) => ({ ...p, period: e.target.value }))}>
              <option value="DAILY">يومي</option>
              <option value="WEEKLY">أسبوعي</option>
              <option value="MONTHLY">شهري</option>
            </select>
          </label>

          <label>
            النقاط المستهدفة
            <input className="input" type="number" min={10} value={form.targetPoints} onChange={(e) => setForm((p) => ({ ...p, targetPoints: e.target.value }))} />
          </label>

          <label>
            البداية
            <input className="input" type="date" value={form.startDate} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} />
          </label>

          <label>
            النهاية
            <input className="input" type="date" value={form.endDate} onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))} />
          </label>

          <div>
            <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'حفظ الهدف'}</button>
          </div>
        </form>
      </section>

      <section className="card section">
        <h2>متابعة الأهداف</h2>
        <table className="table">
          <thead>
            <tr>
              <th>الموظف</th>
              <th>العنوان</th>
              <th>الفترة</th>
              <th>التقدّم</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {goals.map((goal) => {
              const ratio = Math.min(100, Math.round((goal.currentPoints / Math.max(1, goal.targetPoints)) * 100));

              return (
                <tr key={goal._id}>
                  <td>{goal.user?.fullName || '-'}</td>
                  <td>{goal.title}</td>
                  <td>{goal.period}</td>
                  <td>
                    <div className="progress" style={{ marginBottom: 6 }}><span style={{ width: `${ratio}%` }} /></div>
                    <small>{goal.currentPoints}/{goal.targetPoints}</small>
                  </td>
                  <td>
                    <span className={`status-pill ${goal.achieved ? 'status-approved' : 'status-inprogress'}`}>
                      {goal.achieved ? 'متحقق' : 'قيد المتابعة'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}
