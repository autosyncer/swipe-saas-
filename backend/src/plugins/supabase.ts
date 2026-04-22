import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _supabase: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE
    if (!url || !key) throw new Error('Supabase env vars missing')
    _supabase = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  }
  return _supabase
}
