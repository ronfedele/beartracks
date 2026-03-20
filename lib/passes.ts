import { createClient } from './supabase'
import type { DayType, DenialResult, ApprovalResult } from './types'

// Destinations considered "bathroom/water" for the one-out-at-a-time rule
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

/**
 * Get the bell schedule times for a specific period in a room.
 * Handles group 7, group 8, and varied (group 9) rooms.
 */
async function getRoomPeriodTimes(
  roomId: string,
  dayType: DayType
): Promise<{ periods: number[] } | null> {
  const supabase = createClient()

  const { data: room } = await supabase
    .from('rooms')
    .select('bell_schedule')
    .eq('id', roomId)
    .maybeSingle()

  if (!room) return null

  const bellSchedule = room.bell_schedule

  // Varied room (9) — look up per-period group config
  if (bellSchedule === 9) {
    const { data: variedConfig } = await supabase
      .from('varied_schedule_config')
      .select('*')
      .eq('room_id', roomId)
      .maybeSingle()

    if (!variedConfig) return null

    // Build period boundary times by mixing groups per period
    const groupNums = [
      variedConfig.p1_group, variedConfig.p2_group, variedConfig.p3_group,
      variedConfig.p4_group, variedConfig.p5_group, variedConfig.p6_group,
    ]

    // Fetch both group schedules
    const { data: schedules } = await supabase
      .from('schedules')
      .select('*')
      .eq('profile', dayType)
      .in('grade_group', [7, 8])

    if (!schedules || schedules.length < 2) return null

    const s7 = schedules.find((s: any) => s.grade_group === 7)
    const s8 = schedules.find((s: any) => s.grade_group === 8)
    if (!s7 || !s8) return null

    // Start time is always the same
    const periodKeys = ['day_start', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6']
    const periods: number[] = [timeToMinutes(s7.day_start)]
    for (let i = 0; i < 6; i++) {
      const src = groupNums[i] === 7 ? s7 : s8
      periods.push(timeToMinutes(src[periodKeys[i + 1]]))
    }
    return { periods }
  }

  // Standard group 7 or 8
  const { data: sched } = await supabase
    .from('schedules')
    .select('*')
    .eq('grade_group', bellSchedule)
    .eq('profile', dayType)
    .maybeSingle()

  if (!sched) return null

  const periods = [
    timeToMinutes(sched.day_start),
    timeToMinutes(sched.p1),
    timeToMinutes(sched.p2),
    timeToMinutes(sched.p3),
    timeToMinutes(sched.p4),
    timeToMinutes(sched.p5),
    timeToMinutes(sched.p6),
  ]
  return { periods }
}

export async function getTimeRestrictionDenial(
  roomId: string,
  dayType: DayType
): Promise<string | null> {
  const supabase = createClient()

  const { data: setting } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'enable_time_restrictions')
    .maybeSingle()
  if (setting?.value !== 'true') return null

  const { data: blockSetting } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'first_last_minutes')
    .maybeSingle()
  const blockMin = parseInt(blockSetting?.value ?? '10', 10)

  const result = await getRoomPeriodTimes(roomId, dayType)
  if (!result) return null

  const { periods } = result
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes()

  for (let i = 0; i < periods.length - 1; i++) {
    const start = periods[i]
    const end   = periods[i + 1]
    if (nowMin >= start && nowMin < end) {
      const minutesIn   = nowMin - start
      const minutesLeft = end - nowMin
      if (minutesIn < blockMin) {
        return `Cannot sign out in the first ${blockMin} minutes of class (${minutesIn} min into period ${i + 1})`
      }
      if (minutesLeft < blockMin) {
        return `Cannot sign out in the last ${blockMin} minutes of class (${minutesLeft} min left in period ${i + 1})`
      }
      return null
    }
  }
  return null
}

export async function requestPass(params: {
  studentId: string
  roomId: string
  destinationId: string
  outBy: string
  teacherEmail: string
}): Promise<ApprovalResult | DenialResult> {
  const supabase = createClient()

  // 1. Get student
  const { data: student } = await supabase
    .from('students')
    .select('*')
    .eq('id', params.studentId)
    .maybeSingle()

  if (!student) return { approved: false, reason: 'Student not found. Use full legal name.' }
  if (!student.active) return { approved: false, reason: 'Student is inactive in the system.' }
  if (student.no_roam) return { approved: false, reason: 'Student has a No-Roam restriction. See the office.' }

  // 2. Check if student is already out
  const { data: existing } = await supabase
    .from('passes')
    .select('id')
    .eq('student_id', params.studentId)
    .eq('status', 'OUT')
    .maybeSingle()
  if (existing) return { approved: false, reason: 'Student is already signed out.' }

  // 3. Get destination name
  const { data: dest } = await supabase
    .from('destinations')
    .select('name')
    .eq('id', params.destinationId)
    .maybeSingle()

  const destName = dest?.name?.toLowerCase() ?? ''
  const isBathroomWater = BATHROOM_WATER.includes(destName)

  // 4. One-out-at-a-time rule for bathroom/water (per room)
  if (isBathroomWater) {
    const { data: roomOut } = await supabase
      .from('passes')
      .select('id, student:students(first_name, last_name), destination:destinations(name)')
      .eq('room_id', params.roomId)
      .eq('status', 'OUT')
      .in('destination_id',
        await supabase
          .from('destinations')
          .select('id')
          .in('name', ['Bathroom', 'Water Fountain'])
          .then(r => (r.data ?? []).map((d: any) => d.id))
      )
      .maybeSingle()

    if (roomOut) {
      const s = roomOut.student as any
      const name = s ? `${s.first_name} ${s.last_name}` : 'Another student'
      const where = (roomOut.destination as any)?.name ?? 'bathroom/water'
      return { approved: false, reason: `${name} is already out for ${where}. Only one student may be out for bathroom/water at a time.` }
    }

    // 5. If student is trying bathroom/water, check no OTHER student from THIS room
    // is already out for bathroom/water (already covered above)
    // Also: if THIS student is already out for bathroom/water at ANY room, deny
    const { data: studentBWOut } = await supabase
      .from('passes')
      .select('id')
      .eq('student_id', params.studentId)
      .eq('status', 'OUT')
      .in('destination_id',
        await supabase
          .from('destinations')
          .select('id')
          .in('name', ['Bathroom', 'Water Fountain'])
          .then(r => (r.data ?? []).map((d: any) => d.id))
      )
      .maybeSingle()
    if (studentBWOut) {
      return { approved: false, reason: 'Student is already signed out for bathroom/water.' }
    }
  }

  // 6. Check room block
  const { data: block } = await supabase
    .from('room_blocks')
    .select('reason, expires_at')
    .eq('room_id', params.roomId)
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
      out_by:         params.outBy,
      teacher_email:  params.teacherEmail,
    })
    .select('id')
    .single()

  if (error || !pass) return { approved: false, reason: 'Database error. Please try again.' }
  return { approved: true, passId: pass.id }
}

export async function signStudentIn(passId: string): Promise<boolean> {
  const supabase = createClient()
  const { error } = await supabase
    .from('passes')
    .update({ status: 'IN', in_time: new Date().toISOString() })
    .eq('id', passId)
    .eq('status', 'OUT')
  return !error
}
