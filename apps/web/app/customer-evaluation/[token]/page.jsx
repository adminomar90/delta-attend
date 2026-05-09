'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { getApiUrl } from '../../../lib/api';

const ratingOptions = [
  ['EXCELLENT', 'ممتاز'],
  ['VERY_GOOD', 'جيد جداً'],
  ['GOOD', 'جيد'],
  ['ACCEPTABLE', 'مقبول'],
  ['WEAK', 'ضعيف'],
];

const questions = [
  ['arrivalCommitment', 'تقييم الالتزام بموعد الحضور'],
  ['respectfulTreatment', 'تقييم التعامل والاحترام'],
  ['appearanceAndOrganization', 'تقييم المظهر العام والتنظيم'],
  ['requestUnderstanding', 'تقييم فهم القسم لطلب الزبون أو المشكلة'],
  ['executionQuality', 'تقييم جودة تنفيذ العمل'],
  ['completionSpeed', 'تقييم سرعة إنجاز العمل'],
  ['cleanupAfterWork', 'تقييم ترتيب وتنظيف مكان العمل بعد الانتهاء'],
  ['serviceExplanation', 'تقييم شرح الخدمة أو النظام بعد التنفيذ'],
  ['problemResolution', 'تقييم حل المشكلة أو إنجاز الطلب'],
  ['overallRating', 'التقييم العام للخدمة'],
];

const initialAnswers = {
  arrivalCommitment: '',
  respectfulTreatment: '',
  appearanceAndOrganization: '',
  requestUnderstanding: '',
  executionQuality: '',
  completionSpeed: '',
  cleanupAfterWork: '',
  serviceExplanation: '',
  problemResolution: '',
  overallRating: '',
  completedAsRequested: '',
  issueAfterLeaving: '',
  recommendAgain: '',
  customerNotes: '',
};

const formatDate = (value) => (value ? new Date(value).toLocaleDateString('ar-IQ') : '-');

export default function CustomerEvaluationPage() {
  const params = useParams();
  const token = typeof params?.token === 'string' ? params.token : '';
  const apiUrl = useMemo(() => getApiUrl(), []);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [evaluation, setEvaluation] = useState(null);
  const [answers, setAnswers] = useState(initialAnswers);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`${apiUrl}/customer-evaluations/public/${token}`, { cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'تعذر فتح رابط التقييم');
        setEvaluation(payload.evaluation);
      } catch (err) {
        setError(err.message || 'تعذر فتح رابط التقييم');
      } finally {
        setLoading(false);
      }
    };
    if (token) load();
  }, [apiUrl, token]);

  const setField = (key, value) => setAnswers((prev) => ({ ...prev, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch(`${apiUrl}/customer-evaluations/public/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(answers),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'تعذر إرسال التقييم');
      setSuccess(payload.message || 'شكراً لتقييمك، ملاحظاتك تساعدنا على تطوير جودة خدمات دلتا بلس.');
    } catch (err) {
      setError(err.message || 'تعذر إرسال التقييم');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <main className="customer-public-page" dir="rtl"><section className="customer-public-card customer-public-loading">جاري تحميل التقييم...</section></main>;
  }

  return (
    <main className="customer-public-page customer-evaluation-page" dir="rtl">
      <section className="customer-public-hero">
        <img src="/brand/delta-plus-logo.png" alt="Delta Plus" />
        <h1>تقييم خدمة دلتا بلس</h1>
        <p>تقييمكم يساعدنا على تحسين جودة الخدمة. لن تظهر أسماء الفنيين في هذه الاستمارة، والتقييم يكون على مستوى القسم المسؤول.</p>
      </section>

      <section className="customer-public-card">
        {error ? <p className="customer-public-error">{error}</p> : null}
        {success ? <p className="customer-public-success">{success}</p> : null}

        {!success && evaluation ? (
          <form className="customer-public-form" onSubmit={submit}>
            <div className="customer-evaluation-summary customer-public-wide">
              <div><span>اسم الزبون</span><strong>{evaluation.customer?.customerName || '-'}</strong></div>
              <div><span>رقم الهاتف</span><strong>{evaluation.customer?.phone || '-'}</strong></div>
              <div><span>الشركة أو الموقع</span><strong>{evaluation.customer?.companyOrSiteName || '-'}</strong></div>
              <div><span>عنوان الموقع</span><strong>{evaluation.customer?.siteAddress || '-'}</strong></div>
              <div><span>نوع الخدمة</span><strong>{evaluation.work?.serviceType || '-'}</strong></div>
              <div><span>تاريخ التنفيذ</span><strong>{formatDate(evaluation.work?.executionDate)}</strong></div>
              <div><span>رقم التقرير أو البلان</span><strong>{evaluation.source?.sourceNumber || '-'}</strong></div>
              <div><span>القسم المسؤول</span><strong>{evaluation.work?.departmentName || '-'}</strong></div>
              <div><span>المشروع أو المهمة</span><strong>{evaluation.work?.projectOrTaskName || '-'}</strong></div>
            </div>

            {questions.map(([key, label]) => (
              <label key={key}>
                {label}
                <select required value={answers[key]} onChange={(event) => setField(key, event.target.value)}>
                  <option value="">اختر التقييم</option>
                  {ratingOptions.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                </select>
              </label>
            ))}

            <label>
              هل تم تنفيذ العمل حسب المطلوب؟
              <select required value={answers.completedAsRequested} onChange={(event) => setField('completedAsRequested', event.target.value)}>
                <option value="">اختر</option>
                <option value="YES">نعم</option>
                <option value="NO">لا</option>
                <option value="PARTIAL">جزئياً</option>
              </select>
            </label>

            <label>
              هل واجهت مشكلة بعد مغادرة الفريق؟
              <select required value={answers.issueAfterLeaving} onChange={(event) => setField('issueAfterLeaving', event.target.value)}>
                <option value="">اختر</option>
                <option value="NONE">لا توجد مشكلة</option>
                <option value="MINOR">نعم، مشكلة بسيطة</option>
                <option value="NEEDS_FOLLOW_UP">نعم، مشكلة تحتاج متابعة</option>
              </select>
            </label>

            <label>
              هل تنصح بالتعامل مع شركة دلتا بلس مرة أخرى؟
              <select required value={answers.recommendAgain} onChange={(event) => setField('recommendAgain', event.target.value)}>
                <option value="">اختر</option>
                <option value="YES">نعم</option>
                <option value="NO">لا</option>
                <option value="MAYBE">ربما</option>
              </select>
            </label>

            <label className="customer-public-wide">ملاحظات أو اقتراحات الزبون<textarea rows={4} value={answers.customerNotes} onChange={(event) => setField('customerNotes', event.target.value)} /></label>
            <button type="submit" disabled={submitting}>{submitting ? 'جاري الإرسال...' : 'إرسال التقييم'}</button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
