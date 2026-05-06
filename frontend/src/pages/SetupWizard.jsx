import React, { useState } from 'react'

const SetupWizard = ({ onComplete }) => {
  const [step, setStep] = useState(1)
  const [config, setConfig] = useState({
    api_url: '',
    outlet_id: '',
    outlet_name: '',
    email: '',
    password: '',
    printer_ip: '',
  })

  // Basic styling aligned with brand colors from themes
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-900 text-white">
      
      {step === 1 && (
        <div className="text-center max-w-lg">
          <div className="text-8xl mb-6">🍽️</div>
          <h1 className="text-4xl font-black mb-4 tracking-tight">
            Welcome to MS-RM System
          </h1>
          <p className="text-slate-400 mb-8 text-lg">
            Let's set up this POS terminal for your restaurant.
            You'll need your manager login credentials.
          </p>
          <button
            onClick={() => setStep(2)}
            className="px-8 py-4 bg-orange-600 hover:bg-orange-500 transition-colors
                       text-white rounded-2xl font-bold text-lg w-full shadow-lg"
          >
            Get Started →
          </button>
        </div>
      )}

      {step === 2 && (
        <LoginStep 
          onComplete={(data) => {
            setConfig(prev => ({...prev, ...data}))
            setStep(3)
          }}
          onBack={() => setStep(1)}
        />
      )}

      {step === 3 && (
        <PrinterStep 
          onComplete={(data) => {
            const finalConfig = { ...config, ...data }
            setConfig(finalConfig)
            onComplete(finalConfig)
          }}
          onSkip={() => onComplete(config)}
          onBack={() => setStep(2)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────
// Step 2: Login
// ─────────────────────────────────────
const LoginStep = ({ onComplete, onBack }) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Example API logic...
    try {
      // Assuming a real login check, here we just simulate saving it
      if (!email || !password) throw new Error("Email and password are required")
      
      onComplete({ email, password, outlet_id: 'default' })
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md bg-slate-800 p-8 rounded-2xl shadow-xl">
      <h2 className="text-2xl font-bold mb-2">Manager Login</h2>
      <p className="text-slate-400 mb-6">Connect this terminal to your account</p>
      
      {error && (
        <div className="mb-4 bg-red-900/50 text-red-200 border border-red-500/50 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="admin@restaurant.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="••••••••"
          />
        </div>
        
        <div className="pt-4 flex gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 py-3 px-4 bg-slate-700 hover:bg-slate-600 rounded-xl font-medium transition-colors"
          >
            Back
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-[2] py-3 px-4 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 rounded-xl font-bold transition-colors"
          >
            {loading ? 'Connecting...' : 'Connect Terminal'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─────────────────────────────────────
// Step 3: Hardware / Printers
// ─────────────────────────────────────
const PrinterStep = ({ onComplete, onSkip, onBack }) => {
  const [printerIp, setPrinterIp] = useState('192.168.1.100')

  const handleSave = () => {
    onComplete({ printer_ip: printerIp })
  }

  return (
    <div className="w-full max-w-md bg-slate-800 p-8 rounded-2xl shadow-xl">
      <h2 className="text-2xl font-bold mb-2">Thermal Printer</h2>
      <p className="text-slate-400 mb-6">Set up your KOT and receipt printer.</p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Printer IP Address</label>
          <input
            type="text"
            value={printerIp}
            onChange={e => setPrinterIp(e.target.value)}
            className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="192.168.1.100"
          />
        </div>
        
        {/* Placeholder for future cash drawer / scale setup */}
        <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700">
          <div className="flex items-center justify-between">
            <span className="font-medium text-slate-300">Cash Drawer</span>
            <span className="text-xs bg-slate-700 px-2 py-1 rounded text-slate-400 uppercase tracking-widest font-bold">Via Printer</span>
          </div>
        </div>

        <div className="pt-4 flex gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 py-3 px-4 bg-slate-700 hover:bg-slate-600 rounded-xl font-medium transition-colors"
          >
            Back
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="flex-1 py-3 px-4 bg-slate-700 hover:bg-slate-600 rounded-xl font-medium transition-colors"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-[2] py-3 px-4 bg-orange-600 hover:bg-orange-500 rounded-xl font-bold transition-colors"
          >
            Finish Setup
          </button>
        </div>
      </div>
    </div>
  )
}

export default SetupWizard
