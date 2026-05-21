'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { logAction } from '@/lib/audit-log'
import {
  ChevronLeft, ChevronRight, Plus, X, Calendar, List,
  Phone, MessageCircle, Check, BellOff, Trash2, AlertTriangle,
  Clock, CreditCard, ExternalLink, Search,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type ReminderType = 'card_due' | 'payment' | 'follow_up' | 'custom' | 'other'
type ReminderStatus = 'pending' | 'done' | 'snoozed'

interface Reminder {
  id: string
  title: string
  description: string | null
  reminder_date: string
  reminder_time: string | null
  type: ReminderType
  status: ReminderStatus
  customer_id: string | null
  customer_name: string | null
  bank_name: string | null
  card_id: string | null
  last4: string | null
  phone: string | null
  amount: number | null
  source?: 'reminder' | 'card'
  due_date?: string
  last4_card?: string
}

interface CustomerCard {
  id: string
  bank_name: string
  last4: string
  due_date: string | null
  card_type: string | null
}

interface CustomerFull {
  id: string
  name: string
  phone: string
  outstanding_balance: number
  default_charge_pct: number
  cards: CustomerCard[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<ReminderType, string> = {
  card_due: '#ef4444',
  payment: '#f59e0b',
  follow_up: '#3b82f6',
  custom: '#10b981',
  other: '#8b5cf6',
}

const TYPE_ICONS: Record<ReminderType, string> = {
  card_due: '💳',
  payment: '💰',
  follow_up: '📞',
  custom: '⭐',
  other: '📌',
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

const fmt = (n: number | null) =>
  n ? '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 }) : ''

const toIsoDate = (d: Date) => d.toISOString().split('T')[0]

// ─── Calendar helpers ─────────────────────────────────────────────────────────

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}
function getFirstDayOfMonth(year: number, month: number) {
  // 0=Sun…6=Sat → convert to Mon=0…Sun=6
  const day = new Date(year, month, 1).getDay()
  return day === 0 ? 6 : day - 1
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchMonthData(year: number, month: number): Promise<Record<string, Reminder[]>> {
  
  const startDate = toIsoDate(new Date(year, month, 1))
  const endDate = toIsoDate(new Date(year, month + 1, 0))

  const [{ data: customReminders }, { data: cardDues }] = await Promise.all([
    supabase.from('reminders').select('*').gte('reminder_date', startDate).lte('reminder_date', endDate),
    supabase
      .from('cards')
      .select('*, customers(name, phone, outstanding_balance)')
      .gte('due_date', startDate)
      .lte('due_date', endDate),
  ])

  const byDate: Record<string, Reminder[]> = {}

  customReminders?.forEach((r: Reminder) => {
    const d = r.reminder_date
    if (!byDate[d]) byDate[d] = []
    byDate[d].push({ ...r, source: 'reminder' })
  })

  cardDues?.forEach((c: {
    id: string; bank_name: string; last4: string; due_date: string; customer_id: string;
    customers: { name: string; phone: string; outstanding_balance: number } | null
  }) => {
    const date = c.due_date
    if (!byDate[date]) byDate[date] = []
    byDate[date].push({
      id: `card_${c.id}`,
      title: `${c.bank_name} Card Due — ...${c.last4}`,
      description: c.customers
        ? `Customer: ${c.customers.name} | Outstanding: ${fmt(c.customers.outstanding_balance)}`
        : null,
      type: 'card_due',
      status: 'pending',
      reminder_date: date,
      reminder_time: null,
      customer_id: c.customer_id,
      customer_name: c.customers?.name ?? null,
      bank_name: c.bank_name,
      card_id: c.id,
      last4: c.last4,
      phone: c.customers?.phone ?? null,
      amount: c.customers?.outstanding_balance ?? null,
      source: 'card',
    })
  })

  return byDate
}

async function fetchUpcomingList(days: number): Promise<Reminder[]> {
  
  const today = toIsoDate(new Date())
  const future = toIsoDate(new Date(Date.now() + days * 86400000))

  const [{ data: reminders }, { data: cards }] = await Promise.all([
    supabase
      .from('reminders')
      .select('*')
      .gte('reminder_date', today)
      .lte('reminder_date', future)
      .order('reminder_date'),
    supabase
      .from('cards')
      .select('*, customers(name, phone, outstanding_balance)')
      .gte('due_date', today)
      .lte('due_date', future)
      .order('due_date'),
  ])

  const list: Reminder[] = []

  reminders?.forEach((r: Reminder) => list.push({ ...r, source: 'reminder' }))

  cards?.forEach((c: {
    id: string; bank_name: string; last4: string; due_date: string; customer_id: string;
    customers: { name: string; phone: string; outstanding_balance: number } | null
  }) => {
    list.push({
      id: `card_${c.id}`,
      title: `${c.bank_name} Card Due — ...${c.last4}`,
      description: c.customers ? `Customer: ${c.customers.name}` : null,
      type: 'card_due',
      status: 'pending',
      reminder_date: c.due_date,
      reminder_time: null,
      customer_id: c.customer_id,
      customer_name: c.customers?.name ?? null,
      bank_name: c.bank_name,
      card_id: c.id,
      last4: c.last4,
      phone: c.customers?.phone ?? null,
      amount: c.customers?.outstanding_balance ?? null,
      source: 'card',
    })
  })

  list.sort((a, b) => a.reminder_date.localeCompare(b.reminder_date))
  return list
}

async function fetchOverdue(): Promise<{ count: number; items: Reminder[] }> {
  
  const today = toIsoDate(new Date())

  const [{ data: overdueReminders }, { data: overdueCards }] = await Promise.all([
    supabase
      .from('reminders')
      .select('*')
      .lt('reminder_date', today)
      .neq('status', 'done')
      .order('reminder_date'),
    supabase
      .from('cards')
      .select('*, customers(name, phone, outstanding_balance)')
      .lt('due_date', today)
      .order('due_date'),
  ])

  const items: Reminder[] = []
  overdueReminders?.forEach((r: Reminder) => items.push({ ...r, source: 'reminder' }))
  overdueCards?.forEach((c: {
    id: string; bank_name: string; last4: string; due_date: string; customer_id: string;
    customers: { name: string; phone: string; outstanding_balance: number } | null
  }) => {
    items.push({
      id: `card_${c.id}`,
      title: `${c.bank_name} Card Due — ...${c.last4}`,
      description: c.customers ? `Customer: ${c.customers.name}` : null,
      type: 'card_due',
      status: 'pending',
      reminder_date: c.due_date,
      reminder_time: null,
      customer_id: c.customer_id,
      customer_name: c.customers?.name ?? null,
      bank_name: c.bank_name,
      card_id: c.id,
      last4: c.last4,
      phone: c.customers?.phone ?? null,
      amount: c.customers?.outstanding_balance ?? null,
      source: 'card',
    })
  })

  return { count: items.length, items }
}

// ─── WhatsApp helper ──────────────────────────────────────────────────────────

function openWhatsApp(r: Reminder) {
  if (!r.phone) return
  const phone = r.phone.replace(/\D/g, '')
  const e164 = phone.startsWith('91') ? phone : `91${phone}`
  const due = r.reminder_date
  const msg = encodeURIComponent(
    `Dear ${r.customer_name || 'Customer'},\n\nThis is a reminder that your ${r.bank_name || ''} card payment is due on ${due}.\n\nOutstanding amount: ${fmt(r.amount)}\n\nPlease arrange payment at the earliest.\n\nThank you,\nChamundaswipe`
  )
  window.open(`https://wa.me/${e164}?text=${msg}`, '_blank')
}

// ─── Days-left badge ──────────────────────────────────────────────────────────

function DaysLeftBadge({ date }: { date: string }) {
  const diff = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000)
  if (diff < 0) return <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-[#fee2e2] text-[#dc2626]">Overdue</span>
  if (diff === 0) return <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-[#fee2e2] text-[#dc2626]">Due Today</span>
  if (diff <= 2) return <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-[#fee2e2] text-[#dc2626]">{diff}d left</span>
  if (diff <= 7) return <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-[#fef3c7] text-[#d97706]">{diff}d left</span>
  return <span className="text-xs px-2 py-0.5 rounded-full bg-[#d1fae5] text-[#065f46]">{diff}d left</span>
}

// ─── Reminder card ────────────────────────────────────────────────────────────

function ReminderCard({
  r,
  onDone,
  onSnooze,
  onDelete,
  onNewEntry,
}: {
  r: Reminder
  onDone: (r: Reminder) => void
  onSnooze: (r: Reminder) => void
  onDelete: (r: Reminder) => void
  onNewEntry?: (r: Reminder) => void
}) {
  const color = TYPE_COLORS[r.type] ?? '#6b7280'
  const icon = TYPE_ICONS[r.type] ?? '📌'
  const isDone = r.status === 'done'

  return (
    <div
      className="bg-white rounded-xl border border-[#e5e7eb] overflow-hidden transition-all"
      style={{
        borderLeft: `4px solid ${color}`,
        opacity: isDone ? 0.55 : 1,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}
    >
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base flex-shrink-0">{icon}</span>
            <span className="font-semibold text-sm text-[#111827] truncate">{r.title}</span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {r.reminder_time && (
              <span className="flex items-center gap-1 text-xs text-[#9ca3af]">
                <Clock size={11} />{r.reminder_time.slice(0, 5)}
              </span>
            )}
            <DaysLeftBadge date={r.reminder_date} />
          </div>
        </div>

        {r.description && (
          <p className="text-xs text-[#6b7280] mb-1.5 ml-6">{r.description}</p>
        )}

        {(r.customer_name || r.phone) && (
          <div className="flex items-center gap-3 ml-6 mb-2">
            {r.customer_name && (
              <span className="text-xs text-[#374151] font-medium">{r.customer_name}</span>
            )}
            {r.phone && (
              <a
                href={`tel:${r.phone}`}
                className="flex items-center gap-1 text-xs text-[#3b82f6] hover:underline"
              >
                <Phone size={11} />{r.phone}
              </a>
            )}
          </div>
        )}

        {r.amount != null && r.amount > 0 && (
          <div className="ml-6 mb-2 text-xs font-semibold" style={{ color }}>
            {fmt(r.amount)}
          </div>
        )}

        {/* Status badge */}
        <div className="flex items-center justify-between ml-6">
          <span
            className="text-xs px-2 py-0.5 rounded-full font-semibold uppercase"
            style={
              isDone
                ? { background: '#d1fae5', color: '#065f46' }
                : r.status === 'snoozed'
                ? { background: '#fef3c7', color: '#92400e' }
                : { background: '#f3f4f6', color: '#374151' }
            }
          >
            {r.status}
          </span>

          {/* Action buttons */}
          {!isDone && (
            <div className="flex items-center gap-1">
              {r.phone && (
                <button
                  onClick={() => openWhatsApp(r)}
                  title="Send WhatsApp"
                  className="p-1.5 rounded-md hover:bg-[#f0fdf4] text-[#25D366]"
                >
                  <MessageCircle size={13} />
                </button>
              )}
              {r.phone && (
                <a
                  href={`tel:${r.phone}`}
                  title="Call"
                  className="p-1.5 rounded-md hover:bg-[#eff6ff] text-[#3b82f6]"
                >
                  <Phone size={13} />
                </a>
              )}
              <button
                onClick={() => onDone(r)}
                title="Mark Done"
                className="p-1.5 rounded-md hover:bg-[#f0fdf4] text-[#3ECF8E]"
              >
                <Check size={13} />
              </button>
              <button
                onClick={() => onSnooze(r)}
                title="Snooze"
                className="p-1.5 rounded-md hover:bg-[#fefce8] text-[#f59e0b]"
              >
                <BellOff size={13} />
              </button>
              {r.source === 'reminder' && (
                <button
                  onClick={() => onDelete(r)}
                  title="Delete"
                  className="p-1.5 rounded-md hover:bg-[#fff5f5] text-[#ef4444]"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* New Entry shortcut */}
        {r.customer_id && onNewEntry && !isDone && (
          <button
            onClick={() => onNewEntry(r)}
            className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg border border-[#e5e7eb] hover:bg-[#f0fdf4] hover:border-[#3ECF8E] text-[#374151] hover:text-[#3ECF8E] transition-colors font-medium"
          >
            <ExternalLink size={11} />
            New Entry for {r.customer_name}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Calendar Cell ────────────────────────────────────────────────────────────

function CalendarCell({
  day,
  reminders,
  isSelected,
  isToday,
  isPast,
  isCurrentMonth,
  onClick,
}: {
  day: number | null
  reminders: Reminder[]
  isSelected: boolean
  isToday: boolean
  isPast: boolean
  isCurrentMonth: boolean
  onClick: () => void
}) {
  if (day === null) {
    return <div className="border border-[#f3f4f6] bg-[#fafafa]" style={{ minHeight: 64 }} />
  }

  return (
    <div
      onClick={onClick}
      className="border transition-colors cursor-pointer select-none"
      style={{
        minHeight: 64,
        padding: 8,
        background: isSelected ? '#3ECF8E' : isToday ? '#f0fdf4' : 'white',
        borderColor: isToday && !isSelected ? '#3ECF8E' : '#e5e7eb',
        borderWidth: isToday && !isSelected ? 2 : 1,
        opacity: isCurrentMonth ? 1 : 0.35,
      }}
      onMouseEnter={e => {
        if (!isSelected) (e.currentTarget as HTMLElement).style.background = isToday ? '#dcfce7' : '#f9fafb'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.background = isSelected ? '#3ECF8E' : isToday ? '#f0fdf4' : 'white'
      }}
    >
      <div
        className="text-sm font-medium mb-1"
        style={{
          color: isSelected ? 'white' : isToday ? '#3ECF8E' : isPast ? '#9ca3af' : '#111827',
          fontWeight: isToday ? 700 : 500,
        }}
      >
        {day}
      </div>
      <div className="flex gap-1 flex-wrap">
        {reminders.slice(0, 3).map((r, i) => (
          <div
            key={i}
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{
              background: isSelected ? 'rgba(255,255,255,0.8)' : (TYPE_COLORS[r.type] ?? '#6b7280'),
            }}
            title={r.title}
          />
        ))}
        {reminders.length > 3 && (
          <span
            className="text-[10px] leading-none"
            style={{ color: isSelected ? 'rgba(255,255,255,0.8)' : '#6b7280' }}
          >
            +{reminders.length - 3}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Add Reminder Modal ───────────────────────────────────────────────────────

function AddReminderModal({
  defaultDate,
  onClose,
  onSaved,
}: {
  defaultDate: string
  onClose: () => void
  onSaved: () => void
}) {
  const [date, setDate] = useState(defaultDate)
  const [time, setTime] = useState('09:00')
  const [type, setType] = useState<ReminderType>('card_due')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  // Customer autocomplete
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerSuggestions, setCustomerSuggestions] = useState<CustomerFull[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerFull | null>(null)
  const [selectedCard, setSelectedCard] = useState<CustomerCard | null>(null)
  const [bankName, setBankName] = useState('')
  const [amount, setAmount] = useState('')
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (customerQuery.length < 2) { setCustomerSuggestions([]); return }
    if (searchRef.current) clearTimeout(searchRef.current)
    searchRef.current = setTimeout(async () => {
      
      const { data } = await supabase
        .from('customers')
        .select('id, name, phone, outstanding_balance, default_charge_pct, cards(id, bank_name, last4, due_date, card_type)')
        .ilike('name', `%${customerQuery}%`)
        .limit(10)
      setCustomerSuggestions((data as CustomerFull[]) ?? [])
    }, 300)
  }, [customerQuery])

  const handleSelectCustomer = (c: CustomerFull) => {
    setSelectedCustomer(c)
    setCustomerQuery('')
    setCustomerSuggestions([])
    setAmount(String(c.outstanding_balance || ''))
    setSelectedCard(null)
    setBankName('')
  }

  const handleSelectCard = (card: CustomerCard) => {
    setSelectedCard(card)
    setBankName(card.bank_name)
    if (card.due_date) setDate(card.due_date)
    setType('card_due')
  }

  const handleClearCustomer = () => {
    setSelectedCustomer(null)
    setSelectedCard(null)
    setBankName('')
    setAmount('')
    setCustomerQuery('')
  }

  const [modalError, setModalError] = useState<string | null>(null)

  const autoTitle = selectedCustomer
    ? selectedCard
      ? `${selectedCard.bank_name} Card Due — ${selectedCustomer.name}`
      : `Payment Reminder — ${selectedCustomer.name}`
    : ''

  // Ensure date is always YYYY-MM-DD
  const normaliseDate = (d: string) => {
    if (!d) return ''
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d
    const [day, month, year] = d.split('-')
    return `${year}-${month}-${day}`
  }

  const handleSave = async () => {
    setModalError(null)
    if (!selectedCustomer) { setModalError('Please select a customer.'); return }
    if (!date) { setModalError('Please pick a date.'); return }

    setSaving(true)
    try {
      

      const payload = {
        title: autoTitle || `Reminder — ${selectedCustomer.name}`,
        description: description || null,
        reminder_date: normaliseDate(date),
        reminder_time: time ? time + ':00' : null,
        type,
        status: 'pending' as ReminderStatus,
        customer_id: selectedCustomer.id,
        customer_name: selectedCustomer.name,
        bank_name: bankName || selectedCard?.bank_name || null,
        amount: amount ? parseFloat(amount) : null,
      }

      console.log('[reminder] inserting:', payload)

      const { data, error } = await supabase
        .from('reminders')
        .insert(payload)
        .select()
        .single()

      if (error) {
        console.error('[reminder] insert error:', error)
        setModalError(`Save failed: ${error.message}`)
        return
      }

      console.log('[reminder] saved:', data)

      await logAction({
        action: 'Reminder Created',
        module: 'Reminders',
        details: { title: payload.title, date: payload.reminder_date, type, customer: selectedCustomer.name },
      })

      onSaved()
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error('[reminder] unexpected error:', err)
      setModalError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b border-[#e5e7eb]">
          <h2 className="font-bold text-[#111827] text-base">Add Reminder</h2>
          <button onClick={onClose} className="hover:bg-[#f3f4f6] p-1 rounded-lg"><X size={18} color="#6b7280" /></button>
        </div>
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">

          {/* ── Customer search (primary field) ── */}
          <div>
            <label className="block text-xs font-semibold text-[#374151] mb-1">Customer *</label>
            {selectedCustomer ? (
              <div className="rounded-xl border border-[#3ECF8E] bg-[#f0fdf4] p-3">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-semibold text-sm text-[#111827]">{selectedCustomer.name}</div>
                    {selectedCustomer.phone && (
                      <div className="text-xs text-[#6b7280] mt-0.5">{selectedCustomer.phone}</div>
                    )}
                    {selectedCustomer.outstanding_balance > 0 && (
                      <div className="text-xs font-semibold text-[#ef4444] mt-0.5">
                        Outstanding: {fmt(selectedCustomer.outstanding_balance)}
                      </div>
                    )}
                  </div>
                  <button onClick={handleClearCustomer} className="text-[#9ca3af] hover:text-[#374151] p-0.5">
                    <X size={14} />
                  </button>
                </div>
                {/* Card pills */}
                {selectedCustomer.cards && selectedCustomer.cards.length > 0 && (
                  <div>
                    <div className="text-xs text-[#6b7280] mb-1.5">Select card:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedCustomer.cards.map(card => (
                        <button
                          key={card.id}
                          onClick={() => handleSelectCard(card)}
                          className="text-xs px-2.5 py-1 rounded-full border transition-all font-medium"
                          style={
                            selectedCard?.id === card.id
                              ? { background: '#3ECF8E', borderColor: '#3ECF8E', color: 'white' }
                              : { background: 'white', borderColor: '#e5e7eb', color: '#374151' }
                          }
                        >
                          {card.bank_name} ...{card.last4}
                          {card.due_date && (
                            <span className="ml-1 opacity-70">({card.due_date.slice(5)})</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="relative" ref={dropRef}>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
                  <input
                    value={customerQuery}
                    onChange={e => setCustomerQuery(e.target.value)}
                    placeholder="Type customer name…"
                    className="w-full border border-[#e5e7eb] rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#3ECF8E]"
                  />
                </div>
                {customerSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-20 bg-white border border-[#e5e7eb] rounded-xl shadow-xl mt-1 max-h-52 overflow-y-auto">
                    {customerSuggestions.map(c => (
                      <button
                        key={c.id}
                        onClick={() => handleSelectCustomer(c)}
                        className="w-full text-left px-3 py-2.5 hover:bg-[#f9fafb] border-b border-[#f3f4f6] last:border-0"
                      >
                        <div className="font-semibold text-sm text-[#111827]">{c.name}</div>
                        <div className="flex items-center gap-3 mt-0.5">
                          {c.phone && <span className="text-xs text-[#9ca3af]">{c.phone}</span>}
                          {c.outstanding_balance > 0 && (
                            <span className="text-xs font-medium text-[#ef4444]">{fmt(c.outstanding_balance)} due</span>
                          )}
                          {c.cards?.length > 0 && (
                            <span className="text-xs text-[#6b7280]">{c.cards.length} card{c.cards.length !== 1 ? 's' : ''}</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Auto-generated title preview */}
          {autoTitle && (
            <div className="text-xs text-[#6b7280] bg-[#f9fafb] rounded-lg px-3 py-2 border border-[#e5e7eb]">
              <span className="font-semibold text-[#374151]">Title: </span>{autoTitle}
            </div>
          )}

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#374151] mb-1">Date *</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#3ECF8E]" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#374151] mb-1">Time</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} className="w-full border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#3ECF8E]" />
            </div>
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs font-semibold text-[#374151] mb-1">Type</label>
            <select value={type} onChange={e => setType(e.target.value as ReminderType)} className="w-full border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm">
              <option value="card_due">Card Due</option>
              <option value="payment">Payment</option>
              <option value="follow_up">Follow Up</option>
              <option value="custom">Custom</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Bank (editable override) + Amount */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#374151] mb-1">Bank Name</label>
              <input
                value={bankName}
                onChange={e => setBankName(e.target.value)}
                placeholder={selectedCard ? selectedCard.bank_name : 'e.g. HDFC'}
                className="w-full border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#3ECF8E]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#374151] mb-1">Amount</label>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="₹0"
                className="w-full border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#3ECF8E]"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-[#374151] mb-1">Notes</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder="Additional notes…"
              className="w-full border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[#3ECF8E]"
            />
          </div>
        </div>

        {modalError && (
          <div className="mx-5 mb-0 px-3 py-2 rounded-lg bg-[#fee2e2] border border-[#fca5a5] text-xs text-[#dc2626]">
            {modalError}
          </div>
        )}
        <div className="flex gap-3 p-5 border-t border-[#e5e7eb]">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-[#e5e7eb] text-sm text-[#374151] hover:bg-[#f9fafb]">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2 rounded-lg text-sm text-white font-semibold"
            style={{ background: saving ? '#9ca3af' : '#3ECF8E', cursor: saving ? 'not-allowed' : 'pointer' }}
          >
            {saving ? 'Saving…' : 'Save Reminder'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Snooze Modal ─────────────────────────────────────────────────────────────

function SnoozeModal({
  reminder,
  onClose,
  onSaved,
}: {
  reminder: Reminder
  onClose: () => void
  onSaved: () => void
}) {
  const [newDate, setNewDate] = useState(toIsoDate(new Date(Date.now() + 86400000)))
  const [saving, setSaving] = useState(false)

  const handleSnooze = async () => {
    setSaving(true)
    
    await supabase.from('reminders').update({ reminder_date: newDate, status: 'snoozed' }).eq('id', reminder.id)
    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between p-4 border-b border-[#e5e7eb]">
          <h2 className="font-bold text-[#111827]">Snooze Reminder</h2>
          <button onClick={onClose}><X size={18} color="#6b7280" /></button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-sm text-[#6b7280]">Snooze <strong className="text-[#374151]">{reminder.title}</strong> to:</p>
          <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="w-full border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="flex gap-3 p-4 border-t border-[#e5e7eb]">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-[#e5e7eb] text-sm text-[#374151]">Cancel</button>
          <button
            onClick={handleSnooze}
            disabled={saving}
            className="flex-1 px-4 py-2 rounded-lg text-sm text-white font-semibold"
            style={{ background: '#f59e0b' }}
          >
            {saving ? 'Snoozing…' : 'Snooze'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RemindersPage() {
  const today = new Date()
  const router = useRouter()
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar')
  const [currentYear, setCurrentYear] = useState(today.getFullYear())
  const [currentMonth, setCurrentMonth] = useState(today.getMonth()) // 0-indexed
  const [selectedDate, setSelectedDate] = useState<string>(toIsoDate(today))
  const [monthData, setMonthData] = useState<Record<string, Reminder[]>>({})
  const [listDays, setListDays] = useState<7 | 15 | 30>(30)
  const [listData, setListData] = useState<Reminder[]>([])
  const [overdue, setOverdue] = useState<{ count: number; items: Reminder[] }>({ count: 0, items: [] })
  const [showOverdue, setShowOverdue] = useState(false)
  const [loadingMonth, setLoadingMonth] = useState(true)
  const [loadingList, setLoadingList] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [snoozeTarget, setSnoozeTarget] = useState<Reminder | null>(null)

  const loadMonth = useCallback(async () => {
    setLoadingMonth(true)
    const data = await fetchMonthData(currentYear, currentMonth)
    setMonthData(data)
    setLoadingMonth(false)
  }, [currentYear, currentMonth])

  const loadList = useCallback(async () => {
    setLoadingList(true)
    const data = await fetchUpcomingList(listDays)
    setListData(data)
    setLoadingList(false)
  }, [listDays])

  const loadOverdue = useCallback(async () => {
    const data = await fetchOverdue()
    setOverdue(data)
  }, [])

  useEffect(() => { loadMonth() }, [loadMonth])
  useEffect(() => { loadList() }, [loadList])
  useEffect(() => { loadOverdue() }, [loadOverdue])

  const handleDone = async (r: Reminder) => {
    if (r.source === 'card') return // card reminders are auto, can't mark done here
    
    await supabase.from('reminders').update({ status: 'done' }).eq('id', r.id)
    await logAction({ action: 'Reminder Completed', module: 'Reminders', details: { title: r.title, date: r.reminder_date, customer: r.customer_name ?? '' } })
    loadMonth()
    loadList()
    loadOverdue()
  }

  const handleDelete = async (r: Reminder) => {
    if (r.source === 'card') return
    
    await supabase.from('reminders').delete().eq('id', r.id)
    loadMonth()
    loadList()
    loadOverdue()
  }

  const handleNewEntry = (r: Reminder) => {
    if (!r.customer_id) return
    router.push(`/entry?customer_id=${r.customer_id}&customer_name=${encodeURIComponent(r.customer_name ?? '')}`)
  }

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1) }
    else setCurrentMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1) }
    else setCurrentMonth(m => m + 1)
  }

  // Build calendar grid
  const daysInMonth = getDaysInMonth(currentYear, currentMonth)
  const firstDayOffset = getFirstDayOfMonth(currentYear, currentMonth)
  const totalCells = Math.ceil((firstDayOffset + daysInMonth) / 7) * 7
  const cells: (number | null)[] = [
    ...Array(firstDayOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ...Array(totalCells - firstDayOffset - daysInMonth).fill(null),
  ]

  const todayStr = toIsoDate(today)

  // Selected date reminders
  const selectedReminders = monthData[selectedDate] ?? []

  const selectedDateLabel = (() => {
    const d = new Date(selectedDate + 'T00:00:00')
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  })()

  // List row color
  const rowColor = (r: Reminder) => {
    const diff = Math.ceil((new Date(r.reminder_date).getTime() - Date.now()) / 86400000)
    if (diff < 0) return '#fff5f5'
    if (diff <= 2) return '#fff5f5'
    if (diff <= 7) return '#fffbeb'
    return 'white'
  }

  return (
    <div className="pb-12">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-[#1a1a1a]">Reminders</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">Card dues, payment follow-ups, and custom reminders</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center border border-[#e5e7eb] rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('calendar')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors"
              style={{ background: viewMode === 'calendar' ? '#111827' : 'white', color: viewMode === 'calendar' ? 'white' : '#6b7280' }}
            >
              <Calendar size={14} />Calendar
            </button>
            <button
              onClick={() => setViewMode('list')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors"
              style={{ background: viewMode === 'list' ? '#111827' : 'white', color: viewMode === 'list' ? 'white' : '#6b7280' }}
            >
              <List size={14} />List
            </button>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white"
            style={{ background: '#3ECF8E' }}
          >
            <Plus size={14} />Add Reminder
          </button>
        </div>
      </div>

      {/* ── Overdue banner ── */}
      {overdue.count > 0 && (
        <div
          className="flex items-center justify-between mb-4 px-4 py-3 rounded-xl border border-[#fca5a5] cursor-pointer"
          style={{ background: '#fff5f5' }}
          onClick={() => setShowOverdue(v => !v)}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} color="#ef4444" />
            <span className="text-sm font-semibold text-[#dc2626]">
              {overdue.count} overdue reminder{overdue.count !== 1 ? 's' : ''}!
            </span>
          </div>
          <ChevronRight
            size={16}
            color="#ef4444"
            style={{ transform: showOverdue ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}
          />
        </div>
      )}

      {/* ── Overdue list ── */}
      {showOverdue && overdue.items.length > 0 && (
        <div className="mb-6 space-y-2">
          {overdue.items.map(r => (
            <ReminderCard key={r.id} r={r} onDone={handleDone} onSnooze={setSnoozeTarget} onDelete={handleDelete} onNewEntry={handleNewEntry} />
          ))}
        </div>
      )}

      {/* ═══════════════════════════ CALENDAR VIEW ═══════════════════════════ */}
      {viewMode === 'calendar' && (
        <div className="flex gap-4 items-start">
          {/* Left: Calendar */}
          <div className="flex-1" style={{ minWidth: 0 }}>
            <div className="bg-white rounded-2xl border border-[#e5e7eb] overflow-hidden" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
              {/* Month nav */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-[#e5e7eb]">
                <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-[#f3f4f6]"><ChevronLeft size={18} color="#374151" /></button>
                <span className="font-bold text-[#111827] text-base">{MONTHS[currentMonth]} {currentYear}</span>
                <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-[#f3f4f6]"><ChevronRight size={18} color="#374151" /></button>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 border-b border-[#e5e7eb]">
                {DAYS_SHORT.map(d => (
                  <div key={d} className="text-center text-xs font-semibold text-[#9ca3af] py-2">{d}</div>
                ))}
              </div>

              {/* Calendar cells */}
              {loadingMonth ? (
                <div className="grid grid-cols-7">
                  {Array(35).fill(null).map((_, i) => (
                    <div key={i} className="border border-[#f3f4f6] animate-pulse bg-[#f9fafb]" style={{ minHeight: 64 }} />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-7">
                  {cells.map((day, i) => {
                    const dateStr = day
                      ? `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                      : ''
                    const dayDate = day ? new Date(currentYear, currentMonth, day) : null
                    const isPast = dayDate ? dayDate < new Date(todayStr + 'T00:00:00') : false

                    return (
                      <CalendarCell
                        key={i}
                        day={day}
                        reminders={dateStr ? (monthData[dateStr] ?? []) : []}
                        isSelected={dateStr === selectedDate}
                        isToday={dateStr === todayStr}
                        isPast={isPast}
                        isCurrentMonth={day !== null}
                        onClick={() => { if (dateStr) setSelectedDate(dateStr) }}
                      />
                    )
                  })}
                </div>
              )}

              {/* Legend */}
              <div className="flex items-center gap-4 px-5 py-3 border-t border-[#e5e7eb] flex-wrap">
                {[
                  { label: 'Card Due', color: '#ef4444' },
                  { label: 'Payment', color: '#f59e0b' },
                  { label: 'Follow Up', color: '#3b82f6' },
                  { label: 'Custom', color: '#10b981' },
                ].map(l => (
                  <div key={l.label} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />
                    <span className="text-xs text-[#6b7280]">{l.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Selected date panel */}
          <div style={{ width: 340, flexShrink: 0 }}>
            <div className="bg-white rounded-2xl border border-[#e5e7eb] overflow-hidden" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e7eb]">
                <div>
                  <div className="flex items-center gap-2">
                    <Calendar size={15} color="#3ECF8E" />
                    <span className="font-bold text-sm text-[#111827]">{selectedDateLabel}</span>
                  </div>
                  <div className="text-xs text-[#9ca3af] mt-0.5 ml-5">
                    {selectedReminders.length === 0
                      ? 'No reminders'
                      : `${selectedReminders.length} reminder${selectedReminders.length !== 1 ? 's' : ''}`}
                  </div>
                </div>
                <button
                  onClick={() => setShowAdd(true)}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-semibold text-white"
                  style={{ background: '#3ECF8E' }}
                >
                  <Plus size={12} />Add
                </button>
              </div>

              <div className="p-3 max-h-[600px] overflow-y-auto">
                {selectedReminders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <CreditCard size={28} color="#d1d5db" className="mb-3" />
                    <p className="text-sm text-[#9ca3af]">No reminders for this date</p>
                    <button
                      onClick={() => setShowAdd(true)}
                      className="mt-3 text-xs px-3 py-1.5 rounded-lg border border-[#3ECF8E] text-[#3ECF8E] hover:bg-[#f0fdf4] font-medium"
                    >
                      + Add Reminder
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedReminders.map(r => (
                      <ReminderCard
                        key={r.id}
                        r={r}
                        onDone={handleDone}
                        onSnooze={setSnoozeTarget}
                        onDelete={handleDelete}
                        onNewEntry={handleNewEntry}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═════════════════════════════ LIST VIEW ═════════════════════════════ */}
      {viewMode === 'list' && (
        <div>
          {/* Day filter */}
          <div className="flex items-center gap-2 mb-4">
            {([7, 15, 30] as const).map(d => (
              <button
                key={d}
                onClick={() => setListDays(d)}
                className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
                style={{ background: listDays === d ? '#3ECF8E' : '#f3f4f6', color: listDays === d ? '#fff' : '#374151' }}
              >
                {d} days
              </button>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-[#e5e7eb] overflow-hidden" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
            {loadingList ? (
              <div className="p-6 flex flex-col gap-3">
                {Array(5).fill(null).map((_, i) => (
                  <div key={i} className="h-10 bg-[#f3f4f6] animate-pulse rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[#f9fafb] border-b border-[#e5e7eb]">
                    <tr>
                      {['Type','Title','Customer','Date','Days Left','Amount','Status','Actions'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[#6b7280]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {listData.length === 0 ? (
                      <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-[#9ca3af]">No upcoming reminders in the next {listDays} days</td></tr>
                    ) : listData.map(r => (
                      <tr
                        key={r.id}
                        className="border-b border-[#f9fafb] hover:brightness-95 transition-colors"
                        style={{ background: rowColor(r) }}
                      >
                        <td className="px-4 py-2.5">
                          <span className="text-base">{TYPE_ICONS[r.type]}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-[#111827] max-w-[180px] truncate">{r.title}</div>
                          {r.description && <div className="text-xs text-[#9ca3af] truncate max-w-[180px]">{r.description}</div>}
                        </td>
                        <td className="px-4 py-2.5 text-[#374151]">{r.customer_name ?? '—'}</td>
                        <td className="px-4 py-2.5 text-[#374151] whitespace-nowrap">{r.reminder_date}</td>
                        <td className="px-4 py-2.5"><DaysLeftBadge date={r.reminder_date} /></td>
                        <td className="px-4 py-2.5 font-medium text-[#374151]">{r.amount ? fmt(r.amount) : '—'}</td>
                        <td className="px-4 py-2.5">
                          <span
                            className="text-xs px-2 py-0.5 rounded-full font-semibold uppercase"
                            style={r.status === 'done' ? { background: '#d1fae5', color: '#065f46' } : { background: '#f3f4f6', color: '#374151' }}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1">
                            {r.phone && (
                              <button onClick={() => openWhatsApp(r)} title="WhatsApp" className="p-1.5 rounded hover:bg-[#f0fdf4] text-[#25D366]"><MessageCircle size={13} /></button>
                            )}
                            {r.phone && (
                              <a href={`tel:${r.phone}`} title="Call" className="p-1.5 rounded hover:bg-[#eff6ff] text-[#3b82f6]"><Phone size={13} /></a>
                            )}
                            {r.source === 'reminder' && r.status !== 'done' && (
                              <button onClick={() => handleDone(r)} title="Mark Done" className="p-1.5 rounded hover:bg-[#f0fdf4] text-[#3ECF8E]"><Check size={13} /></button>
                            )}
                            {r.source === 'reminder' && (
                              <button onClick={() => handleDelete(r)} title="Delete" className="p-1.5 rounded hover:bg-[#fff5f5] text-[#ef4444]"><Trash2 size={13} /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {showAdd && (
        <AddReminderModal
          defaultDate={selectedDate}
          onClose={() => setShowAdd(false)}
          onSaved={() => { loadMonth(); loadList(); loadOverdue() }}
        />
      )}
      {snoozeTarget && snoozeTarget.source === 'reminder' && (
        <SnoozeModal
          reminder={snoozeTarget}
          onClose={() => setSnoozeTarget(null)}
          onSaved={() => { loadMonth(); loadList(); loadOverdue(); setSnoozeTarget(null) }}
        />
      )}
    </div>
  )
}
