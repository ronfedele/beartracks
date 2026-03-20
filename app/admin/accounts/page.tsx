'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import Nav from '@/components/Nav'
import type { Room, UserProfile } from '@/lib/types'

interface Account {
  id: string
  email: string
  role: string
  display_name: string | null
  room_id: string | null
  can_upload_students: boolean
  same_room_all_day: boolean
  room?: { room_number: string; teacher_name: string } | null
}

interface PeriodRoom { period: number; room_id: string }

const ROLE_COLORS: Record<string, string> = {
  admin:    'bg-purple-100 text-purple-800 border-purple-200',
  monitor:  'bg-blue-100 text-blue-800 border-blue-200',
  teacher:  'bg-green-100 text-green-800 border-green-200',
  terminal: 'bg-gray-100 text-gray-600 border-gray-200',
}

export default function AdminAccountsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')

  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<Account> & { same_room_all_day: boolean }>({
    same_room_all_day: true
  })
  const [periodRooms, setPeriodRooms] = useState<Record<number, string>>({1:'',2:'',3:'',4:'',5:'',6:''})
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [newPw, setNewPw] = useState('')
  const [pwMsg, setPwMsg] = useState('')
  const [pwSaving, setPwSaving] = useState(false)

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/'; return }
      const { data: prof } = await supabase.from('user_profiles').select('*').eq('id', user.id).maybeSingle()
      if (prof?.role !== 'admin') { window.location.href = '/'; return }
      setProfile(prof as any)
      await loadAll(supabase)
      setLoading(false)
    }
    init()
  }, [])

  async function loadAll(supabase?: any) {
    const sb = supabase ?? createClient()
    const [{ data: accts }, { data: rms }] = await Promise.all([
      sb.from('user_profiles').select('*, room:rooms(room_number, teacher_name)').order('role').order('email'),
      sb.from('rooms').select('*').order('room_number'),
    ])
    setAccounts(accts ?? [])
    setRooms(rms ?? [])
  }

  async function startEdit(acct: Account) {
    setEditId(acct.id)
    setEditForm({ ...acct, same_room_all_day: acct.same_room_all_day !== false })
    setSaveMsg(''); setNewPw(''); setPwMsg('')

    // Load per-period rooms for this teacher
    const supabase = createClient()
    const { data: tpr } = await supabase
      .from('teacher_period_rooms')
      .select('period, room_id')
      .eq('teacher_id', acct.id)
    const pr: Record<number, string> = {1:'',2:'',3:'',4:'',5:'',6:''}
    ;(tpr ?? []).forEach((r: any) => { pr[r.period] = r.room_id ?? '' })
    setPeriodRooms(pr)
  }

  async function handleSave() {
    if (!editId) return
    setSaving(true); setSaveMsg('')
    const supabase = createClient()

    const { error } = await supabase.from('user_profiles').update({
      display_name:       editForm.display_name,
      role:               editForm.role,
      room_id:            editForm.room_id || null,
      can_upload_students: editForm.can_upload_students ?? false,
      same_room_all_day:  editForm.same_room_all_day ?? true,
    }).eq('id', editId)

    if (error) { setSaveMsg(`Error: ${error.message}`); setSaving(false); return }

    // Save per-period rooms if teacher and not same room all day
    if (editForm.role === 'teacher' && !editForm.same_room_all_day) {
      await supabase.from('teacher_period_rooms').delete().eq('teacher_id', editId)
      const inserts = Object.entries(periodRooms)
        .filter(([, r]) => r)
        .map(([period, room_id]) => ({ teacher_id: editId, period: parseInt(period), room_id }))
      if (inserts.length > 0) await supabase.from('teacher_period_rooms').insert(inserts)
    } else {
      // Clear period rooms if switching back to same room all day
      await supabase.from('teacher_period_rooms').delete().eq('teacher_id', editId)
    }

    setSaveMsg('✅ Saved')
    await loadAll()
    setSaving(false)
  }

  async function handlePwReset(e: React.FormEvent) {
    e.preventDefault()
    if (!editId || newPw.length < 8) { setPwMsg('Min 8 characters'); return }
    setPwSaving(true); setPwMsg('')
    const supabase = createClient()
    const acct = accounts.find(a => a.id === editId)
    if (acct?.role === 'terminal') {
      const { error } = await supabase.rpc('admin_reset_terminal_passwords')
      setPwMsg(error ? `Error: ${error.message}` : '✅ All terminal passwords reset')
    } else {
      const { error } = await supabase.rpc('admin_set_user_password', { target_user_id: editId, new_password: newPw })
      setPwMsg(error ? `Error: ${error.message}` : '✅ Password updated')
    }
    setNewPw('')
    setPwSaving(false)
  }

  const filtered = accounts.filter(a => {
    const txt = `${a.email} ${a.display_name ?? ''}`.toLowerCase()
    return (!search || txt.includes(search.toLowerCase())) && (!roleFilter || a.role === roleFilter)
  })

  const editAcct = accounts.find(a => a.id === editId)

  if (loading) return <div className="min-h-screen bg-bear-cream flex items-center justify-center"><div className="text-bear-muted">Loading…</div></div>

  return (
    <div className="min-h-screen bg-bear-cream">
      <Nav role="admin" displayName={profile?.display_name ?? profile?.email} />
      <main className="max-w-7xl mx-auto px-4 py-8 space-y-5">

        <div>
          <h1 className="text-3xl font-display font-black text-bear-dark">Accounts</h1>
          <p className="text-bear-muted mt-1">
            {accounts.length} accounts · {accounts.filter(a => a.role === 'teacher').length} teachers · {accounts.filter(a => a.role === 'terminal').length} terminals
          </p>
        </div>

        {/* Filters */}
        <div className="card flex flex-wrap gap-3">
          <input type="text" placeholder="Search email or name…" value={search} onChange={e => setSearch(e.target.value)}
            className="border border-orange-200 rounded-xl px-4 py-2 text-sm flex-1 min-w-48 focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white" />
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
            className="border border-orange-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white">
            <option value="">All Roles</option>
            <option value="admin">Admin</option>
            <option value="monitor">Monitor</option>
            <option value="teacher">Teacher</option>
            <option value="terminal">Terminal</option>
          </select>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Account list */}
          <div className="lg:col-span-2 card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-orange-100">
                {['Account', 'Role', 'Room', 'Upload', 'Schedule', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-bear-muted uppercase tracking-wider">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {filtered.map(a => (
                  <tr key={a.id} className={`border-b border-orange-50 transition-colors ${editId === a.id ? 'bg-orange-50' : 'hover:bg-orange-50/40'}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-bear-dark">{a.display_name || '—'}</div>
                      <div className="text-xs text-bear-muted font-mono">{a.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${ROLE_COLORS[a.role] ?? ''}`}>{a.role}</span>
                    </td>
                    <td className="px-4 py-3 text-bear-muted text-xs">{(a.room as any)?.room_number ?? '—'}</td>
                    <td className="px-4 py-3">
                      {(a.role === 'teacher' || a.role === 'monitor') && (
                        <span className={`text-xs font-semibold ${a.can_upload_students ? 'text-green-600' : 'text-gray-400'}`}>
                          {a.can_upload_students ? '✓' : '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-bear-muted">
                      {a.role === 'teacher' && (
                        a.same_room_all_day !== false
                          ? <span className="text-gray-400">All day</span>
                          : <span className="text-blue-600 font-semibold">Per period</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => startEdit(a)} className="text-xs text-bear-orange hover:text-orange-600 font-semibold">Edit</button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-bear-muted">No accounts found</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Edit panel */}
          <div className="space-y-4">
            {!editId ? (
              <div className="card text-center py-12 text-bear-muted">
                <div className="text-3xl mb-2">👤</div>
                <div className="text-sm">Select an account to edit</div>
              </div>
            ) : (
              <>
                <div className="card space-y-4 border-2 border-bear-orange">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-bear-dark truncate">{editAcct?.email}</h2>
                    <button onClick={() => setEditId(null)} className="text-bear-muted hover:text-bear-dark text-xl shrink-0">×</button>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-bear-muted mb-1 uppercase tracking-widest">Display Name</label>
                    <input value={editForm.display_name ?? ''} onChange={e => setEditForm(f => ({ ...f, display_name: e.target.value }))}
                      className="w-full border border-orange-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white" />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-bear-muted mb-1 uppercase tracking-widest">Role</label>
                    <select value={editForm.role ?? ''} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}
                      className="w-full border border-orange-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white">
                      <option value="admin">Admin</option>
                      <option value="monitor">Monitor</option>
                      <option value="teacher">Teacher</option>
                      <option value="terminal">Terminal</option>
                    </select>
                  </div>

                  {(editForm.role === 'teacher' || editForm.role === 'terminal') && (
                    <div>
                      <label className="block text-xs font-semibold text-bear-muted mb-1 uppercase tracking-widest">
                        {editForm.role === 'teacher' && !editForm.same_room_all_day ? 'Default Room' : 'Room'}
                      </label>
                      <select value={editForm.room_id ?? ''} onChange={e => setEditForm(f => ({ ...f, room_id: e.target.value }))}
                        className="w-full border border-orange-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white">
                        <option value="">— No Room —</option>
                        {rooms.map(r => <option key={r.id} value={r.id}>{r.room_number} · {r.teacher_name}</option>)}
                      </select>
                    </div>
                  )}

                  {/* Teacher-specific settings */}
                  {editForm.role === 'teacher' && (
                    <div className="space-y-4 border-t border-orange-100 pt-3">

                      {/* Same room all day toggle */}
                      <div className="flex items-start gap-3">
                        <button onClick={() => setEditForm(f => ({ ...f, same_room_all_day: !f.same_room_all_day }))}
                          className={`relative w-11 h-6 rounded-full transition-colors shrink-0 mt-0.5 ${editForm.same_room_all_day ? 'bg-bear-orange' : 'bg-gray-300'}`}>
                          <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${editForm.same_room_all_day ? 'translate-x-5' : 'translate-x-0.5'}`} />
                        </button>
                        <div>
                          <div className="text-sm font-semibold text-bear-dark">Same Room All Day</div>
                          <div className="text-xs text-bear-muted">
                            {editForm.same_room_all_day ? 'Teacher stays in one room all day' : 'Teacher moves rooms each period'}
                          </div>
                        </div>
                      </div>

                      {/* Per-period rooms — shown when same_room_all_day is OFF */}
                      {!editForm.same_room_all_day && (
                        <div className="space-y-2 bg-blue-50 border border-blue-200 rounded-xl p-3">
                          <div className="text-xs font-bold text-blue-800 uppercase tracking-widest mb-2">Room Per Period</div>
                          {[1, 2, 3, 4, 5, 6].map(p => (
                            <div key={p} className="flex items-center gap-2">
                              <span className="text-xs font-bold text-blue-700 w-14 shrink-0">Period {p}</span>
                              <select
                                value={periodRooms[p] ?? ''}
                                onChange={e => setPeriodRooms(prev => ({ ...prev, [p]: e.target.value }))}
                                className="flex-1 border border-blue-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                                <option value="">— Not teaching —</option>
                                {rooms.map(r => <option key={r.id} value={r.id}>{r.room_number} · {r.teacher_name}</option>)}
                              </select>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Upload permission */}
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={editForm.can_upload_students ?? false}
                          onChange={e => setEditForm(f => ({ ...f, can_upload_students: e.target.checked }))}
                          className="accent-bear-orange w-4 h-4" />
                        <div>
                          <div className="text-sm font-semibold text-bear-dark">Allow Student Data Upload</div>
                          <div className="text-xs text-bear-muted">Can import students via CSV</div>
                        </div>
                      </label>
                    </div>
                  )}

                  {/* Monitor upload permission */}
                  {editForm.role === 'monitor' && (
                    <div className="border-t border-orange-100 pt-3">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={editForm.can_upload_students ?? false}
                          onChange={e => setEditForm(f => ({ ...f, can_upload_students: e.target.checked }))}
                          className="accent-bear-orange w-4 h-4" />
                        <div>
                          <div className="text-sm font-semibold text-bear-dark">Allow Student Data Upload</div>
                          <div className="text-xs text-bear-muted">Can import students via CSV</div>
                        </div>
                      </label>
                    </div>
                  )}

                  {saveMsg && (
                    <div className={`text-xs rounded-xl px-3 py-2 ${saveMsg.startsWith('✅') ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                      {saveMsg}
                    </div>
                  )}

                  <button onClick={handleSave} disabled={saving}
                    className="w-full bg-bear-orange hover:bg-orange-600 disabled:opacity-60 text-white font-semibold text-sm py-2.5 rounded-xl transition-colors">
                    {saving ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>

                {/* Password reset */}
                <div className="card space-y-3">
                  <h3 className="text-sm font-bold text-bear-dark">🔑 Reset Password</h3>
                  <form onSubmit={handlePwReset} className="space-y-2">
                    <input type="password" placeholder="New password (min 8 chars)" value={newPw}
                      onChange={e => setNewPw(e.target.value)} minLength={8}
                      className="w-full border border-orange-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white" />
                    {pwMsg && (
                      <div className={`text-xs rounded-xl px-3 py-2 ${pwMsg.startsWith('✅') ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                        {pwMsg}
                      </div>
                    )}
                    <button type="submit" disabled={pwSaving || newPw.length < 8}
                      className="w-full bg-gray-700 hover:bg-gray-800 disabled:opacity-50 text-white font-semibold text-sm py-2 rounded-xl transition-colors">
                      {pwSaving ? 'Updating…' : 'Set Password'}
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
