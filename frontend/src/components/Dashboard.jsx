import { useState, useEffect, useRef, useCallback } from 'react'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { api } from '../services/api'
import { SkeletonMetricGrid } from './Skeleton'
import './Dashboard.css'

const SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vS-6G97-09OKa0ogiNKnMQIKx6-caMw404tz1eAr95HV9yRzwT51_dA5toc7dF3shJdzporH5p2z6sf/pub?output=csv'

const MEAN_PF = 0.676
const REFRESH_MS = 3 * 60 * 1000  // 3 minutes
const ROWS_TO_SHOW = 20

const LABEL_ICONS = {
  Iron:                '🧲',
  LED_Bulbs:           '💡',
  Mixed_Load:          '🔌',
  Mobile_Charger:      '📱',
  Refrigerator_ACTIVE: '❄️',
  Refrigerator_IDLE:   '🧊',
  WashingMachine_SPIN: '🌀',
  WashingMachine_WASH: '🫧',
  Water_Pump:          '💧',
}

const CHART_COLORS = [
  '#f59e0b', '#f43f5e', '#22c55e', '#3b82f6',
  '#a855f7', '#ec4899', '#14b8a6', '#f97316', '#64748b',
]

async function fetchLast20Rows() {
  const res = await fetch(`${SHEET_CSV_URL}&_=${Date.now()}`, { cache: 'no-store' })
  const text = await res.text()
  const lines = text.trim().split('\n').filter(Boolean)
  if (lines.length < 2) throw new Error('No data in sheet')
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  const dataLines = lines.slice(1)
  const last20 = dataLines.slice(-ROWS_TO_SHOW)
  return last20.map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
    const row = {}
    headers.forEach((h, i) => { row[h] = vals[i] ?? '' })
    return row
  })
}

function buildFeatures(row) {
  const voltage     = parseFloat(row['Voltage'])
  const current     = parseFloat(row['Current'])
  const power       = parseFloat(row['Power'])
  const energy      = parseFloat(row['Energy'])
  const frequency   = parseFloat(row['Frequency'])
  const powerFactor = parseFloat(row['Power Factor'])
  const apparent_power         = voltage * current
  const reactive_power         = Math.sqrt(Math.max(apparent_power ** 2 - power ** 2, 0))
  const power_factor_deviation = Math.abs(powerFactor - MEAN_PF)
  return {
    Voltage: voltage, Current: current, Power: power,
    Energy: energy, Frequency: frequency, 'Power Factor': powerFactor,
    apparent_power, reactive_power, power_factor_deviation,
  }
}

function confidenceColor(c) {
  if (c >= 0.9) return '#22c55e'
  if (c >= 0.7) return '#f59e0b'
  return '#f43f5e'
}

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

function CountdownBar({ refreshMs, lastFetch }) {
  const [pct, setPct] = useState(100)
  useEffect(() => {
    const id = setInterval(() => {
      const elapsed = Date.now() - lastFetch
      setPct(Math.max(0, 100 - (elapsed / refreshMs) * 100))
    }, 500)
    return () => clearInterval(id)
  }, [lastFetch, refreshMs])

  const secs = Math.max(0, Math.round((refreshMs - (Date.now() - lastFetch)) / 1000))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
      <div style={{ flex: 1, height: 4, background: 'var(--surface-4)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: 'linear-gradient(90deg, #f59e0b, #f43f5e)',
          borderRadius: 4, transition: 'width 0.5s linear',
        }} />
      </div>
      <span>Next refresh in {secs}s</span>
    </div>
  )
}

