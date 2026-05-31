'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

type Tab = 'alerts' | 'reminders'

export default function PWAAlerts() {
  const [alerts, setAlerts]     = useState<Record<string, unknown>[]>([])
  const [reminders, setReminders] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState<Tab>('alerts')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const in7 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const [{ data: a }, { data: r }] = await Promise.all([
      supabase.from('risk_alerts').select('*').eq('is_dismissed', false).order('created_at', { ascending: false }).limit(20),
      supabase.from('reminders').select('*').eq('status', 'pending').lte('reminder_date', in7).order('reminder_date').limit(20),
    ])
    setAlerts(a || [])
    setReminders(r || [])
    setLoading(false)
  }

  async function dismissAlert(id: string) {
    await supabase.from('risk_alerts').update({ is_dismissed: true }).eq('id', id)
    setAlerts(prev => prev.filter(a => a.id !== id))
  }

  function sendWhatsApp(phone: string, name: string, date: string, amount: number) {
    const msg = encodeURIComponent(`Dear ${name},\n\nReminder: Payment due on ${date}\nAmount: ₹${amount.toLocaleString('en-IN')}\n\nPlease arrange payment.\n\nThank you,\nChamundaswipe`)
    window.open(`https://wa.me/91${phone}?text=${msg}`, '_blank')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: 'system-ui, sans-serif', paddingBottom: '80px' }}>
      <div style={{ background: '#1a1a1a', color: 'white', padding: '16px', paddingTop: 'calc(16px + env(safe-area-inset-top))' }}>
        <div style={{ fontWeight: 'bold', fontSize: '16px' }}>🔔 Alerts & Reminders</div>
        <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
          {(['alerts', 'reminders'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '6px 16px', borderRadius: '999px', border: 'none',
              background: tab === t ? '#3ECF8E' : '#2a2a2a',
              color: tab === t ? '#0f0f0f' : '#9ca3af',
              fontSize: '12px', fontWeight: 'bold', cursor: 'pointer',
            }}>
              {t === 'alerts' ? `⚠️ Alerts (${alerts.length})` : `📅 Reminders (${reminders.length})`}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>Loading...</div>
        ) : tab === 'alerts' ? (
          alerts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px', color: '#9ca3af' }}>
              <div style={{ fontSize: '40px' }}>✅</div>
              <div style={{ marginTop: '12px' }}>No active alerts</div>
            </div>
          ) : alerts.map(alert => (
            <div key={String(alert.id)} style={{
              background: 'white', borderRadius: '12px', padding: '14px', border: '1px solid #e5e7eb',
              borderLeft: `3px solid ${alert.severity === 'high' ? '#ef4444' : alert.severity === 'medium' ? '#f59e0b' : '#3b82f6'}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{
                  fontSize: '11px', padding: '2px 8px', borderRadius: '999px', fontWeight: 'bold',
                  background: alert.severity === 'high' ? '#fee2e2' : '#fef9c3',
                  color: alert.severity === 'high' ? '#ef4444' : '#92400e',
                }}>
                  {String(alert.severity || '').toUpperCase()}
                </span>
                <button onClick={() => dismissAlert(String(alert.id))} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '12px' }}>
                  Dismiss
                </button>
              </div>
              <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{String(alert.alert_type || '')}</div>
              <div style={{ color: '#6b7280', fontSize: '12px', marginTop: '2px' }}>{String(alert.customer_name || '')}</div>
            </div>
          ))
        ) : (
          reminders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px', color: '#9ca3af' }}>
              <div style={{ fontSize: '40px' }}>📅</div>
              <div style={{ marginTop: '12px' }}>No upcoming reminders</div>
            </div>
          ) : reminders.map(r => {
            const daysLeft = Math.ceil((new Date(String(r.reminder_date)).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            return (
              <div key={String(r.id)} style={{
                background: 'white', borderRadius: '12px', padding: '14px', border: '1px solid #e5e7eb',
                borderLeft: `3px solid ${daysLeft <= 0 ? '#ef4444' : daysLeft <= 3 ? '#f59e0b' : '#3ECF8E'}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{String(r.title || '')}</div>
                    <div style={{ color: '#6b7280', fontSize: '12px', marginTop: '2px' }}>{String(r.customer_name || '')}</div>
                    <div style={{ fontSize: '11px', marginTop: '4px', fontWeight: 'bold', color: daysLeft <= 0 ? '#ef4444' : daysLeft <= 3 ? '#f59e0b' : '#16a34a' }}>
                      {daysLeft <= 0 ? '🔴 OVERDUE' : daysLeft === 1 ? '🟡 DUE TOMORROW' : `📅 ${daysLeft} days left`}
                    </div>
                  </div>
                  {!!r.phone && (
                    <button onClick={() => sendWhatsApp(String(r.phone), String(r.customer_name), String(r.reminder_date), Number(r.amount))}
                      style={{ background: '#25D366', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', flexShrink: 0, marginLeft: '8px' }}>
                      WhatsApp
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
