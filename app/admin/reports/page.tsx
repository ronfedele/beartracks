'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import Nav from '@/components/Nav'
import type { UserProfile } from '@/lib/types'
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns'

type DateRange = '7d' | '30d' | 'week' | 'month' | 'custom'

function StatCard({ label, value, sub, color = 'text-bear-orange' }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="card text-center py-4">
      <div className={`text-3xl font-display font-black ${color}`}>{value}</div>
      <div className="text-xs font-semibold text-bear-muted uppercase tracking-widest mt-0.5">{label}</div>
      {sub && <div className="text-xs text-bear-muted mt-0.5">{sub}</div>}
    </div>
  )
}

function Bar({ pct, color = 'bg-bear-orange' }: { pct: number; color?: string }) {
  return (
    <div className="flex-1 bg-orange-100 rounded-full h-2.5 overflow-hidden">
      <div className={`h-2.5 rounded-full transition-all ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  )
}

export default function AdminReportsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [dateRange, setDateRange] = useState<DateRange>('30d')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [loading, setLoading] = useState(true)

  // Data
  const [summary, setSummary] = useState({ total: 0, approved: 0, denied: 0, avgMin: 0, uniqueStudents: 0, overdue: 0 })
  const [hourlyData, setHourlyData] = useState<any[]>([])
  const [dailyData, setDailyData] = useState<any[]>([])
  const [destinations, setDestinations] = useState<any[]>([])
  const [rooms, setRooms] = useState<any[]>([])
  const [frequentFlyers, setFrequentFlyers] = useState<any[]>([])
  const [instructional, setInstructional] = useState<any[]>([])
  const [overdueNow, setOverdueNow] = useState<any[]>([])

  function getDateBounds() {
    const now = new Date()
    if (dateRange === '7d') return { start: format(subDays(now, 7), 'yyyy-MM-dd'), end: format(now, 'yyyy-MM-dd') }
    if (dateRange === '30d') return { start: format(subDays(now, 30), 'yyyy-MM-dd'), end: format(now, 'yyyy-MM-dd') }
    if (dateRange === 'week') return { start: format(startOfWeek(now), 'yyyy-MM-dd'), end: format(endOfWeek(now), 'yyyy-MM-dd') }
    if (dateRange === 'month') return { start: format(startOfMonth(now), 'yyyy-MM-dd'), end: format(endOfMonth(now), 'yyyy-MM-dd') }
    return { start: customStart, end: customEnd }
  }

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/'; return }
      const { data: prof } = await supabase.from('user_profiles').select('*').eq('id', user.id).maybeSingle()
      if (!['admin', 'monitor'].includes(prof?.role)) { window.location.href = '/'; return }
      setProfile(prof as any)
    }
    init()
  }, [])

  useEffect(() => {
    if (!profile) return
    if (dateRange === 'custom' && (!customStart || !customEnd)) return
    loadData()
  }, [profile, dateRange, customStart, customEnd])

  async function loadData() {
    setLoading(true)
    const supabase = createClient()
    const { start, end } = getDateBounds()

    const [
      { data: passData },
      { data: hourData },
      { data: destData },
      { data: roomData },
      { data: flyerData },
      { data: instrData },
      { data: overdueData },
    ] = await Promise.all([
      supabase.from('passes').select('id, status, elapsed_minutes, student_id').gte('out_time', start).lte('out_time', end + 'T23:59:59'),
      supabase.from('report_hourly_volume').select('*'),
      supabase.from('report_destinations').select('*'),
      supabase.from('report_room_summary').select('*'),
      supabase.from('report_frequent_flyers').select('*').limit(20),
      supabase.from('report_instructional_time').select('*'),
      supabase.from('report_overdue').select('*'),
    ])

    const passes = passData ?? []
    const approved = passes.filter(p => p.status !== 'DENIED').length
    const denied = passes.filter(p => p.status === 'DENIED').length
    const avgMin = passes.filter(p => p.elapsed_minutes).reduce((a, p) => a + p.elapsed_minutes, 0) / (passes.filter(p => p.elapsed_minutes).length || 1)
    const unique = new Set(passes.map(p => p.student_id)).size

    setSummary({ total: passes.length, approved, denied, avgMin: Math.round(avgMin), uniqueStudents: unique, overdue: overdueData?.length ?? 0 })
    setHourlyData(hourData ?? [])
    setDestinations(destData ?? [])
    setRooms(roomData ?? [])
    setFrequentFlyers(flyerData ?? [])
    setInstructional(instrData ?? [])
    setOverdueNow(overdueData ?? [])
    setLoading(false)
  }

  const maxHourly = Math.max(...hourlyData.map(h => h.total_passes), 1)
  const maxDest = Math.max(...destinations.map(d => d.total_passes), 1)
  const maxRoom = Math.max(...rooms.map(r => r.total_passes), 1)

  if (!profile) return <div className="min-h-screen bg-bear-cream flex items-center justify-center"><div className="text-bear-muted">Loading…</div></div>

  return (
    <div className="min-h-screen bg-bear-cream">
      <Nav role={profile.role as any} displayName={profile.display_name ?? profile.email} />
      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">

        {/* Header + date range */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-display font-black text-bear-dark">Reports & Analytics</h1>
            <p className="text-bear-muted mt-1">Campus-wide pass data and trends</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {(['7d','30d','week','month','custom'] as DateRange[]).map(r => (
              <button key={r} onClick={() => setDateRange(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${dateRange === r ? 'bg-bear-orange text-white' : 'bg-white border border-orange-200 text-bear-muted hover:text-bear-dark'}`}>
                {r === '7d' ? 'Last 7 Days' : r === '30d' ? 'Last 30 Days' : r === 'week' ? 'This Week' : r === 'month' ? 'This Month' : 'Custom'}
              </button>
            ))}
            {dateRange === 'custom' && (
              <div className="flex gap-2">
                <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                  className="border border-orange-200 rounded-lg px-2 py-1 text-xs bg-white" />
                <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                  className="border border-orange-200 rounded-lg px-2 py-1 text-xs bg-white" />
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-bear-muted">Loading report data…</div>
        ) : (<>

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Total Passes" value={summary.total} />
          <StatCard label="Approved" value={summary.approved} color="text-green-600" />
          <StatCard label="Denied" value={summary.denied} color="text-red-600" />
          <StatCard label="Avg Minutes" value={summary.avgMin} color="text-bear-muted" />
          <StatCard label="Students" value={summary.uniqueStudents} color="text-blue-600" />
          <StatCard label="Overdue Now" value={summary.overdue} color={summary.overdue > 0 ? 'text-red-600' : 'text-green-600'} sub=">25 min" />
        </div>

        {/* Currently overdue */}
        {overdueNow.length > 0 && (
          <div className="card border-red-200 bg-red-50">
            <h2 className="text-lg font-bold text-red-800 mb-3">🚨 Currently Overdue ({overdueNow.length})</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-red-200">
                  {['Student','Grade','Room','Destination','Minutes Out'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-red-700 uppercase tracking-wider">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {overdueNow.map(r => (
                    <tr key={r.id} className="border-b border-red-100">
                      <td className="px-3 py-2 font-medium text-red-900">{r.student}</td>
                      <td className="px-3 py-2 text-red-700">{r.grade}</td>
                      <td className="px-3 py-2 text-red-700">{r.room_number}</td>
                      <td className="px-3 py-2 text-red-700">{r.destination}</td>
                      <td className="px-3 py-2 font-bold text-red-700">{r.minutes_out}m</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Peak hours + destinations side by side */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Peak hours */}
          <div className="card">
            <h2 className="text-lg font-bold text-bear-dark mb-4">⏰ Peak Hours</h2>
            <div className="space-y-2">
              {hourlyData.filter(h => h.total_passes > 0).map(h => {
                const label = `${h.hour % 12 || 12}${h.hour < 12 ? 'am' : 'pm'}`
                return (
                  <div key={h.hour} className="flex items-center gap-3 text-sm">
                    <span className="w-12 text-bear-muted font-mono text-xs shrink-0">{label}</span>
                    <Bar pct={(h.approved_passes / maxHourly) * 100} color="bg-bear-orange" />
                    <span className="w-8 text-right font-semibold text-bear-dark text-xs">{h.approved_passes}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Destinations */}
          <div className="card">
            <h2 className="text-lg font-bold text-bear-dark mb-4">📍 By Destination</h2>
            <div className="space-y-3">
              {destinations.map(d => (
                <div key={d.destination}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-bear-dark">{d.destination}</span>
                    <span className="text-bear-muted text-xs">{d.approved} passes · {d.avg_minutes ?? '—'}m avg</span>
                  </div>
                  <Bar pct={(d.approved / maxDest) * 100} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Room summary */}
        <div className="card overflow-x-auto p-0">
          <div className="px-5 py-4 border-b border-orange-100">
            <h2 className="text-lg font-bold text-bear-dark">🚪 By Classroom</h2>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-orange-100">
              {['Room','Teacher','Total','Approved','Denied','Students','Avg Min','Long (25+)','Volume'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-bear-muted uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {rooms.map(r => (
                <tr key={r.room_number} className="border-b border-orange-50 hover:bg-orange-50/40">
                  <td className="px-4 py-2.5 font-bold text-bear-dark">{r.room_number}</td>
                  <td className="px-4 py-2.5 text-bear-muted">{r.teacher_name}</td>
                  <td className="px-4 py-2.5 font-semibold">{r.total_passes}</td>
                  <td className="px-4 py-2.5 text-green-700">{r.approved}</td>
                  <td className="px-4 py-2.5 text-red-600">{r.denied}</td>
                  <td className="px-4 py-2.5">{r.unique_students}</td>
                  <td className="px-4 py-2.5 font-mono">{r.avg_minutes ?? '—'}</td>
                  <td className="px-4 py-2.5 text-red-600">{r.long_passes}</td>
                  <td className="px-4 py-2.5 w-32">
                    <Bar pct={(r.total_passes / maxRoom) * 100} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Frequent flyers + instructional time */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Frequent flyers */}
          <div className="card overflow-x-auto p-0">
            <div className="px-5 py-4 border-b border-orange-100">
              <h2 className="text-lg font-bold text-bear-dark">🔁 Frequent Flyers</h2>
              <p className="text-xs text-bear-muted mt-0.5">Students with most passes</p>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-orange-100">
                {['Student','Gr','Room','Total','B/W','Avg','Long'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-bear-muted uppercase tracking-wider">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {frequentFlyers.slice(0, 15).map(f => (
                  <tr key={f.student_id} className="border-b border-orange-50 hover:bg-orange-50/40">
                    <td className="px-3 py-2 font-medium text-bear-dark">{f.first_name} {f.last_name}</td>
                    <td className="px-3 py-2 text-bear-muted">{f.grade}</td>
                    <td className="px-3 py-2 text-bear-muted">{f.room_number ?? '—'}</td>
                    <td className="px-3 py-2 font-bold text-bear-orange">{f.total_passes}</td>
                    <td className="px-3 py-2 text-blue-600">{f.bw_passes}</td>
                    <td className="px-3 py-2 font-mono text-xs">{f.avg_minutes ?? '—'}</td>
                    <td className="px-3 py-2 text-red-600">{f.long_passes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Instructional time */}
          <div className="card overflow-x-auto p-0">
            <div className="px-5 py-4 border-b border-orange-100">
              <h2 className="text-lg font-bold text-bear-dark">📚 Instructional Time Lost</h2>
              <p className="text-xs text-bear-muted mt-0.5">Total minutes students were out</p>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-orange-100">
                {['Room','Teacher','Passes','Total Min','Avg Min','Extended'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-bear-muted uppercase tracking-wider">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {instructional.slice(0, 15).map(r => (
                  <tr key={r.room_number} className="border-b border-orange-50 hover:bg-orange-50/40">
                    <td className="px-3 py-2 font-bold text-bear-dark">{r.room_number}</td>
                    <td className="px-3 py-2 text-bear-muted text-xs">{r.teacher_name}</td>
                    <td className="px-3 py-2">{r.pass_count}</td>
                    <td className="px-3 py-2 font-bold text-bear-orange">{r.total_minutes_lost}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.avg_minutes_per_pass}</td>
                    <td className="px-3 py-2 text-red-600">{r.extended_passes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        </>)}
      </main>
    </div>
  )
}
