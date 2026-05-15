import { useState, useEffect, useRef, useCallback } from 'react'
import { SkeletonCard } from './Skeleton'
import './Alerts.css'

const SHEET_URL     = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQbSJRflh9OFloDKHNzHKO3LvdamJhjulEWgospOAYP2dOgD3JEX6dfQOrLkBf2Iehrl1kPAr0phvhr/pub?gid=0&single=true&output=csv'
const READING_S     = 9
const REFRESH_MS    = 3 * 60 * 1000

const WATT_MAP = {
  Ceiling_Fan: 75, Iron: 1288, LED_Bulbs: 30, Microwave_Oven: 1200,
  Mixed_Load: 400, Phone_Charger: 10, Refrigerator_ACTIVE: 109,
  Refrigerator_IDLE: 15, Standby_Load: 5, Unknown_Load: 200,
  WashingMachine_SPIN: 300, WashingMachine_WASH: 500, Water_Pump: 994,
}
function estimateWatts(label) { return WATT_MAP[label] ?? 200 }

// Fetch all rows for a given date range, return label→readings map
async function fetchReadings(startDt, endDt) {
  const url  = `${SHEET_URL}&_=${Date.now()}`
  const res  = await fetch(url, { cache: 'no-store' })
  const text = await res.text()
  const lines = text.trim().split('\n').filter(Boolean)
  const start = new Date(startDt)
  const end   = new Date(endDt)
  const counts = {}
  for (let i = 1; i < lines.length; i++) {
    const cols  = lines[i].split(',').map(v => v.replace(/^"|"$/g, '').trim())
    const ts    = new Date(cols[0])
    const label = cols[7]  // column H (index 7)
    if (!label || isNaN(ts)) continue
    if (ts >= start && ts < end) {
      counts[label] = (counts[label] || 0) + 1
    }
  }
  return counts
}

function readingsToKwh(counts) {
  return Object.entries(counts).reduce((sum, [label, n]) => {
    return sum + (n * READING_S / 3600) * estimateWatts(label) / 1000
  }, 0)
}

// Get previous full calendar month date range strings
function prevMonthRange() {
  const now  = new Date()
  const y    = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
  const m    = now.getMonth() === 0 ? 12 : now.getMonth()
  const ey   = now.getFullYear()
  const em   = now.getMonth() + 1
  return {
    start: `${y}-${m}-1 0:0:0`,
    end:   `${ey}-${em}-1 0:0:0`,
    days:  new Date(ey, em - 1, 0).getDate(),  // days in that month
  }
}

// Today's date range strings
function todayRange() {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate()
  const ny = m === 12 ? y + 1 : y
  const nm = m === 12 ? 1 : m + 1
  return {
    start: `${y}-${m}-${d} 0:0:0`,
    end:   `${ny}-${nm}-${d === 31 ? 1 : d + 1} 0:0:0`,   // just need tomorrow
    startHour: now.getHours() + now.getMinutes() / 60,
  }
}

function AlertCard({ level, title, message }) {
  const meta = {
    critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.3)',  icon: '🚨' },
    warning:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', icon: '⚠️' },
    ok:       { color: '#22c55e', bg: 'rgba(34,197,94,0.1)',  border: 'rgba(34,197,94,0.3)',  icon: '✅' },
    info:     { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.3)', icon: 'ℹ️' },
  }[level] ?? { color: '#8896b3', bg: 'rgba(136,150,179,0.1)', border: 'rgba(136,150,179,0.3)', icon: '📋' }

  return (
    <div className="alert-card" style={{ borderColor: meta.border, background: meta.bg }}>
      <div className="alert-card-top">
        <span className="alert-icon">{meta.icon}</span>
        <span className="alert-title" style={{ color: meta.color }}>{title}</span>
      </div>
      <p className="alert-msg">{message}</p>
    </div>
  )
}

function GaugeBar({ value, max, color }) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div>
      <div style={{ height: 12, background: 'var(--surface-4)', borderRadius: 6, overflow: 'hidden', marginBottom: 6 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 6, transition: 'width 0.7s ease' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
        <span>0 kWh</span>
        <span style={{ color, fontWeight: 700 }}>{value.toFixed(3)} kWh</span>
        <span>avg {max.toFixed(3)} kWh</span>
      </div>
    </div>
  )
}

