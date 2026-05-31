'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { downloadAcSheet, downloadChamundaSheet } from '@/lib/pwa-exports'

interface TxRow {
  id: string
  date: string
  customer_name: string
  bank_card: string
  total_amount: number
  paid_amount: number
  swap_amount: number
  account_name: string
  swap_name: string
  remarks: string
  commission_amount?: number
  commission_pct?: number
  created_at?: string
}
interface Alert {
  id: string
  alert_type: string
  customer_name: string
  severity: string
  is_dismissed: boolean
  created_at: string
}
interface Reminder {
  id: string
  title: string
  customer_name: string
  reminder_date: string
  phone?: string
  amount?: number
  status: string
}
interface AcSheet {
  account_name: string
  closing_bal: number
  avai_bal: number
}

function fmt(n: number) { return n.toLocaleString('en-IN') }
function toDay() { return new Date().toISOString().split('T')[0] }
function toDateStr(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }

export default function PWAHome() {
  const [todayTxns, setTodayTxns]       = useState<TxRow[]>([])
  const [yesterdayTxns, setYesterdayTxns] = useState<TxRow[]>([])
  const [weekTxns, setWeekTxns]         = useState<TxRow[]>([])
  const [monthTxns, setMonthTxns]       = useState<TxRow[]>([])
  const [alerts, setAlerts]             = useState<Alert[]>([])
  const [reminders, setReminders]       = useState<Reminder[]>([])
  const [acBalances, setAcBalances]     = useState<AcSheet[]>([])
  const [trend, setTrend]               = useState<{ date: string; comm: number }[]>([])
  const [loading, setLoading]           = useState(true)
  const [lastUpdated, setLastUpdated]   = useState<Date | null>(null)
  const [downloading, setDownloading]   = useState<string | null>(null)
  const [dlDate, setDlDate]             = useState(toDay())

  const fetchAll = useCallback(async () => {
    const today = toDay()
    const yest  = toDateStr(new Date(Date.now() - 86400000))
    const week  = toDateStr(new Date(Date.now() - 7 * 86400000))
    const month = (() => { const d = new Date(); d.setDate(1); return toDateStr(d) })()
    const in7   = toDateStr(new Date(Date.now() + 7 * 86400000))

    const [
      { data: td }, { data: yd }, { data: wd }, { data: md },
      { data: al }, { data: rm }, { data: ac }, { data: tr },
    ] = await Promise.all([
      supabase.from('transactions').select('*').eq('date', today).order('created_at', { ascending: false }),
      supabase.from('transactions').select('*').eq('date', yest),
      supabase.from('transactions').select('total_amount,commission_amount').gte('date', week).lte('date', today),
      supabase.from('transactions').select('total_amount,commission_amount').gte('date', month).lte('date', today),
      supabase.from('risk_alerts').select('*').eq('is_dismissed', false).order('created_at', { ascending: false }).limit(10),
      supabase.from('reminders').select('*').eq('status', 'pending').lte('reminder_date', in7).order('reminder_date').limit(10),
      supabase.from('ac_sheet').select('account_name,closing_bal,avai_bal').eq('date', today),
      supabase.from('transactions').select('date,commission_amount').gte('date', week).lte('date', today).order('date'),
    ])

    setTodayTxns((td || []) as TxRow[])
    setYesterdayTxns((yd || []) as TxRow[])
    setWeekTxns((wd || []) as TxRow[])
    setMonthTxns((md || []) as TxRow[])
    setAlerts((al || []) as Alert[])
    setReminders((rm || []) as Reminder[])
    setAcBalances((ac || []) as AcSheet[])

    // Build 7-day commission trend
    const trendMap: Record<string, number> = {}
    ;(tr || []).forEach((r: { date: string; commission_amount: number }) => {
      trendMap[r.date] = (trendMap[r.date] || 0) + Number(r.commission_amount || 0)
    })
    const days: { date: string; comm: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = toDateStr(new Date(Date.now() - i * 86400000))
      days.push({ date: d, comm: trendMap[d] || 0 })
    }
    setTrend(days)
    setLastUpdated(new Date())
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
    const channel = supabase.channel('pwa_home_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'risk_alerts' }, fetchAll)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchAll])

  // ── Computed ──────────────────────────────────────────────────────────────────
  const todaySwiped  = todayTxns.reduce((s, t) => s + Number(t.total_amount), 0)
  const todayComm    = todayTxns.reduce((s, t) => s + Number(t.commission_amount || 0), 0)
  const todayPending = todayTxns.filter(t => t.remarks !== 'PAID').reduce((s, t) => s + (Number(t.total_amount) - Number(t.paid_amount || 0)), 0)
  const todayCount   = todayTxns.length

  const yesterdaySwiped = yesterdayTxns.reduce((s, t) => s + Number(t.total_amount), 0)
  const yesterdayComm   = yesterdayTxns.reduce((s, t) => s + Number(t.commission_amount || 0), 0)

  const weekSwiped  = weekTxns.reduce((s, t) => s + Number(t.total_amount), 0)
  const monthSwiped = monthTxns.reduce((s, t) => s + Number(t.total_amount), 0)
  const weekComm    = weekTxns.reduce((s, t) => s + Number(t.commission_amount || 0), 0)
  const monthComm   = monthTxns.reduce((s, t) => s + Number(t.commission_amount || 0), 0)

  const lastEntry = todayTxns[0]?.created_at
    ? new Date(todayTxns[0].created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : null

  // Top customer today
  const custMap: Record<string, number> = {}
  todayTxns.forEach(t => { custMap[t.customer_name] = (custMap[t.customer_name] || 0) + Number(t.total_amount) })
  const topCust = Object.entries(custMap).sort(([, a], [, b]) => b - a)[0]

  // Machine-wise today
  const machineMap: Record<string, number> = {}
  todayTxns.forEach(t => { if (t.swap_name) machineMap[t.swap_name] = (machineMap[t.swap_name] || 0) + Number(t.swap_amount || t.total_amount) })
  const machineGroups = Object.entries(machineMap).sort(([, a], [, b]) => b - a)

  // Low balance accounts
  const lowBalAccounts = acBalances.filter(a => Number(a.closing_bal) <= 0)

  // Pct change helper
  function pctChange(today: number, yesterday: number) {
    if (yesterday === 0) return null
    const p = ((today - yesterday) / Math.abs(yesterday)) * 100
    return { val: Math.abs(p).toFixed(1), up: p >= 0 }
  }
  const swipedChg = pctChange(todaySwiped, yesterdaySwiped)
  const commChg   = pctChange(todayComm, yesterdayComm)

  // Trend chart max
  const maxComm = Math.max(...trend.map(d => d.comm), 1)

  // ── Helpers ───────────────────────────────────────────────────────────────────
  async function dismissAlert(id: string) {
    await supabase.from('risk_alerts').update({ is_dismissed: true }).eq('id', id)
    setAlerts(prev => prev.filter(a => a.id !== id))
  }

  function sendWhatsApp(phone: string, name: string, date: string, amount: number) {
    const msg = encodeURIComponent(`Dear ${name},\n\nReminder: Payment due on ${date}\nAmount: ₹${fmt(amount)}\n\nPlease arrange payment.\n\nThank you,\nChamundaswipe`)
    window.open(`https://wa.me/91${phone}?text=${msg}`, '_blank')
  }

  // ── Styles ────────────────────────────────────────────────────────────────────
  const card = (border = '#e5e7eb'): React.CSSProperties => ({
    background: 'white', borderRadius: 14, padding: '14px 16px',
    border: `1px solid ${border}`, marginBottom: 12,
  })
  const label: React.CSSProperties = { fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }
  const H = '#1a1a1a'

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui' }}>
      <div style={{ textAlign: 'center', color: '#9ca3af' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>⚡</div>
        <div>Loading dashboard...</div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', fontFamily: 'system-ui, sans-serif', paddingBottom: 80 }}>

      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <div style={{ background: '#1a1a1a', color: 'white', padding: '16px', paddingTop: 'calc(16px + env(safe-area-inset-top))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>SwipeSaaS</div>
            <div style={{ color: '#9ca3af', fontSize: 12 }}>
              {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
              {lastEntry && <span style={{ marginLeft: 8, color: '#3ECF8E' }}>• Last entry {lastEntry}</span>}
            </div>
          </div>
          <button onClick={fetchAll} style={{ background: '#2a2a2a', border: 'none', color: '#3ECF8E', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 12 }}>
            ↻ Refresh
          </button>
        </div>

        {/* Today KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
          {[
            { label: 'Total Swiped', value: `₹${fmt(todaySwiped)}`, chg: swipedChg, color: '#3ECF8E', icon: '💳' },
            { label: 'Commission', value: `₹${fmt(todayComm)}`, chg: commChg, color: '#60a5fa', icon: '💰' },
            { label: 'Pending', value: `₹${fmt(todayPending)}`, color: '#f59e0b', icon: '⏳' },
            { label: 'Transactions', value: String(todayCount), color: '#a78bfa', icon: '📋' },
          ].map(k => (
            <div key={k.label} style={{ background: '#2a2a2a', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600 }}>{k.icon} {k.label}</span>
                {k.chg && <span style={{ fontSize: 10, color: k.chg.up ? '#3ECF8E' : '#ef4444' }}>{k.chg.up ? '▲' : '▼'}{k.chg.val}%</span>}
              </div>
              <div style={{ fontSize: 17, fontWeight: 800, color: k.color, marginTop: 4 }}>{k.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '14px 12px' }}>

        {/* ── Alerts banner ──────────────────────────────────────────────────────── */}
        {(alerts.length > 0 || lowBalAccounts.length > 0) && (
          <div style={{ ...card('#fca5a5'), borderLeft: '3px solid #ef4444', background: '#fff5f5' }}>
            <div style={label}>⚠️ Active Alerts</div>
            {lowBalAccounts.map(a => (
              <div key={a.account_name} style={{ fontSize: 13, color: '#dc2626', marginBottom: 4, fontWeight: 600 }}>
                🏦 {a.account_name} — No balance (₹{fmt(Number(a.closing_bal))})
              </div>
            ))}
            {alerts.slice(0, 3).map(a => (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: a.severity === 'high' ? '#dc2626' : '#d97706' }}>{a.alert_type}</span>
                  <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 6 }}>{a.customer_name}</span>
                </div>
                <button onClick={() => dismissAlert(a.id)} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, padding: '2px 8px', fontSize: 11, color: '#6b7280', cursor: 'pointer' }}>✓ Done</button>
              </div>
            ))}
          </div>
        )}

        {/* ── Today vs Yesterday ─────────────────────────────────────────────────── */}
        <div style={card()}>
          <div style={label}>📊 Today vs Yesterday</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
            {[
              { l: 'Swiped', today: todaySwiped, yday: yesterdaySwiped },
              { l: 'Commission', today: todayComm, yday: yesterdayComm },
              { l: 'Txns', today: todayCount, yday: yesterdayTxns.length, raw: true },
            ].map(r => {
              const chg = pctChange(r.today, r.yday)
              return (
                <div key={r.l} style={{ background: '#f9fafb', borderRadius: 8, padding: '8px 4px' }}>
                  <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 4 }}>{r.l}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: H }}>{r.raw ? r.today : `₹${fmt(r.today)}`}</div>
                  <div style={{ fontSize: 10, color: '#9ca3af' }}>vs {r.raw ? r.yday : `₹${fmt(r.yday)}`}</div>
                  {chg && <div style={{ fontSize: 11, color: chg.up ? '#16a34a' : '#dc2626', fontWeight: 700 }}>{chg.up ? '▲' : '▼'}{chg.val}%</div>}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Week / Month summary ────────────────────────────────────────────────── */}
        <div style={card()}>
          <div style={label}>📅 Summary</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { l: '7 Days Swiped', v: `₹${fmt(weekSwiped)}`, c: '#3ECF8E' },
              { l: '7 Days Comm',   v: `₹${fmt(weekComm)}`,   c: '#60a5fa' },
              { l: 'Month Swiped',  v: `₹${fmt(monthSwiped)}`, c: '#f59e0b' },
              { l: 'Month Comm',    v: `₹${fmt(monthComm)}`,   c: '#a78bfa' },
            ].map(k => (
              <div key={k.l} style={{ background: '#f9fafb', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>{k.l}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: k.c, marginTop: 2 }}>{k.v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Commission Trend 7 days ─────────────────────────────────────────────── */}
        <div style={card()}>
          <div style={label}>📈 Commission Trend (7 days)</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 70, paddingTop: 8 }}>
            {trend.map(d => {
              const h = maxComm > 0 ? Math.max(4, (d.comm / maxComm) * 60) : 4
              const isToday = d.date === toDay()
              return (
                <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ fontSize: 9, color: '#9ca3af' }}>{d.comm > 0 ? `₹${fmt(d.comm)}` : ''}</div>
                  <div style={{ width: '100%', height: h, background: isToday ? '#3ECF8E' : '#d1fae5', borderRadius: '3px 3px 0 0' }} />
                  <div style={{ fontSize: 9, color: isToday ? '#3ECF8E' : '#9ca3af', fontWeight: isToday ? 800 : 400 }}>
                    {new Date(d.date).toLocaleDateString('en-IN', { day: 'numeric' })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Top Customer ────────────────────────────────────────────────────────── */}
        {topCust && (
          <div style={card()}>
            <div style={label}>🏆 Top Customer Today</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: H }}>{topCust[0]}</div>
              <div style={{ fontWeight: 800, fontSize: 16, color: '#3ECF8E' }}>₹{fmt(topCust[1])}</div>
            </div>
          </div>
        )}

        {/* ── Machine-wise Today ──────────────────────────────────────────────────── */}
        {machineGroups.length > 0 && (
          <div style={card()}>
            <div style={label}>🔧 Machine-wise Today</div>
            {machineGroups.map(([machine, amt]) => {
              const pct = todaySwiped > 0 ? (amt / todaySwiped) * 100 : 0
              return (
                <div key={machine} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: H }}>{machine}</span>
                    <span style={{ fontSize: 13, color: '#6b7280' }}>₹{fmt(amt)} ({pct.toFixed(0)}%)</span>
                  </div>
                  <div style={{ background: '#f3f4f6', borderRadius: 999, height: 6, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: '#3ECF8E', borderRadius: 999 }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Reminders ───────────────────────────────────────────────────────────── */}
        {reminders.length > 0 && (
          <div style={card()}>
            <div style={label}>📅 Upcoming Reminders</div>
            {reminders.map(r => {
              const daysLeft = Math.ceil((new Date(r.reminder_date).getTime() - Date.now()) / 86400000)
              return (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: H }}>{r.customer_name}</div>
                    <div style={{ fontSize: 11, color: daysLeft <= 0 ? '#dc2626' : daysLeft <= 3 ? '#d97706' : '#16a34a', fontWeight: 600 }}>
                      {daysLeft <= 0 ? '🔴 OVERDUE' : daysLeft === 1 ? '🟡 Tomorrow' : `📅 ${daysLeft} days`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {r.amount && <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>₹{fmt(r.amount)}</span>}
                    {r.phone && (
                      <button onClick={() => sendWhatsApp(r.phone!, r.customer_name, r.reminder_date, r.amount || 0)}
                        style={{ background: '#25D366', color: 'white', border: 'none', borderRadius: 6, padding: '5px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                        WA
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Today's Transactions ────────────────────────────────────────────────── */}
        <div style={card()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={label}>📋 Today&apos;s Entries</div>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>{todayCount} total</div>
          </div>
          {todayTxns.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#9ca3af', padding: '20px 0', fontSize: 13 }}>No transactions today</div>
          ) : todayTxns.map(t => (
            <div key={t.id} style={{ padding: '8px 0', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: H, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.customer_name}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>{t.swap_name || t.account_name} · {t.bank_card}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: H }}>₹{fmt(Number(t.total_amount))}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: t.remarks === 'PAID' ? '#16a34a' : '#d97706' }}>{t.remarks}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Download Sheets ─────────────────────────────────────────────────────── */}
        <div style={card()}>
          <div style={label}>⬇️ Download Sheets</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: '#6b7280', flexShrink: 0 }}>Date:</span>
            <input
              type="date"
              value={dlDate}
              onChange={e => setDlDate(e.target.value)}
              style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', background: '#f9fafb' }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button
              onClick={async () => {
                setDownloading('ac')
                try { await downloadAcSheet(dlDate) } finally { setDownloading(null) }
              }}
              disabled={!!downloading}
              style={{
                background: downloading === 'ac' ? '#9ca3af' : '#1F4E79',
                color: 'white', border: 'none', borderRadius: 10,
                padding: '12px 8px', fontWeight: 700, fontSize: 13,
                cursor: downloading ? 'not-allowed' : 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}
            >
              <span style={{ fontSize: 20 }}>🏦</span>
              {downloading === 'ac' ? 'Downloading...' : 'AC Sheet'}
            </button>
            <button
              onClick={async () => {
                setDownloading('chamunda')
                try { await downloadChamundaSheet(dlDate) } finally { setDownloading(null) }
              }}
              disabled={!!downloading}
              style={{
                background: downloading === 'chamunda' ? '#9ca3af' : '#3ECF8E',
                color: downloading === 'chamunda' ? 'white' : '#0f0f0f',
                border: 'none', borderRadius: 10,
                padding: '12px 8px', fontWeight: 700, fontSize: 13,
                cursor: downloading ? 'not-allowed' : 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}
            >
              <span style={{ fontSize: 20 }}>📊</span>
              {downloading === 'chamunda' ? 'Downloading...' : 'Chamunda Sheet'}
            </button>
          </div>
        </div>

        {/* ── Last updated ────────────────────────────────────────────────────────── */}
        {lastUpdated && (
          <div style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', paddingBottom: 8 }}>
            Live · updated {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        )}

      </div>
    </div>
  )
}