export default function Dashboard() {
  const [rows, setRows]         = useState([])          // [{sheetRow, result}]
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [lastFetch, setLastFetch] = useState(null)
  const [metrics, setMetrics]   = useState(null)
  const [metricsLoading, setMetricsLoading] = useState(true)
  const intervalRef = useRef(null)

  useEffect(() => {
    api.evaluate()
      .then(d => { setMetrics(d); setMetricsLoading(false) })
      .catch(() => { setMetrics(null); setMetricsLoading(false) })
  }, [])

  const fetchAndClassify = useCallback(async () => {
    try {
      setError(null)
      const sheetRows = await fetchLast20Rows()
      const featureRows = sheetRows.map(buildFeatures)
      const { results } = await api.predictBatch(featureRows)
      setRows(sheetRows.map((r, i) => ({ sheetRow: r, result: results[i] })))
      setLastFetch(Date.now())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAndClassify()
    intervalRef.current = setInterval(fetchAndClassify, REFRESH_MS)
    return () => clearInterval(intervalRef.current)
  }, [fetchAndClassify])

  // Most recent row
  const latest = rows[rows.length - 1]

  // Donut chart data — label distribution
  const labelCounts = {}
  rows.forEach(({ result }) => {
    const l = result?.predicted_label
    if (l) labelCounts[l] = (labelCounts[l] || 0) + 1
  })
  const chartData = Object.entries(labelCounts)
    .map(([name, count]) => ({ name: name.replace(/_/g, ' '), count, pct: ((count / rows.length) * 100).toFixed(1) }))
    .sort((a, b) => b.count - a.count)

  const fmt = (val) => val != null ? (val * 100).toFixed(2) + '%' : '—'

  return (
    <div className="dashboard">

      {/* ── Hero ── */}
      <section className="page-hero">
        <div className="page-hero-left">
          <div className="page-hero-eyebrow">
            <span className="live-dot" />
            Live · refreshes every 3 min
          </div>
          <h1 className="page-hero-title">VoltaAI<br />Load Intelligence</h1>
          <p className="page-hero-desc">
            Real-time appliance classification from your PZEM meter via Google Sheets.
          </p>
          {lastFetch && (
            <div style={{ marginTop: 12 }}>
              <CountdownBar refreshMs={REFRESH_MS} lastFetch={lastFetch} />
            </div>
          )}
        </div>
        <div className="page-hero-right">
          {metricsLoading ? <SkeletonMetricGrid /> : (
            <div className="metric-grid">
              <MetricCard icon="🎯" value={metrics ? fmt(metrics.accuracy) : '—'} label="Accuracy"          sub="Test set"       highlight />
              <MetricCard icon="📊" value={metrics ? fmt(metrics.f1_score) : '—'} label="F1 Score"          sub="Weighted avg" />
              <MetricCard icon="🏷️" value="9"                                      label="Appliance Classes"  sub="Trained labels" />
              <MetricCard icon="🗃️" value="359K"                                   label="Training Samples"   sub="PZEM readings" />
              <MetricCard icon="🤖" value="XGBoost"                                label="Model"              sub="200 estimators" />
              <MetricCard icon="🔢" value="9"                                      label="Features"           sub="Auto-computed" />
            </div>
          )}
        </div>
      </section>

      {error && <div className="predict-error" style={{ marginBottom: '1rem' }}>⚠ {error}</div>}

      {/* ── Latest result summary ── */}
      {latest && (
        <div className="glass-card" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '2.5rem' }}>{LABEL_ICONS[latest.result?.predicted_label] ?? '⚡'}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: 4 }}>LATEST READING</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {latest.result?.predicted_label?.replace(/_/g, ' ') ?? '—'}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 2 }}>
              {latest.sheetRow['Time']} &nbsp;·&nbsp;
              {latest.sheetRow['Power']} W &nbsp;·&nbsp;
              PF {latest.sheetRow['Power Factor']}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: confidenceColor(latest.result?.confidence ?? 0) }}>
              {latest.result ? (latest.result.confidence * 100).toFixed(1) + '%' : '—'}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', letterSpacing: '0.08em' }}>CONFIDENCE</div>
          </div>
        </div>
      )}

      {/* ── Table + Chart ── */}
      <div className="two-col predict-layout" style={{ alignItems: 'start' }}>

        {/* Table */}
        <div className="glass-card" style={{ overflowX: 'auto' }}>
          <div className="section-title" style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Last {ROWS_TO_SHOW} Readings</span>
            {loading && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Loading…</span>}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
                {['Time', 'V', 'A', 'W', 'PF', 'Appliance', 'Confidence'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading ? (
                <tr><td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No data yet</td></tr>
              ) : (
                [...rows].reverse().map(({ sheetRow, result }, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i === 0 ? 'rgba(245,158,11,0.05)' : 'transparent' }}>
                    <td style={{ padding: '7px 10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {sheetRow['Time']?.split(' ')[1] ?? sheetRow['Time']}
                    </td>
                    <td style={{ padding: '7px 10px' }}>{sheetRow['Voltage']}</td>
                    <td style={{ padding: '7px 10px' }}>{sheetRow['Current']}</td>
                    <td style={{ padding: '7px 10px' }}>{sheetRow['Power']}</td>
                    <td style={{ padding: '7px 10px' }}>{sheetRow['Power Factor']}</td>
                    <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                      <span>{LABEL_ICONS[result?.predicted_label]} </span>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                        {result?.predicted_label?.replace(/_/g, ' ') ?? '—'}
                      </span>
                    </td>
                    <td style={{ padding: '7px 10px' }}>
                      <span style={{ fontWeight: 700, color: confidenceColor(result?.confidence ?? 0) }}>
                        {result ? (result.confidence * 100).toFixed(1) + '%' : '—'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Donut chart */}
        <div className="glass-card" style={{ minHeight: 380 }}>
          <div className="section-title" style={{ marginBottom: '0.5rem' }}>
            Appliance Distribution
          </div>
          <p className="predict-hint" style={{ marginBottom: '1rem' }}>
            Last {rows.length} readings from Google Sheets
          </p>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="count"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={110}
                  paddingAngle={3}
                  label={({ name, pct }) => `${pct}%`}
                  labelLine={false}
                >
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val, name, props) => [`${props.payload.pct}% (${val} readings)`, props.payload.name]}
                  contentStyle={{ background: '#1a2235', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, fontSize: '0.82rem' }}
                />
                <Legend
                  formatter={(value) => <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              {loading ? 'Loading…' : 'No data'}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
