import type { Metadata } from 'next'
import './globals.css'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const metadata: Metadata = {
  title: 'Bear Tracks | OMS Pass System',
  description: 'Student sign-out pass management system',
  icons: { icon: '/favicon.ico' },
}

async function getBranding() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['primary_color', 'secondary_color'])
    const map: Record<string, string> = {}
    ;(data ?? []).forEach((s: any) => { map[s.key] = s.value })
    return {
      primary:   map['primary_color']   || '#FF5910',
      secondary: map['secondary_color'] || '#002D72',
    }
  } catch {
    return { primary: '#FF5910', secondary: '#002D72' }
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { primary, secondary } = await getBranding()

  // Inject CSS variables — Tailwind classes like bg-bear-orange compile to
  // background-color: var(--bear-orange) so changing the variable here
  // propagates to every element on every page automatically.
  const css = `:root { --bear-orange: ${primary}; --bear-dark: ${secondary}; }`

  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
