-- Bear Tracks: Student Sign-Out System
-- Migration 001: Initial Schema

-- ─── Extensions ────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── Enums ─────────────────────────────────────────────────────────────────
create type user_role as enum ('admin', 'monitor', 'teacher', 'terminal');
create type day_type as enum ('regular', 'minimum', 'rally');
create type pass_status as enum ('OUT', 'IN', 'DENIED', 'AUTO_CLOSED');

-- ─── Rooms ──────────────────────────────────────────────────────────────────
create table rooms (
  id            uuid primary key default uuid_generate_v4(),
  room_number   text not null unique,          -- e.g. "Rm 2"
  room_email    text not null unique,          -- e.g. "omsr2@konoctiusd.org"
  teacher_name  text not null,
  teacher_email text not null,
  bell_schedule smallint not null default 7,  -- 7 or 8 (grade bell group)
  grade_group   text,                          -- "7th", "8th", null
  created_at    timestamptz default now()
);

-- ─── Students ────────────────────────────────────────────────────────────────
create table students (
  id            uuid primary key default uuid_generate_v4(),
  student_id    text unique,
  first_name    text not null,
  last_name     text not null,
  preferred_name text,
  grade         smallint,
  room_id       uuid references rooms(id) on delete set null,
  no_roam       boolean default false,
  watch_list    boolean default false,
  active        boolean default true,
  created_at    timestamptz default now()
);

create index on students(last_name);
create index on students(room_id);

-- ─── Destinations ────────────────────────────────────────────────────────────
create table destinations (
  id    uuid primary key default uuid_generate_v4(),
  name  text not null unique,
  active boolean default true,
  sort_order smallint default 0
);

insert into destinations (name, sort_order) values
  ('Bathroom', 1),
  ('Administration Office', 2),
  ('Attendance Office', 3),
  ('Library', 4),
  ('Restorative Center', 5),
  ('Water Fountain', 6);

-- ─── Schedules ───────────────────────────────────────────────────────────────
create table schedules (
  id          uuid primary key default uuid_generate_v4(),
  profile     day_type not null,
  grade_group smallint not null,  -- 7 or 8
  day_start   time not null,
  p1          time not null,
  p2          time not null,
  p3          time not null,
  p4          time not null,
  p5          time not null,
  p6          time not null,
  unique(profile, grade_group)
);

-- Seed from spreadsheet
insert into schedules (profile, grade_group, day_start, p1, p2, p3, p4, p5, p6) values
  ('regular', 7, '08:45', '09:40', '10:35', '11:40', '12:40', '14:05', '15:00'),
  ('regular', 8, '08:45', '09:40', '10:45', '11:45', '13:10', '14:05', '15:00'),
  ('minimum', 7, '08:45', '09:25', '10:05', '10:55', '11:40', '12:50', '13:30'),
  ('minimum', 8, '08:45', '09:25', '10:15', '10:55', '12:10', '12:50', '13:30'),
  ('rally',   7, '08:45', '09:35', '10:25', '11:25', '12:20', '13:40', '14:30'),
  ('rally',   8, '08:45', '09:35', '10:35', '11:30', '12:50', '13:40', '15:00');

-- ─── School Calendar ─────────────────────────────────────────────────────────
create table school_calendar (
  id          uuid primary key default uuid_generate_v4(),
  date        date not null unique,
  day_type    day_type not null default 'regular',
  note        text,
  updated_by  uuid,
  updated_at  timestamptz default now()
);

-- ─── Passes (Active & History) ───────────────────────────────────────────────
create table passes (
  id              uuid primary key default uuid_generate_v4(),
  student_id      uuid not null references students(id),
  room_id         uuid not null references rooms(id),
  destination_id  uuid not null references destinations(id),
  status          pass_status not null default 'OUT',
  approved        boolean not null default true,
  denial_reason   text,
  out_time        timestamptz not null default now(),
  in_time         timestamptz,
  elapsed_minutes numeric generated always as (
    extract(epoch from (coalesce(in_time, now()) - out_time)) / 60
  ) stored,
  out_by          text,   -- room email or teacher email that initiated
  teacher_email   text,
  created_at      timestamptz default now()
);

create index on passes(student_id);
create index on passes(room_id);
create index on passes(status);
create index on passes(out_time);

-- ─── Room Blocks (temp restrictions per room) ────────────────────────────────
create table room_blocks (
  id          uuid primary key default uuid_generate_v4(),
  room_id     uuid not null references rooms(id) on delete cascade,
  student_id  uuid references students(id) on delete cascade,
  reason      text,
  expires_at  timestamptz,
  created_at  timestamptz default now()
);

-- ─── App Settings ────────────────────────────────────────────────────────────
create table settings (
  key   text primary key,
  value text,
  updated_at timestamptz default now()
);

insert into settings (key, value) values
  ('enable_time_restrictions', 'true'),
  ('active_schedule_type', 'auto'),
  ('theme_color', 'orange'),
  ('lock_teacher_links', 'true'),
  ('yellow_min', '10'),
  ('orange_min', '15'),
  ('school_name', 'OMS Bear Tracks'),
  ('first_last_minutes', '10');

