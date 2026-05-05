import { useState, useEffect } from 'react'
import { api } from '../services/api'
import { useToast } from './Toast'
import { SkeletonCard } from './Skeleton'
import './Alerts.css'

const LEVEL_META = {
  critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.3)',  icon: '🚨', bar: '#ef4444' },
  warning:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', icon: '⚠️', bar: '#f59e0b' },
  ok:       { color: '#22c55e', bg: 'rgba(34,197,94,0.1)',  border: 'rgba(34,197,94,0.3)',  icon: '✅', bar: '#22c55e' },
}

function UsageGauge({ pct, exceeded }) {
  const clamped = Math.min(pct ?? 0, 100)
  const color = exceeded ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#22c55e'
  return (
    <div className="gauge-wrap">
      <div className="gauge-track">
        <div
          className="gauge-fill"
          style={{ width: `${clamped}%`, background: color }}
        />
        {/* threshold line at 100% */}
        <div className="gauge-threshold-line" title="Threshold" />
      </div>
      <div className="gauge-labels">
        <span className="gauge-label-left">0 kWh</span>
        <span className="gauge-label-pct" style={{ color }}>
          {pct != null ? `${pct}%` : '—'}
        </span>
        <span className="gauge-label-right">Threshold</span>
      </div>
    </div>
  )
}

function AlertCard({ alert }) {
  const meta = LEVEL_META[alert.level] ?? LEVEL_META.ok
  return (
    <div className="alert-card" style={{ borderColor: meta.border, background: meta.bg }}>
      <div className="alert-card-top">
        <span className="alert-icon">{meta.icon}</span>
        <span className="alert-title" style={{ color: meta.color }}>{alert.title}</span>
      </div>
      <p className="alert-msg">{alert.message}</p>
    </div>
  )
}

export default function Alerts() {
  const toast = useToast()
  const [status, setStatus]       = useState(null)
  const [loading, setLoading]     = useState(true)
  const [threshold, setThreshold] = useState('')
  const [saving, setSaving]       = useState(false)
  const [formError, setFormError] = useState(null)
  const [saveOk, setSaveOk]       = useState(false)

  async function refresh() {
    setLoading(true)
    try {
      const s = await api.getAlertStatus()
      setStatus(s)
      if (s.threshold_kwh != null) setThreshold(String(s.threshold_kwh))
    } catch {
      // keep stale
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  async function handleSave(e) {
    e.preventDefault()
    setFormError(null)
    setSaveOk(false)
    const val = parseFloat(threshold)
    if (!threshold || isNaN(val) || val <= 0) {
      setFormError('Please enter a valid positive number.')
      return
    }
    setSaving(true)
    try {
      await api.setThreshold(val)
      setSaveOk(true)
      await refresh()
      toast(`Threshold set to ${val} kWh/day`)
      setTimeout(() => setSaveOk(false), 3000)
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const mainAlert = status?.alerts?.find(a => ['critical','warning','ok'].includes(a.level))
  const perLoadAlerts = status?.alerts?.filter(a => a.level === 'warning' && a !== mainAlert) ?? []

  return (
    <div className="alerts-page">
      <header className="sub-page-header">
        <div className="sph-left">
          <span className="sph-page-icon">🔔</span>
          <h1 className="sph-title">Energy Alerts</h1>
          <p className="sph-desc">Set a daily kWh threshold. Get alerted when consumption approaches or exceeds your limit.</p>
        </div>
        {status && status.threshold_set && (
          <div className="sph-stats">
            <div className="sph-stat">
              <span className="sph-stat-value">{status.total_kwh}</span>
              <span className="sph-stat-label">kWh Today</span>
            </div>
            <div className="sph-stat">
              <span className="sph-stat-value">{status.threshold_kwh}</span>
              <span className="sph-stat-label">kWh Limit</span>
            </div>
            <div className="sph-stat">
              <span className="sph-stat-value" style={{ color: status.exceeded ? '#f43f5e' : status.usage_pct >= 80 ? '#f59e0b' : '#22c55e' }}>
                {status.usage_pct}%
              </span>
              <span className="sph-stat-label">Used</span>
            </div>
            <div className="sph-stat">
              <span className="sph-stat-value">{status.load_count}</span>
              <span className="sph-stat-label">Appliances</span>
            </div>
          </div>
        )}
      </header>

      <div className="alerts-body">
        {/* ── Threshold Form ── */}
        <div className="glass-card">
          <div className="section-title">Set Daily Threshold</div>
          <p className="alerts-hint">
            Enter your maximum acceptable daily energy consumption. You will be alerted when
            your appliances' combined usage approaches or exceeds this value.
          </p>
          <form className="threshold-form" onSubmit={handleSave}>
            <div className="threshold-input-row">
              <div className="threshold-input-wrap">
                <input
                  className="threshold-input"
                  type="number"
                  step="any"
                  min="0.1"
                  placeholder="e.g. 20"
                  value={threshold}
                  onChange={e => setThreshold(e.target.value)}
                />
                <span className="threshold-unit">kWh / day</span>
              </div>
              <button className="lm-btn primary" type="submit" disabled={saving}>
                {saving ? <><span className="spinner" /> Saving…</> : saveOk ? '✓ Saved' : 'Set Threshold'}
              </button>
            </div>
            {formError && <div className="lf-error" style={{ marginTop: '0.75rem' }}>{formError}</div>}
          </form>
        </div>

        {/* ── Status ── */}
        {loading ? (
          <SkeletonCard rows={3} />
        ) : !status ? null : !status.threshold_set ? (
          <div className="glass-card alerts-empty">
            <div style={{ fontSize: '2rem', opacity: 0.25 }}>🔔</div>
            <p>No threshold set yet. Enter a value above to start monitoring.</p>
          </div>
        ) : (
          <>
            {/* Usage gauge */}
            <div className="glass-card">
              <div className="section-title">Usage vs Threshold</div>
              <div className="usage-numbers">
                <div className="usage-num">
                  <span className="usage-val">{status.total_kwh}</span>
                  <span className="usage-label">kWh / day (current)</span>
                </div>
                <div className="usage-divider">/</div>
                <div className="usage-num">
                  <span className="usage-val">{status.threshold_kwh}</span>
                  <span className="usage-label">kWh / day (threshold)</span>
                </div>
              </div>
              <UsageGauge pct={status.usage_pct} exceeded={status.exceeded} />
            </div>

            {/* Alert cards */}
            <div className="glass-card">
              <div className="section-title">Active Alerts</div>
              <div className="alerts-list">
                {status.alerts.length === 0 ? (
                  <p style={{ color: '#475569', fontSize: '0.875rem' }}>No alerts.</p>
                ) : (
                  status.alerts.map((a, i) => <AlertCard key={i} alert={a} />)
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
