'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronLeft, ChevronRight, Download, RefreshCw } from 'lucide-react'
import { AcSheetRow, loadAcSheet, saveAcSheetCell } from '@/lib/ac-sheet'

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtDate(d: string) {
  if (!d) return ''
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
}

function isoDate(d: Date) {
  return d.toISOString().split('T')[0]
}

function prevDay(d: string) {
  const dt = new Date(d + 'T00:00:00')
  dt.setDate(dt.getDate() - 1)
  return isoDate(dt)
}

function nextDay(d: string) {
  const dt = new Date(d + 'T00:00:00')
  dt.setDate(dt.getDate() + 1)
  return isoDate(dt)
}

function fmt(n: number | null | undefined) {
  if (n == null || n === 0) return ''
  return n.toLocaleString('en-IN')
}

function fmtFull(n: number) {
  return n.toLocaleString('en-IN')
}

const EDITABLE_FIELDS: (keyof AcSheetRow)[] = [
  'bal_recd', 'trn_bal_recd', 'atm_withd', 'withd', 'transf', 'cc_pay', 'cust_trf', 'charges'
]

const COL_HEADERS = [
  { key: 'account_name' as keyof AcSheetRow, label: 'ACCOUNT', width: 140 },
  { key: 'open_bal' as keyof AcSheetRow, label: 'OPEN BAL', width: 110 },
  { key: 'bal_recd' as keyof AcSheetRow, label: 'BAL RECD', width: 110 },
  { key: 'trn_bal_recd' as keyof AcSheetRow, label: 'TRN BAL RECD', width: 120 },
  { key: 'avai_bal' as keyof AcSheetRow, label: 'AVAI BAL', width: 110 },
  { key: 'atm_withd' as keyof AcSheetRow, label: 'ATM WITHD', width: 110 },
  { key: 'withd' as keyof AcSheetRow, label: 'WITHD', width: 100 },
  { key: 'transf' as keyof AcSheetRow, label: 'TRANSF', width: 100 },
  { key: 'cc_pay' as keyof AcSheetRow, label: 'CC PAY', width: 100 },
  { key: 'cust_trf' as keyof AcSheetRow, label: 'CUST TRF', width: 110 },
  { key: 'charges' as keyof AcSheetRow, label: 'CHARGES', width: 100 },
  { key: 'closing_bal' as keyof AcSheetRow, label: 'CLOSI BAL', width: 110 },
]


