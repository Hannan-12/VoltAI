import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../services/api'

const SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vS-6G97-09OKa0ogiNKnMQIKx6-caMw404tz1eAr95HV9yRzwT51_dA5toc7dF3shJdzporH5p2z6sf/pub?output=csv'

async function fetchLatestSheetRow() {
  const res = await fetch(SHEET_CSV_URL)
  const text = await res.text()
  const lines = text.trim().split('\n').filter(Boolean)
  if (lines.length < 2) throw new Error('No data in sheet')
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  const last = lines[lines.length - 1].split(',').map(v => v.trim().replace(/^"|"$/g, ''))
  const row = {}
  headers.forEach((h, i) => { row[h] = last[i] ?? '' })
  return row
}

const FIELDS = [
  { key: 'Voltage',      label: 'Voltage',      unit: 'V',  placeholder: '219.2' },
  { key: 'Current',      label: 'Current',      unit: 'A',  placeholder: '0.736' },
  { key: 'Power',        label: 'Power',        unit: 'W',  placeholder: '108.8' },
  { key: 'Energy',       label: 'Energy',       unit: 'Wh', placeholder: '53'    },
  { key: 'Frequency',    label: 'Frequency',    unit: 'Hz', placeholder: '49.6'  },
  { key: 'Power Factor', label: 'Power Factor', unit: '',   placeholder: '0.67'  },
]

const MEAN_PF = 0.676

// Sample readings for quick testing
const SAMPLES = [
  { label: 'Refrigerator', Voltage: '219.2', Current: '0.736', Power: '108.8', Energy: '53', Frequency: '49.6', 'Power Factor': '0.67' },
  { label: 'LED Bulbs',    Voltage: '220.1', Current: '0.180', Power: '30.5',  Energy: '12', Frequency: '50.0', 'Power Factor': '0.77' },
  { label: 'Water Pump',   Voltage: '218.5', Current: '3.200', Power: '650.0', Energy: '210', Frequency: '49.8', 'Power Factor': '0.93' },
]

export default function PredictionForm({ onResult }) {
  const [values, setValues] = useState({
    Voltage: '', Current: '', Power: '', Energy: '', Frequency: '', 'Power Factor': '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [liveMode, setLiveMode] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const intervalRef = useRef(null)

  const autoClassify = useCallback(async () => {
    try {
      const row = await fetchLatestSheetRow()
      const newVals = {
        Voltage: row['Voltage'] ?? '',
        Current: row['Current'] ?? '',
        Power: row['Power'] ?? '',
        Energy: row['Energy'] ?? '',
        Frequency: row['Frequency'] ?? '',
        'Power Factor': row['Power Factor'] ?? '',
      }
      setValues(newVals)
      setLastUpdated(new Date())
      setError(null)
      const result = await api.predict(buildFeatures(newVals))
      onResult(result)
    } catch (err) {
      setError('Live feed error: ' + err.message)
    }
  }, [onResult])

  useEffect(() => {
    if (liveMode) {
      autoClassify()
      intervalRef.current = setInterval(autoClassify, 9000)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [liveMode, autoClassify])

  function handleChange(key, val) {
    setValues((v) => ({ ...v, [key]: val }))
  }

  function buildFeatures(v) {
    const voltage     = parseFloat(v['Voltage'])
    const current     = parseFloat(v['Current'])
    const power       = parseFloat(v['Power'])
    const energy      = parseFloat(v['Energy'])
    const frequency   = parseFloat(v['Frequency'])
    const powerFactor = parseFloat(v['Power Factor'])

    const apparent_power         = voltage * current
    const reactive_power         = Math.sqrt(Math.max(apparent_power ** 2 - power ** 2, 0))
    const power_factor_deviation = Math.abs(powerFactor - MEAN_PF)

    return {
      Voltage: voltage, Current: current, Power: power,
      Energy: energy, Frequency: frequency, 'Power Factor': powerFactor,
      apparent_power, reactive_power, power_factor_deviation,
    }
  }

  async function handlePredict(e) {
    e.preventDefault()
    setError(null)

    const missing = FIELDS.filter((f) => values[f.key].trim() === '')
    if (missing.length) {
      setError(`Please fill in: ${missing.map((f) => f.label).join(', ')}`)
      return
    }

    setLoading(true)
    try {
      const result = await api.predict(buildFeatures(values))
      onResult(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleReset() {
    setValues({ Voltage: '', Current: '', Power: '', Energy: '', Frequency: '', 'Power Factor': '' })
    setError(null)
    onResult(null)
  }

  return (
    <div className="glass-card">
      <div className="section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Sensor Readings</span>
        <button
          type="button"
          onClick={() => setLiveMode(m => !m)}
          style={{
            fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.05em',
            padding: '4px 12px', borderRadius: '999px', border: 'none', cursor: 'pointer',
            background: liveMode ? '#22c55e22' : '#ffffff18',
            color: liveMode ? '#22c55e' : '#9ca3af',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: liveMode ? '#22c55e' : '#6b7280',
            display: 'inline-block',
            animation: liveMode ? 'pulse 1.5s infinite' : 'none',
          }} />
          {liveMode ? 'LIVE' : 'PAUSED'}
        </button>
      </div>
      <p className="predict-hint">
        {liveMode
          ? `Auto-fetching from meter every 9s.${lastUpdated ? ' Last update: ' + lastUpdated.toLocaleTimeString() : ''}`
          : 'Enter the 6 values shown on your PZEM meter. Derived features are computed automatically.'}
      </p>

      {/* Quick fill samples */}
      <div className="quick-fill-row">
        <span className="quick-fill-label">Quick fill:</span>
        {SAMPLES.map(s => (
          <button
            key={s.label}
            type="button"
            className="quick-fill-btn"
            onClick={() => {
              const { label, ...vals } = s
              setValues(vals)
              setError(null)
              onResult(null)
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <form onSubmit={handlePredict}>
        <div className="predict-inputs">
          {FIELDS.map(({ key, label, unit, placeholder }) => (
            <div className="predict-field" key={key}>
              <label className="predict-label">{label}</label>
              <div className="predict-input-wrap">
                <input
                  className="predict-input"
                  type="number"
                  step="any"
                  placeholder={placeholder}
                  value={values[key]}
                  onChange={(e) => handleChange(key, e.target.value)}
                />
                {unit && <span className="predict-unit">{unit}</span>}
              </div>
            </div>
          ))}
        </div>

        {error && <div className="predict-error">{error}</div>}

        <div className="predict-actions">
          <button className="predict-btn" type="submit" disabled={loading}>
            {loading ? <><span className="spinner" /> Classifying…</> : '⚡ Classify Appliance'}
          </button>
          <button className="reset-btn" type="button" onClick={handleReset}>
            Reset
          </button>
        </div>
      </form>
    </div>
  )
}
