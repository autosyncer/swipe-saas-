import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceRole =
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_SERVICE_ROLE!

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})
