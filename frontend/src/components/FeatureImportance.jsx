import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts'

const COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#e0e7ff', '#22c55e', '#86efac', '#14b8a6', '#67e8f9']

export default function FeatureImportance({ data }) {
  const formatted = data.map((d) => ({
    ...d,
    pct: (d.importance * 100).toFixed(1),
  }))

  return (
    <div className="section">
      <h2 className="section-title">Feature Importance</h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={formatted} layout="vertical" margin={{ left: 20, right: 30, top: 10, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis type="number" tickFormatter={(v) => v + '%'} stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 12 }} />
          <YAxis type="category" dataKey="feature" width={160} stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 12 }} />
          <Tooltip
            formatter={(v) => v + '%'}
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
            labelStyle={{ color: '#e2e8f0' }}
            itemStyle={{ color: '#94a3b8' }}
          />
          <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
            {formatted.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
