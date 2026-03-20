'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { requestPass, signStudentIn, getTodayDayType, checkRoomPassLimit } from '@/lib/passes'
import Nav from '@/components/Nav'
import type { Student, Destination, Pass, Room, UserProfile } from '@/lib/types'

function timeToMin(t: string) {
  const [h, m] = t.split(':').map(Number); return h * 60 + m
}
function getCurrentPeriod(periods: number[]): number | null {
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
  for (let i = 0; i < periods.length - 1; i++) {
    if (nowMin >= periods[i] && nowMin < periods[i + 1]) return i + 1
  }
  return null
}

interface RoomLimit {
  id: string
  room_id: string
  start_date: string
  end_date: string
  max_passes: number
  note: string | null
  active: boolean
}

export default function TeacherPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [allStudents, setAllStudents] = useState<Student[]>([])
  const [currentStudents, setCurrentStudents] = useState<Student[]>([])
  const [currentPeriod, setCurrentPeriod] = useState<number | null>(null)
  const [destinations, setDestinations] = useState<Destination[]>([])
  const [activePasses, setActivePasses] = useState<(Pass & { student: Student; destination: Destination })[]>([])
  const [roomLimit, setRoomLimit] = useState<RoomLimit | null>(null)
  // Usage counts per student for the active limit window
  const [studentUsage, setStudentUsage] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'signout' | 'limits'>('signout')

  // Sign-out form
  const [soStudent, setSoStudent] = useState('')
  const [soStudentId, setSoStudentId] = useState('')
  const [soDestId, setSoDestId] = useState('')
  const [soMatches, setSoMatches] = useState<Student[]>([])
  const [soResult, setSoResult] = useState<{ ok: boolean; msg: string; needsOverride?: boolean } | null>(null)
  const [soLoading, setSoLoading] = useState(false)
  const [isOverride, setIsOverride] = useState(false)

  // Room limit form
  const [limitForm, setLimitForm] = useState({ start_date: '', end_date: '', max_passes: '3', note: '' })
  const [limitSaving, setLimitSaving] = useState(false)
  const [limitMsg, setLimitMsg] = useState('')

  const loadCurrentPeriodStudents = useCallback(async (roomId: string, supabase: any) => {
    const dayType = await getTodayDayType()
    const { data: roomData } = await supabase.from('rooms').select('bell_schedule').eq('id', roomId).maybeSingle()
    if (!roomData) return
    let periods: number[] = []
    if (roomData.bell_schedule === 9) {
      const { data: vc } = await supabase.from('varied_schedule_config').select('*').eq('room_id', roomId).maybeSingle()
      const { data: scheds } = await supabase.from('schedules').select('*').eq('profile', dayType).in('grade_group', [7, 8])
      if (vc && scheds) {
        const s7 = scheds.find((s: any) => s.grade_group === 7), s8 = scheds.find((s: any) => s.grade_group === 8)
        if (s7 && s8) {
          const keys = ['day_start','p1','p2','p3','p4','p5','p6']
          const groups = [7, vc.p1_group, vc.p2_group, vc.p3_group, vc.p4_group, vc.p5_group, vc.p6_group]
          periods = keys.map((k, i) => timeToMin((groups[i] === 7 ? s7 : s8)[k]))
        }
      }
    } else {
      const { data: sched } = await supabase.from('schedules').select('*').eq('grade_group', roomData.bell_schedule).eq('profile', dayType).maybeSingle()
      if (sched) periods = [sched.day_start, sched.p1, sched.p2, sched.p3, sched.p4, sched.p5, sched.p6].map(timeToMin)
    }
    const period = getCurrentPeriod(periods)
    setCurrentPeriod(period)
    if (period) {
      const { data: scheduled } = await supabase.from('student_schedules').select('student_id').eq('room_id', roomId).eq('period', period)
      const ids = (scheduled ?? []).map((s: any) => s.student_id)
      if (ids.length > 0) {
        const { data: studs } = await supabase.from('students').select('*').in('id', ids).eq('active', true).order('last_name')
        setCurrentStudents(studs ?? [])
        return
      }
    }
    setCurrentStudents([])
  }, [])

  async function loadRoomLimit(roomId: string) {
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]
    const { data } = await supabase
      .from('room_pass_limits')
      .select('*')
      .eq('room_id', roomId)
      .eq('active', true)
      .lte('start_date', today)
      .gte('end_date', today)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setRoomLimit(data ?? null)

    // Load per-student usage counts if there's an active limit
    if (data) {
      const { data: studs } = await supabase.from('students').select('id').eq('room_id', roomId).eq('active', true)
      const counts: Record<string, number> = {}
      await Promise.all((studs ?? []).map(async (s: any) => {
        const { data: c } = await supabase.rpc('count_student_bw_passes', {
          p_student_id: s.id,
          p_room_id: roomId,
          p_start_date: data.start_date,
          p_end_date: data.end_date,
        })
        counts[s.id] = Number(c ?? 0)
      }))
      setStudentUsage(counts)
    } else {
      setStudentUsage({})
    }
  }

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
      const { data: allStuds } = await supabase.from('students').select('*').eq('room_id', r.id).eq('active', true).order('last_name')
      setAllStudents(allStuds ?? [])
      const { data: dests } = await supabase.from('destinations').select('*').eq('active', true).order('sort_order')
      setDestinations(dests ?? [])
      if (dests?.[0]) setSoDestId(dests[0].id)
      await loadCurrentPeriodStudents(r.id, supabase)
      await loadRoomLimit(r.id)
      setLoading(false)
    }
    init()
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
      const { data } = await supabase.from('passes')
        .select('*, student:students(*), destination:destinations(*)')
        .eq('room_id', room!.id).eq('status', 'OUT').order('out_time')
      setActivePasses((data ?? []) as any)
    }
    loadPasses()
    const ch = supabase.channel('teacher-passes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'passes', filter: `room_id=eq.${room.id}` }, loadPasses)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [room])

  function handleStudentSearch(q: string) {
    setSoStudent(q); setSoStudentId(''); setIsOverride(false)
    if (q.length < 2) { setSoMatches([]); return }
    const pool = currentStudents.length > 0 ? currentStudents : allStudents
    setSoMatches(pool.filter(s =>
      `${s.first_name} ${s.last_name} ${s.preferred_name ?? ''}`.toLowerCase().includes(q.toLowerCase())
    ).slice(0, 6))
  }

  async function handleSignOut(e: React.FormEvent) {
    e.preventDefault()
    if (!room || !profile || !soStudentId || !soDestId) return
    setSoLoading(true); setSoResult(null)
    const destName = destinations.find(d => d.id === soDestId)?.name?.toLowerCase() ?? ''
    const isBW = ['bathroom', 'water fountain'].includes(destName)
    const override = isOverride && isBW
    const result = await requestPass({
      studentId: soStudentId,
      roomId: room.id,
      destinationId: soDestId,
      outBy: profile.email,
      teacherEmail: room.teacher_email,
      teacherOverride: override,
    })
    if (!result.approved) {
      const reason = (result as any).reason as string
      setSoResult({ ok: false, msg: reason, needsOverride: reason.includes('Pass limit') && !override })
    } else {
      setSoResult({ ok: true, msg: override ? '✅ Pass issued (teacher override).' : '✅ Student signed out.' })
      setSoStudent(''); setSoStudentId(''); setSoMatches([]); setIsOverride(false)
      // Refresh usage counts after a pass is issued
      if (room) await loadRoomLimit(room.id)
    }
    setSoLoading(false)
  }

  async function handleSaveLimit(e: React.FormEvent) {
    e.preventDefault()
    if (!room || !profile) return
    setLimitSaving(true); setLimitMsg('')
    const supabase = createClient()

    // Deactivate any existing active limit first
    await supabase.from('room_pass_limits')
      .update({ active: false })
      .eq('room_id', room.id)
      .eq('active', true)

    const { error } = await supabase.from('room_pass_limits').insert({
      room_id: room.id,
      set_by: profile.id,
      start_date: limitForm.start_date,
      end_date: limitForm.end_date,
      max_passes: parseInt(limitForm.max_passes),
      note: limitForm.note || null,
      active: true,
    })

    if (error) {
      setLimitMsg(`Error: ${error.message}`)
    } else {
      setLimitMsg('✅ Pass limit set for all students in this room.')
      await loadRoomLimit(room.id)
    }
    setLimitSaving(false)
  }

  async function handleRemoveLimit() {
    if (!room || !roomLimit) return
    const supabase = createClient()
    await supabase.from('room_pass_limits').update({ active: false }).eq('id', roomLimit.id)
    setRoomLimit(null)
    setStudentUsage({})
    setLimitMsg('Limit removed.')
  }

  function elapsed(t: string) { return Math.round((Date.now() - new Date(t).getTime()) / 60000) }
  function elapsedClass(min: number) {
    if (min < 10) return 'elapsed-normal'; if (min < 15) return 'elapsed-yellow'
    if (min < 25) return 'elapsed-orange'; return 'elapsed-red'
  }

  const displayStudents = currentStudents.length > 0 ? currentStudents : allStudents

  if (loading) return <div className="min-h-screen bg-bear-cream flex items-center justify-center"><div className="text-bear-muted">Loading…</div></div>

  return (
    <div className="min-h-screen bg-bear-cream">
      <Nav role={profile?.role ?? 'teacher'} displayName={profile?.display_name ?? profile?.email} roomNumber={room?.room_number} />
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-display font-black text-bear-dark">{room?.room_number} · {room?.teacher_name}</h1>
          <p className="text-bear-muted mt-1">
            {currentPeriod
              ? <>Period <strong>{currentPeriod}</strong> · {displayStudents.length} students · {activePasses.length} out</>
              : <>{allStudents.length} total students</>
            }
            {roomLimit && <span className="ml-2 text-xs bg-purple-100 text-purple-800 font-semibold px-2 py-0.5 rounded-full">🚿 Pass limit active</span>}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-orange-100 p-1 rounded-xl w-fit">
          {([['signout','✍️ Sign Out'],['limits','🚿 Pass Limits']] as const).map(([tab, label]) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${activeTab === tab ? 'bg-white text-bear-dark shadow-sm' : 'text-bear-muted hover:text-bear-dark'}`}>
              {label}
              {tab === 'limits' && roomLimit && <span className="ml-1.5 bg-bear-orange text-white text-xs px-1.5 py-0.5 rounded-full">ON</span>}
            </button>
          ))}
        </div>

        {/* ── SIGN OUT TAB ── */}
        {activeTab === 'signout' && (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="card">
              <h2 className="text-lg font-bold text-bear-dark mb-4">Sign a Student Out</h2>
              <form onSubmit={handleSignOut} className="space-y-4">
                <div className="relative">
                  <label className="block text-xs font-semibold text-bear-muted mb-1 uppercase tracking-widest">Student Name</label>
                  <input type="text" value={soStudent} onChange={e => handleStudentSearch(e.target.value)}
                    className="w-full border border-orange-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white"
                    placeholder="Start typing a name…" autoComplete="off" />
                  {soMatches.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-orange-100 rounded-xl shadow-lg overflow-hidden">
                      {soMatches.map(s => {
                        const used = studentUsage[s.id] ?? 0
                        const atLimit = roomLimit && used >= roomLimit.max_passes
                        return (
                          <button key={s.id} type="button"
                            onClick={() => { setSoStudent(`${s.first_name} ${s.last_name}`); setSoStudentId(s.id); setSoMatches([]) }}
                            className="w-full text-left px-4 py-2.5 hover:bg-bear-light text-sm font-medium text-bear-dark border-b border-orange-50 last:border-0">
                            {s.preferred_name || s.first_name} {s.last_name}
                            {s.watch_list && <span className="ml-2 text-xs text-amber-600">⚠ Watch</span>}
                            {s.no_roam && <span className="ml-2 text-xs text-red-600">🚫</span>}
                            {roomLimit && (
                              <span className={`ml-2 text-xs font-semibold ${atLimit ? 'text-red-600' : 'text-purple-600'}`}>
                                🚿{used}/{roomLimit.max_passes}
                              </span>
                            )}
                          </button>
                        )
                      })}
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

                {/* Override prompt */}
                {soResult?.needsOverride && !isOverride && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-2">
                    <p className="text-sm text-amber-800 font-medium">⚠ Student has reached the class pass limit.</p>
                    <p className="text-xs text-amber-700">You can issue this pass as a teacher override. It will be logged.</p>
                    <button type="button" onClick={() => { setIsOverride(true); setSoResult(null) }}
                      className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-4 py-1.5 rounded-lg">
                      Issue Override Pass
                    </button>
                  </div>
                )}
                {isOverride && (
                  <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-amber-800">🔓 Teacher Override Active</span>
                    <button type="button" onClick={() => setIsOverride(false)} className="text-xs text-amber-600 hover:text-amber-800">Cancel</button>
                  </div>
                )}

                {soResult && (
                  <div className={`rounded-xl px-4 py-3 text-sm font-medium ${soResult.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                    {!soResult.ok && '🚫 '}{soResult.msg}
                  </div>
                )}

                <button type="submit" disabled={soLoading || !soStudentId}
                  className={`w-full font-semibold rounded-xl py-2.5 text-sm transition-colors text-white disabled:opacity-50 ${isOverride ? 'bg-amber-600 hover:bg-amber-700' : 'bg-bear-orange hover:bg-orange-600'}`}>
                  {soLoading ? 'Processing…' : isOverride ? 'Issue Override Pass' : 'Issue Pass'}
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
                      const isOverridePass = (pass.out_by ?? '').startsWith('TEACHER_OVERRIDE:')
                      return (
                        <div key={pass.id} className="flex items-center gap-3 p-3 bg-orange-50 border border-orange-100 rounded-xl">
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-bear-dark text-sm truncate">
                              {pass.student?.preferred_name || pass.student?.first_name} {pass.student?.last_name}
                              {isOverridePass && <span className="ml-1 text-xs text-amber-600 font-semibold">↑ override</span>}
                            </div>
                            <div className="text-xs text-bear-muted">{pass.destination?.name}</div>
                          </div>
                          <div className={`text-sm font-mono font-bold ${elapsedClass(min)}`}>{min}m</div>
                          <button onClick={() => signStudentIn(pass.id)}
                            className="bg-green-100 hover:bg-green-200 text-green-800 text-xs font-semibold px-3 py-1.5 rounded-lg">
                            Return
                          </button>
                        </div>
                      )
                    })}
                  </div>
              }
            </div>
          </div>
        )}

        {/* ── PASS LIMITS TAB ── */}
        {activeTab === 'limits' && (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Set / edit the room-wide limit */}
            <div className="card space-y-4">
              <div>
                <h2 className="text-lg font-bold text-bear-dark">Class Pass Limit</h2>
                <p className="text-xs text-bear-muted mt-1">
                  Sets a maximum number of bathroom/water passes <strong>per student</strong> over a date range for your entire class. 
                  Once a student hits the limit, the terminal denies them. You can still issue a pass as an override from your login.
                </p>
              </div>

              {roomLimit && (
                <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-purple-800">🟣 Active Limit</span>
                    <button onClick={handleRemoveLimit} className="text-xs text-red-500 hover:text-red-700 font-semibold">Remove</button>
                  </div>
                  <div className="text-sm text-purple-700">
                    Max <strong>{roomLimit.max_passes}</strong> passes per student · {roomLimit.start_date} → {roomLimit.end_date}
                  </div>
                  {roomLimit.note && <div className="text-xs text-purple-600 italic">{roomLimit.note}</div>}
                </div>
              )}

              <form onSubmit={handleSaveLimit} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-bear-muted mb-1 uppercase tracking-widest">Start Date</label>
                    <input type="date" value={limitForm.start_date} onChange={e => setLimitForm(f => ({ ...f, start_date: e.target.value }))} required
                      className="w-full border border-orange-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-bear-muted mb-1 uppercase tracking-widest">End Date</label>
                    <input type="date" value={limitForm.end_date} onChange={e => setLimitForm(f => ({ ...f, end_date: e.target.value }))} required
                      className="w-full border border-orange-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-bear-muted mb-1 uppercase tracking-widest">
                    Max Bathroom/Water Passes Per Student
                  </label>
                  <input type="number" min="1" max="99" value={limitForm.max_passes}
                    onChange={e => setLimitForm(f => ({ ...f, max_passes: e.target.value }))} required
                    className="w-full border border-orange-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-bear-muted mb-1 uppercase tracking-widest">Note (optional)</label>
                  <input type="text" value={limitForm.note} onChange={e => setLimitForm(f => ({ ...f, note: e.target.value }))}
                    placeholder="e.g. 3 passes per week, per admin directive"
                    className="w-full border border-orange-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white" />
                </div>

                {limitMsg && (
                  <div className={`text-sm rounded-xl px-4 py-2 ${limitMsg.startsWith('✅') ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                    {limitMsg}
                  </div>
                )}

                <button type="submit" disabled={limitSaving}
                  className="w-full bg-bear-orange hover:bg-orange-600 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors">
                  {limitSaving ? 'Saving…' : roomLimit ? 'Update Limit' : 'Set Class Limit'}
                </button>
              </form>
            </div>

            {/* Per-student usage breakdown */}
            <div className="card">
              <h2 className="text-lg font-bold text-bear-dark mb-4">
                Student Usage
                {!roomLimit && <span className="ml-2 text-xs text-bear-muted font-normal">(no active limit)</span>}
              </h2>
              {!roomLimit ? (
                <div className="text-center text-bear-muted py-10 text-sm">Set a pass limit to see per-student usage.</div>
              ) : allStudents.length === 0 ? (
                <div className="text-center text-bear-muted py-10 text-sm">No students assigned to this room.</div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {allStudents
                    .map(s => ({ ...s, used: studentUsage[s.id] ?? 0 }))
                    .sort((a, b) => b.used - a.used)  // most used first
                    .map(s => {
                      const pct = Math.min(100, Math.round((s.used / roomLimit.max_passes) * 100))
                      const atLimit = s.used >= roomLimit.max_passes
                      return (
                        <div key={s.id} className={`px-3 py-2.5 rounded-xl border ${atLimit ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-transparent'}`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-bear-dark flex-1 truncate">
                              {s.preferred_name || s.first_name} {s.last_name}
                            </span>
                            <span className={`text-xs font-bold ${atLimit ? 'text-red-600' : 'text-bear-muted'}`}>
                              {s.used}/{roomLimit.max_passes}
                            </span>
                            {atLimit && <span className="text-xs text-red-600 font-semibold">LIMIT</span>}
                          </div>
                          <div className="h-1.5 bg-white rounded-full overflow-hidden border border-gray-200">
                            <div className={`h-1.5 rounded-full transition-all ${atLimit ? 'bg-red-500' : pct > 66 ? 'bg-amber-500' : 'bg-green-500'}`}
                              style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })
                  }
                </div>
              )}
            </div>
          </div>
        )}

        {/* Roster */}
        {activeTab === 'signout' && (
          <div className="card">
            <h2 className="text-lg font-bold text-bear-dark mb-1">
              {currentPeriod ? `Period ${currentPeriod} Roster` : 'Class Roster'} ({displayStudents.length})
            </h2>
            {currentPeriod && currentStudents.length === 0 && (
              <p className="text-xs text-amber-600 mb-3">⚠ No period schedule — showing homeroom. Set schedules in Admin → Schedules.</p>
            )}
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
              {displayStudents.map(s => {
                const isOut = activePasses.some(p => p.student_id === s.id)
                const used = studentUsage[s.id] ?? 0
                const atLimit = roomLimit && used >= roomLimit.max_passes
                return (
                  <div key={s.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${isOut ? 'bg-amber-50 border border-amber-200' : atLimit ? 'bg-red-50 border border-red-100' : 'bg-gray-50 border border-transparent'}`}>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${isOut ? 'bg-amber-500' : 'bg-gray-300'}`} />
                    <span className="truncate font-medium text-bear-dark">{s.preferred_name || s.first_name} {s.last_name}</span>
                    {s.watch_list && <span className="text-xs text-amber-600 shrink-0">⚠</span>}
                    {s.no_roam && <span className="text-xs text-red-600 shrink-0">🚫</span>}
                    {roomLimit && (
                      <span className={`text-xs font-bold shrink-0 ${atLimit ? 'text-red-600' : 'text-purple-500'}`}>
                        🚿{used}/{roomLimit.max_passes}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
