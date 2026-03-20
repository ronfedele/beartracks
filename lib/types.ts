export type UserRole = 'admin' | 'monitor' | 'teacher' | 'terminal'
export type DayType = 'regular' | 'minimum' | 'rally'
export type PassStatus = 'OUT' | 'IN' | 'DENIED' | 'AUTO_CLOSED'

export interface Room {
  id: string
  room_number: string
  room_email: string
  teacher_name: string
  teacher_email: string
  bell_schedule: 7 | 8 | 9
  grade_group: string | null
}

export interface Student {
  id: string
  student_id: string | null
  first_name: string
  last_name: string
  preferred_name: string | null
  grade: number | null
  room_id: string | null
  no_roam: boolean
  watch_list: boolean
  active: boolean
  room?: Room
}

export interface Destination {
  id: string
  name: string
  active: boolean
  sort_order: number
}

export interface Pass {
  id: string
  student_id: string
  room_id: string
  destination_id: string
  status: PassStatus
  approved: boolean
  denial_reason: string | null
  out_time: string
  in_time: string | null
  elapsed_minutes: number | null
  out_by: string | null
  teacher_email: string | null
  student?: Student
  room?: Room
  destination?: Destination
}

export interface Schedule {
  id: string
  profile: DayType
  grade_group: 7 | 8
  day_start: string
  p1: string
  p2: string
  p3: string
  p4: string
  p5: string
  p6: string
}

export interface CalendarDay {
  id: string
  date: string
  day_type: DayType
  note: string | null
}

export interface UserProfile {
  id: string
  email: string
  role: UserRole
  room_id: string | null
  display_name: string | null
  active: boolean
  room?: Room
}

export interface LiveDashboardRow {
  id: string
  student: string
  room: string
  destination: string
  out_time: string
  elapsed_min: number
  status: PassStatus
  approved: boolean
  teacher_name: string
}

export interface Setting {
  key: string
  value: string
}

export interface DenialResult {
  approved: false
  reason: string
}

export interface ApprovalResult {
  approved: true
  passId: string
}
