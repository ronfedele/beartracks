'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import Nav from '@/components/Nav'
import type { UserProfile } from '@/lib/types'
import { format } from 'date-fns'

export default function MonitorReportsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [overdueNow, setOverdueNow] = useState<any[]>([])
  const [allOut, setAllOut] = useState<any[]>([])
  const [hourly, setHourly] = useState<any[]>([])
  const [rooms, setRooms] = useState<any[]>([])
  const [destinations, setDestinations] = useState<any[]>([])
  const [flyers, setFlyers] = useState<any[]>([])
  const [dateRange, setDateRange] = useState('7d')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/'; return }
      const { data: prof } = await supabase.from('user_profiles').select('*').eq('id', user.id).maybeSingle()
      setProfile(prof as any)
      await loadData(supabase)
    }
    init()
    const t = setInterval(async () => {
      const supabase = createClient()
      const [{ data: od }, { data: ao }] = await Promise.all([
        supabase.from('report_overdue').select('*'),
        supabase.from('live_dashboard').select('*'),
      ])
      setOverdueNow(od ?? [])
      setAllOut(ao ?? [])
    }, 30000)
    return () => clearInterval(t)
  }, [])

  async function loadData(supabase?: any) {
    const sb = supabase ?? createClient()
    const [
      { data: od }, { data: ao }, { data: hr },
      { data: rm }, { data: ds }, { data: ff }
    ] = await Promise.all([
      sb.from('report_overdue').select('*'),
      sb.from('live_dashboard').select('*'),
      sb.from('report_hourly_volume').select('*'),
      sb.from('report_room_summary').select('*'),
      sb.from('report_destinations').select('*'),
      sb.from('report_frequent_flyers').select('*').limit(10),
    ])
    setOverdueNow(od ?? [])
    setAllOut(ao ?? [])
    setHourly(hr ?? [])
    setRooms(rm ?? [])
    setDestinations(ds ?? [])
    setFlyers(ff ?? [])
    setLoading(false)
  }

  const maxHourly = Math.max(...hourly.map((h: any) => h.total_passes), 1)

  if (!profile) return <div className="min-h-screen bg-bear-cream flex items-center justify-center"><div className="text-bear-muted">Loading…</div></div>

  return (
    <div className="min-h-screen bg-bear-cream">
      <Nav role={profile.role as any} displayName={profile.display_name ?? profile.email} />
      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-4xl font-display font-black text-bear-dark">Campus Monitor Reports</h1>
          <p className="text-bear-muted mt-1">Real-time hallway monitoring and compliance tracking</p>
        </div>

        {loading ? <div className="text-center py-20 text-bear-muted">Loading…</div> : (<>

        {/* Live stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Out Now', value: allOut.length, color: 'text-bear-orange' },
            { label: 'Overdue (25+ min)', value: overdueNow.length, color: overdueNow.length > 0 ? 'text-red-600' : 'text-green-600' },
            { label: 'Rooms with Students Out', value: new Set(allOut.map((p: any) => p.room)).size, color: 'text-blue-600' },
            { label: 'Bathroom/Water', value: allOut.filter((p: any) => ['Bathroom','Water Fountain'].includes(p.destination)).length, color: 'text-purple-600' },
          ].map(s => (
            <div key={s.label} className="card text-center py-4">
              <div className={`text-4xl font-display font-black ${s.color}`}>{s.value}</div>
              <div className="text-xs font-semibold text-bear-muted uppercase tracking-widest mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Overdue alert */}
        {overdueNow.length > 0 && (
          <div className="card border-red-200 bg-red-50">
            <h2 className="text-lg font-bold text-red-800 mb-3">🚨 Overdue — Action Required</h2>
            <div className="space-y-2">
              {overdueNow.map(r => (
                <div key={r.id} className="flex items-center gap-3 bg-white border border-red-200 rounded-xl px-4 py-3">
                  <div className="flex-1">
                    <span className="font-bold text-red-900">{r.student}</span>
                    <span className="text-red-700 text-sm ml-2">Grade {r.grade} · {r.room_number} · {r.destination}</span>
                  </div>
                  <span className="font-mono text-lg font-black text-red-700">{r.minutes_out}m</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All currently out grouped by room */}
        {allOut.length > 0 && (
          <div className="card">
            <h2 className="text-lg font-bold text-bear-dark mb-4">📍 Currently Out by Room</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(
                allOut.reduce((acc: any, p: any) => {
                  if (!acc[p.room]) acc[p.room] = []
                  acc[p.room].push(p)
                  return acc
                }, {})
              ).sort().map(([room, passes]: [string, any]) => (
                <div key={room} className="bg-orange-50 border border-orange-100 rounded-xl p-3">
                  <div className="font-bold text-bear-dark text-sm mb-2">{room} <span className="text-bear-orange font-normal">({passes.length})</span></div>
                  {passes.map((p: any) => {
                    const min = Math.round((Date.now() - new Date(p.out_time).getTime()) / 60000)
                    return (
                      <div key={p.id} className="flex justify-between text-xs py-1 border-b border-orange-100 last:border-0">
                        <span className="text-bear-dark">{p.student}</span>
                        <span className={`font-mono font-bold ${min >= 25 ? 'text-red-600' : min >= 15 ? 'text-amber-600' : 'text-green-600'}`}>{min}m</span>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Peak hours heat map */}
        <div className="card">
          <h2 className="text-lg font-bold text-bear-dark mb-4">⏰ Hourly Traffic Pattern</h2>
          <div className="flex items-end gap-1 h-24">
            {Array.from({ length: 24 }, (_, h) => {
              const data = hourly.find((d: any) => d.hour === h)
              const height = data ? Math.round((data.total_passes / maxHourly) * 100) : 0
              const isSchool = h >= 8 && h <= 15
              return (
                <div key={h} className="flex-1 flex flex-col items-center gap-1" title={`${h}:00 — ${data?.total_passes ?? 0} passes`}>
                  <div className="w-full rounded-t transition-all"
                    style={{ height: `${height}%`, minHeight: height > 0 ? '4px' : '0', backgroundColor: isSchool ? '#E8640A' : '#e2d9d0' }} />
                  {h % 3 === 0 && <span className="text-xs text-bear-muted font-mono">{h}</span>}
                </div>
              )
            })}
          </div>
          <p className="text-xs text-bear-muted mt-2">Orange bars = school hours (8am–3pm)</p>
        </div>

        {/* Destination breakdown */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="card">
            <h2 className="text-lg font-bold text-bear-dark mb-4">📍 Pass Destinations</h2>
            <div className="space-y-3">
              {destinations.map((d: any) => {
                const maxD = Math.max(...destinations.map((x: any) => x.approved), 1)
                return (
                  <div key={d.destination}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-bear-dark">{d.destination}</span>
                      <span className="text-bear-muted text-xs">{d.approved} · {d.avg_minutes ?? '—'}m avg</span>
                    </div>
                    <div className="h-2 bg-orange-100 rounded-full overflow-hidden">
                      <div className="h-2 bg-bear-orange rounded-full" style={{ width: `${(d.approved / maxD) * 100}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Frequent flyers */}
          <div className="card">
            <h2 className="text-lg font-bold text-bear-dark mb-4">🔁 Frequent Flyers</h2>
            <div className="space-y-2">
              {flyers.map((f: any) => (
                <div key={f.student_id} className="flex items-center gap-3 text-sm">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-bear-dark truncate">{f.first_name} {f.last_name}</span>
                    <span className="text-bear-muted text-xs ml-2">Gr {f.grade} · {f.room_number ?? '—'}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-bold text-bear-orange">{f.total_passes}</span>
                    <span className="text-bear-muted text-xs ml-1">passes</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        </>)}
      </main>
    </div>
  )
}
