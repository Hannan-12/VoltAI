import './Skeleton.css'

export function SkeletonCard({ rows = 3 }) {
  return (
    <div className="skeleton-card glass-card">
      <div className="skeleton-title" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-row" style={{ width: `${75 + (i % 3) * 8}%` }} />
      ))}
    </div>
  )
}

export function SkeletonMetricGrid() {
  return (
    <div className="skeleton-metric-grid">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="skeleton-metric glass-card">
          <div className="skeleton-circle" />
          <div className="skeleton-metric-body">
            <div className="skeleton-row short" />
            <div className="skeleton-row xshort" />
          </div>
        </div>
      ))}
    </div>
  )
}
