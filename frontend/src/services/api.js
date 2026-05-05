const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, options)
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`)
  return data
}

export const api = {
  health: () => request('/health'),
  train: () => request('/train', { method: 'POST' }),
  evaluate: () => request('/evaluate'),
  predict: (features) =>
    request('/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ features }),
    }),

  // Load Manager
  getLoads: () => request('/loads'),
  addLoad: (load) =>
    request('/loads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(load),
    }),
  updateLoad: (id, load) =>
    request(`/loads/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(load),
    }),
  deleteLoad: (id) => request(`/loads/${id}`, { method: 'DELETE' }),
  getContribution: () => request('/loads/contribution'),

  // Scheduler
  getSchedule: () => request('/schedule'),

  // Alerts
  getThreshold:  () => request('/alerts/threshold'),
  setThreshold:  (kwh) => request('/alerts/threshold', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ threshold_kwh: kwh }),
  }),
  getAlertStatus: () => request('/alerts/status'),

  // Forecasting
  getForecast: () => request('/forecast'),
}
