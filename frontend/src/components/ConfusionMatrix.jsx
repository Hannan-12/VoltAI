export default function ConfusionMatrix({ matrix, labels }) {
  const max = Math.max(...matrix.flat())

  function cellColor(value) {
    const intensity = max > 0 ? value / max : 0
    const r = Math.round(99 + (239 - 99) * intensity)
    const g = Math.round(102 + (68 - 102) * intensity)
    const b = Math.round(241 + (68 - 241) * intensity)
    return `rgb(${r},${g},${b})`
  }

  const shortLabel = (l) => l.replace('WashingMachine_', 'WM_').replace('Refrigerator_', 'Fridge_')

  return (
    <div className="section">
      <h2 className="section-title">Confusion Matrix</h2>
      <div className="cm-wrapper">
        <div className="cm-scroll">
          <table className="cm-table">
            <thead>
              <tr>
                <th className="cm-corner">Actual \ Predicted</th>
                {labels.map((l) => (
                  <th key={l} className="cm-header">{shortLabel(l)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((row, i) => (
                <tr key={i}>
                  <td className="cm-row-label">{shortLabel(labels[i])}</td>
                  {row.map((val, j) => (
                    <td
                      key={j}
                      className="cm-cell"
                      style={{
                        background: cellColor(val),
                        fontWeight: i === j ? 700 : 400,
                      }}
                    >
                      {val}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
