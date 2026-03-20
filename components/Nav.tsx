'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { UserRole } from '@/lib/types'
import { clsx } from 'clsx'
import ChangePassword from './ChangePassword'

interface NavProps {
  role: UserRole
  displayName?: string
  roomNumber?: string
}

const navLinks: Record<UserRole, { href: string; label: string; icon: string }[]> = {
  admin: [
    { href: '/admin',             label: 'Dashboard',  icon: '📊' },
    { href: '/admin/students',    label: 'Students',   icon: '👥' },
    { href: '/admin/schedules',   label: 'Schedules',  icon: '🗓️' },
    { href: '/admin/rooms',       label: 'Rooms',      icon: '🚪' },
    { href: '/admin/calendar',    label: 'Calendar',   icon: '📅' },
    { href: '/admin/reports',     label: 'Reports',    icon: '📈' },
    { href: '/admin/settings',    label: 'Settings',   icon: '⚙️' },
    { href: '/monitor',           label: 'Monitor',    icon: '🖥️' },
  ],
  monitor: [
    { href: '/monitor',           label: 'Live View',  icon: '🖥️' },
    { href: '/monitor/log',       label: 'Log',        icon: '📋' },
    { href: '/monitor/reports',   label: 'Reports',    icon: '📈' },
    { href: '/teacher',           label: 'Teacher',    icon: '🏫' },
  ],
  teacher: [
    { href: '/teacher',           label: 'My Class',   icon: '🏫' },
    { href: '/teacher/log',       label: 'Pass Log',   icon: '📋' },
    { href: '/teacher/reports',   label: 'Reports',    icon: '📈' },
  ],
  terminal: [],
}

export default function Nav({ role, displayName, roomNumber }: NavProps) {
  const pathname = usePathname()
  const router = useRouter()
  const links = navLinks[role]

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/')
  }

  return (
    <nav className="bg-bear-dark border-b border-white/10 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 flex items-center h-14 gap-1">
        <Link href="/" className="flex items-center gap-2 mr-4 shrink-0">
          <span className="text-xl">🐾</span>
          <span className="font-display font-bold text-white text-lg leading-none hidden sm:block">
            Bear Tracks
          </span>
        </Link>

        <div className="flex items-center gap-0.5 flex-1 overflow-x-auto scrollbar-none">
          {links.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                pathname === link.href
                  ? 'bg-bear-orange text-white'
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              )}
            >
              <span className="text-base">{link.icon}</span>
              <span className="hidden md:inline">{link.label}</span>
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-4 shrink-0">
          {roomNumber && (
            <span className="text-xs text-bear-muted font-mono bg-white/10 px-2 py-1 rounded-lg">
              {roomNumber}
            </span>
          )}
          <div className="text-right hidden sm:block">
            <div className="text-xs text-white font-medium leading-none">{displayName}</div>
            <div className="text-xs text-bear-muted capitalize mt-0.5">{role}</div>
          </div>
          {/* Change Password for non-terminal accounts */}
          {role !== 'terminal' && <ChangePassword />}
          <button
            onClick={handleLogout}
            className="text-xs text-white/40 hover:text-white/80 transition-colors px-2 py-1"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  )
}
