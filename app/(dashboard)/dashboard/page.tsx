'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { BarChart, Bar, ResponsiveContainer, Tooltip } from 'recharts'
import { CheckCircle, Download, TrendingUp, RefreshCw, X, Search, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { createClient } from '@/lib/supabase/client'
import { Transaction } from '@/types/database'

const chartData = [
  { v: 38000 }, { v: 42000 }, { v: 51000 }, { v: 47000 },
  { v: 55000 }, { v: 48000 }, { v: 61000 }, { v: 58000 },
]
const commData = [{ v: 1140 }, { v: 1260 }, { v: 1530 }, { v: 1410 }, { v: 1650 }, { v: 1440 }, { v: 1830 }, { v: 1740 }]
const pendData = [{ v: 3200 }, { v: 3800 }, { v: 2900 }, { v: 4100 }, { v: 3500 }, { v: 2800 }, { v: 3900 }, { v: 3200 }]
const txnData = [{ v: 2 }, { v: 3 }, { v: 4 }, { v: 3 }, { v: 5 }, { v: 3 }, { v: 6 }, { v: 5 }]

// ─── Helpers ──────────────────────────────────────────────────────────────────

const todayStr = () => new Date().toISOString().split('T')[0]
const firstOfMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function downloadBlob(buffer: ArrayBuffer, filename: string) {
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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

// ─── Customer Statement Modal ─────────────────────────────────────────────────

interface CustomerOption { id: string; name: string }

function CustomerStatementModal({ onClose, onGenerate, loading }: {
  onClose: () => void
  onGenerate: (customerId: string, customerName: string, from: string, to: string) => void
  loading: boolean
}) {
  const [search, setSearch] = useState('')
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [selected, setSelected] = useState<CustomerOption | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [from, setFrom] = useState(firstOfMonth())
  const [to, setTo] = useState(todayStr())
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const searchCustomers = useCallback(async (q: string) => {
    if (!q.trim()) { setCustomers([]); return }
    const sb = createClient()
    const { data } = await sb.from('customers').select('id, name').ilike('name', `%${q}%`).limit(10)
    setCustomers((data as CustomerOption[]) || [])
    setShowDropdown(true)
  }, [])

  const handleSearchChange = (v: string) => {
    setSearch(v)
    setSelected(null)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => searchCustomers(v), 300)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #e5e7eb' }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#111' }}>Customer Statement</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color="#6b7280" /></button>
        </div>
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Customer search */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Customer</label>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}>
                <Search size={14} color="#9ca3af" />
              </div>
              <input
                value={selected ? selected.name : search}
                onChange={e => handleSearchChange(e.target.value)}
                onFocus={() => search && setShowDropdown(true)}
                placeholder="Search customer..."
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 6, padding: '8px 12px 8px 32px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
              {showDropdown && customers.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e5e7eb', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: 180, overflowY: 'auto' }}>
                  {customers.map(c => (
                    <div key={c.id} onClick={() => { setSelected(c); setSearch(c.name); setShowDropdown(false) }}
                      style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, color: '#1a1a1a' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f9f9f9')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'white')}
                    >{c.name}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {/* Date range */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>From Date</label>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 6, padding: '8px 10px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>To Date</label>
              <input type="date" value={to} onChange={e => setTo(e.target.value)}
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 6, padding: '8px 10px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>
        </div>
        <div style={{ padding: '0 20px 20px', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ border: '1px solid #e5e7eb', background: 'white', padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13, color: '#374151' }}>Cancel</button>
          <button
            disabled={!selected || loading}
            onClick={() => selected && onGenerate(selected.id, selected.name, from, to)}
            style={{ background: selected ? '#3ECF8E' : '#d1d5db', color: 'white', border: 'none', padding: '8px 18px', borderRadius: 6, cursor: selected ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {loading ? <><Loader2 size={13} className="animate-spin" /> Generating...</> : 'Generate Excel'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Commission Summary Modal ─────────────────────────────────────────────────

function CommissionSummaryModal({ onClose, onGenerate, loading }: {
  onClose: () => void
  onGenerate: (from: string, to: string) => void
  loading: boolean
}) {
  const [from, setFrom] = useState(firstOfMonth())
  const [to, setTo] = useState(todayStr())

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #e5e7eb' }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#111' }}>Commission Summary</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color="#6b7280" /></button>
        </div>
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>From Date</label>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 6, padding: '8px 10px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>To Date</label>
              <input type="date" value={to} onChange={e => setTo(e.target.value)}
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 6, padding: '8px 10px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>
        </div>
        <div style={{ padding: '0 20px 20px', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ border: '1px solid #e5e7eb', background: 'white', padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13, color: '#374151' }}>Cancel</button>
          <button
            disabled={loading}
            onClick={() => onGenerate(from, to)}
            style={{ background: '#3ECF8E', color: 'white', border: 'none', padding: '8px 18px', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {loading ? <><Loader2 size={13} className="animate-spin" /> Generating...</> : 'Generate Excel'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Dashboard metrics types ──────────────────────────────────────────────────

interface DashMetrics {
  totalSwiped: number
  commissionToday: number
  pendingCollections: number
  transactionsToday: number
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DashMetrics>({ totalSwiped: 0, commissionToday: 0, pendingCollections: 0, transactionsToday: 0 })
  const [recentTxns, setRecentTxns] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  // Quick report states
  const [loadingPL, setLoadingPL] = useState(false)
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [loadingCustomer, setLoadingCustomer] = useState(false)
  const [showCommissionModal, setShowCommissionModal] = useState(false)
  const [loadingCommission, setLoadingCommission] = useState(false)

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

  // ── Export: Daily P&L ──────────────────────────────────────────────────────

  const exportDailyPL = async () => {
    setLoadingPL(true)
    try {
      const today = todayStr()
      const sb = createClient()
      const { data: txns } = await sb.from('transactions').select('*').eq('date', today).order('sr_no', { ascending: true })
      const rows = (txns || []) as Transaction[]

      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      wb.creator = 'SwipeSaaS'
      const ws = wb.addWorksheet('Daily P&L')
      ws.columns = [
        { key: 'sr_no', width: 6 },
        { key: 'customer_name', width: 22 },
        { key: 'bank_card', width: 16 },
        { key: 'account_name', width: 18 },
        { key: 'total_amount', width: 14 },
        { key: 'paid_amount', width: 14 },
        { key: 'swap_amount', width: 14 },
        { key: 'commission', width: 14 },
        { key: 'remarks', width: 12 },
      ]

      // Title
      ws.mergeCells('A1:I1')
      const titleCell = ws.getCell('A1')
      titleCell.value = `Daily P&L Report — ${today}`
      titleCell.font = { bold: true, size: 13 }
      titleCell.alignment = { horizontal: 'center' }
      ws.getRow(1).height = 22

      // Header row
      const headers = ['SR', 'Customer', 'Card', 'Account', 'Total Amount', 'Paid Amount', 'Swap Amount', 'Commission', 'Status']
      const hRow = ws.addRow(headers)
      hRow.eachCell((cell, i) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
        cell.font = { bold: true, size: 10 }
        cell.alignment = { vertical: 'middle', horizontal: i <= 2 ? 'left' : 'right' }
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
      })
      ws.getRow(2).height = 18

      // Data rows
      rows.forEach(t => {
        const commission = (t.swap_amount || 0) - (t.paid_amount || 0)
        const row = ws.addRow([
          t.sr_no, t.customer_name, t.bank_card, t.account_name,
          t.total_amount, t.paid_amount, t.swap_amount, commission, t.remarks,
        ])
        row.eachCell((cell, i) => {
          cell.alignment = { horizontal: i <= 2 ? 'left' : 'right' }
          cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
          if (i >= 5 && i <= 8) cell.numFmt = '₹#,##0'
        })
        row.height = 16
      })

      // Totals row
      const totRow = ws.addRow([
        '', 'TOTAL', '', '',
        rows.reduce((s, t) => s + (t.total_amount || 0), 0),
        rows.reduce((s, t) => s + (t.paid_amount || 0), 0),
        rows.reduce((s, t) => s + (t.swap_amount || 0), 0),
        rows.reduce((s, t) => s + ((t.swap_amount || 0) - (t.paid_amount || 0)), 0),
        '',
      ])
      totRow.eachCell((cell, i) => {
        cell.font = { bold: true }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFf3f4f6' } }
        cell.alignment = { horizontal: i <= 2 ? 'left' : 'right' }
        cell.border = { top: { style: 'thin' }, bottom: { style: 'double' }, left: { style: 'thin' }, right: { style: 'thin' } }
        if (i >= 5 && i <= 8) cell.numFmt = '₹#,##0'
      })

      // Summary block
      const paidCount = rows.filter(t => t.remarks === 'Paid').length
      const unpaidCount = rows.filter(t => t.remarks !== 'Paid').length
      ws.addRow([])
      const s1 = ws.addRow(['', 'Summary', '', '', '', '', '', '', ''])
      s1.getCell(2).font = { bold: true, size: 11 }
      ws.addRow(['', 'Total Transactions', '', rows.length])
      ws.addRow(['', 'Paid Transactions', '', paidCount])
      ws.addRow(['', 'Unpaid / Pending', '', unpaidCount])
      ws.addRow(['', 'Total Volume', '', rows.reduce((s, t) => s + (t.total_amount || 0), 0)]).getCell(4).numFmt = '₹#,##0'
      ws.addRow(['', 'Total Commission', '', rows.reduce((s, t) => s + ((t.swap_amount || 0) - (t.paid_amount || 0)), 0)]).getCell(4).numFmt = '₹#,##0'

      const buf = await wb.xlsx.writeBuffer()
      downloadBlob(buf, `Daily_PL_${today}.xlsx`)
    } catch (err) {
      console.error('Daily P&L export failed:', err)
      alert('Export failed. Please try again.')
    } finally {
      setLoadingPL(false)
    }
  }

  // ── Export: Customer Statement ─────────────────────────────────────────────

  const exportCustomerStatement = async (customerId: string, customerName: string, from: string, to: string) => {
    setLoadingCustomer(true)
    try {
      const sb = createClient()

      // Fetch customer + cards in parallel, resolve transactions with id→name fallback
      const [{ data: custData }, { data: cards }] = await Promise.all([
        sb.from('customers').select('*').eq('id', customerId).single(),
        sb.from('cards').select('*').eq('customer_id', customerId),
      ])

      // Try by customer_id first; fall back to ilike name search
      let rows: Transaction[] = []
      const { data: byId } = await sb
        .from('transactions').select('*')
        .eq('customer_id', customerId)
        .gte('date', from).lte('date', to)
        .order('sr_no', { ascending: true })

      if (byId && byId.length > 0) {
        rows = byId as Transaction[]
      } else {
        const { data: byName } = await sb
          .from('transactions').select('*')
          .ilike('customer_name', `%${customerName}%`)
          .gte('date', from).lte('date', to)
          .order('sr_no', { ascending: true })
        rows = (byName || []) as Transaction[]
      }

      console.log('[Customer Statement] txns found:', rows.length, 'for', customerName, `(${from} → ${to})`)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cust = custData as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cardList = (cards || []) as any[]

      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      wb.creator = 'SwipeSaaS'
      const ws = wb.addWorksheet('Customer Statement')
      ws.columns = [
        { width: 8 }, { width: 14 }, { width: 16 }, { width: 22 },
        { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 12 },
      ]

      const border = { top: { style: 'thin' as const }, bottom: { style: 'thin' as const }, left: { style: 'thin' as const }, right: { style: 'thin' as const } }

      // Title
      ws.mergeCells('A1:I1')
      const t1 = ws.getCell('A1')
      t1.value = `Customer Statement — ${customerName}`
      t1.font = { bold: true, size: 13, name: 'Calibri' }
      t1.alignment = { horizontal: 'center' }
      ws.getRow(1).height = 22

      ws.mergeCells('A2:I2')
      const t2 = ws.getCell('A2')
      t2.value = `Period: ${from} to ${to}`
      t2.font = { size: 10, color: { argb: 'FF6b7280' }, name: 'Calibri' }
      t2.alignment = { horizontal: 'center' }

      // Customer info block
      ws.addRow([])
      ws.addRow(['', 'Customer Details']).getCell(2).font = { bold: true, size: 11, name: 'Calibri' }
      if (cust) {
        ws.addRow(['', 'Name:', '', cust.name || ''])
        ws.addRow(['', 'Phone:', '', cust.phone || ''])
        ws.addRow(['', 'Outstanding Balance:', '', cust.outstanding_balance || 0]).getCell(4).numFmt = '₹#,##0'
      }

      // Cards section
      if (cardList.length > 0) {
        ws.addRow([])
        ws.addRow(['', 'Cards on File']).getCell(2).font = { bold: true, size: 11, name: 'Calibri' }
        const cHdr = ws.addRow(['', 'Bank', 'Due Date', 'Card Type'])
        cHdr.eachCell((cell, i) => {
          if (i < 2) return
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
          cell.font = { bold: true, size: 10, name: 'Calibri' }
          cell.border = border
        })
        cardList.forEach(card => {
          const row = ws.addRow(['', card.bank_name || '', card.due_date || '', card.card_type || ''])
          row.eachCell((cell, i) => {
            if (i < 2) return
            cell.font = { name: 'Calibri', size: 11 }
            cell.border = border
          })
        })
      }

      // Transaction history
      ws.addRow([])
      ws.addRow(['', 'Transaction History']).getCell(2).font = { bold: true, size: 11, name: 'Calibri' }
      const hRow = ws.addRow(['SR', 'DATE', 'BANK/CARD', 'ACCOUNT', 'TOTAL', 'PAID', 'SWAP', 'COMMISSION', 'STATUS'])
      hRow.eachCell((cell, i) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
        cell.font = { bold: true, size: 10, name: 'Calibri' }
        cell.alignment = { horizontal: i <= 2 ? 'left' : 'center' }
        cell.border = border
      })

      rows.forEach(t => {
        const d = new Date(t.date)
        const dateStr = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
        const comm = (Number(t.swap_amount) || 0) - (Number(t.paid_amount) || 0)
        const row = ws.addRow([
          t.sr_no || '',
          dateStr,
          t.bank_card || '',
          t.account_name || '',
          Number(t.total_amount) || 0,
          Number(t.paid_amount) || 0,
          Number(t.swap_amount) || 0,
          comm,
          t.remarks || '',
        ])
        row.eachCell({ includeEmpty: true }, (cell, i) => {
          cell.font = { name: 'Calibri', size: 11 }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
          cell.border = border
          if (i >= 5 && i <= 8) {
            cell.numFmt = '#,##0'
            cell.alignment = { horizontal: 'right' }
          }
        })
      })

      // Totals
      const totRow = ws.addRow([
        '', 'TOTAL', '', '',
        rows.reduce((s, t) => s + (Number(t.total_amount) || 0), 0),
        rows.reduce((s, t) => s + (Number(t.paid_amount) || 0), 0),
        rows.reduce((s, t) => s + (Number(t.swap_amount) || 0), 0),
        rows.reduce((s, t) => s + ((Number(t.swap_amount) || 0) - (Number(t.paid_amount) || 0)), 0),
        '',
      ])
      totRow.eachCell({ includeEmpty: true }, (cell, i) => {
        cell.font = { bold: true, name: 'Calibri', size: 11 }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFf3f4f6' } }
        cell.alignment = { horizontal: i <= 2 ? 'left' : 'right' }
        cell.border = { top: { style: 'thin' }, bottom: { style: 'double' }, left: { style: 'thin' }, right: { style: 'thin' } }
        if (i >= 5 && i <= 8) cell.numFmt = '₹#,##0'
      })

      const buf = await wb.xlsx.writeBuffer()
      downloadBlob(buf, `Statement_${customerName.replace(/\s+/g, '_')}_${from}_to_${to}.xlsx`)
      setShowCustomerModal(false)
    } catch (err) {
      console.error('Customer statement export failed:', err)
      alert('Export failed. Please try again.')
    } finally {
      setLoadingCustomer(false)
    }
  }

  // ── Export: Commission Summary ─────────────────────────────────────────────

  const exportCommissionSummary = async (from: string, to: string) => {
    setLoadingCommission(true)
    try {
      const sb = createClient()
      const { data: txns } = await sb.from('transactions').select('*').gte('date', from).lte('date', to).order('date', { ascending: true })
      const rows = (txns || []) as Transaction[]

      // Group by customer
      const byCustomer = new Map<string, { name: string; txns: number; total: number; swap: number; paid: number; commission: number }>()
      rows.forEach(t => {
        const key = t.customer_name || 'Unknown'
        const existing = byCustomer.get(key) || { name: key, txns: 0, total: 0, swap: 0, paid: 0, commission: 0 }
        const comm = (t.swap_amount || 0) - (t.paid_amount || 0)
        byCustomer.set(key, {
          name: key,
          txns: existing.txns + 1,
          total: existing.total + (t.total_amount || 0),
          swap: existing.swap + (t.swap_amount || 0),
          paid: existing.paid + (t.paid_amount || 0),
          commission: existing.commission + comm,
        })
      })
      const customerRows = Array.from(byCustomer.values()).sort((a, b) => b.commission - a.commission)

      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      wb.creator = 'SwipeSaaS'
      const ws = wb.addWorksheet('Commission Summary')
      ws.columns = [
        { key: 'a', width: 6 }, { key: 'b', width: 24 }, { key: 'c', width: 12 },
        { key: 'd', width: 16 }, { key: 'e', width: 16 }, { key: 'f', width: 16 }, { key: 'g', width: 16 },
      ]

      // Title
      ws.mergeCells('A1:G1')
      const t1 = ws.getCell('A1')
      t1.value = `Commission Summary — ${from} to ${to}`
      t1.font = { bold: true, size: 13 }
      t1.alignment = { horizontal: 'center' }
      ws.getRow(1).height = 22

      // Period info
      ws.mergeCells('A2:G2')
      const t2 = ws.getCell('A2')
      t2.value = `Total Transactions: ${rows.length}  |  Total Volume: ₹${rows.reduce((s, t) => s + (t.total_amount || 0), 0).toLocaleString('en-IN')}  |  Total Commission: ₹${rows.reduce((s, t) => s + ((t.swap_amount || 0) - (t.paid_amount || 0)), 0).toLocaleString('en-IN')}`
      t2.font = { size: 10, color: { argb: 'FF374151' } }
      t2.alignment = { horizontal: 'center' }

      ws.addRow([])

      // Customer breakdown header
      ws.addRow(['', 'Customer-wise Commission Breakdown']).getCell(2).font = { bold: true, size: 11 }
      const hRow = ws.addRow(['#', 'Customer', 'Transactions', 'Total Amount', 'Swap Amount', 'Paid Amount', 'Commission'])
      hRow.eachCell((cell, i) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
        cell.font = { bold: true, size: 10 }
        cell.alignment = { horizontal: i <= 2 ? 'left' : 'right' }
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
      })

      customerRows.forEach((c, i) => {
        const row = ws.addRow([i + 1, c.name, c.txns, c.total, c.swap, c.paid, c.commission])
        row.eachCell((cell, j) => {
          cell.alignment = { horizontal: j <= 2 ? 'left' : 'right' }
          cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
          if (j >= 4) cell.numFmt = '₹#,##0'
        })
      })

      // Totals
      const totRow = ws.addRow([
        '', 'TOTAL',
        customerRows.reduce((s, c) => s + c.txns, 0),
        customerRows.reduce((s, c) => s + c.total, 0),
        customerRows.reduce((s, c) => s + c.swap, 0),
        customerRows.reduce((s, c) => s + c.paid, 0),
        customerRows.reduce((s, c) => s + c.commission, 0),
      ])
      totRow.eachCell((cell, i) => {
        cell.font = { bold: true }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFf3f4f6' } }
        cell.alignment = { horizontal: i <= 2 ? 'left' : 'right' }
        cell.border = { top: { style: 'thin' }, bottom: { style: 'double' }, left: { style: 'thin' }, right: { style: 'thin' } }
        if (i >= 4) cell.numFmt = '₹#,##0'
      })

      // Account breakdown
      ws.addRow([])
      ws.addRow(['', 'Account-wise Breakdown']).getCell(2).font = { bold: true, size: 11 }
      const byAccount = new Map<string, { total: number; commission: number; txns: number }>()
      rows.forEach(t => {
        const key = t.account_name || 'Unknown'
        const ex = byAccount.get(key) || { total: 0, commission: 0, txns: 0 }
        byAccount.set(key, {
          total: ex.total + (t.total_amount || 0),
          commission: ex.commission + ((t.swap_amount || 0) - (t.paid_amount || 0)),
          txns: ex.txns + 1,
        })
      })
      const aHdr = ws.addRow(['', 'Account', 'Transactions', 'Total Volume', '', '', 'Commission'])
      aHdr.eachCell((cell, i) => {
        if (i === 1 || i === 5 || i === 6) return
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
        cell.font = { bold: true, size: 10 }
        cell.alignment = { horizontal: i <= 2 ? 'left' : 'right' }
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
      })
      Array.from(byAccount.entries()).forEach(([name, vals]) => {
        const row = ws.addRow(['', name, vals.txns, vals.total, '', '', vals.commission])
        row.eachCell((cell, i) => {
          if (i === 1 || i === 5 || i === 6) return
          cell.alignment = { horizontal: i <= 2 ? 'left' : 'right' }
          cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
          if (i === 4 || i === 7) cell.numFmt = '₹#,##0'
        })
      })

      const buf = await wb.xlsx.writeBuffer()
      downloadBlob(buf, `Commission_Summary_${from}_to_${to}.xlsx`)
      setShowCommissionModal(false)
    } catch (err) {
      console.error('Commission summary export failed:', err)
      alert('Export failed. Please try again.')
    } finally {
      setLoadingCommission(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {showCustomerModal && (
        <CustomerStatementModal
          onClose={() => setShowCustomerModal(false)}
          onGenerate={exportCustomerStatement}
          loading={loadingCustomer}
        />
      )}
      {showCommissionModal && (
        <CommissionSummaryModal
          onClose={() => setShowCommissionModal(false)}
          onGenerate={exportCommissionSummary}
          loading={loadingCommission}
        />
      )}

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
            {/* Daily P&L */}
            <button
              onClick={exportDailyPL}
              disabled={loadingPL}
              className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm text-[#1a1a1a] hover:bg-gray-50 disabled:opacity-60"
              style={{ borderColor: '#e5e7eb' }}
            >
              {loadingPL ? <Loader2 size={14} color="#6b7280" className="animate-spin" /> : <Download size={14} color="#6b7280" />}
              {loadingPL ? 'Generating...' : 'Export Daily P&L Report'}
            </button>
            {/* Customer Statement */}
            <button
              onClick={() => setShowCustomerModal(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm text-[#1a1a1a] hover:bg-gray-50"
              style={{ borderColor: '#e5e7eb' }}
            >
              <Download size={14} color="#6b7280" />
              Export Customer Statement
            </button>
            {/* Commission Summary */}
            <button
              onClick={() => setShowCommissionModal(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm text-[#1a1a1a] hover:bg-gray-50"
              style={{ borderColor: '#e5e7eb' }}
            >
              <Download size={14} color="#6b7280" />
              Export Commission Summary
            </button>
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
