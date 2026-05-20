'use client'

import { useState, useEffect } from 'react'

export function BackupStatusWidget() {
  const [lastTransaction, setLastTransaction] = useState<string | null>(null)
  const [lastDaily, setLastDaily] = useState<string | null>(null)
  const [lastWeekly, setLastWeekly] = useState<string | null>(null)
  const [isDriveConnected, setIsDriveConnected] = useState(false)

  useEffect(() => {
    setLastTransaction(localStorage.getItem('last_transaction_backup'))
    setLastDaily(localStorage.getItem('last_daily_drive_backup'))
    setLastWeekly(localStorage.getItem('last_weekly_local_backup'))
    setIsDriveConnected(localStorage.getItem('google_drive_connected') === 'true')
  }, [])

  const today = new Date().toISOString().split('T')[0]
  const dailyDoneToday = lastDaily === today

  function fmtDate(iso: string | null) {
    if (!iso) return 'Never'
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  return (
    <div style={{
      border: '1px solid #e5e7eb', borderRadius: '8px',
      padding: '12px 14px', fontSize: '12px', background: 'white',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      <div style={{ fontWeight: '700', marginBottom: '10px', fontSize: '13px', color: '#1a1a1a' }}>
        🛡️ Backup Status
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#374151' }}>⚡ Per-Transaction (Supabase)</span>
          <span style={{ color: '#16a34a', fontWeight: '600', fontSize: '11px' }}>
            {lastTransaction ? `✅ ${fmtDate(lastTransaction)}` : '● Active'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#374151' }}>📅 Daily (Google Drive)</span>
          <span style={{
            fontWeight: '600', fontSize: '11px',
            color: isDriveConnected ? (dailyDoneToday ? '#16a34a' : '#d97706') : '#ef4444',
          }}>
            {isDriveConnected
              ? (dailyDoneToday ? '✅ Done today' : '⏳ Pending (8 PM)')
              : '❌ Not connected'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#374151' }}>📦 Weekly (Local PC)</span>
          <span style={{ color: '#16a34a', fontWeight: '600', fontSize: '11px' }}>
            {lastWeekly ? `✅ ${fmtDate(lastWeekly)}` : '⏳ Never'}
          </span>
        </div>
      </div>
    </div>
  )
}
