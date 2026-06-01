'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { downloadAcSheet, downloadChamundaSheet } from '@/lib/pwa-exports'

function fmt(n: number) { return n.toLocaleString('en-IN') }
function toDay() { return new Date().toISOString().split('T')[0] }
function toDateStr(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }

export default function PWAHome() {
  const [todaySwiped,  setTodaySwiped]  = useState(0)
  const [todayComm,    setTodayComm]    = useState(0)
  const [todayPending, setTodayPending] = useState(0)
  const [todayCount,   setTodayCount]   = useState(0)
  const [weekSwiped,   setWeekSwiped]   = useState(0)
  const [monthSwiped,  setMonthSwiped]  = useState(0)
  const [lastEntry,    setLastEntry]    = useState<string | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [downloading,  setDownloading]  = useState<string | null>(null)
  const [dlDate,       setDlDate]       = useState(toDay())

  const fetchAll = useCallback(async () => {
    const today = toDay()
    const week  = toDateStr(new Date(Date.now() - 7 * 86400000))
    const month = (() => { const d = new Date(); d.setDate(1); return toDateStr(d) })()

    const [{ data: td }, { data: wd }, { data: md }] = await Promise.all([
      supabase.from('transactions').select('*').eq('date', today).order('created_at', { ascending: false }),
      supabase.from('transactions').select('total_amount').gte('date', week).lte('date', today),
      supabase.from('transactions').select('total_amount').gte('date', month).lte('date', today),
    ])

    const t = td || []
    setTodaySwiped(t.reduce((s, x) => s + Number(x.total_amount), 0))
    setTodayComm(t.reduce((s, x) => s + Number(x.commission_amount || 0), 0))
    setTodayPending(t.filter(x => x.remarks !== 'PAID').reduce((s, x) => s + (Number(x.total_amount) - Number(x.paid_amount || 0)), 0))
    setTodayCount(t.length)
    setWeekSwiped((wd || []).reduce((s, x) => s + Number(x.total_amount), 0))
    setMonthSwiped((md || []).reduce((s, x) => s + Number(x.total_amount), 0))
    setLastEntry(t[0]?.created_at ? new Date(t[0].created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : null)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
    const channel = supabase.channel('pwa_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, fetchAll)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchAll])

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontFamily: 'system-ui' }}>
      <div style={{ textAlign: 'center' }}><div style={{ fontSize: 32 }}>⚡</div><div>Loading...</div></div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', fontFamily: 'system-ui, sans-serif', paddingBottom: 80 }}>

      {/* Header */}
      <div style={{ background: '#1a1a1a', color: 'white', padding: '16px', paddingTop: 'calc(16px + env(safe-area-inset-top))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>SwipeSaaS</div>
            <div style={{ color: '#9ca3af', fontSize: 12 }}>
              {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
              {lastEntry && <span style={{ marginLeft: 8, color: '#3ECF8E' }}>• Last entry {lastEntry}</span>}
            </div>
          </div>
          <button onClick={fetchAll} style={{ background: '#2a2a2a', border: 'none', color: '#3ECF8E', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>
            ↻ Refresh
          </button>
        </div>

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { label: 'Total Swiped', value: `₹${fmt(todaySwiped)}`, color: '#3ECF8E', icon: '💳' },
            { label: 'Commission',   value: `₹${fmt(todayComm)}`,   color: '#60a5fa', icon: '💰' },
            { label: 'Pending',      value: `₹${fmt(todayPending)}`, color: '#f59e0b', icon: '⏳' },
            { label: 'Transactions', value: String(todayCount),      color: '#a78bfa', icon: '📋' },
          ].map(k => (
            <div key={k.label} style={{ background: '#2a2a2a', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600 }}>{k.icon} {k.label}</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: k.color, marginTop: 4 }}>{k.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Week / Month */}
        <div style={{ background: 'white', borderRadius: 14, padding: '14px 16px', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', marginBottom: 10 }}>📅 Summary</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { l: '7 Days Swiped', v: `₹${fmt(weekSwiped)}`,  c: '#3ECF8E' },
              { l: 'Month Swiped',  v: `₹${fmt(monthSwiped)}`, c: '#f59e0b' },
            ].map(k => (
              <div key={k.l} style={{ background: '#f9fafb', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>{k.l}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: k.c, marginTop: 2 }}>{k.v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Download Sheets */}
        <div style={{ background: 'white', borderRadius: 14, padding: '14px 16px', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', marginBottom: 12 }}>⬇️ Download Sheets</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: '#6b7280', flexShrink: 0 }}>Date:</span>
            <input type="date" value={dlDate} onChange={e => setDlDate(e.target.value)}
              style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', background: '#f9fafb' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button onClick={async () => { setDownloading('ac'); try { await downloadAcSheet(dlDate) } finally { setDownloading(null) } }}
              disabled={!!downloading}
              style={{ background: downloading === 'ac' ? '#9ca3af' : '#1F4E79', color: 'white', border: 'none', borderRadius: 10, padding: '14px 8px', fontWeight: 700, fontSize: 13, cursor: downloading ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 22 }}>🏦</span>
              {downloading === 'ac' ? 'Downloading...' : 'AC Sheet'}
            </button>
            <button onClick={async () => { setDownloading('chamunda'); try { await downloadChamundaSheet(dlDate) } finally { setDownloading(null) } }}
              disabled={!!downloading}
              style={{ background: downloading === 'chamunda' ? '#9ca3af' : '#3ECF8E', color: downloading === 'chamunda' ? 'white' : '#0f0f0f', border: 'none', borderRadius: 10, padding: '14px 8px', fontWeight: 700, fontSize: 13, cursor: downloading ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 22 }}>📊</span>
              {downloading === 'chamunda' ? 'Downloading...' : 'Chamunda Sheet'}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
