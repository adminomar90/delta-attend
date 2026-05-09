'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import { authStorage } from '../../../lib/auth';
import { Permission, hasAnyPermission } from '../../../lib/permissions';

const departments = [
  ['PROJECTS', 'قسم المشاريع'],
  ['MAINTENANCE', 'قسم الصيانة'],
  ['TECHNICAL_SUPPORT', 'قسم الدعم الفني'],
  ['SALES', 'قسم المبيعات'],
  ['FOLLOW_UP_CONTROL', 'قسم المتابعة والسيطرة'],
];

const ratingLabels = {
  EXCELLENT: 'ممتاز',
  VERY_GOOD: 'جيد جداً',
  GOOD: 'جيد',
  ACCEPTABLE: 'مقبول',
  WEAK: 'ضعيف',
};

const ratingScores = {
  EXCELLENT: 5,
  VERY_GOOD: 4,
  GOOD: 3,
  ACCEPTABLE: 2,
  WEAK: 1,
};

const statusLabels = {
  PENDING: 'لم يتم التقييم',
  SUBMITTED: 'تم التقييم',
  EXPIRED: 'منتهي',
};

const issueLabels = {
  NONE: 'لا توجد مشكلة',
  MINOR: 'مشكلة بسيطة',
  NEEDS_FOLLOW_UP: 'تحتاج متابعة',
};

const completedLabels = {
  YES: 'نعم',
  NO: 'لا',
  PARTIAL: 'جزئياً',
};

const recommendLabels = {
  YES: 'نعم',
  NO: 'لا',
  MAYBE: 'ربما',
};

const questionLabels = [
  ['arrivalCommitment', 'الالتزام بموعد الحضور'],
  ['respectfulTreatment', 'التعامل والاحترام'],
  ['appearanceAndOrganization', 'المظهر العام والتنظيم'],
  ['requestUnderstanding', 'فهم طلب الزبون أو المشكلة'],
  ['executionQuality', 'جودة تنفيذ العمل'],
  ['completionSpeed', 'سرعة إنجاز العمل'],
  ['cleanupAfterWork', 'ترتيب وتنظيف مكان العمل'],
  ['serviceExplanation', 'شرح الخدمة أو النظام'],
  ['problemResolution', 'حل المشكلة أو إنجاز الطلب'],
  ['overallRating', 'التقييم العام للخدمة'],
];

const requiredPermissions = [
  Permission.VIEW_CUSTOMER_EVALUATIONS,
  Permission.MANAGE_CUSTOMER_EVALUATIONS,
  Permission.VIEW_ANALYTICS,
  Permission.VIEW_EXECUTIVE_REPORTS,
];

const formatDate = (value) => (value ? new Date(value).toLocaleDateString('ar-IQ') : '-');
const formatDateTime = (value) => (value ? new Date(value).toLocaleString('ar-IQ') : '-');

const downloadBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
};

const percent = (value, total) => (total ? Math.round((value / total) * 100) : 0);

function RatingBar({ label, value, total }) {
  const width = percent(value, total);
  return (
    <div className="evaluation-bar-row">
      <span>{label}</span>
      <div className="evaluation-bar-track"><div style={{ width: `${width}%` }} /></div>
      <strong>{value}</strong>
    </div>
  );
}

