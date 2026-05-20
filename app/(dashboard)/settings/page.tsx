'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Download, Upload, RefreshCw, Database, Shield } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { logAction } from '@/lib/audit-log'
import { useAuth } from '@/lib/auth-context'
import {
  loadGoogleAPI, signInToGoogle, signOutOfGoogle,
  uploadToGoogleDrive, isGoogleAPIConfigured,
} from '@/lib/google-drive'

type Tab = 'General' | 'Security' | 'Notifications' | 'Accounts' | 'Backup & Restore'

const accounts = [
  { name: 'NSS', balance: 1820000 },
  { name: 'SKT', balance: 1250000 },
  { name: 'RT', balance: 890000 },
  { name: 'KTC', balance: 670000 },
  { name: 'TAP', balance: 540000 },
  { name: 'BGM', balance: 320000 },
  { name: 'NTC', balance: 280000 },
  { name: 'MAHA', balance: 410000 },
  { name: 'MAL', balance: 190000 },
  { name: 'MAP', balance: 230000 },
  { name: 'HASTI', balance: 160000 },
]

const TABLE_LIST = [
  { key: 'transactions',          label: 'Transactions (Daily Register)' },
  { key: 'customers',             label: 'Customers' },
  { key: 'cards',                 label: 'Cards' },
  { key: 'customer_bank_accounts',label: 'Customer Bank Accounts' },
  { key: 'ac_sheet',              label: 'AC Sheet' },
  { key: 'cc_sheet',              label: 'CC Sheet' },
  { key: 'customer_sheet',        label: 'Customer Sheet' },
  { key: 'bl_sheet',              label: 'BL Sheet' },
  { key: 'reminders',             label: 'Reminders' },
  { key: 'swipe_machines',        label: 'Swipe Machines' },
  { key: 'bank_account_master',   label: 'Bank Accounts' },
  { key: 'risk_alerts',           label: 'Risk Alerts' },
  { key: 'audit_logs',            label: 'Audit Logs' },
  { key: 'profiles',              label: 'Users & Profiles' },
]

const RESTORE_ORDER = [
  'profiles','customers','cards','customer_bank_accounts',
  'swipe_machines','bank_account_master','transactions',
  'ac_sheet','cc_sheet','bl_sheet','customer_sheet',
  'reminders','risk_alerts','audit_logs',
]

interface BackupLog {
  id: string
  backup_name: string
  backup_size: string
  tables_included: string[]
  storage_path?: string
  google_drive_id?: string
  google_drive_url?: string
  backup_type?: 'auto' | 'manual'
  status?: string
  created_at: string
}

