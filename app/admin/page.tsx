'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import Nav from '@/components/Nav'
import type { UserProfile } from '@/lib/types'
import { format } from 'date-fns'

interface Stats {
  totalOut: number
  todayPasses: number
  deniedToday: number
  avgMinutes: number
  longOut: number  // 25+ min
}

export default function AdminPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [stats, setStats] = useState<Stats>({ totalOut: 0, todayPasses: 0, deniedToday: 0, avgMinutes: 0, longOut: 0 })
  const [recentPasses, setRecentPasses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/'; return }
      const { data: prof } = await supabase.from('user_profiles').select('*').eq('id', user.id).maybeSingle()
      if (prof?.role !== 'admin') { window.location.href = '/'; return }
      setProfile(prof as any)

      const today = new Date().toISOString().split('T')[0]

      const [
        { data: liveData },
        { data: todayData },
        { data: recentData },
      ] = await Promise.all([
        supabase.from('live_dashboard').select('*'),
        supabase.from('passes').select('status, elapsed_minutes, denial_reason').gte('out_time', today),
        supabase.from('passes').select('*, student:students(*), destination:destinations(*), room:rooms(*)').order('out_time', { ascending: false }).limit(10),
      ])

      const live = liveData ?? []
      const today_ = todayData ?? []
      setStats({
        totalOut: live.length,
        todayPasses: today_.filter(p => p.status !== 'DENIED').length,
        deniedToday: today_.filter(p => p.status === 'DENIED').length,
        avgMinutes: today_.filter(p => p.elapsed_minutes).reduce((a, p) => a + p.elapsed_minutes, 0) / (today_.filter(p => p.elapsed_minutes).length || 1),
        longOut: live.filter((p: any) => {
          const min = (Date.now() - new Date(p.out_time).getTime()) / 60000
          return min >= 25
        }).length,
      })
      setRecentPasses((recentData ?? []) as any)
      setLoading(false)
    }
    init()
  }, [])

  const cards = [
    { label: 'Out Right Now', value: stats.totalOut, icon: '🚶', color: 'text-bear-orange' },
    { label: 'Passes Today', value: stats.todayPasses, icon: '✅', color: 'text-green-600' },
    { label: 'Denied Today', value: stats.deniedToday, icon: '🚫', color: 'text-red-600' },
    { label: '25+ Min Out', value: stats.longOut, icon: '⏰', color: 'text-red-600' },
    { label: 'Avg Minutes', value: Math.round(stats.avgMinutes), icon: '⏱', color: 'text-bear-muted' },
  ]

  const adminLinks = [
    { href: '/admin/students',  label: 'Manage Students', icon: '👥', desc: 'Add, edit, import students & flags' },
    { href: '/admin/schedules', label: 'Student Schedules',icon: '🗓️', desc: 'Assign rooms per period per student' },
    { href: '/admin/rooms',     label: 'Manage Rooms',    icon: '🚪', desc: 'Teachers, room emails, bell groups' },
    { href: '/admin/calendar',  label: 'School Calendar', icon: '📅', desc: 'Set Regular / Minimum / Rally days' },
    { href: '/admin/settings',  label: 'Settings',        icon: '⚙️', desc: 'Time restrictions, passwords, pass rules' },
    { href: '/monitor',         label: 'Live Monitor',    icon: '🖥️', desc: 'Real-time campus pass view' },
    { href: '/monitor/log',     label: 'Full Log',        icon: '📋', desc: 'All pass history with filters' },
  ]

  if (loading) return <div className="min-h-screen bg-bear-cream flex items-center justify-center"><div className="text-bear-muted">Loading…</div></div>

  return (
    <div className="min-h-screen bg-bear-cream">
      <Nav role="admin" displayName={profile?.display_name ?? profile?.email} />
      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-4xl font-display font-black text-bear-dark">Admin Dashboard</h1>
          <p className="text-bear-muted mt-1">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {cards.map(c => (
            <div key={c.label} className="card text-center py-5">
              <div className="text-3xl mb-1">{c.icon}</div>
              <div className={`text-4xl font-display font-black ${c.color}`}>{c.value}</div>
              <div className="text-xs text-bear-muted font-semibold uppercase tracking-widest mt-1">{c.label}</div>
            </div>
          ))}
        </div>

        {/* Quick links */}
        <div>
          <h2 className="text-xl font-display font-bold text-bear-dark mb-4">Administration</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {adminLinks.map(l => (
              <a key={l.href} href={l.href} className="card hover:border-orange-300 hover:shadow-md transition-all flex items-start gap-4 cursor-pointer">
                <span className="text-3xl">{l.icon}</span>
                <div>
                  <div className="font-bold text-bear-dark">{l.label}</div>
                  <div className="text-sm text-bear-muted mt-0.5">{l.desc}</div>
                </div>
              </a>
            ))}
          </div>
        </div>

        {/* Recent passes */}
        <div className="card">
          <h2 className="text-lg font-bold text-bear-dark mb-4">Recent Passes</h2>
          <div className="space-y-2">
            {recentPasses.map(p => (
              <div key={p.id} className="flex items-center gap-3 py-2 border-b border-orange-50 last:border-0">
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${p.status === 'OUT' ? 'badge-out' : p.status === 'IN' ? 'badge-in' : p.status === 'DENIED' ? 'badge-denied' : 'badge-closed'}`}>
                  {p.status}
                </span>
                <span className="font-medium text-bear-dark text-sm flex-1">
                  {p.student?.first_name} {p.student?.last_name}
                </span>
                <span className="text-bear-muted text-sm">{p.room?.room_number}</span>
                <span className="text-bear-muted text-sm">{p.destination?.name}</span>
                <span className="text-bear-muted text-xs font-mono">{format(new Date(p.out_time), 'h:mm a')}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
