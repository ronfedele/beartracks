'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { requestPass, signStudentIn, getTodayDayType } from '@/lib/passes'
import Nav from '@/components/Nav'
import type { Student, Destination, Pass, Room, UserProfile } from '@/lib/types'

function getCurrentPeriod(schedTimes: number[]): number | null {
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  for (let i = 0; i < schedTimes.length - 1; i++) {
    if (nowMin >= schedTimes[i] && nowMin < schedTimes[i + 1]) return i + 1
  }
  return null
}

function timeToMin(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export default function TeacherPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [allStudents, setAllStudents] = useState<Student[]>([])       // all assigned to this room
  const [currentStudents, setCurrentStudents] = useState<Student[]>([]) // scheduled this period
  const [currentPeriod, setCurrentPeriod] = useState<number | null>(null)
  const [destinations, setDestinations] = useState<Destination[]>([])
  const [activePasses, setActivePasses] = useState<(Pass & { student: Student; destination: Destination })[]>([])
  const [loading, setLoading] = useState(true)

  // Sign-out form
  const [soStudent, setSoStudent] = useState('')
  const [soStudentId, setSoStudentId] = useState('')
  const [soDestId, setSoDestId] = useState('')
  const [soMatches, setSoMatches] = useState<Student[]>([])
  const [soResult, setSoResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [soLoading, setSoLoading] = useState(false)

  const loadCurrentPeriodStudents = useCallback(async (roomId: string, supabase: any) => {
    // Get today's schedule for this room
    const dayType = await getTodayDayType()
    const { data: roomData } = await supabase.from('rooms').select('bell_schedule').eq('id', roomId).maybeSingle()
    if (!roomData) return

    let schedTimes: number[] = []

    if (roomData.bell_schedule === 9) {
      // Varied room
      const { data: varConfig } = await supabase.from('varied_schedule_config').select('*').eq('room_id', roomId).maybeSingle()
      const { data: scheds } = await supabase.from('schedules').select('*').eq('profile', dayType).in('grade_group', [7, 8])
      if (varConfig && scheds) {
        const s7 = scheds.find((s: any) => s.grade_group === 7)
        const s8 = scheds.find((s: any) => s.grade_group === 8)
        if (s7 && s8) {
          const keys = ['day_start', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6']
          const groups = [7, varConfig.p1_group, varConfig.p2_group, varConfig.p3_group, varConfig.p4_group, varConfig.p5_group, varConfig.p6_group]
          schedTimes = keys.map((k, i) => timeToMin((groups[i] === 7 ? s7 : s8)[k]))
        }
      }
    } else {
      const { data: sched } = await supabase.from('schedules').select('*').eq('grade_group', roomData.bell_schedule).eq('profile', dayType).maybeSingle()
      if (sched) {
        schedTimes = [sched.day_start, sched.p1, sched.p2, sched.p3, sched.p4, sched.p5, sched.p6].map(timeToMin)
      }
    }

    const period = getCurrentPeriod(schedTimes)
    setCurrentPeriod(period)

    if (period) {
      // Students scheduled for THIS room in THIS period
      const { data: scheduled } = await supabase
        .from('student_schedules')
        .select('student_id')
        .eq('room_id', roomId)
        .eq('period', period)

      const scheduledIds = (scheduled ?? []).map((s: any) => s.student_id)

      if (scheduledIds.length > 0) {
        const { data: studs } = await supabase
          .from('students')
          .select('*')
          .in('id', scheduledIds)
          .eq('active', true)
          .order('last_name')
        setCurrentStudents(studs ?? [])
      } else {
        // Fallback: show students whose homeroom is this room
        const { data: studs } = await supabase
          .from('students')
          .select('*')
          .eq('room_id', roomId)
          .eq('active', true)
          .order('last_name')
        setCurrentStudents(studs ?? [])
      }
    } else {
      setCurrentStudents([])
    }
  }, [])

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/'; return }

      const { data: prof } = await supabase.from('user_profiles').select('*, room:rooms(*)').eq('id', user.id).maybeSingle()
      if (!prof) return
      setProfile(prof as any)
      const r = prof.room as Room
      setRoom(r)

      // All students assigned to this room (for sign-out autocomplete)
      const { data: allStuds } = await supabase.from('students').select('*').eq('room_id', r.id).eq('active', true).order('last_name')
      setAllStudents(allStuds ?? [])

      const { data: dests } = await supabase.from('destinations').select('*').eq('active', true).order('sort_order')
      setDestinations(dests ?? [])
      if (dests?.[0]) setSoDestId(dests[0].id)

      await loadCurrentPeriodStudents(r.id, supabase)
      setLoading(false)
    }
    init()

    // Refresh period every 2 minutes
    const t = setInterval(async () => {
      const supabase = createClient()
      const { data: prof } = await supabase.from('user_profiles').select('room_id').eq('id', (await supabase.auth.getUser()).data.user?.id ?? '').maybeSingle()
      if (prof?.room_id) await loadCurrentPeriodStudents(prof.room_id, supabase)
    }, 120000)
    return () => clearInterval(t)
  }, [loadCurrentPeriodStudents])

  useEffect(() => {
    if (!room) return
    const supabase = createClient()
    async function loadPasses() {
      const { data } = await supabase
        .from('passes')
        .select('*, student:students(*), destination:destinations(*)')
        .eq('room_id', room!.id)
        .eq('status', 'OUT')
        .order('out_time')
      setActivePasses((data ?? []) as any)
    }
    loadPasses()
    const ch = supabase.channel('teacher-passes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'passes', filter: `room_id=eq.${room.id}` }, loadPasses)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [room])

  function handleStudentSearch(q: string) {
    setSoStudent(q)
    setSoStudentId('')
    if (q.length < 2) { setSoMatches([]); return }
    // Search from current period students first, then all room students
    const pool = currentStudents.length > 0 ? currentStudents : allStudents
    setSoMatches(
      pool.filter(s =>
        `${s.first_name} ${s.last_name} ${s.preferred_name ?? ''}`.toLowerCase().includes(q.toLowerCase())
      ).slice(0, 6)
    )
  }

  async function handleSignOut(e: React.FormEvent) {
    e.preventDefault()
    if (!room || !profile || !soStudentId || !soDestId) return
    setSoLoading(true)
    setSoResult(null)
    const result = await requestPass({
      studentId: soStudentId,
      roomId: room.id,
      destinationId: soDestId,
      outBy: profile.email,
      teacherEmail: room.teacher_email,
    })
    setSoResult({ ok: result.approved, msg: result.approved ? 'Student signed out.' : (result as any).reason })
    if (result.approved) { setSoStudent(''); setSoStudentId(''); setSoMatches([]) }
    setSoLoading(false)
  }

  function elapsed(outTime: string) { return Math.round((Date.now() - new Date(outTime).getTime()) / 60000) }
  function elapsedClass(min: number) {
    if (min < 10) return 'elapsed-normal'
    if (min < 15) return 'elapsed-yellow'
    if (min < 25) return 'elapsed-orange'
    return 'elapsed-red'
  }

  if (loading) return <div className="min-h-screen bg-bear-cream flex items-center justify-center"><div className="text-bear-muted">Loading…</div></div>

  const displayStudents = currentStudents.length > 0 ? currentStudents : allStudents

  return (
    <div className="min-h-screen bg-bear-cream">
      <Nav role={profile?.role ?? 'teacher'} displayName={profile?.display_name ?? profile?.email} roomNumber={room?.room_number} />
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-display font-black text-bear-dark">
            {room?.room_number} · {room?.teacher_name}
          </h1>
          <p className="text-bear-muted mt-1">
            {currentPeriod
              ? <>Period <strong>{currentPeriod}</strong> · {displayStudents.length} students · {activePasses.length} out</>
              : <>No active period · {allStudents.length} total students</>
            }
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Sign-Out Form */}
          <div className="card">
            <h2 className="text-lg font-bold text-bear-dark mb-4">Sign a Student Out</h2>
            <form onSubmit={handleSignOut} className="space-y-4">
              <div className="relative">
                <label className="block text-xs font-semibold text-bear-muted mb-1 uppercase tracking-widest">Student Name</label>
                <input
                  type="text"
                  value={soStudent}
                  onChange={e => handleStudentSearch(e.target.value)}
                  className="w-full border border-orange-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white"
                  placeholder={currentPeriod ? `Period ${currentPeriod} students…` : 'Start typing a name…'}
                  autoComplete="off"
                />
                {soMatches.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-orange-100 rounded-xl shadow-lg overflow-hidden">
                    {soMatches.map(s => (
                      <button key={s.id} type="button"
                        onClick={() => { setSoStudent(`${s.first_name} ${s.last_name}`); setSoStudentId(s.id); setSoMatches([]) }}
                        className="w-full text-left px-4 py-2.5 hover:bg-bear-light text-sm font-medium text-bear-dark border-b border-orange-50 last:border-0"
                      >
                        {s.preferred_name || s.first_name} {s.last_name}
                        {s.watch_list && <span className="ml-2 text-xs text-amber-600 font-semibold">⚠ Watch</span>}
                        {s.no_roam && <span className="ml-2 text-xs text-red-600 font-semibold">🚫 No Roam</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-bear-muted mb-1 uppercase tracking-widest">Destination</label>
                <select value={soDestId} onChange={e => setSoDestId(e.target.value)}
                  className="w-full border border-orange-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white">
                  {destinations.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>

              {soResult && (
                <div className={`rounded-xl px-4 py-3 text-sm font-medium ${soResult.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                  {soResult.ok ? '✅' : '🚫'} {soResult.msg}
                </div>
              )}

              <button type="submit" disabled={soLoading || !soStudentId}
                className="w-full bg-bear-orange hover:bg-orange-600 disabled:opacity-50 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors">
                {soLoading ? 'Processing…' : 'Issue Pass'}
              </button>
            </form>
          </div>

          {/* Currently Out */}
          <div className="card">
            <h2 className="text-lg font-bold text-bear-dark mb-4">
              Currently Out
              {activePasses.length > 0 && <span className="ml-2 bg-bear-orange text-white text-xs font-bold px-2 py-0.5 rounded-full">{activePasses.length}</span>}
            </h2>
            {activePasses.length === 0
              ? <div className="text-center text-bear-muted py-10 text-sm">No students currently out 🎉</div>
              : <div className="space-y-2">
                {activePasses.map(pass => {
                  const min = elapsed(pass.out_time)
                  return (
                    <div key={pass.id} className="flex items-center gap-3 p-3 bg-orange-50 border border-orange-100 rounded-xl">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-bear-dark text-sm truncate">
                          {pass.student?.preferred_name || pass.student?.first_name} {pass.student?.last_name}
                        </div>
                        <div className="text-xs text-bear-muted">{pass.destination?.name}</div>
                      </div>
                      <div className={`text-sm font-mono font-bold ${elapsedClass(min)}`}>{min}m</div>
                      <button onClick={() => signStudentIn(pass.id)}
                        className="bg-green-100 hover:bg-green-200 text-green-800 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                        Return
                      </button>
                    </div>
                  )
                })}
              </div>
            }
          </div>
        </div>

        {/* Period roster */}
        <div className="card">
          <h2 className="text-lg font-bold text-bear-dark mb-1">
            {currentPeriod ? `Period ${currentPeriod} Roster` : 'Class Roster'} ({displayStudents.length})
          </h2>
          {currentPeriod && currentStudents.length === 0 && (
            <p className="text-xs text-amber-600 mb-3">⚠ No period schedule found — showing homeroom students. Set schedules in Admin → Schedules.</p>
          )}
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
            {displayStudents.map(s => {
              const isOut = activePasses.some(p => p.student_id === s.id)
              return (
                <div key={s.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${isOut ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50 border border-transparent'}`}>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${isOut ? 'bg-amber-500' : 'bg-gray-300'}`} />
                  <span className="truncate font-medium text-bear-dark">{s.preferred_name || s.first_name} {s.last_name}</span>
                  {s.watch_list && <span className="text-xs text-amber-600 shrink-0">⚠</span>}
                  {s.no_roam && <span className="text-xs text-red-600 shrink-0">🚫</span>}
                </div>
              )
            })}
          </div>
        </div>
      </main>
    </div>
  )
}
