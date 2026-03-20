'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import Nav from '@/components/Nav'
import type { UserProfile } from '@/lib/types'

const DAY_TYPES = [
  { key: 'regular',  label: 'Regular Day',   icon: '📅', color: 'bg-blue-50 border-blue-200',   active: 'bg-blue-600 text-white',   badge: 'bg-blue-100 text-blue-800' },
  { key: 'minimum',  label: 'Minimum Day',   icon: '⏱️', color: 'bg-green-50 border-green-200', active: 'bg-green-600 text-white',  badge: 'bg-green-100 text-green-800' },
  { key: 'rally',    label: 'Rally Day',     icon: '📣', color: 'bg-purple-50 border-purple-200',active: 'bg-purple-600 text-white', badge: 'bg-purple-100 text-purple-800' },
]

const GROUPS = [
  { key: 7, label: 'Group 7', sub: '7th grade bell schedule' },
  { key: 8, label: 'Group 8', sub: '8th grade bell schedule' },
]

const PERIOD_LABELS = ['Start of Day', 'Period 1 End', 'Period 2 End', 'Period 3 End', 'Period 4 End', 'Period 5 End', 'Period 6 End']
const PERIOD_KEYS   = ['day_start', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6']

// Compute period durations for display
function getPeriodDurations(times: Record<string, string>): string[] {
  const mins = PERIOD_KEYS.map(k => {
    const t = times[k] || ''
    if (!t) return 0
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  })
  return mins.map((end, i) => {
    if (i === 0) return ''
    const start = mins[i - 1]
    if (!start || !end) return '—'
    const dur = end - start
    return dur > 0 ? `${dur} min` : '—'
  })
}

function fmt12(t: string): string {
  if (!t) return '—'
  const [h, m] = t.split(':').map(Number)
  const ampm = h < 12 ? 'am' : 'pm'
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')}${ampm}`
}

export default function BellSchedulesPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeType, setActiveType] = useState('regular')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  // schedules[profile][group] = { day_start, p1, p2, p3, p4, p5, p6 }
  const [schedules, setSchedules] = useState<Record<string, Record<number, Record<string, string>>>>({
    regular: { 7: {}, 8: {} },
    minimum: { 7: {}, 8: {} },
    rally:   { 7: {}, 8: {} },
  })
  const [ids, setIds] = useState<Record<string, Record<number, string>>>({}) // existing row IDs

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/'; return }
      const { data: prof } = await supabase.from('user_profiles').select('*').eq('id', user.id).maybeSingle()
      if (prof?.role !== 'admin') { window.location.href = '/'; return }
      setProfile(prof as any)
      await loadSchedules(supabase)
      setLoading(false)
    }
    init()
  }, [])

  async function loadSchedules(supabase?: any) {
    const sb = supabase ?? createClient()
    const { data } = await sb.from('schedules').select('*')
    const next: Record<string, Record<number, Record<string, string>>> = {
      regular: { 7: {}, 8: {} }, minimum: { 7: {}, 8: {} }, rally: { 7: {}, 8: {} },
    }
    const nextIds: Record<string, Record<number, string>> = {
      regular: {}, minimum: {}, rally: {},
    }
    ;(data ?? []).forEach((row: any) => {
      const p = row.profile as string
      const g = row.grade_group as number
      if (next[p] && next[p][g] !== undefined) {
        PERIOD_KEYS.forEach(k => {
          // Strip seconds from time string
          next[p][g][k] = (row[k] ?? '').substring(0, 5)
        })
        nextIds[p][g] = row.id
      }
    })
    setSchedules(next)
    setIds(nextIds)
  }

  function setTime(profile: string, group: number, key: string, value: string) {
    setSchedules(prev => ({
      ...prev,
      [profile]: {
        ...prev[profile],
        [group]: { ...prev[profile][group], [key]: value }
      }
    }))
    setSaveMsg('')
  }

  async function handleSave() {
    setSaving(true); setSaveMsg('')
    const supabase = createClient()

    const upserts = []
    for (const profile of ['regular', 'minimum', 'rally']) {
      for (const group of [7, 8]) {
        const times = schedules[profile][group]
        const existingId = ids[profile]?.[group]
        const row: any = { profile, grade_group: group }
        PERIOD_KEYS.forEach(k => { row[k] = times[k] || null })
        if (existingId) row.id = existingId
        upserts.push(row)
      }
    }

    const { error } = await supabase.from('schedules').upsert(upserts, { onConflict: 'profile,grade_group' })
    if (error) {
      setSaveMsg(`Error: ${error.message}`)
    } else {
      setSaveMsg('✅ All schedules saved')
      await loadSchedules()
    }
    setSaving(false)
  }

  const typeInfo = DAY_TYPES.find(d => d.key === activeType)!

  if (loading) return <div className="min-h-screen bg-bear-cream flex items-center justify-center"><div className="text-bear-muted">Loading…</div></div>

  return (
    <div className="min-h-screen bg-bear-cream">
      <Nav role="admin" displayName={profile?.display_name ?? profile?.email} />
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-4xl font-display font-black text-bear-dark">Bell Schedules</h1>
          <p className="text-bear-muted mt-1">Set period start and end times for each day type and grade group</p>
        </div>

        {/* Day type tabs */}
        <div className="flex gap-2 flex-wrap">
          {DAY_TYPES.map(dt => (
            <button key={dt.key} onClick={() => setActiveType(dt.key)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm border-2 transition-all ${activeType === dt.key ? dt.active + ' border-transparent shadow-md' : 'bg-white border-orange-200 text-bear-dark hover:border-orange-300'}`}>
              <span>{dt.icon}</span>
              {dt.label}
            </button>
          ))}
        </div>

        {/* Two group columns */}
        <div className="grid md:grid-cols-2 gap-6">
          {GROUPS.map(grp => {
            const times = schedules[activeType][grp.key]
            const durations = getPeriodDurations(times)
            return (
              <div key={grp.key} className={`card border-2 ${typeInfo.color} space-y-4`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-bear-dark">{grp.label}</h2>
                    <p className="text-xs text-bear-muted">{grp.sub}</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${typeInfo.badge}`}>{typeInfo.label}</span>
                </div>

                <div className="space-y-0 divide-y divide-orange-100">
                  {PERIOD_KEYS.map((key, i) => (
                    <div key={key} className="flex items-center gap-3 py-2.5">
                      <div className="w-28 shrink-0">
                        <div className="text-sm font-semibold text-bear-dark leading-tight">
                          {i === 0 ? '🔔 School Start' : `Period ${i}`}
                        </div>
                        <div className="text-xs text-bear-muted">
                          {i === 0 ? 'Day begins' : `ends at:`}
                        </div>
                      </div>
                      <input
                        type="time"
                        value={times[key] ?? ''}
                        onChange={e => setTime(activeType, grp.key, key, e.target.value)}
                        className="flex-1 border border-orange-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-bear-orange bg-white"
                      />
                      <div className="w-16 text-right shrink-0">
                        <div className="text-xs font-semibold text-bear-dark">{fmt12(times[key] ?? '')}</div>
                        {i > 0 && durations[i] && <div className="text-xs text-bear-muted">{durations[i]}</div>}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Visual period timeline */}
                <div className="bg-white rounded-xl p-3 border border-orange-100">
                  <div className="text-xs font-semibold text-bear-muted mb-2 uppercase tracking-widest">Period Timeline</div>
                  <div className="flex gap-0.5 h-6 rounded-lg overflow-hidden">
                    {[1,2,3,4,5,6].map(p => {
                      const startKey = PERIOD_KEYS[p - 1]
                      const endKey   = PERIOD_KEYS[p]
                      const start    = times[startKey] ? parseInt(times[startKey].replace(':','')) : 0
                      const end      = times[endKey]   ? parseInt(times[endKey].replace(':','')) : 0
                      const dur      = end - start
                      const colors   = ['bg-blue-400','bg-green-400','bg-amber-400','bg-red-400','bg-purple-400','bg-pink-400']
                      return (
                        <div key={p} className={`${colors[p-1]} flex items-center justify-center text-white text-xs font-bold rounded-sm`}
                          style={{ flex: dur > 0 ? dur : 1, opacity: dur > 0 ? 1 : 0.2 }}>
                          {dur > 10 ? `P${p}` : ''}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {saveMsg && (
          <div className={`text-sm rounded-xl px-4 py-2 ${saveMsg.startsWith('✅') ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {saveMsg}
          </div>
        )}

        <button onClick={handleSave} disabled={saving}
          className="bg-bear-orange hover:bg-orange-600 disabled:opacity-60 text-white font-bold px-8 py-3 rounded-xl text-sm transition-colors">
          {saving ? 'Saving…' : 'Save All Schedules'}
        </button>
      </main>
    </div>
  )
}
