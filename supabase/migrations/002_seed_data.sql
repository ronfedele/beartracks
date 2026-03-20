-- Bear Tracks Migration 002: Seed Rooms & Sample Students
-- Run this after 001_initial_schema.sql

-- ─── Seed Rooms ──────────────────────────────────────────────────────────────
insert into rooms (room_number, room_email, teacher_name, teacher_email, bell_schedule, grade_group) values
  ('Rm 2',  'omsr2@konoctiusd.org',  'Ms. Sunni',         'sunni.wertz@konoctiusd.org',       7, '7th'),
  ('Rm 3',  'omsr3@konoctiusd.org',  'Ms. Orona',         'mici.orona@konoctiusd.org',         7, '8th'),
  ('Rm 4',  'omsr4@konoctiusd.org',  'Mr. Fedele',        'ron.fedele@konoctiusd.org',          7, null),
  ('Rm 5',  'omsr5@konoctiusd.org',  'Intervention Room', 'suzy.rudofker@konoctiusd.org',      7, null),
  ('Rm 7',  'omsr7@konoctiusd.org',  'Mr. Lopez',         'carlos.lopez@konoctiusd.org',        7, null),
  ('Rm 9',  'omsr9@konoctiusd.org',  'Mr. Silveira',      'fernando.silveira@konoctiusd.org',  7, '8th'),
  ('Rm 10', 'omsr10@konoctiusd.org', 'Ms. Uuereb',        'alison.uuereb@konoctiusd.org',       8, null),
  ('Rm 11', 'omsr11@konoctiusd.org', 'Mr. Clark',         'dean.clark@konoctiusd.org',          8, null),
  ('Rm 12', 'omsr12@konoctiusd.org', 'Ms. Huggins',       'sharon.huggins@konoctiusd.org',     7, null),
  ('Rm 13', 'omsr13@konoctiusd.org', 'Mr. Davison',       'edwin.davison@konoctiusd.org',       8, '7th'),
  ('Rm 14', 'omsr14@konoctiusd.org', 'Ms. Fortino',       'latoya.fortino@konoctiusd.org',     7, null),
  ('Rm 15', 'omsr15@konoctiusd.org', 'Ms. Salazar',       'tracy.salzer@konoctiusd.org',        8, '8th'),
  ('Rm 16', 'omsr16@konoctiusd.org', 'Mr. Dalva',         'marshall.dalva@konoctiusd.org',     8, '8th'),
  ('Rm 17', 'omsr17@konoctiusd.org', 'Ms. C',             'cheryl.horner@konoctiusd.org',       8, '8th'),
  ('Rm 18', 'omsr18@konoctiusd.org', 'Mr. C',             'charls.comon@konoctiusd.org',        8, '8th'),
  ('Rm 19', 'omsr19@konoctiusd.org', 'Ms. Munson',        'keryn.munson@konoctiusd.org',        8, '8th'),
  ('Rm 20', 'omsr20@konoctiusd.org', 'Mr. Gripp',         'jeremy.gripp@konoctiusd.org',        8, '8th'),
  ('Rm 21', 'omsr21@konoctiusd.org', 'Mr. Lange',         'nathan.lange@konoctiusd.org',        7, '7th'),
  ('Rm 22', 'omsr22@konoctiusd.org', 'Ms. Porsley',       'mira.porsley@konoctiusd.org',        7, '7th'),
  ('Rm 23', 'omsr23@konoctiusd.org', 'Mr. Schiewe',       'john.schiewe@konoctiusd.org',        7, '7th')
on conflict (room_email) do update set
  teacher_name = excluded.teacher_name,
  teacher_email = excluded.teacher_email,
  bell_schedule = excluded.bell_schedule,
  grade_group = excluded.grade_group;

-- NOTE: Students are imported via the Admin panel bulk-import feature
-- which reads from the Master List sheet. This seed file is intentionally
-- left without student data to keep the migration portable.
-- Use the Admin > Import Students feature after deploying.
