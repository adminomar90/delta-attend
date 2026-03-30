'use client';

const normalizeLocalizedDigits = (value) =>
  String(value ?? '')
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));

const clampProgress = (value) => {
  const numericValue = Number(normalizeLocalizedDigits(value));
  if (Number.isNaN(numericValue)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round(numericValue)));
};

const resolveProgressColor = (progress) => {
  if (progress >= 80) return '#27ae60';
  if (progress >= 50) return '#2980b9';
  return '#e67e22';
};

export default function ProgressGauge({ value = 0, className = '' }) {
  const progress = clampProgress(value);
  const progressColor = resolveProgressColor(progress);

  return (
    <div className={`work-report-progress ${className}`.trim()}>
      <div
        className="work-report-progress-gauge"
        style={{
          '--progress-value': `${progress}%`,
          '--progress-color': progressColor,
        }}
        aria-hidden="true"
      >
        <span>{progress}%</span>
      </div>

      <div className="work-report-progress-main">
        <div className="work-report-progress-track">
          <div
            className="work-report-progress-bar"
            style={{
              width: `${progress}%`,
              background: progressColor,
            }}
          />
        </div>
      </div>

      <strong className="work-report-progress-value">{progress}%</strong>
    </div>
  );
}
