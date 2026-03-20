'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import Nav from '@/components/Nav'
import type { UserProfile, Room } from '@/lib/types'
import { format, subDays, startOfWeek, startOfMonth } from 'date-fns'

export default function TeacherReportsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [dateRange, setDateRange] = useState('30d')
  const [loading, setLoading] = useState(true)

  // Data
  const [summary, setSummary] = useState({ total: 0, approved: 0, denied: 0, avgMin: 0, totalMinLost: 0, longPasses: 0 })
  const [studentBreakdown, setStudentBreakdown] = useState<any[]>([])
  const [hourlyBreakdown, setHourlyBreakdown] = useState<any[]>([])
  const [destBreakdown, setDestBreakdown] = useState<any[]>([])
  const [passLog, setPassLog] = useState<any[]>([])

  function getStart() {
    const now = new Date()
    if (dateRange === '7d') return format(subDays(now, 7), 'yyyy-MM-dd')
    if (dateRange === '30d') return format(subDays(now, 30), 'yyyy-MM-dd')
    if (dateRange === 'week') return format(startOfWeek(now), 'yyyy-MM-dd')
    if (dateRange === 'month') return format(startOfMonth(now), 'yyyy-MM-dd')
    return format(subDays(now, 30), 'yyyy-MM-dd')
  }

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/'; return }
      const { data: prof } = await supabase.from('user_profiles').select('*, room:rooms(*)').eq('id', user.id).maybeSingle()
      if (!prof) return
      setProfile(prof as any)
      setRoom(prof.room as Room)
    }
    init()
  }, [])

  useEffect(() => {
    if (room) loadData()
  }, [room, dateRange])

  async function loadData() {
    if (!room) return
    setLoading(true)
    const supabase = createClient()
    const start = getStart()
    const end = format(new Date(), 'yyyy-MM-dd')

    const { data: passes } = await supabase
      .from('passes')
      .select('*, student:students(first_name,last_name,grade,preferred_name), destination:destinations(name)')
      .eq('room_id', room.id)
      .gte('out_time', start)
      .lte('out_time', end + 'T23:59:59')
      .order('out_time', { ascending: false })

    const allPasses = passes ?? []
    const approved = allPasses.filter(p => p.status !== 'DENIED')
    const denied = allPasses.filter(p => p.status === 'DENIED')
    const withTime = approved.filter(p => p.elapsed_minutes)
    const avgMin = withTime.length > 0
      ? withTime.reduce((a, p) => a + p.elapsed_minutes, 0) / withTime.length : 0
    const totalMin = withTime.reduce((a, p) => a + p.elapsed_minutes, 0)
    const long = withTime.filter(p => p.elapsed_minutes > 25).length

    setSummary({
      total: allPasses.length, approved: approved.length, denied: denied.length,
      avgMin: Math.round(avgMin), totalMinLost: Math.round(totalMin), longPasses: long,
    })
    setPassLog(allPasses.slice(0, 50))

    // Per-student breakdown
    const studentMap: Record<string, any> = {}
    approved.forEach(p => {
      const s = p.student as any
      if (!s) return
      const key = p.student_id
      if (!studentMap[key]) {
        studentMap[key] = {
          name: `${s.preferred_name || s.first_name} ${s.last_name}`,
          grade: s.grade, passes: 0, bw: 0, totalMin: 0, longPasses: 0,
        }
      }
      studentMap[key].passes++
      const destName = (p.destination as any)?.name?.toLowerCase() ?? ''
      if (['bathroom','water fountain'].includes(destName)) studentMap[key].bw++
      if (p.elapsed_minutes) { studentMap[key].totalMin += p.elapsed_minutes }
      if (p.elapsed_minutes > 25) studentMap[key].longPasses++
    })
    setStudentBreakdown(
      Object.values(studentMap).sort((a: any, b: any) => b.passes - a.passes)
    )

    // Hourly breakdown
    const hourMap: Record<number, number> = {}
    approved.forEach(p => {
      const h = new Date(p.out_time).getHours()
      hourMap[h] = (hourMap[h] ?? 0) + 1
    })
    setHourlyBreakdown(Object.entries(hourMap).map(([h, c]) => ({ hour: parseInt(h), count: c })).sort((a, b) => a.hour - b.hour))

    // Destination breakdown
    const destMap: Record<string, number> = {}
    approved.forEach(p => {
      const name = (p.destination as any)?.name ?? 'Unknown'
      destMap[name] = (destMap[name] ?? 0) + 1
    })
    setDestBreakdown(Object.entries(destMap).map(([dest, count]) => ({ dest, count })).sort((a, b) => b.count - a.count))

    setLoading(false)
  }

  const maxStudentPasses = Math.max(...studentBreakdown.map(s => s.passes), 1)

  if (!profile || !room) return <div className="min-h-screen bg-bear-cream flex items-center justify-center"><div className="text-bear-muted">Loading…</div></div>

  return (
    <div className="min-h-screen bg-bear-cream">
      <Nav role={profile.role as any} displayName={profile.display_name ?? profile.email} roomNumber={room.room_number} />
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-display font-black text-bear-dark">My Class Reports</h1>
            <p className="text-bear-muted mt-1">{room.room_number} · {room.teacher_name}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {[['7d','Last 7 Days'],['week','This Week'],['30d','Last 30 Days'],['month','This Month']].map(([r, label]) => (
              <button key={r} onClick={() => setDateRange(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${dateRange === r ? 'bg-bear-orange text-white' : 'bg-white border border-orange-200 text-bear-muted hover:text-bear-dark'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? <div className="text-center py-20 text-bear-muted">Loading…</div> : (<>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Total Passes', value: summary.total, color: 'text-bear-orange' },
            { label: 'Approved', value: summary.approved, color: 'text-green-600' },
            { label: 'Denied', value: summary.denied, color: 'text-red-600' },
            { label: 'Avg Min Out', value: summary.avgMin, color: 'text-bear-muted' },
            { label: 'Total Min Lost', value: summary.totalMinLost, color: 'text-purple-600' },
            { label: '25+ Min Passes', value: summary.longPasses, color: summary.longPasses > 0 ? 'text-red-600' : 'text-green-600' },
          ].map(s => (
            <div key={s.label} className="card text-center py-4">
              <div className={`text-3xl font-display font-black ${s.color}`}>{s.value}</div>
              <div className="text-xs font-semibold text-bear-muted uppercase tracking-widest mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Student breakdown + hourly */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Per-student */}
          <div className="card overflow-x-auto p-0">
            <div className="px-5 py-4 border-b border-orange-100">
              <h2 className="text-lg font-bold text-bear-dark">👤 By Student</h2>
              <p className="text-xs text-bear-muted">Frequent flyers & extended time</p>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-orange-100">
                {['Student','Passes','B/W','Avg Min','Long','Volume'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-bear-muted uppercase tracking-wider">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {studentBreakdown.slice(0, 20).map((s, i) => (
                  <tr key={i} className="border-b border-orange-50 hover:bg-orange-50/40">
                    <td className="px-3 py-2 font-medium text-bear-dark">{s.name}</td>
                    <td className="px-3 py-2 font-bold text-bear-orange">{s.passes}</td>
                    <td className="px-3 py-2 text-blue-600">{s.bw}</td>
                    <td className="px-3 py-2 font-mono text-xs">{s.passes > 0 ? Math.round(s.totalMin / s.passes) : '—'}</td>
                    <td className="px-3 py-2 text-red-600">{s.longPasses || '—'}</td>
                    <td className="px-3 py-2 w-20">
                      <div className="h-2 bg-orange-100 rounded-full overflow-hidden">
                        <div className="h-2 bg-bear-orange rounded-full" style={{ width: `${(s.passes / maxStudentPasses) * 100}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Time of day + destination */}
          <div className="space-y-4">
            <div className="card">
              <h2 className="text-lg font-bold text-bear-dark mb-3">⏰ When Students Leave</h2>
              <div className="flex items-end gap-1 h-20">
                {Array.from({ length: 16 }, (_, i) => i + 7).map(h => {
                  const d = hourlyBreakdown.find(x => x.hour === h)
                  const maxH = Math.max(...hourlyBreakdown.map(x => x.count), 1)
                  const pct = d ? (d.count / maxH) * 100 : 0
                  return (
                    <div key={h} className="flex-1 flex flex-col items-center gap-0.5" title={`${h}:00 — ${d?.count ?? 0}`}>
                      <div className="w-full bg-bear-orange rounded-t" style={{ height: `${pct}%`, minHeight: pct > 0 ? '3px' : '0' }} />
                      {h % 2 === 0 && <span className="text-xs text-bear-muted" style={{ fontSize: '9px' }}>{h}</span>}
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="card">
              <h2 className="text-lg font-bold text-bear-dark mb-3">📍 Destinations</h2>
              <div className="space-y-2">
                {destBreakdown.map(d => {
                  const maxD = Math.max(...destBreakdown.map(x => x.count), 1)
                  return (
                    <div key={d.dest} className="flex items-center gap-2 text-sm">
                      <span className="w-36 text-bear-muted text-xs truncate shrink-0">{d.dest}</span>
                      <div className="flex-1 h-2 bg-orange-100 rounded-full overflow-hidden">
                        <div className="h-2 bg-bear-orange rounded-full" style={{ width: `${(d.count / maxD) * 100}%` }} />
                      </div>
                      <span className="font-bold text-bear-dark text-xs w-5 text-right">{d.count}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Recent pass log */}
        <div className="card overflow-x-auto p-0">
          <div className="px-5 py-4 border-b border-orange-100">
            <h2 className="text-lg font-bold text-bear-dark">📋 Recent Passes</h2>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-orange-100">
              {['Student','Destination','Out','In','Min','Status'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-bear-muted uppercase tracking-wider">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {passLog.map(p => {
                const s = p.student as any
                const name = s ? `${s.preferred_name || s.first_name} ${s.last_name}` : '—'
                const statusMap: Record<string, string> = { OUT: 'badge-out', IN: 'badge-in', DENIED: 'badge-denied', AUTO_CLOSED: 'badge-closed' }
                return (
                  <tr key={p.id} className="border-b border-orange-50 hover:bg-orange-50/40">
                    <td className="px-4 py-2.5 font-medium text-bear-dark">{name}</td>
                    <td className="px-4 py-2.5 text-bear-muted">{(p.destination as any)?.name}</td>
                    <td className="px-4 py-2.5 text-bear-muted font-mono text-xs">{format(new Date(p.out_time), 'M/d h:mm a')}</td>
                    <td className="px-4 py-2.5 text-bear-muted font-mono text-xs">{p.in_time ? format(new Date(p.in_time), 'h:mm a') : '—'}</td>
                    <td className="px-4 py-2.5 font-mono">{p.elapsed_minutes != null ? Math.round(p.elapsed_minutes) : '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${statusMap[p.status] ?? 'badge-closed'}`}>{p.status}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        </>)}
      </main>
    </div>
  )
}
