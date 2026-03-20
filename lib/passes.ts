import { createClient } from './supabase'
import type { DayType, DenialResult, ApprovalResult } from './types'

const BATHROOM_WATER = ['bathroom', 'water fountain']

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export async function getTodayDayType(): Promise<DayType> {
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]
  const { data } = await supabase
    .from('school_calendar')
    .select('day_type')
    .eq('date', today)
    .maybeSingle()
  return (data?.day_type as DayType) ?? 'regular'
}

async function getRoomPeriodTimes(
  roomId: string,
  dayType: DayType
): Promise<{ periods: number[] } | null> {
  const supabase = createClient()
  const { data: room } = await supabase.from('rooms').select('bell_schedule').eq('id', roomId).maybeSingle()
  if (!room) return null

  const bellSchedule = room.bell_schedule

  if (bellSchedule === 9) {
    const { data: variedConfig } = await supabase.from('varied_schedule_config').select('*').eq('room_id', roomId).maybeSingle()
    const { data: schedules } = await supabase.from('schedules').select('*').eq('profile', dayType).in('grade_group', [7, 8])
    if (!variedConfig || !schedules || schedules.length < 2) return null
    const s7 = schedules.find((s: any) => s.grade_group === 7)
    const s8 = schedules.find((s: any) => s.grade_group === 8)
    if (!s7 || !s8) return null
    const groupNums = [variedConfig.p1_group, variedConfig.p2_group, variedConfig.p3_group, variedConfig.p4_group, variedConfig.p5_group, variedConfig.p6_group]
    const periodKeys = ['day_start', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6']
    const periods: number[] = [timeToMinutes(s7.day_start)]
    for (let i = 0; i < 6; i++) {
      const src = groupNums[i] === 7 ? s7 : s8
      periods.push(timeToMinutes(src[periodKeys[i + 1]]))
    }
    return { periods }
  }

  const { data: sched } = await supabase.from('schedules').select('*').eq('grade_group', bellSchedule).eq('profile', dayType).maybeSingle()
  if (!sched) return null
  return {
    periods: [sched.day_start, sched.p1, sched.p2, sched.p3, sched.p4, sched.p5, sched.p6].map(timeToMinutes)
  }
}

export async function getTimeRestrictionDenial(roomId: string, dayType: DayType): Promise<string | null> {
  const supabase = createClient()
  const { data: setting } = await supabase.from('settings').select('value').eq('key', 'enable_time_restrictions').maybeSingle()
  if (setting?.value !== 'true') return null
  const { data: blockSetting } = await supabase.from('settings').select('value').eq('key', 'first_last_minutes').maybeSingle()
  const blockMin = parseInt(blockSetting?.value ?? '10', 10)
  const result = await getRoomPeriodTimes(roomId, dayType)
  if (!result) return null
  const { periods } = result
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
  for (let i = 0; i < periods.length - 1; i++) {
    const start = periods[i], end = periods[i + 1]
    if (nowMin >= start && nowMin < end) {
      const minutesIn = nowMin - start, minutesLeft = end - nowMin
      if (minutesIn < blockMin) return `Cannot sign out in the first ${blockMin} minutes of class (${minutesIn} min into period ${i + 1})`
      if (minutesLeft < blockMin) return `Cannot sign out in the last ${blockMin} minutes of class (${minutesLeft} min left in period ${i + 1})`
      return null
    }
  }
  return null
}

// Check if the room has an active pass limit that this student has exhausted.
// Returns { limited: true, used, max, note } if over limit, or { limited: false }
export async function checkRoomPassLimit(
  studentId: string,
  roomId: string
): Promise<{ limited: false } | { limited: true; used: number; max: number; note: string | null }> {
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]

  // Get the active room-wide limit (one rule for the whole class)
  const { data: limit } = await supabase
    .from('room_pass_limits')
    .select('*')
    .eq('room_id', roomId)
    .eq('active', true)
    .lte('start_date', today)
    .gte('end_date', today)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!limit) return { limited: false }

  // Count how many bathroom/water passes THIS student has used in the window
  const { data: countData } = await supabase.rpc('count_student_bw_passes', {
    p_student_id: studentId,
    p_room_id:    roomId,
    p_start_date: limit.start_date,
    p_end_date:   limit.end_date,
  })

  const used = Number(countData ?? 0)
  if (used >= limit.max_passes) {
    return { limited: true, used, max: limit.max_passes, note: limit.note }
  }
  return { limited: false }
}

