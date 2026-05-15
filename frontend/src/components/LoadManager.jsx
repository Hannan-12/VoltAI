import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend,
} from 'recharts'
import { api } from '../services/api'
import { useToast } from './Toast'
import { SkeletonCard } from './Skeleton'
import './LoadManager.css'

// ─── Constants ────────────────────────────────────────────────

const SHEET_ID = '1pwetSD96HxJCB3RoxqtnKHTT7NBEy6TDZfFu1wj9q_o'
const READING_INTERVAL_S = 9

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
  Unknown_Load:        '❓',
  WashingMachine_SPIN: '🌊',
  WashingMachine_WASH: '🫧',
  Water_Pump:          '💧',
}

const CHART_COLORS = [
  '#f59e0b', '#f43f5e', '#22c55e', '#3b82f6', '#a855f7',
  '#ec4899', '#14b8a6', '#f97316', '#64748b', '#06b6d4',
  '#84cc16', '#e879f9', '#fb923c',
]

const PRIORITY_OPTS = ['low', 'medium', 'high']
const LEVEL_META = {
  high:   { label: 'High',   color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)'   },
  medium: { label: 'Medium', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)'  },
  low:    { label: 'Low',    color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.3)'   },
}
const PRIORITY_META = {
  high:   { label: 'High',   color: '#f87171' },
  medium: { label: 'Medium', color: '#fbbf24' },
  low:    { label: 'Low',    color: '#4ade80'  },
}
const EMPTY_FORM = { name: '', power_watts: '', hours_per_day: '', priority: 'medium' }

// ─── Helpers ──────────────────────────────────────────────────

function getApplianceIcon(name) {
  const n = name.toLowerCase()
  if (/air.?con|ac\b|a\.c/.test(n))         return '❄️'
  if (/fridge|refrigerator|freezer/.test(n)) return '🧊'
  if (/tv|television|screen|monitor/.test(n)) return '📺'
  if (/wash/.test(n))                         return '🫧'
  if (/pump|motor/.test(n))                   return '⚙️'
  if (/light|lamp|bulb|led/.test(n))          return '💡'
  if (/fan/.test(n))                          return '🌀'
  if (/oven|microwave|stove|cook/.test(n))    return '🍳'
  if (/heater|geyser/.test(n))               return '🔥'
  if (/computer|pc|laptop/.test(n))           return '💻'
  if (/phone|charger/.test(n))               return '🔌'
  return '⚡'
}

function labelIcon(label) {
  return LABEL_ICONS[label] ?? '⚡'
}

function fmtHours(h) {
  if (h < 0.017) return '< 1 min'
  const hrs = Math.floor(h)
  const mins = Math.round((h - hrs) * 60)
  if (hrs === 0) return `${mins}m`
  if (mins === 0) return `${hrs}h`
  return `${hrs}h ${mins}m`
}

