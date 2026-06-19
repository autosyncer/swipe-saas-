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

const MODE_COLORS: Record<string, { bg: string; header: string; color: string; border: string }> = {
  CASH:     { bg: '#fefce8', header: '#ca8a04', color: '#713f12', border: '#fde047' },
  GPAY:     { bg: '#eff6ff', header: '#1d4ed8', color: '#1e3a8a', border: '#93c5fd' },
  PHONEPAY: { bg: '#f5f3ff', header: '#7c3aed', color: '#4c1d95', border: '#c4b5fd' },
  UPI:      { bg: '#f0fdf4', header: '#16a34a', color: '#14532d', border: '#86efac' },
  NEFT:     { bg: '#fff7ed', header: '#ea580c', color: '#7c2d12', border: '#fdba74' },
  RTGS:     { bg: '#fdf4ff', header: '#a21caf', color: '#701a75', border: '#e879f9' },
}

const HS = (bg: string, color: string): React.CSSProperties => ({
  border: '1px solid #000', padding: '4px 8px', fontSize: 11,
  fontFamily: 'Calibri,Arial,sans-serif', background: bg,
  color, fontWeight: 'bold', textAlign: 'center', whiteSpace: 'nowrap',
})
const CS: React.CSSProperties = {
  border: '1px solid #e5e7eb', padding: '4px 8px', fontSize: 12,
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

  const fetchRows = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('transactions')
      .select('id,sr_no,date,customer_name,bank_card,account_name,swap_name,total_amount,swap_amount,paid_amount,payment_modes,cash_type,paid_in_cash,remarks,status,entry_type')
      .order('date', { ascending: false })
      .order('sr_no', { ascending: true })

    if (!showAll) q = q.eq('date', dateFilter)
    const { data } = await q
    const filtered = (data || []).filter((r: TxRow) =>
      (r.payment_modes && r.payment_modes.length > 0) || r.paid_in_cash
    )
    setRows(filtered as TxRow[])
    setLoading(false)
  }, [dateFilter, showAll])

  useEffect(() => { fetchRows() }, [fetchRows])

  const getModeAmount = (row: TxRow, mode: string): number => {
    if (row.payment_modes && row.payment_modes.length > 0) {
      const found = row.payment_modes.find(p => p.mode === mode)
      return found ? Number(found.amount) : 0
    }
    if (mode === 'CASH') return Number(row.paid_in_cash || 0)
    return 0
  }

  const getModeAccount = (row: TxRow, mode: string): string => {
    if (!row.payment_modes) return ''
    const found = row.payment_modes.find(p => p.mode === mode)
    return found?.accountName || ''
  }

  // Group rows by mode — a row can appear in multiple mode sections
  const rowsByMode: Record<string, TxRow[]> = {}
  ALL_MODES.forEach(m => {
    rowsByMode[m] = rows.filter(r => getModeAmount(r, m) > 0)
  })
  const activeModes = ALL_MODES.filter(m => rowsByMode[m].length > 0)

  const grandTotal = rows.reduce((s, r) => s + Number(r.total_amount || 0), 0)
  const grandPaid  = rows.reduce((s, r) => s + (Number(r.paid_amount) || 0), 0)

  async function exportExcel() {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()

    for (const mode of activeModes) {
      const modeRows = rowsByMode[mode]
      const col = MODE_COLORS[mode]
      const ws = wb.addWorksheet(mode)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const border = (c: any) => {
        c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
      }
      const hdrs = ['SR', 'DATE', 'CUSTOMER', 'BANK CARD', 'ACCOUNT', 'MACHINE', 'TOTAL AMT', `${mode} AMT`]
      if (mode !== 'CASH') hdrs.push(`${mode} ACCOUNT`)
      hdrs.push('REMARKS')

      const hdr = ws.addRow(hdrs)
      hdr.eachCell(c => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + col.header.replace('#', '') } }
        c.font = { bold: true, name: 'Calibri', size: 11, color: { argb: 'FFFFFFFF' } }
        c.alignment = { horizontal: 'center', vertical: 'middle' }
        border(c)
      })

      modeRows.forEach((r, i) => {
        const amt = getModeAmount(r, mode)
        const vals = [r.sr_no, r.date, r.customer_name, r.bank_card || '', r.account_name, r.swap_name || '', r.total_amount, amt]
        if (mode !== 'CASH') vals.push(getModeAccount(r, mode) as never)
        vals.push((r.remarks || '') as never)
        const dr = ws.addRow(vals)
        dr.eachCell({ includeEmpty: true }, c => {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFFFFFFF' : 'FFFFFDE7' } }
          c.font = { name: 'Calibri', size: 11 }
          border(c)
        })
      })

      const modeTotal = modeRows.reduce((s, r) => s + getModeAmount(r, mode), 0)
      const tot = ws.addRow(['', '', '', '', '', 'TOTAL', modeRows.reduce((s, r) => s + Number(r.total_amount || 0), 0), modeTotal, ...(mode !== 'CASH' ? [''] : []), ''])
      tot.eachCell({ includeEmpty: true }, c => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } }
        c.font = { bold: true, name: 'Calibri', size: 11 }
        border(c)
      })
      ws.columns.forEach(col => { col.width = 16 })
    }

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
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-bold text-[#1a1a1a] uppercase tracking-wide">Payment Mode Sheet</span>
          {activeModes.map(m => {
            const total = rowsByMode[m].reduce((s, r) => s + getModeAmount(r, m), 0)
            const col = MODE_COLORS[m]
            return (
              <span key={m} className="text-xs font-bold px-2.5 py-0.5 rounded-full"
                style={{ background: col.bg, color: col.header, border: `1px solid ${col.border}` }}>
                {m} · ₹{total.toLocaleString('en-IN')} ({rowsByMode[m].length})
              </span>
            )
          })}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #86efac' }}>
            Total: ₹{grandTotal.toLocaleString('en-IN')} · Paid: ₹{grandPaid.toLocaleString('en-IN')}
          </span>
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

      {/* Sections per mode */}
      <div className="flex-1 overflow-auto px-4 py-4 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-sm text-[#9ca3af]">Loading...</div>
        ) : activeModes.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-[#9ca3af]">No payment entries for this date</div>
        ) : (
          activeModes.map(mode => {
            const modeRows = rowsByMode[mode]
            const col = MODE_COLORS[mode]
            const modeTotal = modeRows.reduce((s, r) => s + getModeAmount(r, mode), 0)
            const modeTxTotal = modeRows.reduce((s, r) => s + Number(r.total_amount || 0), 0)
            const isCash = mode === 'CASH'

            // Group by account for non-cash modes
            const accounts = isCash ? [] : Array.from(new Set(modeRows.map(r => getModeAccount(r, mode)).filter(Boolean)))

            return (
              <div key={mode} className="rounded-xl overflow-hidden shadow-sm"
                style={{ border: `2px solid ${col.border}` }}>
                {/* Mode section header */}
                <div className="flex items-center justify-between px-4 py-2.5"
                  style={{ background: col.header }}>
                  <div className="flex items-center gap-3">
                    <span className="text-white font-bold text-sm tracking-wide">{mode}</span>
                    <span className="text-white/80 text-xs font-medium">{modeRows.length} transactions</span>
                    {!isCash && accounts.length > 0 && (
                      <div className="flex gap-1.5">
                        {accounts.map(acct => {
                          const acctTotal = modeRows
                            .filter(r => getModeAccount(r, mode) === acct)
                            .reduce((s, r) => s + getModeAmount(r, mode), 0)
                          return (
                            <span key={acct} className="text-xs font-semibold px-2 py-0.5 rounded-full"
                              style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}>
                              {acct} · ₹{acctTotal.toLocaleString('en-IN')}
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  <div className="text-white font-bold text-sm">
                    Total: ₹{modeTotal.toLocaleString('en-IN')}
                  </div>
                </div>

                {/* Table */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={HS(col.bg, col.color)}>SR</th>
                        <th style={HS(col.bg, col.color)}>DATE</th>
                        <th style={HS(col.bg, col.color)}>CUSTOMER</th>
                        <th style={HS(col.bg, col.color)}>BANK CARD</th>
                        <th style={HS(col.bg, col.color)}>ACCOUNT</th>
                        <th style={HS(col.bg, col.color)}>MACHINE</th>
                        <th style={HS(col.bg, col.color)}>TOTAL AMT</th>
                        <th style={HS(col.bg, col.color)}>{mode} AMT</th>
                        {!isCash && <th style={HS(col.bg, col.color)}>{mode} ACCOUNT</th>}
                        <th style={HS(col.bg, col.color)}>REMARKS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modeRows.map((r, i) => {
                        const amt = getModeAmount(r, mode)
                        const acct = getModeAccount(r, mode)
                        return (
                          <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : col.bg + '66' }}>
                            <td style={{ ...CS, textAlign: 'center', color: '#9ca3af' }}>{r.sr_no}</td>
                            <td style={{ ...CS, textAlign: 'center' }}>{fmtDate(r.date)}</td>
                            <td style={{ ...CS, fontWeight: 600 }}>{r.customer_name}</td>
                            <td style={{ ...CS }}>{r.bank_card || '—'}</td>
                            <td style={{ ...CS, color: '#1d4ed8', fontWeight: 500 }}>{r.account_name}</td>
                            <td style={{ ...CS }}>{r.swap_name || '—'}</td>
                            <td style={{ ...CS, textAlign: 'right' }}>₹{Number(r.total_amount || 0).toLocaleString('en-IN')}</td>
                            <td style={{ ...CS, textAlign: 'right', fontWeight: 700, color: col.header }}>
                              {fmt(amt)}
                            </td>
                            {!isCash && (
                              <td style={{ ...CS, color: acct ? col.header : '#d1d5db', fontWeight: acct ? 500 : 400 }}>
                                {acct || '—'}
                              </td>
                            )}
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
                      {/* Section total row */}
                      <tr style={{ background: col.bg, borderTop: `2px solid ${col.border}` }}>
                        <td colSpan={6} style={{ ...CS, background: col.bg, textAlign: 'right', fontWeight: 700, color: col.color }}>
                          TOTAL ({modeRows.length})
                        </td>
                        <td style={{ ...CS, background: col.bg, textAlign: 'right', fontWeight: 700, color: col.color }}>
                          ₹{modeTxTotal.toLocaleString('en-IN')}
                        </td>
                        <td style={{ ...CS, background: col.bg, textAlign: 'right', fontWeight: 800, color: col.header }}>
                          ₹{modeTotal.toLocaleString('en-IN')}
                        </td>
                        {!isCash && <td style={{ ...CS, background: col.bg }}></td>}
                        <td style={{ ...CS, background: col.bg }}></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
