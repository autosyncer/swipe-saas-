import { createClient } from '@/lib/supabase/client'

export const logAction = async ({
  action,
  module,
  details = {},
}: {
  action: string
  module: string
  details?: Record<string, unknown>
}): Promise<void> => {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .single()

    await supabase.from('audit_logs').insert({
      user_id: user.id,
      user_name: profile?.full_name || '',
      user_email: profile?.email || user.email || '',
      action,
      module,
      details,
    })
  } catch (err) {
    console.error('Audit log error:', err)
  }
}
