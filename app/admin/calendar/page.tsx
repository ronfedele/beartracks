'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import Nav from '@/components/Nav'
import type { CalendarDay, DayType, UserProfile } from '@/lib/types'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, getDay, addMonths, subMonths, isToday } from 'date-fns'

const DAY_TYPE_CONFIG: Record<DayType, { label: string; color: string; bg: string; ring: string }> = {
  regular: { label: 'Regular', color: 'text-green-800', bg: 'bg-green-50', ring: 'ring-green-300' },
  minimum: { label: 'Minimum', color: 'text-amber-800', bg: 'bg-amber-50', ring: 'ring-amber-300' },
  rally:   { label: 'Rally',   color: 'text-purple-800', bg: 'bg-purple-50', ring: 'ring-purple-300' },
}

export default function AdminCalendarPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [month, setMonth] = useState(new Date())
  const [calendarData, setCalendarData] = useState<Record<string, CalendarDay>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/'; return }
      const { data: prof } = await supabase.from('user_profiles').select('*').eq('id', user.id).maybeSingle()
      setProfile(prof as any)
      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    loadMonth()
  }, [month])

  async function loadMonth() {
    const supabase = createClient()
    const start = format(startOfMonth(month), 'yyyy-MM-dd')
    const end = format(endOfMonth(month), 'yyyy-MM-dd')
    const { data } = await supabase.from('school_calendar').select('*').gte('date', start).lte('date', end)
    const map: Record<string, CalendarDay> = {}
    ;(data ?? []).forEach((d: CalendarDay) => { map[d.date] = d })
    setCalendarData(map)
  }

  async function setDayType(date: string, dayType: DayType) {
    setSaving(date)
    const supabase = createClient()
    await supabase.from('school_calendar').upsert({ date, day_type: dayType }, { onConflict: 'date' })
    setCalendarData(prev => ({ ...prev, [date]: { ...(prev[date] || { id: '', note: null }), date, day_type: dayType } }))
    setSaving(null)
  }

  const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) })
  const startPad = getDay(startOfMonth(month))  // 0=Sun

  if (loading) return <div className="min-h-screen bg-bear-cream flex items-center justify-center"><div className="text-bear-muted">Loading…</div></div>

  return (
    <div className="min-h-screen bg-bear-cream">
      <Nav role="admin" displayName={profile?.display_name ?? profile?.email} />
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-display font-black text-bear-dark">School Calendar</h1>
          <p className="text-bear-muted mt-1">All days default to Regular. Click any day to change its schedule type.</p>
        </div>

        {/* Legend */}
        <div className="flex gap-3 flex-wrap">
          {(Object.entries(DAY_TYPE_CONFIG) as [DayType, typeof DAY_TYPE_CONFIG[DayType]][]).map(([type, cfg]) => (
            <div key={type} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${cfg.bg} ${cfg.color}`}>
              <span className="w-2 h-2 rounded-full bg-current opacity-60" />
              {cfg.label}
            </div>
          ))}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold bg-gray-100 text-gray-500">
            <span className="w-2 h-2 rounded-full bg-current opacity-60" />
            Regular (default)
          </div>
        </div>

        <div className="card">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-6">
            <button onClick={() => setMonth(m => subMonths(m, 1))} className="text-bear-orange hover:text-orange-600 p-2 rounded-xl hover:bg-orange-50 transition-colors text-xl">‹</button>
            <h2 className="text-2xl font-display font-black text-bear-dark">{format(month, 'MMMM yyyy')}</h2>
            <button onClick={() => setMonth(m => addMonths(m, 1))} className="text-bear-orange hover:text-orange-600 p-2 rounded-xl hover:bg-orange-50 transition-colors text-xl">›</button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="text-center text-xs font-semibold text-bear-muted uppercase tracking-widest py-2">{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Padding cells */}
            {Array.from({ length: startPad }).map((_, i) => <div key={`pad-${i}`} />)}

            {days.map(day => {
              const dateStr = format(day, 'yyyy-MM-dd')
              const saved = calendarData[dateStr]
              const dayType: DayType = saved?.day_type ?? 'regular'
              const cfg = DAY_TYPE_CONFIG[dayType]
              const isSaving = saving === dateStr
              const dow = getDay(day)
              const isWeekend = dow === 0 || dow === 6
              const today_ = isToday(day)

              return (
                <div key={dateStr} className="relative group">
                  {/* Day cell */}
                  <div className={`aspect-square flex flex-col items-center justify-center rounded-xl border-2 transition-all cursor-pointer select-none
                    ${today_ ? 'border-bear-orange shadow-sm' : 'border-transparent'}
                    ${isWeekend ? 'opacity-30 cursor-default' : `${cfg.bg} hover:ring-2 ${cfg.ring}`}
                    ${isSaving ? 'opacity-60' : ''}
                  `}>
                    <span className={`text-sm font-bold ${today_ ? 'text-bear-orange' : isWeekend ? 'text-gray-400' : cfg.color}`}>
                      {format(day, 'd')}
                    </span>
                    {!isWeekend && dayType !== 'regular' && (
                      <span className={`text-xs font-semibold ${cfg.color} opacity-80 leading-none`}>
                        {cfg.label.substring(0, 3)}
                      </span>
                    )}
                  </div>

                  {/* Dropdown on hover (weekdays only) */}
                  {!isWeekend && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 z-20 hidden group-hover:flex flex-col bg-white rounded-xl shadow-xl border border-orange-100 overflow-hidden mt-1 min-w-28">
                      {(Object.entries(DAY_TYPE_CONFIG) as [DayType, typeof DAY_TYPE_CONFIG[DayType]][]).map(([type, c]) => (
                        <button key={type} onClick={() => setDayType(dateStr, type)}
                          className={`px-4 py-2 text-sm font-medium text-left hover:${c.bg} ${dayType === type ? `${c.bg} ${c.color} font-semibold` : 'text-bear-muted'} transition-colors`}>
                          {c.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </main>
    </div>
  )
}
