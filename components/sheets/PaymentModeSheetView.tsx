'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Download } from 'lucide-react'

interface PaymentMode {
  mode: string
  amount: number
  accountName?: string | null
}

interface TxRow {
  id: string
  sr_no: number
  date: string
  customer_name: string
  bank_card: string
  account_name: string
  swap_name: string
  total_amount: number
  swap_amount: number
  paid_amount: number | null
  payment_modes: PaymentMode[] | null
  cash_type: string | null
  paid_in_cash: number | null
  remarks: string
  status: string
  entry_type: string
}

const ALL_MODES = ['CASH', 'GPAY', 'PHONEPAY', 'UPI', 'NEFT', 'RTGS']

const MODE_COLORS: Record<string, { bg: string; color: string }> = {
  CASH:      { bg: '#fef9c3', color: '#713f12' },
  GPAY:      { bg: '#eff6ff', color: '#1d4ed8' },
  PHONEPAY:  { bg: '#f5f3ff', color: '#6d28d9' },
  UPI:       { bg: '#f0fdf4', color: '#166534' },
  NEFT:      { bg: '#fff7ed', color: '#c2410c' },
  RTGS:      { bg: '#fdf2f8', color: '#9d174d' },
}

const HS: React.CSSProperties = {
  border: '1px solid #000', padding: '4px 8px', fontSize: 12,
  fontFamily: 'Calibri,Arial,sans-serif', background: '#FFD700',
  color: '#000', fontWeight: 'bold', textAlign: 'center', whiteSpace: 'nowrap',
}
const CS: React.CSSProperties = {
  border: '1px solid #d1d5db', padding: '4px 8px', fontSize: 12,
  fontFamily: 'Calibri,Arial,sans-serif', background: '#fff', whiteSpace: 'nowrap',
}

