'use client'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

const NAV_ITEMS = [
  { path: '/pwa', icon: '🏠', label: 'Home' },
]

export function MobileNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [show, setShow] = useState(false)

  useEffect(() => {
    const check = () =>
      setShow(window.innerWidth < 768 || window.matchMedia('(display-mode: standalone)').matches)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  if (!show) return null

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: '#1a1a1a', borderTop: '1px solid #2a2a2a',
      display: 'flex', paddingBottom: 'env(safe-area-inset-bottom)',
      zIndex: 100,
    }}>
      {NAV_ITEMS.map(item => {
        const isActive = pathname === item.path || pathname.startsWith(item.path + '/')
        return (
          <button key={item.path} onClick={() => router.push(item.path)} style={{
            flex: 1, background: 'none', border: 'none',
            padding: '10px 4px', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
          }}>
            <span style={{ fontSize: '22px' }}>{item.icon}</span>
            <span style={{
              fontSize: '10px', fontFamily: 'system-ui',
              color: isActive ? '#3ECF8E' : '#666',
              fontWeight: isActive ? 'bold' : 'normal',
            }}>
              {item.label}
            </span>
            {isActive && (
              <div style={{ width: '4px', height: '4px', background: '#3ECF8E', borderRadius: '50%' }} />
            )}
          </button>
        )
      })}
    </nav>
  )
}
