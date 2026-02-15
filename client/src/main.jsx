import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './context/AuthContext'
import App from './App'
import './index.css'
import { onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

const reportWebVital = (metric) => {
  try {
    if (Math.random() > 0.1) return
    const token = localStorage.getItem('token')
    const payload = {
      ...metric,
      page: window.location.pathname
    }

    fetch(`${API_BASE}/api/metrics/web-vitals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(payload)
    }).catch(() => {})
  } catch (e) {
    // ignore
  }
}

onCLS(reportWebVital)
onFCP(reportWebVital)
onINP(reportWebVital)
onLCP(reportWebVital)
onTTFB(reportWebVital)

const root = ReactDOM.createRoot(document.getElementById('root'))
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Toaster position='top-right' />
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
