import { useState, useEffect } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import { SkeletonCard } from './Skeleton'

const SHEET_ID = '1pwetSD96HxJCB3RoxqtnKHTT7NBEy6TDZfFu1wj9q_o'
const READING_INTERVAL_S = 9

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

const WATT_MAP = {
  Iron: 1288, LED_Bulbs: 30, Mixed_Load: 400, Mobile_Charger: 10,
  Refrigerator_ACTIVE: 109, Refrigerator_IDLE: 15,
  WashingMachine_SPIN: 300, WashingMachine_WASH: 500, Water_Pump: 994,
}

function estimateWatts(label) { return WATT_MAP[label] ?? 200 }

function fmtHours(h) {
  const hrs  = Math.floor(h)
  const mins = Math.round((h - hrs) * 60)
  if (hrs === 0) return `${mins}m`
  if (mins === 0) return `${hrs}h`
  return `${hrs}h ${mins}m`
}

function sheetQueryUrl(year, month) {
  // month is 1-based
  const start = `${year}-${month}-1 0:0:0`
  const endMonth = month === 12 ? 1 : month + 1
  const endYear  = month === 12 ? year + 1 : year
  const end = `${endYear}-${endMonth}-1 0:0:0`
  const tq = `select A,H where A >= datetime '${start}' and A < datetime '${end}'`
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&tq=${encodeURIComponent(tq)}&_=${Date.now()}`
}

async function fetchMonthData(year, month) {
  const res  = await fetch(sheetQueryUrl(year, month), { cache: 'no-store' })
  const text = await res.text()
  const lines = text.trim().split('\n').filter(Boolean)
  if (lines.length < 2) return { byLabel: {}, byDay: {} }

  const byLabel = {}
  const byDay   = {}

  for (let i = 1; i < lines.length; i++) {
    const cols  = lines[i].split(',').map(v => v.replace(/^"|"$/g, '').trim())
    const time  = cols[0]
    const label = cols[1]
    if (!label || !time) continue

    const day = time.split(' ')[0]  // e.g. "4/19/2026"
    const d   = parseInt(day.split('/')[1], 10)  // day-of-month number

    byLabel[label] = (byLabel[label] || 0) + 1

    if (!byDay[d]) byDay[d] = {}
    byDay[d][label] = (byDay[d][label] || 0) + 1
  }

  return { byLabel, byDay }
}

export default function MonthlyReport() {
  const now = new Date()
  // Default to previous calendar month
  const defaultYear  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
  const defaultMonth = now.getMonth() === 0 ? 12 : now.getMonth()  // getMonth() is 0-based

  const [selYear,  setSelYear]  = useState(defaultYear)
  const [selMonth, setSelMonth] = useState(defaultMonth)
  const [data,     setData]     = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchMonthData(selYear, selMonth)
      .then(d => {
        if (Object.keys(d.byLabel).length === 0) {
          setError('No data found for this month.')
          setData(null)
        } else {
          setData(d)
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [selYear, selMonth])

  // ── Derived stats ──────────────────────────────────────────
  const labelStats = data
    ? Object.entries(data.byLabel).map(([label, readings]) => {
        const hours = (readings * READING_INTERVAL_S) / 3600
        const kwh   = parseFloat((hours * estimateWatts(label) / 1000).toFixed(2))
        return { label, readings, hours: parseFloat(hours.toFixed(2)), kwh }
      }).sort((a, b) => b.kwh - a.kwh)
    : []

  const totalKwh     = labelStats.reduce((s, r) => s + r.kwh, 0).toFixed(2)
  const totalUnits   = totalKwh  // 1 unit = 1 kWh
  const totalCostPKR = (parseFloat(totalKwh) * 30).toFixed(0)

  // Donut chart data
  const pieData = labelStats.map(r => ({
    name: r.label.replace(/_/g, ' '),
    value: r.kwh,
  }))

  // Daily bar chart data
  const daysInMonth = data
    ? Object.keys(data.byDay).map(Number).sort((a, b) => a - b)
    : []

  const allLabels = labelStats.map(r => r.label)

  const barData = daysInMonth.map(d => {
    const entry = { day: `${selMonth}/${d}` }
    let total = 0
    allLabels.forEach(label => {
      const readings = data.byDay[d]?.[label] ?? 0
      const hours    = (readings * READING_INTERVAL_S) / 3600
      const kwh      = parseFloat((hours * estimateWatts(label) / 1000).toFixed(3))
      entry[label]   = kwh
      total += kwh
    })
    entry.total = parseFloat(total.toFixed(3))
    return entry
  })

  const MONTH_NAMES = ['January','February','March','April','May','June',
    'July','August','September','October','November','December']

  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1)
  const yearOptions  = [now.getFullYear() - 1, now.getFullYear()]

  return (
    <div className="lm-page">
      <header className="sub-page-header">
        <div className="sph-left">
          <span className="sph-page-icon">📅</span>
          <h1 className="sph-title">Monthly Report</h1>
          <p className="sph-desc">Full breakdown of appliance usage, units consumed, and estimated cost for any month.</p>
        </div>
        {data && (
          <div className="sph-stats">
            <div className="sph-stat">
              <span className="sph-stat-value">{totalUnits}</span>
              <span className="sph-stat-label">Total Units (kWh)</span>
            </div>
            <div className="sph-stat">
              <span className="sph-stat-value">₨{totalCostPKR}</span>
              <span className="sph-stat-label">Est. Cost</span>
            </div>
            <div className="sph-stat">
              <span className="sph-stat-value">{daysInMonth.length}</span>
              <span className="sph-stat-label">Days with Data</span>
            </div>
            <div className="sph-stat">
              <span className="sph-stat-value">{labelStats.length}</span>
              <span className="sph-stat-label">Appliances</span>
            </div>
          </div>
        )}
      </header>

      <div className="lm-body">

        {/* ── Month Selector ── */}
        <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.07em' }}>SELECT MONTH</span>
          <select
            value={selMonth}
            onChange={e => setSelMonth(Number(e.target.value))}
            style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 8, padding: '6px 12px', fontSize: '0.88rem', fontFamily: 'inherit' }}
          >
            {monthOptions.map(m => <option key={m} value={m}>{MONTH_NAMES[m - 1]}</option>)}
          </select>
          <select
            value={selYear}
            onChange={e => setSelYear(Number(e.target.value))}
            style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 8, padding: '6px 12px', fontSize: '0.88rem', fontFamily: 'inherit' }}
          >
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            {MONTH_NAMES[selMonth - 1]} {selYear}
          </span>
        </div>

        {loading ? <SkeletonCard rows={5} /> : error ? (
          <div className="predict-error">⚠ {error}</div>
        ) : (
          <>
            {/* ── Appliance Usage Table ── */}
            <div className="glass-card">
              <div className="section-title" style={{ marginBottom: '1rem' }}>Appliance Usage Breakdown</div>
              <div className="lm-table-wrap">
                <table className="lm-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Appliance</th>
                      <th>Total Readings</th>
                      <th>Hours Used</th>
                      <th>Units (kWh)</th>
                      <th>Est. Cost (PKR)</th>
                      <th>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {labelStats.map((row, i) => {
                      const sharePct = ((row.kwh / parseFloat(totalKwh)) * 100).toFixed(1)
                      return (
                        <tr key={row.label}>
                          <td className="lm-icon-cell">{LABEL_ICONS[row.label] ?? '⚡'}</td>
                          <td className="lm-name-cell" style={{ fontWeight: 600 }}>{row.label.replace(/_/g, ' ')}</td>
                          <td>{row.readings.toLocaleString()}</td>
                          <td>{fmtHours(row.hours)}</td>
                          <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{row.kwh}</td>
                          <td>₨ {(row.kwh * 30).toFixed(0)}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 80, height: 6, background: 'var(--surface-4)', borderRadius: 4, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${sharePct}%`, background: CHART_COLORS[i % CHART_COLORS.length], borderRadius: 4 }} />
                              </div>
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{sharePct}%</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                      <td></td>
                      <td>Total</td>
                      <td>{labelStats.reduce((s, r) => s + r.readings, 0).toLocaleString()}</td>
                      <td>{fmtHours(labelStats.reduce((s, r) => s + r.hours, 0))}</td>
                      <td style={{ color: '#f59e0b' }}>{totalKwh}</td>
                      <td>₨ {totalCostPKR}</td>
                      <td>100%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Donut + Daily Bar side by side ── */}
            <div className="two-col predict-layout" style={{ alignItems: 'start' }}>

              {/* Donut chart */}
              <div className="glass-card">
                <div className="section-title" style={{ marginBottom: '0.5rem' }}>Unit Distribution</div>
                <p className="predict-hint" style={{ marginBottom: '1rem' }}>Share of total kWh per appliance</p>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={65} outerRadius={105} paddingAngle={3}
                      label={({ name, value }) => `${((value / parseFloat(totalKwh)) * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip
                      formatter={(val, name) => [`${val} kWh`, name]}
                      contentStyle={{ background: '#1a2235', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, fontSize: '0.82rem' }}
                    />
                    <Legend formatter={v => <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Daily stacked bar */}
              <div className="glass-card">
                <div className="section-title" style={{ marginBottom: '0.5rem' }}>Daily Consumption</div>
                <p className="predict-hint" style={{ marginBottom: '1rem' }}>kWh per day — stacked by appliance</p>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={barData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="day" tick={{ fill: '#8896b3', fontSize: 10 }} />
                    <YAxis tick={{ fill: '#8896b3', fontSize: 10 }} unit=" kWh" width={55} />
                    <Tooltip
                      contentStyle={{ background: '#1a2235', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, fontSize: '0.78rem' }}
                      formatter={(val, name) => [`${val} kWh`, name.replace(/_/g, ' ')]}
                    />
                    {allLabels.map((label, i) => (
                      <Bar key={label} dataKey={label} stackId="a" fill={CHART_COLORS[i % CHART_COLORS.length]}
                        radius={i === allLabels.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
