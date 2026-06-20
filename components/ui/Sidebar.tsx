'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  Home, LayoutGrid, Terminal, Users, CreditCard,
  FileText, Bell, BellRing, AlertTriangle, BarChart2, List, Grid, Settings, Landmark, Package, Receipt,
  ChevronDown, ArrowRightLeft, RefreshCw,
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'

const navGroups = [
  [
    { icon: Home, label: 'Dashboard', href: '/dashboard', superOnly: false },
    { icon: LayoutGrid, label: 'Sheet Editor', href: '/sheets', superOnly: false },
  ],
  [
    { icon: Users, label: 'Customers', href: '/customers', superOnly: false },
    { icon: CreditCard, label: 'Transactions', href: '/transactions', superOnly: false },
    { icon: Landmark, label: 'Bank Accounts', href: '/bank-accounts', superOnly: false },
    { icon: FileText, label: 'Reports', href: '/reports', superOnly: false },
    { icon: Package, label: 'Commodities', href: '/commodities', superOnly: false },
    { icon: Receipt, label: 'Invoices', href: '/invoices', superOnly: false },
  ],
  [
    { icon: BellRing, label: 'Settlement', href: '/notifications', superOnly: false },
    { icon: Bell, label: 'Reminders', href: '/reminders', superOnly: false },
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
  const [reminderCount, setReminderCount] = useState(0)
  const [pendingSwapCount, setPendingSwapCount] = useState(0)
  const isEntryActive = pathname.startsWith('/entry')
  const [entryOpen, setEntryOpen] = useState(isEntryActive)

  useEffect(() => {
    

    const fetchReminderCount = async () => {
      const today = new Date().toISOString().split('T')[0]
      const in3days = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0]

      const [{ count: overdueCount }, { count: dueSoonCount }] = await Promise.all([
        supabase.from('cards').select('id', { count: 'exact', head: true }).lt('due_date', today),
        supabase.from('cards').select('id', { count: 'exact', head: true }).gte('due_date', today).lte('due_date', in3days),
      ])
      setReminderCount((overdueCount ?? 0) + (dueSoonCount ?? 0))
    }

    const fetchPendingSwapCount = async () => {
      const [{ data: released }, { data: swaps }] = await Promise.all([
        supabase.from('swap_releases').select('transaction_id'),
        supabase.from('transactions').select('id').eq('entry_type', 'swap'),
      ])
      const releasedIds = new Set((released || []).map((r: { transaction_id: string }) => r.transaction_id))
      const pending = (swaps || []).filter((t: { id: string }) => !releasedIds.has(t.id))
      setPendingSwapCount(pending.length)
    }

    fetchReminderCount()
    fetchPendingSwapCount()

    const channel = supabase
      .channel('sidebar_counts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cards' }, fetchReminderCount)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions' }, fetchPendingSwapCount)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'swap_releases' }, fetchPendingSwapCount)
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
                    {href === '/reminders' && reminderCount > 0 && (
                      <span style={{ background: '#f59e0b', color: 'white', borderRadius: '999px', padding: '1px 6px', fontSize: '10px', fontWeight: 700, lineHeight: '16px', flexShrink: 0 }}>
                        {reminderCount > 99 ? '99+' : reminderCount}
                      </span>
                    )}
                    {href === '/notifications' && pendingSwapCount > 0 && (
                      <span style={{ background: '#3ECF8E', color: 'white', borderRadius: '999px', padding: '1px 6px', fontSize: '10px', fontWeight: 700, lineHeight: '16px', flexShrink: 0 }}>
                        {pendingSwapCount > 99 ? '99+' : pendingSwapCount}
                      </span>
                    )}
                  </Link>
                )
              })}

              {/* New Entry expandable — inserted after first group */}
              {gi === 0 && (
                <>
                  {/* Parent row */}
                  <button
                    onClick={() => setEntryOpen(o => !o)}
                    className="w-full flex items-center gap-3 py-[10px] text-sm transition-colors"
                    style={{
                      background: isEntryActive ? '#2a2a2a' : 'transparent',
                      borderLeft: isEntryActive ? '3px solid #3ECF8E' : '3px solid transparent',
                      color: isEntryActive ? '#ffffff' : '#9ca3af',
                      paddingLeft: 13,
                      paddingRight: 16,
                    }}
                    onMouseEnter={e => {
                      if (!isEntryActive) (e.currentTarget as HTMLElement).style.background = '#2a2a2a'
                    }}
                    onMouseLeave={e => {
                      if (!isEntryActive) (e.currentTarget as HTMLElement).style.background = 'transparent'
                    }}
                  >
                    <Terminal size={20} color={isEntryActive ? '#3ECF8E' : '#9ca3af'} style={{ flexShrink: 0 }} />
                    <span style={{ whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>New Entry</span>
                    <ChevronDown
                      size={14}
                      color={isEntryActive ? '#3ECF8E' : '#6b7280'}
                      style={{ flexShrink: 0, transition: 'transform 0.2s', transform: entryOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                    />
                  </button>

                  {/* Sub-items */}
                  {entryOpen && (
                    <div style={{ background: '#141414' }}>
                      {[
                        { icon: ArrowRightLeft, label: 'Card Swap', href: '/entry?type=swap' },
                        { icon: RefreshCw,      label: 'Card Refill', href: '/entry?type=refill' },
                      ].map(({ icon: SubIcon, label: subLabel, href: subHref }) => {
                        const subActive = pathname === '/entry' && (
                          (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('type') === subHref.split('=')[1])
                        )
                        return (
                          <Link
                            key={subHref}
                            href={subHref}
                            className="flex items-center gap-3 py-[9px] text-sm transition-colors"
                            style={{
                              paddingLeft: 40,
                              paddingRight: 16,
                              color: subActive ? '#3ECF8E' : '#6b7280',
                              borderLeft: subActive ? '3px solid #3ECF8E' : '3px solid transparent',
                              background: subActive ? '#1e1e1e' : 'transparent',
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#1e1e1e' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = subActive ? '#1e1e1e' : 'transparent' }}
                          >
                            <SubIcon size={15} color={subActive ? '#3ECF8E' : '#6b7280'} style={{ flexShrink: 0 }} />
                            <span style={{ fontSize: 13 }}>{subLabel}</span>
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </>
              )}

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
