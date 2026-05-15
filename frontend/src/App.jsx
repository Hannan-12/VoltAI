import { useState, useEffect } from 'react'
import { api } from './services/api'
import Dashboard from './components/Dashboard'
import LoadManager from './components/LoadManager'
import Scheduler from './components/Scheduler'
import Alerts from './components/Alerts'
import Forecast from './components/Forecast'
import MonthlyReport from './components/MonthlyReport'
import './App.css'

const TABS = [
  { id: 'dashboard', icon: '⚡', label: 'Classify'        },
  { id: 'loads',     icon: '🔌', label: 'Load Manager'    },
  { id: 'monthly',   icon: '📅', label: 'Monthly Report'  },
  { id: 'alerts',    icon: '🔔', label: 'Alerts'          },
  { id: 'schedule',  icon: '🗓️', label: 'Scheduler'       },
  { id: 'forecast',  icon: '📈', label: 'Forecast'        },
]

export default function App() {
  const [status, setStatus]     = useState('checking')
  const [activeTab, setActiveTab] = useState('dashboard')
  const [collapsed, setCollapsed] = useState(false)

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
    <div className={`app-layout ${collapsed ? 'sidebar-collapsed' : ''}`}>
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        {/* Brand */}
        <div className="sidebar-brand">
          <div className="sidebar-logo">⚡</div>
          {!collapsed && (
            <div className="sidebar-brand-text">
              <span className="sidebar-brand-name">Smart Meter</span>
              <span className="sidebar-brand-sub">Energy Intelligence</span>
            </div>
          )}
        </div>

        {/* Nav items */}
        <nav className="sidebar-nav">
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`sidebar-item ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              title={collapsed ? tab.label : undefined}
            >
              {activeTab === tab.id && <span className="sidebar-active-bar" />}
              <span className="sidebar-item-icon">{tab.icon}</span>
              {!collapsed && <span className="sidebar-item-label">{tab.label}</span>}
            </button>
          ))}
        </nav>

        {/* Bottom: live pill + collapse toggle */}
        <div className="sidebar-footer">
          {!collapsed && (
            <div className="sidebar-status">
              <span className="nav-status-dot" />
              <span>Live</span>
            </div>
          )}
          <button
            className="sidebar-collapse-btn"
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? '›' : '‹'}
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="app-main">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'loads'     && <LoadManager />}
        {activeTab === 'monthly'   && <MonthlyReport />}
        {activeTab === 'alerts'    && <Alerts />}
        {activeTab === 'schedule'  && <Scheduler />}
        {activeTab === 'forecast'  && <Forecast />}
      </main>
    </div>
  )
}
