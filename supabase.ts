'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import Nav from '@/components/Nav'
import type { UserProfile } from '@/lib/types'

interface SettingField {
  key: string
  label: string
  description: string
  type: 'toggle' | 'number' | 'text' | 'select'
  options?: { value: string; label: string }[]
}

const FIELDS: SettingField[] = [
  { key: 'enable_time_restrictions', label: 'Time Restrictions', description: 'Block sign-outs in the first and last N minutes of each period.', type: 'toggle' },
  { key: 'first_last_minutes', label: 'Block Window (minutes)', description: 'Minutes at start and end of each period where sign-outs are blocked.', type: 'number' },
  { key: 'active_schedule_type', label: 'Schedule Override', description: 'Auto uses the calendar. Manual override forces a specific schedule.', type: 'select', options: [
    { value: 'auto', label: 'Auto (use calendar)' },
    { value: 'regular', label: 'Force Regular' },
    { value: 'minimum', label: 'Force Minimum Day' },
    { value: 'rally', label: 'Force Rally' },
  ]},
  { key: 'lock_teacher_links', label: 'Lock Teacher Links', description: 'Prevent terminal kiosk from being accessed without auth.', type: 'toggle' },
  { key: 'yellow_min', label: 'Yellow Alert (min)', description: 'Minutes out before pass turns yellow.', type: 'number' },
  { key: 'orange_min', label: 'Orange Alert (min)', description: 'Minutes out before pass turns orange.', type: 'number' },
  { key: 'school_name', label: 'School Name', description: 'Displayed in headers and reports.', type: 'text' },
]

