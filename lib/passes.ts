import { createClient } from './supabase'
import type { DayType, DenialResult, ApprovalResult, Schedule } from './types'

const BLOCK_MINUTES = 10  // first/last N minutes of class

/**
 * Parse a time string like "08:45:00" into total minutes since midnight
 */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

/**
 * Get today's day type from the calendar table, falling back to 'regular'
 */
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
 * Given a room's bell_schedule group and day type, determine if the current
 * time is within the first or last BLOCK_MINUTES of any period.
 * Returns null if no restriction, or a denial reason string.
 */
export async function getTimeRestrictionDenial(
  gradeGroup: 7 | 8,
  dayType: DayType
): Promise<string | null> {
  const supabase = createClient()

  // Check if time restrictions are enabled
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

  const { data: sched } = await supabase
    .from('schedules')
    .select('*')
    .eq('grade_group', gradeGroup)
    .eq('profile', dayType)
    .maybeSingle()

  if (!sched) return null

  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()

  const periods: string[] = [sched.day_start, sched.p1, sched.p2, sched.p3, sched.p4, sched.p5, sched.p6]
  const periodMins = periods.map(timeToMinutes)

  for (let i = 0; i < periodMins.length - 1; i++) {
    const start = periodMins[i]
    const end   = periodMins[i + 1]
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

/**
 * Check all denial conditions and attempt to create a pass.
 * Returns ApprovalResult or DenialResult.
 */
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
    .select('*, room:rooms(*)')
    .eq('id', params.studentId)
    .maybeSingle()

  if (!student) return { approved: false, reason: 'Student not found. Use full legal name.' }
  if (!student.active) return { approved: false, reason: 'Student is inactive in the system.' }

  // 2. Check no-roam flag
  if (student.no_roam) {
    return { approved: false, reason: 'Student has a No-Roam restriction. See the office.' }
  }

  // 3. Check if student is already out
  const { data: existing } = await supabase
    .from('passes')
    .select('id')
    .eq('student_id', params.studentId)
    .eq('status', 'OUT')
    .maybeSingle()
  if (existing) return { approved: false, reason: 'Student is already signed out.' }

  // 4. Check room block
  const { data: block } = await supabase
    .from('room_blocks')
    .select('reason, expires_at')
    .eq('room_id', params.roomId)
    .or(`student_id.is.null,student_id.eq.${params.studentId}`)
    .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
    .maybeSingle()
  if (block) {
    return { approved: false, reason: block.reason ?? 'Passes are currently blocked for this room.' }
  }

  // 5. Time restriction check
  const { data: room } = await supabase
    .from('rooms')
    .select('bell_schedule')
    .eq('id', params.roomId)
    .maybeSingle()

  if (room) {
    const dayType = await getTodayDayType()
    const denial = await getTimeRestrictionDenial(room.bell_schedule as 7 | 8, dayType)
    if (denial) return { approved: false, reason: denial }
  }

  // 6. Create pass
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

  if (error || !pass) {
    return { approved: false, reason: 'Database error. Please try again.' }
  }

  return { approved: true, passId: pass.id }
}

/**
 * Sign a student back in by updating pass status to IN.
 */
export async function signStudentIn(passId: string): Promise<boolean> {
  const supabase = createClient()
  const { error } = await supabase
    .from('passes')
    .update({ status: 'IN', in_time: new Date().toISOString() })
    .eq('id', passId)
    .eq('status', 'OUT')
  return !error
}
