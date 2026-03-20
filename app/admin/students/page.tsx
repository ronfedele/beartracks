'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import Nav from '@/components/Nav'
import type { Room, UserProfile } from '@/lib/types'

const EMPTY_FORM = { first_name:'', last_name:'', grade:'', student_id:'', no_roam:false, watch_list:false }
const EMPTY_PERIODS: Record<number,string> = {1:'',2:'',3:'',4:'',5:'',6:''}

export default function AdminStudentsPage() {
  const [profile, setProfile] = useState<UserProfile|null>(null)
  const [canUpload, setCanUpload] = useState(false)
  const [students, setStudents] = useState<any[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roomFilter, setRoomFilter] = useState('')
  const [gradeFilter, setGradeFilter] = useState('')

  const [editId, setEditId] = useState<string|null>(null)
  const [showEdit, setShowEdit] = useState(false)
  const [form, setForm] = useState({...EMPTY_FORM})
  const [periodRooms, setPeriodRooms] = useState<Record<number,string>>({...EMPTY_PERIODS})
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const [importStatus, setImportStatus] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Purge state
  const [purgeTarget, setPurgeTarget] = useState<'students'|'logs'|null>(null)
  const [purgeStep, setPurgeStep] = useState(0)
  const [purgeConfirm, setPurgeConfirm] = useState('')
  const [purging, setPurging] = useState(false)
  const [purgeMsg, setPurgeMsg] = useState('')

  const PURGE_PHRASES = ['DELETE ALL STUDENTS', 'I UNDERSTAND THIS IS PERMANENT', 'CONFIRM PURGE']
  const LOG_PHRASES   = ['DELETE ALL LOGS', 'I UNDERSTAND THIS IS PERMANENT', 'CONFIRM PURGE']

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data:{user} } = await supabase.auth.getUser()
      if (!user) { window.location.href='/'; return }
      const { data:prof } = await supabase.from('user_profiles').select('*').eq('id',user.id).maybeSingle()
      if (!['admin','monitor'].includes(prof?.role) && !prof?.can_upload_students) {
        if (prof?.role !== 'teacher') { window.location.href='/'; return }
      }
      setProfile(prof as any)
      setCanUpload(prof?.role === 'admin' || prof?.role === 'monitor' || prof?.can_upload_students === true)
      await loadAll(supabase)
      setLoading(false)
    }
    init()
  }, [])

  async function loadAll(supabase?: any) {
    const sb = supabase ?? createClient()
    const [{ data:studs }, { data:rms }, { data:scheds }] = await Promise.all([
      sb.from('students').select('*, room:rooms(room_number,teacher_name)').order('last_name'),
      sb.from('rooms').select('*').order('room_number'),
      sb.from('student_schedules').select('student_id,period,room_id,room:rooms(room_number)'),
    ])
    const schedMap: Record<string,Record<number,string>> = {}
    ;(scheds??[]).forEach((sc:any) => {
      if (!schedMap[sc.student_id]) schedMap[sc.student_id]={}
      schedMap[sc.student_id][sc.period] = sc.room?.room_number ?? ''
    })
    setStudents((studs??[]).map((s:any) => ({ ...s, periods: schedMap[s.id]??{} })))
    setRooms(rms??[])
  }

  async function openEdit(s?: any) {
    setSaveMsg('')
    if (s) {
      setEditId(s.id)
      setForm({ first_name:s.first_name, last_name:s.last_name, grade:s.grade?.toString()??'',
        student_id:s.student_id??'', no_roam:s.no_roam, watch_list:s.watch_list })
      const supabase = createClient()
      const { data:scheds } = await supabase.from('student_schedules').select('period,room_id').eq('student_id',s.id)
      const pr:Record<number,string>={1:'',2:'',3:'',4:'',5:'',6:''}
      ;(scheds??[]).forEach((sc:any)=>{ pr[sc.period]=sc.room_id??'' })
      setPeriodRooms(pr)
    } else {
      setEditId(null); setForm({...EMPTY_FORM}); setPeriodRooms({...EMPTY_PERIODS})
    }
    setShowEdit(true)
  }

  async function handleSave() {
    if (!form.first_name||!form.last_name) return
    setSaving(true); setSaveMsg('')
    const supabase = createClient()
    const payload = { first_name:form.first_name, last_name:form.last_name,
      grade:form.grade?parseInt(form.grade):null, student_id:form.student_id||null,
      no_roam:form.no_roam, watch_list:form.watch_list }
    let sid = editId
    if (editId) {
      await supabase.from('students').update(payload).eq('id',editId)
    } else {
      const { data:ns } = await supabase.from('students').insert(payload).select('id').single()
      sid = ns?.id ?? null
    }
    if (sid) {
      await supabase.from('student_schedules').delete().eq('student_id',sid)
      const ins = Object.entries(periodRooms).filter(([,r])=>r).map(([p,r])=>({
        student_id:sid, period:parseInt(p), room_id:r,
        group_num: rooms.find(x=>x.id===r)?.bell_schedule??null
      }))
      if (ins.length>0) await supabase.from('student_schedules').insert(ins)
    }
    await loadAll()
    setSaveMsg('✅ Saved')
    setSaving(false)
    setTimeout(()=>{ setShowEdit(false); setEditId(null) }, 600)
  }

  async function toggleFlag(id:string, field:'no_roam'|'watch_list', val:boolean) {
    const supabase = createClient()
    await supabase.from('students').update({ [field]:val }).eq('id',id)
    setStudents(prev=>prev.map(s=>s.id===id?{...s,[field]:val}:s))
  }

  async function handleImportCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setImportStatus('Parsing…')
    const text = await file.text()
    const lines = text.trim().split('\n')
    const headers = lines[0].toLowerCase().split(',').map(h=>h.trim().replace(/"/g,''))
    const rows = lines.slice(1).map(line=>{
      const vals = line.split(',').map(v=>v.trim().replace(/"/g,''))
      return Object.fromEntries(headers.map((h,i)=>[h,vals[i]??'']))
    })
    const supabase = createClient()

    // Build room lookup by room number
    const roomByNum: Record<string,string> = {}
    rooms.forEach(r=>{ roomByNum[r.room_number.toLowerCase()]=r.id; roomByNum[r.room_number.replace(/\D/g,'')]=r.id })

    // Build period column mapping: looks for "p1","period 1","period1","room_p1" etc
    function findPeriodRoom(row: Record<string,string>, p: number): string|null {
      const keys = [`p${p}`,`period ${p}`,`period${p}`,`room_p${p}`,`p${p}_room`,`period_${p}_room`]
      for (const k of keys) {
        const val = row[k]?.trim()
        if (val) {
          const rId = roomByNum[val.toLowerCase()] ?? roomByNum[val.replace(/\D/g,'')]
          if (rId) return rId
        }
      }
      return null
    }

    let inserted=0, updated=0, errors=0

    for (const row of rows) {
      const firstName = row['first name']||row['firstname']||row['first_name']||''
      const lastName  = row['last name']||row['lastname']||row['last_name']||''
      if (!firstName || !lastName) continue

      const studentId = row['student id']||row['student_id']||row['id']||null
      const grade = row['grade']?parseInt(row['grade']):null
      const roomNum = row['room']||row['room number']||row['room_number']||''
      const roomId = roomByNum[roomNum.toLowerCase()]??roomByNum[roomNum.replace(/\D/g,'')]??null

      const payload = { first_name:firstName, last_name:lastName, grade, room_id:roomId??null, active:true }

      let sid: string|null = null

      if (studentId) {
        // Check if exists
        const { data:existing } = await supabase.from('students').select('id').eq('student_id',studentId).maybeSingle()
        if (existing) {
          await supabase.from('students').update(payload).eq('student_id',studentId)
          sid = existing.id; updated++
        } else {
          const { data:ns, error } = await supabase.from('students').insert({...payload, student_id:studentId}).select('id').single()
          if (error) { errors++; continue }
          sid = ns?.id; inserted++
        }
      } else {
        const { data:ns, error } = await supabase.from('students').insert(payload).select('id').single()
        if (error) { errors++; continue }
        sid = ns?.id; inserted++
      }

      // Import period room assignments
      if (sid) {
        const periodIns = []
        for (let p=1;p<=6;p++) {
          const rId = findPeriodRoom(row, p)
          if (rId) periodIns.push({ student_id:sid, period:p, room_id:rId, group_num:rooms.find(r=>r.id===rId)?.bell_schedule??null })
        }
        if (periodIns.length>0) {
          await supabase.from('student_schedules').delete().eq('student_id',sid)
          await supabase.from('student_schedules').insert(periodIns)
        }
      }
    }

    setImportStatus(`Done: ${inserted} inserted, ${updated} updated${errors>0?`, ${errors} errors`:''}`)
    await loadAll()
    if (fileRef.current) fileRef.current.value=''
  }

  async function executePurge() {
    if (!purgeTarget) return
    setPurging(true); setPurgeMsg('')
    const supabase = createClient()
    const fn = purgeTarget==='students' ? 'admin_purge_students' : 'admin_purge_pass_logs'
    const { data, error } = await supabase.rpc(fn)
    if (error) setPurgeMsg(`Error: ${error.message}`)
    else {
      setPurgeMsg(`✅ Purged ${data} records`)
      await loadAll()
    }
    setPurging(false)
    setPurgeStep(0); setPurgeConfirm(''); setPurgeTarget(null)
  }

  const filtered = students.filter(s=>{
    const name=`${s.first_name} ${s.last_name} ${s.student_id??''}`.toLowerCase()
    return (!search||name.includes(search.toLowerCase())) && (!roomFilter||s.room_id===roomFilter) && (!gradeFilter||s.grade?.toString()===gradeFilter)
  })

  const isAdmin = profile?.role==='admin'
  const phrases = purgeTarget==='students' ? PURGE_PHRASES : LOG_PHRASES

  if (loading) return <div className="min-h-screen bg-bear-cream flex items-center justify-center"><div className="text-bear-muted">Loading…</div></div>

  return (
    <div className="min-h-screen bg-bear-cream">
      <Nav role={profile?.role as any} displayName={profile?.display_name??profile?.email} />
      <main className="max-w-7xl mx-auto px-4 py-8 space-y-5">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-display font-black text-bear-dark">Students</h1>
            <p className="text-bear-muted mt-1">{filtered.length} of {students.length} students</p>
          </div>
          <div className="ml-auto flex gap-2 flex-wrap">
            {canUpload && (
              <label className="bg-white border border-orange-200 hover:border-orange-400 text-bear-dark text-sm font-semibold px-4 py-2 rounded-xl cursor-pointer transition-colors">
                📥 Import CSV
                <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleImportCSV} />
              </label>
            )}
            {isAdmin && (
              <>
                <button onClick={()=>{setPurgeTarget('logs');setPurgeStep(0);setPurgeConfirm('');setPurgeMsg('')}}
                  className="bg-white border border-red-200 hover:border-red-400 text-red-600 text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
                  🗑 Clear Logs
                </button>
                <button onClick={()=>{setPurgeTarget('students');setPurgeStep(0);setPurgeConfirm('');setPurgeMsg('')}}
                  className="bg-white border border-red-300 hover:border-red-500 text-red-700 text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
                  ☠ Purge Students
                </button>
              </>
            )}
            <button onClick={()=>openEdit()} className="bg-bear-orange hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">+ Add Student</button>
          </div>
        </div>

        {importStatus && <div className={`rounded-xl px-4 py-2 text-sm ${importStatus.startsWith('Done')?'bg-green-50 text-green-800 border border-green-200':'bg-blue-50 text-blue-800 border border-blue-200'}`}>{importStatus}</div>}

        {/* ── PURGE MODAL ── */}
        {purgeTarget && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
              <div className="text-center">
                <div className="text-4xl mb-2">⚠️</div>
                <h2 className="text-xl font-display font-black text-red-700">
                  {purgeTarget==='students' ? 'Purge All Students' : 'Clear All Pass Logs'}
                </h2>
                <p className="text-sm text-bear-muted mt-2">
                  {purgeTarget==='students'
                    ? 'This will permanently delete ALL students, their schedules, and ALL pass history. This cannot be undone.'
                    : 'This will permanently delete ALL pass history and sign-out logs. Students will remain. This cannot be undone.'}
                </p>
              </div>

              <div className="space-y-3">
                {[0,1,2].map(step=>(
                  <div key={step} className={`space-y-1 ${purgeStep<step?'opacity-30':''}`}>
                    <label className="text-xs font-bold text-red-700 uppercase tracking-widest">
                      Step {step+1} of 3 — type: <span className="font-mono bg-red-50 px-1 rounded">{phrases[step]}</span>
                    </label>
                    <input
                      disabled={purgeStep!==step}
                      value={purgeStep===step?purgeConfirm:''}
                      onChange={e=>{
                        setPurgeConfirm(e.target.value)
                        if (e.target.value===phrases[step]) { setPurgeStep(step+1); setPurgeConfirm('') }
                      }}
                      placeholder={`Type exactly: ${phrases[step]}`}
                      className={`w-full border rounded-xl px-3 py-2 text-sm font-mono focus:outline-none ${purgeStep===step?'border-red-300 bg-red-50 focus:ring-2 focus:ring-red-400':'border-gray-200 bg-gray-50'}`}
                    />
                  </div>
                ))}
              </div>

              {purgeMsg && <div className={`text-sm rounded-xl px-4 py-2 ${purgeMsg.startsWith('✅')?'bg-green-50 text-green-800 border border-green-200':'bg-red-50 text-red-800 border border-red-200'}`}>{purgeMsg}</div>}

              <div className="flex gap-3">
                <button onClick={executePurge} disabled={purgeStep<3||purging}
                  className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-bold py-2.5 rounded-xl transition-colors text-sm">
                  {purging?'Purging…':purgeStep<3?`Complete all 3 steps`:'Execute Purge'}
                </button>
                <button onClick={()=>{setPurgeTarget(null);setPurgeStep(0);setPurgeConfirm('');setPurgeMsg('')}}
                  className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm text-bear-muted hover:text-bear-dark">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit/Add panel */}
        {showEdit && (
          <div className="card border-2 border-bear-orange space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-bear-dark text-lg">{editId?'Edit Student':'Add Student'}</h2>
              <button onClick={()=>setShowEdit(false)} className="text-bear-muted hover:text-bear-dark text-xl">×</button>
            </div>
            {/* Basic info */}
            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
              {[['first_name','First Name'],['last_name','Last Name'],['grade','Grade'],['student_id','Student ID']].map(([k,label])=>(
                <div key={k}>
                  <label className="block text-xs font-semibold text-bear-muted mb-1 uppercase tracking-widest">{label}</label>
                  <input value={(form as any)[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}
                    className="w-full border border-orange-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white" />
                </div>
              ))}
            </div>
            {/* Flags */}
            <div className="flex gap-4 items-center">
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.no_roam} onChange={e=>setForm(f=>({...f,no_roam:e.target.checked}))} className="accent-red-600"/><span className="text-sm font-medium text-red-700">🚫 No Roam</span></label>
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.watch_list} onChange={e=>setForm(f=>({...f,watch_list:e.target.checked}))} className="accent-amber-600"/><span className="text-sm font-medium text-amber-700">⚠ Watch List</span></label>
            </div>
            {/* Period Schedule — inline on same panel */}
            <div className="border-t border-orange-100 pt-4">
              <div className="text-xs font-semibold text-bear-muted uppercase tracking-widest mb-3">Period Schedule (Rooms P1–P6)</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[1,2,3,4,5,6].map(p=>(
                  <div key={p}>
                    <label className="block text-xs font-semibold text-bear-muted mb-1">Period {p}</label>
                    <select value={periodRooms[p]} onChange={e=>setPeriodRooms(prev=>({...prev,[p]:e.target.value}))}
                      className="w-full border border-orange-200 rounded-xl px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white">
                      <option value="">—</option>
                      {rooms.map(r=><option key={r.id} value={r.id}>{r.room_number}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
            {saveMsg && <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2 text-sm text-green-800">{saveMsg}</div>}
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving} className="bg-bear-orange hover:bg-orange-600 disabled:opacity-60 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors">
                {saving?'Saving…':editId?'Save Changes':'Add Student'}
              </button>
              <button onClick={()=>setShowEdit(false)} className="text-sm text-bear-muted hover:text-bear-dark px-4 py-2">Cancel</button>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="card flex flex-wrap gap-3">
          <input type="text" placeholder="Search name or ID…" value={search} onChange={e=>setSearch(e.target.value)}
            className="border border-orange-200 rounded-xl px-4 py-2 text-sm flex-1 min-w-36 focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white" />
          <select value={gradeFilter} onChange={e=>setGradeFilter(e.target.value)} className="border border-orange-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white">
            <option value="">All Grades</option><option value="7">Grade 7</option><option value="8">Grade 8</option>
          </select>
          <select value={roomFilter} onChange={e=>setRoomFilter(e.target.value)} className="border border-orange-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white">
            <option value="">All Rooms</option>
            {rooms.map(r=><option key={r.id} value={r.id}>{r.room_number} · {r.teacher_name}</option>)}
          </select>
        </div>

        {/* Table */}
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-orange-100">
              {['Name','ID','Gr','Room','P1','P2','P3','P4','P5','P6','Flags',''].map(h=>(
                <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-bear-muted uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtered.map(s=>(
                <tr key={s.id} className="border-b border-orange-50 hover:bg-orange-50/40 transition-colors">
                  <td className="px-3 py-2.5 font-medium text-bear-dark whitespace-nowrap">{s.first_name} {s.last_name}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-bear-muted">{s.student_id??'—'}</td>
                  <td className="px-3 py-2.5 text-bear-muted">{s.grade??'—'}</td>
                  <td className="px-3 py-2.5 text-bear-muted">{s.room?.room_number??'—'}</td>
                  {[1,2,3,4,5,6].map(p=>(
                    <td key={p} className="px-3 py-2.5 text-bear-muted text-xs whitespace-nowrap">
                      {s.periods?.[p] || <span className="text-gray-300">—</span>}
                    </td>
                  ))}
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1.5">
                      <button onClick={()=>toggleFlag(s.id,'no_roam',!s.no_roam)} className={`text-xs px-1.5 py-0.5 rounded-full font-semibold border transition-all ${s.no_roam?'bg-red-100 text-red-800 border-red-200':'bg-gray-50 text-gray-400 border-gray-200 hover:border-red-200'}`}>🚫</button>
                      <button onClick={()=>toggleFlag(s.id,'watch_list',!s.watch_list)} className={`text-xs px-1.5 py-0.5 rounded-full font-semibold border transition-all ${s.watch_list?'bg-amber-100 text-amber-800 border-amber-200':'bg-gray-50 text-gray-400 border-gray-200 hover:border-amber-200'}`}>⚠</button>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <button onClick={()=>openEdit(s)} className="text-xs text-bear-orange hover:text-orange-600 font-semibold">Edit</button>
                  </td>
                </tr>
              ))}
              {filtered.length===0&&<tr><td colSpan={12} className="px-4 py-10 text-center text-bear-muted">No students found</td></tr>}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
