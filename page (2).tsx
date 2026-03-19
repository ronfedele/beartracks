'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const supabase = createClient()

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError || !data.user) {
      setError(authError?.message ?? 'Login failed')
      setLoading(false)
      return
    }

    // Get role and redirect
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', data.user.id)
      .maybeSingle()

    const role = profile?.role ?? 'teacher'
    const routes: Record<string, string> = {
      admin:    '/admin',
      monitor:  '/monitor',
      teacher:  '/teacher',
      terminal: '/terminal',
    }
    router.replace(routes[role] ?? '/teacher')
  }

  return (
    <div className="min-h-screen terminal-screen flex items-center justify-center paw-bg">
      <div className="w-full max-w-sm px-4">
        {/* Logo area */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">🐾</div>
          <h1 className="text-4xl font-display font-black text-white tracking-tight">
            Bear Tracks
          </h1>
          <p className="text-bear-muted mt-1 text-sm font-body">OMS Pass Management System</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-bear-muted mb-1 uppercase tracking-widest">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-bear-orange focus:border-transparent text-sm"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-bear-muted mb-1 uppercase tracking-widest">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-bear-orange focus:border-transparent text-sm"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="bg-red-900/40 border border-red-500/30 rounded-xl px-4 py-3 text-red-300 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-bear-orange hover:bg-orange-600 active:bg-orange-700 disabled:opacity-60 text-white font-semibold rounded-xl py-3 transition-all duration-150 text-sm"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-xs text-white/20 mt-8">
          Bear Tracks v2 · Konocti USD
        </p>
      </div>
    </div>
  )
}