interface BackupPreview {
  created_at: string
  app_name: string
  tables: { name: string; count: number; hasError: boolean }[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BackupData = Record<string, any>

function ToggleSwitch({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0"
      style={{ background: enabled ? '#3ECF8E' : '#d1d5db' }}
    >
      <span
        className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
        style={{ transform: enabled ? 'translateX(18px)' : 'translateX(2px)' }}
      />
    </button>
  )
}

function ProgressBar({ progress, color = '#3ECF8E' }: { progress: number; color?: string }) {
  return (
    <div style={{
      width: '100%', height: '8px',
      background: '#e5e7eb', borderRadius: '999px',
      overflow: 'hidden', marginTop: '8px',
    }}>
      <div style={{
        width: `${progress}%`, height: '100%',
        background: color, borderRadius: '999px',
        transition: 'width 0.3s ease',
      }} />
    </div>
  )
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      className="bg-white rounded-lg border p-6"
      style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', ...style }}
    >
      {children}
    </div>
  )
}

// ── Backup & Restore Tab ──────────────────────────────────────────────────────
function BackupTab({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null)

  // Create backup
  const [selectedTables, setSelectedTables] = useState<string[]>(TABLE_LIST.map(t => t.key))
  const [backupLoading, setBackupLoading] = useState(false)
  const [backupProgress, setBackupProgress] = useState(0)
  const [backupStatusMsg, setBackupStatusMsg] = useState('')
  const [lastBackup, setLastBackup] = useState<string | null>(null)

  // Restore
  const [isDragging, setIsDragging] = useState(false)
  const [backupFile, setBackupFile] = useState<File | null>(null)
  const [selectedBackup, setSelectedBackup] = useState<BackupData | null>(null)
  const [backupPreview, setBackupPreview] = useState<BackupPreview | null>(null)
  const [restoreLoading, setRestoreLoading] = useState(false)
  const [restoreProgress, setRestoreProgress] = useState(0)

  // Auto backup settings
  const [autoEnabled, setAutoEnabled] = useState(false)
  const [autoFrequency, setAutoFrequency] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const [keepLast, setKeepLast] = useState(5)

  // Google Drive
  const [isDriveConnected, setIsDriveConnected] = useState(false)
  const [driveConnecting, setDriveConnecting] = useState(false)
  const googleConfigured = isGoogleAPIConfigured()

  // History
  const [backupHistory, setBackupHistory] = useState<BackupLog[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Danger Zone — Reset
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetStep, setResetStep] = useState(1)
  const [resetConfirmText, setResetConfirmText] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const [resetting, setResetting] = useState(false)

  function showToast(msg: string, type: 'success' | 'error' | 'info') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 5000)
  }

  const fetchBackupHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const { data } = await supabase
        .from('backup_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)
      setBackupHistory((data as BackupLog[]) || [])
    } catch { /* table may not exist yet */ }
    setHistoryLoading(false)
  }, [])

  useEffect(() => {
    setLastBackup(localStorage.getItem('last_backup'))
    setAutoEnabled(localStorage.getItem('auto_backup_enabled') === 'true')
    setAutoFrequency((localStorage.getItem('auto_backup_frequency') as 'daily' | 'weekly' | 'monthly') || 'daily')
    setKeepLast(Number(localStorage.getItem('auto_backup_keep') || 5))
    setIsDriveConnected(localStorage.getItem('google_drive_connected') === 'true')
    fetchBackupHistory()
  }, [fetchBackupHistory])

  // Auto-backup check on mount
  useEffect(() => {
    const lb = localStorage.getItem('last_backup')
    const enabled = localStorage.getItem('auto_backup_enabled') === 'true'
    const freq = localStorage.getItem('auto_backup_frequency') || 'daily'
    if (!enabled) return
    if (lb) {
      const hoursSince = (Date.now() - new Date(lb).getTime()) / 3600000
      const isDue =
        (freq === 'daily'   && hoursSince >= 24) ||
        (freq === 'weekly'  && hoursSince >= 168) ||
        (freq === 'monthly' && hoursSince >= 720)
      if (!isDue) return
    }
    showToast('🔄 Auto backup triggered', 'info')
    triggerBackup(
      ['transactions','customers','cards','customer_bank_accounts',
       'swipe_machines','bank_account_master','ac_sheet','cc_sheet',
       'bl_sheet','customer_sheet','reminders','risk_alerts','audit_logs'],
      true
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Supabase Storage upload ──
  async function uploadToSupabaseStorage(jsonString: string, filename: string): Promise<string | null> {
    try {
      const blob = new Blob([jsonString], { type: 'application/json' })
      const file = new File([blob], filename, { type: 'application/json' })
      const { data, error } = await supabase.storage
        .from('backups')
        .upload(`daily/${filename}`, file, { cacheControl: '3600', upsert: true })
      if (error) { console.error('Storage upload error:', error); return null }
      console.log('Uploaded to Supabase Storage:', data.path)
      return data.path
    } catch (err) {
      console.error('Storage upload exception:', err)
      return null
    }
  }

  // ── Download from Supabase Storage ──
  async function downloadFromStorage(storagePath: string, filename: string) {
    try {
      const { data, error } = await supabase.storage.from('backups').download(storagePath)
      if (error || !data) { showToast('Download failed: ' + (error?.message || 'No data'), 'error'); return }
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url; a.download = filename
      a.click(); URL.revokeObjectURL(url)
    } catch (err) {
      showToast('Download failed: ' + (err instanceof Error ? err.message : String(err)), 'error')
    }
  }

  // ── Google Drive connect / disconnect ──
  async function connectGoogleDrive() {
    if (!googleConfigured) {
      showToast('Add NEXT_PUBLIC_GOOGLE_CLIENT_ID and NEXT_PUBLIC_GOOGLE_API_KEY to .env.local first', 'error')
      return
    }
    setDriveConnecting(true)
    try {
      await loadGoogleAPI()
      const success = await signInToGoogle()
      if (success) {
        localStorage.setItem('google_drive_connected', 'true')
        setIsDriveConnected(true)
        showToast('✅ Google Drive connected!', 'success')
      } else {
        showToast('Failed to connect Google Drive', 'error')
      }
    } catch (err) {
      showToast('Google Drive error: ' + (err instanceof Error ? err.message : String(err)), 'error')
    } finally {
      setDriveConnecting(false)
    }
  }

  function disconnectGoogleDrive() {
    signOutOfGoogle()
    localStorage.removeItem('google_drive_connected')
    setIsDriveConnected(false)
    showToast('Google Drive disconnected', 'info')
  }

  // ── Main backup function ──
  async function triggerBackup(tables: string[], isAutoBackup = false) {
    try {
      setBackupLoading(true)
      setBackupProgress(0)
      setBackupStatusMsg('Collecting data...')

      const backup: BackupData = {
        backup_version: '1.0',
        created_at: new Date().toISOString(),
        app_name: 'SwipeSaaS',
        project: 'chamundaswipe',
        tables: {},
      }

      const list = TABLE_LIST.filter(t => tables.includes(t.key))
      let done = 0

      for (const { key } of list) {
        setBackupStatusMsg(`Exporting ${key}...`)
        const { data, error } = await supabase
          .from(key).select('*').order('created_at', { ascending: true })
        backup.tables[key] = error
          ? { error: error.message, records: [], count: 0 }
          : { count: data?.length || 0, records: data || [] }
        done++
        setBackupProgress(Math.round((done / list.length) * 60))
      }

      const date = new Date()
      const pad = (n: number) => String(n).padStart(2, '0')
      const filename = `SwipeSaaS_Backup_${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}.json`
      const jsonString = JSON.stringify(backup, null, 2)
      const sizeKB = (new Blob([jsonString]).size / 1024).toFixed(1)

      // Upload to Supabase Storage
      setBackupStatusMsg('Uploading to Supabase Storage...')
      setBackupProgress(65)
      const storagePath = await uploadToSupabaseStorage(jsonString, filename)
      setBackupProgress(75)

      // Upload to Google Drive if connected
      let driveResult: { id: string; url: string } | null = null
      if (isDriveConnected) {
        setBackupStatusMsg('Uploading to Google Drive...')
        try {
          if (!window.gapi?.auth2) await loadGoogleAPI()
          driveResult = await uploadToGoogleDrive(jsonString, filename)
        } catch (err) {
          console.error('Google Drive upload failed:', err)
        }
        setBackupProgress(88)
      }

      // Download locally (manual backups only)
      if (!isAutoBackup) {
        setBackupStatusMsg('Downloading file...')
        const blob = new Blob([jsonString], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = filename
        document.body.appendChild(a); a.click()
        document.body.removeChild(a); URL.revokeObjectURL(url)
      }

      setBackupProgress(92)
      setBackupStatusMsg('Logging backup...')

      try {
        await supabase.from('backup_logs').insert({
          backup_name: filename,
          backup_size: `${sizeKB} KB`,
          tables_included: tables,
          storage_path: storagePath || '',
          google_drive_id: driveResult?.id || '',
          google_drive_url: driveResult?.url || '',
          backup_type: isAutoBackup ? 'auto' : 'manual',
          status: 'completed',
        })
      } catch { /* table may not exist yet */ }

      const now = new Date().toISOString()
      localStorage.setItem('last_backup', now)
      setLastBackup(now)
      setBackupProgress(100)
      setBackupStatusMsg('')

      const destinations = [
        !isAutoBackup ? '💾 Local' : null,
        storagePath ? '☁️ Supabase' : null,
        driveResult ? '📁 Google Drive' : null,
      ].filter(Boolean).join(' + ')

      showToast(`✅ Backup saved to: ${destinations} (${sizeKB} KB)`, 'success')
      fetchBackupHistory()

      await logAction({
        action: isAutoBackup ? 'Auto Backup Created' : 'Backup Created',
        module: 'Settings',
        details: {
          filename, size: `${sizeKB} KB`, tables,
          storage: storagePath || 'failed',
          google_drive: driveResult?.id || 'not connected',
          total_records: Object.values(backup.tables as Record<string, { count: number }>)
            .reduce((s, t) => s + (t.count || 0), 0),
        },
      })
    } catch (err: unknown) {
      showToast('Backup failed: ' + (err instanceof Error ? err.message : String(err)), 'error')
    } finally {
      setBackupLoading(false)
      setTimeout(() => setBackupProgress(0), 3000)
    }
  }

  function handleFileSelect(file: File) {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const backup = JSON.parse(e.target?.result as string)
        if (!backup.backup_version || !backup.tables) {
          showToast('Invalid backup file format', 'error')
          return
        }
        setSelectedBackup(backup)
        setBackupFile(file)
        setBackupPreview({
          created_at: backup.created_at,
          app_name: backup.app_name,
          tables: Object.entries(backup.tables).map(([key, val]) => ({
            name: key,
            count: (val as { count?: number }).count || 0,
            hasError: !!(val as { error?: string }).error,
          })),
        })
      } catch {
        showToast('Failed to read backup file', 'error')
      }
    }
    reader.readAsText(file)
  }

  async function restoreBackup() {
    if (!selectedBackup) return

    const confirmed = window.confirm(
      '⚠️ WARNING: This will REPLACE ALL existing data.\n\nAre you absolutely sure? This cannot be undone!'
    )
    if (!confirmed) return
    const doubleConfirm = window.confirm(
      'FINAL WARNING! All current data will be deleted and replaced.\n\nClick OK to proceed.'
    )
    if (!doubleConfirm) return

    try {
      setRestoreLoading(true)
      setRestoreProgress(0)

      showToast('🔄 Clearing existing data...', 'info')

      // Step 1: Truncate all tables via RPC
      const { error: truncateError } = await supabase.rpc('truncate_for_restore')
      if (truncateError) {
        console.error('Truncate error:', truncateError)
        showToast('Failed to clear data: ' + truncateError.message, 'error')
        setRestoreLoading(false)
        return
      }
      console.log('All tables truncated successfully')
      setRestoreProgress(10)

      // Step 2: Restore in FK-safe order
      const restoreOrder = [
        'customers', 'cards', 'customer_bank_accounts',
        'swipe_machines', 'bank_account_master', 'transactions',
        'ac_sheet', 'cc_sheet', 'bl_sheet', 'customer_sheet',
        'reminders', 'risk_alerts', 'audit_logs',
      ]

      const tables = selectedBackup.tables as Record<string, { records: BackupData[]; count?: number; error?: string }>
      let done = 0

      for (const key of restoreOrder) {
        if (!tables[key]) {
          done++
          setRestoreProgress(10 + Math.round((done / restoreOrder.length) * 85))
          continue
        }

        const records = tables[key].records || []
        if (records.length === 0) {
          console.log(`${key}: no records to restore`)
          done++
          setRestoreProgress(10 + Math.round((done / restoreOrder.length) * 85))
          continue
        }

        console.log(`Restoring ${key}: ${records.length} records...`)

        for (let i = 0; i < records.length; i += 50) {
          const chunk = records.slice(i, i + 50)
          const { error: insertError } = await supabase.from(key).insert(chunk)
          if (insertError) console.error(`Insert error for ${key} chunk ${i}:`, insertError)
        }

        console.log(`${key}: restored ${records.length} records ✅`)
        done++
        setRestoreProgress(10 + Math.round((done / restoreOrder.length) * 85))
      }

      setRestoreProgress(100)

      await logAction({
        action: 'Backup Restored',
        module: 'Settings',
        details: {
          backup_date: selectedBackup.created_at,
          tables_restored: Object.keys(tables),
          total_records: Object.values(tables).reduce((s, t) => s + (t.count || 0), 0),
        },
      })

      showToast('✅ Restore complete! Reloading app...', 'success')
      setTimeout(() => window.location.reload(), 2000)
    } catch (err: unknown) {
      console.error('Restore error:', err)
      showToast('Restore failed: ' + (err instanceof Error ? err.message : String(err)), 'error')
      setRestoreLoading(false)
    }
  }

  async function executeReset() {
    try {
      setResetting(true)

      // Verify password via re-auth
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { showToast('Not authenticated', 'error'); setResetting(false); return }

      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email!,
        password: resetPassword,
      })
      if (authError) {
        showToast('Wrong password! Reset cancelled.', 'error')
        setResetting(false)
        return
      }

      // Double-check super admin role from DB
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'super_admin') {
        showToast('Only Super Admin can reset data!', 'error')
        setResetting(false)
        return
      }

      // Auto backup before wiping
      showToast('🔄 Creating backup before reset...', 'info')
      await triggerBackup([
        'transactions','customers','cards','ac_sheet','cc_sheet',
        'bl_sheet','customer_sheet','swipe_machines','bank_account_master',
      ], false)

      // Execute reset via RPC
      showToast('🗑️ Resetting all data...', 'info')
      const { error: resetError } = await supabase.rpc('reset_all_data')
      if (resetError) {
        showToast('Reset failed: ' + resetError.message, 'error')
        setResetting(false)
        return
      }

      // Audit log
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        user_email: user.email,
        action: 'SYSTEM RESET',
        module: 'Settings — Danger Zone',
        details: {
          reset_by: user.email,
          reset_at: new Date().toISOString(),
          confirmed_text: 'RESET ALL DATA',
        },
      })

      showToast('✅ All data reset successfully! Reloading...', 'success')
      setShowResetModal(false)
      setResetStep(1)
      setResetConfirmText('')
      setResetPassword('')
      setTimeout(() => window.location.reload(), 2000)
    } catch (err: unknown) {
      showToast('Reset failed: ' + (err instanceof Error ? err.message : String(err)), 'error')
    } finally {
      setResetting(false)
    }
  }

  function saveAutoSettings() {
    localStorage.setItem('auto_backup_enabled', String(autoEnabled))
    localStorage.setItem('auto_backup_frequency', autoFrequency)
    localStorage.setItem('auto_backup_keep', String(keepLast))
    showToast('Auto backup settings saved', 'success')
  }

  const toastColor = toast?.type === 'success' ? '#3ECF8E' : toast?.type === 'error' ? '#ef4444' : '#3b82f6'

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {/* Toast */}
      {toast && (
        <div
          className="fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white"
          style={{ background: toastColor }}
        >
          {toast.msg}
        </div>
      )}

      {/* ── STRATEGY OVERVIEW ── */}
      <div style={{
        background: '#f0fdf4', border: '1px solid #86efac',
        borderRadius: '8px', padding: '16px',
      }}>
        <div style={{ fontWeight: '700', fontSize: '14px', marginBottom: '12px', color: '#1a1a1a' }}>
          🛡️ Active Backup Strategy
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[
            {
              icon: '⚡',
              title: 'Every Transaction → Supabase Storage',
              desc: 'Each entry automatically backed up to cloud instantly (silent)',
              badge: 'ALWAYS ACTIVE',
              badgeColor: '#dcfce7',
              badgeText: '#16a34a',
            },
            {
              icon: '📅',
              title: 'Every Day at 8 PM → Google Drive',
              desc: 'Full daily backup uploaded to "SwipeSaaS Backups" folder',
              badge: isDriveConnected ? '✅ CONNECTED' : '❌ Connect Google Drive below',
              badgeColor: isDriveConnected ? '#dcfce7' : '#fee2e2',
              badgeText: isDriveConnected ? '#16a34a' : '#ef4444',
            },
            {
              icon: '📦',
              title: 'Every 7 Days → Local PC Download',
              desc: 'Full backup downloaded to your PC automatically (with prompt)',
              badge: 'ALWAYS ACTIVE',
              badgeColor: '#dcfce7',
              badgeText: '#16a34a',
            },
          ].map(s => (
            <div key={s.title} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '20px', lineHeight: 1 }}>{s.icon}</span>
              <div>
                <div style={{ fontWeight: '600', fontSize: '13px', color: '#1a1a1a' }}>{s.title}</div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{s.desc}</div>
                <span style={{
                  display: 'inline-block', marginTop: '4px',
                  background: s.badgeColor, color: s.badgeText,
                  fontSize: '10px', fontWeight: '700', padding: '1px 7px', borderRadius: '4px',
                }}>{s.badge}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── SECTION 1: Create Backup ── */}
      <Card>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="font-semibold text-[#1a1a1a] flex items-center gap-2">
              <Database size={16} /> Create Backup
            </h2>
            <p className="text-xs text-[#6b7280] mt-1">Export all your data as a JSON file. Store it safely offline.</p>
            <p className="text-xs mt-1" style={{ color: lastBackup ? '#3ECF8E' : '#9ca3af' }}>
              {lastBackup
                ? `Last backup: ${new Date(lastBackup).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                : 'Last backup: Never'}
            </p>
          </div>
          <button
            onClick={() => triggerBackup(selectedTables)}
            disabled={backupLoading || selectedTables.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: '#3ECF8E' }}
          >
            {backupLoading ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
            {backupLoading ? 'Creating...' : 'Create Backup'}
          </button>
        </div>

        {/* Table checkboxes */}
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          {TABLE_LIST.map(t => (
            <label key={t.key} className="flex items-center gap-2 text-xs cursor-pointer select-none hover:text-[#1a1a1a]" style={{ color: '#374151' }}>
              <input
                type="checkbox"
                checked={selectedTables.includes(t.key)}
                onChange={() =>
                  setSelectedTables(prev =>
                    prev.includes(t.key) ? prev.filter(k => k !== t.key) : [...prev, t.key]
                  )
                }
                className="accent-[#3ECF8E]"
              />
              {t.label}
            </label>
          ))}
        </div>
        <div className="flex gap-2 text-xs text-[#6b7280]">
          <button onClick={() => setSelectedTables(TABLE_LIST.map(t => t.key))} className="underline hover:text-[#3ECF8E]">Select all</button>
          <span>·</span>
          <button onClick={() => setSelectedTables([])} className="underline hover:text-[#ef4444]">Deselect all</button>
          <span className="ml-auto">{selectedTables.length}/{TABLE_LIST.length} selected</span>
        </div>

        {backupLoading && (
          <div className="mt-3">
            <div className="text-xs text-[#6b7280] mb-1">{backupStatusMsg || 'Working...'} {backupProgress}%</div>
            <ProgressBar progress={backupProgress} />
          </div>
        )}
        {!backupLoading && backupProgress === 100 && (
          <div className="mt-2 text-xs text-[#3ECF8E] font-medium">✅ Backup complete!</div>
        )}
      </Card>

      {/* ── Google Drive Card ── */}
      <Card>
        <h2 className="font-semibold text-[#1a1a1a] flex items-center gap-2 mb-4">
          📁 Google Drive Backup
        </h2>

        {!googleConfigured && (
          <div className="rounded-md px-3 py-2.5 text-xs mb-4" style={{ background: '#fefce8', border: '1px solid #fde68a', color: '#854d0e' }}>
            <strong>Setup required:</strong> Add <code>NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> and{' '}
            <code>NEXT_PUBLIC_GOOGLE_API_KEY</code> to <code>.env.local</code> to enable Google Drive backups.
            <div className="mt-1 text-[10px]">Get credentials at <strong>console.cloud.google.com</strong> → Enable Drive API → Create OAuth 2.0 credentials → Add <code>http://localhost:3000</code> as authorized origin.</div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-[#1a1a1a]">Automatically backup to Google Drive</div>
            <div className="text-xs text-[#6b7280] mt-0.5">
              Uploads to &quot;SwipeSaaS Backups&quot; folder in your Google Drive
            </div>
          </div>
          {isDriveConnected ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium" style={{ color: '#16a34a' }}>✅ Connected</span>
              <button
                onClick={disconnectGoogleDrive}
                className="px-3 py-1.5 rounded border text-xs font-medium"
                style={{ borderColor: '#fecaca', color: '#ef4444', background: 'white' }}
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={connectGoogleDrive}
              disabled={driveConnecting || !googleConfigured}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: '#4285f4' }}
            >
              {driveConnecting ? <RefreshCw size={13} className="animate-spin" /> : '🔗'}
              {driveConnecting ? 'Connecting...' : 'Connect Google Drive'}
            </button>
          )}
        </div>

        {isDriveConnected && (
          <div className="mt-3 rounded-md px-3 py-2 text-xs" style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#166534' }}>
            ✅ Backups will auto-upload to &quot;SwipeSaaS Backups&quot; folder in your Google Drive on every backup
          </div>
        )}
      </Card>

      {/* ── SECTION 2: Restore ── */}
      <Card>
        <h2 className="font-semibold text-[#1a1a1a] flex items-center gap-2 mb-3">
          <Upload size={16} /> Restore from Backup
        </h2>

        {/* Warning */}
        <div className="rounded-md px-3 py-2.5 text-xs mb-4" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}>
          <span className="font-bold">⚠️ WARNING:</span> Restoring will <strong>REPLACE all existing data</strong>. This cannot be undone.
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={e => {
            e.preventDefault()
            setIsDragging(false)
            const file = e.dataTransfer.files[0]
            if (file?.name.endsWith('.json')) handleFileSelect(file)
            else showToast('Please upload a .json backup file', 'error')
          }}
          onClick={() => document.getElementById('backup-file-input')?.click()}
          style={{
            border: `2px dashed ${isDragging ? '#3ECF8E' : backupFile ? '#86efac' : '#e5e7eb'}`,
            borderRadius: '8px',
            padding: '32px',
            textAlign: 'center',
            cursor: 'pointer',
            background: isDragging ? '#f0fdf4' : backupFile ? '#f0fdf4' : '#f9fafb',
            transition: 'all 0.2s',
          }}
        >
          <div style={{ fontSize: '36px', marginBottom: '8px' }}>📁</div>
          <div style={{ fontWeight: '600', fontSize: '13px', color: '#374151' }}>
            {backupFile ? `📄 ${backupFile.name}` : 'Drop backup file here or click to browse'}
          </div>
          <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
            Accepts: SwipeSaaS_Backup_*.json files only
          </div>
          <input
            id="backup-file-input"
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }}
          />
        </div>

        {/* Preview */}
        {backupPreview && (
          <div style={{
            background: '#f0fdf4', border: '1px solid #86efac',
            borderRadius: '8px', padding: '14px', marginTop: '12px',
          }}>
            <div className="font-semibold text-sm mb-2 text-[#1a1a1a]">📋 Backup Preview</div>
            <div className="text-xs text-[#374151] mb-3">
              <span className="text-[#6b7280]">Created:</span>{' '}
              {new Date(backupPreview.created_at).toLocaleString('en-IN')}
              {backupPreview.app_name && (
                <span className="ml-3 text-[#6b7280]">App: <span className="text-[#374151]">{backupPreview.app_name}</span></span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {backupPreview.tables.map(t => (
                <div key={t.name} style={{
                  background: 'white', borderRadius: '4px', padding: '5px 8px',
                  fontSize: '11px', border: `1px solid ${t.hasError ? '#fecaca' : '#d1fae5'}`,
                }}>
                  <span className="font-semibold text-[#1a1a1a]">{t.name}</span>
                  <span style={{ color: t.hasError ? '#dc2626' : '#6b7280', marginLeft: '5px' }}>
                    {t.hasError ? '⚠ error' : `${t.count} rows`}
                  </span>
                </div>
              ))}
            </div>
            <div className="text-xs text-[#6b7280] mt-2">
              Total: {backupPreview.tables.reduce((s, t) => s + t.count, 0).toLocaleString('en-IN')} records across {backupPreview.tables.length} tables
            </div>
          </div>
        )}

        {backupFile && (
          <div className="flex items-center justify-between mt-4">
            <button
              onClick={() => { setBackupFile(null); setSelectedBackup(null); setBackupPreview(null) }}
              className="text-xs text-[#6b7280] underline"
            >
              Clear selection
            </button>
            <button
              onClick={restoreBackup}
              disabled={restoreLoading || !selectedBackup}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: '#ef4444' }}
            >
              {restoreLoading ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />}
              {restoreLoading ? 'Restoring...' : 'Restore Data'}
            </button>
          </div>
        )}

        {restoreLoading && (
          <div className="mt-3">
            <div className="text-xs text-[#6b7280] mb-1">Restoring... {restoreProgress}%</div>
            <ProgressBar progress={restoreProgress} color="#ef4444" />
          </div>
        )}
      </Card>

      {/* ── SECTION 3: Auto Backup ── */}
      <Card>
        <h2 className="font-semibold text-[#1a1a1a] flex items-center gap-2 mb-4">
          <RefreshCw size={16} /> Auto Backup Settings
        </h2>

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-[#1a1a1a]">Enable Auto Backup</div>
              <div className="text-xs text-[#6b7280] mt-0.5">Automatically backup data on schedule</div>
            </div>
            <ToggleSwitch enabled={autoEnabled} onChange={() => setAutoEnabled(v => !v)} />
          </div>

          {autoEnabled && (
            <>
              <div className="flex items-center justify-between">
                <label className="text-sm text-[#374151]">Frequency</label>
                <div className="flex gap-1">
                  {(['daily', 'weekly', 'monthly'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setAutoFrequency(f)}
                      className="px-3 py-1.5 rounded text-xs font-medium capitalize border"
                      style={{
                        background: autoFrequency === f ? '#3ECF8E' : 'white',
                        color: autoFrequency === f ? 'white' : '#374151',
                        borderColor: autoFrequency === f ? '#3ECF8E' : '#e5e7eb',
                      }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label className="text-sm text-[#374151]">Keep last backups</label>
                <div className="flex gap-1">
                  {[3, 5, 10].map(n => (
                    <button
                      key={n}
                      onClick={() => setKeepLast(n)}
                      className="w-10 py-1.5 rounded text-xs font-medium border"
                      style={{
                        background: keepLast === n ? '#3ECF8E' : 'white',
                        color: keepLast === n ? 'white' : '#374151',
                        borderColor: keepLast === n ? '#3ECF8E' : '#e5e7eb',
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <button
            onClick={saveAutoSettings}
            className="self-start px-4 py-2 rounded-md text-sm font-medium text-white"
            style={{ background: '#3ECF8E' }}
          >
            Save Settings
          </button>
        </div>
      </Card>

      {/* ── SECTION 4: Backup History ── */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-[#1a1a1a] flex items-center gap-2">
            <Shield size={16} /> Backup History
          </h2>
          <button onClick={fetchBackupHistory} className="text-xs text-[#6b7280] underline flex items-center gap-1">
            <RefreshCw size={11} /> Refresh
          </button>
        </div>

        {historyLoading ? (
          <div className="text-sm text-[#6b7280] text-center py-4">Loading...</div>
        ) : backupHistory.length === 0 ? (
          <div className="text-sm text-[#9ca3af] text-center py-6">No backup history yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#f9fafb]">
                <tr>
                  {['Date & Time', 'Type', 'Size', 'Supabase', 'Google Drive', 'Actions'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-semibold text-[#6b7280] uppercase border-b border-[#e5e7eb] whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {backupHistory.map(b => (
                  <tr key={b.id} className="border-b border-[#e5e7eb] hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap text-[#6b7280]">
                      {new Date(b.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap"
                        style={{ background: b.backup_type === 'auto' ? '#dbeafe' : '#f3f4f6', color: b.backup_type === 'auto' ? '#1e40af' : '#374151' }}>
                        {b.backup_type === 'auto' ? 'AUTO' : 'MANUAL'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#6b7280] whitespace-nowrap">{b.backup_size}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {b.storage_path
                        ? <span style={{ color: '#16a34a' }}>✅ Saved</span>
                        : <span style={{ color: '#9ca3af' }}>—</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {b.google_drive_id
                        ? <a href={b.google_drive_url} target="_blank" rel="noreferrer" style={{ color: '#16a34a' }}>✅ Saved ↗</a>
                        : <span style={{ color: '#9ca3af' }}>—</span>}
                    </td>
                    <td className="px-3 py-2">
                      {b.storage_path ? (
                        <button
                          onClick={() => downloadFromStorage(b.storage_path!, b.backup_name)}
                          className="flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-medium hover:bg-gray-50"
                          style={{ borderColor: '#e5e7eb', color: '#374151' }}
                        >
                          <Download size={10} /> Download
                        </button>
                      ) : (
                        <span className="text-[10px] text-[#9ca3af] italic">local only</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── DANGER ZONE — super admin only ── */}
      {isSuperAdmin && (
        <div style={{ border: '2px solid #ef4444', borderRadius: '8px', padding: '20px', marginTop: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <span style={{ fontSize: '20px' }}>⚠️</span>
            <div>
              <div style={{ fontWeight: 'bold', fontSize: '16px', color: '#ef4444' }}>Danger Zone</div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>These actions are irreversible. Proceed with extreme caution.</div>
            </div>
          </div>

          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '16px', background: '#fff5f5', borderRadius: '8px',
            border: '1px solid #fecaca',
          }}>
            <div>
              <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#1a1a1a' }}>Reset All Data</div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                Permanently delete ALL transactions, customers, sheets, reminders and logs. This cannot be undone.
              </div>
            </div>
            <button
              onClick={() => { setShowResetModal(true); setResetStep(1); setResetConfirmText(''); setResetPassword('') }}
              style={{
                background: '#ef4444', color: 'white', border: 'none',
                borderRadius: '6px', padding: '8px 16px', cursor: 'pointer',
                fontSize: '13px', fontWeight: 'bold', whiteSpace: 'nowrap', marginLeft: '16px',
              }}
            >
              🗑️ Reset All Data
            </button>
          </div>
        </div>
      )}

      {/* ── RESET MODAL ── */}
      {showResetModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
          zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div style={{
            background: 'white', borderRadius: '12px', width: '100%', maxWidth: 480,
            padding: '24px', border: '2px solid #ef4444',
          }}>

            {/* Step 1 — Warning */}
            {resetStep === 1 && (
              <>
                <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                  <div style={{ fontSize: '48px' }}>⚠️</div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#ef4444' }}>RESET ALL DATA</div>
                  <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '8px' }}>This will permanently delete:</div>
                </div>

                <div style={{ background: '#fff5f5', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
                  {[
                    'All transactions (Daily Register)',
                    'All customers and their cards',
                    'All AC Sheet, CC Sheet, BL Sheet data',
                    'All Customer Sheets',
                    'All reminders',
                    'All risk alerts',
                    'All audit logs',
                    'All swipe machines',
                    'All bank accounts',
                  ].map((item, i, arr) => (
                    <div key={i} style={{
                      fontSize: '13px', color: '#ef4444', padding: '3px 0',
                      borderBottom: i < arr.length - 1 ? '1px solid #fecaca' : 'none',
                    }}>
                      ✗ {item}
                    </div>
                  ))}
                </div>

                <div style={{
                  background: '#fef9c3', border: '1px solid #fde047', borderRadius: '8px',
                  padding: '10px', marginBottom: '16px', fontSize: '13px', color: '#854d0e',
                  display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
                }}>
                  💡 Recommendation: Create a backup before resetting!
                  <button
                    onClick={() => {
                      setShowResetModal(false)
                      triggerBackup(['transactions','customers','cards','ac_sheet','cc_sheet'])
                    }}
                    style={{
                      background: '#f59e0b', color: 'white', border: 'none',
                      borderRadius: '4px', padding: '4px 10px', cursor: 'pointer', fontSize: '12px',
                    }}
                  >
                    Create Backup Now
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => setShowResetModal(false)}
                    style={{ flex: 1, border: '1px solid #e5e7eb', background: 'white', padding: '10px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>
                    Cancel
                  </button>
                  <button onClick={() => setResetStep(2)}
                    style={{ flex: 1, background: '#ef4444', color: 'white', border: 'none', padding: '10px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}>
                    I understand, continue →
                  </button>
                </div>
              </>
            )}

            {/* Step 2 — Type confirmation */}
            {resetStep === 2 && (
              <>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#ef4444', marginBottom: '8px' }}>Type to confirm reset</div>
                  <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>
                    Type <strong style={{ color: '#ef4444' }}>RESET ALL DATA</strong> to confirm:
                  </div>
                  <input
                    type="text"
                    value={resetConfirmText}
                    onChange={e => setResetConfirmText(e.target.value)}
                    placeholder="Type: RESET ALL DATA"
                    style={{ width: '100%', border: '2px solid #ef4444', borderRadius: '6px', padding: '10px 12px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                  />
                  {resetConfirmText && resetConfirmText !== 'RESET ALL DATA' && (
                    <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }}>Text does not match</div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => { setResetStep(1); setResetConfirmText('') }}
                    style={{ flex: 1, border: '1px solid #e5e7eb', background: 'white', padding: '10px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>
                    ← Back
                  </button>
                  <button
                    onClick={() => { if (resetConfirmText === 'RESET ALL DATA') setResetStep(3) }}
                    disabled={resetConfirmText !== 'RESET ALL DATA'}
                    style={{
                      flex: 1, padding: '10px', borderRadius: '6px', border: 'none',
                      background: resetConfirmText === 'RESET ALL DATA' ? '#ef4444' : '#9ca3af',
                      color: 'white', cursor: resetConfirmText === 'RESET ALL DATA' ? 'pointer' : 'not-allowed',
                      fontSize: '14px', fontWeight: 'bold',
                    }}
                  >
                    Continue →
                  </button>
                </div>
              </>
            )}

            {/* Step 3 — Enter password */}
            {resetStep === 3 && (
              <>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#ef4444', marginBottom: '8px' }}>Enter your password</div>
                  <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>Enter your admin password to authorize this reset:</div>
                  <input
                    type="password"
                    value={resetPassword}
                    onChange={e => setResetPassword(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && resetPassword) executeReset() }}
                    placeholder="Enter your password"
                    style={{ width: '100%', border: '2px solid #ef4444', borderRadius: '6px', padding: '10px 12px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                    autoFocus
                  />
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => { setResetStep(2); setResetPassword('') }}
                    style={{ flex: 1, border: '1px solid #e5e7eb', background: 'white', padding: '10px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>
                    ← Back
                  </button>
                  <button
                    onClick={executeReset}
                    disabled={!resetPassword || resetting}
                    style={{
                      flex: 1, padding: '10px', borderRadius: '6px', border: 'none',
                      background: resetPassword && !resetting ? '#ef4444' : '#9ca3af',
                      color: 'white', cursor: resetPassword && !resetting ? 'pointer' : 'not-allowed',
                      fontSize: '14px', fontWeight: 'bold',
                    }}
                  >
                    {resetting ? '🔄 Resetting...' : '🗑️ RESET ALL DATA'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Settings Page ────────────────────────────────────────────────────────
export default function SettingsPage() {
  const auth = useAuth()
  const isSuperAdmin = auth?.role === 'super_admin'

  const [activeTab, setActiveTab] = useState<Tab>('General')
  const [bizName, setBizName] = useState('chamundaswipe')
  const [commission, setCommission] = useState('2.2')
  const [timezone, setTimezone] = useState('Asia/Kolkata')
  const [twoFA, setTwoFA] = useState(false)
  const [notifs, setNotifs] = useState({ email: true, sms: false, dueDate: true, risk: true })
  const [accts, setAccts] = useState(accounts.map(a => ({ ...a, editing: false, draft: String(a.balance) })))

  function toggleNotif(key: keyof typeof notifs) {
    setNotifs(n => ({ ...n, [key]: !n[key] }))
  }

  const tabs: Tab[] = ['General', 'Security', 'Notifications', 'Accounts', 'Backup & Restore']

  return (
    <div>
      <h1 className="text-lg font-bold text-[#1a1a1a] mb-4">Settings</h1>

      {/* Tab bar */}
      <div className="flex border-b border-[#e5e7eb] mb-6 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className="px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap"
            style={{
              borderColor: activeTab === t ? '#3ECF8E' : 'transparent',
              color: activeTab === t ? '#3ECF8E' : '#6b7280',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* General */}
      {activeTab === 'General' && (
        <div className="bg-white rounded-lg border p-6 max-w-xl" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">Business Name</label>
              <input className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-[#3ECF8E]" style={{ borderColor: '#e5e7eb' }} value={bizName} onChange={e => setBizName(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">Default Commission %</label>
              <input type="number" step="0.1" className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-[#3ECF8E]" style={{ borderColor: '#e5e7eb' }} value={commission} onChange={e => setCommission(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">Currency</label>
              <input disabled className="w-full rounded-md border px-3 py-2 text-sm bg-[#f9f9f9] text-[#6b7280] cursor-not-allowed" style={{ borderColor: '#e5e7eb' }} value="₹ INR" />
              <p className="text-xs text-[#9ca3af] mt-1">Currency is locked for this account</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">Timezone</label>
              <select className="w-full rounded-md border px-3 py-2 text-sm bg-white outline-none focus:border-[#3ECF8E]" style={{ borderColor: '#e5e7eb' }} value={timezone} onChange={e => setTimezone(e.target.value)}>
                <option value="Asia/Kolkata">(GMT+5:30) Asia/Kolkata</option>
                <option value="Asia/Dubai">(GMT+4:00) Asia/Dubai</option>
                <option value="UTC">(GMT+0:00) UTC</option>
              </select>
            </div>
            <button className="self-start px-4 py-2 rounded-md text-sm font-medium text-white" style={{ background: '#3ECF8E' }}>Save Changes</button>
          </div>
        </div>
      )}

      {/* Security */}
      {activeTab === 'Security' && (
        <div className="flex flex-col gap-4 max-w-xl">
          <div className="bg-white rounded-lg border p-6" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <h2 className="font-semibold text-[#1a1a1a] mb-4">Change Password</h2>
            <div className="flex flex-col gap-3">
              {['Current Password', 'New Password', 'Confirm New Password'].map(l => (
                <div key={l}>
                  <label className="block text-xs font-medium text-[#374151] mb-1">{l}</label>
                  <input type="password" className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-[#3ECF8E]" style={{ borderColor: '#e5e7eb' }} placeholder="••••••••" />
                </div>
              ))}
              <button className="self-start px-4 py-2 rounded-md text-sm font-medium text-white mt-1" style={{ background: '#3ECF8E' }}>Update Password</button>
            </div>
          </div>
          <div className="bg-white rounded-lg border p-6" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-[#1a1a1a]">Two-Factor Authentication</h2>
                <p className="text-sm text-[#6b7280] mt-0.5">Add an extra layer of security to your account</p>
              </div>
              <ToggleSwitch enabled={twoFA} onChange={() => setTwoFA(v => !v)} />
            </div>
          </div>
        </div>
      )}

      {/* Notifications */}
      {activeTab === 'Notifications' && (
        <div className="bg-white rounded-lg border p-6 max-w-xl" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <h2 className="font-semibold text-[#1a1a1a] mb-4">Notification Preferences</h2>
          <div className="flex flex-col divide-y divide-[#e5e7eb]">
            {[
              { key: 'email', label: 'Email Alerts', desc: 'Receive important alerts and reports via email' },
              { key: 'sms', label: 'SMS Alerts', desc: 'Get critical notifications via SMS' },
              { key: 'dueDate', label: 'Due Date Reminders', desc: 'Automatic reminders before card payment due dates' },
              { key: 'risk', label: 'Risk Alerts', desc: 'Instant alerts for high-risk transaction patterns' },
            ].map(n => (
              <div key={n.key} className="flex items-center justify-between py-4">
                <div>
                  <div className="font-medium text-sm text-[#1a1a1a]">{n.label}</div>
                  <div className="text-xs text-[#6b7280] mt-0.5">{n.desc}</div>
                </div>
                <ToggleSwitch enabled={notifs[n.key as keyof typeof notifs]} onChange={() => toggleNotif(n.key as keyof typeof notifs)} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Accounts */}
      {activeTab === 'Accounts' && (
        <div className="bg-white rounded-lg border overflow-hidden max-w-2xl" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div className="px-4 py-3 border-b border-[#e5e7eb] font-semibold text-sm text-[#1a1a1a]">Bank Accounts ({accts.length})</div>
          <table className="w-full text-sm">
            <thead className="bg-[#f9f9f9]">
              <tr>
                {['Account Name', 'Current Balance', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-[#6b7280] uppercase border-b border-[#e5e7eb]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {accts.map((a, i) => (
                <tr key={a.name} className="border-b border-[#e5e7eb] hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold" style={{ background: '#dbeafe', color: '#1e40af' }}>{a.name}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    {a.editing ? (
                      <input type="number" className="rounded border px-2 py-1 text-sm w-36 outline-none focus:border-[#3ECF8E]" style={{ borderColor: '#e5e7eb' }} value={a.draft} onChange={e => setAccts(prev => prev.map((x, j) => j === i ? { ...x, draft: e.target.value } : x))} />
                    ) : (
                      <span className="font-medium">₹{a.balance.toLocaleString('en-IN')}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {a.editing ? (
                      <div className="flex gap-2">
                        <button className="px-2.5 py-1 rounded text-xs text-white font-medium" style={{ background: '#3ECF8E' }} onClick={() => setAccts(prev => prev.map((x, j) => j === i ? { ...x, balance: Number(x.draft), editing: false } : x))}>Save</button>
                        <button className="px-2.5 py-1 rounded text-xs border" style={{ borderColor: '#e5e7eb' }} onClick={() => setAccts(prev => prev.map((x, j) => j === i ? { ...x, editing: false, draft: String(x.balance) } : x))}>Cancel</button>
                      </div>
                    ) : (
                      <button className="px-2.5 py-1 rounded border text-xs" style={{ borderColor: '#e5e7eb' }} onClick={() => setAccts(prev => prev.map((x, j) => j === i ? { ...x, editing: true } : x))}>Edit</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Backup & Restore */}
      {activeTab === 'Backup & Restore' && <BackupTab isSuperAdmin={isSuperAdmin} />}
    </div>
  )
}
