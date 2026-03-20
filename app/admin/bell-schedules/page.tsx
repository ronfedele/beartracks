'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import Nav from '@/components/Nav'
import type { UserProfile } from '@/lib/types'

const DAY_TYPES = [
  { key: 'regular', label: 'Regular Day',  icon: '📅', tabColor: 'bg-blue-600',   border: 'border-blue-300',   bg: 'bg-blue-50',   badge: 'bg-blue-100 text-blue-800',   ring: 'focus:ring-blue-400'   },
  { key: 'minimum', label: 'Minimum Day',  icon: '⏱️', tabColor: 'bg-green-600',  border: 'border-green-300',  bg: 'bg-green-50',  badge: 'bg-green-100 text-green-800',  ring: 'focus:ring-green-400'  },
  { key: 'rally',   label: 'Rally Day',    icon: '📣', tabColor: 'bg-purple-600', border: 'border-purple-300', bg: 'bg-purple-50', badge: 'bg-purple-100 text-purple-800', ring: 'focus:ring-purple-400' },
]

const PERIODS = [1, 2, 3, 4, 5, 6]

// Each schedule row has: day_start, p1_start/p1_end ... p6_start/p6_end
function emptyTimes() {
  const t: Record<string, string> = { day_start: '' }
  for (let p = 1; p <= 6; p++) { t[`p${p}_start`] = ''; t[`p${p}_end`] = '' }
  return t
}

function fmt12(t: string): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h < 12 ? 'am' : 'pm'
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')}${ampm}`
}

function durMin(start: string, end: string): string {
  if (!start || !end) return ''
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const dur = (eh * 60 + em) - (sh * 60 + sm)
  return dur > 0 ? `${dur}m` : ''
}

const PERIOD_COLORS = [
  'bg-blue-400', 'bg-emerald-400', 'bg-amber-400',
  'bg-red-400',  'bg-purple-400',  'bg-pink-400',
]

