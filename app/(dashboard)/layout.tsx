import Sidebar from '@/components/ui/Sidebar'
import Header from '@/components/Header'
import { AuthProvider } from '@/lib/auth-context'
import { DailyReminderPopup } from '@/components/reminders/DailyReminderPopup'
import { BackupScheduler } from '@/components/backup/BackupScheduler'
import { MobileNav } from '@/components/pwa/MobileNav'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DailyReminderPopup />
      <BackupScheduler />
      <div className="flex min-h-screen" style={{ background: '#f9f9f9' }}>
        <Sidebar />
        <div className="flex-1 flex flex-col" style={{ marginLeft: 240 }}>
          <Header />
          <main className="flex-1 overflow-auto p-6" style={{ marginTop: 48 }}>
            {children}
          </main>
        </div>
      </div>
      <MobileNav />
    </AuthProvider>
  )
}
