'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import Nav from '@/components/Nav'
import type { Student, Room, UserProfile } from '@/lib/types'

interface StudentSchedule {
  student_id: string
  period: number
  room_id: string | null
  group_num: number | null
}

export default function AdminSchedulesPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [schedules, setSchedules] = useState<StudentSchedule[]>([])
  const [search, setSearch] = useState('')
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [periodRooms, setPeriodRooms] = useState<Record<number, string>>({1:'',2:'',3:'',4:'',5:'',6:''})
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/'; return }
      const { data: prof } = await supabase.from('user_profiles').select('*').eq('id', user.id).maybeSingle()
      if (prof?.role !== 'admin') { window.location.href = '/'; return }
      setProfile(prof as any)

      const [{ data: studs }, { data: rms }, { data: scheds }] = await Promise.all([
        supabase.from('students').select('*, room:rooms(room_number,teacher_name)').eq('active', true).order('last_name'),
        supabase.from('rooms').select('*').order('room_number'),
        supabase.from('student_schedules').select('*'),
      ])
      setStudents(studs ?? [])
      setRooms(rms ?? [])
      setSchedules(scheds ?? [])
      setLoading(false)
    }
    init()
  }, [])

  function loadStudentSchedule(student: Student) {
    setSelectedStudent(student)
    setSaveMsg('')
    const pr: Record<number, string> = {1:'',2:'',3:'',4:'',5:'',6:''}
    schedules.filter(s => s.student_id === student.id).forEach(s => {
      pr[s.period] = s.room_id ?? ''
    })
    setPeriodRooms(pr)
  }

  async function handleSave() {
    if (!selectedStudent) return
    setSaving(true)
    setSaveMsg('')
    const supabase = createClient()

    const upserts = Object.entries(periodRooms)
      .filter(([, roomId]) => roomId)
      .map(([period, roomId]) => {
        const room = rooms.find(r => r.id === roomId)
        return {
          student_id: selectedStudent.id,
          period: parseInt(period),
          room_id: roomId || null,
          group_num: room?.bell_schedule ?? null,
        }
      })

    // Delete existing then insert
    await supabase.from('student_schedules').delete().eq('student_id', selectedStudent.id)
    if (upserts.length > 0) {
      await supabase.from('student_schedules').insert(upserts)
    }

    // Refresh local schedules
    const { data: fresh } = await supabase.from('student_schedules').select('*')
    setSchedules(fresh ?? [])
    setSaveMsg('✅ Schedule saved')
    setSaving(false)
  }

  const filteredStudents = students.filter(s => {
    const name = `${s.first_name} ${s.last_name}`.toLowerCase()
    return !search || name.includes(search.toLowerCase())
  })

  // Get a quick summary of periods assigned for a student
  function getScheduleSummary(studentId: string) {
    const stuSchedules = schedules.filter(s => s.student_id === studentId)
    if (stuSchedules.length === 0) return null
    return `${stuSchedules.length}/6 periods`
  }

  if (loading) return <div className="min-h-screen bg-bear-cream flex items-center justify-center"><div className="text-bear-muted">Loading…</div></div>

  return (
    <div className="min-h-screen bg-bear-cream">
      <Nav role="admin" displayName={profile?.display_name ?? profile?.email} />
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-display font-black text-bear-dark">Student Schedules</h1>
          <p className="text-bear-muted mt-1">Assign each student's room for periods 1–6. Teachers only see their class for the current period.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Student list */}
          <div className="card flex flex-col gap-3" style={{maxHeight: '70vh'}}>
            <input
              type="text"
              placeholder="Search students…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="border border-orange-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white"
            />
            <div className="overflow-y-auto flex-1 space-y-1">
              {filteredStudents.map(s => {
                const summary = getScheduleSummary(s.id)
                const isSelected = selectedStudent?.id === s.id
                return (
                  <div
                    key={s.id}
                    onClick={() => loadStudentSchedule(s)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${isSelected ? 'bg-bear-orange text-white' : 'hover:bg-orange-50'}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium truncate ${isSelected ? 'text-white' : 'text-bear-dark'}`}>
                        {s.first_name} {s.last_name}
                      </div>
                      <div className={`text-xs ${isSelected ? 'text-white/70' : 'text-bear-muted'}`}>
                        Grade {s.grade} {summary ? `· ${summary}` : '· no schedule'}
                      </div>
                    </div>
                    {summary && (
                      <span className={`text-xs font-semibold ${isSelected ? 'text-white/80' : 'text-green-600'}`}>✓</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Period assignment */}
          <div className="card space-y-4">
            {!selectedStudent ? (
              <div className="text-center py-16 text-bear-muted">
                <div className="text-4xl mb-3">👤</div>
                <div className="text-sm">Select a student to assign their schedule</div>
              </div>
            ) : (
              <>
                <div>
                  <h2 className="text-xl font-display font-bold text-bear-dark">
                    {selectedStudent.first_name} {selectedStudent.last_name}
                  </h2>
                  <p className="text-bear-muted text-sm">Grade {selectedStudent.grade} · Assign a room for each period</p>
                </div>

                <div className="space-y-3">
                  {[1,2,3,4,5,6].map(p => (
                    <div key={p} className="flex items-center gap-3">
                      <div className="w-20 shrink-0">
                        <span className="text-sm font-bold text-bear-dark">Period {p}</span>
                      </div>
                      <select
                        value={periodRooms[p]}
                        onChange={e => setPeriodRooms(prev => ({ ...prev, [p]: e.target.value }))}
                        className="flex-1 border border-orange-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white"
                      >
                        <option value="">— Not assigned —</option>
                        {rooms.map(r => (
                          <option key={r.id} value={r.id}>
                            {r.room_number} · {r.teacher_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                {saveMsg && (
                  <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2 text-sm text-green-800">
                    {saveMsg}
                  </div>
                )}

                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full bg-bear-orange hover:bg-orange-600 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors"
                >
                  {saving ? 'Saving…' : 'Save Schedule'}
                </button>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
