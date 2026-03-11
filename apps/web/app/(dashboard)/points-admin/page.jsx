'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import { authStorage } from '../../../lib/auth';
import { Permission, hasPermission } from '../../../lib/permissions';

const flattenOrgChart = (roots = []) => {
  const queue = Array.isArray(roots) ? [...roots] : [];
  const list = [];

  while (queue.length) {
    const node = queue.shift();
    if (!node) continue;
    list.push({
      id: node.id,
      _id: node.id,
      fullName: node.fullName || '-',
      employeeCode: node.employeeCode || '',
      active: true,
    });
    if (Array.isArray(node.children) && node.children.length) {
      queue.push(...node.children);
    }
  }

  return list;
};

const toNum = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toDateInput = (value) => {
  const date = value ? new Date(value) : new Date();
  const tz = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tz).toISOString().slice(0, 10);
};

export default function PointsAdminPage() {
  const currentUser = authStorage.getUser();
  const canManage = useMemo(
    () => hasPermission(currentUser, Permission.MANAGE_GAMIFICATION),
    [currentUser?.role, currentUser?.customPermissions, currentUser?.permissions],
  );

  const [loading, setLoading] = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const [granting, setGranting] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [users, setUsers] = useState([]);
  const [rules, setRules] = useState([]);
  const [operations, setOperations] = useState([]);
  const [filters, setFilters] = useState({
    userId: '',
    from: toDateInput(new Date()),
    to: toDateInput(new Date()),
  });
  const [manualGrant, setManualGrant] = useState({
    userId: '',
    points: '',
    reason: '',
  });
  const [manualDeduction, setManualDeduction] = useState({
    userId: '',
    points: '',
    reason: '',
  });
  const [levelOverride, setLevelOverride] = useState({
    userId: '',
    level: '',
    reason: '',
  });

  const loadBase = async () => {
    setLoading(true);
    setError('');

    try {
      const [rulesRes, usersRes] = await Promise.all([
        api.get('/gamification/admin/operation-rules'),
        api.get('/auth/users').catch(async () => {
          const chart = await api.get('/auth/org-chart').catch(() => ({ roots: [] }));
          return { users: flattenOrgChart(chart.roots || []) };
        }),
      ]);

      setRules(rulesRes.rules || []);
      setUsers((usersRes.users || []).filter((item) => item?.active));
    } catch (err) {
      setError(err.message || 'تعذر تحميل إعدادات النقاط');
    } finally {
      setLoading(false);
    }
  };

  const loadOperations = async () => {
    setError('');
    try {
      const params = new URLSearchParams();
      if (filters.userId) params.set('userId', filters.userId);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      params.set('limit', '300');
      const response = await api.get(`/gamification/admin/operations?${params.toString()}`);
      setOperations(response.operations || []);
    } catch (err) {
      setError(err.message || 'تعذر تحميل العمليات');
    }
  };

  useEffect(() => {
    if (!canManage) return;
    loadBase();
  }, [canManage]);

  useEffect(() => {
    if (!canManage) return;
    loadOperations();
  }, [canManage, filters.userId, filters.from, filters.to]);

  const updateRule = (actionKey, changes) => {
    setRules((prev) => prev.map((rule) => (
      rule.actionKey === actionKey ? { ...rule, ...changes } : rule
    )));
  };

  const saveRules = async () => {
    setSavingRules(true);
    setError('');
    setInfo('');
    try {
      await api.put('/gamification/admin/operation-rules', {
        rules: rules.map((rule) => ({
          actionKey: rule.actionKey,
          labelAr: rule.labelAr,
          enabled: !!rule.enabled,
          basePoints: Math.max(0, Math.round(toNum(rule.basePoints, 0))),
          formulaType: rule.formulaType || 'FIXED',
          multiplier: Math.max(0, toNum(rule.multiplier, 1)),
          maxPoints: Math.max(0, Math.round(toNum(rule.maxPoints, 0))),
        })),
      });
      setInfo('تم حفظ قواعد النقاط بنجاح');
      await loadBase();
      await loadOperations();
    } catch (err) {
      setError(err.message || 'فشل حفظ قواعد النقاط');
    } finally {
      setSavingRules(false);
    }
  };

  const grantFromOperation = async (operation) => {
    const value = window.prompt('أدخل نقاط مخصصة (أو اتركه فارغًا لتطبيق القاعدة)', '');
    const body = {};
    if (value !== null && String(value).trim() !== '') {
      const parsed = Math.round(toNum(value, NaN));
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError('قيمة النقاط غير صالحة');
        return;
      }
      body.points = parsed;
      body.reason = `منح يدوي لعملية ${operation.actionLabel || operation.actionKey}`;
    }

    setGranting(true);
    setError('');
    setInfo('');
    try {
      await api.post(`/gamification/admin/operations/${operation.operationId}/grant`, body);
      setInfo('تم منح النقاط للعملية');
      await loadOperations();
    } catch (err) {
      setError(err.message || 'فشل منح نقاط العملية');
    } finally {
      setGranting(false);
    }
  };

  const submitManualGrant = async (event) => {
    event.preventDefault();
    setGranting(true);
    setError('');
    setInfo('');
    try {
      await api.post('/gamification/admin/manual-grants', {
        userId: manualGrant.userId,
        points: Math.round(toNum(manualGrant.points, 0)),
        reason: manualGrant.reason || 'منح يدوي من الأدمن',
      });
      setInfo('تمت إضافة النقاط للموظف');
      setManualGrant((prev) => ({ ...prev, points: '', reason: '' }));
      await loadOperations();
    } catch (err) {
      setError(err.message || 'فشل إضافة النقاط');
    } finally {
      setGranting(false);
    }
  };

  const submitManualDeduction = async (event) => {
    event.preventDefault();
    setGranting(true);
    setError('');
    setInfo('');
    try {
      await api.post('/gamification/admin/manual-deductions', {
        userId: manualDeduction.userId,
        points: Math.round(toNum(manualDeduction.points, 0)),
        reason: manualDeduction.reason,
      });
      setInfo('تم سحب النقاط من الموظف');
      setManualDeduction((prev) => ({ ...prev, points: '', reason: '' }));
      await loadOperations();
    } catch (err) {
      setError(err.message || 'فشل سحب النقاط');
    } finally {
      setGranting(false);
    }
  };

  const submitLevelOverride = async (event) => {
    event.preventDefault();
    setGranting(true);
    setError('');
    setInfo('');
    try {
      await api.post('/gamification/admin/override-level', {
        userId: levelOverride.userId,
        level: Math.round(toNum(levelOverride.level, 0)),
        reason: levelOverride.reason || 'تعديل مستوى يدوي من الأدمن',
      });
      setInfo('تم تعديل مستوى الموظف');
      setLevelOverride((prev) => ({ ...prev, level: '', reason: '' }));
    } catch (err) {
      setError(err.message || 'فشل تعديل المستوى');
    } finally {
      setGranting(false);
    }
  };

  if (!canManage) {
    return <section className="card section">لا تملك صلاحية إدارة نظام النقاط.</section>;
  }

  return (
    <>
      {error ? <section className="card section" style={{ color: 'var(--danger)' }}>{error}</section> : null}
      {info ? <section className="card section" style={{ color: '#9bc8ff' }}>{info}</section> : null}

      <section className="card section" style={{ marginBottom: 16 }}>
        <h2>قواعد النقاط حسب العملية</h2>
        <p style={{ color: 'var(--text-soft)', marginTop: 0 }}>
          مثال: يمكن ضبط نقاط "إنشاء تقرير عمل" بصيغة تعتمد على نسبة الإنجاز.
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>العملية</th>
              <th>تفعيل</th>
              <th>النقاط الأساسية</th>
              <th>نوع الاحتساب</th>
              <th>المعامل</th>
              <th>حد أعلى</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.actionKey}>
                <td>
                  <strong>{rule.labelAr || rule.actionKey}</strong>
                  <div style={{ color: 'var(--text-soft)', fontSize: 12 }}>{rule.actionKey}</div>
                </td>
                <td><input type="checkbox" checked={!!rule.enabled} onChange={(e) => updateRule(rule.actionKey, { enabled: e.target.checked })} /></td>
                <td><input className="input" type="number" min={0} value={rule.basePoints} onChange={(e) => updateRule(rule.actionKey, { basePoints: e.target.value })} /></td>
                <td>
                  <select className="select" value={rule.formulaType || 'FIXED'} onChange={(e) => updateRule(rule.actionKey, { formulaType: e.target.value })}>
                    <option value="FIXED">ثابت</option>
                    <option value="WORK_REPORT_PROGRESS">حسب نسبة إنجاز التقرير</option>
                  </select>
                </td>
                <td><input className="input" type="number" min={0} step="0.1" value={rule.multiplier ?? 1} onChange={(e) => updateRule(rule.actionKey, { multiplier: e.target.value })} /></td>
                <td><input className="input" type="number" min={0} value={rule.maxPoints ?? 0} onChange={(e) => updateRule(rule.actionKey, { maxPoints: e.target.value })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn btn-primary" type="button" onClick={saveRules} disabled={savingRules || loading}>
          {savingRules ? 'جارٍ الحفظ...' : 'حفظ قواعد النقاط'}
        </button>
      </section>

      <section className="card section" style={{ marginBottom: 16 }}>
        <h2>منح يدوي وتعديل المستوى</h2>
        <div className="grid-3">
          <form onSubmit={submitManualGrant}>
            <h3 style={{ marginTop: 0 }}>منح نقاط لموظف</h3>
            <label>الموظف
              <select className="select" value={manualGrant.userId} onChange={(e) => setManualGrant((prev) => ({ ...prev, userId: e.target.value }))} required>
                <option value="">اختر</option>
                {users.map((user) => <option key={user.id || user._id} value={user.id || user._id}>{user.fullName}{user.employeeCode ? ` (${user.employeeCode})` : ''}</option>)}
              </select>
            </label>
            <label>النقاط
              <input className="input" type="number" min={1} value={manualGrant.points} onChange={(e) => setManualGrant((prev) => ({ ...prev, points: e.target.value }))} required />
            </label>
            <label>السبب
              <input className="input" value={manualGrant.reason} onChange={(e) => setManualGrant((prev) => ({ ...prev, reason: e.target.value }))} placeholder="سبب المنح" />
            </label>
            <button className="btn btn-primary" type="submit" disabled={granting}>{granting ? 'جارٍ التنفيذ...' : 'إضافة نقاط'}</button>
          </form>

          <form onSubmit={submitManualDeduction}>
            <h3 style={{ marginTop: 0 }}>سحب نقاط من موظف</h3>
            <label>الموظف
              <select className="select" value={manualDeduction.userId} onChange={(e) => setManualDeduction((prev) => ({ ...prev, userId: e.target.value }))} required>
                <option value="">اختر</option>
                {users.map((user) => <option key={user.id || user._id} value={user.id || user._id}>{user.fullName}{user.employeeCode ? ` (${user.employeeCode})` : ''}</option>)}
              </select>
            </label>
            <label>النقاط المسحوبة
              <input className="input" type="number" min={1} value={manualDeduction.points} onChange={(e) => setManualDeduction((prev) => ({ ...prev, points: e.target.value }))} required />
            </label>
            <label>السبب
              <input className="input" value={manualDeduction.reason} onChange={(e) => setManualDeduction((prev) => ({ ...prev, reason: e.target.value }))} placeholder="سبب سحب النقاط" required />
            </label>
            <button className="btn btn-primary" type="submit" disabled={granting}>{granting ? 'جارٍ التنفيذ...' : 'سحب نقاط'}</button>
          </form>

          <form onSubmit={submitLevelOverride}>
            <h3 style={{ marginTop: 0 }}>تعديل مستوى موظف</h3>
            <label>الموظف
              <select className="select" value={levelOverride.userId} onChange={(e) => setLevelOverride((prev) => ({ ...prev, userId: e.target.value }))} required>
                <option value="">اختر</option>
                {users.map((user) => <option key={user.id || user._id} value={user.id || user._id}>{user.fullName}{user.employeeCode ? ` (${user.employeeCode})` : ''}</option>)}
              </select>
            </label>
            <label>المستوى الجديد
              <input className="input" type="number" min={1} max={100} value={levelOverride.level} onChange={(e) => setLevelOverride((prev) => ({ ...prev, level: e.target.value }))} required />
            </label>
            <label>السبب
              <input className="input" value={levelOverride.reason} onChange={(e) => setLevelOverride((prev) => ({ ...prev, reason: e.target.value }))} placeholder="سبب تعديل المستوى" />
            </label>
            <button className="btn btn-primary" type="submit" disabled={granting}>{granting ? 'جارٍ التنفيذ...' : 'تعديل المستوى'}</button>
          </form>
        </div>
      </section>

      <section className="card section">
        <h2>عمليات الموظفين داخل النظام</h2>
        <div className="grid-3" style={{ marginBottom: 12 }}>
          <label>الموظف
            <select className="select" value={filters.userId} onChange={(e) => setFilters((prev) => ({ ...prev, userId: e.target.value }))}>
              <option value="">الكل</option>
              {users.map((user) => <option key={user.id || user._id} value={user.id || user._id}>{user.fullName}{user.employeeCode ? ` (${user.employeeCode})` : ''}</option>)}
            </select>
          </label>
          <label>من تاريخ
            <input className="input" type="date" value={filters.from} onChange={(e) => setFilters((prev) => ({ ...prev, from: e.target.value }))} />
          </label>
          <label>إلى تاريخ
            <input className="input" type="date" value={filters.to} onChange={(e) => setFilters((prev) => ({ ...prev, to: e.target.value }))} />
          </label>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>الموظف</th>
              <th>العملية</th>
              <th>نسبة الإنجاز</th>
              <th>النقاط المقترحة</th>
              <th>الحالة</th>
              <th>إجراء</th>
            </tr>
          </thead>
          <tbody>
            {operations.length ? operations.map((operation) => (
              <tr key={operation.operationId}>
                <td>{new Date(operation.createdAt).toLocaleString('ar-IQ')}</td>
                <td>{operation.actor?.fullName || '-'}</td>
                <td>
                  <strong>{operation.actionLabel || operation.actionKey}</strong>
                  <div style={{ color: 'var(--text-soft)', fontSize: 12 }}>{operation.actionKey}</div>
                </td>
                <td>{operation.progressPercent || 0}%</td>
                <td>{operation.recommendedPoints}</td>
                <td>{operation.granted ? `ممنوحة (${operation.pointsGranted})` : 'غير ممنوحة'}</td>
                <td>
                  <button className="btn btn-soft" type="button" disabled={granting} onClick={() => grantFromOperation(operation)}>
                    {operation.granted ? 'منح إضافي' : 'منح نقاط'}
                  </button>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={7} style={{ color: 'var(--text-soft)' }}>لا توجد عمليات ضمن الفترة المحددة.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
