import { useState, useEffect } from 'react'
import { api } from '../services/api'
import { SkeletonCard } from './Skeleton'
import './Scheduler.css'

const URGENCY_META = {
  high:   { label: 'Action Needed', color: '#ef4444', bg: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.25)',  icon: '🔴' },
  medium: { label: 'Recommended',   color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)', icon: '🟡' },
  none:   { label: 'Optimal',       color: '#22c55e', bg: 'rgba(34,197,94,0.1)',  border: 'rgba(34,197,94,0.25)',  icon: '🟢' },
}

const ACTION_META = {
  shift:  { label: 'Shift to Off-Peak', icon: '⏰' },
  reduce: { label: 'Reduce Usage',      icon: '📉' },
  keep:   { label: 'Keep Running',      icon: '✅' },
  ok:     { label: 'No Action Needed',  icon: '✔️'  },
}

function PeakBanner({ start, end }) {
  const fmt = (h) => {
    const period = h >= 12 ? 'PM' : 'AM'
    const hour = h > 12 ? h - 12 : h
    return `${hour}:00 ${period}`
  }
  return (
    <div className="peak-banner">
      <div className="peak-banner-left">
        <div className="peak-icon">⚡</div>
        <div>
          <div className="peak-title">Peak Hours</div>
          <div className="peak-range">{fmt(start)} — {fmt(end)}</div>
        </div>
      </div>
      <p className="peak-desc">
        Electricity demand and cost are highest during peak hours. Shifting heavy appliances
        to before {fmt(start)} or after {fmt(end)} reduces your bill and grid load.
      </p>
    </div>
  )
}

function SuggestionCard({ suggestion }) {
  const urgency = URGENCY_META[suggestion.urgency] ?? URGENCY_META.none
  const action  = ACTION_META[suggestion.action]  ?? ACTION_META.ok

  return (
    <div
      className="sug-card"
      style={{ borderColor: urgency.border, background: urgency.bg }}
    >
      <div className="sug-card-top">
        <div className="sug-name-row">
          <span className="sug-urgency-dot" style={{ color: urgency.color }}>{urgency.icon}</span>
          <span className="sug-name">{suggestion.name}</span>
          <span className="sug-action-badge" style={{ color: urgency.color, borderColor: urgency.border }}>
            {action.icon} {action.label}
          </span>
        </div>
        <div className="sug-meta">
          <span className="sug-meta-item">{suggestion.energy_kwh_day} kWh/day</span>
          <span className="sug-meta-sep">·</span>
          <span className="sug-meta-item">{suggestion.contribution_pct}% of total</span>
          {suggestion.saving_kwh > 0 && (
            <>
              <span className="sug-meta-sep">·</span>
              <span className="sug-saving">Save ~{suggestion.saving_kwh} kWh/day</span>
            </>
          )}
        </div>
      </div>
      <p className="sug-reason">{suggestion.reason}</p>
      {suggestion.steps && suggestion.steps.length > 0 && suggestion.urgency !== 'none' && (
        <ul className="sug-steps">
          {suggestion.steps.map((step, i) => (
            <li key={i} className="sug-step">{step}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function Scheduler() {
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(null)

  useEffect(() => {
    api.getSchedule()
      .then(d  => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const highCount   = data?.suggestions.filter(s => s.urgency === 'high').length   ?? 0
  const mediumCount = data?.suggestions.filter(s => s.urgency === 'medium').length ?? 0

  return (
    <div className="sched-page">
      <header className="sub-page-header">
        <div className="sph-left">
          <span className="sph-page-icon">🗓️</span>
          <h1 className="sph-title">Smart Scheduling</h1>
          <p className="sph-desc">Rule-based recommendations to shift heavy loads away from peak hours and reduce your electricity cost.</p>
        </div>
        {data && data.suggestions.length > 0 && (
          <div className="sph-stats">
            <div className="sph-stat">
              <span className="sph-stat-value">{data.total_potential_saving_kwh}</span>
              <span className="sph-stat-label">kWh Saving/Day</span>
            </div>
            <div className="sph-stat">
              <span className="sph-stat-value">{data.total_potential_saving_month}</span>
              <span className="sph-stat-label">kWh Saving/Mo</span>
            </div>
            <div className="sph-stat">
              <span className="sph-stat-value" style={{ color: '#f43f5e' }}>{highCount}</span>
              <span className="sph-stat-label">Action Needed</span>
            </div>
            <div className="sph-stat">
              <span className="sph-stat-value" style={{ color: '#f59e0b' }}>{mediumCount}</span>
              <span className="sph-stat-label">Recommended</span>
            </div>
          </div>
        )}
      </header>

      <div className="sched-body">
        {loading && <SkeletonCard rows={4} />}

        {error && (
          <div className="glass-card sched-empty" style={{ color: '#f87171' }}>
            {error}
          </div>
        )}

        {!loading && !error && data && (
          <>
            {/* Peak hours info */}
            <PeakBanner start={data.peak_hours.start} end={data.peak_hours.end} />

            {data.suggestions.length === 0 ? (
              <div className="glass-card sched-empty">
                <div style={{ fontSize: '2rem', opacity: 0.25 }}>📋</div>
                <p>{data.message ?? 'No appliances found. Add appliances in the Load Manager tab first.'}</p>
              </div>
            ) : (
              <div className="glass-card">
                <div className="section-title">Suggestions</div>

                {/* Legend */}
                <div className="sug-legend">
                  {Object.entries(URGENCY_META).map(([key, m]) => (
                    <span key={key} className="sug-legend-item">
                      {m.icon} <span style={{ color: m.color }}>{m.label}</span>
                    </span>
                  ))}
                </div>

                <div className="sug-list">
                  {data.suggestions.map(s => (
                    <SuggestionCard key={s.load_id} suggestion={s} />
                  ))}
                </div>

                {/* Summary */}
                {data.total_potential_saving_kwh > 0 && (
                  <div className="sug-summary">
                    <div className="sug-summary-icon">💰</div>
                    <div>
                      <div className="sug-summary-title">Total Potential Saving</div>
                      <p className="sug-summary-text">
                        By following the suggestions above, you can save up to{' '}
                        <strong>{data.total_potential_saving_kwh} kWh/day</strong> and{' '}
                        <strong>{data.total_potential_saving_month} kWh/month</strong>.
                        This is the estimated reduction if you shift or reduce the flagged appliances.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
