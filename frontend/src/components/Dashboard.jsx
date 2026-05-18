import { useState, useEffect, useRef, useCallback } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { api } from '../services/api'
import './Dashboard.css'

// ─── Constants ────────────────────────────────────────────────

const SHEET_URL   = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQbSJRflh9OFloDKHNzHKO3LvdamJhjulEWgospOAYP2dOgD3JEX6dfQOrLkBf2Iehrl1kPAr0phvhr/pub?gid=0&single=true&output=csv'
const POLL_MS     = 5000     // poll sheet every 5 seconds
const HISTORY_MAX = 60       // rolling window for sparkline

const LABEL_ICONS = {
  Ceiling_Fan:         '🌀',
  Iron:                '🧲',
  LED_Bulbs:           '💡',
  Microwave_Oven:      '🍳',
  Mixed_Load:          '🔌',
  Phone_Charger:       '📱',
  Refrigerator_ACTIVE: '❄️',
  Refrigerator_IDLE:   '🧊',
  Standby_Load:        '😴',
  Unknown_Load:        '💡',
  WashingMachine_SPIN: '🌊',
  WashingMachine_WASH: '🫧',
  Water_Pump:          '💧',
}

const CHART_COLORS = [
  '#f59e0b', '#f43f5e', '#22c55e', '#3b82f6', '#a855f7',
  '#ec4899', '#14b8a6', '#f97316', '#64748b', '#06b6d4',
  '#84cc16', '#e879f9', '#fb923c',
]

const PKR_PER_KWH = 30

const LABEL_DISPLAY = {
  Unknown_Load: 'Fan / Light',
}

function formatLabel(raw) {
  return LABEL_DISPLAY[raw] ?? raw.replace(/_/g, ' ')
}

// ─── Helpers ──────────────────────────────────────────────────

function powerColor(w) {
  if (w < 300)  return '#22c55e'
  if (w < 1000) return '#f59e0b'
  return '#f43f5e'
}

function confidenceBadgeStyle(conf) {
  if (conf >= 90) return { background: 'rgba(34,197,94,0.15)',  color: '#22c55e',  border: '1px solid rgba(34,197,94,0.3)'  }
  if (conf >= 70) return { background: 'rgba(245,158,11,0.15)', color: '#f59e0b',  border: '1px solid rgba(245,158,11,0.3)' }
  return               { background: 'rgba(244,63,94,0.15)',  color: '#f43f5e',  border: '1px solid rgba(244,63,94,0.3)'  }
}

async function fetchLatestRow() {
  const url = `${SHEET_URL}&_=${Date.now()}`
  const res  = await fetch(url, { cache: 'no-store' })
  const text = await res.text()
  const lines = text.trim().split('\n').filter(Boolean)
  if (lines.length < 2) throw new Error('No data in sheet')
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim())
  // last row = most recent reading
  const vals = lines[lines.length - 1].split(',').map(v => v.replace(/^"|"$/g, '').trim())
  const row = {}
  headers.forEach((h, i) => { row[h] = vals[i] ?? '' })
  return row
}

// ─── Sub-components ───────────────────────────────────────────

function GaugeStat({ label, value, unit, color }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)', borderRadius: 12,
      padding: '14px 18px', flex: 1, minWidth: 100,
      borderBottom: `3px solid ${color || 'var(--accent)'}`,
    }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: color || 'var(--text-primary)' }}>
        {value} <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-secondary)' }}>{unit}</span>
      </div>
    </div>
  )
}

function ApplianceCard({ result, sheetRow, sessionStart }) {
  if (!result) return null
  const conf = result.confidence
  const isUncertain = conf < 60
  const power = parseFloat(sheetRow?.Power) || result.estimated_power_w || 0
  const runMins = sessionStart ? Math.floor((Date.now() - sessionStart) / 60000) : 0
  const costRs = ((power / 1000) * (runMins / 60) * PKR_PER_KWH).toFixed(2)
  const displayLabel = formatLabel(result.appliance)

  return (
    <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap', padding: '1.5rem 2rem' }}>
      <div style={{ fontSize: '3.5rem', lineHeight: 1 }}>
        {LABEL_ICONS[result.appliance] ?? '⚡'}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: 4 }}>
          ACTIVE APPLIANCE
        </div>
        <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.1 }}>
          {displayLabel}
          {isUncertain && (
            <span style={{ fontSize: '1rem', fontWeight: 600, color: '#f59e0b', marginLeft: 10 }}>⚠️ Low confidence</span>
          )}
        </div>
        <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {runMins > 0 && (
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              Running {runMins}m · Cost Rs. {costRs}
            </span>
          )}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '2.2rem', fontWeight: 900, color: powerColor(power) }}>
          {power.toFixed(0)} <span style={{ fontSize: '1rem', fontWeight: 500 }}>W</span>
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', letterSpacing: '0.08em' }}>EST. POWER</div>
      </div>
    </div>
  )
}

