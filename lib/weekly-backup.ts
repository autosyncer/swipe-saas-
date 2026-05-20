import { supabase } from '@/lib/supabase'

const ALL_TABLES = [
  'transactions', 'customers', 'cards',
  'customer_bank_accounts', 'ac_sheet', 'cc_sheet',
  'bl_sheet', 'customer_sheet', 'swipe_machines',
  'bank_account_master', 'reminders', 'risk_alerts',
  'audit_logs', 'profiles',
]

async function createFullBackupAndDownload(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const backup: Record<string, any> = {
    backup_version: '1.0',
    backup_type: 'weekly_local',
    created_at: new Date().toISOString(),
    app_name: 'SwipeSaaS',
    tables: {},
  }

  for (const table of ALL_TABLES) {
    const { data } = await supabase
      .from(table)
      .select('*')
      .order('created_at', { ascending: true })
    backup.tables[table] = { count: data?.length || 0, records: data || [] }
  }

  const date = new Date()
  const weekNum = Math.ceil(date.getDate() / 7)
  const pad = (n: number) => String(n).padStart(2, '0')
  const filename = `SwipeSaaS_Weekly_W${weekNum}_${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`
  const jsonString = JSON.stringify(backup, null, 2)
  const sizeKB = (new Blob([jsonString]).size / 1024).toFixed(1)

  const blob = new Blob([jsonString], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  try {
    await supabase.from('backup_logs').insert({
      backup_name: filename,
      backup_size: `${sizeKB} KB`,
      tables_included: ALL_TABLES,
      backup_type: 'weekly_local',
      status: 'completed',
    })
  } catch { /* backup_logs may not exist */ }

  console.log(`✅ Weekly backup downloaded: ${filename} (${sizeKB} KB)`)
}

export async function checkWeeklyLocalBackup(): Promise<void> {
  try {
    const lastWeeklyBackup = localStorage.getItem('last_weekly_local_backup')

    if (lastWeeklyBackup) {
      const daysSince = (Date.now() - new Date(lastWeeklyBackup).getTime()) / 86400000
      if (daysSince < 7) return
    }

    const shouldDownload = window.confirm(
      '📦 Weekly Backup Due!\n\n' +
      'It has been 7 days since your last local backup.\n\n' +
      'Click OK to download a full backup to your PC.\n' +
      'Click Cancel to remind me tomorrow.'
    )

    if (!shouldDownload) {
      // Push reminder back by 1 day
      const snoozeDate = new Date(Date.now() - 6 * 86400000).toISOString()
      localStorage.setItem('last_weekly_local_backup', snoozeDate)
      return
    }

    await createFullBackupAndDownload()
    localStorage.setItem('last_weekly_local_backup', new Date().toISOString())
  } catch (err) {
    console.error('Weekly backup error:', err)
  }
}
