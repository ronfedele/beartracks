import { createClient } from './supabase'
import type { DayType, DenialResult, ApprovalResult } from './types'

const BATHROOM_NAMES = ['bathroom']
const WATER_NAMES    = ['water fountain']
const BW_NAMES       = [...BATHROOM_NAMES, ...WATER_NAMES]

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export async function getEffectiveMinutes(): Promise<number> {
  const supabase = createClient()
  const { data: enabled } = await supabase.from('settings').select('value').eq('key', 'test_clock_enabled').maybeSingle()
  if (enabled?.value === 'true') {
    const { data: clockTime } = await supabase.from('settings').select('value').eq('key', 'test_clock_time').maybeSingle()
    if (clockTime?.value && /^\d{1,2}:\d{2}$/.test(clockTime.value)) {
      return timeToMinutes(clockTime.value)
    }
  }
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

export async function getTodayDayType(): Promise<DayType> {
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]
  const { data } = await supabase
    .from('school_calendar').select('day_type').eq('date', today).maybeSingle()
  return (data?.day_type as DayType) ?? 'regular'
}

async function getRoomPeriodTimes(roomId: string, dayType: DayType): Promise<{ periods: number[] } | null> {
  const supabase = createClient()
  const { data: room } = await supabase.from('rooms').select('bell_schedule').eq('id', roomId).maybeSingle()
  if (!room) return null

  if (room.bell_schedule === 9) {
    const { data: vc } = await supabase.from('varied_schedule_config').select('*').eq('room_id', roomId).maybeSingle()
    const { data: scheds } = await supabase.from('schedules').select('*').eq('profile', dayType).in('grade_group', [7, 8])
    if (!vc || !scheds || scheds.length < 2) return null
    const s7 = scheds.find((s: any) => s.grade_group === 7)
    const s8 = scheds.find((s: any) => s.grade_group === 8)
    if (!s7 || !s8) return null
    const groups = [vc.p1_group, vc.p2_group, vc.p3_group, vc.p4_group, vc.p5_group, vc.p6_group]
    const periods: number[] = []
    for (let i = 0; i < 6; i++) {
      const src = groups[i] === 7 ? s7 : s8
      periods.push(timeToMinutes(src[`p${i+1}_start`] ?? src.day_start))
      periods.push(timeToMinutes(src[`p${i+1}_end`]))
    }
    return { periods }
  }

  const { data: sched } = await supabase.from('schedules').select('*').eq('grade_group', room.bell_schedule).eq('profile', dayType).maybeSingle()
  if (!sched) return null
  return {
    periods: [
      sched.p1_start ?? sched.day_start, sched.p1_end,
      sched.p2_start ?? sched.p1_end,   sched.p2_end,
      sched.p3_start ?? sched.p2_end,   sched.p3_end,
      sched.p4_start ?? sched.p3_end,   sched.p4_end,
      sched.p5_start ?? sched.p4_end,   sched.p5_end,
      sched.p6_start ?? sched.p5_end,   sched.p6_end,
    ].map(timeToMinutes)
  }
}

export async function getTimeRestrictionDenial(roomId: string, dayType: DayType): Promise<string | null> {
  const supabase = createClient()
  const { data: s1 } = await supabase.from('settings').select('value').eq('key', 'enable_time_restrictions').maybeSingle()
  if (s1?.value !== 'true') return null
  const { data: s2 } = await supabase.from('settings').select('value').eq('key', 'first_last_minutes').maybeSingle()
  const blockMin = parseInt(s2?.value ?? '10', 10)
  const result = await getRoomPeriodTimes(roomId, dayType)
  if (!result) return null
  const nowMin = await getEffectiveMinutes()
  for (let i = 0; i < result.periods.length; i += 2) {
    const start = result.periods[i], end = result.periods[i + 1]
    if (!start || !end) continue
    if (nowMin >= start && nowMin < end) {
      const periodNum = (i / 2) + 1
      const minutesIn = nowMin - start, minutesLeft = end - nowMin
      if (minutesIn < blockMin) return `Cannot sign out in the first ${blockMin} minutes of class (${minutesIn} min into period ${periodNum})`
      if (minutesLeft < blockMin) return `Cannot sign out in the last ${blockMin} minutes of class (${minutesLeft} min left in period ${periodNum})`
      return null
    }
  }
  return null
}

export async function checkRoomPassLimit(
  studentId: string,
  roomId: string,
  destName: string
): Promise<{ limited: false } | { limited: true; used: number; max: number; note: string | null; destType: string }> {
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]
  const isBathroom = BATHROOM_NAMES.includes(destName)
  const isWater    = WATER_NAMES.includes(destName)
  if (!isBathroom && !isWater) return { limited: false }

  const { data: limits } = await supabase
    .from('room_pass_limits').select('*').eq('room_id', roomId).eq('active', true)
    .lte('start_date', today).gte('end_date', today)
  if (!limits || limits.length === 0) return { limited: false }

  for (const limit of limits) {
    const applies =
      limit.destination_type === 'both' ||
      (isBathroom && limit.destination_type === 'bathroom') ||
      (isWater    && limit.destination_type === 'water')
    if (!applies) continue

    let used = 0
    if (limit.destination_type === 'bathroom' || (limit.destination_type === 'both' && isBathroom)) {
      const { data: c } = await supabase.rpc('count_student_bathroom_passes', {
        p_student_id: studentId, p_room_id: roomId,
        p_start_date: limit.start_date, p_end_date: limit.end_date,
      })
      if (limit.destination_type === 'both') {
        const { data: cw } = await supabase.rpc('count_student_water_passes', {
          p_student_id: studentId, p_room_id: roomId,
          p_start_date: limit.start_date, p_end_date: limit.end_date,
        })
        used = Number(c ?? 0) + Number(cw ?? 0)
      } else {
        used = Number(c ?? 0)
      }
    } else if (limit.destination_type === 'water') {
      const { data: c } = await supabase.rpc('count_student_water_passes', {
        p_student_id: studentId, p_room_id: roomId,
        p_start_date: limit.start_date, p_end_date: limit.end_date,
      })
      used = Number(c ?? 0)
    }
    if (used >= limit.max_passes) {
      return { limited: true, used, max: limit.max_passes, note: limit.note, destType: limit.destination_type }
    }
  }
  return { limited: false }
}

