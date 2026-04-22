'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  Home, LayoutGrid, Terminal, Users, CreditCard, Monitor,
  FileText, Bell, AlertTriangle, BarChart2, List, Grid, Settings
} from 'lucide-react'

const navGroups = [
  [
    { icon: Home, label: 'Dashboard', href: '/dashboard' },
    { icon: LayoutGrid, label: 'Sheet Editor', href: '/sheets' },
    { icon: Terminal, label: 'New Entry', href: '/entry' },
  ],
  [
    { icon: Users, label: 'Customers', href: '/customers' },
    { icon: CreditCard, label: 'Transactions', href: '/transactions' },
    { icon: Monitor, label: 'Swipe Machines', href: '/machines' },
    { icon: FileText, label: 'Reports', href: '/reports' },
  ],
  [
    { icon: Bell, label: 'Reminders', href: '/reminders' },
    { icon: AlertTriangle, label: 'Risk Alerts', href: '/alerts' },
    { icon: BarChart2, label: 'Analytics', href: '/analytics' },
  ],
  [
    { icon: List, label: 'Audit Logs', href: '/logs' },
    { icon: Grid, label: 'Users & Roles', href: '/users' },
  ],
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <div
      className="flex flex-col fixed left-0 top-0 h-full z-40"
      style={{ width: 240, background: '#1a1a1a' }}
    >
      {/* Logo */}
      <div className="px-4 py-4 border-b border-[#2a2a2a]">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded flex items-center justify-center text-white font-bold text-sm"
            style={{ background: '#3ECF8E' }}
          >
            S
          </div>
          <span className="text-white font-bold text-base">SwipeSaaS</span>
        </div>
        <div className="text-[#6b7280] text-xs mt-1 ml-9">chamundaswipe</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2">
        {navGroups.map((group, gi) => (
          <div key={gi}>
            {group.map(({ icon: Icon, label, href }) => {
              const active = pathname === href
              return (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-3 py-[10px] text-sm transition-colors"
                  style={{
                    background: active ? '#2a2a2a' : 'transparent',
                    borderLeft: active ? '3px solid #3ECF8E' : '3px solid transparent',
                    color: active ? '#ffffff' : '#9ca3af',
                    paddingLeft: 13,
                    paddingRight: 16,
                  }}
                  onMouseEnter={e => {
                    if (!active) (e.currentTarget as HTMLElement).style.background = '#2a2a2a'
                  }}
                  onMouseLeave={e => {
                    if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'
                  }}
                >
                  <Icon size={20} color={active ? '#3ECF8E' : '#9ca3af'} style={{ flexShrink: 0 }} />
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
                </Link>
              )
            })}
            {gi < navGroups.length - 1 && (
              <div style={{ height: 1, background: '#2a2a2a', margin: '8px 0' }} />
            )}
          </div>
        ))}
      </nav>

      {/* Settings pinned bottom */}
      <div className="border-t border-[#2a2a2a]">
        <Link
          href="/settings"
          className="flex items-center gap-3 py-[10px] text-sm transition-colors"
          style={{
            background: pathname === '/settings' ? '#2a2a2a' : 'transparent',
            borderLeft: pathname === '/settings' ? '3px solid #3ECF8E' : '3px solid transparent',
            color: pathname === '/settings' ? '#ffffff' : '#9ca3af',
            paddingLeft: 13,
            paddingRight: 16,
          }}
        >
          <Settings size={20} color={pathname === '/settings' ? '#3ECF8E' : '#9ca3af'} style={{ flexShrink: 0 }} />
          <span style={{ whiteSpace: 'nowrap' }}>Settings</span>
        </Link>
      </div>
    </div>
  )
}
