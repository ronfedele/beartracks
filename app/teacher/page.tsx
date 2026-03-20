'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { requestPass, signStudentIn, getTodayDayType, getEffectiveMinutes } from '@/lib/passes'
import Nav from '@/components/Nav'
import type { Student, Destination, Pass, Room, UserProfile } from '@/lib/types'

function timeToMin(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m }
async function getCurrentPeriodAsync(periods: number[]): Promise<number | null> {
  const n = await getEffectiveMinutes()
  for (let i = 0; i < periods.length - 1; i++) if (n >= periods[i] && n < periods[i+1]) return i+1
  return null
}

interface RoomLimit { id: string; destination_type: 'bathroom'|'water'|'both'; start_date: string; end_date: string; max_passes: number; note: string|null; active: boolean }
const EMPTY_LIMIT = { start_date:'', end_date:'', max_passes:'3', note:'' }
const DEST_LABELS: Record<string,string> = { bathroom:'🚻 Bathroom', water:'💧 Water Fountain', both:'🚻+💧 Both' }

export default function TeacherPage() {
  const [profile, setProfile] = useState<UserProfile|null>(null)
  const [room, setRoom] = useState<Room|null>(null)
  const [allStudents, setAllStudents] = useState<Student[]>([])
  const [currentStudents, setCurrentStudents] = useState<Student[]>([])
  const [currentPeriod, setCurrentPeriod] = useState<number|null>(null)
  const [destinations, setDestinations] = useState<Destination[]>([])
  const [activePasses, setActivePasses] = useState<(Pass & {student:Student;destination:Destination})[]>([])
  const [limits, setLimits] = useState<RoomLimit[]>([])
  const [studentUsage, setStudentUsage] = useState<Record<string, {bathroom:number; water:number}>>({})
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'signout'|'limits'>('signout')

  // Sign-out form
  const [soStudent, setSoStudent] = useState(''); const [soStudentId, setSoStudentId] = useState('')
  const [soDestId, setSoDestId] = useState(''); const [soMatches, setSoMatches] = useState<Student[]>([])
  const [soResult, setSoResult] = useState<{ok:boolean;msg:string;needsOverride?:boolean}|null>(null)
  const [soLoading, setSoLoading] = useState(false); const [isOverride, setIsOverride] = useState(false)

  // Limit forms — one for bathroom, one for water
  const [bathroomForm, setBathroomForm] = useState({...EMPTY_LIMIT})
  const [waterForm, setWaterForm] = useState({...EMPTY_LIMIT})
  const [limitSaving, setLimitSaving] = useState<string|null>(null)
  const [limitMsg, setLimitMsg] = useState('')

  const loadPeriodStudents = useCallback(async (roomId: string, supabase: any) => {
    const dayType = await getTodayDayType()
    const { data: rd } = await supabase.from('rooms').select('bell_schedule').eq('id', roomId).maybeSingle()
    if (!rd) return
    let periods: number[] = []
    if (rd.bell_schedule === 9) {
      const { data: vc } = await supabase.from('varied_schedule_config').select('*').eq('room_id', roomId).maybeSingle()
      const { data: scheds } = await supabase.from('schedules').select('*').eq('profile', dayType).in('grade_group',[7,8])
      if (vc && scheds) {
        const s7 = scheds.find((s:any)=>s.grade_group===7), s8=scheds.find((s:any)=>s.grade_group===8)
        if (s7&&s8) { const keys=['day_start','p1','p2','p3','p4','p5','p6']; const g=[7,vc.p1_group,vc.p2_group,vc.p3_group,vc.p4_group,vc.p5_group,vc.p6_group]; periods=keys.map((k,i)=>timeToMin((g[i]===7?s7:s8)[k])) }
      }
    } else {
      const { data: sc } = await supabase.from('schedules').select('*').eq('grade_group',rd.bell_schedule).eq('profile',dayType).maybeSingle()
      if (sc) periods=[sc.day_start,sc.p1,sc.p2,sc.p3,sc.p4,sc.p5,sc.p6].map(timeToMin)
    }
    const period = await getCurrentPeriodAsync(periods); setCurrentPeriod(period)
    if (period) {
      const { data: ss } = await supabase.from('student_schedules').select('student_id').eq('room_id',roomId).eq('period',period)
      const ids = (ss??[]).map((s:any)=>s.student_id)
      if (ids.length>0) { const { data: studs } = await supabase.from('students').select('*').in('id',ids).eq('active',true).order('last_name'); setCurrentStudents(studs??[]); return }
    }
    setCurrentStudents([])
  }, [])

  async function loadLimits(roomId: string) {
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]
    const { data } = await supabase.from('room_pass_limits').select('*').eq('room_id', roomId).eq('active', true).gte('end_date', today).order('destination_type')
    const ls = (data ?? []) as RoomLimit[]
    setLimits(ls)

    // Load per-student usage for each active limit
    const { data: studs } = await supabase.from('students').select('id').eq('room_id', roomId).eq('active', true)
    const usage: Record<string, {bathroom:number;water:number}> = {}
    const bLimit = ls.find(l => l.destination_type==='bathroom' || l.destination_type==='both')
    const wLimit = ls.find(l => l.destination_type==='water' || l.destination_type==='both')
    await Promise.all((studs??[]).map(async (s: any) => {
      usage[s.id] = { bathroom: 0, water: 0 }
      if (bLimit) {
        const { data: c } = await supabase.rpc('count_student_bathroom_passes', { p_student_id:s.id, p_room_id:roomId, p_start_date:bLimit.start_date, p_end_date:bLimit.end_date })
        usage[s.id].bathroom = Number(c??0)
      }
      if (wLimit) {
        const { data: c } = await supabase.rpc('count_student_water_passes', { p_student_id:s.id, p_room_id:roomId, p_start_date:wLimit.start_date, p_end_date:wLimit.end_date })
        usage[s.id].water = Number(c??0)
      }
    }))
    setStudentUsage(usage)
  }

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data:{user} } = await supabase.auth.getUser()
      if (!user) { window.location.href='/'; return }
      const { data:prof } = await supabase.from('user_profiles').select('*, room:rooms(*)').eq('id',user.id).maybeSingle()
      if (!prof) return
      setProfile(prof as any); const r = prof.room as Room; setRoom(r)
      const { data:allStuds } = await supabase.from('students').select('*').eq('room_id',r.id).eq('active',true).order('last_name')
      setAllStudents(allStuds??[])
      const { data:dests } = await supabase.from('destinations').select('*').eq('active',true).order('sort_order')
      setDestinations(dests??[]); if (dests?.[0]) setSoDestId(dests[0].id)
      await loadPeriodStudents(r.id, supabase); await loadLimits(r.id); setLoading(false)
    }
    init()
    const t = setInterval(async () => {
      const supabase = createClient(); const { data:prof } = await supabase.from('user_profiles').select('room_id').eq('id',(await supabase.auth.getUser()).data.user?.id??'').maybeSingle()
      if (prof?.room_id) await loadPeriodStudents(prof.room_id, supabase)
    }, 120000)
    return () => clearInterval(t)
  }, [loadPeriodStudents])

  useEffect(() => {
    if (!room) return
    const supabase = createClient()
    async function loadPasses() {
      const { data } = await supabase.from('passes').select('*, student:students(*), destination:destinations(*)').eq('room_id',room!.id).eq('status','OUT').order('out_time')
      setActivePasses((data??[]) as any)
    }
    loadPasses()
    const ch = supabase.channel('teacher-passes').on('postgres_changes',{event:'*',schema:'public',table:'passes',filter:`room_id=eq.${room.id}`},loadPasses).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [room])

  function handleStudentSearch(q: string) {
    setSoStudent(q); setSoStudentId(''); setIsOverride(false)
    if (q.length<2) { setSoMatches([]); return }
    const pool = currentStudents.length>0 ? currentStudents : allStudents
    setSoMatches(pool.filter(s=>`${s.first_name} ${s.last_name} ${s.preferred_name??''}`.toLowerCase().includes(q.toLowerCase())).slice(0,6))
  }

  async function handleSignOut(e: React.FormEvent) {
    e.preventDefault(); if (!room||!profile||!soStudentId||!soDestId) return
    setSoLoading(true); setSoResult(null)
    const destName = destinations.find(d=>d.id===soDestId)?.name?.toLowerCase()??''
    const isBW = ['bathroom','water fountain'].includes(destName)
    const result = await requestPass({ studentId:soStudentId, roomId:room.id, destinationId:soDestId, outBy:profile.email, teacherEmail:room.teacher_email, teacherOverride:isOverride&&isBW })
    if (!result.approved) {
      const reason = (result as any).reason as string
      setSoResult({ ok:false, msg:reason, needsOverride:reason.includes('Pass limit')&&!isOverride })
    } else {
      setSoResult({ ok:true, msg:isOverride?'✅ Pass issued (teacher override).':'✅ Student signed out.' })
      setSoStudent(''); setSoStudentId(''); setSoMatches([]); setIsOverride(false)
      if (room) await loadLimits(room.id)
    }
    setSoLoading(false)
  }

  async function saveLimit(destType: 'bathroom'|'water', form: typeof EMPTY_LIMIT) {
    if (!room||!profile) return
    setLimitSaving(destType); setLimitMsg('')
    const supabase = createClient()
    // Deactivate existing limit of same type
    await supabase.from('room_pass_limits').update({active:false}).eq('room_id',room.id).eq('destination_type',destType).eq('active',true)
    const { error } = await supabase.from('room_pass_limits').insert({
      room_id:room.id, set_by:profile.id, destination_type:destType,
      start_date:form.start_date, end_date:form.end_date, max_passes:parseInt(form.max_passes), note:form.note||null, active:true,
    })
    if (error) setLimitMsg(`Error: ${error.message}`)
    else { setLimitMsg(`✅ ${destType === 'bathroom' ? 'Bathroom' : 'Water fountain'} limit saved.`); await loadLimits(room.id) }
    setLimitSaving(null)
  }

  async function removeLimit(limitId: string) {
    const supabase = createClient(); await supabase.from('room_pass_limits').update({active:false}).eq('id',limitId)
    if (room) await loadLimits(room.id)
  }

  function elapsed(t: string) { return Math.round((Date.now()-new Date(t).getTime())/60000) }
  function elapsedClass(min: number) { return min<10?'elapsed-normal':min<15?'elapsed-yellow':min<25?'elapsed-orange':'elapsed-red' }

  const displayStudents = currentStudents.length>0 ? currentStudents : allStudents
  const bathroomLimit = limits.find(l=>l.destination_type==='bathroom')
  const waterLimit    = limits.find(l=>l.destination_type==='water')

  if (loading) return <div className="min-h-screen bg-bear-cream flex items-center justify-center"><div className="text-bear-muted">Loading…</div></div>

  return (
    <div className="min-h-screen bg-bear-cream">
      <Nav role={profile?.role??'teacher'} displayName={profile?.display_name??profile?.email} roomNumber={room?.room_number} />
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-display font-black text-bear-dark">{room?.room_number} · {room?.teacher_name}</h1>
          <p className="text-bear-muted mt-1 flex items-center gap-2 flex-wrap">
            {currentPeriod ? <>Period <strong>{currentPeriod}</strong> · {displayStudents.length} students · {activePasses.length} out</> : <>{allStudents.length} students</>}
            {bathroomLimit && <span className="text-xs bg-blue-100 text-blue-800 font-semibold px-2 py-0.5 rounded-full">🚻 Bathroom limit</span>}
            {waterLimit    && <span className="text-xs bg-cyan-100 text-cyan-800 font-semibold px-2 py-0.5 rounded-full">💧 Water limit</span>}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-orange-100 p-1 rounded-xl w-fit">
          {([['signout','✍️ Sign Out'],['limits','🚿 Pass Limits']] as const).map(([tab,label])=>(
            <button key={tab} onClick={()=>setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${activeTab===tab?'bg-white text-bear-dark shadow-sm':'text-bear-muted hover:text-bear-dark'}`}>
              {label}
              {tab==='limits'&&limits.length>0&&<span className="ml-1.5 bg-bear-orange text-white text-xs px-1.5 py-0.5 rounded-full">{limits.length}</span>}
            </button>
          ))}
        </div>

        {/* ── SIGN OUT TAB ── */}
        {activeTab==='signout' && (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="card">
              <h2 className="text-lg font-bold text-bear-dark mb-4">Sign a Student Out</h2>
              <form onSubmit={handleSignOut} className="space-y-4">
                <div className="relative">
                  <label className="block text-xs font-semibold text-bear-muted mb-1 uppercase tracking-widest">Student Name</label>
                  <input type="text" value={soStudent} onChange={e=>handleStudentSearch(e.target.value)}
                    className="w-full border border-orange-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white"
                    placeholder="Start typing a name…" autoComplete="off" />
                  {soMatches.length>0&&(
                    <div className="absolute z-10 w-full mt-1 bg-white border border-orange-100 rounded-xl shadow-lg overflow-hidden">
                      {soMatches.map(s=>{
                        const u = studentUsage[s.id]
                        return (
                          <button key={s.id} type="button" onClick={()=>{setSoStudent(`${s.first_name} ${s.last_name}`);setSoStudentId(s.id);setSoMatches([])}}
                            className="w-full text-left px-4 py-2.5 hover:bg-bear-light text-sm font-medium text-bear-dark border-b border-orange-50 last:border-0">
                            {s.preferred_name||s.first_name} {s.last_name}
                            {s.no_roam&&<span className="ml-2 text-xs text-red-600">🚫</span>}
                            {bathroomLimit&&u&&<span className={`ml-2 text-xs font-semibold ${u.bathroom>=bathroomLimit.max_passes?'text-red-600':'text-blue-600'}`}>🚻{u.bathroom}/{bathroomLimit.max_passes}</span>}
                            {waterLimit&&u&&<span className={`ml-2 text-xs font-semibold ${u.water>=waterLimit.max_passes?'text-red-600':'text-cyan-600'}`}>💧{u.water}/{waterLimit.max_passes}</span>}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-bear-muted mb-1 uppercase tracking-widest">Destination</label>
                  <select value={soDestId} onChange={e=>setSoDestId(e.target.value)} className="w-full border border-orange-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white">
                    {destinations.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                {soResult?.needsOverride&&!isOverride&&(
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-2">
                    <p className="text-sm text-amber-800 font-medium">⚠ Student has reached their pass limit.</p>
                    <button type="button" onClick={()=>{setIsOverride(true);setSoResult(null)}} className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-4 py-1.5 rounded-lg">Issue Override Pass</button>
                  </div>
                )}
                {isOverride&&(
                  <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-amber-800">🔓 Teacher Override Active</span>
                    <button type="button" onClick={()=>setIsOverride(false)} className="text-xs text-amber-600">Cancel</button>
                  </div>
                )}
                {soResult&&(
                  <div className={`rounded-xl px-4 py-3 text-sm font-medium ${soResult.ok?'bg-green-50 text-green-800 border border-green-200':'bg-red-50 text-red-800 border border-red-200'}`}>
                    {!soResult.ok&&'🚫 '}{soResult.msg}
                  </div>
                )}
                <button type="submit" disabled={soLoading||!soStudentId}
                  className={`w-full font-semibold rounded-xl py-2.5 text-sm transition-colors text-white disabled:opacity-50 ${isOverride?'bg-amber-600 hover:bg-amber-700':'bg-bear-orange hover:bg-orange-600'}`}>
                  {soLoading?'Processing…':isOverride?'Issue Override Pass':'Issue Pass'}
                </button>
              </form>
            </div>
            <div className="card">
              <h2 className="text-lg font-bold text-bear-dark mb-4">Currently Out{activePasses.length>0&&<span className="ml-2 bg-bear-orange text-white text-xs font-bold px-2 py-0.5 rounded-full">{activePasses.length}</span>}</h2>
              {activePasses.length===0?<div className="text-center text-bear-muted py-10 text-sm">No students currently out 🎉</div>:
                <div className="space-y-2">{activePasses.map(pass=>{
                  const min=elapsed(pass.out_time); const ov=(pass.out_by??'').startsWith('TEACHER_OVERRIDE:')
                  return (<div key={pass.id} className="flex items-center gap-3 p-3 bg-orange-50 border border-orange-100 rounded-xl">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-bear-dark text-sm truncate">{pass.student?.preferred_name||pass.student?.first_name} {pass.student?.last_name}{ov&&<span className="ml-1 text-xs text-amber-600">↑ override</span>}</div>
                      <div className="text-xs text-bear-muted">{pass.destination?.name}</div>
                    </div>
                    <div className={`text-sm font-mono font-bold ${elapsedClass(min)}`}>{min}m</div>
                    <button onClick={()=>signStudentIn(pass.id)} className="bg-green-100 hover:bg-green-200 text-green-800 text-xs font-semibold px-3 py-1.5 rounded-lg">Return</button>
                  </div>)
                })}</div>
              }
            </div>
          </div>
        )}

        {/* ── PASS LIMITS TAB ── */}
        {activeTab==='limits'&&(
          <div className="space-y-6">
            {limitMsg&&<div className={`text-sm rounded-xl px-4 py-2 ${limitMsg.startsWith('✅')?'bg-green-50 text-green-800 border border-green-200':'bg-red-50 text-red-800 border border-red-200'}`}>{limitMsg}</div>}

            <div className="grid md:grid-cols-2 gap-6">
              {/* Bathroom limit */}
              {(['bathroom','water'] as const).map(destType=>{
                const form = destType==='bathroom' ? bathroomForm : waterForm
                const setForm = destType==='bathroom' ? setBathroomForm : setWaterForm
                const existing = limits.find(l=>l.destination_type===destType)
                const label = destType==='bathroom' ? '🚻 Bathroom Passes' : '💧 Water Fountain Passes'
                const color = destType==='bathroom' ? 'border-blue-200 bg-blue-50' : 'border-cyan-200 bg-cyan-50'
                const badge = destType==='bathroom' ? 'bg-blue-100 text-blue-800' : 'bg-cyan-100 text-cyan-800'
                const btnColor = destType==='bathroom' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-cyan-600 hover:bg-cyan-700'
                return (
                  <div key={destType} className="card space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-bold text-bear-dark">{label}</h2>
                      {existing&&<span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge}`}>Active</span>}
                    </div>
                    <p className="text-xs text-bear-muted">Max {destType} passes per student over a date range. Teacher can override from their login.</p>
                    {existing&&(
                      <div className={`border rounded-xl px-4 py-3 space-y-1 ${color}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold">Max {existing.max_passes} passes · {existing.start_date} → {existing.end_date}</span>
                          <button onClick={()=>removeLimit(existing.id)} className="text-xs text-red-500 hover:text-red-700 font-semibold">Remove</button>
                        </div>
                        {existing.note&&<div className="text-xs italic opacity-70">{existing.note}</div>}
                      </div>
                    )}
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-bear-muted mb-1 uppercase tracking-widest">Start Date</label>
                          <input type="date" value={form.start_date} onChange={e=>setForm(f=>({...f,start_date:e.target.value}))} required className="w-full border border-orange-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-bear-muted mb-1 uppercase tracking-widest">End Date</label>
                          <input type="date" value={form.end_date} onChange={e=>setForm(f=>({...f,end_date:e.target.value}))} required className="w-full border border-orange-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-bear-muted mb-1 uppercase tracking-widest">Max Passes Per Student</label>
                        <input type="number" min="1" max="99" value={form.max_passes} onChange={e=>setForm(f=>({...f,max_passes:e.target.value}))} className="w-full border border-orange-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-bear-muted mb-1 uppercase tracking-widest">Note (optional)</label>
                        <input type="text" value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} placeholder="e.g. 3 per week" className="w-full border border-orange-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white" />
                      </div>
                      <button onClick={()=>saveLimit(destType, form)} disabled={limitSaving===destType||!form.start_date||!form.end_date}
                        className={`w-full ${btnColor} disabled:opacity-50 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors`}>
                        {limitSaving===destType?'Saving…':existing?`Update ${destType==='bathroom'?'Bathroom':'Water'} Limit`:`Set ${destType==='bathroom'?'Bathroom':'Water'} Limit`}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Usage table */}
            {(bathroomLimit||waterLimit)&&(
              <div className="card">
                <h2 className="text-lg font-bold text-bear-dark mb-4">Student Usage</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-orange-100">
                      <th className="text-left px-3 py-2 text-xs font-semibold text-bear-muted uppercase tracking-wider">Student</th>
                      {bathroomLimit&&<th className="text-center px-3 py-2 text-xs font-semibold text-blue-600 uppercase tracking-wider">🚻 Bathroom<br/><span className="normal-case font-normal">max {bathroomLimit.max_passes}</span></th>}
                      {waterLimit&&<th className="text-center px-3 py-2 text-xs font-semibold text-cyan-600 uppercase tracking-wider">💧 Water<br/><span className="normal-case font-normal">max {waterLimit.max_passes}</span></th>}
                    </tr></thead>
                    <tbody>
                      {allStudents.map(s=>{
                        const u = studentUsage[s.id]??{bathroom:0,water:0}
                        const bAt = bathroomLimit&&u.bathroom>=bathroomLimit.max_passes
                        const wAt = waterLimit&&u.water>=waterLimit.max_passes
                        return (
                          <tr key={s.id} className={`border-b border-orange-50 ${(bAt||wAt)?'bg-red-50':''}`}>
                            <td className="px-3 py-2 font-medium text-bear-dark">{s.preferred_name||s.first_name} {s.last_name}</td>
                            {bathroomLimit&&(
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-2 justify-center">
                                  <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div className={`h-2 rounded-full ${bAt?'bg-red-500':u.bathroom/bathroomLimit.max_passes>0.66?'bg-amber-500':'bg-blue-500'}`}
                                      style={{width:`${Math.min(100,(u.bathroom/bathroomLimit.max_passes)*100)}%`}} />
                                  </div>
                                  <span className={`text-xs font-bold ${bAt?'text-red-600':'text-bear-muted'}`}>{u.bathroom}/{bathroomLimit.max_passes}</span>
                                </div>
                              </td>
                            )}
                            {waterLimit&&(
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-2 justify-center">
                                  <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div className={`h-2 rounded-full ${wAt?'bg-red-500':u.water/waterLimit.max_passes>0.66?'bg-amber-500':'bg-cyan-500'}`}
                                      style={{width:`${Math.min(100,(u.water/waterLimit.max_passes)*100)}%`}} />
                                  </div>
                                  <span className={`text-xs font-bold ${wAt?'text-red-600':'text-bear-muted'}`}>{u.water}/{waterLimit.max_passes}</span>
                                </div>
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Roster */}
        {activeTab==='signout'&&(
          <div className="card">
            <h2 className="text-lg font-bold text-bear-dark mb-1">{currentPeriod?`Period ${currentPeriod} Roster`:'Class Roster'} ({displayStudents.length})</h2>
            {currentPeriod&&currentStudents.length===0&&<p className="text-xs text-amber-600 mb-3">⚠ No period schedule — showing homeroom.</p>}
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
              {displayStudents.map(s=>{
                const isOut=activePasses.some(p=>p.student_id===s.id)
                const u=studentUsage[s.id]??{bathroom:0,water:0}
                const bAt=bathroomLimit&&u.bathroom>=bathroomLimit.max_passes
                const wAt=waterLimit&&u.water>=waterLimit.max_passes
                return (<div key={s.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${isOut?'bg-amber-50 border border-amber-200':(bAt||wAt)?'bg-red-50 border border-red-100':'bg-gray-50 border border-transparent'}`}>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${isOut?'bg-amber-500':'bg-gray-300'}`} />
                  <span className="truncate font-medium text-bear-dark">{s.preferred_name||s.first_name} {s.last_name}</span>
                  {s.no_roam&&<span className="text-xs text-red-600 shrink-0">🚫</span>}
                  {bathroomLimit&&<span className={`text-xs font-bold shrink-0 ${bAt?'text-red-600':'text-blue-500'}`}>🚻{u.bathroom}/{bathroomLimit.max_passes}</span>}
                  {waterLimit&&<span className={`text-xs font-bold shrink-0 ${wAt?'text-red-600':'text-cyan-500'}`}>💧{u.water}/{waterLimit.max_passes}</span>}
                </div>)
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
