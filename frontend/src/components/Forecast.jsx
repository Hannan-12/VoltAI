import { useState, useEffect } from 'react'
import { api } from '../services/api'
import { SkeletonCard } from './Skeleton'
import './Forecast.css'

const TABS = ['24h', '7d', '30d']

function BarChart({ data, valueKey, labelKey, color = '#f43f5e', unit = 'kWh', maxBars = 30 }) {
  const items = data.slice(0, maxBars)
  const max = Math.max(...items.map(d => d[valueKey]), 0.01)

  return (
    <div className="bar-chart">
      {items.map((item, i) => {
        const pct = (item[valueKey] / max) * 100
        return (
          <div className="bar-col" key={i}>
            <div className="bar-tooltip">{item[valueKey]} {unit}</div>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{ height: `${pct}%`, background: color }}
              />
            </div>
            <div className="bar-label">{item[labelKey]}</div>
          </div>
        )
      })}
    </div>
  )
}

function HourlyChart({ hours }) {
  const max = Math.max(...hours.map(h => h.kwh), 0.01)
  const peakHours = new Set([7, 8, 18, 19, 20, 21])
    // amber for peak, rose for normal

  return (
    <div className="bar-chart hourly">
      {hours.map(h => {
        const pct = (h.kwh / max) * 100
        const isPeak = peakHours.has(h.hour)
        const color = isPeak ? '#f59e0b' : '#f43f5e'
        const label = h.hour === 0 ? '12a'
          : h.hour < 12 ? `${h.hour}a`
          : h.hour === 12 ? '12p'
          : `${h.hour - 12}p`

        return (
          <div className="bar-col" key={h.hour}>
            <div className="bar-tooltip">{h.kwh} kWh</div>
            <div className="bar-track">
              <div className="bar-fill" style={{ height: `${pct}%`, background: color }} />
            </div>
            <div className={`bar-label ${isPeak ? 'peak' : ''}`}>{label}</div>
          </div>
        )
      })}
    </div>
  )
}

function SummaryCard({ icon, title, value, sub, color }) {
  return (
    <div className="fc-summary-card">
      <div className="fc-summary-icon">{icon}</div>
      <div>
        <div className="fc-summary-title">{title}</div>
        <div className="fc-summary-value" style={{ color }}>{value}</div>
        {sub && <div className="fc-summary-sub">{sub}</div>}
      </div>
    </div>
  )
}

