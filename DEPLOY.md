# Bear Tracks — Deployment Guide
## Student Sign-Out Pass System for OMS

---

## 1. Supabase Setup

### Create Project
1. Go to [supabase.com](https://supabase.com) → New Project
2. Name it `bear-tracks`, choose your region (US West for California), set a strong DB password
3. Wait for project to provision (~2 min)

### Run Migrations
In the Supabase **SQL Editor**, run these files in order:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_seed_data.sql`

This creates all tables, RLS policies, schedules (Regular/Minimum/Rally for both grade groups), and all 20 rooms.

### Get Your Keys
Dashboard → Settings → API:
- **Project URL**: `https://xxxxx.supabase.co`
- **Anon Key**: `eyJh...` (public, safe for frontend)

---

## 2. Vercel Deployment

### Deploy
1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub
3. Add environment variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL   = https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJh...
   ```
4. Deploy!

---

## 3. Creating User Accounts

All users need a Supabase Auth account + a `user_profiles` row.

### Step 1: Create Auth Users
Supabase Dashboard → Authentication → Users → Add User  
(or use the Settings page in the admin panel)

For each room, create a terminal account:
- Email: `omsrm2@konoctiusd.org` (use room email)
- Password: your choice

For teachers:
- Email: their personal work email
- Password: your choice

### Step 2: Add Profile Rows
After creating each auth user, run SQL (or use the Settings page):

```sql
-- Example: admin user
INSERT INTO user_profiles (id, email, role, display_name)
VALUES ('[auth user uuid]', 'annie.tyner@konoctiusd.org', 'admin', 'Annie Tyner');

-- Example: teacher
INSERT INTO user_profiles (id, email, role, room_id, display_name)
SELECT 
  '[auth user uuid]',
  'sharon.huggins@konoctiusd.org',
  'teacher',
  id,
  'Ms. Huggins'
FROM rooms WHERE room_email = 'omsr12@konoctiusd.org';

-- Example: terminal for a room
INSERT INTO user_profiles (id, email, role, room_id, display_name)
SELECT 
  '[auth user uuid]',
  'omsr14@konoctiusd.org',
  'terminal',
  id,
  'Rm 14 Terminal'
FROM rooms WHERE room_email = 'omsr14@konoctiusd.org';

-- Monitor account
INSERT INTO user_profiles (id, email, role, display_name)
VALUES ('[auth user uuid]', 'andre.baker@konoctiusd.org', 'monitor', 'Andre Baker');
```

---

## 4. Import Students

### Option A: Admin Panel
1. Log in as admin → Students → "Import CSV"
2. CSV format (header row required):
   ```
   First Name,Last Name,Student ID,Grade,Room
   Aaliyah,Cook,1350010214,7,Rm 2
   ```
   Room column should match room_number exactly (e.g. "Rm 2")

### Option B: Direct SQL (bulk)
Export Master List sheet to CSV, then use Supabase's Table Editor import.

---

## 5. Terminal Kiosk Setup

### URL-Based (no login required)
Each classroom kiosk tablet can open:
```
https://your-app.vercel.app/terminal?room=omsr14@konoctiusd.org
```

### Auth-Based (recommended for security)
1. Create terminal user account for the room (see step 3)
2. On the tablet, log in once with the terminal account
3. Terminal will auto-detect the room from the profile
4. Enable kiosk/guided access mode on the iPad

---

## 6. User Role Summary

| Role | Access | URL |
|------|--------|-----|
| **admin** | Full system control, calendar, settings, users | `/admin` |
| **monitor** | Live dashboard + all teacher controls | `/monitor` |
| **teacher** | Their class only — sign in/out, log | `/teacher` |
| **terminal** | Student kiosk for their room | `/terminal` |

---

## 7. Bell Schedules & Day Types

The app auto-detects today's day type from the **School Calendar** (admin-configurable).

| Day Type | When to Use |
|----------|-------------|
| **Regular** | Default school day |
| **Minimum** | Early release / minimum day |
| **Rally** | Rally/special schedule |

Each room is assigned to Bell Schedule Group **7** or **8**, which determines which period times are checked for the first/last 10-minute restriction.

---

## 8. Pass Denial Rules

A pass is **automatically denied** if:
- Student has **No Roam** flag set
- Student is already signed out (duplicate)
- A **room block** is active (teacher can set)
- Sign-out is in the **first or last 10 minutes** of a class period (configurable in Settings)

---

## 9. Elapsed Time Color Coding

| Time | Color | Meaning |
|------|-------|---------|
| < 10 min | 🟢 Green | Normal |
| 10–14 min | 🟡 Yellow | Getting long |
| 15–24 min | 🟠 Orange | Overdue |
| 25+ min | 🔴 Red | Alert |

Thresholds configurable in Admin → Settings.

---

## Support

- Supabase docs: [supabase.com/docs](https://supabase.com/docs)
- Next.js docs: [nextjs.org/docs](https://nextjs.org/docs)
- Vercel docs: [vercel.com/docs](https://vercel.com/docs)
