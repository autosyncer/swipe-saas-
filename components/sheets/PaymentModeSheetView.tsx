'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Download, ChevronRight } from 'lucide-react'

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

const MODE_COLORS: Record<string, { bg: string; header: string; color: string; border: string; light: string }> = {
  CASH:     { bg: '#fefce8', header: '#ca8a04', color: '#713f12', border: '#fde047', light: '#fef9c3' },
  GPAY:     { bg: '#eff6ff', header: '#1d4ed8', color: '#1e3a8a', border: '#93c5fd', light: '#dbeafe' },
  PHONEPAY: { bg: '#f5f3ff', header: '#7c3aed', color: '#4c1d95', border: '#c4b5fd', light: '#ede9fe' },
  UPI:      { bg: '#f0fdf4', header: '#16a34a', color: '#14532d', border: '#86efac', light: '#dcfce7' },
  NEFT:     { bg: '#fff7ed', header: '#ea580c', color: '#7c2d12', border: '#fdba74', light: '#fed7aa' },
  RTGS:     { bg: '#fdf4ff', header: '#a21caf', color: '#701a75', border: '#e879f9', light: '#f5d0fe' },
}

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

// nav item type
type NavItem = { mode: string; account: string | null }

export default function PaymentModeSheetView() {
  const [rows, setRows] = useState<TxRow[]>([])
  const [loading, setLoading] = useState(true)
  const [dateFilter, setDateFilter] = useState(() => new Date().toISOString().split('T')[0])
  const [showAll, setShowAll] = useState(false)
  const [selected, setSelected] = useState<NavItem>({ mode: 'CASH', account: null })
  const [expandedModes, setExpandedModes] = useState<Set<string>>(new Set(ALL_MODES))

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
    if (!row.payment_modes) return mode === 'CASH' ? 'Cash' : ''
    const found = row.payment_modes.find(p => p.mode === mode)
    return found?.accountName || (mode === 'CASH' ? 'Cash' : '')
  }

  // Build structure: mode → accounts → rows
  const structure: Record<string, { accounts: Record<string, TxRow[]>; total: number }> = {}
  ALL_MODES.forEach(mode => {
    const modeRows = rows.filter(r => getModeAmount(r, mode) > 0)
    if (modeRows.length === 0) return
    const accounts: Record<string, TxRow[]> = {}
    modeRows.forEach(r => {
      const acct = getModeAccount(r, mode) || (mode === 'CASH' ? 'Cash' : 'Unknown')
      if (!accounts[acct]) accounts[acct] = []
      accounts[acct].push(r)
    })
    structure[mode] = {
      accounts,
      total: modeRows.reduce((s, r) => s + getModeAmount(r, mode), 0),
    }
  })

  const activeModes = ALL_MODES.filter(m => structure[m])

  // Set first available mode on load
  useEffect(() => {
    if (activeModes.length > 0 && !structure[selected.mode]) {
      setSelected({ mode: activeModes[0], account: null })
    }
  }, [activeModes.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Current view rows
  const currentMode = selected.mode
  const currentCol = MODE_COLORS[currentMode] || MODE_COLORS.CASH
  const modeData = structure[currentMode]

  let viewRows: TxRow[] = []
  let viewTitle = currentMode
  if (modeData) {
    if (selected.account) {
      viewRows = modeData.accounts[selected.account] || []
      viewTitle = `${currentMode} — ${selected.account}`
    } else {
      viewRows = Object.values(modeData.accounts).flat()
      viewTitle = currentMode + ' (All Accounts)'
    }
  }

  const viewModeTotal = viewRows.reduce((s, r) => s + getModeAmount(r, currentMode), 0)
  const viewTxTotal = viewRows.reduce((s, r) => s + Number(r.total_amount || 0), 0)

  function toggleMode(mode: string) {
    setExpandedModes(prev => {
      const next = new Set(prev)
      if (next.has(mode)) next.delete(mode)
      else next.add(mode)
      return next
    })
  }

  async function exportExcel() {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()

    for (const mode of activeModes) {
      const col = MODE_COLORS[mode]
      const modeAccounts = structure[mode].accounts

      // One sheet per account
      for (const [acct, acctRows] of Object.entries(modeAccounts)) {
        const sheetName = `${mode} - ${acct}`.slice(0, 31)
        const ws = wb.addWorksheet(sheetName)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const border = (c: any) => {
          c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
        }
        const hdrs = ['SR', 'DATE', 'CUSTOMER', 'BANK CARD', 'NSS ACCOUNT', 'MACHINE', 'TOTAL AMT', `${mode} AMT`, 'PAYMENT ACCOUNT', 'REMARKS']
        const hdr = ws.addRow(hdrs)
        hdr.eachCell(c => {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD700' } }
          c.font = { bold: true, name: 'Calibri', size: 11 }
          c.alignment = { horizontal: 'center', vertical: 'middle' }
          border(c)
        })
        acctRows.forEach((r, i) => {
          const amt = getModeAmount(r, mode)
          const dr = ws.addRow([r.sr_no, r.date, r.customer_name, r.bank_card || '', r.account_name, r.swap_name || '', r.total_amount, amt, acct, r.remarks || ''])
          dr.eachCell({ includeEmpty: true }, c => {
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFFFFFFF' : 'FFFFFDE7' } }
            c.font = { name: 'Calibri', size: 11 }
            border(c)
          })
        })
        const tot = ws.addRow(['', '', '', '', '', 'TOTAL', acctRows.reduce((s, r) => s + Number(r.total_amount || 0), 0), acctRows.reduce((s, r) => s + getModeAmount(r, mode), 0), '', ''])
        tot.eachCell({ includeEmpty: true }, c => {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } }
          c.font = { bold: true, name: 'Calibri', size: 11 }
          border(c)
        })
        ws.columns.forEach(c => { c.width = 16 })
        // Add colored title row at top
        ws.spliceRows(1, 0, [`${mode} — ${acct}`])
        const titleCell = ws.getCell('A1')
        titleCell.value = `${mode} — ${acct}`
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + col.header.replace('#', '') } }
        titleCell.font = { bold: true, name: 'Calibri', size: 13, color: { argb: 'FFFFFFFF' } }
        ws.mergeCells(1, 1, 1, hdrs.length)
      }
    }

    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `payment_mode_sheet_${dateFilter}.xlsx`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left nav panel */}
      <div className="flex-shrink-0 overflow-y-auto border-r flex flex-col"
        style={{ width: 220, background: '#111827', borderColor: '#1f2937' }}>
        {/* Date filter */}
        <div className="px-3 py-3 border-b" style={{ borderColor: '#1f2937' }}>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer mb-2" style={{ color: '#9ca3af' }}>
            <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
            All dates
          </label>
          {!showAll && (
            <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
              className="w-full border rounded px-2 py-1 text-xs"
              style={{ borderColor: '#374151', background: '#1f2937', color: '#f9fafb' }} />
          )}
        </div>

        {/* Nav tree */}
        <div className="flex-1 py-2">
          {loading ? (
            <div className="px-4 py-2 text-xs" style={{ color: '#6b7280' }}>Loading...</div>
          ) : activeModes.length === 0 ? (
            <div className="px-4 py-2 text-xs" style={{ color: '#6b7280' }}>No data</div>
          ) : activeModes.map(mode => {
            const col = MODE_COLORS[mode]
            const modeTotal = structure[mode].total
            const accounts = Object.keys(structure[mode].accounts)
            const isExpanded = expandedModes.has(mode)
            const isModeSelected = selected.mode === mode && !selected.account

            return (
              <div key={mode}>
                {/* Mode row */}
                <div className="flex items-center cursor-pointer select-none"
                  style={{
                    background: isModeSelected ? col.header + '33' : 'transparent',
                    borderLeft: isModeSelected ? `3px solid ${col.header}` : '3px solid transparent',
                  }}
                  onClick={() => { setSelected({ mode, account: null }); if (!isExpanded) toggleMode(mode) }}>
                  <button
                    className="p-1 pl-2 flex-shrink-0"
                    onClick={e => { e.stopPropagation(); toggleMode(mode) }}>
                    <ChevronRight size={12} color="#6b7280"
                      style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }} />
                  </button>
                  <div className="flex-1 flex items-center justify-between py-2 pr-3 min-w-0">
                    <span className="text-xs font-bold" style={{ color: col.header }}>{mode}</span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                      style={{ background: col.header + '33', color: col.header }}>
                      ₹{modeTotal.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                {/* Account sub-items */}
                {isExpanded && accounts.map(acct => {
                  const acctRows = structure[mode].accounts[acct]
                  const acctTotal = acctRows.reduce((s, r) => s + getModeAmount(r, mode), 0)
                  const isSelected = selected.mode === mode && selected.account === acct
                  return (
                    <div key={acct}
                      className="flex items-center cursor-pointer pl-7 pr-3 py-1.5 select-none"
                      style={{
                        background: isSelected ? col.header + '22' : 'transparent',
                        borderLeft: isSelected ? `3px solid ${col.header}` : '3px solid transparent',
                      }}
                      onClick={() => setSelected({ mode, account: acct })}>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs truncate" style={{ color: isSelected ? col.header : '#9ca3af' }}
                          title={acct}>{acct}</div>
                        <div className="text-[10px]" style={{ color: '#6b7280' }}>
                          {acctRows.length} txn · ₹{acctTotal.toLocaleString('en-IN')}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Export button */}
        <div className="p-3 border-t" style={{ borderColor: '#1f2937' }}>
          <button onClick={exportExcel}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded text-xs font-semibold"
            style={{ background: '#3ECF8E', color: '#fff' }}>
            <Download size={12} /> Export All
          </button>
        </div>
      </div>

      {/* Right content panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Panel header */}
        <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
          style={{ borderColor: '#e5e7eb', background: '#fff' }}>
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: currentCol.header }} />
            <span className="text-sm font-bold" style={{ color: '#1a1a1a' }}>{viewTitle}</span>
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{ background: currentCol.light, color: currentCol.color }}>
              {viewRows.length} entries
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ background: currentCol.light, color: currentCol.header, border: `1px solid ${currentCol.border}` }}>
              {currentMode} Total: ₹{viewModeTotal.toLocaleString('en-IN')}
            </span>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #86efac' }}>
              Txn Total: ₹{viewTxTotal.toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-sm text-[#9ca3af]">Loading...</div>
          ) : viewRows.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-[#9ca3af]">No entries</div>
          ) : (
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr>
                  {['SR', 'DATE', 'CUSTOMER', 'BANK CARD', 'NSS ACCOUNT', 'MACHINE', 'TOTAL AMT', `${currentMode} AMT`, 'PAYMENT ACCOUNT', 'PAID AMT', 'PENDING', 'REMARKS'].map(h => (
                    <th key={h} style={{
                      border: '1px solid #000', padding: '4px 8px', fontSize: 11,
                      fontFamily: 'Calibri,Arial,sans-serif',
                      background: h === `${currentMode} AMT` || h === 'PAYMENT ACCOUNT' ? currentCol.header : '#FFD700',
                      color: h === `${currentMode} AMT` || h === 'PAYMENT ACCOUNT' ? '#fff' : '#000',
                      fontWeight: 'bold', textAlign: 'center', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {viewRows.map((r, i) => {
                  const amt = getModeAmount(r, currentMode)
                  const acct = getModeAccount(r, currentMode)
                  const total = Number(r.total_amount || 0)
                  const paid = Number(r.paid_amount || 0)
                  const pending = Math.max(0, total - paid)
                  return (
                    <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : currentCol.bg }}>
                      <td style={{ ...CS, textAlign: 'center', color: '#9ca3af' }}>{r.sr_no}</td>
                      <td style={{ ...CS, textAlign: 'center' }}>{fmtDate(r.date)}</td>
                      <td style={{ ...CS, fontWeight: 600 }}>{r.customer_name}</td>
                      <td style={{ ...CS }}>{r.bank_card || '—'}</td>
                      <td style={{ ...CS, color: '#1d4ed8', fontWeight: 500 }}>{r.account_name}</td>
                      <td style={{ ...CS }}>{r.swap_name || '—'}</td>
                      <td style={{ ...CS, textAlign: 'right' }}>₹{total.toLocaleString('en-IN')}</td>
                      <td style={{ ...CS, textAlign: 'right', fontWeight: 700, color: currentCol.header, background: currentCol.light }}>
                        {fmt(amt)}
                      </td>
                      <td style={{ ...CS, fontWeight: 500, color: currentCol.header, background: currentCol.bg }}>
                        {acct || '—'}
                      </td>
                      <td style={{ ...CS, textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>{fmt(paid)}</td>
                      <td style={{ ...CS, textAlign: 'right', fontWeight: 700, color: pending > 0 ? '#dc2626' : '#9ca3af' }}>
                        {pending > 0 ? fmt(pending) : '—'}
                      </td>
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
                <tr style={{ background: currentCol.light, fontWeight: 700, borderTop: '2px solid #000' }}>
                  <td colSpan={6} style={{ ...CS, background: currentCol.light, textAlign: 'right', fontWeight: 700, color: currentCol.color }}>
                    TOTAL ({viewRows.length})
                  </td>
                  <td style={{ ...CS, background: currentCol.light, textAlign: 'right', color: currentCol.color }}>
                    ₹{viewTxTotal.toLocaleString('en-IN')}
                  </td>
                  <td style={{ ...CS, background: currentCol.header, textAlign: 'right', color: '#fff', fontWeight: 800 }}>
                    ₹{viewModeTotal.toLocaleString('en-IN')}
                  </td>
                  <td style={{ ...CS, background: currentCol.light }}></td>
                  <td style={{ ...CS, background: currentCol.light, textAlign: 'right', color: '#16a34a' }}>
                    ₹{viewRows.reduce((s, r) => s + (Number(r.paid_amount) || 0), 0).toLocaleString('en-IN')}
                  </td>
                  <td style={{ ...CS, background: currentCol.light, textAlign: 'right', color: '#dc2626' }}>
                    {(() => { const p = viewRows.reduce((s, r) => s + Math.max(0, Number(r.total_amount || 0) - Number(r.paid_amount || 0)), 0); return p > 0 ? `₹${p.toLocaleString('en-IN')}` : '—' })()}
                  </td>
                  <td style={{ ...CS, background: currentCol.light }}></td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
