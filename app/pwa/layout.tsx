'use client'
import { AuthProvider } from '@/lib/auth-context'
import { MobileNav } from '@/components/pwa/MobileNav'

export default function PWALayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <div style={{ minHeight: '100vh', background: '#f3f4f6', paddingBottom: '70px' }}>
        {children}
        <MobileNav />
      </div>
    </AuthProvider>
  )
}