export default function Alerts() {
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)
  const [dailyAvg,     setDailyAvg]     = useState(null)   // kWh/day from last month
  const [todayKwh,     setTodayKwh]     = useState(null)   // kWh so far today
  const [projectedKwh, setProjectedKwh] = useState(null)   // full-day projection
  const [lastUpdate,   setLastUpdate]   = useState(null)
  const [todayCounts,  setTodayCounts]  = useState({})
  const intervalRef = useRef(null)

  const fetchAll = useCallback(async () => {
    try {
      setError(null)

      // 1. Last month daily average
      const { start, end, days } = prevMonthRange()
      const prevCounts  = await fetchReadings(start, end)
      const prevKwh     = readingsToKwh(prevCounts)
      const avg         = prevKwh / days

      // 2. Today so far
      const td          = todayRange()
      const todayC      = await fetchReadings(td.start, `${td.end.split(' ')[0].replace(/(\d+)-(\d+)-.*/, `$1-$2-${new Date().getDate() + 1}`)} 0:0:0`)
      // simpler: just fetch today with correct end
      const now         = new Date()
      const y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate()
      const todayStart  = `${y}-${m}-${d} 0:0:0`
      const tomorrowEnd = `${y}-${m}-${d + 1} 0:0:0`
      const tc          = await fetchReadings(todayStart, tomorrowEnd)
      const kwh         = readingsToKwh(tc)

      // 3. Project to end of day
      const hoursElapsed = now.getHours() + now.getMinutes() / 60 + 1 / 60
      const projected    = hoursElapsed > 0 ? (kwh / hoursElapsed) * 24 : kwh

      setDailyAvg(avg)
      setTodayKwh(kwh)
      setProjectedKwh(projected)
      setTodayCounts(tc)
      setLastUpdate(new Date())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
    intervalRef.current = setInterval(fetchAll, REFRESH_MS)
    return () => clearInterval(intervalRef.current)
  }, [fetchAll])

  // Build alerts
  const alerts = []
  if (dailyAvg != null && projectedKwh != null) {
    const diffPct = ((projectedKwh - dailyAvg) / dailyAvg) * 100

    if (projectedKwh > dailyAvg * 1.2) {
      alerts.push({
        level: 'critical',
        title: 'High Consumption Alert',
        message: `Your projected usage today is ${projectedKwh.toFixed(3)} kWh — ${Math.abs(diffPct).toFixed(0)}% above your monthly daily average of ${dailyAvg.toFixed(3)} kWh. Consider turning off non-essential appliances.`,
      })
    } else if (projectedKwh > dailyAvg) {
      alerts.push({
        level: 'warning',
        title: 'Consumption Rising',
        message: `Today's projected usage (${projectedKwh.toFixed(3)} kWh) is tracking ${Math.abs(diffPct).toFixed(0)}% above your daily average. Monitor usage for the rest of the day.`,
      })
    } else if (projectedKwh < dailyAvg * 0.8) {
      alerts.push({
        level: 'ok',
        title: 'Great Job — Low Consumption',
        message: `You're on track for ${projectedKwh.toFixed(3)} kWh today — ${Math.abs(diffPct).toFixed(0)}% below your daily average. Keep it up!`,
      })
    } else {
      alerts.push({
        level: 'ok',
        title: 'Consumption On Track',
        message: `Today's projected usage (${projectedKwh.toFixed(3)} kWh) is close to your daily average (${dailyAvg.toFixed(3)} kWh). You're within a normal range.`,
      })
    }

    // Per-appliance tips
    const topAppliance = Object.entries(todayCounts)
      .map(([label, n]) => ({ label, kwh: (n * READING_S / 3600) * estimateWatts(label) / 1000 }))
      .sort((a, b) => b.kwh - a.kwh)[0]

    if (topAppliance && topAppliance.kwh > 0) {
      alerts.push({
        level: 'info',
        title: `Top Consumer: ${topAppliance.label.replace(/_/g, ' ')}`,
        message: `Your highest energy use today is from ${topAppliance.label.replace(/_/g, ' ')} at ${topAppliance.kwh.toFixed(3)} kWh (${((topAppliance.kwh / todayKwh) * 100).toFixed(0)}% of today's total).`,
      })
    }
  }

  const now = new Date()
  const { start: prevStart, days: prevDays } = prevMonthRange()
  const prevMonthName = new Date(prevStart).toLocaleString('default', { month: 'long', year: 'numeric' })

  return (
    <div className="alerts-page">
      <header className="sub-page-header">
        <div className="sph-left">
          <span className="sph-page-icon">🔔</span>
          <h1 className="sph-title">Energy Alerts</h1>
          <p className="sph-desc">
            Live consumption tracking vs your {prevMonthName} daily average.
            {lastUpdate && <span style={{ display: 'block', fontSize: '0.78rem', color: '#f59e0b', marginTop: 4 }}>Last update: {lastUpdate.toLocaleTimeString()}</span>}
          </p>
        </div>
        {!loading && dailyAvg != null && (
          <div className="sph-stats">
            <div className="sph-stat">
              <span className="sph-stat-value">{dailyAvg.toFixed(3)}</span>
              <span className="sph-stat-label">Avg kWh/Day ({prevMonthName.split(' ')[0]})</span>
            </div>
            <div className="sph-stat">
              <span className="sph-stat-value">{todayKwh?.toFixed(3) ?? '—'}</span>
              <span className="sph-stat-label">kWh So Far Today</span>
            </div>
            <div className="sph-stat">
              <span className="sph-stat-value" style={{ color: projectedKwh > dailyAvg ? '#f43f5e' : '#22c55e' }}>
                {projectedKwh?.toFixed(3) ?? '—'}
              </span>
              <span className="sph-stat-label">Projected Full-Day kWh</span>
            </div>
          </div>
        )}
      </header>

      <div className="alerts-body">
        {loading ? <SkeletonCard rows={4} /> : error ? (
          <div className="predict-error">⚠ {error}</div>
        ) : (
          <>
            {/* ── Gauge card ── */}
            <div className="glass-card">
              <div className="section-title" style={{ marginBottom: '1.25rem' }}>Today vs Daily Average</div>

              <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                <div>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: 4 }}>CURRENT (SO FAR)</div>
                  <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{todayKwh?.toFixed(3)}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>kWh as of {now.toLocaleTimeString()}</div>
                </div>
                <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: '2rem' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: 4 }}>PROJECTED FULL DAY</div>
                  <div style={{ fontSize: '2.2rem', fontWeight: 800, color: projectedKwh > dailyAvg ? '#f43f5e' : '#22c55e', lineHeight: 1 }}>{projectedKwh?.toFixed(3)}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>kWh estimated</div>
                </div>
                <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: '2rem' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: 4 }}>MONTHLY AVG/DAY</div>
                  <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#f59e0b', lineHeight: 1 }}>{dailyAvg?.toFixed(3)}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>kWh ({prevMonthName})</div>
                </div>
              </div>

              <GaugeBar
                value={projectedKwh ?? 0}
                max={Math.max(dailyAvg ?? 1, projectedKwh ?? 0) * 1.2}
                color={projectedKwh > dailyAvg ? '#f43f5e' : '#22c55e'}
              />
            </div>

            {/* ── Today's appliance breakdown ── */}
            {Object.keys(todayCounts).length > 0 && (
              <div className="glass-card">
                <div className="section-title" style={{ marginBottom: '1rem' }}>Today's Appliance Usage</div>
                <div className="lm-table-wrap">
                  <table className="lm-table">
                    <thead>
                      <tr>
                        <th>Appliance</th>
                        <th>Readings</th>
                        <th>kWh Today</th>
                        <th>Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(todayCounts)
                        .map(([label, n]) => ({
                          label, n,
                          kwh: parseFloat(((n * READING_S / 3600) * estimateWatts(label) / 1000).toFixed(3))
                        }))
                        .sort((a, b) => b.kwh - a.kwh)
                        .map((row, i) => {
                          const sharePct = ((row.kwh / todayKwh) * 100).toFixed(1)
                          return (
                            <tr key={row.label}>
                              <td className="lm-name-cell" style={{ fontWeight: 600 }}>{row.label.replace(/_/g, ' ')}</td>
                              <td>{row.n.toLocaleString()}</td>
                              <td style={{ fontWeight: 700 }}>{row.kwh}</td>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div style={{ width: 80, height: 6, background: 'var(--surface-4)', borderRadius: 4, overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${sharePct}%`, background: ['#f59e0b','#f43f5e','#22c55e','#3b82f6'][i % 4], borderRadius: 4 }} />
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
              </div>
            )}

            {/* ── Alert cards ── */}
            <div className="glass-card">
              <div className="section-title" style={{ marginBottom: '1rem' }}>Active Alerts</div>
              <div className="alerts-list">
                {alerts.map((a, i) => <AlertCard key={i} {...a} />)}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
