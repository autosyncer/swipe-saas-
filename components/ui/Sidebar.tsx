'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  Home, LayoutGrid, Terminal, Users, CreditCard, Monitor,
  FileText, Bell, AlertTriangle, BarChart2, List, Grid, Settings, Landmark, Package, Receipt, Workflow
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase/client'

const navGroups = [
  [
    { icon: Home, label: 'Dashboard', href: '/dashboard', superOnly: false },
    { icon: LayoutGrid, label: 'Sheet Editor', href: '/sheets', superOnly: false },
    { icon: Terminal, label: 'New Entry', href: '/entry', superOnly: false },
    { icon: Workflow, label: 'Field Mapping', href: '/mapping', superOnly: false },
  ],
  [
    { icon: Users, label: 'Customers', href: '/customers', superOnly: false },
    { icon: CreditCard, label: 'Transactions', href: '/transactions', superOnly: false },
    { icon: Monitor, label: 'Swipe Machines', href: '/machines', superOnly: false },
    { icon: Landmark, label: 'Bank Accounts', href: '/bank-accounts', superOnly: false },
    { icon: FileText, label: 'Reports', href: '/reports', superOnly: false },
    { icon: Package, label: 'Commodities', href: '/commodities', superOnly: false },
    { icon: Receipt, label: 'Invoices', href: '/invoices', superOnly: false },
  ],
  [
    { icon: Bell, label: 'Reminders', href: '/reminders', superOnly: false },
    { icon: AlertTriangle, label: 'Risk Alerts', href: '/alerts', superOnly: false },
    { icon: BarChart2, label: 'Analytics', href: '/analytics', superOnly: false },
  ],
  [
    { icon: List, label: 'Audit Logs', href: '/logs', superOnly: true },
    { icon: Grid, label: 'Users & Roles', href: '/users', superOnly: true },
  ],
]

export default function Sidebar() {
  const pathname = usePathname()
  const auth = useAuth()
  const isSuperAdmin = auth?.role === 'super_admin'
  const [alertCount, setAlertCount] = useState(0)
  const [reminderCount, setReminderCount] = useState(0)

  useEffect(() => {
    const supabase = createClient()

    const fetchAlertCount = async () => {
      const { count } = await supabase
        .from('risk_alerts')
        .select('id', { count: 'exact', head: true })
        .eq('is_dismissed', false)
        .eq('severity', 'high')
      setAlertCount(count ?? 0)
    }

    const fetchReminderCount = async () => {
      const today = new Date().toISOString().split('T')[0]
      const in3days = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0]

      const [{ count: overdueCount }, { count: dueSoonCount }] = await Promise.all([
        supabase.from('cards').select('id', { count: 'exact', head: true }).lt('due_date', today),
        supabase.from('cards').select('id', { count: 'exact', head: true }).gte('due_date', today).lte('due_date', in3days),
      ])
      setReminderCount((overdueCount ?? 0) + (dueSoonCount ?? 0))
    }

    fetchAlertCount()
    fetchReminderCount()

    const channel = supabase
      .channel('sidebar_counts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'risk_alerts' }, fetchAlertCount)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cards' }, fetchReminderCount)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

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
        {navGroups.map((group, gi) => {
          const visibleItems = group.filter(item => !item.superOnly || isSuperAdmin)
          if (visibleItems.length === 0) return null
          return (
            <div key={gi}>
              {visibleItems.map(({ icon: Icon, label, href }) => {
                const active = pathname === href
                const isAlerts = href === '/alerts'
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
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{label}</span>
                    {isAlerts && alertCount > 0 && (
                      <span style={{ background: '#ef4444', color: 'white', borderRadius: '999px', padding: '1px 6px', fontSize: '10px', fontWeight: 700, lineHeight: '16px', flexShrink: 0 }}>
                        {alertCount > 99 ? '99+' : alertCount}
                      </span>
                    )}
                    {href === '/reminders' && reminderCount > 0 && (
                      <span style={{ background: '#f59e0b', color: 'white', borderRadius: '999px', padding: '1px 6px', fontSize: '10px', fontWeight: 700, lineHeight: '16px', flexShrink: 0 }}>
                        {reminderCount > 99 ? '99+' : reminderCount}
                      </span>
                    )}
                  </Link>
                )
              })}
              {gi < navGroups.length - 1 && (
                <div style={{ height: 1, background: '#2a2a2a', margin: '8px 0' }} />
              )}
            </div>
          )
        })}
      </nav>

      {/* Settings pinned bottom — super admin only */}
      {isSuperAdmin && (
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
      )}
    </div>
  )
}
