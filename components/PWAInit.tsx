'use client'
import { useEffect, useState } from 'react'

export function PWAInit() {
  const [installPrompt, setInstallPrompt] = useState<Event & { prompt: () => void; userChoice: Promise<{ outcome: string }> } | null>(null)
  const [showInstallBanner, setShowInstallBanner] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => console.log('SW registered:', reg.scope))
        .catch((err) => console.error('SW registration failed:', err))
    }

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
      return
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as Event & { prompt: () => void; userChoice: Promise<{ outcome: string }> })
      setTimeout(() => setShowInstallBanner(true), 30000)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) return
    installPrompt.prompt()
    const result = await installPrompt.userChoice
    if (result.outcome === 'accepted') {
      setIsInstalled(true)
      setShowInstallBanner(false)
    }
  }

  if (isInstalled || !showInstallBanner) return null

  return (
    <div style={{
      position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
      background: '#1a1a1a', color: 'white', padding: '14px 20px',
      borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px',
      zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      border: '1px solid #3ECF8E', maxWidth: '340px', width: '90%',
    }}>
      <div style={{ fontSize: '28px' }}>📱</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 'bold', fontSize: '14px' }}>Install SwipeSaaS</div>
        <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>
          Add to home screen for quick access
        </div>
      </div>
      <div style={{ display: 'flex', gap: '6px' }}>
        <button onClick={() => setShowInstallBanner(false)} style={{
          background: 'none', border: '1px solid #444', color: '#9ca3af',
          borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '12px',
        }}>
          Later
        </button>
        <button onClick={handleInstall} style={{
          background: '#3ECF8E', color: '#0f0f0f', border: 'none',
          borderRadius: '6px', padding: '6px 12px', cursor: 'pointer',
          fontSize: '12px', fontWeight: 'bold',
        }}>
          Install
        </button>
      </div>
    </div>
  )
}
