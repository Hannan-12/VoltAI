import { useState } from 'react'
import { api } from '../services/api'

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
      <div className="section-title">Sensor Readings</div>
      <p className="predict-hint">
        Enter the 6 values shown on your PZEM meter. Derived features are computed automatically.
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
