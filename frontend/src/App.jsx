import { useState, useEffect } from 'react'
import { api } from './services/api'
import Dashboard from './components/Dashboard'
import LoadManager from './components/LoadManager'
import Scheduler from './components/Scheduler'
import Alerts from './components/Alerts'
import Forecast from './components/Forecast'
import './App.css'

const TABS = [
  { id: 'dashboard', icon: '⚡', label: 'Classify'      },
  { id: 'loads',     icon: '🔌', label: 'Load Manager'  },
  { id: 'schedule',  icon: '🗓️', label: 'Scheduler'     },
  { id: 'alerts',    icon: '🔔', label: 'Alerts'         },
  { id: 'forecast',  icon: '📈', label: 'Forecast'       },
]

export default function App() {
  const [status, setStatus]   = useState('checking')
  const [activeTab, setActiveTab] = useState('dashboard')

  useEffect(() => {
    api.health()
      .then(d  => setStatus(d.model_trained ? 'ready' : 'no-model'))
      .catch(() => setStatus('offline'))
  }, [])

  if (status === 'checking') {
    return (
      <div className="status-screen">
        <div className="status-spinner" />
        <span>Connecting to backend…</span>
      </div>
    )
  }

  if (status === 'offline') {
    return (
      <div className="status-screen error">
        <span className="status-screen-icon">⚠️</span>
        Backend offline — start the Flask server on port 5000.
      </div>
    )
  }

  if (status === 'no-model') {
    return (
      <div className="status-screen error">
        <span className="status-screen-icon">🤖</span>
        No trained model found.<br />
        Run <code>python3 train.py</code> in the backend folder, then refresh.
      </div>
    )
  }

  return (
    <>
      <nav className="app-nav">
        <div className="app-nav-inner">
          {/* Brand */}
          <div className="app-nav-brand">
            <div className="app-nav-logo">⚡</div>
            <div className="app-nav-brand-text">
              <span className="app-nav-brand-name">VoltaAI</span>
              <span className="app-nav-brand-sub">Energy Intelligence</span>
            </div>
          </div>

          {/* Tabs */}
          <div className="app-nav-tabs">
            {TABS.map(tab => (
              <button
                key={tab.id}
                className={`app-nav-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="tab-icon">{tab.icon}</span>
                <span className="tab-label">{tab.label}</span>
                {activeTab === tab.id && <span className="tab-indicator" />}
              </button>
            ))}
          </div>

          {/* Status pill */}
          <div className="app-nav-status">
            <span className="nav-status-dot" />
            Live
          </div>
        </div>
      </nav>

      <main>
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'loads'     && <LoadManager />}
        {activeTab === 'schedule'  && <Scheduler />}
        {activeTab === 'alerts'    && <Alerts />}
        {activeTab === 'forecast'  && <Forecast />}
      </main>
    </>
  )
}
