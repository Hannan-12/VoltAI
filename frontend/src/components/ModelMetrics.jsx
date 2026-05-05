export default function ModelMetrics({ metrics }) {
  const cards = [
    { label: 'Accuracy', value: metrics.accuracy, color: '#6366f1' },
    { label: 'Precision', value: metrics.precision, color: '#22c55e' },
    { label: 'Recall', value: metrics.recall, color: '#f59e0b' },
    { label: 'F1 Score', value: metrics.f1_score, color: '#ec4899' },
    { label: 'ROC-AUC', value: metrics.roc_auc, color: '#14b8a6' },
  ]

  return (
    <div className="metrics-grid">
      {cards.map(({ label, value, color }) => (
        <div className="metric-card" key={label}>
          <div className="metric-label">{label}</div>
          <div className="metric-value" style={{ color }}>
            {value != null ? (value * 100).toFixed(2) + '%' : 'N/A'}
          </div>
        </div>
      ))}
    </div>
  )
}
