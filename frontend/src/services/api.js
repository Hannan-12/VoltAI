const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, options)
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`)
  return data
}

function post(path, body) {
  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export const api = {
  health:   () => request('/health'),
  evaluate: () => request('/evaluate'),
  appliances: () => request('/appliances'),

  // Core prediction endpoints
  predictBoth:      (reading) => post('/predict/both', reading),
  predictAppliance: (reading) => post('/predict/appliance', reading),
  predictPower:     (reading) => post('/predict/power', reading),

  // Legacy / batch
  predict:      (features) => post('/predict', { features }),
  predictBatch: (rows)     => post('/predict/batch', { rows }),

  // Recommendation engine
  recommend: (budgetWatts, loads) => {
    const loadsParam = loads.map(l => `${l.appliance}:${l.power_w}`).join(',')
    return request(`/recommend?budget_watts=${budgetWatts}&loads=${encodeURIComponent(loadsParam)}`)
  },

  // Load Manager
  getLoads:       () => request('/loads'),
  addLoad:        (load) => post('/loads', load),
  updateLoad:     (id, load) => request(`/loads/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(load) }),
  deleteLoad:     (id) => request(`/loads/${id}`, { method: 'DELETE' }),
  getContribution: () => request('/loads/contribution'),

  // Scheduler / Forecast / Alerts (legacy)
  getSchedule:    () => request('/schedule'),
  getForecast:    () => request('/forecast'),
  getThreshold:   () => request('/alerts/threshold'),
  setThreshold:   (kwh) => post('/alerts/threshold', { threshold_kwh: kwh }),
  getAlertStatus: () => request('/alerts/status'),

  // Training
  train: () => post('/train', {}),
}
