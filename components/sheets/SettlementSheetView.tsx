'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Download } from 'lucide-react'

interface SettlementRow {
  id: string
  sr_no: number
  date: string
  customer_name: string
  bank_card: string
  account_name: string
  swap_name: string
  total_amount: number
  swap_amount: number
  paid_in_cash: number | null
  cash_type: string | null
  payment_modes: { mode: string; amount: number; accountName?: string | null }[] | null
  commission_pct: number
  commission_amount: number
  commission_type: string
  remarks: string
  release_status: string
  created_at: string
}

const CS: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: 12,
  border: '1px solid #e5e7eb',
  whiteSpace: 'nowrap',
  textAlign: 'left',
}

function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return n.toLocaleString('en-IN')
}

function fmtDate(d: string) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y.slice(2)}`
}

function fmtDateTime(iso: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
}

interface ReleaseInfo {
  transaction_id: string
  created_at: string
  settled_by: string | null
}

export default function SettlementSheetView() {
  const [rows, setRows] = useState<SettlementRow[]>([])
  const [releaseMap, setReleaseMap] = useState<Record<string, ReleaseInfo>>({})
  const [profileMap, setProfileMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [dateFilter, setDateFilter] = useState(() => new Date().toISOString().split('T')[0])
  const [showAll, setShowAll] = useState(false)

  const fetchRows = useCallback(async () => {
    setLoading(true)

    // Get all released transaction IDs — select * so it works with or without settled_by column
    const { data: released, error: relErr } = await supabase.from('swap_releases').select('*')
    if (relErr) console.error('[SettlementSheet] swap_releases fetch failed:', relErr)
    const rMap: Record<string, ReleaseInfo> = {}
    ;(released || []).forEach((r: ReleaseInfo) => { rMap[r.transaction_id] = r })
    const releasedIds = new Set(Object.keys(rMap))
    setReleaseMap(rMap)

    // Fetch profiles for settler names
    const settlerIds = Array.from(new Set((released || []).map((r: ReleaseInfo) => r.settled_by).filter(Boolean))) as string[]
    if (settlerIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id,full_name').in('id', settlerIds)
      const pMap: Record<string, string> = {}
      ;(profiles || []).forEach((p: { id: string; full_name: string }) => { pMap[p.id] = p.full_name })
      setProfileMap(pMap)
    }

    let query = supabase
      .from('transactions')
      .select('*')
      .eq('entry_type', 'swap')
      .order('date', { ascending: false })
      .order('sr_no', { ascending: true })

    if (!showAll) {
      query = query.eq('date', dateFilter)
    }

    const { data } = await query
    // Merge settled status from swap_releases
    const rows = (data || []).map((r: SettlementRow) => ({
      ...r,
      release_status: releasedIds.has(r.id) ? 'released' : 'pending',
    }))
    setRows(rows as SettlementRow[])
    setLoading(false)
  }, [dateFilter, showAll])

  useEffect(() => { fetchRows() }, [fetchRows])

  const settled = rows.filter(r => r.release_status === 'released')
  const notSettled = rows.filter(r => r.release_status !== 'released' || r.release_status == null)
  const totalSwap = rows.reduce((s, r) => s + (r.swap_amount || r.total_amount), 0)
  const totalComm = rows.reduce((s, r) => s + (r.commission_amount || 0), 0)

  // Group by account for summary
  const byAccount = rows.reduce<Record<string, { swap: number; count: number }>>((acc, r) => {
    const key = r.account_name || '—'
    if (!acc[key]) acc[key] = { swap: 0, count: 0 }
    acc[key].swap += r.swap_amount || r.total_amount
    acc[key].count++
    return acc
  }, {})

  async function exportExcel() {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Settlement Sheet')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const addBorder = (c: any) => {
      c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
    }
    const headerRow = ws.addRow(['SR NO', 'DATE', 'CUSTOMER NAME', 'BANK CARD', 'ACCOUNT', 'MACHINE', 'TOTAL AMT', 'SWAP AMT', 'CASH TYPE', 'PAID IN CASH', 'COMM %', 'COMM AMT', 'COMM TYPE', 'REMARKS'])
    headerRow.eachCell(c => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3ECF8E' } }
      c.font = { bold: true, name: 'Calibri', size: 11 }
      addBorder(c)
      c.alignment = { horizontal: 'center', vertical: 'middle' }
    })
    rows.forEach((r, i) => {
      const dr = ws.addRow([r.sr_no, r.date, r.customer_name, r.bank_card, r.account_name, r.swap_name, r.total_amount, r.swap_amount || r.total_amount, r.cash_type || '', r.paid_in_cash || '', r.commission_pct, r.commission_amount || 0, r.commission_type, r.remarks])
      dr.eachCell({ includeEmpty: true }, c => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFFFFFFF' : 'FFFFFDE7' } }
        c.font = { name: 'Calibri', size: 11 }
        addBorder(c)
      })
    })
    ws.columns.forEach(col => { col.width = 16 })
    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `settlement_${dateFilter}.xlsx`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0" style={{ borderColor: '#e5e7eb', background: '#fff' }}>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-[#1a1a1a] uppercase tracking-wide">Settlement Sheet — Card Swap</span>
          <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: '#f0fdf4', color: '#16a34a' }}>
            {rows.length} entries
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-[#6b7280] cursor-pointer">
            <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
            All dates
          </label>
          {!showAll && (
            <input
              type="date"
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
              className="border rounded px-2 py-1 text-xs"
              style={{ borderColor: '#e5e7eb' }}
            />
          )}
          <button
            onClick={exportExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold"
            style={{ background: '#3ECF8E', color: '#fff' }}
          >
            <Download size={12} /> Export
          </button>
        </div>
      </div>

      {/* Account summary chips */}
      {Object.keys(byAccount).length > 0 && (
        <div className="flex gap-2 px-4 py-2 flex-wrap border-b flex-shrink-0" style={{ borderColor: '#f3f4f6', background: '#fafafa' }}>
          {Object.entries(byAccount).map(([acc, { swap, count }]) => (
            <div key={acc} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534' }}>
              <span>{acc}</span>
              <span className="text-[#6b7280]">·</span>
              <span>{count} txn</span>
              <span className="text-[#6b7280]">·</span>
              <span>₹{fmt(swap)}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7' }}>
            ✓ Settled: {settled.length}
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: '#fef9c3', color: '#92400e', border: '1px solid #fde68a' }}>
            ⏳ Pending: {notSettled.length}
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ml-auto" style={{ background: '#1a1a1a', color: '#fff' }}>
            Total: ₹{fmt(totalSwap)}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-sm text-[#9ca3af]">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-[#9ca3af]">No released settlements for this date</div>
        ) : (
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr style={{ background: '#3ECF8E' }}>
                {['SR', 'DATE', 'CUSTOMER', 'BANK CARD', 'ACCOUNT', 'MACHINE', 'TOTAL AMT', 'SWAP AMT', 'CASH TYPE', 'PAID CASH', 'COMM %', 'COMM AMT', 'COMM TYPE', 'SETTLEMENT', 'SETTLED AT', 'SETTLED BY'].map(h => (
                  <th key={h} style={{ ...CS, fontWeight: 700, color: '#fff', background: '#3ECF8E', textAlign: 'center' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ ...CS, textAlign: 'center', color: '#6b7280' }}>{r.sr_no}</td>
                  <td style={{ ...CS, textAlign: 'center' }}>{fmtDate(r.date)}</td>
                  <td style={{ ...CS, fontWeight: 600 }}>{r.customer_name}</td>
                  <td style={{ ...CS }}>{r.bank_card || '—'}</td>
                  <td style={{ ...CS, color: '#1d4ed8', fontWeight: 500 }}>{r.account_name}</td>
                  <td style={{ ...CS }}>{r.swap_name || '—'}</td>
                  <td style={{ ...CS, textAlign: 'right', fontWeight: 500 }}>₹{fmt(r.total_amount)}</td>
                  <td style={{ ...CS, textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>₹{fmt(r.swap_amount || r.total_amount)}</td>
                  <td style={{ ...CS }}>
                    {r.payment_modes && r.payment_modes.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {r.payment_modes.map((pm, pi) => (
                          <div key={pi} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{
                              background: pm.mode === 'CASH' ? '#fef9c3' : pm.mode === 'GPAY' ? '#dbeafe' : pm.mode === 'PHONEPAY' ? '#ede9fe' : pm.mode === 'UPI' ? '#dcfce7' : pm.mode === 'NEFT' ? '#ffedd5' : '#fce7f3',
                              color: pm.mode === 'CASH' ? '#713f12' : pm.mode === 'GPAY' ? '#1e40af' : pm.mode === 'PHONEPAY' ? '#5b21b6' : pm.mode === 'UPI' ? '#166534' : pm.mode === 'NEFT' ? '#9a3412' : '#9d174d',
                              padding: '1px 5px', borderRadius: 3, fontWeight: 700, fontSize: 10, whiteSpace: 'nowrap',
                            }}>{pm.mode}</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>₹{Number(pm.amount).toLocaleString('en-IN')}</span>
                            {pm.accountName && <span style={{ fontSize: 10, color: '#6b7280' }}>({pm.accountName})</span>}
                          </div>
                        ))}
                      </div>
                    ) : r.cash_type ? (
                      <span style={{ background: '#fef9c3', color: '#713f12', padding: '1px 6px', borderRadius: 4, fontWeight: 600, fontSize: 10 }}>{r.cash_type}</span>
                    ) : '—'}
                  </td>
                  <td style={{ ...CS, textAlign: 'right' }}>{r.paid_in_cash ? `₹${fmt(r.paid_in_cash)}` : '—'}</td>
                  <td style={{ ...CS, textAlign: 'center' }}>{r.commission_pct}%</td>
                  <td style={{ ...CS, textAlign: 'right', color: '#dc2626', fontWeight: 500 }}>₹{fmt(r.commission_amount)}</td>
                  <td style={{ ...CS, textAlign: 'center' }}>
                    <span style={{
                      padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                      background: r.commission_type === 'Inclusive' ? '#f0fdf4' : r.commission_type === 'Deferred' ? '#fff7ed' : '#eff6ff',
                      color: r.commission_type === 'Inclusive' ? '#166534' : r.commission_type === 'Deferred' ? '#9a3412' : '#1e40af',
                    }}>{r.commission_type}</span>
                  </td>
                  <td style={{ ...CS, textAlign: 'center' }}>
                    <span style={{
                      padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                      background: r.release_status === 'released' ? '#d1fae5' : '#fef9c3',
                      color: r.release_status === 'released' ? '#065f46' : '#92400e',
                    }}>
                      {r.release_status === 'released' ? '✓ Settled' : '⏳ Not Settled'}
                    </span>
                  </td>
                  <td style={{ ...CS, textAlign: 'center', fontSize: 11, color: '#374151' }}>
                    {releaseMap[r.id] ? fmtDateTime(releaseMap[r.id].created_at) : '—'}
                  </td>
                  <td style={{ ...CS, fontWeight: 600, color: '#1d4ed8', whiteSpace: 'nowrap' }}>
                    {releaseMap[r.id]?.settled_by ? (profileMap[releaseMap[r.id].settled_by!] || '—') : '—'}
                  </td>
                </tr>
              ))}
              {/* Total row */}
              <tr style={{ background: '#f0fdf4', fontWeight: 700, borderTop: '2px solid #3ECF8E' }}>
                <td colSpan={6} style={{ ...CS, textAlign: 'right', fontWeight: 700 }}>TOTAL ({rows.length})</td>
                <td style={{ ...CS, textAlign: 'right' }}>₹{fmt(rows.reduce((s, r) => s + r.total_amount, 0))}</td>
                <td style={{ ...CS, textAlign: 'right', color: '#16a34a' }}>₹{fmt(totalSwap)}</td>
                <td colSpan={3} style={{ ...CS }}></td>
                <td style={{ ...CS, textAlign: 'right', color: '#dc2626' }}>₹{fmt(totalComm)}</td>
                <td colSpan={4} style={{ ...CS }}></td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
