import { createClient } from '@supabase/supabase-js'

// Singleton admin client — service role, no auth session, separate storage key
let _adminClient: ReturnType<typeof createClient> | null = null

export const createAdminClient = () => {
  if (_adminClient) return _adminClient
  _adminClient = createClient(
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
