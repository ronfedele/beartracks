'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import Nav from '@/components/Nav'
import type { Pass, Student, Destination, Room, UserProfile } from '@/lib/types'
import { format } from 'date-fns'

type PassRow = Pass & { student: Student; destination: Destination; room: Room }

export default function MonitorLogPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [passes, setPasses] = useState<PassRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roomFilter, setRoomFilter] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [rooms, setRooms] = useState<Room[]>([])

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/'; return }
      const { data: prof } = await supabase.from('user_profiles').select('*').eq('id', user.id).maybeSingle()
      setProfile(prof as any)

      const [{ data: passData }, { data: roomData }] = await Promise.all([
        supabase.from('passes').select('*, student:students(*), destination:destinations(*), room:rooms(*)').order('out_time', { ascending: false }).limit(500),
        supabase.from('rooms').select('*').order('room_number'),
      ])
      setPasses((passData ?? []) as any)
      setRooms(roomData ?? [])
      setLoading(false)
    }
    init()
  }, [])

  const filtered = passes.filter(p => {
    const name = `${p.student?.first_name} ${p.student?.last_name}`.toLowerCase()
    return (
      (!search || name.includes(search.toLowerCase())) &&
      (!roomFilter || p.room_id === roomFilter) &&
      (!dateFilter || p.out_time.startsWith(dateFilter)) &&
      (!statusFilter || p.status === statusFilter)
    )
  })

  function statusBadge(status: string) {
    const map: Record<string, string> = { OUT: 'badge-out', IN: 'badge-in', DENIED: 'badge-denied', AUTO_CLOSED: 'badge-closed' }
    return map[status] ?? 'badge-closed'
  }

  if (loading) return <div className="min-h-screen bg-bear-cream flex items-center justify-center"><div className="text-bear-muted">Loading…</div></div>

  return (
    <div className="min-h-screen bg-bear-cream">
      <Nav role={profile?.role ?? 'monitor'} displayName={profile?.display_name ?? profile?.email} />
      <main className="max-w-7xl mx-auto px-4 py-8 space-y-5">
        <div>
          <h1 className="text-3xl font-display font-black text-bear-dark">Sign-Out Log</h1>
          <p className="text-bear-muted mt-1">{filtered.length} of {passes.length} records</p>
        </div>

        {/* Filters */}
        <div className="card flex flex-wrap gap-3">
          <input type="text" placeholder="Search student…" value={search} onChange={e => setSearch(e.target.value)}
            className="border border-orange-200 rounded-xl px-4 py-2 text-sm flex-1 min-w-36 focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white" />
          <select value={roomFilter} onChange={e => setRoomFilter(e.target.value)}
            className="border border-orange-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white">
            <option value="">All Rooms</option>
            {rooms.map(r => <option key={r.id} value={r.id}>{r.room_number} · {r.teacher_name}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="border border-orange-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white">
            <option value="">All Statuses</option>
            <option value="OUT">Out</option>
            <option value="IN">In</option>
            <option value="DENIED">Denied</option>
            <option value="AUTO_CLOSED">Auto Closed</option>
          </select>
          <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
            className="border border-orange-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white" />
          {(search || roomFilter || dateFilter || statusFilter) && (
            <button onClick={() => { setSearch(''); setRoomFilter(''); setDateFilter(''); setStatusFilter('') }}
              className="text-sm text-bear-muted hover:text-bear-dark">Clear</button>
          )}
        </div>

        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-orange-100">
                {['Student', 'Room', 'Destination', 'Out Time', 'In Time', 'Minutes', 'Status', 'Reason'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-bear-muted uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} className="border-b border-orange-50 hover:bg-orange-50/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-bear-dark whitespace-nowrap">
                    {p.student?.preferred_name || p.student?.first_name} {p.student?.last_name}
                    {p.student?.watch_list && <span className="ml-1 text-xs text-amber-600">⚠</span>}
                  </td>
                  <td className="px-4 py-3 text-bear-muted whitespace-nowrap">{p.room?.room_number}</td>
                  <td className="px-4 py-3 text-bear-muted">{p.destination?.name}</td>
                  <td className="px-4 py-3 text-bear-muted font-mono text-xs whitespace-nowrap">{format(new Date(p.out_time), 'M/d/yy h:mm a')}</td>
                  <td className="px-4 py-3 text-bear-muted font-mono text-xs whitespace-nowrap">{p.in_time ? format(new Date(p.in_time), 'h:mm a') : '—'}</td>
                  <td className="px-4 py-3 font-mono">{p.elapsed_minutes != null ? Math.round(p.elapsed_minutes) : '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusBadge(p.status)}`}>{p.status}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-red-600 max-w-xs truncate">{p.denial_reason ?? ''}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-bear-muted">No records found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
