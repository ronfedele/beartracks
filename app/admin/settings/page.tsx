'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import Nav from '@/components/Nav'
import type { UserProfile } from '@/lib/types'

const SYSTEM_FIELDS = [
  { key: 'enable_time_restrictions', label: 'Time Restrictions', description: 'Block sign-outs in first/last N minutes of each period.', type: 'toggle' },
  { key: 'first_last_minutes', label: 'Block Window (minutes)', description: 'Minutes at start/end of each period where sign-outs are blocked.', type: 'number' },
  { key: 'active_schedule_type', label: 'Schedule Override', description: 'Auto uses calendar. Manual forces a specific schedule.', type: 'select', options: [
    { value: 'auto', label: 'Auto (use calendar)' },
    { value: 'regular', label: 'Force Regular' },
    { value: 'minimum', label: 'Force Minimum Day' },
    { value: 'rally', label: 'Force Rally' },
  ]},
  { key: 'yellow_min', label: 'Yellow Alert (min)', description: 'Minutes out before pass turns yellow.', type: 'number' },
  { key: 'orange_min', label: 'Orange Alert (min)', description: 'Minutes out before pass turns orange.', type: 'number' },
]

const PRESET_COLORS = [
  { label: 'OMS',   primary: '#FF5910', secondary: '#002D72' },
  { label: 'Forest',      primary: '#2d6a4f', secondary: '#1b2b1e' },
  { label: 'Royal Blue',  primary: '#1a56db', secondary: '#1e293b' },
  { label: 'Cardinal',    primary: '#be123c', secondary: '#1c0a0a' },
  { label: 'Purple',      primary: '#7c3aed', secondary: '#1a0a2e' },
  { label: 'Teal',        primary: '#0d9488', secondary: '#0a1f1e' },
  { label: 'Slate',       primary: '#475569', secondary: '#0f172a' },
]

