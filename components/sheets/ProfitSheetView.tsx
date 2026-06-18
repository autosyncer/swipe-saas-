'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Download } from 'lucide-react'

interface ProfitRow {
  id: string
  sr_no: number
  date: string
  customer_name: string
  bank_card: string
  account_name: string
  swap_name: string
  total_amount: number
  swap_amount: number
  commission_pct: number
  commission_amount: number
  commission_type: string
  mdr_pct: number       // from machines.bank_commission_pct
  mdr_charges: number   // total_amount * mdr_pct / 100
  profit: number        // commission_amount - mdr_charges
}

const HS: React.CSSProperties = {
  border: '1px solid #000', padding: '4px 8px', fontSize: 12,
  fontFamily: 'Calibri,Arial,sans-serif', background: '#FFD700',
  color: '#000', fontWeight: 'bold', textAlign: 'center', whiteSpace: 'nowrap',
}
const CS: React.CSSProperties = {
  border: '1px solid #000', padding: '3px 7px', fontSize: 12,
  fontFamily: 'Calibri,Arial,sans-serif', background: '#fff',
  whiteSpace: 'nowrap',
}

function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return n.toLocaleString('en-IN')
}
function fmtPct(n: number) {
  return n.toFixed(3) + '%'
}
function fmtDate(d: string) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y.slice(2)}`
}

export default function ProfitSheetView() {
  const [rows, setRows] = useState<ProfitRow[]>([])
  const [loading, setLoading] = useState(true)
  const [dateFilter, setDateFilter] = useState(() => new Date().toISOString().split('T')[0])
  const [showAll, setShowAll] = useState(false)

  const fetchRows = useCallback(async () => {
    setLoading(true)

    // Fetch machines for MDR %
    const { data: machines } = await supabase
      .from('swipe_machines')
      .select('machine_name, bank_commission_pct')

    const mdrMap: Record<string, number> = {}
    ;(machines || []).forEach((m: { machine_name: string; bank_commission_pct: number }) => {
      mdrMap[m.machine_name] = Number(m.bank_commission_pct) || 0
    })

    // Fetch transactions
    let query = supabase
      .from('transactions')
      .select('id, sr_no, date, customer_name, bank_card, account_name, swap_name, total_amount, swap_amount, commission_pct, commission_amount, commission_type')
      .order('date', { ascending: false })
      .order('sr_no', { ascending: true })

    if (!showAll) query = query.eq('date', dateFilter)

    const { data } = await query

    const built: ProfitRow[] = (data || []).map((t: {
      id: string; sr_no: number; date: string; customer_name: string; bank_card: string;
      account_name: string; swap_name: string; total_amount: number; swap_amount: number;
      commission_pct: number; commission_amount: number; commission_type: string
    }) => {
      const mdr_pct = mdrMap[t.swap_name] ?? 0
      const total = Number(t.total_amount || 0)
      const mdr_charges = Math.round(total * mdr_pct / 100)
      const comm = Number(t.commission_amount || 0)
      return {
        ...t,
        mdr_pct,
        mdr_charges,
        profit: comm - mdr_charges,
      }
    })

    setRows(built)
    setLoading(false)
  }, [dateFilter, showAll])

  useEffect(() => { fetchRows() }, [fetchRows])

  const totalComm    = rows.reduce((s, r) => s + r.commission_amount, 0)
  const totalMdr     = rows.reduce((s, r) => s + r.mdr_charges, 0)
  const totalProfit  = rows.reduce((s, r) => s + r.profit, 0)
  const totalAmt     = rows.reduce((s, r) => s + Number(r.total_amount || 0), 0)
  const totalSwap    = rows.reduce((s, r) => s + Number(r.swap_amount || r.total_amount || 0), 0)

  async function exportExcel() {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Profit Sheet')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const border = (c: any) => {
      c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
    }
    const hdr = ws.addRow(['SR NO', 'DATE', 'CUSTOMER', 'BANK CARD', 'ACCOUNT', 'MACHINE', 'TOTAL AMT', 'SWAP AMT', 'COMM %', 'COMM AMT', 'MDR %', 'MDR CHARGES', 'PROFIT', 'COMM TYPE'])
    hdr.eachCell(c => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD700' } }
      c.font = { bold: true, name: 'Calibri', size: 11 }
      c.alignment = { horizontal: 'center', vertical: 'middle' }
      border(c)
    })
    rows.forEach((r, i) => {
      const dr = ws.addRow([
        r.sr_no, r.date, r.customer_name, r.bank_card || '', r.account_name,
        r.swap_name, r.total_amount, r.swap_amount || r.total_amount,
        r.commission_pct, r.commission_amount, r.mdr_pct, r.mdr_charges, r.profit, r.commission_type,
      ])
      dr.eachCell({ includeEmpty: true }, c => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFFFFFFF' : 'FFFFFDE7' } }
        c.font = { name: 'Calibri', size: 11 }
        border(c)
      })
    })
    // Total row
    const tot = ws.addRow(['', '', '', '', '', 'TOTAL', totalAmt, totalSwap, '', totalComm, '', totalMdr, totalProfit, ''])
    tot.eachCell({ includeEmpty: true }, c => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } }
      c.font = { bold: true, name: 'Calibri', size: 11 }
      border(c)
    })
    ws.columns.forEach(col => { col.width = 15 })
    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `profit_sheet_${dateFilter}.xlsx`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
        style={{ borderColor: '#e5e7eb', background: '#fff' }}>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-[#1a1a1a] uppercase tracking-wide">Profit Sheet — Commission vs MDR</span>
          <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
            style={{ background: '#fef9c3', color: '#92400e' }}>
            {rows.length} entries
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

      {/* Summary chips */}
      {rows.length > 0 && (
        <div className="flex gap-2 px-4 py-2 flex-wrap border-b flex-shrink-0"
          style={{ borderColor: '#f3f4f6', background: '#fafafa' }}>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
            style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534' }}>
            Commission: ₹{fmt(totalComm)}
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
            style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}>
            MDR Charges: ₹{fmt(totalMdr)}
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
            style={{
              background: totalProfit >= 0 ? '#d1fae5' : '#fef2f2',
              border: `1px solid ${totalProfit >= 0 ? '#6ee7b7' : '#fecaca'}`,
              color: totalProfit >= 0 ? '#065f46' : '#991b1b',
            }}>
            Net Profit: ₹{fmt(totalProfit)}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-sm text-[#9ca3af]">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-[#9ca3af]">No entries for this date</div>
        ) : (
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr>
                {['SR NO', 'DATE', 'CUSTOMER', 'BANK CARD', 'ACCOUNT', 'MACHINE', 'TOTAL AMT', 'SWAP AMT', 'COMM %', 'COMM AMT', 'MDR %', 'MDR CHARGES', 'PROFIT', 'COMM TYPE'].map(h => (
                  <th key={h} style={HS}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#fffde7' }}>
                  <td style={{ ...CS, textAlign: 'center', color: '#6b7280' }}>{r.sr_no}</td>
                  <td style={{ ...CS, textAlign: 'center' }}>{fmtDate(r.date)}</td>
                  <td style={{ ...CS, fontWeight: 600 }}>{r.customer_name}</td>
                  <td style={{ ...CS }}>{r.bank_card || '—'}</td>
                  <td style={{ ...CS, color: '#1d4ed8', fontWeight: 500 }}>{r.account_name}</td>
                  <td style={{ ...CS }}>{r.swap_name || '—'}</td>
                  <td style={{ ...CS, textAlign: 'right' }}>₹{fmt(r.total_amount)}</td>
                  <td style={{ ...CS, textAlign: 'right', fontWeight: 600, color: '#16a34a' }}>₹{fmt(r.swap_amount || r.total_amount)}</td>
                  <td style={{ ...CS, textAlign: 'center' }}>{r.commission_pct}%</td>
                  <td style={{ ...CS, textAlign: 'right', color: '#166534', fontWeight: 600 }}>₹{fmt(r.commission_amount)}</td>
                  <td style={{ ...CS, textAlign: 'center', color: '#6b7280' }}>{fmtPct(r.mdr_pct)}</td>
                  <td style={{ ...CS, textAlign: 'right', color: '#dc2626' }}>₹{fmt(r.mdr_charges)}</td>
                  <td style={{
                    ...CS, textAlign: 'right', fontWeight: 700,
                    color: r.profit >= 0 ? '#065f46' : '#991b1b',
                    background: r.profit >= 0 ? '#f0fdf4' : '#fef2f2',
                  }}>
                    {r.profit >= 0 ? '+' : ''}₹{fmt(r.profit)}
                  </td>
                  <td style={{ ...CS, textAlign: 'center' }}>
                    <span style={{
                      padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                      background: r.commission_type === 'Inclusive' ? '#f0fdf4' : r.commission_type === 'Deferred' ? '#fff7ed' : '#eff6ff',
                      color: r.commission_type === 'Inclusive' ? '#166534' : r.commission_type === 'Deferred' ? '#9a3412' : '#1e40af',
                    }}>{r.commission_type || '—'}</span>
                  </td>
                </tr>
              ))}
              {/* Total row */}
              <tr style={{ background: '#d1fae5', fontWeight: 700, borderTop: '2px solid #000' }}>
                <td colSpan={6} style={{ ...CS, textAlign: 'right', fontWeight: 700, background: '#d1fae5' }}>TOTAL ({rows.length})</td>
                <td style={{ ...CS, textAlign: 'right', background: '#d1fae5' }}>₹{fmt(totalAmt)}</td>
                <td style={{ ...CS, textAlign: 'right', color: '#16a34a', background: '#d1fae5' }}>₹{fmt(totalSwap)}</td>
                <td style={{ ...CS, background: '#d1fae5' }}></td>
                <td style={{ ...CS, textAlign: 'right', color: '#166534', background: '#d1fae5' }}>₹{fmt(totalComm)}</td>
                <td style={{ ...CS, background: '#d1fae5' }}></td>
                <td style={{ ...CS, textAlign: 'right', color: '#dc2626', background: '#d1fae5' }}>₹{fmt(totalMdr)}</td>
                <td style={{
                  ...CS, textAlign: 'right', fontWeight: 800, fontSize: 13,
                  color: totalProfit >= 0 ? '#065f46' : '#991b1b',
                  background: '#d1fae5',
                }}>
                  {totalProfit >= 0 ? '+' : ''}₹{fmt(totalProfit)}
                </td>
                <td style={{ ...CS, background: '#d1fae5' }}></td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
