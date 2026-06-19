'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Download, RefreshCw } from 'lucide-react'

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
  paid_in_cash: number | null
  remarks: string
}

const ALL_MODES = ['CASH', 'GPAY', 'PHONEPAY', 'UPI', 'NEFT', 'RTGS'] as const
type Mode = typeof ALL_MODES[number]

const MODE_COLORS: Record<string, { bg: string; text: string }> = {
  CASH:     { bg: '#fef9c3', text: '#713f12' },
  GPAY:     { bg: '#dbeafe', text: '#1e40af' },
  PHONEPAY: { bg: '#ede9fe', text: '#5b21b6' },
  UPI:      { bg: '#dcfce7', text: '#166534' },
  NEFT:     { bg: '#ffedd5', text: '#9a3412' },
  RTGS:     { bg: '#fce7f3', text: '#9d174d' },
}

const HS: React.CSSProperties = {
  border: '1px solid #000', padding: '4px 8px', fontSize: 12,
  fontFamily: 'Calibri,Arial,sans-serif', background: '#FFD700',
  color: '#000', fontWeight: 'bold', textAlign: 'center', whiteSpace: 'nowrap',
}
const CS: React.CSSProperties = {
  border: '1px solid #000', padding: '3px 7px', fontSize: 12,
  fontFamily: 'Calibri,Arial,sans-serif', background: '#fff',
  color: '#000', whiteSpace: 'nowrap', verticalAlign: 'middle',
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
  const [activeMode, setActiveMode] = useState<Mode | 'ALL'>('ALL')
  const [activeAccount, setActiveAccount] = useState('__all__')

  const fetchRows = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('transactions')
      .select('id,sr_no,date,customer_name,bank_card,account_name,swap_name,total_amount,swap_amount,paid_amount,payment_modes,paid_in_cash,remarks')
      .order('date', { ascending: false })
      .order('sr_no', { ascending: true })
    if (!showAll) q = q.eq('date', dateFilter)
    const { data } = await q
    const filtered = (data || []).filter((r: TxRow) =>
      (r.payment_modes && r.payment_modes.length > 0) ||
      (r.paid_in_cash && Number(r.paid_in_cash) > 0)
    )
    setRows(filtered as TxRow[])
    setLoading(false)
  }, [dateFilter, showAll])

  useEffect(() => { fetchRows() }, [fetchRows])

  const getModeAmount = (row: TxRow, mode: string): number => {
    if (row.payment_modes?.length) {
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

  // Mode totals (across all rows)
  const modeTotals = useMemo(() =>
    ALL_MODES.reduce<Record<string, number>>((acc, m) => {
      acc[m] = rows.reduce((s, r) => s + getModeAmount(r, m), 0)
      return acc
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, {}), [rows])

  const activeModes = ALL_MODES.filter(m => modeTotals[m] > 0)

  // Accounts for the selected mode
  const accountsForMode = useMemo(() => {
    if (activeMode === 'ALL' || activeMode === 'CASH') return []
    return Array.from(new Set(
      rows
        .filter(r => getModeAmount(r, activeMode) > 0)
        .map(r => getModeAccount(r, activeMode))
        .filter(Boolean)
    ))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, activeMode])

  // Reset account when mode changes
  useEffect(() => { setActiveAccount('__all__') }, [activeMode])

  // Filtered rows for table
  const displayRows = useMemo(() => {
    if (activeMode === 'ALL') return rows
    const modeRows = rows.filter(r => getModeAmount(r, activeMode) > 0)
    if (activeMode === 'CASH' || activeAccount === '__all__') return modeRows
    return modeRows.filter(r => getModeAccount(r, activeMode) === activeAccount)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, activeMode, activeAccount])

  const displayModeTotal = useMemo(() =>
    activeMode === 'ALL'
      ? rows.reduce((s, r) => ALL_MODES.reduce((ss, m) => ss + getModeAmount(r, m), s), 0)
      : displayRows.reduce((s, r) => s + getModeAmount(r, activeMode), 0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  , [displayRows, activeMode, rows])

  const displayTxTotal = displayRows.reduce((s, r) => s + Number(r.total_amount || 0), 0)
  const displayPaid    = displayRows.reduce((s, r) => s + (Number(r.paid_amount) || 0), 0)
  const displayPending = displayRows.reduce((s, r) => s + Math.max(0, Number(r.total_amount || 0) - Number(r.paid_amount || 0)), 0)

  // Account totals for current mode (for sub-tab badges)
  const acctTotals = useMemo(() => {
    if (activeMode === 'ALL' || activeMode === 'CASH') return {}
    const map: Record<string, number> = {}
    rows.filter(r => getModeAmount(r, activeMode) > 0).forEach(r => {
      const acct = getModeAccount(r, activeMode) || 'Unknown'
      map[acct] = (map[acct] || 0) + getModeAmount(r, activeMode)
    })
    return map
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, activeMode])

  async function exportExcel() {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const border = (c: any) => {
      c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
    }

    for (const mode of activeModes) {
      const modeRows = rows.filter(r => getModeAmount(r, mode) > 0)
      const accounts = mode === 'CASH'
        ? ['Cash']
        : Array.from(new Set(modeRows.map(r => getModeAccount(r, mode)).filter(Boolean)))

      for (const acct of accounts) {
        const acctRows = mode === 'CASH' ? modeRows : modeRows.filter(r => getModeAccount(r, mode) === acct)
        const sheetName = `${mode}${acct && acct !== 'Cash' ? ' - ' + acct : ''}`.slice(0, 31)
        const ws = wb.addWorksheet(sheetName)

        const hdrs = ['SR', 'DATE', 'CUSTOMER', 'BANK CARD', 'ACCOUNT', 'MACHINE', 'TOTAL AMT', `${mode} AMT`, ...(mode !== 'CASH' ? ['PAYMENT ACCOUNT'] : []), 'PAID AMT', 'PENDING', 'REMARKS']
        const hdr = ws.addRow(hdrs)
        hdr.eachCell(c => {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD700' } }
          c.font = { bold: true, name: 'Calibri', size: 11 }
          c.alignment = { horizontal: 'center', vertical: 'middle' }
          border(c)
        })
        acctRows.forEach((r, i) => {
          const amt = getModeAmount(r, mode)
          const paid = Number(r.paid_amount || 0)
          const vals: (string | number)[] = [r.sr_no, r.date, r.customer_name, r.bank_card || '', r.account_name, r.swap_name || '', Number(r.total_amount || 0), amt]
          if (mode !== 'CASH') vals.push(acct)
          vals.push(paid, Math.max(0, Number(r.total_amount || 0) - paid), r.remarks || '')
          const dr = ws.addRow(vals)
          dr.eachCell({ includeEmpty: true }, c => {
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFFFFFFF' : 'FFFFFDE7' } }
            c.font = { name: 'Calibri', size: 11 }
            border(c)
          })
        })
        const modeAmt = acctRows.reduce((s, r) => s + getModeAmount(r, mode), 0)
        const totVals: (string | number)[] = ['', '', '', '', '', 'TOTAL', acctRows.reduce((s, r) => s + Number(r.total_amount || 0), 0), modeAmt]
        if (mode !== 'CASH') totVals.push('')
        totVals.push(acctRows.reduce((s, r) => s + (Number(r.paid_amount) || 0), 0), '', '')
        const tot = ws.addRow(totVals)
        tot.eachCell({ includeEmpty: true }, c => {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } }
          c.font = { bold: true, name: 'Calibri', size: 11 }
          border(c)
        })
        ws.columns.forEach(c => { c.width = 16 })
      }
    }

    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `payment_mode_${dateFilter}.xlsx`; a.click()
    URL.revokeObjectURL(url)
  }

  const tabBase: React.CSSProperties = {
    padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    borderBottom: '2px solid transparent', whiteSpace: 'nowrap', background: 'none', border: 'none',
    fontFamily: 'Calibri,Arial,sans-serif',
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 py-2 border-b flex-shrink-0"
        style={{ borderColor: '#e5e7eb' }}>
        <span className="text-sm font-bold uppercase tracking-wide text-[#1a1a1a]">Payment Mode Sheet</span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-[#6b7280] cursor-pointer">
            <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
            All dates
          </label>
          {!showAll && (
            <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
              className="border rounded px-2 py-1 text-xs" style={{ borderColor: '#e5e7eb' }} />
          )}
          <button onClick={fetchRows} className="p-1.5 rounded hover:bg-gray-100">
            <RefreshCw size={13} color="#6b7280" />
          </button>
          <button onClick={exportExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold"
            style={{ background: '#3ECF8E', color: '#fff' }}>
            <Download size={12} /> Export
          </button>
        </div>
      </div>

      {/* ── Mode tabs ── */}
      <div className="flex items-center border-b flex-shrink-0 overflow-x-auto"
        style={{ borderColor: '#e5e7eb', background: '#fafafa' }}>
        {/* ALL tab */}
        <button
          style={{
            ...tabBase,
            borderBottom: activeMode === 'ALL' ? '2px solid #1a1a1a' : '2px solid transparent',
            color: activeMode === 'ALL' ? '#1a1a1a' : '#6b7280',
          }}
          onClick={() => setActiveMode('ALL')}>
          All
          <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full"
            style={{ background: '#f3f4f6', color: '#374151' }}>
            {rows.length}
          </span>
        </button>

        {activeModes.map(m => {
          const col = MODE_COLORS[m]
          const isActive = activeMode === m
          return (
            <button key={m}
              style={{
                ...tabBase,
                borderBottom: isActive ? `2px solid ${col.text}` : '2px solid transparent',
                color: isActive ? col.text : '#6b7280',
              }}
              onClick={() => setActiveMode(m)}>
              {m}
              <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                style={{ background: isActive ? col.bg : '#f3f4f6', color: isActive ? col.text : '#9ca3af' }}>
                ₹{modeTotals[m].toLocaleString('en-IN')}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── Account sub-tabs (for non-CASH modes) ── */}
      {activeMode !== 'ALL' && activeMode !== 'CASH' && accountsForMode.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 border-b flex-shrink-0 overflow-x-auto"
          style={{ borderColor: '#f3f4f6', background: '#fff' }}>
          <span className="text-[11px] text-[#9ca3af] font-medium flex-shrink-0">Account:</span>
          <button
            className="text-xs font-semibold px-3 py-1 rounded-full"
            style={{
              background: activeAccount === '__all__' ? MODE_COLORS[activeMode].text : '#f3f4f6',
              color: activeAccount === '__all__' ? '#fff' : '#374151',
            }}
            onClick={() => setActiveAccount('__all__')}>
            All Accounts
          </button>
          {accountsForMode.map(acct => {
            const col = MODE_COLORS[activeMode]
            const isActive = activeAccount === acct
            return (
              <button key={acct}
                className="text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap"
                style={{
                  background: isActive ? col.text : col.bg,
                  color: isActive ? '#fff' : col.text,
                  border: `1px solid ${col.text}40`,
                }}
                onClick={() => setActiveAccount(acct)}>
                {acct}
                <span className="ml-1 opacity-75">· ₹{(acctTotals[acct] || 0).toLocaleString('en-IN')}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Summary chips ── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b flex-shrink-0 flex-wrap"
        style={{ borderColor: '#f3f4f6', background: '#fafafa' }}>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
          style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb' }}>
          {displayRows.length} entries
        </span>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
          style={{ background: '#fef9c3', color: '#713f12', border: '1px solid #fde047' }}>
          Txn: ₹{displayTxTotal.toLocaleString('en-IN')}
        </span>
        {activeMode !== 'ALL' && (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ background: MODE_COLORS[activeMode].bg, color: MODE_COLORS[activeMode].text, border: '1px solid #e5e7eb' }}>
            {activeMode}{activeAccount !== '__all__' ? ` · ${activeAccount}` : ''}: ₹{displayModeTotal.toLocaleString('en-IN')}
          </span>
        )}
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
          style={{ background: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7' }}>
          Paid: ₹{displayPaid.toLocaleString('en-IN')}
        </span>
        {displayPending > 0 && (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
            Pending: ₹{displayPending.toLocaleString('en-IN')}
          </span>
        )}
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-sm text-[#9ca3af]">Loading...</div>
        ) : displayRows.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-[#9ca3af]">No entries found</div>
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
                {activeMode === 'ALL'
                  ? ALL_MODES.filter(m => modeTotals[m] > 0).map(m => (
                      <th key={m} style={{ ...HS, background: MODE_COLORS[m].bg, color: MODE_COLORS[m].text }}>{m}</th>
                    ))
                  : <>
                      <th style={{ ...HS, background: MODE_COLORS[activeMode].bg, color: MODE_COLORS[activeMode].text }}>
                        {activeMode} AMT
                      </th>
                      {activeMode !== 'CASH' && (
                        <th style={{ ...HS, background: MODE_COLORS[activeMode].bg, color: MODE_COLORS[activeMode].text }}>
                          PAYMENT ACCOUNT
                        </th>
                      )}
                    </>
                }
                <th style={HS}>PAID AMT</th>
                <th style={HS}>PENDING</th>
                <th style={HS}>REMARKS</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((r, i) => {
                const total = Number(r.total_amount || 0)
                const paid  = Number(r.paid_amount || 0)
                const pend  = Math.max(0, total - paid)
                return (
                  <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#fffde7' }}>
                    <td style={{ ...CS, textAlign: 'center', color: '#6b7280' }}>{r.sr_no}</td>
                    <td style={{ ...CS, textAlign: 'center' }}>{fmtDate(r.date)}</td>
                    <td style={{ ...CS, fontWeight: 600 }}>{r.customer_name}</td>
                    <td style={{ ...CS }}>{r.bank_card || '—'}</td>
                    <td style={{ ...CS, color: '#1d4ed8', fontWeight: 500 }}>{r.account_name}</td>
                    <td style={{ ...CS }}>{r.swap_name || '—'}</td>
                    <td style={{ ...CS, textAlign: 'right' }}>₹{total.toLocaleString('en-IN')}</td>

                    {activeMode === 'ALL'
                      ? ALL_MODES.filter(m => modeTotals[m] > 0).map(m => {
                          const amt = getModeAmount(r, m)
                          const col = MODE_COLORS[m]
                          return (
                            <td key={m} style={{ ...CS, textAlign: 'right', background: amt > 0 ? col.bg : '#fff', color: amt > 0 ? col.text : '#d1d5db', fontWeight: amt > 0 ? 700 : 400 }}>
                              {amt > 0 ? fmt(amt) : '—'}
                            </td>
                          )
                        })
                      : <>
                          <td style={{ ...CS, textAlign: 'right', fontWeight: 700, color: MODE_COLORS[activeMode].text, background: MODE_COLORS[activeMode].bg }}>
                            {fmt(getModeAmount(r, activeMode))}
                          </td>
                          {activeMode !== 'CASH' && (
                            <td style={{ ...CS, color: MODE_COLORS[activeMode].text, fontWeight: 500 }}>
                              {getModeAccount(r, activeMode) || '—'}
                            </td>
                          )}
                        </>
                    }

                    <td style={{ ...CS, textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>{fmt(paid)}</td>
                    <td style={{ ...CS, textAlign: 'right', fontWeight: 700, color: pend > 0 ? '#dc2626' : '#9ca3af' }}>
                      {pend > 0 ? fmt(pend) : '—'}
                    </td>
                    <td style={{ ...CS, textAlign: 'center' }}>
                      <span style={{
                        padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                        background: r.remarks === 'PAID' || r.remarks === 'Paid' ? '#d1fae5' : r.remarks === 'PEND' ? '#fef9c3' : '#f3f4f6',
                        color:      r.remarks === 'PAID' || r.remarks === 'Paid' ? '#065f46' : r.remarks === 'PEND' ? '#92400e' : '#374151',
                      }}>{r.remarks || '—'}</span>
                    </td>
                  </tr>
                )
              })}

              {/* Totals row */}
              <tr style={{ background: '#d1fae5', borderTop: '2px solid #000' }}>
                <td colSpan={6} style={{ ...CS, background: '#d1fae5', textAlign: 'right', fontWeight: 700 }}>
                  TOTAL ({displayRows.length})
                </td>
                <td style={{ ...CS, background: '#d1fae5', textAlign: 'right', fontWeight: 700 }}>
                  ₹{displayTxTotal.toLocaleString('en-IN')}
                </td>
                {activeMode === 'ALL'
                  ? ALL_MODES.filter(m => modeTotals[m] > 0).map(m => (
                      <td key={m} style={{ ...CS, background: MODE_COLORS[m].bg, textAlign: 'right', fontWeight: 700, color: MODE_COLORS[m].text }}>
                        ₹{displayRows.reduce((s, r) => s + getModeAmount(r, m), 0).toLocaleString('en-IN')}
                      </td>
                    ))
                  : <>
                      <td style={{ ...CS, background: MODE_COLORS[activeMode].bg, textAlign: 'right', fontWeight: 800, color: MODE_COLORS[activeMode].text }}>
                        ₹{displayModeTotal.toLocaleString('en-IN')}
                      </td>
                      {activeMode !== 'CASH' && <td style={{ ...CS, background: '#d1fae5' }}></td>}
                    </>
                }
                <td style={{ ...CS, background: '#d1fae5', textAlign: 'right', color: '#16a34a', fontWeight: 700 }}>
                  ₹{displayPaid.toLocaleString('en-IN')}
                </td>
                <td style={{ ...CS, background: '#d1fae5', textAlign: 'right', color: '#dc2626', fontWeight: 700 }}>
                  {displayPending > 0 ? `₹${displayPending.toLocaleString('en-IN')}` : '—'}
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