// Build gviz query URL for a specific date
function sheetQueryUrl(date) {
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const d = date.getDate()
  const next = new Date(date)
  next.setDate(next.getDate() + 1)
  const ny = next.getFullYear()
  const nm = next.getMonth() + 1
  const nd = next.getDate()
  const tq = `select A,H where A >= datetime '${y}-${m}-${d} 0:0:0' and A < datetime '${ny}-${nm}-${nd} 0:0:0'`
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&tq=${encodeURIComponent(tq)}&_=${Date.now()}`
}

// Fetch and aggregate one day's rows into per-label stats
async function fetchDayStats(date) {
  const res = await fetch(sheetQueryUrl(date), { cache: 'no-store' })
  const text = await res.text()
  const lines = text.trim().split('\n').filter(Boolean)
  if (lines.length < 2) return []

  const counts = {}
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(v => v.replace(/^"|"$/g, '').trim())
    const label = cols[1]
    if (!label) continue
    counts[label] = (counts[label] || 0) + 1
  }

  return Object.entries(counts).map(([label, readings]) => {
    const hours = (readings * READING_INTERVAL_S) / 3600
    const kwh   = parseFloat((hours * estimateWatts(label) / 1000).toFixed(3))
    return { label, readings, hours: parseFloat(hours.toFixed(3)), kwh }
  }).sort((a, b) => b.hours - a.hours)
}

// Rough watt estimate per label for kWh calculation
function estimateWatts(label) {
  const map = {
    Ceiling_Fan: 75, Iron: 1288, LED_Bulbs: 30, Microwave_Oven: 1200,
    Mixed_Load: 400, Phone_Charger: 10, Refrigerator_ACTIVE: 109,
    Refrigerator_IDLE: 15, Standby_Load: 5, Unknown_Load: 200,
    WashingMachine_SPIN: 300, WashingMachine_WASH: 500, Water_Pump: 994,
  }
  return map[label] ?? 200
}

// Walk back from today to find the last day with data
async function findLastDataDay() {
  const today = new Date()
  for (let i = 1; i <= 10; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const stats = await fetchDayStats(d)
    if (stats.length > 0) return { date: d, stats }
  }
  return null
}

// Build forecast: project daily pattern over N days
function buildForecast(dayStats, days) {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i + 1)
    const label = `${d.getMonth() + 1}/${d.getDate()}`
    const entry = { day: label }
    dayStats.forEach(s => {
      entry[s.label] = parseFloat(s.kwh.toFixed(3))
    })
    entry.total = parseFloat(dayStats.reduce((sum, s) => sum + s.kwh, 0).toFixed(3))
    return entry
  })
}

// ─── Sub-components ───────────────────────────────────────────

function LoadForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || EMPTY_FORM)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!form.name.trim()) return setError('Appliance name is required.')
    if (!form.power_watts || +form.power_watts <= 0) return setError('Power must be greater than 0 W.')
    if (!form.hours_per_day || +form.hours_per_day <= 0 || +form.hours_per_day > 24)
      return setError('Hours per day must be between 0 and 24.')
    setSaving(true)
    try {
      await onSave({ name: form.name.trim(), power_watts: +form.power_watts, hours_per_day: +form.hours_per_day, priority: form.priority })
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <form className="load-form" onSubmit={handleSubmit}>
      <div className="load-form-grid">
        <div className="lf-field">
          <label className="lf-label">Appliance Name</label>
          <input className="lf-input" placeholder="e.g. Air Conditioner" value={form.name} onChange={e => set('name', e.target.value)} />
        </div>
        <div className="lf-field">
          <label className="lf-label">Power Rating</label>
          <div className="lf-input-wrap">
            <input className="lf-input" type="number" step="any" placeholder="1500" value={form.power_watts} onChange={e => set('power_watts', e.target.value)} />
            <span className="lf-unit">W</span>
          </div>
        </div>
        <div className="lf-field">
          <label className="lf-label">Hours / Day</label>
          <div className="lf-input-wrap">
            <input className="lf-input" type="number" step="any" min="0" max="24" placeholder="5" value={form.hours_per_day} onChange={e => set('hours_per_day', e.target.value)} />
            <span className="lf-unit">h</span>
          </div>
        </div>
        <div className="lf-field">
          <label className="lf-label">Priority</label>
          <select className="lf-select" value={form.priority} onChange={e => set('priority', e.target.value)}>
            {PRIORITY_OPTS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
          </select>
        </div>
      </div>
      {error && <div className="lf-error">{error}</div>}
      <div className="lf-actions">
        <button className="lm-btn primary" type="submit" disabled={saving}>
          {saving ? <><span className="spinner" /> Saving…</> : (initial ? '✓ Update' : '+ Add Appliance')}
        </button>
        {onCancel && <button className="lm-btn ghost" type="button" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  )
}

function ContributionBar({ pct, level }) {
  const meta = LEVEL_META[level]
  return (
    <div className="contrib-bar-wrap">
      <div className="contrib-bar" style={{ width: `${Math.max(pct, 1)}%`, background: meta.color }} />
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────

export default function LoadManager() {
  const toast = useToast()

  // Sheet usage state
  const [dayStats, setDayStats]     = useState(null)
  const [dataDate, setDataDate]     = useState(null)
  const [sheetLoading, setSheetLoading] = useState(true)
  const [sheetError, setSheetError] = useState(null)

  // Forecast state
  const [forecastDays, setForecastDays] = useState(7)
  const [forecastData, setForecastData] = useState([])

  // Load manager state
  const [loads, setLoads]           = useState([])
  const [contribution, setContribution] = useState(null)
  const [editingId, setEditingId]   = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [loading, setLoading]       = useState(true)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  // Fetch yesterday's sheet data
  useEffect(() => {
    setSheetLoading(true)
    findLastDataDay()
      .then(result => {
        if (result) {
          setDayStats(result.stats)
          setDataDate(result.date)
          setForecastData(buildForecast(result.stats, forecastDays))
        } else {
          setSheetError('No recent data found in the sheet.')
        }
      })
      .catch(err => setSheetError(err.message))
      .finally(() => setSheetLoading(false))
  }, [])

  // Rebuild forecast when days selection changes
  useEffect(() => {
    if (dayStats) setForecastData(buildForecast(dayStats, forecastDays))
  }, [forecastDays, dayStats])

  // Load manager data
  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [loadsRes, contribRes] = await Promise.all([api.getLoads(), api.getContribution()])
      setLoads(loadsRes.loads)
      setContribution(contribRes)
    } catch { /* keep stale */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  async function handleAdd(data) {
    await api.addLoad(data)
    setShowAddForm(false)
    await refresh()
    toast(`${data.name} added successfully`)
  }

  async function handleUpdate(id, data) {
    await api.updateLoad(id, data)
    setEditingId(null)
    await refresh()
    toast(`${data.name} updated`)
  }

  async function handleDelete(id) {
    const name = loads.find(l => l.id === id)?.name
    await api.deleteLoad(id)
    setDeleteConfirm(null)
    await refresh()
    toast(`${name} removed`, 'error')
  }

  const contribMap = {}
  if (contribution) contribution.loads.forEach(l => { contribMap[l.id] = l })

  const totalKwh = dayStats ? dayStats.reduce((s, r) => s + r.kwh, 0).toFixed(3) : '—'

  // Labels used in forecast chart
  const forecastLabels = dayStats ? dayStats.map(s => s.label) : []

  const dateLabel = dataDate
    ? dataDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : ''

  return (
    <div className="lm-page">

      {/* ── Header ── */}
      <header className="sub-page-header">
        <div className="sph-left">
          <span className="sph-page-icon">🔌</span>
          <h1 className="sph-title">Load Manager</h1>
          <p className="sph-desc">Real-time appliance usage from your PZEM meter, with forecasting based on historical patterns.</p>
        </div>
        {dayStats && (
          <div className="sph-stats">
            <div className="sph-stat">
              <span className="sph-stat-value">{totalKwh}</span>
              <span className="sph-stat-label">kWh ({dateLabel})</span>
            </div>
            <div className="sph-stat">
              <span className="sph-stat-value">{dayStats.length}</span>
              <span className="sph-stat-label">Appliances Detected</span>
            </div>
            <div className="sph-stat">
              <span className="sph-stat-value">{dayStats.reduce((s, r) => s + r.readings, 0).toLocaleString()}</span>
              <span className="sph-stat-label">Total Readings</span>
            </div>
          </div>
        )}
      </header>

      <div className="lm-body">

        {/* ── Yesterday's Usage ── */}
        <div className="glass-card">
          <div className="section-title" style={{ marginBottom: '0.25rem' }}>
            Yesterday's Appliance Usage
          </div>
          <p className="predict-hint" style={{ marginBottom: '1.25rem' }}>
            {dateLabel ? `Data from ${dateLabel} — fetched directly from your PZEM meter sheet.` : 'Fetching from Google Sheets…'}
          </p>

          {sheetLoading ? (
            <SkeletonCard rows={4} />
          ) : sheetError ? (
            <div className="predict-error">⚠ {sheetError}</div>
          ) : (
            <div className="lm-table-wrap">
              <table className="lm-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Appliance</th>
                    <th>Readings</th>
                    <th>Time Used</th>
                    <th>Est. kWh</th>
                    <th>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {dayStats.map((row, i) => {
                    const pct = dayStats.reduce((s, r) => s + r.readings, 0)
                    const sharePct = ((row.readings / pct) * 100).toFixed(1)
                    return (
                      <tr key={row.label}>
                        <td className="lm-icon-cell">{labelIcon(row.label)}</td>
                        <td className="lm-name-cell" style={{ fontWeight: 600 }}>
                          {row.label.replace(/_/g, ' ')}
                        </td>
                        <td>{row.readings.toLocaleString()}</td>
                        <td>{fmtHours(row.hours)}</td>
                        <td>{row.kwh}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 80, height: 6, background: 'var(--surface-4)', borderRadius: 4, overflow: 'hidden' }}>
                              <div style={{
                                height: '100%', width: `${sharePct}%`,
                                background: CHART_COLORS[i % CHART_COLORS.length],
                                borderRadius: 4,
                              }} />
                            </div>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{sharePct}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Forecast ── */}
        {dayStats && (
          <div className="glass-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div className="section-title" style={{ margin: 0 }}>Usage Forecast</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[7, 15, 30].map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setForecastDays(d)}
                    style={{
                      padding: '5px 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
                      fontWeight: 700, fontSize: '0.78rem',
                      background: forecastDays === d ? 'linear-gradient(135deg,#f59e0b,#f43f5e)' : 'var(--surface-4)',
                      color: forecastDays === d ? '#fff' : 'var(--text-secondary)',
                    }}
                  >
                    {d} Days
                  </button>
                ))}
              </div>
            </div>
            <p className="predict-hint" style={{ marginBottom: '1.25rem' }}>
              Projected daily kWh based on {dateLabel} usage pattern.
            </p>

            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={forecastData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="day" tick={{ fill: '#8896b3', fontSize: 11 }} />
                <YAxis tick={{ fill: '#8896b3', fontSize: 11 }} unit=" kWh" width={60} />
                <Tooltip
                  contentStyle={{ background: '#1a2235', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, fontSize: '0.8rem' }}
                  formatter={(val, name) => [`${val} kWh`, name.replace(/_/g, ' ')]}
                />
                <Legend formatter={v => <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>{v.replace(/_/g, ' ')}</span>} />
                {forecastLabels.map((label, i) => (
                  <Bar key={label} dataKey={label} stackId="a" fill={CHART_COLORS[i % CHART_COLORS.length]} radius={i === forecastLabels.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>

            {/* Forecast summary table */}
            <div style={{ marginTop: '1.25rem', overflowX: 'auto' }}>
              <table className="lm-table">
                <thead>
                  <tr>
                    <th>Appliance</th>
                    <th>Daily (kWh)</th>
                    <th>{forecastDays}-Day Total (kWh)</th>
                    <th>Est. Cost (PKR @ ₨30/kWh)</th>
                  </tr>
                </thead>
                <tbody>
                  {dayStats.map((row, i) => (
                    <tr key={row.label}>
                      <td style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: CHART_COLORS[i % CHART_COLORS.length], fontSize: '0.7rem' }}>■</span>
                        {labelIcon(row.label)} {row.label.replace(/_/g, ' ')}
                      </td>
                      <td>{row.kwh}</td>
                      <td>{(row.kwh * forecastDays).toFixed(2)}</td>
                      <td>₨ {(row.kwh * forecastDays * 30).toFixed(0)}</td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                    <td>Total</td>
                    <td>{totalKwh}</td>
                    <td>{(parseFloat(totalKwh) * forecastDays).toFixed(2)}</td>
                    <td>₨ {(parseFloat(totalKwh) * forecastDays * 30).toFixed(0)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Add Appliance ── */}
        <div className="glass-card">
          <div className="section-title">Registered Appliances</div>
          <p className="predict-hint" style={{ marginBottom: '1rem' }}>
            Manually defined appliances for contribution tracking and scheduling.
          </p>
          {!showAddForm ? (
            loads.length >= 10
              ? <p className="lm-limit-msg">Maximum 10 appliances reached. Delete one to add a new entry.</p>
              : <button className="lm-btn primary" onClick={() => setShowAddForm(true)}>+ Add New Appliance</button>
          ) : (
            <LoadForm onSave={handleAdd} onCancel={() => setShowAddForm(false)} />
          )}
        </div>

        {/* ── Loads Table ── */}
        {loads.length > 0 && (
          <div className="glass-card">
            {loading ? <SkeletonCard rows={4} /> : (
              <div className="lm-table-wrap">
                <table className="lm-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Appliance</th>
                      <th>Power (W)</th>
                      <th>Hours/Day</th>
                      <th>kWh/Day</th>
                      <th>Contribution</th>
                      <th>Priority</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loads.map(load => {
                      const c = contribMap[load.id]
                      const isEditing = editingId === load.id
                      const level = c?.level ?? 'low'
                      const meta  = LEVEL_META[level]

                      if (isEditing) {
                        return (
                          <tr key={load.id} className="lm-edit-row">
                            <td colSpan={8}>
                              <LoadForm initial={load} onSave={d => handleUpdate(load.id, d)} onCancel={() => setEditingId(null)} />
                            </td>
                          </tr>
                        )
                      }

                      return (
                        <tr key={load.id}>
                          <td className="lm-icon-cell">{getApplianceIcon(load.name)}</td>
                          <td className="lm-name-cell">{load.name}</td>
                          <td>{load.power_watts}</td>
                          <td>{load.hours_per_day}</td>
                          <td>{c?.energy_kwh_day ?? '—'}</td>
                          <td>
                            {c ? (
                              <div className="contrib-cell">
                                <ContributionBar pct={c.contribution_pct} level={level} />
                                <span className="contrib-badge" style={{ color: meta.color, background: meta.bg, borderColor: meta.border }}>
                                  {c.contribution_pct}% · {meta.label}
                                </span>
                              </div>
                            ) : '—'}
                          </td>
                          <td>
                            <span className="priority-badge" style={{ color: PRIORITY_META[load.priority].color }}>
                              {PRIORITY_META[load.priority].label}
                            </span>
                          </td>
                          <td>
                            <div className="lm-row-actions">
                              <button className="lm-icon-btn edit" onClick={() => setEditingId(load.id)} title="Edit">✏️</button>
                              <button className="lm-icon-btn delete" onClick={() => setDeleteConfirm(load.id)} title="Delete">🗑️</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── Delete Confirm Modal ── */}
      {deleteConfirm !== null && (
        <div className="lm-modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="lm-modal" onClick={e => e.stopPropagation()}>
            <div className="lm-modal-title">Remove Appliance</div>
            <p className="lm-modal-msg">
              Are you sure you want to remove <strong>{loads.find(l => l.id === deleteConfirm)?.name}</strong>?
            </p>
            <div className="lm-modal-actions">
              <button className="lm-btn danger" onClick={() => handleDelete(deleteConfirm)}>Remove</button>
              <button className="lm-btn ghost" onClick={() => setDeleteConfirm(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