export async function requestPass(params: {
  studentId: string
  roomId: string
  destinationId: string
  outBy: string
  teacherEmail: string
  teacherOverride?: boolean   // true when issued from teacher login, bypasses limit
}): Promise<ApprovalResult | DenialResult> {
  const supabase = createClient()

  // 1. Get student
  const { data: student } = await supabase.from('students').select('*').eq('id', params.studentId).maybeSingle()
  if (!student) return { approved: false, reason: 'Student not found. Use full legal name.' }
  if (!student.active) return { approved: false, reason: 'Student is inactive.' }
  if (student.no_roam) return { approved: false, reason: 'Student has a No-Roam restriction. See the office.' }

  // 2. Already out?
  const { data: existing } = await supabase.from('passes').select('id').eq('student_id', params.studentId).eq('status', 'OUT').maybeSingle()
  if (existing) return { approved: false, reason: 'Student is already signed out.' }

  // 3. Get destination
  const { data: dest } = await supabase.from('destinations').select('name').eq('id', params.destinationId).maybeSingle()
  const destName = dest?.name?.toLowerCase() ?? ''
  const isBathroomWater = BATHROOM_WATER.includes(destName)

  if (isBathroomWater) {
    // 4. One-out-at-a-time per room (bathroom + water combined)
    const bwDestIds = await supabase
      .from('destinations').select('id').in('name', ['Bathroom', 'Water Fountain'])
      .then(r => (r.data ?? []).map((d: any) => d.id))

    const { data: roomOut } = await supabase
      .from('passes')
      .select('id, student:students(first_name, last_name), destination:destinations(name)')
      .eq('room_id', params.roomId)
      .eq('status', 'OUT')
      .in('destination_id', bwDestIds)
      .maybeSingle()

    if (roomOut) {
      const s = roomOut.student as any
      const name = s ? `${s.first_name} ${s.last_name}` : 'Another student'
      const where = (roomOut.destination as any)?.name ?? 'bathroom/water'
      return { approved: false, reason: `${name} is already out for ${where}. Only one student may be out for bathroom/water at a time.` }
    }

    // 5. Pass limit check — skip if teacher issued the pass as an override
    if (!params.teacherOverride) {
      const limitCheck = await checkRoomPassLimit(params.studentId, params.roomId)
      if (limitCheck.limited) {
        return {
          approved: false,
          reason: `Pass limit reached: ${limitCheck.used}/${limitCheck.max} bathroom/water passes used${limitCheck.note ? ` (${limitCheck.note})` : ''}. Teacher must issue this pass from their login.`,
        }
      }
    }
  }

  // 6. Room block
  const { data: block } = await supabase
    .from('room_blocks').select('reason, expires_at').eq('room_id', params.roomId)
    .or(`student_id.is.null,student_id.eq.${params.studentId}`)
    .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
    .maybeSingle()
  if (block) return { approved: false, reason: block.reason ?? 'Passes are currently blocked for this room.' }

  // 7. Time restriction
  const dayType = await getTodayDayType()
  const denial = await getTimeRestrictionDenial(params.roomId, dayType)
  if (denial) return { approved: false, reason: denial }

  // 8. Create pass
  const { data: pass, error } = await supabase
    .from('passes')
    .insert({
      student_id:     params.studentId,
      room_id:        params.roomId,
      destination_id: params.destinationId,
      status:         'OUT',
      approved:       true,
      out_by:         params.teacherOverride ? `TEACHER_OVERRIDE:${params.outBy}` : params.outBy,
      teacher_email:  params.teacherEmail,
    })
    .select('id').single()

  if (error || !pass) return { approved: false, reason: 'Database error. Please try again.' }
  return { approved: true, passId: pass.id }
}

export async function signStudentIn(passId: string): Promise<boolean> {
  const supabase = createClient()
  const { error } = await supabase.from('passes')
    .update({ status: 'IN', in_time: new Date().toISOString() })
    .eq('id', passId).eq('status', 'OUT')
  return !error
}
