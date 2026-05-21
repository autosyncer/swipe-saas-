import { createAdminClient } from '@/lib/supabase/admin-client'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function saveTransactionToStorage(transaction: Record<string, any>): Promise<void> {
  try {
    // Use service role to bypass storage RLS
    const admin = createAdminClient()
    const today = new Date().toISOString().split('T')[0]
    const dailyBackupPath = `daily/${today}/transactions.json`

    let existing: Record<string, unknown>[] = []
    try {
      const { data: existingFile } = await admin.storage.from('backups').download(dailyBackupPath)
      if (existingFile) existing = JSON.parse(await existingFile.text())
    } catch { /* first entry of day */ }

    existing.push({ ...transaction, backed_up_at: new Date().toISOString() })

    const blob = new Blob([JSON.stringify(existing, null, 2)], { type: 'application/json' })
    const { error } = await admin.storage
      .from('backups')
      .upload(dailyBackupPath, new File([blob], 'transactions.json', { type: 'application/json' }), { upsert: true })

    if (error) console.error('Transaction backup error:', error.message)
    else localStorage.setItem('last_transaction_backup', new Date().toISOString())
  } catch { /* silent — never interrupt user */ }
}