// ── Editable cell ──────────────────────────────────────────────────────────────
function EditableCell({
  value,
  onSave,
  align = 'right',
  bg,
  bold,
  color,
}: {
  value: number
  onSave: (v: number) => void
  align?: 'left' | 'right'
  bg?: string
  bold?: boolean
  color?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function startEdit() {
    setDraft(value === 0 ? '' : String(value))
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  function commit() {
    const v = parseFloat(draft) || 0
    onSave(v)
    setEditing(false)
  }

  const cellStyle: React.CSSProperties = {
    padding: '3px 6px',
    border: '1px solid #d1d5db',
    textAlign: align,
    background: bg || 'transparent',
    fontWeight: bold ? 'bold' : 'normal',
    color: color || '#1a1a1a',
    cursor: 'pointer',
    minWidth: 90,
    fontSize: 12,
    fontFamily: 'Calibri, Arial, sans-serif',
  }

  if (editing) {
    return (
      <td style={{ ...cellStyle, padding: 0 }}>
        <input
          ref={inputRef}
          type="number"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
          style={{
            width: '100%',
            height: '100%',
            border: '2px solid #3ECF8E',
            outline: 'none',
            textAlign: align,
            padding: '3px 6px',
            fontSize: 12,
            fontFamily: 'Calibri, Arial, sans-serif',
            background: '#f0fdf4',
          }}
          autoFocus
        />
      </td>
    )
  }

  return (
    <td style={cellStyle} onDoubleClick={startEdit} onClick={startEdit}>
      {value !== 0 ? fmtFull(value) : ''}
    </td>
  )
}

// ── Main AC Sheet View ─────────────────────────────────────────────────────────
export default function AcSheetView() {
  const today = isoDate(new Date())
  const [date, setDate] = useState(today)
  const [rows, setRows] = useState<AcSheetRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)

  const load = useCallback(async (d: string) => {
    setLoading(true)
    const data = await loadAcSheet(d)
    setRows(data)
    setLoading(false)
  }, [])

  useEffect(() => { load(date) }, [date, load])

  async function handleCellSave(rowIdx: number, field: keyof AcSheetRow, value: number) {
    const row = rows[rowIdx]
    setSaving(row.account_name + field)
    const updated = await saveAcSheetCell(row, field, value, (newId) => {
      setRows(prev => prev.map((r, i) => i === rowIdx ? { ...r, id: newId } : r))
    })
    setRows(prev => prev.map((r, i) => i === rowIdx ? updated : r))
    setSaving(null)
  }

  async function exportXlsx() {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('AC Sheet')

    const dateLabel = fmtDate(date)

    // Date header row (merged)
    ws.mergeCells(1, 1, 1, COL_HEADERS.length)
    const dateCell = ws.getCell(1, 1)
    dateCell.value = dateLabel
    dateCell.font = { bold: true, size: 13 }
    dateCell.alignment = { horizontal: 'center', vertical: 'middle' }
    dateCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } }
    ws.getRow(1).height = 20

    // Column headers
    COL_HEADERS.forEach((col, i) => {
      const cell = ws.getCell(2, i + 1)
      cell.value = col.label
      cell.font = { bold: true, size: 11 }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } }
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
      ws.getColumn(i + 1).width = col.width / 7
    })
    ws.getRow(2).height = 18

    // Data rows
    rows.forEach((row, ri) => {
      COL_HEADERS.forEach((col, ci) => {
        const cell = ws.getCell(ri + 3, ci + 1)
        const val = row[col.key]
        cell.value = typeof val === 'number' ? val : String(val || '')
        cell.alignment = { horizontal: col.key === 'account_name' ? 'left' : 'right', vertical: 'middle' }
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }

        if (col.key === 'avai_bal' || col.key === 'closing_bal') {
          cell.font = { bold: true, size: 11 }
        }

        // Yellow for non-zero entered values
        if (['bal_recd', 'trn_bal_recd', 'atm_withd', 'withd', 'transf', 'cc_pay', 'cust_trf', 'charges'].includes(col.key as string) && Number(val) !== 0) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
        }
        // Green for zero bal_recd
        if (col.key === 'bal_recd' && Number(val) === 0) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92D050' } }
        }
        // Light blue for avai_bal
        if (col.key === 'avai_bal') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } }
        }
        // Green/red for closing_bal
        if (col.key === 'closing_bal') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: Number(val) >= 0 ? 'FFC6EFCE' : 'FFFFC7CE' } }
        }
      })
    })

    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `ACSheet_${date.split('-').reverse().join('-')}.xlsx`
    a.click()
  }

  const totalRow = rows.reduce((acc, r) => ({
    open_bal: acc.open_bal + Number(r.open_bal),
    bal_recd: acc.bal_recd + Number(r.bal_recd),
    trn_bal_recd: acc.trn_bal_recd + Number(r.trn_bal_recd),
    avai_bal: acc.avai_bal + Number(r.avai_bal),
    atm_withd: acc.atm_withd + Number(r.atm_withd),
    withd: acc.withd + Number(r.withd),
    transf: acc.transf + Number(r.transf),
    cc_pay: acc.cc_pay + Number(r.cc_pay),
    cust_trf: acc.cust_trf + Number(r.cust_trf),
    charges: acc.charges + Number(r.charges),
    closing_bal: acc.closing_bal + Number(r.closing_bal),
  }), { open_bal: 0, bal_recd: 0, trn_bal_recd: 0, avai_bal: 0, atm_withd: 0, withd: 0, transf: 0, cc_pay: 0, cust_trf: 0, charges: 0, closing_bal: 0 })

  const HS: React.CSSProperties = {
    border: '1px solid #1a1a2e',
    padding: '4px 6px',
    fontSize: 11,
    fontFamily: 'Calibri, Arial, sans-serif',
    background: '#1F4E79',
    color: '#ffffff',
    fontWeight: 'bold',
    textAlign: 'center',
    whiteSpace: 'nowrap',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: '#fafafa' }}>

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[#e5e7eb] bg-white flex-shrink-0">
        {/* Date navigation */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setDate(prevDay(date))}
            className="p-1.5 rounded border hover:bg-gray-50 transition-colors"
            style={{ borderColor: '#e5e7eb' }}
          >
            <ChevronLeft size={14} />
          </button>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="border rounded-md px-3 py-1.5 text-sm font-medium outline-none focus:border-[#3ECF8E]"
            style={{ borderColor: '#e5e7eb' }}
          />
          <button
            onClick={() => setDate(nextDay(date))}
            disabled={date >= today}
            className="p-1.5 rounded border hover:bg-gray-50 transition-colors disabled:opacity-40"
            style={{ borderColor: '#e5e7eb' }}
          >
            <ChevronRight size={14} />
          </button>
        </div>

        <div
          className="px-3 py-1 rounded text-sm font-semibold"
          style={{ background: '#1F4E79', color: '#fff' }}
        >
          {fmtDate(date)}
        </div>

        <div className="flex-1" />

        <button
          onClick={() => load(date)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-medium hover:bg-gray-50"
          style={{ borderColor: '#e5e7eb', color: '#374151' }}
        >
          <RefreshCw size={12} /> Refresh
        </button>

        <button
          onClick={exportXlsx}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium text-white"
          style={{ background: '#3ECF8E' }}
        >
          <Download size={12} /> Export .xlsx
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-sm text-[#6b7280]">
            Loading AC Sheet for {fmtDate(date)}...
          </div>
        ) : (
          <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
            <thead>
              {/* Date header */}
              <tr>
                <th
                  colSpan={COL_HEADERS.length}
                  style={{
                    ...HS,
                    fontSize: 13,
                    background: '#1a1a2e',
                    padding: '6px 10px',
                    letterSpacing: '0.02em',
                  }}
                >
                  {fmtDate(date)}
                </th>
              </tr>
              {/* Column headers */}
              <tr>
                {COL_HEADERS.map(col => (
                  <th
                    key={col.key}
                    style={{
                      ...HS,
                      minWidth: col.width,
                      textAlign: col.key === 'account_name' ? 'left' : 'center',
                      ...(col.key === 'account_name' ? { position: 'sticky', left: 0, zIndex: 20 } : {}),
                    }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => (
                <tr key={row.account_name} style={{ background: rowIdx % 2 === 0 ? '#ffffff' : '#f9f9f9' }}>
                  {/* Account name - sticky */}
                  <td style={{
                    border: '1px solid #d1d5db',
                    padding: '3px 8px',
                    fontSize: 12,
                    fontFamily: 'Calibri, Arial, sans-serif',
                    fontWeight: 'bold',
                    whiteSpace: 'nowrap',
                    position: 'sticky',
                    left: 0,
                    background: rowIdx % 2 === 0 ? '#fff' : '#f9f9f9',
                    zIndex: 5,
                    minWidth: 140,
                  }}>
                    {row.account_name}
                    {saving && saving.startsWith(row.account_name) && (
                      <span className="ml-1 text-[10px] text-[#3ECF8E]">saving…</span>
                    )}
                  </td>

                  {/* OPEN BAL - read-only */}
                  <td style={{
                    border: '1px solid #d1d5db',
                    padding: '3px 6px',
                    fontSize: 12,
                    fontFamily: 'Calibri, Arial, sans-serif',
                    textAlign: 'right',
                    background: '#f3f4f6',
                    color: '#374151',
                    minWidth: 110,
                  }}>
                    {fmt(row.open_bal)}
                  </td>

                  {/* BAL RECD */}
                  <EditableCell
                    value={Number(row.bal_recd)}
                    bg={Number(row.bal_recd) === 0 ? '#92D050' : '#ffff00'}
                    onSave={v => handleCellSave(rowIdx, 'bal_recd', v)}
                  />

                  {/* TRN BAL RECD */}
                  <EditableCell
                    value={Number(row.trn_bal_recd)}
                    bg={Number(row.trn_bal_recd) !== 0 ? '#ffff00' : undefined}
                    onSave={v => handleCellSave(rowIdx, 'trn_bal_recd', v)}
                  />

                  {/* AVAI BAL - read-only, light blue */}
                  <td style={{
                    border: '1px solid #d1d5db',
                    padding: '3px 6px',
                    fontSize: 12,
                    fontFamily: 'Calibri, Arial, sans-serif',
                    textAlign: 'right',
                    background: '#D9E1F2',
                    fontWeight: 'bold',
                    minWidth: 110,
                  }}>
                    {fmt(row.avai_bal)}
                  </td>

                  {/* ATM WITHD */}
                  <EditableCell
                    value={Number(row.atm_withd)}
                    bg={Number(row.atm_withd) !== 0 ? '#ffff00' : undefined}
                    onSave={v => handleCellSave(rowIdx, 'atm_withd', v)}
                  />

                  {/* WITHD */}
                  <EditableCell
                    value={Number(row.withd)}
                    bg={Number(row.withd) !== 0 ? '#ffff00' : undefined}
                    onSave={v => handleCellSave(rowIdx, 'withd', v)}
                  />

                  {/* TRANSF */}
                  <EditableCell
                    value={Number(row.transf)}
                    bg={Number(row.transf) !== 0 ? '#ffff00' : undefined}
                    onSave={v => handleCellSave(rowIdx, 'transf', v)}
                  />

                  {/* CC PAY */}
                  <EditableCell
                    value={Number(row.cc_pay)}
                    bg={Number(row.cc_pay) !== 0 ? '#ffff00' : undefined}
                    onSave={v => handleCellSave(rowIdx, 'cc_pay', v)}
                  />

                  {/* CUST TRF */}
                  <EditableCell
                    value={Number(row.cust_trf)}
                    bg={Number(row.cust_trf) !== 0 ? '#ffff00' : undefined}
                    onSave={v => handleCellSave(rowIdx, 'cust_trf', v)}
                  />

                  {/* CHARGES - always yellow bg per screenshot */}
                  <EditableCell
                    value={Number(row.charges)}
                    bg={Number(row.charges) !== 0 ? '#ffff00' : '#fffde7'}
                    onSave={v => handleCellSave(rowIdx, 'charges', v)}
                  />

                  {/* CLOSI BAL - read-only, green/red */}
                  <td style={{
                    border: '1px solid #d1d5db',
                    padding: '3px 6px',
                    fontSize: 12,
                    fontFamily: 'Calibri, Arial, sans-serif',
                    textAlign: 'right',
                    background: Number(row.closing_bal) >= 0 ? '#C6EFCE' : '#FFC7CE',
                    color: Number(row.closing_bal) >= 0 ? '#375623' : '#9C0006',
                    fontWeight: 'bold',
                    minWidth: 110,
                  }}>
                    {fmtFull(Number(row.closing_bal))}
                  </td>
                </tr>
              ))}

              {/* Totals row */}
              {rows.length > 0 && (
                <tr style={{ background: '#1F4E79' }}>
                  <td style={{
                    border: '1px solid #1a1a2e',
                    padding: '4px 8px',
                    fontSize: 12,
                    fontFamily: 'Calibri, Arial, sans-serif',
                    fontWeight: 'bold',
                    color: '#fff',
                    position: 'sticky',
                    left: 0,
                    background: '#1F4E79',
                    zIndex: 5,
                  }}>
                    TOTAL
                  </td>
                  {[
                    totalRow.open_bal, totalRow.bal_recd, totalRow.trn_bal_recd,
                    totalRow.avai_bal, totalRow.atm_withd, totalRow.withd,
                    totalRow.transf, totalRow.cc_pay, totalRow.cust_trf,
                    totalRow.charges, totalRow.closing_bal
                  ].map((v, i) => (
                    <td key={i} style={{
                      border: '1px solid #1a1a2e',
                      padding: '4px 6px',
                      fontSize: 12,
                      fontFamily: 'Calibri, Arial, sans-serif',
                      textAlign: 'right',
                      fontWeight: 'bold',
                      color: '#fff',
                    }}>
                      {v !== 0 ? fmtFull(v) : ''}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer info */}
      <div className="px-4 py-2 border-t border-[#e5e7eb] bg-white flex items-center gap-4 text-xs text-[#6b7280] flex-shrink-0">
        <span>{rows.length} accounts</span>
        <span className="flex items-center gap-1">
          <span style={{ display: 'inline-block', width: 10, height: 10, background: '#92D050', border: '1px solid #d1d5db' }} />
          Zero BAL RECD
        </span>
        <span className="flex items-center gap-1">
          <span style={{ display: 'inline-block', width: 10, height: 10, background: '#ffff00', border: '1px solid #d1d5db' }} />
          Non-zero value
        </span>
        <span className="flex items-center gap-1">
          <span style={{ display: 'inline-block', width: 10, height: 10, background: '#D9E1F2', border: '1px solid #d1d5db' }} />
          AVAI BAL (auto)
        </span>
        <span className="flex items-center gap-1">
          <span style={{ display: 'inline-block', width: 10, height: 10, background: '#C6EFCE', border: '1px solid #d1d5db' }} />
          Positive CLOSI BAL
        </span>
        <span className="ml-auto text-[10px]">Click any editable cell to edit • Enter to confirm • Esc to cancel</span>
      </div>
    </div>
  )
}
