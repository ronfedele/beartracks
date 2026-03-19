'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import Nav from '@/components/Nav'
import { signStudentIn } from '@/lib/passes'
import type { UserProfile, LiveDashboardRow } from '@/lib/types'

export default function MonitorPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [rows, setRows] = useState<LiveDashboardRow[]>([])
  const [tick, setTick] = useState(0)
  const [loading, setLoading] = useState(true)
  const [roomFilter, setRoomFilter] = useState('')
  const [rooms, setRooms] = useState<string[]>([])

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/'; return }
      const { data: prof } = await supabase.from('user_profiles').select('*').eq('id', user.id).maybeSingle()
      setProfile(prof as any)
      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const { data } = await supabase.from('live_dashboard').select('*')
      const d = (data ?? []) as LiveDashboardRow[]
      setRows(d)
      setRooms([...new Set(d.map(r => r.room))].sort())
    }
    load()
    const ch = supabase.channel('monitor-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'passes' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  // Tick every 30s to update elapsed times
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 30000)
    return () => clearInterval(t)
  }, [])

  function elapsed(outTime: string) {
    return Math.round((Date.now() - new Date(outTime).getTime()) / 60000)
  }

  function elapsedClass(min: number) {
    if (min < 10) return 'text-green-700 bg-green-50 border-green-200'
    if (min < 15) return 'text-yellow-700 bg-yellow-50 border-yellow-200'
    if (min < 25) return 'text-orange-600 bg-orange-50 border-orange-200'
    return 'text-red-700 bg-red-50 border-red-200 font-bold'
  }

  const filtered = rows.filter(r => !roomFilter || r.room === roomFilter)
  const byRoom = filtered.reduce((acc, r) => {
    if (!acc[r.room]) acc[r.room] = []
    acc[r.room].push(r)
    return acc
  }, {} as Record<string, LiveDashboardRow[]>)

  if (loading) return <div className="min-h-screen bg-bear-cream flex items-center justify-center"><div className="text-bear-muted">Loading…</div></div>

  return (
    <div className="min-h-screen bg-bear-cream">
      <Nav role={profile?.role ?? 'monitor'} displayName={profile?.display_name ?? profile?.email} />
      <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">

        {/* Stats bar */}
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-display font-black text-bear-dark">Live Dashboard</h1>
            <p className="text-bear-muted text-sm mt-0.5">Real-time · auto-updates</p>
          </div>
          <div className="flex gap-3 ml-auto flex-wrap">
            <div className="card py-3 px-5 text-center">
              <div className="text-3xl font-display font-black text-bear-orange">{rows.length}</div>
              <div className="text-xs text-bear-muted font-semibold uppercase tracking-widest mt-0.5">Out Now</div>
            </div>
            <div className="card py-3 px-5 text-center">
              <div className="text-3xl font-display font-black text-red-600">
                {rows.filter(r => elapsed(r.out_time) >= 25).length}
              </div>
              <div className="text-xs text-bear-muted font-semibold uppercase tracking-widest mt-0.5">25+ min</div>
            </div>
            <div className="card py-3 px-5 text-center">
              <div className="text-3xl font-display font-black text-bear-dark">
                {Object.keys(byRoom).length}
              </div>
              <div className="text-xs text-bear-muted font-semibold uppercase tracking-widest mt-0.5">Rooms</div>
            </div>
          </div>
        </div>

        {/* Room filter */}
        {rooms.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setRoomFilter('')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${!roomFilter ? 'bg-bear-orange text-white' : 'bg-white border border-orange-200 text-bear-muted hover:text-bear-dark'}`}>
              All Rooms
            </button>
            {rooms.map(r => (
              <button key={r} onClick={() => setRoomFilter(r)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${roomFilter === r ? 'bg-bear-orange text-white' : 'bg-white border border-orange-200 text-bear-muted hover:text-bear-dark'}`}>
                {r}
              </button>
            ))}
          </div>
        )}

        {rows.length === 0 ? (
          <div className="card text-center py-20">
            <div className="text-5xl mb-4">🎉</div>
            <div className="text-xl font-display font-bold text-bear-dark">All students in class</div>
            <div className="text-bear-muted mt-2">No one is currently signed out.</div>
          </div>
        ) : (
          /* Group by room */
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Object.entries(byRoom).sort().map(([roomName, passes]) => (
              <div key={roomName} className="card">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-bear-dark">{roomName}</h3>
                  <span className="text-xs font-semibold text-bear-orange">{passes.length} out</span>
                </div>
                <div className="space-y-2">
                  {passes.map(p => {
                    const min = elapsed(p.out_time)
                    return (
                      <div key={p.id} className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-bear-dark truncate">{p.student}</div>
                          <div className="text-xs text-bear-muted">{p.destination}</div>
                        </div>
                        <span className={`text-xs font-mono px-2 py-0.5 rounded-full border ${elapsedClass(min)}`}>
                          {min}m
                        </span>
                        <button
                          onClick={() => signStudentIn(p.id)}
                          className="text-xs bg-green-100 hover:bg-green-200 text-green-800 px-2 py-1 rounded-lg font-semibold transition-colors"
                        >
                          ↩
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
