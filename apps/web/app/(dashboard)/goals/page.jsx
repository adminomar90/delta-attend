'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import { authStorage } from '../../../lib/auth';

const emptyForm = {
  id: '',
  userId: '',
  title: '',
  description: '',
  targetPoints: 100,
  targetLevel: 2,
  startDate: '',
  endDate: '',
};

const statusLabelMap = {
  ACTIVE: 'نشط',
  ACHIEVED: 'متحقق',
  EXPIRED: 'منتهي',
  CANCELLED: 'محذوف',
};

const statusClassMap = {
  ACTIVE: 'status-inprogress',
  ACHIEVED: 'status-approved',
  EXPIRED: 'status-rejected',
  CANCELLED: 'status-rejected',
};

export default function GoalsPage() {
  const currentUser = authStorage.getUser();
  const isGeneralManager = currentUser?.role === 'GENERAL_MANAGER';
  const [goals, setGoals] = useState([]);
  const [users, setUsers] = useState([]);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);

  const selectedEmployee = useMemo(() => {
    return users.find((item) => String(item._id || item.id) === String(form.userId || '')) || null;
  }, [users, form.userId]);

  const currentGoal = useMemo(() => {
    return goals.find((goal) => goal.status === 'ACTIVE' && !goal.ended) || goals.find((goal) => goal.status === 'ACTIVE') || null;
  }, [goals]);

  const load = async () => {
    setLoading(true);
    setError('');

    try {
      const requests = [api.get('/goals')];

      if (isGeneralManager) {
        requests.push(api.get('/goals/summary'));
        requests.push(api.get('/auth/users?allUsers=1').catch(() => ({ users: [] })));
      }

      const responses = await Promise.all(requests);
      setGoals(responses[0].goals || []);

      if (isGeneralManager) {
        setSummary(responses[1] || null);
        setUsers((responses[2]?.users || []).filter((item) => item?.active));
      } else {
        setSummary(null);
        setUsers([]);
      }
    } catch (err) {
      setError(err.message || 'تعذر تحميل الأهداف');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
  };

  const handleEmployeeChange = (value) => {
    const nextEmployee = users.find((item) => String(item._id || item.id) === String(value || ''));
    setForm((current) => ({
      ...current,
      userId: value,
      targetLevel: Math.max(Number(current.targetLevel || 1), Number(nextEmployee?.level || 1) + 1),
    }));
  };

  const submitGoal = async (event) => {
    event.preventDefault();
    if (!isGeneralManager) {
      return;
    }

    setSaving(true);
    setError('');

    try {
      const payload = {
        userId: form.userId,
        title: form.title,
        description: form.description || undefined,
        targetPoints: Number(form.targetPoints),
        targetLevel: Number(form.targetLevel),
        startDate: form.startDate,
        endDate: form.endDate,
      };

      if (form.id) {
        await api.patch(`/goals/${form.id}`, payload);
      } else {
        await api.post('/goals', payload);
      }

      resetForm();
      await load();
    } catch (err) {
      setError(err.message || 'فشل حفظ الهدف');
    } finally {
      setSaving(false);
    }
  };

  const beginEdit = (goal) => {
    setForm({
      id: goal.id || goal._id,
      userId: goal.user?.id || goal.user?._id || '',
      title: goal.title || '',
      description: goal.description || '',
      targetPoints: goal.targetPoints || 100,
      targetLevel: goal.targetLevel || (goal.currentLevel || 1) + 1,
      startDate: goal.startDate ? String(goal.startDate).slice(0, 10) : '',
      endDate: goal.endDate ? String(goal.endDate).slice(0, 10) : '',
    });
  };

  const removeGoal = async (goal) => {
    const confirmed = window.confirm(`هل تريد حذف الهدف "${goal.title}"؟`);
    if (!confirmed) {
      return;
    }

    setSaving(true);
    setError('');

    try {
      await api.delete(`/goals/${goal.id || goal._id}`);
      if (String(form.id) === String(goal.id || goal._id)) {
        resetForm();
      }
      await load();
    } catch (err) {
      setError(err.message || 'فشل حذف الهدف');
    } finally {
      setSaving(false);
    }
  };

  const renderGoalProgress = (goal) => (
    <>
      <div className="progress" style={{ marginBottom: 6 }}>
        <span style={{ width: `${Math.min(100, goal.progressPercent || 0)}%` }} />
      </div>
      <small>{goal.currentPoints}/{goal.targetPoints} نقطة - {goal.progressPercent}%</small>
    </>
  );

  if (loading) {
    return <section className="card section">جارٍ تحميل الأهداف...</section>;
  }

  return (
    <>
      {error ? <section className="card section" style={{ color: 'var(--danger)' }}>{error}</section> : null}

      {isGeneralManager ? (
        <>
          {summary ? (
            <section className="grid-4" style={{ marginBottom: 16 }}>
              <article className="card section"><p style={{ marginTop: 0, color: 'var(--text-soft)' }}>إجمالي الأهداف</p><h2>{summary.summary?.total || 0}</h2></article>
              <article className="card section"><p style={{ marginTop: 0, color: 'var(--text-soft)' }}>الأهداف النشطة</p><h2>{summary.summary?.active || 0}</h2></article>
              <article className="card section"><p style={{ marginTop: 0, color: 'var(--text-soft)' }}>الأهداف المتحققة</p><h2>{summary.summary?.achieved || 0}</h2></article>
              <article className="card section"><p style={{ marginTop: 0, color: 'var(--text-soft)' }}>متوسط التقدم</p><h2>{summary.summary?.averageProgressPercent || 0}%</h2></article>
            </section>
          ) : null}

          <section className="card section" style={{ marginBottom: 16 }}>
            <h2>{form.id ? 'تعديل الهدف' : 'إضافة هدف جديد'}</h2>
            <form className="grid-3" onSubmit={submitGoal}>
              <label>
                الموظف
                <select className="select" value={form.userId} onChange={(e) => handleEmployeeChange(e.target.value)} required>
                  <option value="">اختر الموظف</option>
                  {users.map((item) => (
                    <option key={item._id || item.id} value={item._id || item.id}>
                      {item.fullName} {item.employeeCode ? `(${item.employeeCode})` : ''}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                اسم الهدف
                <input className="input" value={form.title} onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))} required />
              </label>

              <label>
                النقاط المطلوبة
                <input className="input" type="number" min={10} value={form.targetPoints} onChange={(e) => setForm((current) => ({ ...current, targetPoints: e.target.value }))} required />
              </label>

              <label>
                المستوى المستهدف
                <input className="input" type="number" min={Math.max(2, Number(selectedEmployee?.level || 1) + 1)} value={form.targetLevel} onChange={(e) => setForm((current) => ({ ...current, targetLevel: e.target.value }))} required />
              </label>

              <label>
                تاريخ البداية
                <input className="input" type="date" value={form.startDate} onChange={(e) => setForm((current) => ({ ...current, startDate: e.target.value }))} required />
              </label>

              <label>
                تاريخ النهاية
                <input className="input" type="date" value={form.endDate} onChange={(e) => setForm((current) => ({ ...current, endDate: e.target.value }))} required />
              </label>

              <label style={{ gridColumn: '1 / -1' }}>
                وصف الهدف
                <textarea className="input" rows={3} value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} placeholder="وصف اختياري للهدف" />
              </label>

              <div className="form-actions">
                <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'جارٍ الحفظ...' : form.id ? 'حفظ التعديلات' : 'إضافة الهدف'}</button>
                {form.id ? <button className="btn btn-soft" type="button" onClick={resetForm} disabled={saving}>إلغاء</button> : null}
              </div>
            </form>
          </section>

          {summary ? (
            <section className="split" style={{ marginBottom: 16 }}>
              <article className="card section">
                <h2>الأعلى تقدمًا</h2>
                <table className="table">
                  <thead>
                    <tr>
                      <th>الموظف</th>
                      <th>الهدف</th>
                      <th>التقدم</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(summary.activeGoals || []).map((goal) => (
                      <tr key={goal.id || goal._id}>
                        <td>{goal.user?.fullName || '-'}</td>
                        <td>{goal.title}</td>
                        <td>{renderGoalProgress(goal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </article>

              <article className="card section">
                <h2>المتجاوزون للأهداف</h2>
                <table className="table">
                  <thead>
                    <tr>
                      <th>الموظف</th>
                      <th>الهدف</th>
                      <th>الفائض</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(summary.overachievers || []).map((goal) => (
                      <tr key={goal.id || goal._id}>
                        <td>{goal.user?.fullName || '-'}</td>
                        <td>{goal.title}</td>
                        <td>{Math.max(0, (goal.currentPoints || 0) - (goal.targetPoints || 0))} نقطة</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </article>
            </section>
          ) : null}
        </>
      ) : currentGoal ? (
        <section className="card section" style={{ marginBottom: 16 }}>
          <h2>الهدف الحالي</h2>
          <p style={{ color: 'var(--text-soft)', marginTop: 0 }}>{currentGoal.description || currentGoal.title}</p>
          <div className="grid-4">
            <article><p style={{ marginTop: 0, color: 'var(--text-soft)' }}>الهدف</p><strong>{currentGoal.title}</strong></article>
            <article><p style={{ marginTop: 0, color: 'var(--text-soft)' }}>النقاط المطلوبة</p><strong>{currentGoal.targetPoints}</strong></article>
            <article><p style={{ marginTop: 0, color: 'var(--text-soft)' }}>النقاط المكتسبة</p><strong>{currentGoal.currentPoints}</strong></article>
            <article><p style={{ marginTop: 0, color: 'var(--text-soft)' }}>الوقت المتبقي</p><strong>{currentGoal.timeRemainingText}</strong></article>
          </div>
          <div style={{ marginTop: 12 }}>{renderGoalProgress(currentGoal)}</div>
          <div className="grid-3" style={{ marginTop: 12 }}>
            <article><p style={{ marginTop: 0, color: 'var(--text-soft)' }}>المستوى الحالي</p><strong>{currentGoal.currentLevel}</strong></article>
            <article><p style={{ marginTop: 0, color: 'var(--text-soft)' }}>مستوى الترقية القادم</p><strong>{currentGoal.nextLevel}</strong></article>
            <article><p style={{ marginTop: 0, color: 'var(--text-soft)' }}>الفترة</p><strong>{currentGoal.periodLabel}</strong></article>
          </div>
        </section>
      ) : (
        <section className="card section" style={{ marginBottom: 16, color: 'var(--text-soft)' }}>
          لا يوجد هدف نشط مخصص لك حاليًا.
        </section>
      )}

      <section className="card section">
        <h2>{isGeneralManager ? 'إدارة الأهداف' : 'أهدافي'}</h2>
        <table className="table">
          <thead>
            <tr>
              <th>الموظف</th>
              <th>الهدف</th>
              <th>الفترة</th>
              <th>المستوى</th>
              <th>التقدّم</th>
              <th>الحالة</th>
              {isGeneralManager ? <th>إجراءات</th> : null}
            </tr>
          </thead>
          <tbody>
            {goals.length ? goals.map((goal) => (
              <tr key={goal.id || goal._id}>
                <td>{goal.user?.fullName || currentUser?.fullName || '-'}</td>
                <td>
                  <strong>{goal.title}</strong>
                  {goal.description ? <div style={{ color: 'var(--text-soft)', fontSize: 12, marginTop: 4 }}>{goal.description}</div> : null}
                </td>
                <td>
                  <div>{goal.startDate ? new Date(goal.startDate).toLocaleDateString('ar-IQ') : '-'}</div>
                  <div style={{ color: 'var(--text-soft)', fontSize: 12 }}>{goal.endDate ? new Date(goal.endDate).toLocaleDateString('ar-IQ') : '-'}</div>
                </td>
                <td>
                  <div>الحالي: {goal.currentLevel}</div>
                  <div style={{ color: 'var(--text-soft)', fontSize: 12 }}>المستهدف: {goal.targetLevel}</div>
                </td>
                <td>{renderGoalProgress(goal)}</td>
                <td>
                  <span className={`status-pill ${statusClassMap[goal.status] || 'status-inprogress'}`}>
                    {statusLabelMap[goal.status] || goal.status}
                  </span>
                  <div style={{ color: 'var(--text-soft)', fontSize: 12, marginTop: 4 }}>{goal.timeRemainingText}</div>
                </td>
                {isGeneralManager ? (
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {goal.status === 'ACTIVE' ? <button className="btn btn-soft" type="button" onClick={() => beginEdit(goal)}>تعديل</button> : null}
                      {goal.status !== 'CANCELLED' ? <button className="btn btn-soft" type="button" onClick={() => removeGoal(goal)} style={{ color: '#ff9b9b' }}>حذف</button> : null}
                    </div>
                  </td>
                ) : null}
              </tr>
            )) : (
              <tr>
                <td colSpan={isGeneralManager ? 7 : 6} style={{ color: 'var(--text-soft)' }}>لا توجد أهداف حالياً.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
