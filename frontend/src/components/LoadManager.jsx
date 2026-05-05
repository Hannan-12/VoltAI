import { useState, useEffect, useCallback } from 'react'
import { api } from '../services/api'
import { useToast } from './Toast'
import { SkeletonCard } from './Skeleton'
import './LoadManager.css'

function getApplianceIcon(name) {
  const n = name.toLowerCase()
  if (/air.?con|ac\b|a\.c/.test(n))        return '❄️'
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

const PRIORITY_OPTS = ['low', 'medium', 'high']

const LEVEL_META = {
  high:   { label: 'High',   color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)'   },
  medium: { label: 'Medium', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)'  },
  low:    { label: 'Low',    color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.3)'   },
}

const PRIORITY_META = {
  high:   { label: 'High',   color: '#f87171' },
  medium: { label: 'Medium', color: '#fbbf24' },
  low:    { label: 'Low',    color: '#4ade80' },
}

const EMPTY_FORM = { name: '', power_watts: '', hours_per_day: '', priority: 'medium' }

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
      await onSave({
        name: form.name.trim(),
        power_watts: +form.power_watts,
        hours_per_day: +form.hours_per_day,
        priority: form.priority,
      })
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
          <input
            className="lf-input"
            placeholder="e.g. Air Conditioner"
            value={form.name}
            onChange={e => set('name', e.target.value)}
          />
        </div>
        <div className="lf-field">
          <label className="lf-label">Power Rating</label>
          <div className="lf-input-wrap">
            <input
              className="lf-input"
              type="number"
              step="any"
              placeholder="1500"
              value={form.power_watts}
              onChange={e => set('power_watts', e.target.value)}
            />
            <span className="lf-unit">W</span>
          </div>
        </div>
        <div className="lf-field">
          <label className="lf-label">Hours / Day</label>
          <div className="lf-input-wrap">
            <input
              className="lf-input"
              type="number"
              step="any"
              min="0"
              max="24"
              placeholder="5"
              value={form.hours_per_day}
              onChange={e => set('hours_per_day', e.target.value)}
            />
            <span className="lf-unit">h</span>
          </div>
        </div>
        <div className="lf-field">
          <label className="lf-label">Priority</label>
          <select className="lf-select" value={form.priority} onChange={e => set('priority', e.target.value)}>
            {PRIORITY_OPTS.map(p => (
              <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="lf-error">{error}</div>}

      <div className="lf-actions">
        <button className="lm-btn primary" type="submit" disabled={saving}>
          {saving ? <><span className="spinner" /> Saving…</> : (initial ? '✓ Update' : '+ Add Appliance')}
        </button>
        {onCancel && (
          <button className="lm-btn ghost" type="button" onClick={onCancel}>Cancel</button>
        )}
      </div>
    </form>
  )
}

function ContributionBar({ pct, level }) {
  const meta = LEVEL_META[level]
  return (
    <div className="contrib-bar-wrap">
      <div
        className="contrib-bar"
        style={{ width: `${Math.max(pct, 1)}%`, background: meta.color }}
      />
    </div>
  )
}

export default function LoadManager() {
  const toast = useToast()
  const [loads, setLoads] = useState([])
  const [contribution, setContribution] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [loadsRes, contribRes] = await Promise.all([
        api.getLoads(),
        api.getContribution(),
      ])
      setLoads(loadsRes.loads)
      setContribution(contribRes)
    } catch {
      // silently keep stale data
    } finally {
      setLoading(false)
    }
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
  if (contribution) {
    contribution.loads.forEach(l => { contribMap[l.id] = l })
  }

  return (
    <div className="lm-page">
      <header className="sub-page-header">
        <div className="sph-left">
          <span className="sph-page-icon">🔌</span>
          <h1 className="sph-title">Load Manager</h1>
          <p className="sph-desc">Define your appliances, see which ones consume the most energy, and identify where to reduce usage.</p>
        </div>
        {contribution && (
          <div className="sph-stats">
            <div className="sph-stat">
              <span className="sph-stat-value">{contribution.total_kwh_day}</span>
              <span className="sph-stat-label">kWh / Day</span>
            </div>
            <div className="sph-stat">
              <span className="sph-stat-value">{contribution.total_kwh_month}</span>
              <span className="sph-stat-label">kWh / Month</span>
            </div>
            <div className="sph-stat">
              <span className="sph-stat-value">{loads.length}<span style={{fontSize:'0.7rem',color:'var(--text-muted)'}}>/10</span></span>
              <span className="sph-stat-label">Appliances</span>
            </div>
            <div className="sph-stat">
              <span className="sph-stat-value" style={{ color: '#f43f5e' }}>
                {contribution.loads.filter(l => l.level === 'high').length}
              </span>
              <span className="sph-stat-label">High Impact</span>
            </div>
          </div>
        )}
      </header>

      <div className="lm-body">
        {/* ── Add Form ── */}
        <div className="glass-card">
          <div className="section-title">Add Appliance</div>
          {!showAddForm ? (
            loads.length >= 10 ? (
              <p className="lm-limit-msg">Maximum 10 appliances reached. Delete one to add a new entry.</p>
            ) : (
              <button className="lm-btn primary" onClick={() => setShowAddForm(true)}>
                + Add New Appliance
              </button>
            )
          ) : (
            <LoadForm
              onSave={handleAdd}
              onCancel={() => setShowAddForm(false)}
            />
          )}
        </div>

        {/* ── Loads Table ── */}
        <div className="glass-card">
          <div className="section-title">Registered Appliances</div>

          {loading ? (
            <SkeletonCard rows={4} />
          ) : loads.length === 0 ? (
            <div className="lm-empty">
              <div style={{ fontSize: '2rem', opacity: 0.25 }}>🔌</div>
              <p>No appliances added yet. Add your first one above.</p>
            </div>
          ) : (
            <div className="lm-table-wrap">
              <table className="lm-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Appliance</th>
                    <th>Power (W)</th>
                    <th>Hours/Day</th>
                    <th>Energy (kWh/day)</th>
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
                    const meta = LEVEL_META[level]

                    if (isEditing) {
                      return (
                        <tr key={load.id} className="lm-edit-row">
                          <td colSpan={8}>
                            <LoadForm
                              initial={load}
                              onSave={(data) => handleUpdate(load.id, data)}
                              onCancel={() => setEditingId(null)}
                            />
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
                              <span
                                className="contrib-badge"
                                style={{ color: meta.color, background: meta.bg, borderColor: meta.border }}
                              >
                                {c.contribution_pct}%&nbsp;{meta.label}
                              </span>
                            </div>
                          ) : '—'}
                        </td>
                        <td>
                          <span
                            className="priority-badge"
                            style={{ color: PRIORITY_META[load.priority].color }}
                          >
                            {PRIORITY_META[load.priority].label}
                          </span>
                        </td>
                        <td>
                          <div className="lm-row-actions">
                            <button
                              className="lm-icon-btn edit"
                              onClick={() => setEditingId(load.id)}
                              title="Edit"
                            >✏️</button>
                            <button
                              className="lm-icon-btn delete"
                              onClick={() => setDeleteConfirm(load.id)}
                              title="Delete"
                            >🗑️</button>
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

        {/* ── Contribution Breakdown ── */}
        {contribution && contribution.loads.length > 0 && (
          <div className="glass-card">
            <div className="section-title">Contribution Breakdown</div>
            <div className="contrib-list">
              {contribution.loads.map(load => {
                const meta = LEVEL_META[load.level]
                return (
                  <div className="contrib-row" key={load.id}>
                    <div className="contrib-name">
                      <span className="contrib-row-icon">{getApplianceIcon(load.name)}</span>
                      {load.name}
                    </div>
                    <div className="contrib-bar-col">
                      <div className="contrib-bar-wrap">
                        <div
                          className="contrib-bar"
                          style={{ width: `${Math.max(load.contribution_pct, 1)}%`, background: meta.color }}
                        />
                      </div>
                    </div>
                    <div className="contrib-stats">
                      <span className="contrib-kwh">{load.energy_kwh_day} kWh/day</span>
                      <span
                        className="contrib-badge"
                        style={{ color: meta.color, background: meta.bg, borderColor: meta.border }}
                      >
                        {load.contribution_pct}% · {meta.label}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Insight box */}
            <InsightBox loads={contribution.loads} totalKwh={contribution.total_kwh_day} />
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

function InsightBox({ loads, totalKwh }) {
  const highLoads = loads.filter(l => l.level === 'high')
  const topLoad = loads[0]

  if (!topLoad) return null

  return (
    <div className="insight-box">
      <div className="insight-icon">💡</div>
      <div className="insight-content">
        <div className="insight-title">Energy Insight</div>
        {highLoads.length > 0 ? (
          <p>
            <strong>{highLoads.map(l => l.name).join(', ')}</strong> account
            {highLoads.length === 1 ? 's' : ''} for over 30% of your daily usage.
            Consider reducing their active hours to lower your total consumption
            of <strong>{totalKwh} kWh/day</strong>.
          </p>
        ) : (
          <p>
            Your highest consumer is <strong>{topLoad.name}</strong> at {topLoad.contribution_pct}% of daily usage.
            Total consumption is <strong>{totalKwh} kWh/day</strong> — well distributed across appliances.
          </p>
        )}
      </div>
    </div>
  )
}
