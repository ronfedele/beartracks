import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  if (typeof window !== 'undefined') {
    console.error(
      'Bear Tracks: Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.\n' +
      'Add these environment variables in Vercel → Settings → Environment Variables.'
    )
  }
}

export function createClient() {
  return createBrowserClient(
    supabaseUrl ?? 'https://placeholder.supabase.co',
    supabaseAnonKey ?? 'placeholder'
  )
}

export function isConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey &&
    supabaseUrl !== 'https://placeholder.supabase.co')
}
