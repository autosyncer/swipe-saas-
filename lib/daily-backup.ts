import { supabase } from '@/lib/supabase'
import { uploadToGoogleDrive, loadGoogleAPI } from '@/lib/google-drive'

const DAILY_TABLES = [
  'transactions', 'customers', 'cards',
  'customer_bank_accounts', 'ac_sheet', 'cc_sheet',
  'bl_sheet', 'customer_sheet', 'swipe_machines',
  'bank_account_master', 'reminders',
]

export async function runDailyGoogleDriveBackup(): Promise<void> {
  try {
    const today = new Date().toISOString().split('T')[0]
    const lastDailyBackup = localStorage.getItem('last_daily_drive_backup')

    if (lastDailyBackup === today) {
      console.log('Daily Google Drive backup already done today')
      return
    }

    const isDriveConnected = localStorage.getItem('google_drive_connected') === 'true'
    if (!isDriveConnected) return

    console.log('Running daily Google Drive backup...')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const backup: Record<string, any> = {
      backup_version: '1.0',
      backup_type: 'daily_auto',
      created_at: new Date().toISOString(),
      app_name: 'SwipeSaaS',
      date: today,
      tables: {},
    }

    for (const table of DAILY_TABLES) {
      const { data } = await supabase
        .from(table)
        .select('*')
        .order('created_at', { ascending: true })
      backup.tables[table] = { count: data?.length || 0, records: data || [] }
    }

    const filename = `SwipeSaaS_Daily_${today}.json`
    const jsonString = JSON.stringify(backup, null, 2)

    // Ensure Google API is loaded
    if (!window.gapi?.auth2) await loadGoogleAPI()

    const result = await uploadToGoogleDrive(jsonString, filename)

    if (result) {
      const sizeKB = (new Blob([jsonString]).size / 1024).toFixed(1)
      try {
        await supabase.from('backup_logs').insert({
          backup_name: filename,
          backup_size: `${sizeKB} KB`,
          tables_included: DAILY_TABLES,
          google_drive_id: result.id,
          google_drive_url: result.url,
          backup_type: 'daily_auto',
          status: 'completed',
        })
      } catch { /* backup_logs table may not exist */ }

      localStorage.setItem('last_daily_drive_backup', today)
      console.log(`✅ Daily backup uploaded to Google Drive: ${filename}`)
    }
  } catch (err) {
    console.error('Daily Google Drive backup error:', err)
  }
}
