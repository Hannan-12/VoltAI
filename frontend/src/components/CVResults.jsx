export default function CVResults({ cvMean, cvStd, cvScores }) {
  return (
    <div className="section">
      <h2 className="section-title">Cross-Validation Results (5-Fold)</h2>
      <div className="cv-summary">
        <span className="cv-mean">{(cvMean * 100).toFixed(2)}%</span>
        <span className="cv-std"> ± {(cvStd * 100).toFixed(2)}%</span>
      </div>
      <div className="cv-folds">
        {cvScores.map((score, i) => (
          <div className="cv-fold" key={i}>
            <div className="cv-fold-label">Fold {i + 1}</div>
            <div className="cv-fold-bar-wrap">
              <div
                className="cv-fold-bar"
                style={{ width: `${(score * 100).toFixed(1)}%` }}
              />
            </div>
            <div className="cv-fold-val">{(score * 100).toFixed(2)}%</div>
          </div>
        ))}
      </div>
    </div>
  )
}