export default function BellSchedulesPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeType, setActiveType] = useState('regular')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  // schedules[dayType][gradeGroup] = { day_start, p1_start, p1_end, ... }
  const [schedules, setSchedules] = useState<Record<string, Record<number, Record<string, string>>>>({
    regular: { 7: emptyTimes(), 8: emptyTimes() },
    minimum: { 7: emptyTimes(), 8: emptyTimes() },
    rally:   { 7: emptyTimes(), 8: emptyTimes() },
  })
  const [rowIds, setRowIds] = useState<Record<string, Record<number, string>>>({
    regular: {}, minimum: {}, rally: {},
  })

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
      regular: { 7: emptyTimes(), 8: emptyTimes() },
      minimum: { 7: emptyTimes(), 8: emptyTimes() },
      rally:   { 7: emptyTimes(), 8: emptyTimes() },
    }
    const nextIds: Record<string, Record<number, string>> = { regular: {}, minimum: {}, rally: {} }

    ;(data ?? []).forEach((row: any) => {
      const p = row.profile as string
      const g = row.grade_group as number
      if (!next[p] || next[p][g] === undefined) return
      // Trim seconds from all time fields
      const trim = (t: string) => (t ?? '').substring(0, 5)
      next[p][g].day_start = trim(row.day_start)
      for (let i = 1; i <= 6; i++) {
        next[p][g][`p${i}_start`] = trim(row[`p${i}_start`])
        next[p][g][`p${i}_end`]   = trim(row[`p${i}_end`])
      }
      nextIds[p][g] = row.id
    })
    setSchedules(next)
    setRowIds(nextIds)
  }

  function setTime(dayType: string, group: number, key: string, value: string) {
    setSchedules(prev => ({
      ...prev,
      [dayType]: { ...prev[dayType], [group]: { ...prev[dayType][group], [key]: value } }
    }))
    setSaveMsg('')
  }

  // Auto-fill: when a period end is entered, pre-fill the next period's start
  function handleEndChange(dayType: string, group: number, period: number, value: string) {
    const updates: Record<string, string> = { [`p${period}_end`]: value }
    // Pre-fill next period start if it's empty
    if (period < 6) {
      const current = schedules[dayType][group][`p${period + 1}_start`]
      if (!current) updates[`p${period + 1}_start`] = value
    }
    setSchedules(prev => ({
      ...prev,
      [dayType]: { ...prev[dayType], [group]: { ...prev[dayType][group], ...updates } }
    }))
    setSaveMsg('')
  }

  // Auto-fill: when school start is set, pre-fill P1 start
  function handleDayStartChange(dayType: string, group: number, value: string) {
    const current = schedules[dayType][group]['p1_start']
    const updates: Record<string, string> = { day_start: value }
    if (!current) updates['p1_start'] = value
    setSchedules(prev => ({
      ...prev,
      [dayType]: { ...prev[dayType], [group]: { ...prev[dayType][group], ...updates } }
    }))
    setSaveMsg('')
  }

  async function handleSave() {
    setSaving(true); setSaveMsg('')
    const supabase = createClient()
    const upserts: any[] = []

    for (const dt of ['regular', 'minimum', 'rally']) {
      for (const g of [7, 8]) {
        const t = schedules[dt][g]
        const row: any = { profile: dt, grade_group: g, day_start: t.day_start || null }
        for (let i = 1; i <= 6; i++) {
          row[`p${i}_start`] = t[`p${i}_start`] || null
          row[`p${i}_end`]   = t[`p${i}_end`]   || null
        }
        if (rowIds[dt][g]) row.id = rowIds[dt][g]
        upserts.push(row)
      }
    }

    const { error } = await supabase.from('schedules').upsert(upserts, { onConflict: 'profile,grade_group' })
    if (error) setSaveMsg(`Error: ${error.message}`)
    else { setSaveMsg('✅ All schedules saved successfully'); await loadSchedules() }
    setSaving(false)
  }

  const typeInfo = DAY_TYPES.find(d => d.key === activeType)!

  if (loading) return <div className="min-h-screen bg-bear-cream flex items-center justify-center"><div className="text-bear-muted">Loading…</div></div>

  return (
    <div className="min-h-screen bg-bear-cream">
      <Nav role="admin" displayName={profile?.display_name ?? profile?.email} />
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">

        <div>
          <h1 className="text-4xl font-display font-black text-bear-dark">Bell Schedules</h1>
          <p className="text-bear-muted mt-1">Set start and end times for each period · changes affect all pass logic immediately</p>
        </div>

        {/* Day type tabs */}
        <div className="flex gap-2 flex-wrap">
          {DAY_TYPES.map(dt => (
            <button key={dt.key} onClick={() => setActiveType(dt.key)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm border-2 transition-all ${activeType === dt.key ? `${dt.tabColor} text-white border-transparent shadow-md` : 'bg-white border-orange-200 text-bear-dark hover:border-orange-300'}`}>
              {dt.icon} {dt.label}
            </button>
          ))}
        </div>

        {/* Two group columns */}
        <div className="grid md:grid-cols-2 gap-6">
          {[7, 8].map(grp => {
            const times = schedules[activeType][grp]
            return (
              <div key={grp} className={`card border-2 ${typeInfo.border} ${typeInfo.bg} space-y-0 p-0 overflow-hidden`}>
                {/* Header */}
                <div className={`px-5 py-3 border-b ${typeInfo.border} flex items-center justify-between`}>
                  <div>
                    <h2 className="text-lg font-bold text-bear-dark">Group {grp}</h2>
                    <p className="text-xs text-bear-muted">{grp === 7 ? '7th grade bell times' : '8th grade bell times'}</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${typeInfo.badge}`}>{typeInfo.label}</span>
                </div>

                <div className="divide-y divide-orange-100">
                  {/* School start */}
                  <div className="px-5 py-3 flex items-center gap-3 bg-white/60">
                    <div className="w-6 h-6 rounded-full bg-gray-400 flex items-center justify-center text-white text-xs font-bold shrink-0">🔔</div>
                    <div className="flex-1">
                      <div className="text-xs font-bold text-bear-dark uppercase tracking-widest">School Start</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="time" value={times.day_start}
                        onChange={e => handleDayStartChange(activeType, grp, e.target.value)}
                        className={`w-32 border border-orange-200 rounded-xl px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 ${typeInfo.ring} bg-white`} />
                      <span className="text-xs text-bear-muted w-14 text-right">{fmt12(times.day_start)}</span>
                    </div>
                  </div>

                  {/* Each period */}
                  {PERIODS.map(p => {
                    const startKey = `p${p}_start`
                    const endKey   = `p${p}_end`
                    const dur = durMin(times[startKey], times[endKey])
                    return (
                      <div key={p} className="px-5 py-3 space-y-2">
                        {/* Period header */}
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded-full ${PERIOD_COLORS[p-1]} flex items-center justify-center text-white text-xs font-bold shrink-0`}>{p}</div>
                          <span className="text-sm font-bold text-bear-dark">Period {p}</span>
                          {dur && <span className="text-xs text-bear-muted bg-white border border-orange-100 rounded-full px-2 py-0.5 ml-auto">{dur}</span>}
                        </div>
                        {/* Start / End inputs */}
                        <div className="grid grid-cols-2 gap-3 pl-8">
                          <div>
                            <label className="block text-xs font-semibold text-bear-muted mb-1">Start</label>
                            <div className="flex items-center gap-1.5">
                              <input type="time" value={times[startKey]}
                                onChange={e => setTime(activeType, grp, startKey, e.target.value)}
                                className={`w-full border border-orange-200 rounded-xl px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 ${typeInfo.ring} bg-white`} />
                              <span className="text-xs text-bear-muted whitespace-nowrap hidden lg:block">{fmt12(times[startKey])}</span>
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-bear-muted mb-1">End</label>
                            <div className="flex items-center gap-1.5">
                              <input type="time" value={times[endKey]}
                                onChange={e => handleEndChange(activeType, grp, p, e.target.value)}
                                className={`w-full border border-orange-200 rounded-xl px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 ${typeInfo.ring} bg-white`} />
                              <span className="text-xs text-bear-muted whitespace-nowrap hidden lg:block">{fmt12(times[endKey])}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Visual timeline */}
                <div className="px-5 py-4 bg-white/40 border-t border-orange-100">
                  <div className="text-xs font-semibold text-bear-muted mb-2 uppercase tracking-widest">Timeline</div>
                  <div className="flex gap-0.5 h-7 rounded-lg overflow-hidden">
                    {PERIODS.map(p => {
                      const s = times[`p${p}_start`], e = times[`p${p}_end`]
                      if (!s || !e) return (
                        <div key={p} className="flex-1 bg-gray-200 rounded-sm flex items-center justify-center text-xs text-gray-400 font-bold">{p}</div>
                      )
                      const [sh, sm] = s.split(':').map(Number)
                      const [eh, em] = e.split(':').map(Number)
                      const dur = (eh * 60 + em) - (sh * 60 + sm)
                      return (
                        <div key={p} className={`${PERIOD_COLORS[p-1]} flex items-center justify-center text-white text-xs font-bold rounded-sm`}
                          style={{ flex: Math.max(dur, 1) }}>
                          P{p}
                        </div>
                      )
                    })}
                  </div>
                  {/* Time axis labels */}
                  <div className="flex justify-between mt-1">
                    <span className="text-xs text-bear-muted">{fmt12(times.p1_start || times.day_start)}</span>
                    <span className="text-xs text-bear-muted">{fmt12(times.p6_end)}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {saveMsg && (
          <div className={`text-sm rounded-xl px-4 py-2.5 ${saveMsg.startsWith('✅') ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {saveMsg}
          </div>
        )}

        <div className="flex items-center gap-4">
          <button onClick={handleSave} disabled={saving}
            className="bg-bear-orange hover:bg-orange-600 disabled:opacity-60 text-white font-bold px-8 py-3 rounded-xl text-sm transition-colors">
            {saving ? 'Saving…' : 'Save All Schedules'}
          </button>
          <p className="text-xs text-bear-muted">Saves all three day types and both groups at once. Entering a period end auto-fills the next period's start.</p>
        </div>
      </main>
    </div>
  )
}
