'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronLeft, ChevronRight, Download, RefreshCw } from 'lucide-react'
import { AcSheetRow, loadAcSheet, saveAcSheetCell } from '@/lib/ac-sheet'
import { supabase } from '@/lib/supabase'

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtDate(d: string) {
  if (!d) return ''
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
}
function isoDate(d: Date) { return d.toISOString().split('T')[0] }
function prevDay(d: string) { const dt = new Date(d + 'T00:00:00'); dt.setDate(dt.getDate() - 1); return isoDate(dt) }
function nextDay(d: string) { const dt = new Date(d + 'T00:00:00'); dt.setDate(dt.getDate() + 1); return isoDate(dt) }
function fmt(n: number | null | undefined) { if (n == null || n === 0) return ''; return n.toLocaleString('en-IN') }
function fmtFull(n: number) { return n.toLocaleString('en-IN') }

const EDITABLE_FIELDS: (keyof AcSheetRow)[] = [
  'bal_recd','same_day_bal_paytm','same_day_bal_finkeda','same_day_bal_qr','same_day_bal',
  'trn_bal_recd','atm_withd','withd','transf','cc_pay','cust_trf','charges',
]

const COL_HEADERS = [
  { key: 'account_name'        as keyof AcSheetRow, label: '',                        width: 90  },
  { key: 'open_bal'            as keyof AcSheetRow, label: 'OPEN\nBAL',               width: 100 },
  { key: 'bal_recd'            as keyof AcSheetRow, label: 'BAL\nRECD',               width: 100 },
  { key: 'same_day_bal_paytm'  as keyof AcSheetRow, label: 'PAYTM',                   width: 100 },
  { key: 'same_day_bal_finkeda'as keyof AcSheetRow, label: 'FINKEDA',                 width: 100 },
  { key: 'same_day_bal_qr'     as keyof AcSheetRow, label: 'QR',                      width: 90  },
  { key: 'same_day_bal'        as keyof AcSheetRow, label: 'SAME\nDAY',               width: 90  },
  { key: 'trn_bal_recd'        as keyof AcSheetRow, label: 'TRN\nBAL',                width: 100 },
  { key: 'avai_bal'            as keyof AcSheetRow, label: 'AVAI\nBAL',               width: 100 },
  { key: 'atm_withd'           as keyof AcSheetRow, label: 'ATM\nWITHD',              width: 90  },
  { key: 'withd'               as keyof AcSheetRow, label: 'WITHD',                   width: 90  },
  { key: 'transf'              as keyof AcSheetRow, label: 'TRANSF',                  width: 90  },
  { key: 'cc_pay'              as keyof AcSheetRow, label: 'CC\nPAY',                 width: 90  },
  { key: 'cust_trf'            as keyof AcSheetRow, label: 'CUST\nTRF',               width: 90  },
  { key: 'charges'             as keyof AcSheetRow, label: 'CHARGES',                 width: 90  },
  { key: 'closing_bal'         as keyof AcSheetRow, label: 'CLOSING\nBAL',            width: 100 },
]