export default function AdminSettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'branding' | 'system' | 'passwords' | 'testing' | 'data'>('branding')

  // Clear data state
  const [clearTarget, setClearTarget] = useState<'students'|'passes'|null>(null)
  const [clearStep, setClearStep]     = useState(0)
  const [clearInput, setClearInput]   = useState('')
  const [clearing, setClearing]       = useState(false)
  const [clearMsg, setClearMsg]       = useState('')

  const CLEAR_PHRASES: Record<string, string[]> = {
    students: ['DELETE ALL STUDENTS', 'THIS CANNOT BE UNDONE', 'CONFIRM PURGE'],
    passes:   ['DELETE ALL PASSES',   'THIS CANNOT BE UNDONE', 'CONFIRM PURGE'],
  }

  async function executeClear() {
    if (!clearTarget) return
    setClearing(true); setClearMsg('')
    const supabase = createClient()
    const fn = clearTarget === 'students' ? 'admin_purge_students' : 'admin_purge_pass_logs'
    const { data, error } = await supabase.rpc(fn)
    if (error) setClearMsg(`Error: ${error.message}`)
    else setClearMsg(`✅ Purged ${data} records successfully.`)
    setClearing(false)
    setClearStep(0); setClearInput(''); setClearTarget(null)
  }

  // Branding fields (local state, saved all at once)
  const [siteName,      setSiteName]      = useState('')
  const [siteSubtitle,  setSiteSubtitle]  = useState('')
  const [primaryColor,  setPrimaryColor]  = useState('#FF5910')
  const [secondaryColor,setSecondaryColor]= useState('#002D72')
  const [logoEmoji,     setLogoEmoji]     = useState('🐾')
  const [logoUrl,       setLogoUrl]       = useState('')
  const [brandSaving,   setBrandSaving]   = useState(false)
  const [brandMsg,      setBrandMsg]      = useState('')

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

      // Populate branding fields from DB values
      setSiteName(map['school_name'] ?? 'OMS Bear Tracks')
      setSiteSubtitle(map['site_subtitle'] ?? 'Hall Pass Management System')
      setPrimaryColor(map['primary_color'] ?? '#E8640A')
      setSecondaryColor(map['secondary_color'] ?? '#1a1a2e')
      setLogoEmoji(map['logo_emoji'] ?? '🐾')
      setLogoUrl(map['logo_url'] ?? '')
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

  async function saveBranding() {
    setBrandSaving(true); setBrandMsg('')
    const supabase = createClient()
    const pairs = [
      ['school_name',      siteName],
      ['site_subtitle',    siteSubtitle],
      ['primary_color',    primaryColor],
      ['secondary_color',  secondaryColor],
      ['logo_emoji',       logoEmoji],
      ['logo_url',         logoUrl],
    ]
    for (const [key, value] of pairs) {
      await supabase.from('settings').upsert({ key, value }, { onConflict: 'key' })
    }
    setBrandMsg('✅ Branding saved. Reload the page to see changes.')
    setBrandSaving(false)
  }

  async function saveTestClock() {
    const supabase = createClient()
    await Promise.all([
      supabase.from('settings').upsert({ key: 'test_clock_enabled', value: testEnabled ? 'true' : 'false' }, { onConflict: 'key' }),
      supabase.from('settings').upsert({ key: 'test_clock_time',    value: testTime }, { onConflict: 'key' }),
    ])
    setTestSaved(true); setTimeout(() => setTestSaved(false), 2500)
  }

  async function clearTestClock() {
    setTestEnabled(false); setTestTime('')
    const supabase = createClient()
    await Promise.all([
      supabase.from('settings').upsert({ key: 'test_clock_enabled', value: 'false' }, { onConflict: 'key' }),
      supabase.from('settings').upsert({ key: 'test_clock_time',    value: '' }, { onConflict: 'key' }),
    ])
    setTestSaved(true); setTimeout(() => setTestSaved(false), 2000)
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
    if (!pwUser || newPw.length < 8) { setPwMsg('Min 8 characters'); return }
    setPwLoading(true); setPwMsg('')
    const supabase = createClient()
    const { error } = await supabase.rpc('admin_set_user_password', { target_user_id: pwUser.id, new_password: newPw })
    setPwMsg(error ? `Error: ${error.message}` : `✅ Password updated for ${pwUser.email}`)
    if (!error) { setNewPw(''); setPwUser(null) }
    setPwLoading(false)
  }

  const roleColors: Record<string, string> = {
    admin: 'bg-purple-100 text-purple-800', monitor: 'bg-blue-100 text-blue-800', teacher: 'bg-green-100 text-green-800',
  }

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
        <div className="flex gap-1 bg-orange-100 p-1 rounded-xl w-fit flex-wrap">
          {([['branding','🎨 Branding'],['system','⚙️ System'],['passwords','🔑 Passwords'],['testing','🧪 Testing'],['data','🗑 Clear Data']] as const).map(([tab, label]) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${activeTab === tab ? 'bg-white text-bear-dark shadow-sm' : 'text-bear-muted hover:text-bear-dark'}`}>
              {label}
              {tab === 'testing' && testEnabled && <span className="ml-1.5 bg-amber-500 text-white text-xs px-1.5 py-0.5 rounded-full">ON</span>}
            </button>
          ))}
        </div>

        {/* ── BRANDING TAB ── */}
        {activeTab === 'branding' && (
          <div className="card space-y-6">
            <h2 className="text-lg font-bold text-bear-dark border-b border-orange-100 pb-3">🎨 Site Branding</h2>

            {/* Preview */}
            <div className="rounded-xl overflow-hidden border border-orange-100">
              <div className="px-5 py-3 flex items-center gap-3" style={{ backgroundColor: secondaryColor }}>
                {logoUrl
                  ? <img src={logoUrl} alt="logo" className="w-8 h-8 object-contain rounded" onError={e=>(e.currentTarget.style.display='none')} />
                  : <span className="text-2xl">{logoEmoji}</span>
                }
                <div>
                  <div className="font-bold text-white text-base leading-tight">{siteName || 'School Name'}</div>
                  <div className="text-xs leading-tight" style={{ color: 'rgba(255,255,255,0.55)' }}>{siteSubtitle || 'Subtitle'}</div>
                </div>
                <div className="ml-auto flex gap-2">
                  <div className="px-3 py-1 rounded-lg text-xs font-semibold text-white" style={{ backgroundColor: primaryColor }}>Active Nav</div>
                  <div className="px-3 py-1 rounded-lg text-xs font-semibold text-white/50">Inactive</div>
                </div>
              </div>
              <div className="bg-white px-5 py-3 text-xs text-bear-muted">Preview · changes appear after saving and reloading</div>
            </div>

            {/* Name & subtitle */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-bear-muted mb-1 uppercase tracking-widest">Site Name</label>
                <input value={siteName} onChange={e => setSiteName(e.target.value)}
                  className="w-full border border-orange-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white"
                  placeholder="OMS Bear Tracks" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-bear-muted mb-1 uppercase tracking-widest">Subtitle</label>
                <input value={siteSubtitle} onChange={e => setSiteSubtitle(e.target.value)}
                  className="w-full border border-orange-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white"
                  placeholder="Hall Pass Management System" />
              </div>
            </div>

            {/* Logo */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-bear-muted mb-1 uppercase tracking-widest">Logo Emoji</label>
                <input value={logoEmoji} onChange={e => setLogoEmoji(e.target.value)}
                  className="w-full border border-orange-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white"
                  placeholder="🐾" />
                <p className="text-xs text-bear-muted mt-1">Used when no logo URL is set</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-bear-muted mb-1 uppercase tracking-widest">Logo URL (optional)</label>
                <input value={logoUrl} onChange={e => setLogoUrl(e.target.value)}
                  className="w-full border border-orange-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white"
                  placeholder="https://…/logo.png" />
                <p className="text-xs text-bear-muted mt-1">Overrides emoji if valid URL</p>
              </div>
            </div>

            {/* Colors */}
            <div>
              <label className="block text-xs font-semibold text-bear-muted mb-3 uppercase tracking-widest">Color Presets</label>
              <div className="flex flex-wrap gap-2 mb-4">
                {PRESET_COLORS.map(p => (
                  <button key={p.label} onClick={() => { setPrimaryColor(p.primary); setSecondaryColor(p.secondary) }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${primaryColor === p.primary ? 'border-bear-orange ring-2 ring-bear-orange/30' : 'border-orange-100 hover:border-orange-300 bg-white'}`}>
                    <span className="flex gap-1">
                      <span className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: p.primary }} />
                      <span className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: p.secondary }} />
                    </span>
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-bear-muted mb-1 uppercase tracking-widest">Primary Color</label>
                  <div className="flex gap-2 items-center">
                    <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="w-10 h-10 rounded-lg border border-orange-200 cursor-pointer bg-white" />
                    <input type="text" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)}
                      className="flex-1 border border-orange-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white" />
                  </div>
                  <p className="text-xs text-bear-muted mt-1">Active nav items, buttons, highlights</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-bear-muted mb-1 uppercase tracking-widest">Secondary Color</label>
                  <div className="flex gap-2 items-center">
                    <input type="color" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} className="w-10 h-10 rounded-lg border border-orange-200 cursor-pointer bg-white" />
                    <input type="text" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)}
                      className="flex-1 border border-orange-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white" />
                  </div>
                  <p className="text-xs text-bear-muted mt-1">Navigation bar background</p>
                </div>
              </div>
            </div>

            {brandMsg && <div className={`text-sm rounded-xl px-4 py-2.5 ${brandMsg.startsWith('✅') ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>{brandMsg}</div>}

            <button onClick={saveBranding} disabled={brandSaving}
              className="bg-bear-orange hover:bg-orange-600 disabled:opacity-60 text-white font-bold px-8 py-3 rounded-xl text-sm transition-colors">
              {brandSaving ? 'Saving…' : 'Save Branding'}
            </button>
          </div>
        )}

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
                className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold text-sm px-5 py-2 rounded-xl">
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
                      className="bg-bear-orange hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-xl whitespace-nowrap">
                      {pwLoading ? 'Saving…' : 'Set Password'}
                    </button>
                    <button type="button" onClick={() => setPwUser(null)} className="text-sm text-bear-muted px-2">Cancel</button>
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
            <div className={`card space-y-4 ${testEnabled ? 'border-2 border-amber-400 bg-amber-50/30' : ''}`}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-bear-dark">🕐 Test Clock Override</h2>
                  <p className="text-xs text-bear-muted mt-0.5">Override system time for testing pass rules and period detection. Affects all users.</p>
                </div>
                {testEnabled && <span className="bg-amber-400 text-white text-xs font-bold px-3 py-1 rounded-full animate-pulse">ACTIVE — {testTime}</span>}
              </div>
              <div className="flex items-end gap-4 flex-wrap">
                <div>
                  <label className="block text-xs font-semibold text-bear-muted mb-1 uppercase tracking-widest">Fake Time (24-hour)</label>
                  <input type="time" value={testTime} onChange={e => setTestTime(e.target.value)}
                    className="border border-orange-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white font-mono text-lg w-36" />
                </div>
                <div className="flex items-center gap-2 pb-0.5">
                  <button onClick={() => setTestEnabled(!testEnabled)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${testEnabled ? 'bg-amber-500' : 'bg-gray-200'}`}>
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${testEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                  <span className="text-sm font-semibold text-bear-dark">{testEnabled ? 'Override ON' : 'Override OFF'}</span>
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-bear-muted mb-2 uppercase tracking-widest">Quick Presets</div>
                <div className="flex flex-wrap gap-2">
                  {[['08:40','Before school'],['08:50','Start P1'],['09:00','Mid P1'],['09:35','End P1'],['09:42','Start P2'],['10:40','Mid P2'],['11:45','Start P4'],['12:05','Mid lunch'],['14:00','Start P6'],['14:55','End P6']].map(([time, label]) => (
                    <button key={time} onClick={() => { setTestTime(time); setTestEnabled(true) }}
                      className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors ${testTime === time && testEnabled ? 'bg-amber-500 text-white border-amber-500' : 'bg-white border-orange-200 text-bear-dark hover:border-amber-300'}`}>
                      {time} <span className="text-bear-muted">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
              {testSaved && <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2 text-sm text-green-800">✅ Test clock settings saved</div>}
              <div className="flex gap-2">
                <button onClick={saveTestClock} className="bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm px-5 py-2 rounded-xl">Save Test Clock</button>
                <button onClick={clearTestClock} className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-sm px-5 py-2 rounded-xl">Clear & Disable</button>
              </div>
              {testEnabled && <div className="bg-amber-100 border border-amber-300 rounded-xl px-4 py-3 text-sm text-amber-900">⚠ <strong>Test clock is active.</strong> All time checks use <strong>{testTime}</strong>. Disable after testing.</div>}
            </div>
          </div>
        )}

        {/* ── CLEAR DATA TAB ── */}
        {activeTab === 'data' && (
          <div className="space-y-6">
            <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4">
              <h2 className="text-lg font-bold text-red-800 mb-1">⚠️ Danger Zone</h2>
              <p className="text-sm text-red-700">These actions permanently destroy data and cannot be reversed. Each requires three confirmation steps.</p>
            </div>

            {/* Clear passes */}
            <div className="card space-y-4">
              <div>
                <h3 className="text-base font-bold text-bear-dark">Clear All Pass Logs</h3>
                <p className="text-sm text-bear-muted mt-1">Deletes every pass record and sign-out log. Students and room settings are kept. Use this at the start of a new school year.</p>
              </div>
              {clearTarget !== 'students' && (
                <button onClick={() => { setClearTarget('passes'); setClearStep(0); setClearInput(''); setClearMsg('') }}
                  disabled={clearTarget === 'passes'}
                  className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold text-sm px-5 py-2 rounded-xl transition-colors">
                  {clearTarget === 'passes' ? 'Confirming…' : 'Clear Pass Logs'}
                </button>
              )}
              {clearTarget === 'passes' && (
                <ClearConfirmSteps
                  phrases={CLEAR_PHRASES.passes}
                  step={clearStep} input={clearInput}
                  onInput={(val) => {
                    setClearInput(val)
                    if (val === CLEAR_PHRASES.passes[clearStep]) { setClearStep(s => s + 1); setClearInput('') }
                  }}
                  onExecute={executeClear}
                  onCancel={() => { setClearTarget(null); setClearStep(0); setClearInput(''); setClearMsg('') }}
                  executing={clearing}
                  msg={clearMsg}
                />
              )}
            </div>

            {/* Clear students */}
            <div className="card space-y-4 border-red-200">
              <div>
                <h3 className="text-base font-bold text-bear-dark">Clear All Student Data</h3>
                <p className="text-sm text-bear-muted mt-1">Deletes ALL students, their period schedules, AND all pass history. Room and account settings are kept. This completely resets the student database.</p>
              </div>
              {clearTarget !== 'passes' && (
                <button onClick={() => { setClearTarget('students'); setClearStep(0); setClearInput(''); setClearMsg('') }}
                  disabled={clearTarget === 'students'}
                  className="bg-red-800 hover:bg-red-900 disabled:opacity-60 text-white font-semibold text-sm px-5 py-2 rounded-xl transition-colors">
                  {clearTarget === 'students' ? 'Confirming…' : 'Clear Student Data'}
                </button>
              )}
              {clearTarget === 'students' && (
                <ClearConfirmSteps
                  phrases={CLEAR_PHRASES.students}
                  step={clearStep} input={clearInput}
                  onInput={(val) => {
                    setClearInput(val)
                    if (val === CLEAR_PHRASES.students[clearStep]) { setClearStep(s => s + 1); setClearInput('') }
                  }}
                  onExecute={executeClear}
                  onCancel={() => { setClearTarget(null); setClearStep(0); setClearInput(''); setClearMsg('') }}
                  executing={clearing}
                  msg={clearMsg}
                />
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  )
}

function ClearConfirmSteps({ phrases, step, input, onInput, onExecute, onCancel, executing, msg }: {
  phrases: string[]; step: number; input: string
  onInput: (v: string) => void; onExecute: () => void; onCancel: () => void
  executing: boolean; msg: string
}) {
  return (
    <div className="space-y-3 border-t border-red-100 pt-4">
      {phrases.map((phrase, i) => (
        <div key={i} className={`space-y-1 transition-opacity ${step < i ? 'opacity-25 pointer-events-none' : ''}`}>
          <label className="text-xs font-bold text-red-700 uppercase tracking-widest">
            Step {i + 1} of {phrases.length} — type exactly:
            <span className="ml-1 font-mono bg-red-100 px-1.5 py-0.5 rounded text-red-800">{phrase}</span>
          </label>
          <input
            disabled={step !== i}
            value={step === i ? input : ''}
            onChange={e => onInput(e.target.value)}
            placeholder={`Type: ${phrase}`}
            className={`w-full border rounded-xl px-3 py-2 text-sm font-mono focus:outline-none transition-colors
              ${step === i ? 'border-red-300 bg-red-50 focus:ring-2 focus:ring-red-400' : step > i ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50'}`}
          />
          {step > i && <p className="text-xs text-green-600 font-semibold">✓ Confirmed</p>}
        </div>
      ))}
      {msg && (
        <div className={`text-sm rounded-xl px-4 py-2 ${msg.startsWith('✅') ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {msg}
        </div>
      )}
      <div className="flex gap-3 pt-1">
        <button onClick={onExecute} disabled={step < phrases.length || executing}
          className="flex-1 bg-red-700 hover:bg-red-800 disabled:opacity-40 text-white font-bold py-2.5 rounded-xl text-sm transition-colors">
          {executing ? 'Executing…' : step < phrases.length ? `Complete all ${phrases.length} steps` : '⚠ Execute — Cannot Be Undone'}
        </button>
        <button onClick={onCancel} className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm text-bear-muted hover:text-bear-dark">
          Cancel
        </button>
      </div>
    </div>
  )
}
