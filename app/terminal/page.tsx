'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { requestPass, signStudentIn, getTodayDayType } from '@/lib/passes'
import type { Student, Destination, Room, Pass } from '@/lib/types'

// Terminal is accessed via URL like /terminal?room=omsr14@konoctiusd.org
// or configured via terminal user account linked to a room

interface TerminalState {
  step: 'idle' | 'name' | 'destination' | 'result'
  query: string
  matches: Student[]
  selected: Student | null
  result: { approved: boolean; reason?: string; passId?: string; escort?: boolean; escortDenial?: boolean } | null
}

const IDLE_TIMEOUT = 12000 // 12s back to idle

export default function TerminalPage() {
  const [room, setRoom] = useState<Room | null>(null)
  const [destinations, setDestinations] = useState<Destination[]>([])
  const [state, setState] = useState<TerminalState>({
    step: 'idle', query: '', matches: [], selected: null, result: null,
  })
  const [activeOut, setActiveOut] = useState<(Pass & { student: Student })[]>([])
  const [currentTime, setCurrentTime] = useState(new Date())
  const idleTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const inputRef = useRef<HTMLInputElement>(null)

  // Load room from URL param or terminal auth
  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const params = new URLSearchParams(window.location.search)
      const roomEmail = params.get('room')

      let roomData: Room | null = null
      if (roomEmail) {
        const { data } = await supabase.from('rooms').select('*').eq('room_email', roomEmail).maybeSingle()
        roomData = data
      } else {
        // Try auth-based room lookup
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: profile } = await supabase.from('user_profiles').select('*, room:rooms(*)').eq('id', user.id).maybeSingle()
          roomData = profile?.room ?? null
        }
      }
      setRoom(roomData)

      const { data: dests } = await supabase.from('destinations').select('*').eq('active', true).order('sort_order')
      setDestinations(dests ?? [])
    }
    init()
  }, [])

  // Clock
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Load currently-out students for this room
  useEffect(() => {
    if (!room) return
    const supabase = createClient()
    async function loadOut() {
      const { data } = await supabase
        .from('passes')
        .select('*, student:students(*)')
        .eq('room_id', room!.id)
        .eq('status', 'OUT')
        .order('out_time')
      setActiveOut((data ?? []) as any)
    }
    loadOut()
    const channel = supabase.channel('terminal-passes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'passes', filter: `room_id=eq.${room.id}` }, loadOut)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [room])

  // Auto-idle timer
  function resetIdleTimer() {
    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(goIdle, IDLE_TIMEOUT)
  }

  function goIdle() {
    setState({ step: 'idle', query: '', matches: [], selected: null, result: null })
    if (idleTimer.current) clearTimeout(idleTimer.current)
  }

  async function handleStartSignOut() {
    setState(s => ({ ...s, step: 'name', query: '' }))
    resetIdleTimer()
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  async function handleNameSearch(q: string) {
    setState(s => ({ ...s, query: q }))
    resetIdleTimer()
    if (q.length < 2) { setState(s => ({ ...s, matches: [] })); return }
    const supabase = createClient()
    const { data } = await supabase
      .from('students')
      .select('*')
      .eq('active', true)
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
      .order('last_name')
      .limit(8)
    setState(s => ({ ...s, matches: data ?? [] }))
  }

  function handleSelectStudent(student: Student) {
    setState(s => ({ ...s, step: 'destination', selected: student }))
    resetIdleTimer()
  }

  async function handleSelectDestination(dest: Destination) {
    if (!room || !state.selected) return
    resetIdleTimer()

    const result = await requestPass({
      studentId: state.selected.id,
      roomId: room.id,
      destinationId: dest.id,
      outBy: room.room_email,
      teacherEmail: room.teacher_email,
    })
    setState(s => ({ ...s, step: 'result', result }))

    // Auto back to idle after showing result
    setTimeout(goIdle, (!result.approved || result.escort || result.escortDenial) ? 7000 : 5000)
  }

  async function handleSignIn(pass: Pass & { student: Student }) {
    await signStudentIn(pass.id)
    resetIdleTimer()
  }

  const timeStr = currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  const dateStr = currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  if (!room) {
    return (
      <div className="terminal-screen flex items-center justify-center min-h-screen paw-bg">
        <div className="text-center text-white">
          <div className="text-5xl mb-4">🐾</div>
          <div className="text-xl font-display font-bold">Bear Tracks Terminal</div>
          <div className="text-white/40 text-sm mt-2">Loading room configuration…</div>
        </div>
      </div>
    )
  }

  return (
    <div className="terminal-screen min-h-screen flex flex-col paw-bg" onClick={resetIdleTimer}>
      {/* Header */}
      <header className="px-8 py-5 flex items-center justify-between border-b border-white/10">
        <div>
          <div className="text-bear-orange font-display font-bold text-2xl">🐾 Bear Tracks</div>
          <div className="text-white/40 text-sm">{room.room_number} · {room.teacher_name}</div>
        </div>
        <div className="text-right">
          <div className="text-white text-3xl font-mono font-light">{timeStr}</div>
          <div className="text-white/40 text-sm">{dateStr}</div>
        </div>
      </header>

      <div className="flex flex-1 gap-0">
        {/* Main interaction area */}
        <div className="flex-1 flex flex-col items-center justify-center px-8 py-10">

          {/* IDLE */}
          {state.step === 'idle' && (
            <div className="text-center animate-fade-in">
              <div className="text-8xl mb-6">🐾</div>
              <h2 className="text-4xl font-display font-black text-white mb-3">
                Need a Pass?
              </h2>
              <p className="text-white/50 text-lg mb-10">Tap below to sign out of class</p>
              <button
                onClick={handleStartSignOut}
                className="bg-bear-orange hover:bg-orange-500 active:scale-95 text-white text-2xl font-bold px-16 py-6 rounded-3xl shadow-2xl shadow-orange-900/50 transition-all duration-150"
              >
                Sign Out
              </button>
            </div>
          )}

          {/* NAME SEARCH */}
          {state.step === 'name' && (
            <div className="w-full max-w-lg animate-fade-in">
              <button onClick={goIdle} className="text-white/30 hover:text-white/70 text-sm mb-6 transition-colors">← Cancel</button>
              <h2 className="text-3xl font-display font-black text-white mb-2">Your Name</h2>
              <p className="text-white/50 mb-6">Type your first or last name</p>
              <input
                ref={inputRef}
                type="text"
                value={state.query}
                onChange={e => handleNameSearch(e.target.value)}
                className="w-full bg-white/10 border-2 border-white/20 focus:border-bear-orange rounded-2xl px-5 py-4 text-white text-xl placeholder-white/30 outline-none transition-colors"
                placeholder="e.g. Smith or Emma"
                autoComplete="off"
              />
              <div className="mt-4 space-y-2">
                {state.matches.map(s => (
                  <button
                    key={s.id}
                    onClick={() => handleSelectStudent(s)}
                    className="w-full bg-white/10 hover:bg-bear-orange/80 active:bg-bear-orange border border-white/15 hover:border-bear-orange rounded-2xl px-5 py-4 text-left transition-all group"
                  >
                    <span className="text-white font-semibold text-lg group-hover:text-white">
                      {s.preferred_name || s.first_name} {s.last_name}
                    </span>
                    <span className="text-white/40 text-sm ml-3 group-hover:text-white/70">
                      Grade {s.grade}
                    </span>
                  </button>
                ))}
                {state.query.length >= 2 && state.matches.length === 0 && (
                  <div className="text-white/40 text-center py-6">No students found — use full legal name</div>
                )}
              </div>
            </div>
          )}

          {/* DESTINATION */}
          {state.step === 'destination' && state.selected && (
            <div className="w-full max-w-lg animate-fade-in">
              <button onClick={() => setState(s => ({ ...s, step: 'name' }))} className="text-white/30 hover:text-white/70 text-sm mb-4 transition-colors">← Back</button>
              <h2 className="text-3xl font-display font-black text-white mb-1">
                Hi, {state.selected.preferred_name || state.selected.first_name}!
              </h2>
              <p className="text-white/50 mb-8">Where are you going?</p>
              <div className="grid grid-cols-2 gap-3">
                {destinations.map(dest => (
                  <button
                    key={dest.id}
                    onClick={() => handleSelectDestination(dest)}
                    className="bg-white/10 hover:bg-bear-orange/80 active:scale-95 border border-white/15 hover:border-transparent rounded-2xl px-4 py-5 text-white font-semibold text-lg transition-all"
                  >
                    {dest.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* RESULT */}
          {state.step === 'result' && state.result && (() => {
            const { approved, escort, reason } = state.result
            if (!approved && state.result?.escortDenial) return (
              // ── ESCORT REQUIRED — YELLOW (denied at terminal) ──
              <div className="text-center animate-fade-in w-full max-w-md">
                <div className="bg-amber-500/25 border-2 border-amber-400 rounded-3xl px-10 py-12 shadow-2xl shadow-amber-900/40">
                  <div className="text-8xl mb-6">⚠️</div>
                  <h2 className="text-5xl font-display font-black text-amber-300 mb-3">Escort Required</h2>
                  <p className="text-amber-200 text-xl font-semibold mb-2">See your teacher before leaving.</p>
                  <p className="text-amber-200/60 text-base">A teacher must issue this pass from their login.</p>
                  <p className="text-amber-400/40 text-sm mt-6">Screen resets in 7 seconds</p>
                </div>
              </div>
            )
            if (!approved) return (
              // ── DENIED — RED ──
              <div className="text-center animate-fade-in w-full max-w-md denied-shake">
                <div className="bg-red-600/30 border-2 border-red-500 rounded-3xl px-10 py-12 shadow-2xl shadow-red-900/60">
                  <div className="text-8xl mb-6">🚫</div>
                  <h2 className="text-6xl font-display font-black text-red-300 mb-4">Denied</h2>
                  <p className="text-red-200 text-lg font-medium leading-snug">{reason}</p>
                  <p className="text-red-400/50 text-sm mt-6">Screen resets in 7 seconds</p>
                </div>
              </div>
            )
            if (escort) return (
              // ── ESCORT REQUIRED — YELLOW ──
              <div className="text-center animate-fade-in w-full max-w-md">
                <div className="bg-amber-500/25 border-2 border-amber-400 rounded-3xl px-10 py-12 shadow-2xl shadow-amber-900/40">
                  <div className="text-8xl mb-6">⚠️</div>
                  <h2 className="text-5xl font-display font-black text-amber-300 mb-3">Escort Required</h2>
                  <p className="text-amber-200 text-xl font-semibold mb-2">See your teacher before leaving.</p>
                  <p className="text-amber-200/60 text-base">Your pass has been issued — a teacher must accompany you.</p>
                  <p className="text-amber-400/40 text-sm mt-6">Screen resets in 7 seconds</p>
                </div>
              </div>
            )
            return (
              // ── APPROVED — BLUE ──
              <div className="text-center animate-fade-in w-full max-w-md approved-flash">
                <div className="bg-blue-600/30 border-2 border-blue-400 rounded-3xl px-10 py-12 shadow-2xl shadow-blue-900/60">
                  <div className="text-8xl mb-6">✅</div>
                  <h2 className="text-6xl font-display font-black text-blue-300 mb-4">Approved</h2>
                  <p className="text-blue-200 text-lg">You are signed out. Return promptly.</p>
                  <p className="text-blue-400/50 text-sm mt-6">Screen resets in 5 seconds</p>
                </div>
              </div>
            )
          })()}
        </div>

        {/* Currently Out sidebar */}
        <div className="w-72 border-l border-white/10 p-5 flex flex-col">
          <h3 className="text-white/50 text-xs uppercase tracking-widest font-semibold mb-4">Currently Out</h3>
          {activeOut.length === 0 ? (
            <div className="text-white/20 text-sm text-center mt-8">No students out</div>
          ) : (
            <div className="space-y-2 flex-1 overflow-y-auto">
              {activeOut.map(pass => {
                const elapsed = Math.round((Date.now() - new Date(pass.out_time).getTime()) / 60000)
                return (
                  <div key={pass.id} className="bg-white/5 rounded-xl p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-white text-sm font-medium truncate">
                        {pass.student?.preferred_name || pass.student?.first_name} {pass.student?.last_name}
                      </div>
                      <div className="text-white/40 text-xs mt-0.5">{elapsed}m ago</div>
                    </div>
                    <button
                      onClick={() => handleSignIn(pass)}
                      className="shrink-0 bg-green-600/80 hover:bg-green-500 text-white text-xs px-2 py-1 rounded-lg transition-colors"
                    >
                      Return
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