export default function CustomerEvaluationsPage() {
  const currentUser = authStorage.getUser();
  const canAccess = hasAnyPermission(currentUser, requiredPermissions);
  const [filters, setFilters] = useState({
    search: '',
    phone: '',
    department: '',
    serviceType: '',
    dateFrom: '',
    dateTo: '',
    overallRating: '',
    weakOnly: false,
    needsFollowUp: false,
  });
  const [evaluations, setEvaluations] = useState([]);
  const [summary, setSummary] = useState([]);
  const [selectedEvaluation, setSelectedEvaluation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return params.toString();
  }, [filters]);

  const submittedEvaluations = useMemo(
    () => evaluations.filter((item) => item.status === 'SUBMITTED'),
    [evaluations],
  );

  const analytics = useMemo(() => {
    const questionStats = questionLabels.map(([key, label]) => {
      const counts = Object.keys(ratingLabels).reduce((acc, rating) => ({ ...acc, [rating]: 0 }), {});
      let total = 0;
      let score = 0;
      submittedEvaluations.forEach((item) => {
        const rating = item.answers?.[key];
        if (!ratingScores[rating]) return;
        counts[rating] += 1;
        total += 1;
        score += ratingScores[rating];
      });
      return {
        key,
        label,
        counts,
        total,
        average: total ? Number((score / total).toFixed(2)) : 0,
        weakCount: counts.WEAK + counts.ACCEPTABLE,
      };
    });

    const overallCounts = Object.keys(ratingLabels).reduce((acc, rating) => ({ ...acc, [rating]: 0 }), {});
    const issueCounts = Object.keys(issueLabels).reduce((acc, key) => ({ ...acc, [key]: 0 }), {});
    const completedCounts = Object.keys(completedLabels).reduce((acc, key) => ({ ...acc, [key]: 0 }), {});
    const recommendCounts = Object.keys(recommendLabels).reduce((acc, key) => ({ ...acc, [key]: 0 }), {});
    let scoreTotal = 0;
    let scoreCount = 0;

    submittedEvaluations.forEach((item) => {
      const answers = item.answers || {};
      if (overallCounts[answers.overallRating] !== undefined) overallCounts[answers.overallRating] += 1;
      if (issueCounts[answers.issueAfterLeaving] !== undefined) issueCounts[answers.issueAfterLeaving] += 1;
      if (completedCounts[answers.completedAsRequested] !== undefined) completedCounts[answers.completedAsRequested] += 1;
      if (recommendCounts[answers.recommendAgain] !== undefined) recommendCounts[answers.recommendAgain] += 1;
      questionLabels.forEach(([key]) => {
        if (ratingScores[answers[key]]) {
          scoreTotal += ratingScores[answers[key]];
          scoreCount += 1;
        }
      });
    });

    const weakestQuestions = [...questionStats]
      .filter((item) => item.total)
      .sort((a, b) => a.average - b.average)
      .slice(0, 3);

    return {
      questionStats,
      overallCounts,
      issueCounts,
      completedCounts,
      recommendCounts,
      weakestQuestions,
      overallAverage: scoreCount ? Number((scoreTotal / scoreCount).toFixed(2)) : 0,
    };
  }, [submittedEvaluations]);

  const load = async () => {
    if (!canAccess) return;
    setLoading(true);
    setError('');
    try {
      const response = await api.get(`/customer-evaluations${queryString ? `?${queryString}` : ''}`);
      setEvaluations(response.evaluations || []);
      setSummary(response.summary || []);
    } catch (err) {
      setError(err.message || 'تعذر تحميل تقييمات الزبائن');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [queryString, canAccess]);

  const exportFile = async (type) => {
    setError('');
    try {
      const blob = await api.downloadBlob(`/customer-evaluations/export/${type}${queryString ? `?${queryString}` : ''}`);
      downloadBlob(blob, type === 'excel' ? 'customer-evaluations.xlsx' : 'customer-evaluations.pdf');
    } catch (err) {
      setError(err.message || 'تعذر التصدير');
    }
  };

  const reactivate = async (evaluation) => {
    setError('');
    setInfo('');
    try {
      const response = await api.patch(`/customer-evaluations/${evaluation._id || evaluation.id}/reactivate`, {});
      setInfo(`تمت إعادة تفعيل الرابط: ${response.url}`);
      await load();
    } catch (err) {
      setError(err.message || 'تعذر إعادة تفعيل الرابط');
    }
  };

  if (!canAccess) {
    return <section className="card section">لا تملك صلاحية عرض تقييمات الزبائن.</section>;
  }

  return (
    <>
      {error ? <section className="card section" style={{ color: 'var(--danger)' }}>{error}</section> : null}
      {info ? <section className="card section" style={{ color: 'var(--accent)' }}>{info}</section> : null}

      <section className="card section daily-plan-hero">
        <div>
          <h2 style={{ marginBottom: 6 }}>تقييمات الزبائن</h2>
          <p style={{ margin: 0, color: 'var(--text-soft)' }}>عرض تفصيلي لكل اختيارات الزبائن مع تحليل نقاط القوة والضعف حسب القسم والخدمة والسؤال.</p>
        </div>
        <div className="action-row">
          <button className="btn btn-soft" onClick={() => exportFile('excel')}>Excel</button>
          <button className="btn btn-soft" onClick={() => exportFile('pdf')}>PDF</button>
          <button className="btn btn-soft" onClick={load} disabled={loading}>{loading ? 'جاري التحديث...' : 'تحديث'}</button>
        </div>
      </section>

      <section className="grid-4" style={{ marginTop: 16 }}>
        <article className="card section"><p className="maintenance-kpi-label">إجمالي الروابط</p><h2>{evaluations.length}</h2></article>
        <article className="card section"><p className="maintenance-kpi-label">تم التقييم</p><h2>{submittedEvaluations.length}</h2></article>
        <article className="card section"><p className="maintenance-kpi-label">المتوسط العام</p><h2>{analytics.overallAverage}/5</h2></article>
        <article className="card section"><p className="maintenance-kpi-label">تحتاج متابعة</p><h2>{analytics.issueCounts.NEEDS_FOLLOW_UP}</h2></article>
      </section>

      <section className="card section" style={{ marginTop: 16 }}>
        <div className="daily-plan-filter-grid">
          <label>بحث<input className="input" value={filters.search} onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))} /></label>
          <label>رقم الهاتف<input className="input" value={filters.phone} onChange={(e) => setFilters((prev) => ({ ...prev, phone: e.target.value }))} /></label>
          <label>القسم<select className="select" value={filters.department} onChange={(e) => setFilters((prev) => ({ ...prev, department: e.target.value }))}><option value="">الكل</option>{departments.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>نوع الخدمة<input className="input" value={filters.serviceType} onChange={(e) => setFilters((prev) => ({ ...prev, serviceType: e.target.value }))} /></label>
          <label>من تاريخ<input className="input" type="date" value={filters.dateFrom} onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))} /></label>
          <label>إلى تاريخ<input className="input" type="date" value={filters.dateTo} onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))} /></label>
          <label>التقييم العام<select className="select" value={filters.overallRating} onChange={(e) => setFilters((prev) => ({ ...prev, overallRating: e.target.value }))}><option value="">الكل</option>{Object.entries(ratingLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="checkbox-row"><input type="checkbox" checked={filters.weakOnly} onChange={(e) => setFilters((prev) => ({ ...prev, weakOnly: e.target.checked }))} /> التقييمات الضعيفة فقط</label>
          <label className="checkbox-row"><input type="checkbox" checked={filters.needsFollowUp} onChange={(e) => setFilters((prev) => ({ ...prev, needsFollowUp: e.target.checked }))} /> تحتاج متابعة</label>
        </div>
      </section>

      <section className="grid-2" style={{ marginTop: 16 }}>
        <article className="card section">
          <h2>توزيع التقييم العام</h2>
          {Object.entries(ratingLabels).map(([key, label]) => (
            <RatingBar key={key} label={label} value={analytics.overallCounts[key]} total={submittedEvaluations.length} />
          ))}
        </article>
        <article className="card section">
          <h2>نتائج المتابعة والتنفيذ</h2>
          <div className="evaluation-mini-section">
            <strong>هل تم التنفيذ حسب المطلوب؟</strong>
            {Object.entries(completedLabels).map(([key, label]) => <RatingBar key={key} label={label} value={analytics.completedCounts[key]} total={submittedEvaluations.length} />)}
          </div>
          <div className="evaluation-mini-section">
            <strong>هل توجد مشكلة بعد المغادرة؟</strong>
            {Object.entries(issueLabels).map(([key, label]) => <RatingBar key={key} label={label} value={analytics.issueCounts[key]} total={submittedEvaluations.length} />)}
          </div>
          <div className="evaluation-mini-section">
            <strong>هل ينصح بالتعامل مرة أخرى؟</strong>
            {Object.entries(recommendLabels).map(([key, label]) => <RatingBar key={key} label={label} value={analytics.recommendCounts[key]} total={submittedEvaluations.length} />)}
          </div>
        </article>
      </section>

      <section className="card section" style={{ marginTop: 16 }}>
        <h2>تحليل الأسئلة</h2>
        <div className="evaluation-question-grid">
          {analytics.questionStats.map((item) => (
            <article className="evaluation-question-card" key={item.key}>
              <div className="maintenance-card-header">
                <strong>{item.label}</strong>
                <span className={`status-pill ${item.average >= 4 ? 'status-approved' : item.average >= 3 ? 'status-submitted' : 'status-rejected'}`}>{item.average || '-'}/5</span>
              </div>
              {Object.entries(ratingLabels).map(([key, label]) => (
                <RatingBar key={key} label={label} value={item.counts[key]} total={item.total} />
              ))}
              {item.weakCount ? <p className="evaluation-alert">عدد الإجابات الضعيفة/المقبولة: {item.weakCount}</p> : null}
            </article>
          ))}
        </div>
      </section>

      <section className="card section" style={{ marginTop: 16 }}>
        <h2>أضعف النقاط حسب الاختيارات</h2>
        <div className="daily-plan-card-grid">
          {analytics.weakestQuestions.length ? analytics.weakestQuestions.map((item) => (
            <article className="daily-plan-card" key={item.key}>
              <strong>{item.label}</strong>
              <div className="daily-plan-mini-grid">
                <div><span>المتوسط</span><strong>{item.average}/5</strong></div>
                <div><span>ضعيف/مقبول</span><strong>{item.weakCount}</strong></div>
              </div>
            </article>
          )) : <p className="maintenance-empty">لا توجد تقييمات مرسلة بعد.</p>}
        </div>
      </section>

      <section className="card section" style={{ marginTop: 16 }}>
        <h2>تحليل الأقسام</h2>
        <div className="daily-plan-card-grid">
          {summary.map((item) => (
            <article className="daily-plan-card" key={item.department}>
              <strong>{item.departmentName}</strong>
              <div className="daily-plan-mini-grid">
                <div><span>المتوسط</span><strong>{item.average}</strong></div>
                <div><span>العدد</span><strong>{item.count}</strong></div>
                <div><span>ممتاز</span><strong>{item.excellent}</strong></div>
                <div><span>ضعيف</span><strong>{item.weak}</strong></div>
              </div>
              {item.followUp ? <p className="evaluation-alert">تحتاج متابعة: {item.followUp}</p> : null}
            </article>
          ))}
        </div>
      </section>

      <section className="card section" style={{ marginTop: 16 }}>
        <table className="table">
          <thead>
            <tr>
              <th>الزبون</th>
              <th>الهاتف</th>
              <th>الخدمة</th>
              <th>القسم</th>
              <th>التقييم العام</th>
              <th>حالة المشكلة</th>
              <th>الملاحظات</th>
              <th>الحالة</th>
              <th>تاريخ التقييم</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {evaluations.length ? evaluations.map((item) => (
              <tr key={item._id || item.id}>
                <td>{item.customer?.customerName || '-'}</td>
                <td>{item.customer?.phone || '-'}</td>
                <td>{item.work?.serviceType || '-'}</td>
                <td>{item.work?.departmentName || '-'}</td>
                <td>{ratingLabels[item.answers?.overallRating] || '-'}</td>
                <td>{issueLabels[item.answers?.issueAfterLeaving] || '-'}</td>
                <td>{item.answers?.customerNotes || '-'}</td>
                <td>{statusLabels[item.status] || item.status}</td>
                <td>{formatDateTime(item.submittedAt)}</td>
                <td>
                  <div className="form-actions">
                    <button className="btn btn-soft btn-sm" onClick={() => setSelectedEvaluation(item)}>عرض كل الاختيارات</button>
                    {item.source?.reportUrl ? <a className="btn btn-soft btn-sm" href={item.source.reportUrl}>فتح المرتبط</a> : null}
                    <button className="btn btn-soft btn-sm" onClick={() => reactivate(item)}>إعادة تفعيل</button>
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={10}>لا توجد تقييمات مطابقة.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {selectedEvaluation ? (
        <div className="modal-backdrop" onClick={() => setSelectedEvaluation(null)}>
          <div className="modal-panel customer-modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>اختيارات الزبون كاملة</h3>
                <p className="daily-plan-modal-subtitle">{selectedEvaluation.customer?.customerName || '-'} - {selectedEvaluation.source?.sourceNumber || '-'}</p>
              </div>
              <button type="button" className="modal-close" onClick={() => setSelectedEvaluation(null)}>&times;</button>
            </div>

            <div className="daily-plan-detail-grid">
              <div className="daily-plan-info-box"><span>الزبون</span><strong>{selectedEvaluation.customer?.customerName || '-'}</strong></div>
              <div className="daily-plan-info-box"><span>الهاتف</span><strong>{selectedEvaluation.customer?.phone || '-'}</strong></div>
              <div className="daily-plan-info-box"><span>الموقع</span><strong>{selectedEvaluation.customer?.companyOrSiteName || '-'}</strong></div>
              <div className="daily-plan-info-box"><span>العنوان</span><strong>{selectedEvaluation.customer?.siteAddress || '-'}</strong></div>
              <div className="daily-plan-info-box"><span>الخدمة</span><strong>{selectedEvaluation.work?.serviceType || '-'}</strong></div>
              <div className="daily-plan-info-box"><span>القسم</span><strong>{selectedEvaluation.work?.departmentName || '-'}</strong></div>
              <div className="daily-plan-info-box"><span>تاريخ التنفيذ</span><strong>{formatDate(selectedEvaluation.work?.executionDate)}</strong></div>
              <div className="daily-plan-info-box"><span>تاريخ التقييم</span><strong>{formatDateTime(selectedEvaluation.submittedAt)}</strong></div>
            </div>

            <section className="daily-plan-form-section">
              <h4>إجابات التقييم</h4>
              <div className="evaluation-answer-grid">
                {questionLabels.map(([key, label]) => (
                  <div className="customer-detail-row" key={key}>
                    <strong>{label}</strong>
                    <span>{ratingLabels[selectedEvaluation.answers?.[key]] || '-'}</span>
                  </div>
                ))}
                <div className="customer-detail-row"><strong>هل تم تنفيذ العمل حسب المطلوب؟</strong><span>{completedLabels[selectedEvaluation.answers?.completedAsRequested] || '-'}</span></div>
                <div className="customer-detail-row"><strong>هل واجهت مشكلة بعد مغادرة الفريق؟</strong><span>{issueLabels[selectedEvaluation.answers?.issueAfterLeaving] || '-'}</span></div>
                <div className="customer-detail-row"><strong>هل تنصح بالتعامل مرة أخرى؟</strong><span>{recommendLabels[selectedEvaluation.answers?.recommendAgain] || '-'}</span></div>
              </div>
            </section>

            <section className="daily-plan-form-section">
              <h4>ملاحظات الزبون</h4>
              <p className="maintenance-note">{selectedEvaluation.answers?.customerNotes || 'لا توجد ملاحظات.'}</p>
            </section>
          </div>
        </div>
      ) : null}
    </>
  );
}