export default function AdminSettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState<string | null>(null)
  const [users, setUsers] = useState<any[]>([])
  const [rooms, setRooms] = useState<any[]>([])
  const [newUser, setNewUser] = useState({ email: '', password: '', role: 'teacher', room_id: '' })
  const [addingUser, setAddingUser] = useState(false)

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/'; return }
      const { data: prof } = await supabase.from('user_profiles').select('*').eq('id', user.id).maybeSingle()
      if (prof?.role !== 'admin') { window.location.href = '/'; return }
      setProfile(prof as any)

      const [{ data: settingsData }, { data: usersData }, { data: roomsData }] = await Promise.all([
        supabase.from('settings').select('*'),
        supabase.from('user_profiles').select('*, room:rooms(room_number)').order('role'),
        supabase.from('rooms').select('id, room_number, teacher_name').order('room_number'),
      ])

      const map: Record<string, string> = {}
      ;(settingsData ?? []).forEach((s: any) => { map[s.key] = s.value })
      setSettings(map)
      setUsers(usersData ?? [])
      setRooms(roomsData ?? [])
      setLoading(false)
    }
    init()
  }, [])

  async function updateSetting(key: string, value: string) {
    setSettings(prev => ({ ...prev, [key]: value }))
    const supabase = createClient()
    await supabase.from('settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    setSaved(key)
    setTimeout(() => setSaved(null), 2000)
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault()
    setAddingUser(true)
    const supabase = createClient()
    // NOTE: In production, use Supabase Admin API via Edge Function to create users
    // For demo, we insert a profile record assuming auth user exists
    const { data: authData, error } = await supabase.auth.admin?.createUser?.({
      email: newUser.email,
      password: newUser.password,
      email_confirm: true,
    }) as any ?? { data: null, error: { message: 'Admin API not available client-side. Create auth user in Supabase dashboard.' } }

    if (error) {
      alert(`Note: ${error.message}\n\nCreate the auth user manually in your Supabase dashboard, then come back here and add their profile.`)
      setAddingUser(false)
      return
    }

    if (authData?.user) {
      await supabase.from('user_profiles').insert({
        id: authData.user.id,
        email: newUser.email,
        role: newUser.role,
        room_id: newUser.room_id || null,
        display_name: newUser.email.split('@')[0],
      })
    }
    setNewUser({ email: '', password: '', role: 'teacher', room_id: '' })
    setAddingUser(false)
    // Reload users
    const { data } = await createClient().from('user_profiles').select('*, room:rooms(room_number)').order('role')
    setUsers(data ?? [])
  }

  const roleColors: Record<string, string> = {
    admin: 'bg-purple-100 text-purple-800',
    monitor: 'bg-blue-100 text-blue-800',
    teacher: 'bg-green-100 text-green-800',
    terminal: 'bg-orange-100 text-orange-800',
  }

  if (loading) return <div className="min-h-screen bg-bear-cream flex items-center justify-center"><div className="text-bear-muted">Loading…</div></div>

  return (
    <div className="min-h-screen bg-bear-cream">
      <Nav role="admin" displayName={profile?.display_name ?? profile?.email} />
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-3xl font-display font-black text-bear-dark">Settings</h1>
          <p className="text-bear-muted mt-1">System configuration for Bear Tracks</p>
        </div>

        {/* System settings */}
        <div className="card space-y-6">
          <h2 className="text-lg font-bold text-bear-dark border-b border-orange-100 pb-3">System Settings</h2>
          {FIELDS.map(field => (
            <div key={field.key} className="flex items-start gap-4">
              <div className="flex-1">
                <div className="font-semibold text-bear-dark text-sm">{field.label}</div>
                <div className="text-xs text-bear-muted mt-0.5">{field.description}</div>
              </div>
              <div className="flex items-center gap-2">
                {field.type === 'toggle' && (
                  <button
                    onClick={() => updateSetting(field.key, settings[field.key] === 'true' ? 'false' : 'true')}
                    className={`relative w-11 h-6 rounded-full transition-colors ${settings[field.key] === 'true' ? 'bg-bear-orange' : 'bg-gray-200'}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings[field.key] === 'true' ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                )}
                {field.type === 'number' && (
                  <input type="number" value={settings[field.key] ?? ''} onChange={e => updateSetting(field.key, e.target.value)}
                    className="w-20 border border-orange-200 rounded-xl px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white" />
                )}
                {field.type === 'text' && (
                  <input type="text" value={settings[field.key] ?? ''} onChange={e => updateSetting(field.key, e.target.value)}
                    className="w-48 border border-orange-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white" />
                )}
                {field.type === 'select' && (
                  <select value={settings[field.key] ?? ''} onChange={e => updateSetting(field.key, e.target.value)}
                    className="border border-orange-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white">
                    {field.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                )}
                {saved === field.key && <span className="text-xs text-green-600 font-medium">Saved ✓</span>}
              </div>
            </div>
          ))}
        </div>

        {/* User management */}
        <div className="card space-y-5">
          <h2 className="text-lg font-bold text-bear-dark border-b border-orange-100 pb-3">User Accounts</h2>
          <p className="text-xs text-bear-muted bg-amber-50 border border-amber-200 rounded-xl px-4 py-2">
            <strong>Note:</strong> To create users, first create them in your Supabase Auth dashboard, then their profile will auto-appear here after first login. Or use the form below (requires Supabase Service Role key configured).
          </p>

          {/* Existing users */}
          <div className="space-y-2">
            {users.map(u => (
              <div key={u.id} className="flex items-center gap-3 py-2 px-3 bg-gray-50 rounded-xl">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${roleColors[u.role] ?? 'bg-gray-100 text-gray-600'}`}>{u.role}</span>
                <span className="flex-1 text-sm text-bear-dark font-medium">{u.email}</span>
                {u.room && <span className="text-xs text-bear-muted">{(u.room as any).room_number}</span>}
              </div>
            ))}
          </div>

          {/* Add user form */}
          <form onSubmit={handleAddUser} className="space-y-3 border-t border-orange-100 pt-4">
            <h3 className="text-sm font-bold text-bear-dark">Add User Profile</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <input type="email" placeholder="Email" value={newUser.email} onChange={e => setNewUser(u => ({ ...u, email: e.target.value }))} required
                className="border border-orange-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white" />
              <input type="password" placeholder="Password" value={newUser.password} onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))}
                className="border border-orange-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white" />
              <select value={newUser.role} onChange={e => setNewUser(u => ({ ...u, role: e.target.value }))}
                className="border border-orange-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white">
                <option value="teacher">Teacher</option>
                <option value="terminal">Terminal</option>
                <option value="monitor">Monitor</option>
                <option value="admin">Admin</option>
              </select>
              <select value={newUser.room_id} onChange={e => setNewUser(u => ({ ...u, room_id: e.target.value }))}
                className="border border-orange-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white">
                <option value="">— Room (teacher/terminal only) —</option>
                {rooms.map(r => <option key={r.id} value={r.id}>{r.room_number} · {r.teacher_name}</option>)}
              </select>
            </div>
            <button type="submit" disabled={addingUser}
              className="bg-bear-orange hover:bg-orange-600 disabled:opacity-60 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors">
              {addingUser ? 'Creating…' : 'Create User'}
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}
