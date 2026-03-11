export default function KpiCard({ label, value, hint, tone = 'default' }) {
  return (
    <article className={`kpi card ${tone}`}>
      <p>{label}</p>
      <h3>{value}</h3>
      {hint ? <small>{hint}</small> : null}
    </article>
  );
}
