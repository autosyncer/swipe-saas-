'use client'

import { useState, useCallback, useRef } from 'react'
import {
  TrendingUp, User, Download, BarChart2, Users, MonitorSmartphone,
  Wallet, DollarSign, AlertCircle, CalendarDays, X, Search, Loader2, CheckCircle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomerOption { id: string; name: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const todayStr = () => new Date().toISOString().split('T')[0]
const firstOfMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
const currentYear = new Date().getFullYear()

const border = {
  top: { style: 'thin' as const }, bottom: { style: 'thin' as const },
  left: { style: 'thin' as const }, right: { style: 'thin' as const },
}

async function downloadExcel(workbook: import('exceljs').Workbook, filename: string) {
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function titleRow(ws: import('exceljs').Worksheet, cols: number, text: string, bg = 'FF1a1a1a') {
  ws.mergeCells(1, 1, 1, cols)
  const c = ws.getCell('A1')
  c.value = text
  c.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' }, name: 'Calibri' }
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
  c.alignment = { horizontal: 'center' }
  ws.getRow(1).height = 22
  ws.addRow([])
}

function headerRow(ws: import('exceljs').Worksheet, headers: string[]) {
  const row = ws.addRow(headers)
  row.font = { bold: true, name: 'Calibri' }
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
  row.eachCell(cell => {
    cell.border = border
    cell.alignment = { horizontal: 'center' }
  })
  row.height = 18
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function DateRangeModal({ title, onClose, onGenerate, loading }: {
  title: string
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
          <span style={{ fontWeight: 700, fontSize: 15, color: '#111' }}>{title}</span>
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
          <button disabled={loading} onClick={() => onGenerate(from, to)}
            style={{ background: '#3ECF8E', color: 'white', border: 'none', padding: '8px 18px', borderRadius: 6, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, opacity: loading ? 0.7 : 1 }}>
            {loading ? <><Loader2 size={13} className="animate-spin" /> Generating...</> : 'Generate Excel'}
          </button>
        </div>
      </div>
    </div>
  )
}

function YearModal({ onClose, onGenerate, loading }: {
  onClose: () => void
  onGenerate: (year: number) => void
  loading: boolean
}) {
  const [year, setYear] = useState(currentYear)
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 300, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #e5e7eb' }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#111' }}>Monthly Summary</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color="#6b7280" /></button>
        </div>
        <div style={{ padding: '20px' }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Year</label>
          <input type="number" value={year} min={2020} max={currentYear + 1}
            onChange={e => setYear(Number(e.target.value))}
            style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 6, padding: '8px 10px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ padding: '0 20px 20px', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ border: '1px solid #e5e7eb', background: 'white', padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13, color: '#374151' }}>Cancel</button>
          <button disabled={loading} onClick={() => onGenerate(year)}
            style={{ background: '#3ECF8E', color: 'white', border: 'none', padding: '8px 18px', borderRadius: 6, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, opacity: loading ? 0.7 : 1 }}>
            {loading ? <><Loader2 size={13} className="animate-spin" /> Generating...</> : 'Generate Excel'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CustomerModal({ title, onClose, onGenerate, loading }: {
  title: string
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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const doSearch = useCallback(async (q: string) => {
    const sb = supabase
    const query = sb.from('customers').select('id, name').order('name').limit(20)
    const { data } = q.trim() ? await query.ilike('name', `%${q}%`) : await query
    setCustomers((data as CustomerOption[]) || [])
    setShowDropdown(true)
  }, [])

  const onSearchChange = (v: string) => {
    setSearch(v); setSelected(null)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => doSearch(v), 200)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #e5e7eb' }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#111' }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color="#6b7280" /></button>
        </div>
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Customer</label>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}><Search size={14} color="#9ca3af" /></div>
              <input value={selected ? selected.name : search} onChange={e => onSearchChange(e.target.value)}
                onFocus={() => doSearch(search)} placeholder="Search customer..."
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 6, padding: '8px 12px 8px 32px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
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
          <button disabled={!selected || loading} onClick={() => selected && onGenerate(selected.id, selected.name, from, to)}
            style={{ background: selected ? '#3ECF8E' : '#d1d5db', color: 'white', border: 'none', padding: '8px 18px', borderRadius: 6, cursor: selected ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            {loading ? <><Loader2 size={13} className="animate-spin" /> Generating...</> : 'Generate Excel'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ msg }: { msg: string }) {
  return (
    <div style={{ position: 'fixed', bottom: 28, right: 28, zIndex: 99999, background: '#111', color: 'white', borderRadius: 8, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
      <CheckCircle size={15} color="#3ECF8E" /> {msg}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type ModalType =
  | 'daily_pl' | 'customer_statement' | 'customer_profit'
  | 'bank_volume' | 'agent_perf' | 'commission_summary'
  | 'machine_report' | 'monthly_summary'
  | null

export default function ReportsPage() {
  const [activeModal, setActiveModal] = useState<ModalType>(null)
  const [loadingReport, setLoadingReport] = useState<ModalType>(null)
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const wrap = async (key: ModalType, fn: () => Promise<void>) => {
    setLoadingReport(key)
    try {
      await fn()
      setActiveModal(null)
      showToast('Report downloaded successfully!')
    } catch (err) {
      console.error(`[${key}] export error:`, err)
      alert('Export failed. Please try again.')
    } finally {
      setLoadingReport(null)
    }
  }

  // ── Report 1: Daily P&L ────────────────────────────────────────────────────

  const exportDailyPL = () => wrap('daily_pl', async () => {
    const today = todayStr()
    const sb = supabase
    const { data } = await sb.from('transactions').select('*').eq('date', today).order('sr_no', { ascending: true })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (data || []) as any[]

    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    wb.creator = 'SwipeSaaS'
    const ws = wb.addWorksheet('Daily P&L')
    ws.columns = [
      { width: 6 }, { width: 22 }, { width: 16 }, { width: 18 },
      { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 12 },
    ]
    titleRow(ws, 9, `DAILY P&L REPORT — ${today}`)
    headerRow(ws, ['SR', 'CUSTOMER', 'CARD', 'ACCOUNT', 'TOTAL', 'PAID', 'SWAP', 'COMMISSION', 'STATUS'])

    rows.forEach(t => {
      const comm = (Number(t.swap_amount) || 0) - (Number(t.paid_amount) || 0)
      const row = ws.addRow([t.sr_no, t.customer_name, t.bank_card, t.account_name,
        Number(t.total_amount) || 0, Number(t.paid_amount) || 0, Number(t.swap_amount) || 0, comm, t.remarks])
      row.eachCell({ includeEmpty: true }, (cell, i) => {
        cell.font = { name: 'Calibri', size: 11 }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
        cell.border = border
        if (i >= 5 && i <= 8) { cell.numFmt = '#,##0'; cell.alignment = { horizontal: 'right' } }
      })
    })

    const totRow = ws.addRow(['', 'TOTAL', '', '',
      rows.reduce((s, t) => s + (Number(t.total_amount) || 0), 0),
      rows.reduce((s, t) => s + (Number(t.paid_amount) || 0), 0),
      rows.reduce((s, t) => s + (Number(t.swap_amount) || 0), 0),
      rows.reduce((s, t) => s + ((Number(t.swap_amount) || 0) - (Number(t.paid_amount) || 0)), 0), ''])
    totRow.font = { bold: true, name: 'Calibri' }
    totRow.eachCell({ includeEmpty: true }, (cell, i) => {
      cell.border = border
      if (i >= 5 && i <= 8) { cell.numFmt = '#,##0'; cell.alignment = { horizontal: 'right' } }
    })
    await downloadExcel(wb, `DailyPL_${today}.xlsx`)
  })

  // ── Report 2: Customer Statement ───────────────────────────────────────────

  const exportCustomerStatement = (customerId: string, customerName: string, from: string, to: string) =>
    wrap('customer_statement', async () => {
      const sb = supabase
      const [{ data: custData }, { data: cards }] = await Promise.all([
        sb.from('customers').select('*').eq('id', customerId).single(),
        sb.from('cards').select('*').eq('customer_id', customerId),
      ])

      let rows: any[] = [] // eslint-disable-line @typescript-eslint/no-explicit-any
      const { data: byId } = await sb.from('transactions').select('*')
        .eq('customer_id', customerId).gte('date', from).lte('date', to).order('sr_no', { ascending: true })
      if (byId && byId.length > 0) {
        rows = byId
      } else {
        const { data: byName } = await sb.from('transactions').select('*')
          .ilike('customer_name', `%${customerName}%`).gte('date', from).lte('date', to).order('sr_no', { ascending: true })
        rows = byName || []
      }
      console.log('[Customer Statement] found', rows.length, 'txns for', customerName)

      const cust = custData as any // eslint-disable-line @typescript-eslint/no-explicit-any
      const cardList = (cards || []) as any[] // eslint-disable-line @typescript-eslint/no-explicit-any

      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      wb.creator = 'SwipeSaaS'
      const ws = wb.addWorksheet('Customer Statement')
      ws.columns = [
        { width: 8 }, { width: 14 }, { width: 16 }, { width: 22 },
        { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 12 },
      ]
      titleRow(ws, 9, `CUSTOMER STATEMENT — ${customerName} | ${from} to ${to}`)

      if (cust) {
        ws.addRow(['Customer Details']).getCell(1).font = { bold: true, size: 11, name: 'Calibri' }
        ws.addRow(['Name:', cust.name || ''])
        ws.addRow(['Phone:', cust.phone || ''])
        const obRow = ws.addRow(['Outstanding:', cust.outstanding_balance || 0])
        obRow.getCell(2).numFmt = '#,##0'
        ws.addRow([])
      }

      if (cardList.length > 0) {
        ws.addRow(['Cards on File']).getCell(1).font = { bold: true, size: 11, name: 'Calibri' }
        headerRow(ws, ['Bank', 'Due Date', 'Card Type'])
        cardList.forEach(card => {
          const row = ws.addRow([card.bank_name || '', card.due_date || '', card.card_type || ''])
          row.eachCell((cell) => { cell.font = { name: 'Calibri', size: 11 }; cell.border = border })
        })
        ws.addRow([])
      }

      ws.addRow(['Transaction History']).getCell(1).font = { bold: true, size: 11, name: 'Calibri' }
      headerRow(ws, ['SR', 'DATE', 'BANK/CARD', 'ACCOUNT', 'TOTAL', 'PAID', 'SWAP', 'COMMISSION', 'STATUS'])

      rows.forEach(t => {
        const d = new Date(t.date)
        const dateStr = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
        const comm = (Number(t.swap_amount) || 0) - (Number(t.paid_amount) || 0)
        const row = ws.addRow([t.sr_no || '', dateStr, t.bank_card || '', t.account_name || '',
          Number(t.total_amount) || 0, Number(t.paid_amount) || 0, Number(t.swap_amount) || 0, comm, t.remarks || ''])
        row.eachCell({ includeEmpty: true }, (cell, i) => {
          cell.font = { name: 'Calibri', size: 11 }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
          cell.border = border
          if (i >= 5 && i <= 8) { cell.numFmt = '#,##0'; cell.alignment = { horizontal: 'right' } }
        })
      })

      const totRow = ws.addRow(['', 'TOTAL', '', '',
        rows.reduce((s, t) => s + (Number(t.total_amount) || 0), 0),
        rows.reduce((s, t) => s + (Number(t.paid_amount) || 0), 0),
        rows.reduce((s, t) => s + (Number(t.swap_amount) || 0), 0),
        rows.reduce((s, t) => s + ((Number(t.swap_amount) || 0) - (Number(t.paid_amount) || 0)), 0), ''])
      totRow.font = { bold: true, name: 'Calibri' }
      totRow.eachCell({ includeEmpty: true }, (cell, i) => {
        cell.border = { ...border, bottom: { style: 'double' } }
        if (i >= 5 && i <= 8) { cell.numFmt = '#,##0'; cell.alignment = { horizontal: 'right' } }
      })
      await downloadExcel(wb, `Statement_${customerName.replace(/\s+/g, '_')}_${from}_${to}.xlsx`)
    })

  // ── Report 3: Customer-wise Profit ────────────────────────────────────────

  const exportCustomerWiseProfit = (from: string, to: string) => wrap('customer_profit', async () => {
    const sb = supabase
    const { data } = await sb.from('transactions').select('*').gte('date', from).lte('date', to)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byCustomer: Record<string, any> = {}
    ;(data || []).forEach((t: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const name = t.customer_name || 'Unknown'
      if (!byCustomer[name]) byCustomer[name] = { name, txns: 0, total: 0, paid: 0, commission: 0, outstanding: 0, swap: 0 }
      byCustomer[name].txns++
      byCustomer[name].total += Number(t.total_amount) || 0
      byCustomer[name].paid += Number(t.paid_amount) || 0
      byCustomer[name].commission += Number(t.commission_amount) || 0
      byCustomer[name].outstanding += (Number(t.total_amount) - Number(t.paid_amount)) || 0
      byCustomer[name].swap += Number(t.swap_amount) || 0
    })

    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook(); wb.creator = 'SwipeSaaS'
    const ws = wb.addWorksheet('Customer-wise Profit')
    ws.columns = [{ width: 22 }, { width: 14 }, { width: 16 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 14 }]
    titleRow(ws, 7, `CUSTOMER-WISE PROFIT REPORT — ${from} to ${to}`)
    headerRow(ws, ['CUSTOMER', 'TRANSACTIONS', 'TOTAL SWIPED', 'COMMISSION EARNED', 'OUTSTANDING', 'SWAP TOTAL', 'AVG COMM %'])

    const vals = Object.values(byCustomer).sort((a: any, b: any) => b.commission - a.commission) // eslint-disable-line @typescript-eslint/no-explicit-any
    vals.forEach((c: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const avgPct = c.total > 0 ? ((c.commission / c.total) * 100).toFixed(2) + '%' : '0%'
      const row = ws.addRow([c.name, c.txns, c.total, c.commission, c.outstanding, c.swap, avgPct])
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cell.border = border; cell.font = { name: 'Calibri', size: 11 }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
        if (col >= 3 && col <= 6) { cell.numFmt = '#,##0'; cell.alignment = { horizontal: 'right' } }
      })
    })
    const totRow = ws.addRow(['TOTAL', vals.reduce((s: number, c: any) => s + c.txns, 0), vals.reduce((s: number, c: any) => s + c.total, 0), vals.reduce((s: number, c: any) => s + c.commission, 0), vals.reduce((s: number, c: any) => s + c.outstanding, 0), vals.reduce((s: number, c: any) => s + c.swap, 0), '']) // eslint-disable-line @typescript-eslint/no-explicit-any
    totRow.font = { bold: true, name: 'Calibri' }
    totRow.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.border = border
      if (col >= 3 && col <= 6) { cell.numFmt = '#,##0'; cell.alignment = { horizontal: 'right' } }
    })
    await downloadExcel(wb, `CustomerWiseProfit_${from}_${to}.xlsx`)
  })

  // ── Report 4: Bank-wise Volume ────────────────────────────────────────────

  const exportBankWiseVolume = (from: string, to: string) => wrap('bank_volume', async () => {
    const sb = supabase
    const { data } = await sb.from('transactions').select('*').gte('date', from).lte('date', to)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byAccount: Record<string, any> = {}
    ;(data || []).forEach((t: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const accounts = (t.account_name || 'Unknown').split(/[+,]/).map((a: string) => a.trim())
      accounts.forEach((acc: string) => {
        if (!byAccount[acc]) byAccount[acc] = { account: acc, txns: 0, total: 0, commission: 0 }
        byAccount[acc].txns++
        byAccount[acc].total += Number(t.total_amount) || 0
        byAccount[acc].commission += Number(t.commission_amount) || 0
      })
    })

    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook(); wb.creator = 'SwipeSaaS'
    const ws = wb.addWorksheet('Bank-wise Volume')
    ws.columns = [{ width: 20 }, { width: 14 }, { width: 16 }, { width: 16 }, { width: 12 }]
    titleRow(ws, 5, `BANK-WISE VOLUME REPORT — ${from} to ${to}`)
    headerRow(ws, ['ACCOUNT/BANK', 'TRANSACTIONS', 'TOTAL VOLUME', 'COMMISSION', '% SHARE'])

    const totalVol = Object.values(byAccount).reduce((s: number, a: any) => s + a.total, 0) // eslint-disable-line @typescript-eslint/no-explicit-any
    Object.values(byAccount).sort((a: any, b: any) => b.total - a.total).forEach((a: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const pct = totalVol > 0 ? ((a.total / totalVol) * 100).toFixed(1) + '%' : '0%'
      const row = ws.addRow([a.account, a.txns, a.total, a.commission, pct])
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cell.border = border; cell.font = { name: 'Calibri', size: 11 }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
        if (col >= 3 && col <= 4) { cell.numFmt = '#,##0'; cell.alignment = { horizontal: 'right' } }
      })
    })
    await downloadExcel(wb, `BankWiseVolume_${from}_${to}.xlsx`)
  })

  // ── Report 5: Agent Performance ───────────────────────────────────────────

  const exportAgentPerformance = (from: string, to: string) => wrap('agent_perf', async () => {
    const sb = supabase
    const { data } = await sb.from('cc_sheet').select('*').gte('date', from).lte('date', to)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byAgent: Record<string, any> = {}
    ;(data || []).forEach((r: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const agent = r.agent_code || 'Unknown'
      if (!byAgent[agent]) byAgent[agent] = { agent, machine: r.machine_name, txns: 0, total: 0, ourComm: 0, bankComm: 0 }
      byAgent[agent].txns++
      byAgent[agent].total += Number(r.swipe_amount) || 0
      byAgent[agent].ourComm += Number(r.our_commission) || 0
      byAgent[agent].bankComm += Number(r.bank_commission) || 0
    })

    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook(); wb.creator = 'SwipeSaaS'
    const ws = wb.addWorksheet('Agent Performance')
    ws.columns = [{ width: 14 }, { width: 20 }, { width: 14 }, { width: 16 }, { width: 18 }, { width: 18 }]
    titleRow(ws, 6, `AGENT PERFORMANCE REPORT — ${from} to ${to}`)
    headerRow(ws, ['AGENT CODE', 'MACHINE', 'TRANSACTIONS', 'TOTAL SWIPED', 'OUR COMMISSION', 'BANK COMMISSION'])

    Object.values(byAgent).sort((a: any, b: any) => b.total - a.total).forEach((a: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const row = ws.addRow([a.agent, a.machine, a.txns, a.total, a.ourComm, a.bankComm])
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cell.border = border; cell.font = { name: 'Calibri', size: 11 }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
        if (col >= 4) { cell.numFmt = '#,##0'; cell.alignment = { horizontal: 'right' } }
      })
    })
    await downloadExcel(wb, `AgentPerformance_${from}_${to}.xlsx`)
  })

  // ── Report 6: Pending Collections ────────────────────────────────────────

  const exportPendingCollections = () => wrap('daily_pl', async () => {
    const sb = supabase
    const { data } = await sb.from('transactions').select('*')
      .in('remarks', ['PEND', 'UNPAID', 'Pending', 'Unpaid', 'pending', 'unpaid'])
      .order('date', { ascending: true })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (data || []) as any[]

    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook(); wb.creator = 'SwipeSaaS'
    const ws = wb.addWorksheet('Pending Collections')
    ws.columns = [{ width: 8 }, { width: 14 }, { width: 22 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 10 }]
    titleRow(ws, 7, `PENDING COLLECTIONS — As of ${new Date().toLocaleDateString('en-IN')}`, 'FFef4444')
    headerRow(ws, ['SR NO', 'DATE', 'CUSTOMER', 'BANK CARD', 'TOTAL', 'OUTSTANDING', 'STATUS'])

    rows.forEach(t => {
      const d = new Date(t.date)
      const dateStr = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
      const outstanding = (Number(t.total_amount) - Number(t.paid_amount)) || 0
      const row = ws.addRow([t.sr_no, dateStr, t.customer_name, t.bank_card, Number(t.total_amount) || 0, outstanding, t.remarks])
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cell.border = border; cell.font = { name: 'Calibri', size: 11 }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFfee2e2' } }
        if (col === 5 || col === 6) { cell.numFmt = '#,##0'; cell.alignment = { horizontal: 'right' } }
      })
    })

    const totRow = ws.addRow(['', 'TOTAL OUTSTANDING', '', '', '', rows.reduce((s, t) => s + ((Number(t.total_amount) - Number(t.paid_amount)) || 0), 0), ''])
    totRow.font = { bold: true, name: 'Calibri' }
    totRow.getCell(6).numFmt = '#,##0'
    totRow.getCell(6).alignment = { horizontal: 'right' }
    totRow.eachCell({ includeEmpty: true }, cell => { cell.border = border })
    await downloadExcel(wb, `PendingCollections_${todayStr()}.xlsx`)
  })

  // ── Report 7: Swipe Machine Report ───────────────────────────────────────

  const exportSwipeMachineReport = (from: string, to: string) => wrap('machine_report', async () => {
    const sb = supabase
    const { data } = await sb.from('cc_sheet').select('*').gte('date', from).lte('date', to)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byMachine: Record<string, any> = {}
    ;(data || []).forEach((r: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const machine = r.machine_name || 'Unknown'
      if (!byMachine[machine]) byMachine[machine] = { machine, tid: r.tid, agent: r.agent_code, txns: 0, total: 0, ourComm: 0, bankComm: 0 }
      byMachine[machine].txns++
      byMachine[machine].total += Number(r.swipe_amount) || 0
      byMachine[machine].ourComm += Number(r.our_commission) || 0
      byMachine[machine].bankComm += Number(r.bank_commission) || 0
    })

    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook(); wb.creator = 'SwipeSaaS'
    const ws = wb.addWorksheet('Machine Report')
    ws.columns = [{ width: 20 }, { width: 14 }, { width: 12 }, { width: 14 }, { width: 16 }, { width: 18 }, { width: 18 }]
    titleRow(ws, 7, `SWIPE MACHINE REPORT — ${from} to ${to}`)
    headerRow(ws, ['MACHINE NAME', 'TID', 'AGENT CODE', 'TRANSACTIONS', 'TOTAL SWIPED', 'OUR COMMISSION', 'BANK COMMISSION'])

    Object.values(byMachine).sort((a: any, b: any) => b.total - a.total).forEach((m: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const row = ws.addRow([m.machine, m.tid, m.agent, m.txns, m.total, m.ourComm, m.bankComm])
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cell.border = border; cell.font = { name: 'Calibri', size: 11 }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
        if (col >= 5) { cell.numFmt = '#,##0'; cell.alignment = { horizontal: 'right' } }
      })
    })
    await downloadExcel(wb, `SwipeMachineReport_${from}_${to}.xlsx`)
  })

  // ── Report 8: Monthly Summary ─────────────────────────────────────────────

  const exportMonthlySummary = (year: number) => wrap('monthly_summary', async () => {
    const sb = supabase
    const { data } = await sb.from('transactions').select('*')
      .gte('date', `${year}-01-01`).lte('date', `${year}-12-31`)
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byMonth: Record<string, any> = {}
    ;(data || []).forEach((t: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const m = monthNames[new Date(t.date).getMonth()]
      if (!byMonth[m]) byMonth[m] = { month: m, txns: 0, total: 0, commission: 0, paid: 0, outstanding: 0 }
      byMonth[m].txns++
      byMonth[m].total += Number(t.total_amount) || 0
      byMonth[m].commission += Number(t.commission_amount) || 0
      byMonth[m].paid += Number(t.paid_amount) || 0
      byMonth[m].outstanding += (Number(t.total_amount) - Number(t.paid_amount)) || 0
    })

    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook(); wb.creator = 'SwipeSaaS'
    const ws = wb.addWorksheet('Monthly Summary')
    ws.columns = [{ width: 12 }, { width: 14 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 14 }]
    titleRow(ws, 6, `MONTHLY SUMMARY REPORT — ${year}`)
    headerRow(ws, ['MONTH', 'TRANSACTIONS', 'TOTAL SWIPED', 'COMMISSION', 'AMOUNT PAID', 'OUTSTANDING'])

    monthNames.forEach(m => {
      const d = byMonth[m] || { month: m, txns: 0, total: 0, commission: 0, paid: 0, outstanding: 0 }
      const row = ws.addRow([d.month, d.txns, d.total, d.commission, d.paid, d.outstanding])
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cell.border = border; cell.font = { name: 'Calibri', size: 11 }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: d.txns > 0 ? 'FFFFFFFF' : 'FFf9fafb' } }
        if (col >= 3) { cell.numFmt = '#,##0'; cell.alignment = { horizontal: 'right' } }
      })
    })
    await downloadExcel(wb, `MonthlySummary_${year}.xlsx`)
  })

  // ─── UI ───────────────────────────────────────────────────────────────────

  const isLoading = (key: ModalType) => loadingReport === key

  const featuredReports = [
    {
      icon: TrendingUp,
      title: 'Daily P&L Report',
      desc: 'Generate today\'s profit & loss summary with commission breakdown. No date selection needed.',
      onGenerate: exportDailyPL,
      loading: isLoading('daily_pl'),
    },
    {
      icon: User,
      title: 'Customer Statement',
      desc: 'Per-customer transaction history with outstanding balance and cards on file.',
      onGenerate: () => setActiveModal('customer_statement'),
      loading: isLoading('customer_statement'),
    },
  ]

  const gridReports = [
    { icon: Users, title: 'Customer-wise Profit', desc: 'Net profit per customer after commissions', modal: 'customer_profit' as ModalType },
    { icon: BarChart2, title: 'Bank-wise Volume', desc: 'Transaction volume grouped by bank account', modal: 'bank_volume' as ModalType },
    { icon: MonitorSmartphone, title: 'Agent Performance', desc: 'Swipe counts and volume per field agent', modal: 'agent_perf' as ModalType },
    { icon: AlertCircle, title: 'Pending Collections', desc: 'All outstanding dues — generates immediately', modal: null, directFn: exportPendingCollections },
    { icon: DollarSign, title: 'Commission Summary', desc: 'Total commissions earned by date range', modal: 'commission_summary' as ModalType },
    { icon: MonitorSmartphone, title: 'Swipe Machine Report', desc: 'TID-wise transaction count and volume', modal: 'machine_report' as ModalType },
    { icon: Wallet, title: 'Outstanding Balance', desc: 'Customer-wise pending balance snapshot', modal: 'customer_profit' as ModalType },
    { icon: CalendarDays, title: 'Monthly Summary', desc: 'Month-over-month comparison of key metrics', modal: 'monthly_summary' as ModalType },
  ]

  return (
    <div>
      {toast && <Toast msg={toast} />}

      {/* Modals */}
      {activeModal === 'customer_statement' && (
        <CustomerModal title="Customer Statement" onClose={() => setActiveModal(null)}
          onGenerate={exportCustomerStatement} loading={isLoading('customer_statement')} />
      )}
      {activeModal === 'customer_profit' && (
        <DateRangeModal title="Customer-wise Profit" onClose={() => setActiveModal(null)}
          onGenerate={exportCustomerWiseProfit} loading={isLoading('customer_profit')} />
      )}
      {activeModal === 'bank_volume' && (
        <DateRangeModal title="Bank-wise Volume" onClose={() => setActiveModal(null)}
          onGenerate={exportBankWiseVolume} loading={isLoading('bank_volume')} />
      )}
      {activeModal === 'agent_perf' && (
        <DateRangeModal title="Agent Performance" onClose={() => setActiveModal(null)}
          onGenerate={exportAgentPerformance} loading={isLoading('agent_perf')} />
      )}
      {activeModal === 'commission_summary' && (
        <DateRangeModal title="Commission Summary" onClose={() => setActiveModal(null)}
          onGenerate={(from, to) => wrap('commission_summary', async () => {
            const sb = supabase
            const { data } = await sb.from('transactions').select('*').gte('date', from).lte('date', to)
            const byCustomer: Record<string, any> = {} // eslint-disable-line @typescript-eslint/no-explicit-any
            ;(data || []).forEach((t: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
              const key = t.customer_name || 'Unknown'
              if (!byCustomer[key]) byCustomer[key] = { name: key, txns: 0, total: 0, swap: 0, paid: 0, commission: 0 }
              byCustomer[key].txns++
              byCustomer[key].total += Number(t.total_amount) || 0
              byCustomer[key].swap += Number(t.swap_amount) || 0
              byCustomer[key].paid += Number(t.paid_amount) || 0
              byCustomer[key].commission += (Number(t.swap_amount) - Number(t.paid_amount)) || 0
            })
            const ExcelJS = (await import('exceljs')).default
            const wb = new ExcelJS.Workbook(); wb.creator = 'SwipeSaaS'
            const ws = wb.addWorksheet('Commission Summary')
            ws.columns = [{ width: 24 }, { width: 12 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }]
            titleRow(ws, 6, `COMMISSION SUMMARY — ${from} to ${to}`)
            headerRow(ws, ['CUSTOMER', 'TRANSACTIONS', 'TOTAL AMOUNT', 'SWAP AMOUNT', 'PAID AMOUNT', 'COMMISSION'])
            const vals = Object.values(byCustomer).sort((a: any, b: any) => b.commission - a.commission) // eslint-disable-line @typescript-eslint/no-explicit-any
            vals.forEach((c: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
              const row = ws.addRow([c.name, c.txns, c.total, c.swap, c.paid, c.commission])
              row.eachCell({ includeEmpty: true }, (cell, col) => {
                cell.border = border; cell.font = { name: 'Calibri', size: 11 }
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
                if (col >= 3) { cell.numFmt = '#,##0'; cell.alignment = { horizontal: 'right' } }
              })
            })
            const totRow = ws.addRow(['TOTAL', vals.reduce((s: number, c: any) => s + c.txns, 0), vals.reduce((s: number, c: any) => s + c.total, 0), vals.reduce((s: number, c: any) => s + c.swap, 0), vals.reduce((s: number, c: any) => s + c.paid, 0), vals.reduce((s: number, c: any) => s + c.commission, 0)]) // eslint-disable-line @typescript-eslint/no-explicit-any
            totRow.font = { bold: true, name: 'Calibri' }
            totRow.eachCell({ includeEmpty: true }, (cell, col) => {
              cell.border = border
              if (col >= 3) { cell.numFmt = '#,##0'; cell.alignment = { horizontal: 'right' } }
            })
            await downloadExcel(wb, `CommissionSummary_${from}_${to}.xlsx`)
          })}
          loading={isLoading('commission_summary')} />
      )}
      {activeModal === 'machine_report' && (
        <DateRangeModal title="Swipe Machine Report" onClose={() => setActiveModal(null)}
          onGenerate={exportSwipeMachineReport} loading={isLoading('machine_report')} />
      )}
      {activeModal === 'monthly_summary' && (
        <YearModal onClose={() => setActiveModal(null)}
          onGenerate={exportMonthlySummary} loading={isLoading('monthly_summary')} />
      )}

      <h1 className="text-lg font-bold text-[#1a1a1a] mb-6">Reports</h1>

      {/* Featured 2 cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {featuredReports.map(r => (
          <div key={r.title} className="bg-white rounded-lg border p-6 flex items-start gap-4"
            style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <div className="p-3 rounded-lg" style={{ background: '#f0fdf4' }}>
              <r.icon size={24} color="#3ECF8E" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="font-semibold text-[#1a1a1a]">{r.title}</h2>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                  style={{ background: '#d1fae5', color: '#065f46' }}>GENERATE</span>
              </div>
              <p className="text-sm text-[#6b7280] mb-3">{r.desc}</p>
              <button onClick={r.onGenerate} disabled={r.loading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white disabled:opacity-70"
                style={{ background: '#3ECF8E', borderRadius: 6 }}>
                {r.loading ? <><Loader2 size={13} className="animate-spin" /> Generating...</> : <><Download size={14} /> Generate Report</>}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 4-col grid */}
      <div className="grid grid-cols-4 gap-4">
        {gridReports.map(r => (
          <div key={r.title}
            className="group bg-white rounded-lg border p-4 flex flex-col gap-3 cursor-pointer hover:shadow-md transition-shadow"
            style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
            onClick={() => r.directFn ? r.directFn() : r.modal && setActiveModal(r.modal)}
          >
            <div className="p-2.5 rounded-lg w-fit" style={{ background: '#f0fdf4' }}>
              <r.icon size={20} color="#3ECF8E" />
            </div>
            <div>
              <div className="font-semibold text-sm text-[#1a1a1a] mb-1">{r.title}</div>
              <div className="text-xs text-[#6b7280]">{r.desc}</div>
            </div>
            <div className="flex items-center justify-between mt-auto">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                style={{ background: '#d1fae5', color: '#065f46' }}>GENERATE</span>
              <button
                onClick={e => { e.stopPropagation(); r.directFn ? r.directFn() : r.modal && setActiveModal(r.modal) }}
                className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 px-2 py-1 rounded-md text-xs border"
                style={{ borderColor: '#e5e7eb' }}>
                <Download size={11} /> Download
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
