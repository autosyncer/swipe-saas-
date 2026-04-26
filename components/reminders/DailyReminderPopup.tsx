'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { X, MessageCircle, Phone, Calendar, Clock } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Urgency = 'overdue' | 'today' | 'urgent' | 'upcoming'

interface AlertItem {
  id: string
  title: string
  customer_name: string
  reminder_date: string
  phone: string
  amount: number
  type: string
  bank_name: string
  urgency: Urgency
  label: string
  color: string
  bgColor: string
  days_left?: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SESSION_KEY = 'reminders_shown_date'

const openWhatsApp = (phone: string, name: string, bank: string, dueDate: string, amount: number) => {
  const e164 = phone.replace(/\D/g, '').replace(/^(?!91)/, '91')
  const msg = encodeURIComponent(
    `Dear ${name},\n\nThis is a reminder that your ${bank} card payment is due on ${dueDate}.\n\nOutstanding: ₹${amount.toLocaleString('en-IN')}\n\nPlease arrange payment at the earliest.\n\nThank you,\nChamundaswipe`
  )
  window.open(`https://wa.me/${e164}?text=${msg}`, '_blank')
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DailyReminderPopup() {
  const [show, setShow] = useState(false)
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const router = useRouter()

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    if (sessionStorage.getItem(SESSION_KEY) === today) return
    fetchAlerts(today)
  }, [])

