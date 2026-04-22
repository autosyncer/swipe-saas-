'use client'

import { useState, useEffect, useCallback } from 'react'
import { BarChart, Bar, ResponsiveContainer, Tooltip } from 'recharts'
import { CheckCircle, Download, TrendingUp, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Transaction } from '@/types/database'

const chartData = [
  { v: 38000 }, { v: 42000 }, { v: 51000 }, { v: 47000 },
  { v: 55000 }, { v: 48000 }, { v: 61000 }, { v: 58000 },
]
const commData = [{ v: 1140 }, { v: 1260 }, { v: 1530 }, { v: 1410 }, { v: 1650 }, { v: 1440 }, { v: 1830 }, { v: 1740 }]
const pendData = [{ v: 3200 }, { v: 3800 }, { v: 2900 }, { v: 4100 }, { v: 3500 }, { v: 2800 }, { v: 3900 }, { v: 3200 }]
const txnData = [{ v: 2 }, { v: 3 }, { v: 4 }, { v: 3 }, { v: 5 }, { v: 3 }, { v: 6 }, { v: 5 }]

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    Paid: { bg: '#d1fae5', color: '#065f46' },
    Unpaid: { bg: '#fee2e2', color: '#991b1b' },
    Pending: { bg: '#fef3c7', color: '#92400e' },
    Puru: { bg: '#dbeafe', color: '#1e40af' },
    Cancel: { bg: '#f3f4f6', color: '#374151' },
  }
  const style = map[status] || { bg: '#f3f4f6', color: '#374151' }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: style.bg, color: style.color }}>
      {status}
    </span>
  )
}

function MetricCard({ label, value, data, timeLabel, loading }: { label: string; value: string; data: { v: number }[]; timeLabel: string; loading?: boolean }) {
  return (
    <div className="bg-white rounded-lg border p-4 flex flex-col gap-1" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
      <div className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide">{label}</div>
      {loading ? (
        <div className="h-8 bg-gray-100 animate-pulse rounded w-2/3" />
      ) : (
        <div className="text-2xl font-bold text-[#1a1a1a]">{value}</div>
      )}
      <div className="h-12 mt-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <Bar dataKey="v" fill="#3ECF8E" radius={[2, 2, 0, 0]} />
            <Tooltip contentStyle={{ fontSize: 10, padding: '2px 6px' }} formatter={(v: number) => [v.toLocaleString('en-IN'), '']} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="text-xs text-[#6b7280]">{timeLabel}</div>
    </div>
  )
}

interface DashMetrics {
  totalSwiped: number
  commissionToday: number
  pendingCollections: number
  transactionsToday: number
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DashMetrics>({ totalSwiped: 0, commissionToday: 0, pendingCollections: 0, transactionsToday: 0 })
  const [recentTxns, setRecentTxns] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]

    const [{ data: todayTxns }, { data: recent }] = await Promise.all([
      supabase.from('transactions').select('total_amount, paid_amount, swap_amount, remarks').eq('date', today),
      supabase.from('transactions').select('*').order('sr_no', { ascending: false }).limit(10),
    ])

    const txns = (todayTxns as Pick<Transaction, 'total_amount' | 'paid_amount' | 'swap_amount' | 'remarks'>[]) || []
    const totalSwiped = txns.reduce((s, t) => s + (t.total_amount || 0), 0)
    const commissionToday = txns.reduce((s, t) => s + ((t.swap_amount || 0) - (t.paid_amount || 0)), 0)
    const pendingCollections = txns.filter(t => t.remarks !== 'Paid').reduce((s, t) => s + (t.swap_amount || 0), 0)
    const transactionsToday = txns.length

    setMetrics({ totalSwiped, commissionToday, pendingCollections, transactionsToday })
    setRecentTxns((recent as Transaction[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const fmt = (n: number) => '₹' + n.toLocaleString('en-IN')

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-[#1a1a1a]">Dashboard</h1>
        <button onClick={fetchData} className="p-1.5 rounded-md border hover:bg-gray-50" style={{ borderColor: '#e5e7eb' }}>
          <RefreshCw size={15} color="#6b7280" className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'STATUS', value: <span className="flex items-center gap-1.5 text-base font-semibold text-[#1a1a1a]"><span className="w-2 h-2 rounded-full" style={{ background: '#3ECF8E' }} />Healthy</span> },
          { label: 'LAST ENTRY', value: recentTxns[0] ? <span className="text-base font-semibold">{recentTxns[0].date}</span> : <span className="text-base text-[#6b7280]">No entries</span> },
          { label: 'TODAY ENTRIES', value: <span className="text-base font-semibold">{loading ? '—' : metrics.transactionsToday}</span> },
          { label: 'OUTSTANDING', value: <span className="text-base font-semibold">{loading ? '—' : fmt(metrics.pendingCollections)}</span> },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-lg border p-4" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <div className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-1">{label}</div>
            {value}
          </div>
        ))}
      </div>

      {/* Metric chart cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <MetricCard label="Total Swiped Today" value={fmt(metrics.totalSwiped)} data={chartData} timeLabel="Last 8 days (sparkline)" loading={loading} />
        <MetricCard label="Commission Today" value={fmt(metrics.commissionToday)} data={commData} timeLabel="Last 8 days (sparkline)" loading={loading} />
        <MetricCard label="Pending Collections" value={fmt(metrics.pendingCollections)} data={pendData} timeLabel="Last 8 days (sparkline)" loading={loading} />
        <MetricCard label="Transactions Today" value={String(metrics.transactionsToday)} data={txnData} timeLabel="Last 8 days (sparkline)" loading={loading} />
      </div>

      {/* Bottom 2 cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-lg border p-6 flex flex-col items-center justify-center gap-3" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <CheckCircle size={32} color="#3ECF8E" />
          <div className="text-base font-semibold text-[#1a1a1a]">No issues found</div>
          <div className="text-sm text-[#6b7280]">All systems are operating normally</div>
        </div>
        <div className="bg-white rounded-lg border p-6" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={18} color="#3ECF8E" />
            <span className="font-semibold text-[#1a1a1a]">Quick Reports</span>
          </div>
          <div className="flex flex-col gap-2">
            {['Daily P&L Report', 'Customer Statement', 'Commission Summary'].map(r => (
              <button key={r} className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm text-[#1a1a1a] hover:bg-gray-50" style={{ borderColor: '#e5e7eb' }}>
                <Download size={14} color="#6b7280" />
                Export {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-white rounded-lg border" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <div className="px-4 py-3 border-b border-[#e5e7eb] font-semibold text-sm text-[#1a1a1a]">Recent Transactions</div>
        {loading ? (
          <div className="flex items-center justify-center h-24 text-sm text-[#6b7280]">Loading...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#e5e7eb] bg-[#f9f9f9]">
                {['SR', 'Date', 'Customer', 'Card', 'Total', 'Paid', 'A/C', 'Remarks'].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-[#6b7280] uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentTxns.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-[#6b7280]">No transactions yet</td></tr>
              ) : recentTxns.map(t => (
                <tr key={t.id} className="border-b border-[#e5e7eb] hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-[#6b7280]">{t.sr_no}</td>
                  <td className="px-4 py-2.5">{t.date}</td>
                  <td className="px-4 py-2.5 font-medium">{t.customer_name}</td>
                  <td className="px-4 py-2.5 text-[#6b7280]">{t.bank_card}</td>
                  <td className="px-4 py-2.5">₹{t.total_amount.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-2.5">₹{t.paid_amount.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-2.5 text-[#6b7280]">{t.account_name}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={t.remarks} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
