'use client'

import { useEffect } from 'react'
import { runDailyGoogleDriveBackup } from '@/lib/daily-backup'
import { checkWeeklyLocalBackup } from '@/lib/weekly-backup'

export function BackupScheduler() {
  useEffect(() => {
    // Weekly backup check on mount
    checkWeeklyLocalBackup()

    // Daily Google Drive backup: run now if past 8 PM, then check every hour
    const runIfEvening = () => {
      if (new Date().getHours() >= 20) {
        runDailyGoogleDriveBackup()
      }
    }

    runIfEvening()
    const hourlyInterval = setInterval(runIfEvening, 60 * 60 * 1000)

    // Also run on tab/app close
    const handleUnload = () => { runDailyGoogleDriveBackup() }
    window.addEventListener('beforeunload', handleUnload)

    return () => {
      clearInterval(hourlyInterval)
      window.removeEventListener('beforeunload', handleUnload)
    }
  }, [])

  return null
}