export async function requestPass(params: {
  studentId: string
  roomId: string
  destinationId: string
  outBy: string
  teacherEmail: string
  // Separate override flags so teacher can override each independently
  teacherOverride?: boolean        // overrides pass limits
  escortOverride?: boolean         // overrides escort-required denial
  timeOverride?: boolean           // overrides time restriction denial
}): Promise<ApprovalResult | DenialResult> {
  const supabase = createClient()

  const { data: student } = await supabase.from('students').select('*').eq('id', params.studentId).maybeSingle()
  if (!student) return { approved: false, reason: 'Student not found.' }
  if (!student.active) return { approved: false, reason: 'Student is inactive.' }

  // ── Escort Required — denied unless teacher explicitly overrides ──
  if (student.no_roam && !params.escortOverride) {
    return {
      approved: false,
      reason: 'Escort Required — this student cannot leave without a teacher escort.',
      escortDenial: true,
    } as any
  }

  const { data: existing } = await supabase.from('passes').select('id').eq('student_id', params.studentId).eq('status', 'OUT').maybeSingle()
  if (existing) return { approved: false, reason: 'Student is already signed out.' }

  const { data: dest } = await supabase.from('destinations').select('name').eq('id', params.destinationId).maybeSingle()
  const destName = dest?.name?.toLowerCase() ?? ''
  const isBW = BW_NAMES.includes(destName)

  if (isBW) {
    // One bathroom/water out at a time per room
    const bwIds = await supabase.from('destinations').select('id').in('name', ['Bathroom', 'Water Fountain'])
      .then(r => (r.data ?? []).map((d: any) => d.id))
    const { data: roomOut } = await supabase
      .from('passes').select('id, student:students(first_name, last_name), destination:destinations(name)')
      .eq('room_id', params.roomId).eq('status', 'OUT').in('destination_id', bwIds).maybeSingle()
    if (roomOut) {
      const s = roomOut.student as any
      const name = s ? `${s.first_name} ${s.last_name}` : 'Another student'
      const where = (roomOut.destination as any)?.name ?? 'bathroom/water'
      return { approved: false, reason: `${name} is already out for ${where}. Only one student may be out for bathroom/water at a time.` }
    }

    // Pass limit — overridable by teacher
    if (!params.teacherOverride) {
      const limitCheck = await checkRoomPassLimit(params.studentId, params.roomId, destName)
      if (limitCheck.limited) {
        const destLabel = limitCheck.destType === 'bathroom' ? 'bathroom' : limitCheck.destType === 'water' ? 'water fountain' : 'bathroom/water'
        return {
          approved: false,
          reason: `Pass limit reached: ${limitCheck.used}/${limitCheck.max} ${destLabel} passes used${limitCheck.note ? ` (${limitCheck.note})` : ''}.`,
          limitDenial: true,
        } as any
      }
    }
  }

  // Room block — not overridable
  const { data: block } = await supabase.from('room_blocks').select('reason, expires_at').eq('room_id', params.roomId)
    .or(`student_id.is.null,student_id.eq.${params.studentId}`)
    .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
    .maybeSingle()
  if (block) return { approved: false, reason: block.reason ?? 'Passes are currently blocked for this room.' }

  // Time restriction — overridable by teacher
  if (!params.timeOverride) {
    const dayType = await getTodayDayType()
    const timeDenial = await getTimeRestrictionDenial(params.roomId, dayType)
    if (timeDenial) {
      return {
        approved: false,
        reason: timeDenial,
        timeDenial: true,
      } as any
    }
  }

  // ── All checks passed — create the pass ──
  const overrideTag = params.escortOverride ? 'ESCORT_OVERRIDE' : params.teacherOverride ? 'LIMIT_OVERRIDE' : params.timeOverride ? 'TIME_OVERRIDE' : null
  const outBy = overrideTag ? `${overrideTag}:${params.outBy}` : params.outBy

  const { data: pass, error } = await supabase.from('passes').insert({
    student_id: params.studentId, room_id: params.roomId, destination_id: params.destinationId,
    status: 'OUT', approved: true,
    out_by: outBy,
    teacher_email: params.teacherEmail,
  }).select('id').single()

  if (error || !pass) return { approved: false, reason: 'Database error. Please try again.' }

  // Escort override: pass is issued but terminal should show yellow
  if (params.escortOverride && student.no_roam) {
    return { approved: true, passId: pass.id, escort: true, reason: 'Escort Required — teacher must accompany student.' }
  }

  return { approved: true, passId: pass.id }
}

export async function signStudentIn(passId: string): Promise<boolean> {
  const supabase = createClient()
  const { error } = await supabase.from('passes')
    .update({ status: 'IN', in_time: new Date().toISOString() })
    .eq('id', passId).eq('status', 'OUT')
  return !error
}