function Top3Table({ top3 }) {
  if (!top3?.length) return null
  return (
    <div>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: 8 }}>TOP PREDICTIONS</div>
      {top3.map((t, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ width: 20, color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{i + 1}</span>
          <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
            {LABEL_ICONS[t.label] ?? '⚡'} {formatLabel(t.label)}
          </span>
          <div style={{ width: 120, background: 'var(--surface-4)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
            <div style={{ width: `${(t.probability * 100).toFixed(1)}%`, height: '100%', background: i === 0 ? '#f59e0b' : '#64748b', borderRadius: 4 }} />
          </div>
          <span style={{ width: 44, textAlign: 'right', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            {(t.probability * 100).toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  )
}

function SparkLine({ data, color }) {
  if (!data.length) return null
  return (
    <ResponsiveContainer width="100%" height={120}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey="t" tick={{ fontSize: 9, fill: '#64748b' }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 9, fill: '#64748b' }} />
        <Tooltip
          contentStyle={{ background: '#1a2235', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, fontSize: '0.78rem' }}
          formatter={(v) => [`${v.toFixed(1)} W`, 'Power']}
        />
        <Line type="monotone" dataKey="w" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

function LabelPieChart({ history }) {
  const counts = {}
  history.forEach(h => {
    if (h.appliance) counts[h.appliance] = (counts[h.appliance] || 0) + 1
  })
  const data = Object.entries(counts)
    .map(([name, count]) => ({ name: formatLabel(name), count }))
    .sort((a, b) => b.count - a.count)

  if (!data.length) return null
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} dataKey="count" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3}>
          {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
        </Pie>
        <Tooltip
          contentStyle={{ background: '#1a2235', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, fontSize: '0.78rem' }}
        />
        <Legend formatter={v => <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{v}</span>} />
      </PieChart>
    </ResponsiveContainer>
  )
}

// ─── Main component ───────────────────────────────────────────

export default function Dashboard() {
  const [latest, setLatest]         = useState(null)   // { sheetRow, result }
  const [powerHistory, setPowerHistory] = useState([]) // [{t, w}]
  const [labelHistory, setLabelHistory] = useState([]) // [{appliance}]
  const [sessionStart, setSessionStart] = useState(null)
  const [sessionLabel, setSessionLabel] = useState(null)
  const [error, setError]           = useState(null)
  const [connected, setConnected]   = useState(false)
  const [lastTime, setLastTime]     = useState(null)
  const intervalRef = useRef(null)
  const prevLabelRef = useRef(null)

  const pollAndClassify = useCallback(async () => {
    try {
      const row = await fetchLatestRow()

      // Skip if same timestamp as before (sheet hasn't updated yet)
      if (row['Time'] && row['Time'] === lastTime) return
      setLastTime(row['Time'])

      const result = await api.predictBoth({
        Voltage:        parseFloat(row['Voltage'])      || 0,
        Current:        parseFloat(row['Current'])      || 0,
        Power:          parseFloat(row['Power'])        || 0,
        Frequency:      parseFloat(row['Frequency'])    || 0,
        'Power Factor': parseFloat(row['Power Factor']) || 0,
        timestamp:      row['Time'] || new Date().toISOString(),
      })

      setLatest({ sheetRow: row, result })
      setConnected(true)
      setError(null)

      // Rolling power history for sparkline
      const t = row['Time']?.split(' ')[1]?.slice(0, 5) ?? new Date().toLocaleTimeString().slice(0, 5)
      setPowerHistory(h => [...h.slice(-(HISTORY_MAX - 1)), { t, w: result.estimated_power_w }])
      setLabelHistory(h => [...h.slice(-(HISTORY_MAX - 1)), { appliance: result.appliance }])

      // Track session duration per appliance
      if (result.appliance !== prevLabelRef.current) {
        setSessionStart(Date.now())
        setSessionLabel(result.appliance)
        prevLabelRef.current = result.appliance
      }
    } catch (err) {
      setConnected(false)
      setError(err.message)
    }
  }, [lastTime])

  useEffect(() => {
    pollAndClassify()
    intervalRef.current = setInterval(pollAndClassify, POLL_MS)
    return () => clearInterval(intervalRef.current)
  }, [pollAndClassify])

  const result   = latest?.result
  const sheetRow = latest?.sheetRow
  const voltage  = sheetRow ? parseFloat(sheetRow['Voltage'])       : null
  const current  = sheetRow ? parseFloat(sheetRow['Current'])       : null
  const power    = sheetRow ? parseFloat(sheetRow['Power'])         : null
  const pf       = sheetRow ? parseFloat(sheetRow['Power Factor'])  : null
  const freq     = sheetRow ? parseFloat(sheetRow['Frequency'])     : null

  return (
    <div className="dashboard" style={{ maxWidth: 1200, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-primary)' }}>
            ⚡ Live Monitor
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Real-time appliance detection from meter · polls every 5s
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: connected ? 'rgba(34,197,94,0.12)' : 'rgba(244,63,94,0.12)',
            color: connected ? '#22c55e' : '#f43f5e',
            border: `1px solid ${connected ? 'rgba(34,197,94,0.3)' : 'rgba(244,63,94,0.3)'}`,
            borderRadius: 20, padding: '4px 12px', fontSize: '0.78rem', fontWeight: 700,
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: connected ? '#22c55e' : '#f43f5e',
              animation: connected ? 'pulse 2s infinite' : 'none',
            }} />
            {connected ? 'Connected' : 'Offline'}
          </span>
        </div>
      </div>

      {error && (
        <div className="predict-error" style={{ marginBottom: '1rem' }}>⚠ {error}</div>
      )}

      {/* ── Gauge row ── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <GaugeStat label="VOLTAGE"      value={voltage?.toFixed(1) ?? '—'} unit="V"   color="#3b82f6" />
        <GaugeStat label="CURRENT"      value={current?.toFixed(3) ?? '—'} unit="A"   color="#a855f7" />
        <GaugeStat label="POWER"        value={power?.toFixed(1)   ?? '—'} unit="W"   color={power ? powerColor(power) : '#64748b'} />
        <GaugeStat label="FREQUENCY"    value={freq?.toFixed(1)    ?? '—'} unit="Hz"  color="#14b8a6" />
        <GaugeStat label="POWER FACTOR" value={pf?.toFixed(2)      ?? '—'} unit=""    color="#f59e0b" />
      </div>

      {/* ── Appliance card ── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <ApplianceCard result={result} sheetRow={sheetRow} sessionStart={result?.appliance === sessionLabel ? sessionStart : null} />
      </div>

      {/* ── Charts row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>

        {/* Power trend sparkline */}
        <div className="glass-card" style={{ gridColumn: '1 / 3' }}>
          <div className="section-title" style={{ marginBottom: '0.75rem' }}>
            Power Trend ({powerHistory.length} readings)
          </div>
          {powerHistory.length > 1
            ? <SparkLine data={powerHistory} color={power ? powerColor(power) : '#f59e0b'} />
            : <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Waiting for data…</div>
          }
        </div>

        {/* Top 3 probabilities */}
        <div className="glass-card">
          <Top3Table top3={result?.top_3} />
          {!result && (
            <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Waiting…</div>
          )}
        </div>
      </div>

      {/* ── Donut + last reading ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

        {/* Appliance distribution donut */}
        <div className="glass-card">
          <div className="section-title" style={{ marginBottom: '0.5rem' }}>
            Appliance Distribution <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-secondary)' }}>last {labelHistory.length} readings</span>
          </div>
          <LabelPieChart history={labelHistory} />
          {!labelHistory.length && (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Waiting for data…</div>
          )}
        </div>

        {/* Last sheet reading details */}
        <div className="glass-card">
          <div className="section-title" style={{ marginBottom: '1rem' }}>Last Sheet Reading</div>
          {sheetRow ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <tbody>
                {[
                  ['Time',         sheetRow['Time']],
                  ['Voltage',      `${sheetRow['Voltage']} V`],
                  ['Current',      `${sheetRow['Current']} A`],
                  ['Power',        `${sheetRow['Power']} W`],
                  ['Energy',       `${sheetRow['Energy']} Wh`],
                  ['Frequency',    `${sheetRow['Frequency']} Hz`],
                  ['Power Factor', sheetRow['Power Factor']],
                ].map(([k, v]) => (
                  <tr key={k} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 4px', color: 'var(--text-secondary)', fontWeight: 600, width: '45%' }}>{k}</td>
                    <td style={{ padding: '8px 4px', color: 'var(--text-primary)' }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No data yet</div>
          )}
          {result && (
            <div style={{ marginTop: '1rem', padding: '10px 12px', borderRadius: 8, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>MODEL OUTPUT</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>
                  {LABEL_ICONS[result.appliance]} {formatLabel(result.appliance)}
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                Est. power: {parseFloat(result.estimated_power_w || 0).toFixed(1)} W · {result.inference_time_ms} ms
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
