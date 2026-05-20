import { supabase } from '@/lib/supabase'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function saveTransactionToStorage(transaction: Record<string, any>): Promise<void> {
  try {
    const today = new Date().toISOString().split('T')[0]
    const dailyBackupPath = `daily/${today}/transactions.json`

    // Fetch existing today's file from storage
    let existing: Record<string, unknown>[] = []
    try {
      const { data: existingFile } = await supabase.storage
        .from('backups')
        .download(dailyBackupPath)
      if (existingFile) {
        const text = await existingFile.text()
        existing = JSON.parse(text)
      }
    } catch {
      // First entry of the day
    }

    existing.push({ ...transaction, backed_up_at: new Date().toISOString() })

    const blob = new Blob([JSON.stringify(existing, null, 2)], { type: 'application/json' })
    const file = new File([blob], 'transactions.json', { type: 'application/json' })

    const { error } = await supabase.storage
      .from('backups')
      .upload(dailyBackupPath, file, { upsert: true })

    if (error) {
      console.error('Transaction backup storage error:', error.message)
    } else {
      console.log(`✅ Transaction SR#${transaction.sr_no} backed up → Supabase Storage`)
      localStorage.setItem('last_transaction_backup', new Date().toISOString())
    }
  } catch (err) {
    // Silent — never interrupt the user
    console.error('Transaction backup error:', err)
  }
}