function fmt(n: number | null | undefined) {
  if (!n) return '—'
  return '₹' + n.toLocaleString('en-IN')
}
function fmtDate(d: string) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y.slice(2)}`
}

export default function PaymentModeSheetView() {
  const [rows, setRows] = useState<TxRow[]>([])
  const [loading, setLoading] = useState(true)
  const [dateFilter, setDateFilter] = useState(() => new Date().toISOString().split('T')[0])
  const [showAll, setShowAll] = useState(false)
  const [modeFilter, setModeFilter] = useState<string>('ALL')

  const fetchRows = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('transactions')
      .select('id,sr_no,date,customer_name,bank_card,account_name,swap_name,total_amount,swap_amount,paid_amount,payment_modes,cash_type,paid_in_cash,remarks,status,entry_type')
      .order('date', { ascending: false })
      .order('sr_no', { ascending: true })

    if (!showAll) q = q.eq('date', dateFilter)

    const { data } = await q
    // Only show rows that have at least one payment mode OR paid_in_cash
    const filtered = (data || []).filter((r: TxRow) =>
      (r.payment_modes && r.payment_modes.length > 0) || r.paid_in_cash
    )
    setRows(filtered as TxRow[])
    setLoading(false)
  }, [dateFilter, showAll])

  useEffect(() => { fetchRows() }, [fetchRows])

  // Get payment amount for a specific mode from a row
  const getModeAmount = (row: TxRow, mode: string): number => {
    if (row.payment_modes && row.payment_modes.length > 0) {
      const found = row.payment_modes.find(p => p.mode === mode)
      return found ? Number(found.amount) : 0
    }
    // Fallback: if no payment_modes JSON, use paid_in_cash for CASH
    if (mode === 'CASH') return Number(row.paid_in_cash || 0)
    return 0
  }

  const getModeAccount = (row: TxRow, mode: string): string => {
    if (!row.payment_modes) return ''
    const found = row.payment_modes.find(p => p.mode === mode)
    return found?.accountName || ''
  }

  // Filter by selected mode
  const displayRows = modeFilter === 'ALL'
    ? rows
    : rows.filter(r => getModeAmount(r, modeFilter) > 0)

  // Totals
  const totals = ALL_MODES.reduce<Record<string, number>>((acc, m) => {
    acc[m] = displayRows.reduce((s, r) => s + getModeAmount(r, m), 0)
    return acc
  }, {})

  // Only show columns that have data
  const activeModes = ALL_MODES.filter(m => totals[m] > 0)
  const activeNonCash = activeModes.filter(m => m !== 'CASH')
  const totalPaid = displayRows.reduce((s, r) => s + (Number(r.paid_amount) || 0), 0)
  const totalPending = displayRows.reduce((s, r) => {
    const total = Number(r.total_amount || 0)
    const paid = Number(r.paid_amount || 0)
    return s + Math.max(0, total - paid)
  }, 0)

  async function exportExcel() {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Payment Mode Sheet')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const border = (c: any) => {
      c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
    }
    const headers = ['SR', 'DATE', 'CUSTOMER', 'BANK CARD', 'ACCOUNT', 'MACHINE', 'TOTAL AMT', 'PAID AMT', 'PENDING',
      ...ALL_MODES.map(m => `${m} AMT`),
      ...ALL_MODES.filter(m => m !== 'CASH').map(m => `${m} ACCOUNT`),
      'REMARKS']
    const hdr = ws.addRow(headers)
    hdr.eachCell(c => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD700' } }
      c.font = { bold: true, name: 'Calibri', size: 11 }
      c.alignment = { horizontal: 'center', vertical: 'middle' }
      border(c)
    })
    displayRows.forEach((r, i) => {
      const total = Number(r.total_amount || 0)
      const paid = Number(r.paid_amount || 0)
      const dr = ws.addRow([
        r.sr_no, r.date, r.customer_name, r.bank_card || '', r.account_name, r.swap_name || '',
        total, paid, Math.max(0, total - paid),
        ...ALL_MODES.map(m => getModeAmount(r, m) || ''),
        ...ALL_MODES.filter(m => m !== 'CASH').map(m => getModeAccount(r, m)),
        r.remarks || '',
      ])
      dr.eachCell({ includeEmpty: true }, c => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFFFFFFF' : 'FFFFFDE7' } }
        c.font = { name: 'Calibri', size: 11 }
        border(c)
      })
    })
    // Total row
    const tot = ws.addRow(['', '', '', '', '', 'TOTAL', displayRows.reduce((s, r) => s + Number(r.total_amount || 0), 0), totalPaid, totalPending, ...ALL_MODES.map(m => totals[m] || ''), ...ALL_MODES.filter(m => m !== 'CASH').map(() => ''), ''])
    tot.eachCell({ includeEmpty: true }, c => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } }
      c.font = { bold: true, name: 'Calibri', size: 11 }
      border(c)
    })
    ws.columns.forEach(col => { col.width = 15 })
    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `payment_mode_sheet_${dateFilter}.xlsx`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
        style={{ borderColor: '#e5e7eb', background: '#fff' }}>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-[#1a1a1a] uppercase tracking-wide">Payment Mode Sheet</span>
          <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
            style={{ background: '#eff6ff', color: '#1d4ed8' }}>
            {displayRows.length} entries
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-[#6b7280] cursor-pointer">
            <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
            All dates
          </label>
          {!showAll && (
            <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
              className="border rounded px-2 py-1 text-xs" style={{ borderColor: '#e5e7eb' }} />
          )}
          <button onClick={exportExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold"
            style={{ background: '#3ECF8E', color: '#fff' }}>
            <Download size={12} /> Export
          </button>
        </div>
      </div>

      {/* Mode filter chips + summary */}
      <div className="flex items-center gap-2 px-4 py-2 flex-wrap border-b flex-shrink-0"
        style={{ borderColor: '#f3f4f6', background: '#fafafa' }}>
        {/* Filter buttons */}
        <button onClick={() => setModeFilter('ALL')}
          className="text-xs font-semibold px-2.5 py-1 rounded-full border"
          style={{ background: modeFilter === 'ALL' ? '#1a1a1a' : '#fff', color: modeFilter === 'ALL' ? '#fff' : '#374151', borderColor: modeFilter === 'ALL' ? '#1a1a1a' : '#e5e7eb' }}>
          All
        </button>
        {ALL_MODES.map(m => {
          const active = modeFilter === m
          const col = MODE_COLORS[m]
          return (
            <button key={m} onClick={() => setModeFilter(m)}
              className="text-xs font-semibold px-2.5 py-1 rounded-full border"
              style={{ background: active ? col.color : col.bg, color: active ? '#fff' : col.color, borderColor: col.color }}>
              {m} {totals[m] > 0 ? `· ₹${totals[m].toLocaleString('en-IN')}` : ''}
            </button>
          )
        })}

        <div className="ml-auto flex gap-2">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #86efac' }}>
            Paid: ₹{totalPaid.toLocaleString('en-IN')}
          </span>
          {totalPending > 0 && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
              Pending: ₹{totalPending.toLocaleString('en-IN')}
            </span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-sm text-[#9ca3af]">Loading...</div>
        ) : displayRows.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-[#9ca3af]">No payment entries for this date</div>
        ) : (
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr>
                <th style={HS}>SR</th>
                <th style={HS}>DATE</th>
                <th style={HS}>CUSTOMER</th>
                <th style={HS}>BANK CARD</th>
                <th style={HS}>ACCOUNT</th>
                <th style={HS}>MACHINE</th>
                <th style={HS}>TOTAL AMT</th>
                <th style={HS}>PAID AMT</th>
                <th style={HS}>PENDING</th>
                {activeModes.map(m => (
                  <th key={m} style={{ ...HS, background: MODE_COLORS[m].bg, color: MODE_COLORS[m].color }}>{m}</th>
                ))}
                {activeNonCash.map(m => (
                  <th key={m + '_acct'} style={{ ...HS, background: MODE_COLORS[m].bg, color: MODE_COLORS[m].color, fontSize: 10 }}>{m} ACCOUNT</th>
                ))}
                <th style={HS}>REMARKS</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((r, i) => {
                const total = Number(r.total_amount || 0)
                const paid = Number(r.paid_amount || 0)
                const pending = Math.max(0, total - paid)
                return (
                  <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#fffde7' }}>
                    <td style={{ ...CS, textAlign: 'center', color: '#6b7280' }}>{r.sr_no}</td>
                    <td style={{ ...CS, textAlign: 'center' }}>{fmtDate(r.date)}</td>
                    <td style={{ ...CS, fontWeight: 600 }}>{r.customer_name}</td>
                    <td style={{ ...CS }}>{r.bank_card || '—'}</td>
                    <td style={{ ...CS, color: '#1d4ed8', fontWeight: 500 }}>{r.account_name}</td>
                    <td style={{ ...CS }}>{r.swap_name || '—'}</td>
                    <td style={{ ...CS, textAlign: 'right', fontWeight: 500 }}>{fmt(total)}</td>
                    <td style={{ ...CS, textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>{fmt(paid)}</td>
                    <td style={{ ...CS, textAlign: 'right', fontWeight: 700, color: pending > 0 ? '#dc2626' : '#9ca3af' }}>
                      {pending > 0 ? fmt(pending) : '—'}
                    </td>
                    {activeModes.map(m => {
                      const amt = getModeAmount(r, m)
                      const col = MODE_COLORS[m]
                      return (
                        <td key={m} style={{ ...CS, textAlign: 'right', background: amt > 0 ? col.bg : '#fff', color: amt > 0 ? col.color : '#d1d5db', fontWeight: amt > 0 ? 700 : 400 }}>
                          {amt > 0 ? fmt(amt) : '—'}
                        </td>
                      )
                    })}
                    {activeNonCash.map(m => {
                      const acct = getModeAccount(r, m)
                      const col = MODE_COLORS[m]
                      return (
                        <td key={m + '_acct'} style={{ ...CS, fontSize: 11, color: acct ? col.color : '#d1d5db' }}>
                          {acct || '—'}
                        </td>
                      )
                    })}
                    <td style={{ ...CS, textAlign: 'center' }}>
                      <span style={{
                        padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                        background: r.remarks === 'PAID' || r.remarks === 'Paid' ? '#d1fae5' : r.remarks === 'PEND' ? '#fef9c3' : '#f3f4f6',
                        color: r.remarks === 'PAID' || r.remarks === 'Paid' ? '#065f46' : r.remarks === 'PEND' ? '#92400e' : '#374151',
                      }}>{r.remarks || '—'}</span>
                    </td>
                  </tr>
                )
              })}
              {/* Total row */}
              <tr style={{ background: '#d1fae5', fontWeight: 700, borderTop: '2px solid #000' }}>
                <td colSpan={6} style={{ ...CS, textAlign: 'right', fontWeight: 700, background: '#d1fae5' }}>TOTAL ({displayRows.length})</td>
                <td style={{ ...CS, textAlign: 'right', background: '#d1fae5' }}>₹{displayRows.reduce((s, r) => s + Number(r.total_amount || 0), 0).toLocaleString('en-IN')}</td>
                <td style={{ ...CS, textAlign: 'right', color: '#16a34a', background: '#d1fae5' }}>₹{totalPaid.toLocaleString('en-IN')}</td>
                <td style={{ ...CS, textAlign: 'right', color: '#dc2626', background: '#d1fae5' }}>{totalPending > 0 ? `₹${totalPending.toLocaleString('en-IN')}` : '—'}</td>
                {activeModes.map(m => (
                  <td key={m} style={{ ...CS, textAlign: 'right', background: '#d1fae5', color: MODE_COLORS[m].color, fontWeight: 700 }}>
                    {totals[m] > 0 ? `₹${totals[m].toLocaleString('en-IN')}` : '—'}
                  </td>
                ))}
                {activeNonCash.map(m => (
                  <td key={m + '_acct'} style={{ ...CS, background: '#d1fae5' }}></td>
                ))}
                <td style={{ ...CS, background: '#d1fae5' }}></td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
