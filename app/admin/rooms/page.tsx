'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import Nav from '@/components/Nav'
import type { Room, UserProfile } from '@/lib/types'

const PERIOD_LABELS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']
const VARIED_FIELDS = ['p1_group','p2_group','p3_group','p4_group','p5_group','p6_group'] as const

export default function AdminRoomsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ room_number: '', room_email: '', teacher_name: '', teacher_email: '', bell_schedule: '7' })
  const [saving, setSaving] = useState(false)
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({})
  const [variedConfigs, setVariedConfigs] = useState<Record<string, any>>({})
  const [editingVaried, setEditingVaried] = useState<string | null>(null)
  const [variedForm, setVariedForm] = useState<Record<string, number>>({})

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
    const [{ data }, { data: studs }, { data: varConfigs }] = await Promise.all([
      sb.from('rooms').select('*').order('room_number'),
      sb.from('students').select('room_id').eq('active', true),
      sb.from('varied_schedule_config').select('*'),
    ])
    setRooms(data ?? [])
    const counts: Record<string, number> = {}
    ;(studs ?? []).forEach((s: any) => { if (s.room_id) counts[s.room_id] = (counts[s.room_id] ?? 0) + 1 })
    setStudentCounts(counts)
    const vcMap: Record<string, any> = {}
    ;(varConfigs ?? []).forEach((v: any) => { vcMap[v.room_id] = v })
    setVariedConfigs(vcMap)
  }

  async function handleSave() {
    if (!form.room_number || !form.room_email || !form.teacher_name) return
    setSaving(true)
    const supabase = createClient()
    const bellSchedule = form.bell_schedule === 'varied' ? 9 : parseInt(form.bell_schedule)
    const payload = { room_number: form.room_number, room_email: form.room_email, teacher_name: form.teacher_name, teacher_email: form.teacher_email, bell_schedule: bellSchedule }
    if (editId) {
      await supabase.from('rooms').update(payload).eq('id', editId)
    } else {
      await supabase.from('rooms').insert(payload)
    }
    await loadRooms()
    setShowAdd(false); setEditId(null)
    setForm({ room_number: '', room_email: '', teacher_name: '', teacher_email: '', bell_schedule: '7' })
    setSaving(false)
  }

  function startEdit(r: Room) {
    setEditId(r.id)
    setForm({
      room_number: r.room_number, room_email: r.room_email, teacher_name: r.teacher_name,
      teacher_email: r.teacher_email,
      bell_schedule: r.bell_schedule === 9 ? 'varied' : r.bell_schedule.toString(),
    })
    setShowAdd(true)
  }

  function startVariedEdit(room: Room) {
    const existing = variedConfigs[room.id]
    setEditingVaried(room.id)
    setVariedForm({
      p1_group: existing?.p1_group ?? 7, p2_group: existing?.p2_group ?? 7,
      p3_group: existing?.p3_group ?? 7, p4_group: existing?.p4_group ?? 7,
      p5_group: existing?.p5_group ?? 7, p6_group: existing?.p6_group ?? 7,
    })
  }

  async function saveVariedConfig() {
    if (!editingVaried) return
    const supabase = createClient()
    await supabase.from('varied_schedule_config').upsert({ room_id: editingVaried, ...variedForm, updated_at: new Date().toISOString() }, { onConflict: 'room_id' })
    await loadRooms()
    setEditingVaried(null)
  }

  const bellLabel = (bs: number) => bs === 9 ? 'Varied' : `Group ${bs}`

  if (loading) return <div className="min-h-screen bg-bear-cream flex items-center justify-center"><div className="text-bear-muted">Loading…</div></div>

  return (
    <div className="min-h-screen bg-bear-cream">
      <Nav role="admin" displayName={profile?.display_name ?? profile?.email} />
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-5">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-3xl font-display font-black text-bear-dark">Rooms</h1>
            <p className="text-bear-muted mt-1">{rooms.length} classrooms</p>
          </div>
          <button onClick={() => { setShowAdd(true); setEditId(null); setForm({ room_number:'',room_email:'',teacher_name:'',teacher_email:'',bell_schedule:'7' }) }}
            className="ml-auto bg-bear-orange hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
            + Add Room
          </button>
        </div>

        {/* Varied config modal */}
        {editingVaried && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
              <h2 className="text-xl font-display font-bold text-bear-dark">Varied Schedule Config</h2>
              <p className="text-sm text-bear-muted">Choose which bell group (7 or 8) to use for each period's start/end times.</p>
              <div className="space-y-3">
                {VARIED_FIELDS.map((field, i) => (
                  <div key={field} className="flex items-center gap-3">
                    <span className="w-8 text-sm font-bold text-bear-dark">{PERIOD_LABELS[i]}</span>
                    <div className="flex gap-2">
                      {[7, 8].map(g => (
                        <button key={g} type="button"
                          onClick={() => setVariedForm(f => ({ ...f, [field]: g }))}
                          className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${variedForm[field] === g ? 'bg-bear-orange text-white' : 'bg-gray-100 text-gray-600 hover:bg-orange-50'}`}>
                          Group {g}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={saveVariedConfig} className="flex-1 bg-bear-orange hover:bg-orange-600 text-white text-sm font-semibold py-2.5 rounded-xl">Save</button>
                <button onClick={() => setEditingVaried(null)} className="text-sm text-bear-muted px-4 py-2">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {showAdd && (
          <div className="card border-2 border-bear-orange space-y-4">
            <h2 className="font-bold text-bear-dark">{editId ? 'Edit Room' : 'Add Room'}</h2>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
              {[['room_number','Room Number'],['room_email','Room Email'],['teacher_name','Teacher Name'],['teacher_email','Teacher Email'],].map(([k, label]) => (
                <div key={k}>
                  <label className="block text-xs font-semibold text-bear-muted mb-1 uppercase tracking-widest">{label}</label>
                  <input value={(form as any)[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                    className="w-full border border-orange-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white" />
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-bear-muted mb-1 uppercase tracking-widest">Bell Schedule</label>
                <select value={form.bell_schedule} onChange={e => setForm(f => ({ ...f, bell_schedule: e.target.value }))}
                  className="w-full border border-orange-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white">
                  <option value="7">Group 7 (7th grade times)</option>
                  <option value="8">Group 8 (8th grade times)</option>
                  <option value="varied">Varied (mix per period)</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving} className="bg-bear-orange hover:bg-orange-600 disabled:opacity-60 text-white text-sm font-semibold px-5 py-2 rounded-xl">
                {saving ? 'Saving…' : editId ? 'Save' : 'Add Room'}
              </button>
              <button onClick={() => { setShowAdd(false); setEditId(null) }} className="text-sm text-bear-muted px-4 py-2">Cancel</button>
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
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${r.bell_schedule === 9 ? 'bg-purple-100 text-purple-800' : 'bg-orange-100 text-bear-orange'}`}>
                  {bellLabel(r.bell_schedule)}
                </span>
              </div>
              <div className="space-y-1 text-xs text-bear-muted">
                <div className="font-mono">{r.room_email}</div>
                <div className="text-bear-orange font-semibold">{studentCounts[r.id] ?? 0} students</div>
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={() => startEdit(r)} className="text-xs text-bear-orange hover:text-orange-600 font-semibold">Edit</button>
                {r.bell_schedule === 9 && (
                  <button onClick={() => startVariedEdit(r)} className="text-xs text-purple-600 hover:text-purple-800 font-semibold">
                    {variedConfigs[r.id] ? '⚙ Varied Config' : '+ Set Varied Config'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
