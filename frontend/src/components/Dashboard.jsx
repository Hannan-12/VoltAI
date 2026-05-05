import { useState, useEffect } from 'react'
import { api } from '../services/api'
import PredictionForm from './PredictionForm'
import PredictionResult from './PredictionResult'
import { SkeletonMetricGrid } from './Skeleton'
import './Dashboard.css'

function MetricCard({ icon, value, label, sub, highlight }) {
  return (
    <div className={`metric-card ${highlight ? 'highlight' : ''}`}>
      <div className="metric-icon">{icon}</div>
      <div className="metric-body">
        <div className="metric-value">{value}</div>
        <div className="metric-label">{label}</div>
        {sub && <div className="metric-sub">{sub}</div>}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [predResult, setPredResult] = useState(null)
  const [metrics, setMetrics]       = useState(null)
  const [metricsLoading, setMetricsLoading] = useState(true)

  useEffect(() => {
    api.evaluate()
      .then(d  => { setMetrics(d); setMetricsLoading(false) })
      .catch(() => { setMetrics(null); setMetricsLoading(false) })
  }, [])

  const fmt = (val) => val != null ? (val * 100).toFixed(2) + '%' : '—'

  return (
    <div className="dashboard">

      {/* ── Page Hero ── */}
      <section className="page-hero">
        <div className="page-hero-left">
          <div className="page-hero-eyebrow">
            <span className="live-dot" />
            Model Active
          </div>
          <h1 className="page-hero-title">VoltaAI<br />Load Intelligence</h1>
          <p className="page-hero-desc">
            Enter live PZEM sensor readings to instantly classify the connected
            appliance using the trained XGBoost model — 9 classes, 99%+ accuracy.
          </p>
        </div>
        <div className="page-hero-right">
          {metricsLoading ? (
            <SkeletonMetricGrid />
          ) : (
            <div className="metric-grid">
              <MetricCard icon="🎯" value={metrics ? fmt(metrics.accuracy) : '—'} label="Accuracy"        sub="Test set" highlight />
              <MetricCard icon="📊" value={metrics ? fmt(metrics.f1_score) : '—'} label="F1 Score"        sub="Weighted avg" />
              <MetricCard icon="🏷️" value="9"                                      label="Appliance Classes" sub="Trained labels" />
              <MetricCard icon="🗃️" value="359K"                                   label="Training Samples" sub="PZEM readings" />
              <MetricCard icon="🤖" value="XGBoost"                                label="Model"           sub="200 estimators" />
              <MetricCard icon="🔢" value="9"                                      label="Features"        sub="Auto-computed" />
            </div>
          )}
        </div>
      </section>

      {/* ── Predict ── */}
      <div className="two-col predict-layout">
        <PredictionForm onResult={setPredResult} />
        <PredictionResult result={predResult} />
      </div>
    </div>
  )
}
