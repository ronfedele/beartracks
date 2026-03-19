import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * Browser / 'use client' Supabase client.
 * Safe to import anywhere — no next/headers dependency.
 */
export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}
