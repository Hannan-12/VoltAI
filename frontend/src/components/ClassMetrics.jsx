export default function ClassMetrics({ perClass }) {
  const rows = Object.entries(perClass).map(([cls, m]) => ({ cls, ...m }))

  function badge(value) {
    const pct = value * 100
    const color = pct >= 95 ? '#22c55e' : pct >= 80 ? '#f59e0b' : '#ef4444'
    return <span style={{ color, fontWeight: 600 }}>{pct.toFixed(1)}%</span>
  }

  return (
    <div className="section">
      <h2 className="section-title">Per-Class Metrics</h2>
      <div className="table-wrapper">
        <table className="class-table">
          <thead>
            <tr>
              <th>Class</th>
              <th>Precision</th>
              <th>Recall</th>
              <th>F1 Score</th>
              <th>Support</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ cls, precision, recall, f1_score, support }) => (
              <tr key={cls}>
                <td className="class-name">{cls}</td>
                <td>{badge(precision)}</td>
                <td>{badge(recall)}</td>
                <td>{badge(f1_score)}</td>
                <td className="support">{Number(support).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
