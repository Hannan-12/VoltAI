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

function ConfidenceRing({ value }) {
  const r = 44
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - value)

  return (
    <div className="conf-ring-wrap">
      <svg className="conf-ring-svg" width="110" height="110" viewBox="0 0 110 110">
        <defs>
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#f43f5e" />
          </linearGradient>
        </defs>
        <circle className="conf-ring-bg" cx="55" cy="55" r={r} strokeWidth="8" />
        <circle
          className="conf-ring-fill"
          cx="55" cy="55" r={r}
          strokeWidth="8"
          strokeDasharray={circ}
          strokeDashoffset={offset}
        />
        <g className="conf-ring-text">
          <text
            x="55" y="50"
            textAnchor="middle"
            fill="#f1f5f9"
            fontSize="15"
            fontWeight="700"
            fontFamily="Inter, sans-serif"
          >
            {(value * 100).toFixed(1)}%
          </text>
          <text
            x="55" y="66"
            textAnchor="middle"
            fill="#475569"
            fontSize="9"
            fontFamily="Inter, sans-serif"
            letterSpacing="0.08em"
          >
            CONFIDENCE
          </text>
        </g>
      </svg>
    </div>
  )
}

export default function PredictionResult({ result }) {
  if (!result) {
    return (
      <div className="glass-card result-placeholder">
        <div className="section-title">Classification Result</div>
        <div className="result-empty">
          <div className="result-empty-icon">⚡</div>
          <p>Results will appear here after classification.</p>
        </div>
      </div>
    )
  }

  const { predicted_label, confidence, probabilities } = result
  const sorted = Object.entries(probabilities).sort((a, b) => b[1] - a[1])

  return (
    <div className="glass-card predict-result-section">
      <div className="section-title">Classification Result</div>

      <div className="predict-result-top">
        <div className="predict-icon-wrap">
          {LABEL_ICONS[predicted_label] ?? '⚡'}
        </div>
        <div>
          <div className="predict-result-label">
            {predicted_label.replace(/_/g, ' ')}
          </div>
          <div className="predict-result-conf">
            Confidence: <strong>{(confidence * 100).toFixed(2)}%</strong>
          </div>
        </div>
      </div>

      <ConfidenceRing value={confidence} />

      <div className="prob-list">
        {sorted.map(([cls, prob]) => {
          const isActive = cls === predicted_label
          return (
            <div className="prob-row" key={cls}>
              <div className={`prob-name ${isActive ? 'active' : ''}`}>
                {LABEL_ICONS[cls]} {cls.replace(/_/g, ' ')}
              </div>
              <div className="prob-bar-wrap">
                <div
                  className={`prob-bar ${isActive ? 'active' : ''}`}
                  style={{
                    width: `${(prob * 100).toFixed(2)}%`,
                    background: isActive ? undefined : '#1e293b',
                  }}
                />
              </div>
              <div className={`prob-val ${isActive ? 'active' : ''}`}>
                {(prob * 100).toFixed(2)}%
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
