'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

type Period = 'today' | 'week' | 'month'

export default function PWAStats() {
  const [stats, setStats] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>('today')

  const fetchStats = useCallback(async () => {
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]
    let startDate = today
    if (period === 'week') {
      const d = new Date(); d.setDate(d.getDate() - 7)
      startDate = d.toISOString().split('T')[0]
    }
    if (period === 'month') {
      const d = new Date(); d.setDate(1)
      startDate = d.toISOString().split('T')[0]
    }

    const { data: txns } = await supabase.from('transactions').select('*').gte('date', startDate).lte('date', today)
    const t = txns || []

    const totalSwiped = t.reduce((s, x) => s + Number(x.total_amount), 0)
    const totalComm   = t.reduce((s, x) => s + Number(x.commission_amount || 0), 0)
    const outstanding = t.reduce((s, x) => s + (Number(x.total_amount) - Number(x.paid_amount || 0)), 0)
    const txnCount    = t.length
    const paidCount   = t.filter(x => x.remarks === 'PAID').length
    const collectionRate = txnCount > 0 ? ((paidCount / txnCount) * 100).toFixed(1) : '0'

    const custMap: Record<string, number> = {}
    t.forEach(x => { custMap[x.customer_name] = (custMap[x.customer_name] || 0) + Number(x.total_amount) })
    const topCust = Object.entries(custMap).sort(([, a], [, b]) => b - a)[0]

    const accMap: Record<string, number> = {}
    t.forEach(x => {
      const acc = (x.account_name || '').split(/[+,]/)[0].trim()
      if (acc) accMap[acc] = (accMap[acc] || 0) + Number(x.total_amount)
    })
    const topAccounts = Object.entries(accMap).sort(([, a], [, b]) => b - a).slice(0, 5)

    setStats({ totalSwiped, totalComm, outstanding, txnCount, collectionRate, topCust, topAccounts })
    setLoading(false)
  }, [period])

  useEffect(() => { fetchStats() }, [fetchStats])

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: 'system-ui, sans-serif', paddingBottom: '80px' }}>
      <div style={{ background: '#1a1a1a', color: 'white', padding: '16px', paddingTop: 'calc(16px + env(safe-area-inset-top))' }}>
        <div style={{ fontWeight: 'bold', fontSize: '16px' }}>📊 Quick Stats</div>
        <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
          {(['today', 'week', 'month'] as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              padding: '6px 16px', borderRadius: '999px', border: 'none',
              background: period === p ? '#3ECF8E' : '#2a2a2a',
              color: period === p ? '#0f0f0f' : '#9ca3af',
              fontSize: '12px', fontWeight: 'bold', cursor: 'pointer',
            }}>
              {p === 'today' ? 'Today' : p === 'week' ? '7 Days' : 'Month'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>Loading...</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {[
                { label: 'Total Swiped',  value: `₹${Number(stats.totalSwiped).toLocaleString('en-IN')}`, color: '#3ECF8E', icon: '💳' },
                { label: 'Commission',    value: `₹${Number(stats.totalComm).toLocaleString('en-IN')}`,   color: '#3b82f6', icon: '💰' },
                { label: 'Outstanding',   value: `₹${Number(stats.outstanding).toLocaleString('en-IN')}`, color: '#f59e0b', icon: '⏳' },
                { label: 'Transactions',  value: String(stats.txnCount),                                  color: '#8b5cf6', icon: '📋' },
              ].map(kpi => (
                <div key={kpi.label} style={{ background: 'white', borderRadius: '12px', padding: '14px', border: '1px solid #e5e7eb', borderLeft: `3px solid ${kpi.color}` }}>
                  <div style={{ fontSize: '20px', marginBottom: '4px' }}>{kpi.icon}</div>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: kpi.color }}>{kpi.value}</div>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>{kpi.label}</div>
                </div>
              ))}
            </div>

            {/* Collection rate */}
            <div style={{ background: 'white', borderRadius: '12px', padding: '14px', border: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 'bold' }}>Collection Rate</span>
                <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#16a34a' }}>{String(stats.collectionRate)}%</span>
              </div>
              <div style={{ background: '#f3f4f6', borderRadius: '999px', height: '8px', overflow: 'hidden' }}>
                <div style={{ width: `${stats.collectionRate}%`, height: '100%', background: '#3ECF8E', borderRadius: '999px' }} />
              </div>
            </div>

            {/* Top customer */}
            {stats.topCust && (
              <div style={{ background: 'white', borderRadius: '12px', padding: '14px', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase', fontWeight: 'bold' }}>🏆 Top Customer</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '15px' }}>{(stats.topCust as [string, number])[0]}</span>
                  <span style={{ color: '#3ECF8E', fontWeight: 'bold', fontSize: '15px' }}>₹{Number((stats.topCust as [string, number])[1]).toLocaleString('en-IN')}</span>
                </div>
              </div>
            )}

            {/* Top accounts */}
            {(stats.topAccounts as [string, number][])?.length > 0 && (
              <div style={{ background: 'white', borderRadius: '12px', padding: '14px', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px', textTransform: 'uppercase', fontWeight: 'bold' }}>🏦 Top Accounts</div>
                {(stats.topAccounts as [string, number][]).map(([acc, amt]) => {
                  const total = (stats.topAccounts as [string, number][]).reduce((s, [, a]) => s + a, 0)
                  const pct = total > 0 ? (amt / total * 100).toFixed(0) : '0'
                  return (
                    <div key={acc} style={{ marginBottom: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '13px' }}>
                        <span style={{ fontWeight: 'bold' }}>{acc}</span>
                        <span style={{ color: '#6b7280' }}>₹{Number(amt).toLocaleString('en-IN')} ({pct}%)</span>
                      </div>
                      <div style={{ background: '#f3f4f6', borderRadius: '999px', height: '6px', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: '#3b82f6', borderRadius: '999px' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
