// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Singleton admin client — service role, no auth session, separate storage key
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _adminClient: SupabaseClient<any> | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createAdminClient = (): SupabaseClient<any> => {
  if (_adminClient) return _adminClient
  _adminClient = createClient<any>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        storageKey: 'sb-admin-session', // separate key → no conflict with main client
      },
    }
  )
  return _adminClient
}
