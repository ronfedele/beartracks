'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import Nav from '@/components/Nav'
import type { UserProfile } from '@/lib/types'

const SYSTEM_FIELDS = [
  { key: 'enable_time_restrictions', label: 'Time Restrictions', description: 'Block sign-outs in first/last N minutes of each period.', type: 'toggle' },
  { key: 'first_last_minutes', label: 'Block Window (minutes)', description: 'Minutes at start and end of each period where sign-outs are blocked.', type: 'number' },
  { key: 'active_schedule_type', label: 'Schedule Override', description: 'Auto uses the calendar. Manual override forces a specific schedule.', type: 'select', options: [
    { value: 'auto', label: 'Auto (use calendar)' },
    { value: 'regular', label: 'Force Regular' },
    { value: 'minimum', label: 'Force Minimum Day' },
    { value: 'rally', label: 'Force Rally' },
  ]},
  { key: 'yellow_min', label: 'Yellow Alert (min)', description: 'Minutes out before pass turns yellow.', type: 'number' },
  { key: 'orange_min', label: 'Orange Alert (min)', description: 'Minutes out before pass turns orange.', type: 'number' },
  { key: 'school_name', label: 'School Name', description: 'Displayed in headers and reports.', type: 'text' },
]

export default function AdminSettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'system' | 'passwords' | 'testing'>('system')

  // Passwords tab
  const [users, setUsers] = useState<any[]>([])
  const [resetLoading, setResetLoading] = useState(false)
  const [resetMsg, setResetMsg] = useState('')
  const [pwUser, setPwUser] = useState<any | null>(null)
  const [newPw, setNewPw] = useState('')
  const [pwMsg, setPwMsg] = useState('')
  const [pwLoading, setPwLoading] = useState(false)

  // Testing tab
  const [testTime, setTestTime] = useState('')
  const [testEnabled, setTestEnabled] = useState(false)
  const [testSaved, setTestSaved] = useState(false)

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/'; return }
      const { data: prof } = await supabase.from('user_profiles').select('*').eq('id', user.id).maybeSingle()
      if (prof?.role !== 'admin') { window.location.href = '/'; return }
      setProfile(prof as any)
      const [{ data: settingsData }, { data: usersData }] = await Promise.all([
        supabase.from('settings').select('*'),
        supabase.from('user_profiles').select('*, room:rooms(room_number)').order('role'),
      ])
      const map: Record<string, string> = {}
      ;(settingsData ?? []).forEach((s: any) => { map[s.key] = s.value })
      setSettings(map)
      setTestTime(map['test_clock_time'] ?? '')
      setTestEnabled(map['test_clock_enabled'] === 'true')
      setUsers((usersData ?? []).filter((u: any) => u.role !== 'terminal'))
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

  async function saveTestClock() {
    const supabase = createClient()
    await Promise.all([
      supabase.from('settings').upsert({ key: 'test_clock_enabled', value: testEnabled ? 'true' : 'false' }, { onConflict: 'key' }),
      supabase.from('settings').upsert({ key: 'test_clock_time', value: testTime }, { onConflict: 'key' }),
    ])
    setTestSaved(true)
    setTimeout(() => setTestSaved(false), 2500)
  }

  async function clearTestClock() {
    setTestEnabled(false)
    setTestTime('')
    const supabase = createClient()
    await Promise.all([
      supabase.from('settings').upsert({ key: 'test_clock_enabled', value: 'false' }, { onConflict: 'key' }),
      supabase.from('settings').upsert({ key: 'test_clock_time', value: '' }, { onConflict: 'key' }),
    ])
    setTestSaved(true)
    setTimeout(() => setTestSaved(false), 2000)
  }

  async function handleMasterReset() {
    if (!confirm('Reset ALL terminal/room accounts to BearTracks2025!?')) return
    setResetLoading(true); setResetMsg('')
    const supabase = createClient()
    const { data, error } = await supabase.rpc('admin_reset_terminal_passwords')
    setResetMsg(error ? `Error: ${error.message}` : `✅ Reset ${data} terminal accounts to BearTracks2025!`)
    setResetLoading(false)
  }

  async function handlePasswordReset(e: React.FormEvent) {
    e.preventDefault()
    if (!pwUser || !newPw || newPw.length < 8) { setPwMsg('Password must be at least 8 characters.'); return }
    setPwLoading(true); setPwMsg('')
    const supabase = createClient()
    const { error } = await supabase.rpc('admin_set_user_password', { target_user_id: pwUser.id, new_password: newPw })
    setPwMsg(error ? `Error: ${error.message}` : `✅ Password updated for ${pwUser.email}`)
    if (!error) { setNewPw(''); setPwUser(null) }
    setPwLoading(false)
  }

  const roleColors: Record<string, string> = { admin: 'bg-purple-100 text-purple-800', monitor: 'bg-blue-100 text-blue-800', teacher: 'bg-green-100 text-green-800' }

  if (loading) return <div className="min-h-screen bg-bear-cream flex items-center justify-center"><div className="text-bear-muted">Loading…</div></div>

  return (
    <div className="min-h-screen bg-bear-cream">
      <Nav role="admin" displayName={profile?.display_name ?? profile?.email} />
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-display font-black text-bear-dark">Settings</h1>
          <p className="text-bear-muted mt-1">System configuration for Bear Tracks</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-orange-100 p-1 rounded-xl w-fit">
          {([['system','⚙️ System'],['passwords','🔑 Passwords'],['testing','🧪 Testing']] as const).map(([tab, label]) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${activeTab === tab ? 'bg-white text-bear-dark shadow-sm' : 'text-bear-muted hover:text-bear-dark'}`}>
              {label}
              {tab === 'testing' && testEnabled && <span className="ml-1.5 bg-amber-500 text-white text-xs px-1.5 py-0.5 rounded-full">ON</span>}
            </button>
          ))}
        </div>

        {/* ── SYSTEM TAB ── */}
        {activeTab === 'system' && (
          <div className="card space-y-6">
            <h2 className="text-lg font-bold text-bear-dark border-b border-orange-100 pb-3">System Settings</h2>
            {SYSTEM_FIELDS.map((field: any) => (
              <div key={field.key} className="flex items-start gap-4">
                <div className="flex-1">
                  <div className="font-semibold text-bear-dark text-sm">{field.label}</div>
                  <div className="text-xs text-bear-muted mt-0.5">{field.description}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {field.type === 'toggle' && (
                    <button onClick={() => updateSetting(field.key, settings[field.key] === 'true' ? 'false' : 'true')}
                      className={`relative w-11 h-6 rounded-full transition-colors ${settings[field.key] === 'true' ? 'bg-bear-orange' : 'bg-gray-200'}`}>
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
                      {field.options?.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  )}
                  {saved === field.key && <span className="text-xs text-green-600 font-medium">Saved ✓</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── PASSWORDS TAB ── */}
        {activeTab === 'passwords' && (
          <div className="space-y-6">
            <div className="card space-y-4">
              <h2 className="text-lg font-bold text-bear-dark border-b border-orange-100 pb-3">🔑 Master Terminal Reset</h2>
              <p className="text-sm text-bear-muted">Resets ALL room/terminal accounts to <code className="bg-orange-50 px-1 rounded">BearTracks2025!</code>.</p>
              {resetMsg && <div className={`text-sm rounded-xl px-4 py-2 ${resetMsg.startsWith('✅') ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>{resetMsg}</div>}
              <button onClick={handleMasterReset} disabled={resetLoading}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold text-sm px-5 py-2 rounded-xl transition-colors">
                {resetLoading ? 'Resetting…' : 'Reset All Terminal Passwords'}
              </button>
            </div>
            <div className="card space-y-5">
              <h2 className="text-lg font-bold text-bear-dark border-b border-orange-100 pb-3">🔒 Reset User Password</h2>
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {users.map(u => (
                  <div key={u.id} onClick={() => { setPwUser(u); setNewPw(''); setPwMsg('') }}
                    className={`flex items-center gap-3 py-2 px-3 rounded-xl cursor-pointer transition-colors ${pwUser?.id === u.id ? 'bg-bear-orange/10 border border-bear-orange' : 'bg-gray-50 hover:bg-orange-50 border border-transparent'}`}>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${roleColors[u.role] ?? 'bg-gray-100 text-gray-600'}`}>{u.role}</span>
                    <span className="flex-1 text-sm text-bear-dark">{u.email}</span>
                    {u.room && <span className="text-xs text-bear-muted">{(u.room as any).room_number}</span>}
                  </div>
                ))}
              </div>
              {pwUser && (
                <form onSubmit={handlePasswordReset} className="space-y-3 border-t border-orange-100 pt-4">
                  <p className="text-sm font-semibold text-bear-dark">New password for: <span className="text-bear-orange">{pwUser.email}</span></p>
                  <div className="flex gap-3">
                    <input type="password" placeholder="New password (min 8 chars)" value={newPw} onChange={e => setNewPw(e.target.value)} minLength={8}
                      className="flex-1 border border-orange-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white" />
                    <button type="submit" disabled={pwLoading || newPw.length < 8}
                      className="bg-bear-orange hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors whitespace-nowrap">
                      {pwLoading ? 'Saving…' : 'Set Password'}
                    </button>
                    <button type="button" onClick={() => setPwUser(null)} className="text-sm text-bear-muted hover:text-bear-dark px-2">Cancel</button>
                  </div>
                  {pwMsg && <div className={`text-sm rounded-xl px-4 py-2 ${pwMsg.startsWith('✅') ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>{pwMsg}</div>}
                </form>
              )}
            </div>
          </div>
        )}

        {/* ── TESTING TAB ── */}
        {activeTab === 'testing' && (
          <div className="space-y-6">
            {/* Test clock */}
            <div className={`card space-y-4 ${testEnabled ? 'border-2 border-amber-400 bg-amber-50/30' : ''}`}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-bear-dark">🕐 Test Clock Override</h2>
                  <p className="text-xs text-bear-muted mt-0.5">Override the system time for testing pass rules, period detection, and time restrictions. Affects all users.</p>
                </div>
                {testEnabled && (
                  <span className="bg-amber-400 text-white text-xs font-bold px-3 py-1 rounded-full animate-pulse">ACTIVE — {testTime}</span>
                )}
              </div>

              <div className="flex items-end gap-4 flex-wrap">
                <div>
                  <label className="block text-xs font-semibold text-bear-muted mb-1 uppercase tracking-widest">Fake Time (HH:MM, 24-hour)</label>
                  <input type="time" value={testTime} onChange={e => setTestTime(e.target.value)}
                    className="border border-orange-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white text-bear-dark font-mono text-lg w-36" />
                </div>
                <div className="flex items-center gap-2 pb-0.5">
                  <button onClick={() => setTestEnabled(!testEnabled)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${testEnabled ? 'bg-amber-500' : 'bg-gray-200'}`}>
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${testEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                  <span className="text-sm font-semibold text-bear-dark">{testEnabled ? 'Override ON' : 'Override OFF'}</span>
                </div>
              </div>

              {/* Quick time preset buttons */}
              <div>
                <div className="text-xs font-semibold text-bear-muted mb-2 uppercase tracking-widest">Quick Presets</div>
                <div className="flex flex-wrap gap-2">
                  {[['08:40','Before school'],['08:50','Start P1'],['09:00','Mid P1'],['09:35','End P1'],['09:42','Start P2'],['10:40','Mid P2'],['11:45','Start P4'],['12:05','Mid lunch'],['14:00','Start P6'],['14:55','End P6']].map(([time, label]) => (
                    <button key={time} onClick={() => { setTestTime(time); setTestEnabled(true) }}
                      className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors ${testTime === time && testEnabled ? 'bg-amber-500 text-white border-amber-500' : 'bg-white border-orange-200 text-bear-dark hover:border-amber-300 hover:bg-amber-50'}`}>
                      {time} <span className="text-bear-muted">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {testSaved && <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2 text-sm text-green-800">✅ Test clock settings saved</div>}

              <div className="flex gap-2">
                <button onClick={saveTestClock}
                  className="bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm px-5 py-2 rounded-xl transition-colors">
                  Save Test Clock
                </button>
                <button onClick={clearTestClock}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-sm px-5 py-2 rounded-xl transition-colors">
                  Clear & Disable
                </button>
              </div>

              {testEnabled && (
                <div className="bg-amber-100 border border-amber-300 rounded-xl px-4 py-3 text-sm text-amber-900">
                  ⚠ <strong>Test clock is active.</strong> All pass time restrictions and period detection are using <strong>{testTime}</strong> instead of the real time. Remember to disable this after testing.
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