-- ─── User Profiles (linked to Supabase Auth) ────────────────────────────────
create table user_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  role        user_role not null default 'teacher',
  room_id     uuid references rooms(id),   -- for terminal/teacher
  display_name text,
  active      boolean default true,
  created_at  timestamptz default now()
);

-- ─── Views ───────────────────────────────────────────────────────────────────

-- Live dashboard: students currently OUT
create view live_dashboard as
select
  p.id,
  s.first_name || ' ' || s.last_name as student,
  r.room_number as room,
  d.name as destination,
  p.out_time,
  round(p.elapsed_minutes) as elapsed_min,
  p.status,
  p.approved,
  r.teacher_name
from passes p
join students s on s.id = p.student_id
join rooms r on r.id = p.room_id
join destinations d on d.id = p.destination_id
where p.status = 'OUT'
order by p.out_time;

-- ─── Helper Functions ────────────────────────────────────────────────────────

-- Returns current period (1-6) for a room's bell schedule given a timestamp
create or replace function get_current_period(
  p_grade_group smallint,
  p_day_type day_type,
  p_time timestamptz default now()
) returns int language plpgsql as $$
declare
  s schedules%rowtype;
  t time := p_time::time;
begin
  select * into s from schedules
  where grade_group = p_grade_group and profile = p_day_type;
  if not found then return null; end if;

  if t < s.day_start then return null;
  elsif t < s.p1 then return 0;  -- before P1 starts
  elsif t < s.p2 then return 1;
  elsif t < s.p3 then return 2;
  elsif t < s.p4 then return 3;
  elsif t < s.p5 then return 4;
  elsif t < s.p6 then return 5;
  else return 6;
  end if;
end;
$$;

-- Returns start/end of the current period for time-restriction checks
create or replace function get_period_bounds(
  p_grade_group smallint,
  p_day_type day_type,
  p_time timestamptz default now()
) returns table(period_start time, period_end time) language plpgsql as $$
declare
  s schedules%rowtype;
  t time := p_time::time;
  periods time[];
  i int;
begin
  select * into s from schedules
  where grade_group = p_grade_group and profile = p_day_type;
  if not found then return; end if;

  periods := array[s.day_start, s.p1, s.p2, s.p3, s.p4, s.p5, s.p6];

  for i in 1..6 loop
    if t >= periods[i] and t < periods[i+1] then
      period_start := periods[i];
      period_end := periods[i+1];
      return next;
      return;
    end if;
  end loop;
end;
$$;

-- ─── RLS Policies ────────────────────────────────────────────────────────────
alter table user_profiles enable row level security;
alter table passes enable row level security;
alter table students enable row level security;
alter table rooms enable row level security;
alter table school_calendar enable row level security;
alter table settings enable row level security;
alter table room_blocks enable row level security;

-- Helper: get current user role
create or replace function current_user_role() returns user_role language sql security definer as $$
  select role from user_profiles where id = auth.uid();
$$;

-- Helper: get current user room_id
create or replace function current_user_room() returns uuid language sql security definer as $$
  select room_id from user_profiles where id = auth.uid();
$$;

-- user_profiles: users can read their own; admins read all
create policy "users read own profile" on user_profiles for select using (id = auth.uid());
create policy "admins manage all profiles" on user_profiles using (current_user_role() = 'admin');

-- students: authenticated read all (terminal/teacher need full list)
create policy "authenticated read students" on students for select using (auth.role() = 'authenticated');
create policy "admin manage students" on students for all using (current_user_role() = 'admin');

-- rooms: authenticated read all
create policy "authenticated read rooms" on rooms for select using (auth.role() = 'authenticated');
create policy "admin manage rooms" on rooms for all using (current_user_role() = 'admin');

-- passes: terminals/teachers see their room; monitors/admins see all
create policy "view passes by role" on passes for select using (
  current_user_role() in ('admin', 'monitor')
  or (current_user_role() in ('teacher', 'terminal') and room_id = current_user_room())
);
create policy "insert passes" on passes for insert with check (
  auth.role() = 'authenticated'
);
create policy "update passes" on passes for update using (
  current_user_role() in ('admin', 'monitor')
  or (current_user_role() in ('teacher', 'terminal') and room_id = current_user_room())
);

-- school_calendar: all read; admin write
create policy "all read calendar" on school_calendar for select using (auth.role() = 'authenticated');
create policy "admin manage calendar" on school_calendar for all using (current_user_role() = 'admin');

-- settings: all read; admin write
create policy "all read settings" on settings for select using (auth.role() = 'authenticated');
create policy "admin manage settings" on settings for all using (current_user_role() = 'admin');

-- room_blocks: teachers/terminals see own room; admin all
create policy "view room blocks" on room_blocks for select using (
  current_user_role() in ('admin', 'monitor')
  or room_id = current_user_room()
);
create policy "manage room blocks" on room_blocks for all using (
  current_user_role() in ('admin', 'monitor', 'teacher')
);

-- ─── Realtime ────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table passes;
alter publication supabase_realtime add table students;