// ── Editable cell ──────────────────────────────────────────────────────────────
function EditableCell({ value, onSave, bg, bold, color }: {
  value: number; onSave: (v: number) => void
  bg?: string; bold?: boolean; color?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function startEdit() { setDraft(value === 0 ? '' : String(value)); setEditing(true); setTimeout(() => inputRef.current?.select(), 0) }
  function commit() { onSave(parseFloat(draft) || 0); setEditing(false) }

  const cellStyle: React.CSSProperties = {
    padding: '3px 6px', border: '1px solid #000', textAlign: 'right',
    background: bg || '#fff', fontWeight: bold ? 'bold' : 'normal',
    color: color || '#000', cursor: 'pointer', minWidth: 80, fontSize: 11,
    fontFamily: 'Calibri, Arial, sans-serif',
  }
  if (editing) return (
    <td style={{ ...cellStyle, padding: 0 }}>
      <input ref={inputRef} type="number" value={draft}
        onChange={e => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
        style={{ width: '100%', border: '2px solid #3ECF8E', outline: 'none', textAlign: 'right', padding: '3px 6px', fontSize: 11, fontFamily: 'Calibri, Arial, sans-serif', background: '#f0fdf4' }}
        autoFocus />
    </td>
  )
  return <td style={cellStyle} onClick={startEdit}>{value !== 0 ? fmtFull(value) : ''}</td>
}

// ── Single date table ──────────────────────────────────────────────────────────
function AcSheetDateTable({ date, rows, saving, onCellSave, isToday }: {
  date: string; rows: AcSheetRow[]; saving: string | null
  onCellSave: (date: string, rowIdx: number, field: keyof AcSheetRow, value: number) => void
  isToday: boolean
}) {
  const border = '1px solid #000'
  const HS: React.CSSProperties = {
    border, padding: '3px 6px', fontSize: 11, fontFamily: 'Calibri, Arial, sans-serif',
    background: '#FFFF00', color: '#000', fontWeight: 'bold', textAlign: 'center',
    whiteSpace: 'pre-line',
  }
  const CS: React.CSSProperties = {
    border, padding: '3px 6px', fontSize: 11, fontFamily: 'Calibri, Arial, sans-serif',
    background: '#fff', color: '#000', textAlign: 'right', whiteSpace: 'nowrap',
  }

  const totalRow = rows.reduce((acc, r) => ({
    open_bal: acc.open_bal + Number(r.open_bal),
    bal_recd: acc.bal_recd + Number(r.bal_recd),
    same_day_bal_paytm: acc.same_day_bal_paytm + Number(r.same_day_bal_paytm),
    same_day_bal_finkeda: acc.same_day_bal_finkeda + Number(r.same_day_bal_finkeda),
    same_day_bal_qr: acc.same_day_bal_qr + Number(r.same_day_bal_qr),
    same_day_bal: acc.same_day_bal + Number(r.same_day_bal),
    trn_bal_recd: acc.trn_bal_recd + Number(r.trn_bal_recd),
    avai_bal: acc.avai_bal + Number(r.avai_bal),
    atm_withd: acc.atm_withd + Number(r.atm_withd),
    withd: acc.withd + Number(r.withd),
    transf: acc.transf + Number(r.transf),
    cc_pay: acc.cc_pay + Number(r.cc_pay),
    cust_trf: acc.cust_trf + Number(r.cust_trf),
    charges: acc.charges + Number(r.charges),
    closing_bal: acc.closing_bal + Number(r.closing_bal),
  }), { open_bal:0,bal_recd:0,same_day_bal_paytm:0,same_day_bal_finkeda:0,same_day_bal_qr:0,same_day_bal:0,trn_bal_recd:0,avai_bal:0,atm_withd:0,withd:0,transf:0,cc_pay:0,cust_trf:0,charges:0,closing_bal:0 })

  return (
    <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', marginBottom: 24 }}>
      <colgroup>
        {COL_HEADERS.map(c => <col key={c.key} style={{ width: c.width }} />)}
      </colgroup>
      <thead>
        {/* Date title */}
        <tr>
          <th colSpan={COL_HEADERS.length} style={{
            ...HS, fontSize: 13, padding: '6px 10px', letterSpacing: 1,
            background: isToday ? '#3ECF8E' : '#FFFF00',
            color: isToday ? '#0f0f0f' : '#000',
          }}>
            AC Sheet — DT {fmtDate(date)}{isToday ? '  (Today)' : ''}
          </th>
        </tr>
        {/* Column headers */}
        <tr>
          {COL_HEADERS.map(col => (
            <th key={col.key} style={{ ...HS, textAlign: 'center' }}>{col.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIdx) => (
          <tr key={row.account_name + rowIdx}>
            {/* Account name */}
            <td style={{ ...CS, textAlign: 'left', fontWeight: 'bold', background: '#fff' }}>
              {row.account_name}
              {saving?.startsWith(row.account_name) && <span style={{ fontSize: 9, color: '#3ECF8E', marginLeft: 3 }}>saving…</span>}
            </td>
            {/* OPEN BAL */}
            <td style={{ ...CS }}>{fmt(row.open_bal)}</td>
            {/* BAL RECD */}
            <EditableCell value={Number(row.bal_recd)} bg={Number(row.bal_recd) === 0 ? '#92D050' : '#FFFF00'} onSave={v => onCellSave(date, rowIdx, 'bal_recd', v)} />
            {/* SAME DAY BALs */}
            {(['same_day_bal_paytm','same_day_bal_finkeda','same_day_bal_qr','same_day_bal','trn_bal_recd'] as (keyof AcSheetRow)[]).map(f => (
              <EditableCell key={f} value={Number(row[f])} bg={Number(row[f]) !== 0 ? '#FFFF00' : undefined} onSave={v => onCellSave(date, rowIdx, f, v)} />
            ))}
            {/* AVAI BAL */}
            <td style={{ ...CS, background: '#D9E1F2', fontWeight: 'bold' }}>{fmt(row.avai_bal)}</td>
            {/* Deductions */}
            {(['atm_withd','withd','transf','cc_pay','cust_trf'] as (keyof AcSheetRow)[]).map(f => (
              <EditableCell key={f} value={Number(row[f])} bg={Number(row[f]) !== 0 ? '#FFFF00' : undefined} onSave={v => onCellSave(date, rowIdx, f, v)} />
            ))}
            {/* CHARGES */}
            <EditableCell value={Number(row.charges)} bg='#FFFF00' onSave={v => onCellSave(date, rowIdx, 'charges', v)} />
            {/* CLOSING BAL */}
            <td style={{ ...CS, fontWeight: 'bold', background: Number(row.closing_bal) >= 0 ? '#C6EFCE' : '#FFC7CE', color: Number(row.closing_bal) >= 0 ? '#375623' : '#9C0006' }}>
              {fmtFull(Number(row.closing_bal))}
            </td>
          </tr>
        ))}
        {/* Totals */}
        {rows.length > 0 && (
          <tr style={{ background: '#BDD7EE' }}>
            <td style={{ ...CS, fontWeight: 'bold', textAlign: 'left', background: '#BDD7EE' }}>TOTAL</td>
            {[totalRow.open_bal,totalRow.bal_recd,totalRow.same_day_bal_paytm,totalRow.same_day_bal_finkeda,totalRow.same_day_bal_qr,totalRow.same_day_bal,totalRow.trn_bal_recd,totalRow.avai_bal,totalRow.atm_withd,totalRow.withd,totalRow.transf,totalRow.cc_pay,totalRow.cust_trf,totalRow.charges,totalRow.closing_bal].map((v, i) => (
              <td key={i} style={{ ...CS, fontWeight: 'bold', background: '#BDD7EE' }}>{v !== 0 ? fmtFull(v) : ''}</td>
            ))}
          </tr>
        )}
      </tbody>
    </table>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function AcSheetView() {
  const today = isoDate(new Date())
  const [selectedDate, setSelectedDate] = useState(today)
  const [allData, setAllData]   = useState<Record<string, AcSheetRow[]>>({})
  const [dates, setDates]       = useState<string[]>([])
  const [loading, setLoading]   = useState(false)
  const [saving, setSaving]     = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  // Load all dates that have ac_sheet rows
  const loadAll = useCallback(async () => {
    setLoading(true)
    // Get all distinct dates from ac_sheet
    const { data: dateRows } = await supabase
      .from('ac_sheet')
      .select('date')
      .order('date', { ascending: false })

    const uniqueDates = [...new Set((dateRows || []).map((r: { date: string }) => r.date))]

    // Always include today even if no rows yet
    if (!uniqueDates.includes(today)) uniqueDates.unshift(today)

    // Load each date
    const result: Record<string, AcSheetRow[]> = {}
    await Promise.all(uniqueDates.slice(0, 30).map(async (d) => {
      result[d] = await loadAcSheet(d)
    }))

    setDates(uniqueDates.slice(0, 30))
    setAllData(result)
    setLoading(false)
  }, [today])

  useEffect(() => { loadAll() }, [loadAll])

  // Realtime
  useEffect(() => {
    const channel = supabase.channel('ac_sheet_live_all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ac_sheet' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bank_account_master' }, loadAll)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadAll])

  async function handleCellSave(date: string, rowIdx: number, field: keyof AcSheetRow, value: number) {
    const row = allData[date]?.[rowIdx]
    if (!row) return
    setSaving(row.account_name + field)
    const updated = await saveAcSheetCell(row, field, value, (newId) => {
      setAllData(prev => ({ ...prev, [date]: prev[date].map((r, i) => i === rowIdx ? { ...r, id: newId } : r) }))
    })
    setAllData(prev => ({ ...prev, [date]: prev[date].map((r, i) => i === rowIdx ? updated : r) }))
    setSaving(null)
  }

  // ── Export ALL dates in one file ──────────────────────────────────────────────
  async function exportXlsx() {
    setExporting(true)
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('AC Sheet')
      const thin = { style: 'thin' as const }
      const border = { top: thin, left: thin, bottom: thin, right: thin }
      const xlWidths: Record<string, number> = {
        account_name: 16, open_bal: 13, bal_recd: 13, same_day_bal_paytm: 12,
        same_day_bal_finkeda: 12, same_day_bal_qr: 10, same_day_bal: 10,
        trn_bal_recd: 11, avai_bal: 13, atm_withd: 10, withd: 10, transf: 10,
        cc_pay: 10, cust_trf: 10, charges: 10, closing_bal: 13,
      }
      ws.columns = COL_HEADERS.map(c => ({ width: xlWidths[c.key as string] ?? 12 }))

      let rowNum = 1

      for (const date of dates) {
        const rows = allData[date] || []
        const numCols = COL_HEADERS.length

        // Date title row
        ws.mergeCells(rowNum, 1, rowNum, numCols)
        const titleCell = ws.getCell(rowNum, 1)
        titleCell.value = `AC Sheet — ${fmtDate(date)}${date === today ? ' (Today)' : ''}`
        titleCell.font = { bold: true, size: 13, color: { argb: 'FF000000' } }
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: date === today ? 'FF3ECF8E' : 'FFFFFF00' } }
        titleCell.border = border
        ws.getRow(rowNum).height = 22
        rowNum++

        // Column headers
        COL_HEADERS.forEach((col, i) => {
          const cell = ws.getCell(rowNum, i + 1)
          cell.value = col.label.replace(/\n/g, '\n')
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E6DA4' } }
          cell.border = border
        })
        ws.getRow(rowNum).height = 28
        rowNum++

        // Data rows
        const totals: Record<string, number> = {}
        rows.forEach(row => {
          COL_HEADERS.forEach((col, ci) => {
            const cell = ws.getCell(rowNum, ci + 1)
            const val = row[col.key]
            const isNum = col.key !== 'account_name'
            cell.value = isNum ? (Number(val) || 0) : String(val || '')
            cell.font = { size: 11, bold: ['avai_bal','closing_bal','account_name'].includes(col.key as string) }
            cell.alignment = { horizontal: isNum ? 'right' : 'left', vertical: 'middle' }
            cell.border = border
            cell.numFmt = isNum ? '#,##0' : '@'
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
            if (col.key === 'bal_recd') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: Number(val) === 0 ? 'FF92D050' : 'FFFFFF00' } }
            if (['same_day_bal_paytm','same_day_bal_finkeda','same_day_bal_qr','same_day_bal','trn_bal_recd','atm_withd','withd','transf','cc_pay','cust_trf','charges'].includes(col.key as string) && Number(val) !== 0)
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
            if (col.key === 'avai_bal') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } }
            if (col.key === 'closing_bal') {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: Number(val) >= 0 ? 'FFC6EFCE' : 'FFFFC7CE' } }
              cell.font = { bold: true, size: 11, color: { argb: Number(val) >= 0 ? 'FF375623' : 'FF9C0006' } }
            }
            if (isNum) totals[col.key] = (totals[col.key] || 0) + (Number(val) || 0)
          })
          ws.getRow(rowNum).height = 18
          rowNum++
        })

        // Totals row
        if (rows.length > 0) {
          COL_HEADERS.forEach((col, ci) => {
            const cell = ws.getCell(rowNum, ci + 1)
            if (col.key === 'account_name') { cell.value = 'TOTAL'; cell.font = { bold: true, size: 11 }; cell.alignment = { horizontal: 'left', vertical: 'middle' } }
            else { cell.value = totals[col.key] || 0; cell.font = { bold: true, size: 11 }; cell.alignment = { horizontal: 'right', vertical: 'middle' }; cell.numFmt = '#,##0' }
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDD7EE' } }
            cell.border = border
          })
          ws.getRow(rowNum).height = 18
          rowNum++
        }

        // Spacer rows between dates
        for (let i = 0; i < 3; i++) {
          ws.getRow(rowNum).height = 10
          rowNum++
        }
      }

      const buf = await wb.xlsx.writeBuffer()
      const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const a = document.createElement('a'); a.href = url
      a.download = `ACSheet_All_${today}.xlsx`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 10000)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: '#fafafa' }}>

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[#e5e7eb] bg-white flex-shrink-0 flex-wrap">
        <div className="flex items-center gap-1">
          <button onClick={() => setSelectedDate(prevDay(selectedDate))} className="p-1.5 rounded border hover:bg-gray-50" style={{ borderColor: '#e5e7eb' }}><ChevronLeft size={14} /></button>
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
            className="border rounded-md px-3 py-1.5 text-sm font-medium outline-none focus:border-[#3ECF8E]"
            style={{ borderColor: '#e5e7eb' }} />
          <button onClick={() => setSelectedDate(nextDay(selectedDate))} disabled={selectedDate >= today} className="p-1.5 rounded border hover:bg-gray-50 disabled:opacity-40" style={{ borderColor: '#e5e7eb' }}><ChevronRight size={14} /></button>
        </div>

        {selectedDate !== today && (
          <button onClick={() => setSelectedDate(today)} className="px-3 py-1 rounded text-sm font-semibold" style={{ background: '#3ECF8E', color: '#fff' }}>Today</button>
        )}

        <span className="text-xs text-[#6b7280]">Showing {dates.length} dates</span>

        <div className="flex-1" />

        <button onClick={loadAll} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-medium hover:bg-gray-50" style={{ borderColor: '#e5e7eb' }}>
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
        <button onClick={exportXlsx} disabled={exporting} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium text-white" style={{ background: exporting ? '#9ca3af' : '#3ECF8E' }}>
          <Download size={12} /> {exporting ? 'Exporting...' : 'Export All .xlsx'}
        </button>
      </div>

      {/* All date tables */}
      <div className="flex-1 overflow-auto p-4" style={{ fontFamily: 'Calibri, Arial, sans-serif' }}>
        {loading ? (
          <div className="flex items-center justify-center h-48 text-sm text-[#6b7280]">Loading AC Sheet…</div>
        ) : (
          dates.map(date => (
            <div key={date} id={`ac-date-${date}`}>
              <AcSheetDateTable
                date={date}
                rows={allData[date] || []}
                saving={saving}
                onCellSave={handleCellSave}
                isToday={date === today}
              />
            </div>
          ))
        )}
      </div>
    </div>
  )
}
