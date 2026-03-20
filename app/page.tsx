'use client'
import { useState } from 'react'
import { createClient, isConfigured } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const ROLE_ROUTES: Record<string, string> = {
  admin:    '/admin',
  monitor:  '/monitor',
  teacher:  '/teacher',
  terminal: '/terminal',
}

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const router = useRouter()

  const notConfigured = !isConfigured()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (notConfigured) {
      setError('App is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel environment variables, then redeploy.')
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()

      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({ email, password })

      if (authError || !authData.user) {
        setError(authError?.message ?? 'Login failed. Check your email and password.')
        setLoading(false)
        return
      }

      // Fetch role — retry up to 3× to allow session cookie to propagate
      let role = 'teacher'
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('role')
          .eq('id', authData.user.id)
          .maybeSingle()

        if (profile?.role) {
          role = profile.role
          break
        }
        if (attempt < 2) await new Promise(r => setTimeout(r, 600))
      }

      router.replace(ROLE_ROUTES[role] ?? '/teacher')
    } catch (err: any) {
      // Surface the real error message in development
      const msg = err?.message ?? ''
      if (msg.includes('fetch') || msg.includes('network') || msg.includes('Failed')) {
        setError('Cannot reach the server. Check your internet connection and try again.')
      } else if (msg.includes('Invalid URL') || msg.includes('placeholder')) {
        setError('App is not configured. Set environment variables in Vercel and redeploy.')
      } else {
        setError(msg || 'Login failed. Please try again.')
      }
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen terminal-screen flex items-center justify-center paw-bg">
      <div className="w-full max-w-sm px-4">
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">🐾</div>
          <h1 className="text-4xl font-display font-black text-white tracking-tight">
            Bear Tracks
          </h1>
          <p className="text-bear-muted mt-1 text-sm font-body">OMS Pass Management System</p>
        </div>

        {notConfigured && (
          <div className="bg-yellow-900/40 border border-yellow-500/40 rounded-xl px-4 py-3 text-yellow-200 text-xs mb-4 leading-relaxed">
            ⚠️ <strong>Setup required:</strong> Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in Vercel → Settings → Environment Variables, then redeploy.
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-bear-muted mb-1 uppercase tracking-widest">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-bear-orange focus:border-transparent text-sm"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-bear-muted mb-1 uppercase tracking-widest">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-bear-orange focus:border-transparent text-sm"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="bg-red-900/40 border border-red-500/30 rounded-xl px-4 py-3 text-red-300 text-sm leading-relaxed">
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
