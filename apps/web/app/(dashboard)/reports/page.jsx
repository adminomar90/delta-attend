'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';

export default function ReportsPage() {
  const [summary, setSummary] = useState(null);
  const [executive, setExecutive] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setError('');
    try {
      const [summaryData, executiveData] = await Promise.all([
        api.get('/reports/summary'),
        api.get('/reports/executive').catch(() => null),
      ]);
      setSummary(summaryData);
      setExecutive(executiveData);
    } catch (err) {
      setError(err.message || 'تعذر تحميل ملخص التقارير');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const downloadFile = async (type) => {
    setLoading(true);
    setError('');

    try {
      const blob = await api.downloadBlob(`/reports/${type}`);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `delta-plus-report.${type === 'excel' ? 'xlsx' : 'pdf'}`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'فشل التصدير');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {error ? <section className="card section" style={{ color: 'var(--danger)' }}>{error}</section> : null}

      <section className="grid-4" style={{ marginBottom: 16 }}>
        <article className="card section">
          <p style={{ marginTop: 0, color: 'var(--text-soft)' }}>إجمالي المهام</p>
          <h2>{summary?.totalTasks ?? '-'}</h2>
        </article>
        <article className="card section">
          <p style={{ marginTop: 0, color: 'var(--text-soft)' }}>المهام المعتمدة</p>
          <h2>{summary?.approvedTasks ?? '-'}</h2>
        </article>
        <article className="card section">
          <p style={{ marginTop: 0, color: 'var(--text-soft)' }}>المهام المتأخرة</p>
          <h2>{summary?.delayedTasks ?? '-'}</h2>
        </article>
        <article className="card section">
          <p style={{ marginTop: 0, color: 'var(--text-soft)' }}>إجمالي النقاط</p>
          <h2>{summary?.totalPoints ?? '-'}</h2>
        </article>
      </section>

      {summary?.financialDisbursements ? (
        <section className="grid-4" style={{ marginBottom: 16 }}>
          <article className="card section">
            <p style={{ marginTop: 0, color: 'var(--text-soft)' }}>طلبات الصرف</p>
            <h2>{summary.financialDisbursements.total ?? 0}</h2>
          </article>
          <article className="card section">
            <p style={{ marginTop: 0, color: 'var(--text-soft)' }}>بانتظار الاعتماد</p>
            <h2>
              {(summary.financialDisbursements.pendingProjectManager || 0)
                + (summary.financialDisbursements.pendingFinancialManager || 0)
                + (summary.financialDisbursements.pendingGeneralManager || 0)}
            </h2>
          </article>
          <article className="card section">
            <p style={{ marginTop: 0, color: 'var(--text-soft)' }}>جاهزة للتسليم</p>
            <h2>{summary.financialDisbursements.readyForDisbursement ?? 0}</h2>
          </article>
          <article className="card section">
            <p style={{ marginTop: 0, color: 'var(--text-soft)' }}>إجمالي المغلق</p>
            <h2>{summary.financialDisbursements.closedAmount ?? 0}</h2>
          </article>
        </section>
      ) : null}

      {executive ? (
        <section className="grid-2" style={{ marginBottom: 16 }}>
          <article className="card section">
            <h2>مؤشرات تنفيذية</h2>
            <table className="table">
              <tbody>
                <tr><td>نسبة الاعتماد</td><td>{executive.totals?.approvalRate ?? 0}%</td></tr>
                <tr><td>إجمالي المهام</td><td>{executive.totals?.totalTasks ?? 0}</td></tr>
                <tr><td>المهام المتأخرة</td><td>{executive.totals?.delayedTasks ?? 0}</td></tr>
                <tr><td>إجمالي النقاط</td><td>{executive.totals?.totalPoints ?? 0}</td></tr>
              </tbody>
            </table>
          </article>

          <article className="card section">
            <h2>الأداء حسب القسم</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>القسم</th>
                  <th>المهام</th>
                  <th>المعتمدة</th>
                  <th>المتأخرة</th>
                </tr>
              </thead>
              <tbody>
                {(executive.byDepartment || []).map((item) => (
                  <tr key={item.department}>
                    <td>{item.department}</td>
                    <td>{item.totalTasks}</td>
                    <td>{item.approvedTasks}</td>
                    <td>{item.delayedTasks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        </section>
      ) : null}

      <section className="card section">
        <h2>تصدير التقارير</h2>
        <p style={{ color: 'var(--text-soft)' }}>متاح للمدير العام والمدير المالي بحسب الصلاحيات.</p>
        <div className="action-row">
          <button className="btn btn-primary" onClick={() => downloadFile('excel')} disabled={loading}>
            {loading ? 'جارٍ التصدير...' : 'تصدير Excel'}
          </button>
          <button className="btn btn-soft" onClick={() => downloadFile('pdf')} disabled={loading}>
            {loading ? 'جارٍ التصدير...' : 'تصدير PDF'}
          </button>
        </div>
      </section>
    </>
  );
}
