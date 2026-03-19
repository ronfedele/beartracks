'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import Nav from '@/components/Nav'
import type { Room, UserProfile } from '@/lib/types'

export default function AdminRoomsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ room_number: '', room_email: '', teacher_name: '', teacher_email: '', bell_schedule: '7', grade_group: '' })
  const [saving, setSaving] = useState(false)
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/'; return }
      const { data: prof } = await supabase.from('user_profiles').select('*').eq('id', user.id).maybeSingle()
      if (prof?.role !== 'admin') { window.location.href = '/'; return }
      setProfile(prof as any)
      await loadRooms(supabase)
      setLoading(false)
    }
    init()
  }, [])

  async function loadRooms(supabase?: any) {
    const sb = supabase ?? createClient()
    const { data } = await sb.from('rooms').select('*').order('room_number')
    setRooms(data ?? [])
    // Count students per room
    const { data: studs } = await sb.from('students').select('room_id').eq('active', true)
    const counts: Record<string, number> = {}
    ;(studs ?? []).forEach((s: any) => { if (s.room_id) counts[s.room_id] = (counts[s.room_id] ?? 0) + 1 })
    setStudentCounts(counts)
  }

  async function handleSave() {
    if (!form.room_number || !form.room_email || !form.teacher_name) return
    setSaving(true)
    const supabase = createClient()
    const payload = {
      room_number: form.room_number,
      room_email: form.room_email,
      teacher_name: form.teacher_name,
      teacher_email: form.teacher_email,
      bell_schedule: parseInt(form.bell_schedule) as 7 | 8,
      grade_group: form.grade_group || null,
    }
    if (editId) {
      await supabase.from('rooms').update(payload).eq('id', editId)
    } else {
      await supabase.from('rooms').insert(payload)
    }
    await loadRooms()
    setShowAdd(false)
    setEditId(null)
    setForm({ room_number: '', room_email: '', teacher_name: '', teacher_email: '', bell_schedule: '7', grade_group: '' })
    setSaving(false)
  }

  function startEdit(r: Room) {
    setEditId(r.id)
    setForm({ room_number: r.room_number, room_email: r.room_email, teacher_name: r.teacher_name, teacher_email: r.teacher_email, bell_schedule: r.bell_schedule.toString(), grade_group: r.grade_group ?? '' })
    setShowAdd(true)
  }

  if (loading) return <div className="min-h-screen bg-bear-cream flex items-center justify-center"><div className="text-bear-muted">Loading…</div></div>

  return (
    <div className="min-h-screen bg-bear-cream">
      <Nav role="admin" displayName={profile?.display_name ?? profile?.email} />
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-5">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-3xl font-display font-black text-bear-dark">Rooms</h1>
            <p className="text-bear-muted mt-1">{rooms.length} classrooms configured</p>
          </div>
          <button onClick={() => { setShowAdd(true); setEditId(null); setForm({ room_number: '', room_email: '', teacher_name: '', teacher_email: '', bell_schedule: '7', grade_group: '' }) }}
            className="ml-auto bg-bear-orange hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
            + Add Room
          </button>
        </div>

        {showAdd && (
          <div className="card border-2 border-bear-orange space-y-4">
            <h2 className="font-bold text-bear-dark">{editId ? 'Edit Room' : 'Add Room'}</h2>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
              {[['room_number','Room Number (e.g. Rm 2)'],['room_email','Room Email'],['teacher_name','Teacher Name'],['teacher_email','Teacher Email'],['grade_group','Grade Group (7th/8th)']].map(([k, label]) => (
                <div key={k}>
                  <label className="block text-xs font-semibold text-bear-muted mb-1 uppercase tracking-widest">{label}</label>
                  <input value={(form as any)[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                    className="w-full border border-orange-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white" />
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-bear-muted mb-1 uppercase tracking-widest">Bell Schedule Group</label>
                <select value={form.bell_schedule} onChange={e => setForm(f => ({ ...f, bell_schedule: e.target.value }))}
                  className="w-full border border-orange-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white">
                  <option value="7">Group 7 (7th grade schedule)</option>
                  <option value="8">Group 8 (8th grade schedule)</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving} className="bg-bear-orange hover:bg-orange-600 disabled:opacity-60 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors">
                {saving ? 'Saving…' : editId ? 'Save Changes' : 'Add Room'}
              </button>
              <button onClick={() => { setShowAdd(false); setEditId(null) }} className="text-sm text-bear-muted hover:text-bear-dark px-4 py-2">Cancel</button>
            </div>
          </div>
        )}

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rooms.map(r => (
            <div key={r.id} className="card hover:border-orange-200 transition-all">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-xl font-display font-bold text-bear-dark">{r.room_number}</div>
                  <div className="text-bear-muted font-medium text-sm">{r.teacher_name}</div>
                </div>
                <span className="text-xs bg-orange-100 text-bear-orange font-semibold px-2 py-0.5 rounded-full">
                  Group {r.bell_schedule}
                </span>
              </div>
              <div className="space-y-1 text-xs text-bear-muted">
                <div className="font-mono">{r.room_email}</div>
                <div>{r.teacher_email}</div>
                {r.grade_group && <div className="font-semibold">{r.grade_group}</div>}
                <div className="text-bear-orange font-semibold mt-1">{studentCounts[r.id] ?? 0} students</div>
              </div>
              <button onClick={() => startEdit(r)} className="mt-3 text-xs text-bear-orange hover:text-orange-600 font-semibold">Edit →</button>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