  const fetchAlerts = async (today: string) => {
    try {
      const supabase = createClient()
      const in7days = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]

      const [{ data: pendingReminders }, { data: cardDues }] = await Promise.all([
        supabase
          .from('reminders')
          .select('*')
          .lte('reminder_date', today)
          .eq('status', 'pending')
          .order('reminder_date', { ascending: true }),
        supabase
          .from('cards')
          .select('*, customers(name, phone, outstanding_balance)')
          .lte('due_date', in7days)
          .gte('due_date', today)
          .order('due_date', { ascending: true }),
      ])

      const list: AlertItem[] = []

      // Overdue reminders (past due date)
      pendingReminders
        ?.filter(r => r.reminder_date < today)
        .forEach(r => list.push({
          id: r.id,
          title: r.title,
          customer_name: r.customer_name ?? '',
          reminder_date: r.reminder_date,
          phone: r.phone ?? '',
          amount: r.amount ?? 0,
          type: r.type ?? 'custom',
          bank_name: r.bank_name ?? '',
          urgency: 'overdue',
          label: '🔴 OVERDUE',
          color: '#ef4444',
          bgColor: '#fff5f5',
        }))

      // Today's reminders
      pendingReminders
        ?.filter(r => r.reminder_date === today)
        .forEach(r => list.push({
          id: r.id,
          title: r.title,
          customer_name: r.customer_name ?? '',
          reminder_date: r.reminder_date,
          phone: r.phone ?? '',
          amount: r.amount ?? 0,
          type: r.type ?? 'custom',
          bank_name: r.bank_name ?? '',
          urgency: 'today',
          label: '🟡 DUE TODAY',
          color: '#d97706',
          bgColor: '#fffbeb',
        }))

      // Upcoming card dues (next 7 days)
      cardDues?.forEach(card => {
        const cust = card.customers as { name: string; phone: string; outstanding_balance: number } | null
        const daysLeft = Math.ceil((new Date(card.due_date).getTime() - Date.now()) / 86400000)
        const isUrgent = daysLeft <= 2

        list.push({
          id: `card_${card.id}`,
          title: `${card.bank_name} Card Due — ...${card.last4}`,
          customer_name: cust?.name ?? '',
          reminder_date: card.due_date,
          phone: cust?.phone ?? '',
          amount: cust?.outstanding_balance ?? 0,
          type: 'card_due',
          bank_name: card.bank_name ?? '',
          urgency: isUrgent ? 'urgent' : 'upcoming',
          days_left: daysLeft,
          label: daysLeft === 0 ? '🔴 DUE TODAY'
            : daysLeft <= 2 ? `🔴 DUE IN ${daysLeft} DAY${daysLeft > 1 ? 'S' : ''}`
            : `🟡 DUE IN ${daysLeft} DAYS`,
          color: isUrgent ? '#ef4444' : '#d97706',
          bgColor: isUrgent ? '#fff5f5' : '#fffbeb',
        })
      })

      if (list.length > 0) {
        setAlerts(list)
        setShow(true)
        sessionStorage.setItem(SESSION_KEY, today)
      }
    } catch (err) {
      console.error('[DailyReminderPopup] fetch error:', err)
    }
  }

  if (!show || alerts.length === 0) return null

  const overdueCount = alerts.filter(a => a.urgency === 'overdue').length
  const todayCount   = alerts.filter(a => a.urgency === 'today').length
  const urgentCount  = alerts.filter(a => a.urgency === 'urgent').length

  const badgeStyle = (bg: string, color: string): React.CSSProperties => ({
    background: bg, color, padding: '2px 10px',
    borderRadius: 999, fontSize: 11, fontWeight: 700,
  })

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
        zIndex: 9999, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 16,
      }}
    >
      <div
        style={{
          background: 'white', borderRadius: 14,
          width: '100%', maxWidth: 560, maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
        }}
      >
        {/* ── Header ── */}
        <div style={{ padding: '20px 22px 14px', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#111' }}>🔔 Daily Reminders</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>
                {new Date().toLocaleDateString('en-IN', {
                  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                })}
              </div>
            </div>
            <button
              onClick={() => setShow(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#6b7280' }}
            >
              <X size={20} />
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            {overdueCount > 0 && (
              <span style={badgeStyle('#fee2e2', '#dc2626')}>{overdueCount} Overdue</span>
            )}
            {todayCount > 0 && (
              <span style={badgeStyle('#fef3c7', '#b45309')}>{todayCount} Due Today</span>
            )}
            {urgentCount > 0 && (
              <span style={badgeStyle('#fee2e2', '#dc2626')}>{urgentCount} Urgent</span>
            )}
            <span style={badgeStyle('#f3f4f6', '#374151')}>{alerts.length} total</span>
          </div>
        </div>

        {/* ── List ── */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '12px 22px' }}>
          {alerts.map((a, i) => (
            <div
              key={`${a.id}_${i}`}
              style={{
                border: `1px solid ${a.color}33`,
                borderLeft: `4px solid ${a.color}`,
                borderRadius: 8, padding: '11px 13px',
                marginBottom: 9, background: a.bgColor,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Badge row */}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: a.color }}>{a.label}</span>
                    <span style={{
                      fontSize: 10, color: '#6b7280', background: 'white',
                      padding: '1px 7px', borderRadius: 4, border: '1px solid #e5e7eb',
                    }}>
                      {a.type === 'card_due' ? '💳 Card Due'
                        : a.type === 'payment' ? '💰 Payment'
                        : a.type === 'follow_up' ? '📞 Follow Up'
                        : '⭐ Custom'}
                    </span>
                  </div>

                  {/* Title */}
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#111', marginBottom: 2 }}>
                    {a.title}
                  </div>

                  {/* Customer + amount */}
                  {a.customer_name && (
                    <div style={{ fontSize: 12, color: '#374151' }}>
                      👤 {a.customer_name}
                      {a.amount > 0 && (
                        <span style={{ fontWeight: 700, color: '#dc2626', marginLeft: 6 }}>
                          ₹{a.amount.toLocaleString('en-IN')}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Date */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, fontSize: 11, color: '#6b7280' }}>
                    <Calendar size={11} />
                    {new Date(a.reminder_date + 'T00:00:00').toLocaleDateString('en-IN', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </div>
                </div>

                {/* WhatsApp button */}
                {a.phone && (
                  <button
                    onClick={() => openWhatsApp(a.phone, a.customer_name, a.bank_name, a.reminder_date, a.amount)}
                    title="Send WhatsApp reminder"
                    style={{
                      background: '#25D366', color: 'white', border: 'none',
                      borderRadius: 7, padding: '6px 11px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 5,
                      fontSize: 12, fontWeight: 700, flexShrink: 0,
                    }}
                  >
                    <MessageCircle size={13} /> WA
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: '14px 22px', borderTop: '1px solid #e5e7eb',
          display: 'flex', gap: 10, justifyContent: 'flex-end',
        }}>
          <button
            onClick={() => setShow(false)}
            style={{
              border: '1px solid #e5e7eb', background: 'white',
              padding: '8px 18px', borderRadius: 7, cursor: 'pointer',
              fontSize: 13, color: '#374151',
            }}
          >
            Dismiss
          </button>
          <button
            onClick={() => { setShow(false); router.push('/reminders') }}
            style={{
              background: '#3ECF8E', color: 'white', border: 'none',
              padding: '8px 18px', borderRadius: 7, cursor: 'pointer',
              fontSize: 13, fontWeight: 700,
            }}
          >
            View All Reminders →
          </button>
        </div>
      </div>
    </div>
  )
}
