'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import Nav from '@/components/Nav'
import type { Pass, Student, Destination, Room, UserProfile } from '@/lib/types'
import { format } from 'date-fns'

type PassRow = Pass & { student: Student; destination: Destination }

export default function TeacherLogPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [passes, setPasses] = useState<PassRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('')

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/'; return }
      const { data: prof } = await supabase.from('user_profiles').select('*, room:rooms(*)').eq('id', user.id).maybeSingle()
      if (!prof) return
      setProfile(prof as any)
      setRoom(prof.room as Room)

      const { data } = await supabase
        .from('passes')
        .select('*, student:students(*), destination:destinations(*)')
        .eq('room_id', (prof.room as Room).id)
        .order('out_time', { ascending: false })
        .limit(200)
      setPasses((data ?? []) as any)
      setLoading(false)
    }
    init()
  }, [])

  const filtered = passes.filter(p => {
    const name = `${p.student?.first_name} ${p.student?.last_name}`.toLowerCase()
    const matchSearch = !search || name.includes(search.toLowerCase())
    const matchDate = !dateFilter || p.out_time.startsWith(dateFilter)
    return matchSearch && matchDate
  })

  function statusBadge(status: string) {
    const map: Record<string, string> = {
      OUT: 'badge-out', IN: 'badge-in', DENIED: 'badge-denied', AUTO_CLOSED: 'badge-closed'
    }
    return map[status] ?? 'badge-closed'
  }

  if (loading) return <div className="min-h-screen bg-bear-cream flex items-center justify-center"><div className="text-bear-muted">Loading…</div></div>

  return (
    <div className="min-h-screen bg-bear-cream">
      <Nav role={profile?.role ?? 'teacher'} displayName={profile?.display_name ?? profile?.email} roomNumber={room?.room_number} />
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-5">
        <div>
          <h1 className="text-3xl font-display font-black text-bear-dark">Pass Log</h1>
          <p className="text-bear-muted mt-1">{room?.room_number} · {filtered.length} records</p>
        </div>

        {/* Filters */}
        <div className="card flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Search student…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-orange-200 rounded-xl px-4 py-2 text-sm flex-1 min-w-36 focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white"
          />
          <input
            type="date"
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            className="border border-orange-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white"
          />
          {(search || dateFilter) && (
            <button onClick={() => { setSearch(''); setDateFilter('') }} className="text-sm text-bear-muted hover:text-bear-dark transition-colors">Clear</button>
          )}
        </div>

        {/* Table */}
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-orange-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-bear-muted uppercase tracking-wider">Student</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-bear-muted uppercase tracking-wider">Destination</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-bear-muted uppercase tracking-wider">Out</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-bear-muted uppercase tracking-wider">In</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-bear-muted uppercase tracking-wider">Min</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-bear-muted uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} className="border-b border-orange-50 hover:bg-orange-50/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-bear-dark">
                    {p.student?.preferred_name || p.student?.first_name} {p.student?.last_name}
                    {p.student?.watch_list && <span className="ml-1 text-xs text-amber-600">⚠</span>}
                  </td>
                  <td className="px-4 py-3 text-bear-muted">{p.destination?.name}</td>
                  <td className="px-4 py-3 text-bear-muted font-mono text-xs">
                    {format(new Date(p.out_time), 'M/d h:mm a')}
                  </td>
                  <td className="px-4 py-3 text-bear-muted font-mono text-xs">
                    {p.in_time ? format(new Date(p.in_time), 'h:mm a') : '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm">
                    {p.elapsed_minutes != null ? Math.round(p.elapsed_minutes) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusBadge(p.status)}`}>
                      {p.status}
                    </span>
                    {p.denial_reason && <span className="ml-2 text-xs text-red-600">{p.denial_reason}</span>}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-bear-muted">No records found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
