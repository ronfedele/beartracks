'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import Nav from '@/components/Nav'
import type { Student, Room, UserProfile } from '@/lib/types'

const EMPTY_FORM = { first_name:'', last_name:'', grade:'', student_id:'', room_id:'', no_roam:false, watch_list:false }
const EMPTY_PERIODS: Record<number, string> = {1:'',2:'',3:'',4:'',5:'',6:''}

export default function AdminStudentsPage() {
  const [profile, setProfile] = useState<UserProfile|null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roomFilter, setRoomFilter] = useState('')
  const [gradeFilter, setGradeFilter] = useState('')

  // Edit state
  const [editId, setEditId] = useState<string|null>(null)
  const [showEdit, setShowEdit] = useState(false)
  const [form, setForm] = useState({...EMPTY_FORM})
  const [periodRooms, setPeriodRooms] = useState<Record<number,string>>({...EMPTY_PERIODS})
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const [importStatus, setImportStatus] = useState('')
  const [canUpload, setCanUpload] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data:{user} } = await supabase.auth.getUser()
      if (!user) { window.location.href='/'; return }
      const { data:prof } = await supabase.from('user_profiles').select('*').eq('id',user.id).maybeSingle()
      if (prof?.role!=='admin') { window.location.href='/'; return }
      setProfile(prof as any)
      setCanUpload(prof.role === 'admin' || prof.can_upload_students === true)
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
      sb.from('student_schedules').select('student_id, period, room_id, room:rooms(room_number)'),
    ])
    // Attach period assignments to each student
    const schedMap: Record<string, Record<number, string>> = {}
    ;(scheds??[]).forEach((sc: any) => {
      if (!schedMap[sc.student_id]) schedMap[sc.student_id] = {}
      schedMap[sc.student_id][sc.period] = sc.room?.room_number ?? ''
    })
    const enriched = (studs??[]).map((s: any) => ({ ...s, periods: schedMap[s.id] ?? {} }))
    setStudents(enriched)
    setRooms(rms??[])
  }

  async function openEdit(s?: Student) {
    setSaveMsg('')
    if (s) {
      setEditId(s.id)
      setForm({ first_name:s.first_name, last_name:s.last_name, grade:s.grade?.toString()??'', student_id:s.student_id??'', room_id:s.room_id??'', no_roam:s.no_roam, watch_list:s.watch_list })
      // Load period assignments
      const supabase = createClient()
      const { data:scheds } = await supabase.from('student_schedules').select('period,room_id').eq('student_id', s.id)
      const pr: Record<number,string> = {1:'',2:'',3:'',4:'',5:'',6:''}
      ;(scheds??[]).forEach((sc:any) => { pr[sc.period] = sc.room_id??'' })
      setPeriodRooms(pr)
    } else {
      setEditId(null)
      setForm({...EMPTY_FORM})
      setPeriodRooms({...EMPTY_PERIODS})
    }
    setShowEdit(true)
  }

  async function handleSave() {
    if (!form.first_name||!form.last_name) return
    setSaving(true); setSaveMsg('')
    const supabase = createClient()
    const payload = {
      first_name:form.first_name, last_name:form.last_name,
      grade:form.grade?parseInt(form.grade):null,
      student_id:form.student_id||null, room_id:form.room_id||null,
      no_roam:form.no_roam, watch_list:form.watch_list,
    }

    let studentId = editId
    if (editId) {
      await supabase.from('students').update(payload).eq('id', editId)
    } else {
      const { data:newS } = await supabase.from('students').insert(payload).select('id').single()
      studentId = newS?.id ?? null
    }

    // Save period schedule
    if (studentId) {
      await supabase.from('student_schedules').delete().eq('student_id', studentId)
      const inserts = Object.entries(periodRooms)
        .filter(([,roomId]) => roomId)
        .map(([period, roomId]) => {
          const r = rooms.find(x=>x.id===roomId)
          return { student_id:studentId, period:parseInt(period), room_id:roomId, group_num:r?.bell_schedule??null }
        })
      if (inserts.length>0) await supabase.from('student_schedules').insert(inserts)
    }

    await loadAll()
    setSaveMsg('✅ Saved')
    setSaving(false)
    setTimeout(() => { setShowEdit(false); setEditId(null) }, 800)
  }

  async function toggleFlag(id: string, field: 'no_roam'|'watch_list', val: boolean) {
    const supabase = createClient()
    await supabase.from('students').update({ [field]:val }).eq('id', id)
    setStudents(prev=>prev.map(s=>s.id===id?{...s,[field]:val}:s))
  }

  async function handleImportCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setImportStatus('Parsing…')
    const text = await file.text()
    const lines = text.trim().split('\n')
    const headers = lines[0].toLowerCase().split(',').map(h=>h.trim().replace(/"/g,''))
    const rows = lines.slice(1).map(line=>{ const vals=line.split(',').map(v=>v.trim().replace(/"/g,'')); return Object.fromEntries(headers.map((h,i)=>[h,vals[i]??''])) })
    const supabase = createClient()
    const roomMap: Record<string,string> = {}; rooms.forEach(r=>{ roomMap[r.room_number.toLowerCase()]=r.id })
    const records = rows.map(r=>({ first_name:r['first name']||r['firstname']||r['first_name']||'', last_name:r['last name']||r['lastname']||r['last_name']||'', student_id:r['student id']||r['student_id']||r['id']||null, grade:r['grade']?parseInt(r['grade']):null, room_id:roomMap[(r['room']||r['room number']||'').toLowerCase()]??null, active:true })).filter(r=>r.first_name&&r.last_name)
    const { error } = await supabase.from('students').upsert(records, { onConflict:'student_id', ignoreDuplicates:false })
    setImportStatus(error?`Error: ${error.message}`:`Imported ${records.length} students ✓`)
    await loadAll(); if (fileRef.current) fileRef.current.value=''
  }

  const filtered = students.filter(s=>{
    const name=`${s.first_name} ${s.last_name} ${s.student_id??''}`.toLowerCase()
    return (!search||name.includes(search.toLowerCase())) && (!roomFilter||s.room_id===roomFilter) && (!gradeFilter||s.grade?.toString()===gradeFilter)
  })

  if (loading) return <div className="min-h-screen bg-bear-cream flex items-center justify-center"><div className="text-bear-muted">Loading…</div></div>

  return (
    <div className="min-h-screen bg-bear-cream">
      <Nav role="admin" displayName={profile?.display_name??profile?.email} />
      <main className="max-w-7xl mx-auto px-4 py-8 space-y-5">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-display font-black text-bear-dark">Students</h1>
            <p className="text-bear-muted mt-1">{filtered.length} of {students.length} students</p>
          </div>
          <div className="ml-auto flex gap-2 flex-wrap">
            {canUpload && (
              <label className="bg-white border border-orange-200 hover:border-orange-400 text-bear-dark text-sm font-semibold px-4 py-2 rounded-xl cursor-pointer transition-colors">
                Import CSV
                <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleImportCSV} />
              </label>
            )}
            <button onClick={()=>openEdit()} className="bg-bear-orange hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">+ Add Student</button>
          </div>
        </div>
        {importStatus&&<div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2 text-sm text-green-800">{importStatus}</div>}

        {/* Edit/Add slide-in panel */}
        {showEdit&&(
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

            {/* Homeroom + flags */}
            <div className="grid sm:grid-cols-2 gap-4 items-end">
              <div>
                <label className="block text-xs font-semibold text-bear-muted mb-1 uppercase tracking-widest">Homeroom</label>
                <select value={form.room_id} onChange={e=>setForm(f=>({...f,room_id:e.target.value}))}
                  className="w-full border border-orange-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white">
                  <option value="">— No Room —</option>
                  {rooms.map(r=><option key={r.id} value={r.id}>{r.room_number} · {r.teacher_name}</option>)}
                </select>
              </div>
              <div className="flex gap-4 pb-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.no_roam} onChange={e=>setForm(f=>({...f,no_roam:e.target.checked}))} className="accent-red-600" />
                  <span className="text-sm font-medium text-red-700">🚫 No Roam</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.watch_list} onChange={e=>setForm(f=>({...f,watch_list:e.target.checked}))} className="accent-amber-600" />
                  <span className="text-sm font-medium text-amber-700">⚠ Watch List</span>
                </label>
              </div>
            </div>

            {/* Period schedule */}
            <div>
              <div className="text-xs font-semibold text-bear-muted uppercase tracking-widest mb-3">Period Schedule (Rooms for P1–P6)</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[1,2,3,4,5,6].map(p=>(
                  <div key={p}>
                    <label className="block text-xs font-semibold text-bear-muted mb-1">Period {p}</label>
                    <select value={periodRooms[p]} onChange={e=>setPeriodRooms(prev=>({...prev,[p]:e.target.value}))}
                      className="w-full border border-orange-200 rounded-xl px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white">
                      <option value="">— None —</option>
                      {rooms.map(r=><option key={r.id} value={r.id}>{r.room_number}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {saveMsg&&<div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2 text-sm text-green-800">{saveMsg}</div>}

            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving}
                className="bg-bear-orange hover:bg-orange-600 disabled:opacity-60 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors">
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
          <select value={gradeFilter} onChange={e=>setGradeFilter(e.target.value)}
            className="border border-orange-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white">
            <option value="">All Grades</option>
            <option value="7">Grade 7</option>
            <option value="8">Grade 8</option>
          </select>
          <select value={roomFilter} onChange={e=>setRoomFilter(e.target.value)}
            className="border border-orange-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white">
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
              {filtered.map(s=>{
                const schedMap: Record<number,string> = {}
                // We need to show period rooms in the table — stored in student_schedules
                // We'll show them from the students list (pre-load needed for display)
                return (
                  <tr key={s.id} className="border-b border-orange-50 hover:bg-orange-50/40 transition-colors">
                    <td className="px-3 py-2.5 font-medium text-bear-dark whitespace-nowrap">{s.first_name} {s.last_name}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-bear-muted">{s.student_id??'—'}</td>
                    <td className="px-3 py-2.5 text-bear-muted">{s.grade??'—'}</td>
                    <td className="px-3 py-2.5 text-bear-muted">{(s.room as any)?.room_number??'—'}</td>
                    {[1,2,3,4,5,6].map(p=>(
                      <td key={p} className="px-3 py-2.5 text-bear-muted text-xs whitespace-nowrap">
                        {(s as any).periods?.[p] || <span className="text-gray-300">—</span>}
                      </td>
                    ))}
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1.5">
                        <button onClick={()=>toggleFlag(s.id,'no_roam',!s.no_roam)}
                          className={`text-xs px-1.5 py-0.5 rounded-full font-semibold border transition-all ${s.no_roam?'bg-red-100 text-red-800 border-red-200':'bg-gray-50 text-gray-400 border-gray-200 hover:border-red-200'}`}>🚫</button>
                        <button onClick={()=>toggleFlag(s.id,'watch_list',!s.watch_list)}
                          className={`text-xs px-1.5 py-0.5 rounded-full font-semibold border transition-all ${s.watch_list?'bg-amber-100 text-amber-800 border-amber-200':'bg-gray-50 text-gray-400 border-gray-200 hover:border-amber-200'}`}>⚠</button>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <button onClick={()=>openEdit(s)} className="text-xs text-bear-orange hover:text-orange-600 font-semibold">Edit</button>
                    </td>
                  </tr>
                )
              })}
              {filtered.length===0&&<tr><td colSpan={12} className="px-4 py-10 text-center text-bear-muted">No students found</td></tr>}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
