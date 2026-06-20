'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Bell, Settings, Search, X, User, LogOut, Lock, KeyRound, FileText, Users, ChevronRight, CreditCard, ArrowRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { logAction } from '@/lib/audit-log'

// ── Types ──────────────────────────────────────────────────────────────────────
interface SearchCustomer {
  id: string
  name: string
  phone: string
  outstanding_balance: number
}
interface SearchTransaction {
  id: string
  sr_no: number
  customer_name: string
  total_amount: number
  date: string
}
interface Notification {
  id: string
  type: 'due' | 'pending' | 'new' | 'refill'
  title: string
  subtitle: string
  timeAgo: string
  read: boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, cb: () => void) {
  useEffect(() => {
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) cb()
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [ref, cb])
}

// ── Search Modal ───────────────────────────────────────────────────────────────
function SearchModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [customers, setCustomers] = useState<SearchCustomer[]>([])
  const [transactions, setTransactions] = useState<SearchTransaction[]>([])
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    if (!query.trim()) { setCustomers([]); setTransactions([]); return }
    const t = setTimeout(async () => {
      setLoading(true)
      const isNum = /^\d+$/.test(query.trim())
      const [custRes, txnRes] = await Promise.all([
        supabase.from('customers').select('id,name,phone,outstanding_balance').ilike('name', `%${query}%`).limit(5),
        isNum
          ? supabase.from('transactions').select('id,sr_no,customer_name,total_amount,date').eq('sr_no', parseInt(query)).limit(5)
          : supabase.from('transactions').select('id,sr_no,customer_name,total_amount,date').ilike('customer_name', `%${query}%`).order('sr_no', { ascending: false }).limit(5),
      ])
      setCustomers((custRes.data as SearchCustomer[]) || [])
      setTransactions((txnRes.data as SearchTransaction[]) || [])
      setLoading(false)
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    function h(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const hasResults = customers.length > 0 || transactions.length > 0
  const noResults = query.trim() && !loading && !hasResults

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20" style={{ background: 'rgba(0,0,0,0.5)' }} onMouseDown={onClose}>
      <div className="w-[600px] bg-white rounded-xl shadow-2xl overflow-hidden" onMouseDown={e => e.stopPropagation()}>
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#e5e7eb]">
          <Search size={18} color="#9ca3af" className="flex-shrink-0" />
          <input
            ref={inputRef}
            className="flex-1 text-base outline-none text-[#1a1a1a] placeholder-[#9ca3af]"
            placeholder="Search customers, transactions, SR numbers..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {query && <button onClick={() => setQuery('')} className="p-0.5 hover:bg-gray-100 rounded"><X size={14} color="#9ca3af" /></button>}
          <kbd className="text-xs px-1.5 py-0.5 rounded bg-[#f3f4f6] text-[#6b7280] font-mono">ESC</kbd>
        </div>

        {/* Results */}
        {loading && (
          <div className="px-4 py-6 text-center text-sm text-[#9ca3af]">Searching...</div>
        )}
        {noResults && (
          <div className="px-4 py-6 text-center text-sm text-[#9ca3af]">No results for &ldquo;{query}&rdquo;</div>
        )}
        {!loading && hasResults && (
          <div className="max-h-[420px] overflow-y-auto">
            {customers.length > 0 && (
              <div>
                <div className="px-4 py-2 text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wide bg-[#f9f9f9] border-b border-[#f3f4f6]">
                  Customers ({customers.length})
                </div>
                {customers.map(c => (
                  <button
                    key={c.id}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#f0fdf4] text-left border-b border-[#f3f4f6] last:border-0 transition-colors"
                    onClick={() => { router.push('/customers'); onClose() }}
                  >
                    <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white" style={{ background: '#3ECF8E' }}>
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[#1a1a1a]">{c.name}</div>
                      <div className="text-xs text-[#6b7280]">{c.phone} — Outstanding: ₹{c.outstanding_balance.toLocaleString('en-IN')}</div>
                    </div>
                    <ArrowRight size={14} color="#9ca3af" />
                  </button>
                ))}
              </div>
            )}
            {transactions.length > 0 && (
              <div>
                <div className="px-4 py-2 text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wide bg-[#f9f9f9] border-b border-[#f3f4f6]">
                  Transactions ({transactions.length})
                </div>
                {transactions.map(t => (
                  <button
                    key={t.id}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#f0fdf4] text-left border-b border-[#f3f4f6] last:border-0 transition-colors"
                    onClick={() => { router.push('/sheets'); onClose() }}
                  >
                    <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center bg-[#eff6ff]">
                      <CreditCard size={12} color="#3b82f6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[#1a1a1a]">SR #{t.sr_no} — {t.customer_name}</div>
                      <div className="text-xs text-[#6b7280]">₹{t.total_amount.toLocaleString('en-IN')} — {t.date}</div>
                    </div>
                    <ArrowRight size={14} color="#9ca3af" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {!query && (
          <div className="px-4 py-5 text-center text-sm text-[#9ca3af]">
            Type to search customers or transactions
          </div>
        )}
      </div>
    </div>
  )
}

// ── Notifications Dropdown ─────────────────────────────────────────────────────
function NotificationsDropdown({ onClose }: { onClose: () => void }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [readIds, setReadIds] = useState<Set<string>>(new Set())
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, onClose)

  useEffect(() => {
    async function load() {
      const today = new Date()
      const plus7 = new Date(today.getTime() + 7 * 86400000).toISOString().split('T')[0]
      const todayStr = today.toISOString().split('T')[0]


      // 24 hours ago threshold for refill alerts
      const cutoff24h = new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString()

      const [dueRes, pendRes, newRes, refillRes] = await Promise.all([
        supabase.from('cards').select('id,bank_name,due_date,customer_id,customers(name)').lte('due_date', plus7).gte('due_date', todayStr).limit(5),
        supabase.from('transactions').select('id,sr_no,customer_name,total_amount,created_at').eq('remarks', 'PEND').order('sr_no', { ascending: false }).limit(5),
        supabase.from('transactions').select('id,sr_no,customer_name,total_amount,created_at').eq('date', todayStr).order('sr_no', { ascending: false }).limit(3),
        // Refills older than 24h where the same customer has no swap on the same or later date
        supabase.from('transactions').select('id,sr_no,customer_name,bank_card,total_amount,created_at,date').eq('entry_type', 'refill').lte('created_at', cutoff24h).order('created_at', { ascending: false }).limit(20),
      ])

      const notes: Notification[] = []

      ;(dueRes.data || []).forEach((card: { id: string; bank_name: string; due_date: string; customers: { name: string }[] | null }) => {
        const daysLeft = Math.ceil((new Date(card.due_date).getTime() - today.getTime()) / 86400000)
        const custArr = card.customers as { name: string }[] | null
        const custName = (Array.isArray(custArr) ? custArr[0]?.name : null) || 'Unknown'
        notes.push({
          id: 'due-' + card.id,
          type: 'due',
          title: `${custName} — ${card.bank_name} card due`,
          subtitle: daysLeft <= 0 ? 'Due today!' : `Due in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`,
          timeAgo: card.due_date,
          read: false,
        })
      })

      ;(pendRes.data || []).forEach((t: { id: string; sr_no: number; customer_name: string; total_amount: number; created_at: string }) => {
        notes.push({
          id: 'pend-' + t.id,
          type: 'pending',
          title: `SR #${t.sr_no} — ${t.customer_name}`,
          subtitle: `₹${t.total_amount.toLocaleString('en-IN')} pending`,
          timeAgo: timeAgo(t.created_at),
          read: false,
        })
      })

      ;(newRes.data || []).forEach((t: { id: string; sr_no: number; customer_name: string; total_amount: number; created_at: string }) => {
        notes.push({
          id: 'new-' + t.id,
          type: 'new',
          title: `New entry — SR #${t.sr_no} — ${t.customer_name}`,
          subtitle: `₹${t.total_amount.toLocaleString('en-IN')}`,
          timeAgo: timeAgo(t.created_at),
          read: false,
        })
      })

      // Refill alerts: refills >24h old — check if customer has a swap on/after refill date
      const refills = (refillRes.data || []) as { id: string; sr_no: number; customer_name: string; bank_card: string; total_amount: number; created_at: string; date: string }[]
      if (refills.length > 0) {
        // Fetch all swaps for these customers to cross-check
        const customerNames = [...new Set(refills.map(r => r.customer_name))]
        const { data: swaps } = await supabase
          .from('transactions')
          .select('customer_name,date')
          .eq('entry_type', 'swap')
          .in('customer_name', customerNames)
        const swapSet = new Set((swaps || []).map((s: { customer_name: string; date: string }) => `${s.customer_name}__${s.date}`))

        refills.forEach(t => {
          // If no swap exists for this customer on or after the refill date, alert
          const hasSwap = (swaps || []).some((s: { customer_name: string; date: string }) =>
            s.customer_name === t.customer_name && s.date >= t.date
          )
          void swapSet
          if (!hasSwap) {
            const hoursAgo = Math.floor((Date.now() - new Date(t.created_at).getTime()) / 3600000)
            notes.push({
              id: 'refill-' + t.id,
              type: 'refill',
              title: `⚠️ Card not swapped — ${t.customer_name}`,
              subtitle: `Refilled ₹${t.total_amount.toLocaleString('en-IN')} (${t.bank_card || 'card'}) — ${hoursAgo}h ago, no swap yet`,
              timeAgo: timeAgo(t.created_at),
              read: false,
            })
          }
        })
      }

      setNotifications(notes)
    }
    load()
    // Re-check every 24 hours while the app is open
    const interval = setInterval(load, 24 * 60 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const unread = notifications.filter(n => !readIds.has(n.id)).length

  function dotColor(type: Notification['type']) {
    return type === 'due' ? '#ef4444' : type === 'pending' ? '#f59e0b' : type === 'refill' ? '#8b5cf6' : '#3ECF8E'
  }

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-2 bg-white rounded-xl shadow-2xl border border-[#e5e7eb] z-50 overflow-hidden"
      style={{ width: 320 }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e7eb]">
        <span className="text-sm font-semibold text-[#1a1a1a]">
          Notifications {unread > 0 && <span className="ml-1 text-xs bg-red-500 text-white rounded-full px-1.5 py-0.5">{unread}</span>}
        </span>
        <button
          className="text-xs text-[#3ECF8E] font-medium hover:underline"
          onClick={() => setReadIds(new Set(notifications.map(n => n.id)))}
        >
          Mark all read
        </button>
      </div>
      <div className="max-h-[360px] overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-[#9ca3af]">No notifications</div>
        ) : notifications.map(n => (
          <button
            key={n.id}
            className="w-full flex items-start gap-3 px-4 py-3 border-b border-[#f3f4f6] last:border-0 text-left hover:bg-gray-50 transition-colors"
            style={{ background: readIds.has(n.id) ? '#f9f9f9' : '#fff' }}
            onClick={() => setReadIds(s => new Set(Array.from(s).concat(n.id)))}
          >
            <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: dotColor(n.type) }} />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-[#1a1a1a] leading-snug">{n.title}</div>
              <div className="text-xs text-[#6b7280] mt-0.5">{n.subtitle}</div>
            </div>
            <span className="text-[10px] text-[#9ca3af] flex-shrink-0 mt-0.5">{n.timeAgo}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Settings Dropdown ──────────────────────────────────────────────────────────
function SettingsDropdown({ onClose, onShortcuts }: { onClose: () => void; onShortcuts: () => void }) {
  const router = useRouter()
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, onClose)

  function go(path: string) { router.push(path); onClose() }

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-2 bg-white rounded-xl shadow-2xl border border-[#e5e7eb] z-50 overflow-hidden"
      style={{ width: 200 }}
    >
      {[
        { label: 'General Settings', icon: Settings, path: '/settings' },
        { label: 'Users & Roles', icon: Users, path: '/users' },
        { label: 'Audit Logs', icon: FileText, path: '/logs' },
      ].map(({ label, icon: Icon, path }) => (
        <button
          key={path}
          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#374151] hover:bg-gray-50 transition-colors border-b border-[#f3f4f6] last:border-0"
          onClick={() => go(path)}
        >
          <Icon size={14} color="#6b7280" /> {label}
        </button>
      ))}
      <div className="border-t border-[#e5e7eb]" />
      <button
        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#374151] hover:bg-gray-50 transition-colors"
        onClick={() => { onShortcuts(); onClose() }}
      >
        <KeyRound size={14} color="#6b7280" /> Keyboard Shortcuts
      </button>
    </div>
  )
}

// ── Keyboard Shortcuts Modal ───────────────────────────────────────────────────
function ShortcutsModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function h(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const shortcuts = [
    { keys: ['Ctrl', 'K'], desc: 'Open search' },
    { keys: ['Ctrl', 'N'], desc: 'New entry' },
    { keys: ['ESC'], desc: 'Close modal / panel' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[400px] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5e7eb]">
          <span className="font-semibold text-[#1a1a1a]">Keyboard Shortcuts</span>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={16} color="#6b7280" /></button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3">
          {shortcuts.map(({ keys, desc }) => (
            <div key={desc} className="flex items-center justify-between">
              <span className="text-sm text-[#374151]">{desc}</span>
              <div className="flex items-center gap-1">
                {keys.map((k, i) => (
                  <span key={k}>
                    <kbd className="px-2 py-0.5 text-xs rounded bg-[#f3f4f6] text-[#374151] border border-[#e5e7eb] font-mono">{k}</kbd>
                    {i < keys.length - 1 && <span className="text-xs text-[#9ca3af] mx-1">+</span>}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Change Password Modal ──────────────────────────────────────────────────────
function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ current: '', newPass: '', confirm: '' })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    function h(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  async function handleSave() {
    if (!form.newPass || !form.confirm) { setToast({ msg: 'Please fill all fields', type: 'error' }); return }
    if (form.newPass !== form.confirm) { setToast({ msg: 'Passwords do not match', type: 'error' }); return }
    if (form.newPass.length < 6) { setToast({ msg: 'Password must be at least 6 characters', type: 'error' }); return }
    setSaving(true)
    const { data: { user }, error } = await supabase.auth.updateUser({ password: form.newPass })
    setSaving(false)
    if (error) {
      setToast({ msg: error.message, type: 'error' })
    } else {
      await logAction({
        action: 'Password Changed',
        module: 'Users & Roles',
        details: { target_user: user?.email || '' },
      })
      setToast({ msg: 'Password updated successfully', type: 'success' })
      setTimeout(onClose, 1500)
    }
  }

  const inputCls = 'w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-[#3ECF8E]'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[400px]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5e7eb]">
          <div className="flex items-center gap-2">
            <Lock size={16} color="#6b7280" />
            <span className="font-semibold text-[#1a1a1a]">Change Password</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={16} color="#6b7280" /></button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3">
          {toast && (
            <div className={`text-xs px-3 py-2 rounded ${toast.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {toast.msg}
            </div>
          )}
          {[
            { label: 'New Password', field: 'newPass' as const },
            { label: 'Confirm New Password', field: 'confirm' as const },
          ].map(({ label, field }) => (
            <div key={field}>
              <label className="block text-xs font-medium text-[#374151] mb-1">{label}</label>
              <input
                type="password"
                className={inputCls}
                style={{ borderColor: '#e5e7eb' }}
                value={form[field]}
                onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 rounded-md border text-sm font-medium text-[#374151]" style={{ borderColor: '#e5e7eb' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2 rounded-md text-sm font-medium text-white disabled:opacity-60" style={{ background: '#3ECF8E' }}>
            {saving ? 'Saving...' : 'Update Password'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Profile Dropdown ───────────────────────────────────────────────────────────
function ProfileDropdown({
  onClose,
  onChangePassword,
}: {
  onClose: () => void
  onChangePassword: () => void
}) {
  const router = useRouter()
  const ref = useRef<HTMLDivElement>(null)
  const auth = useAuth()
  useClickOutside(ref, onClose)

  const displayName = auth?.full_name || 'User'
  const displayEmail = auth?.email || ''
  const avatarInitials = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
  const isSuperAdmin = auth?.role === 'super_admin'
  const roleBadge = isSuperAdmin ? 'SUPER ADMIN' : 'SUB ADMIN'
  const roleBadgeStyle = isSuperAdmin
    ? { background: '#d1fae5', color: '#065f46' }
    : { background: '#ede9fe', color: '#5b21b6' }

  async function handleLogout() {
    await logAction({
      action: 'Logout',
      module: 'Auth',
      details: { email: displayEmail, timestamp: new Date().toISOString() },
    })
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-2 bg-white rounded-xl shadow-2xl border border-[#e5e7eb] z-50 overflow-hidden"
      style={{ width: 240 }}
    >
      {/* Profile header */}
      <div className="px-4 py-4 border-b border-[#e5e7eb] flex items-center gap-3">
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0" style={{ background: '#3ECF8E' }}>
          {avatarInitials}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[#1a1a1a] truncate">{displayName}</div>
          <div className="text-xs text-[#6b7280] truncate">{displayEmail}</div>
          <span className="inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={roleBadgeStyle}>
            {roleBadge}
          </span>
        </div>
      </div>

      {/* Menu items */}
      <div className="py-1">
        <button
          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#374151] hover:bg-gray-50 transition-colors"
          onClick={onClose}
        >
          <User size={14} color="#6b7280" /> Profile Settings
          <ChevronRight size={12} color="#9ca3af" className="ml-auto" />
        </button>
        <button
          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#374151] hover:bg-gray-50 transition-colors"
          onClick={() => { onChangePassword(); onClose() }}
        >
          <Lock size={14} color="#6b7280" /> Change Password
          <ChevronRight size={12} color="#9ca3af" className="ml-auto" />
        </button>
      </div>

      <div className="border-t border-[#e5e7eb]" />

      <div className="py-1">
        <button
          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
          onClick={handleLogout}
        >
          <LogOut size={14} /> Logout
        </button>
      </div>
    </div>
  )
}

// ── Header ─────────────────────────────────────────────────────────────────────
export default function Header() {
  const router = useRouter()
  const auth = useAuth()
  const headerInitials = (auth?.full_name || 'U').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
  const [showSearch, setShowSearch] = useState(false)
  const [showNotifs, setShowNotifs] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showChangePass, setShowChangePass] = useState(false)
  const [notifCount, setNotifCount] = useState(0)

  const notifRef = useRef<HTMLDivElement>(null)
  const settingsRef = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)

  // Fetch unread notification count on mount
  useEffect(() => {
    async function countNotifs() {
      const today = new Date()
      const plus7 = new Date(today.getTime() + 7 * 86400000).toISOString().split('T')[0]
      const todayStr = today.toISOString().split('T')[0]
      const [dueRes, pendRes] = await Promise.all([
        supabase.from('cards').select('id', { count: 'exact', head: true }).lte('due_date', plus7).gte('due_date', todayStr),
        supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('remarks', 'PEND'),
      ])
      setNotifCount((dueRes.count || 0) + (pendRes.count || 0))
    }
    countNotifs()
  }, [])

  // Global keyboard shortcuts
  useEffect(() => {
    function h(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setShowSearch(true)
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault()
        router.push('/entry')
      }
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [router])

  return (
    <>
      <header
        className="fixed top-0 right-0 z-30 flex items-center justify-between px-6"
        style={{ left: 240, height: 48, background: '#ffffff', borderBottom: '1px solid #e5e7eb' }}
      >
        {/* Left: breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-[#6b7280]">
          <span>Shree Karni Trader</span>
          <span>/</span>
          <span className="text-[#1a1a1a] font-medium">main</span>
          <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: '#d1fae5', color: '#065f46' }}>
            PRODUCTION
          </span>
        </div>

        {/* Right */}
        <div className="flex items-center gap-3">
          {/* Search trigger */}
          <button
            className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-[#6b7280] hover:bg-[#f3f4f6] transition-colors"
            style={{ background: '#f9f9f9', border: '1px solid #e5e7eb', minWidth: 200 }}
            onClick={() => setShowSearch(true)}
          >
            <Search size={14} />
            <span>Search...</span>
            <span className="ml-auto text-xs px-1.5 py-0.5 rounded" style={{ background: '#e5e7eb', color: '#6b7280' }}>Ctrl+K</span>
          </button>

          {/* Notifications */}
          <div className="relative" ref={notifRef}>
            <button
              className="relative p-1.5 rounded-md hover:bg-gray-100 text-[#6b7280]"
              onClick={() => { setShowNotifs(v => !v); setShowSettings(false); setShowProfile(false) }}
            >
              <Bell size={18} />
              {notifCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {notifCount > 9 ? '9+' : notifCount}
                </span>
              )}
            </button>
            {showNotifs && <NotificationsDropdown onClose={() => setShowNotifs(false)} />}
          </div>

          {/* Settings */}
          <div className="relative" ref={settingsRef}>
            <button
              className="p-1.5 rounded-md hover:bg-gray-100 text-[#6b7280]"
              onClick={() => { setShowSettings(v => !v); setShowNotifs(false); setShowProfile(false) }}
            >
              <Settings size={18} />
            </button>
            {showSettings && (
              <SettingsDropdown
                onClose={() => setShowSettings(false)}
                onShortcuts={() => setShowShortcuts(true)}
              />
            )}
          </div>

          {/* Profile avatar */}
          <div className="relative" ref={profileRef}>
            <button
              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold hover:opacity-80 transition-opacity"
              style={{ background: '#3ECF8E' }}
              onClick={() => { setShowProfile(v => !v); setShowNotifs(false); setShowSettings(false) }}
            >
              {headerInitials}
            </button>
            {showProfile && (
              <ProfileDropdown
                onClose={() => setShowProfile(false)}
                onChangePassword={() => setShowChangePass(true)}
              />
            )}
          </div>
        </div>
      </header>

      {/* Modals (rendered outside header) */}
      {showSearch && <SearchModal onClose={() => setShowSearch(false)} />}
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
      {showChangePass && <ChangePasswordModal onClose={() => setShowChangePass(false)} />}
    </>
  )
}