export default function Forecast() {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [activeTab, setActiveTab] = useState('24h')

  useEffect(() => {
    api.getForecast()
      .then(d  => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  return (
    <div className="fc-page">
      <header className="sub-page-header">
        <div className="sph-left">
          <span className="sph-page-icon">📈</span>
          <h1 className="sph-title">Energy Forecast</h1>
          <p className="sph-desc">Predicted consumption based on historical PZEM sensor patterns — 24h, 7-day, and 30-day views.</p>
        </div>
        {data && (
          <div className="sph-stats">
            <div className="sph-stat">
              <span className="sph-stat-value">{data.forecast_24h.total_kwh}</span>
              <span className="sph-stat-label">kWh Tomorrow</span>
            </div>
            <div className="sph-stat">
              <span className="sph-stat-value">{data.forecast_7d.total_kwh}</span>
              <span className="sph-stat-label">kWh / 7 Days</span>
            </div>
            <div className="sph-stat">
              <span className="sph-stat-value">{data.forecast_30d.total_kwh}</span>
              <span className="sph-stat-label">kWh / 30 Days</span>
            </div>
            <div className="sph-stat">
              <span className="sph-stat-value">{data.model_info.training_days}</span>
              <span className="sph-stat-label">Training Days</span>
            </div>
          </div>
        )}
      </header>

      <div className="fc-body">
        {loading && <SkeletonCard rows={5} />}

        {error && (
          <div className="glass-card fc-empty" style={{ color: '#f87171' }}>{error}</div>
        )}

        {!loading && !error && data && (
          <>
            {/* ── Summary Cards ── */}
            <div className="fc-summary-row">
              <SummaryCard
                icon="🔮"
                title="Tomorrow"
                value={`${data.forecast_24h.total_kwh} kWh`}
                sub={data.forecast_24h.date}
                color="#a5b4fc"
              />
              <SummaryCard
                icon="📅"
                title="7-Day Total"
                value={`${data.forecast_7d.total_kwh} kWh`}
                sub={`~${data.forecast_7d.avg_kwh_per_day} kWh/day avg`}
                color="#67e8f9"
              />
              <SummaryCard
                icon="📆"
                title="30-Day Total"
                value={`${data.forecast_30d.total_kwh} kWh`}
                sub={`~${data.forecast_30d.avg_kwh_per_day} kWh/day avg`}
                color="#86efac"
              />
              <SummaryCard
                icon="📊"
                title="Recent Avg"
                value={`${data.model_info.recent_mean_kwh} kWh`}
                sub="Weighted last 14 days"
                color="#fbbf24"
              />
            </div>

            {/* ── Forecast Tabs ── */}
            <div className="glass-card">
              <div className="fc-tab-bar">
                {TABS.map(t => (
                  <button
                    key={t}
                    className={`fc-tab ${activeTab === t ? 'active' : ''}`}
                    onClick={() => setActiveTab(t)}
                  >
                    {t === '24h' ? 'Next 24 Hours' : t === '7d' ? 'Next 7 Days' : 'Next 30 Days'}
                  </button>
                ))}
              </div>

              {activeTab === '24h' && (
                <div>
                  <div className="section-title">Hourly Breakdown — {data.forecast_24h.date}</div>
                  <div className="fc-chart-legend">
                    <span className="fc-legend-dot" style={{ background: '#f43f5e' }} /> Regular hours
                    <span className="fc-legend-dot" style={{ background: '#f59e0b', marginLeft: '1rem' }} /> Peak hours (7–9am, 6–10pm)
                  </div>
                  <HourlyChart hours={data.forecast_24h.hourly} />
                  <div className="fc-chart-note">
                    Estimated total: <strong>{data.forecast_24h.total_kwh} kWh</strong> for the day.
                    Peak hours show higher usage based on typical household patterns.
                  </div>
                </div>
              )}

              {activeTab === '7d' && (
                <div>
                  <div className="section-title">7-Day Forecast</div>
                  <BarChart
                    data={data.forecast_7d.days}
                    valueKey="kwh"
                    labelKey="day_label"
                    color="#f43f5e"
                  />
                  <div className="fc-chart-note">
                    Total: <strong>{data.forecast_7d.total_kwh} kWh</strong> over 7 days &nbsp;·&nbsp;
                    Average: <strong>{data.forecast_7d.avg_kwh_per_day} kWh/day</strong>
                  </div>
                </div>
              )}

              {activeTab === '30d' && (
                <div>
                  <div className="section-title">30-Day Forecast</div>
                  <BarChart
                    data={data.forecast_30d.days}
                    valueKey="kwh"
                    labelKey="day_label"
                    color="#14b8a6"
                    maxBars={30}
                  />
                  <div className="fc-chart-note">
                    Total: <strong>{data.forecast_30d.total_kwh} kWh</strong> over 30 days &nbsp;·&nbsp;
                    Average: <strong>{data.forecast_30d.avg_kwh_per_day} kWh/day</strong>
                  </div>
                </div>
              )}
            </div>

            {/* ── Historical Chart ── */}
            <div className="glass-card">
              <div className="section-title">Historical Daily Usage (Last {data.history.length} Days)</div>
              <BarChart
                data={data.history}
                valueKey="kwh"
                labelKey="day_label"
                color="rgba(99,102,241,0.6)"
              />
              <div className="fc-chart-note">
                Actual recorded consumption from PZEM sensor data.
                Global average: <strong>{data.model_info.global_mean_kwh} kWh/day</strong>
              </div>
            </div>

            {/* ── Model Info ── */}
            <div className="glass-card fc-model-info">
              <div className="section-title">Forecast Method</div>
              <p className="fc-model-desc">{data.model_info.method}</p>
              <div className="fc-model-stats">
                <span>Training days: <strong>{data.model_info.training_days}</strong></span>
                <span>Recent mean: <strong>{data.model_info.recent_mean_kwh} kWh</strong></span>
                <span>Global mean: <strong>{data.model_info.global_mean_kwh} kWh</strong></span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
