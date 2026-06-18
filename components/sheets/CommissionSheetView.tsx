'use client'

import React, { useCallback, useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Plus, RefreshCw, Download, X, Bell, Check, AlertCircle,
  CreditCard, Banknote, Building2, Search,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────
interface CommissionRow {
  id: string
  transaction_id: string | null
  date: string
  sr_no: number | null
  customer_name: string
  swap_machine: string
  commission_pct: number
  commission_amount: number
  commission_type: string
  payment_mode: string | null
  payment_mode_detail: string | null
  status: string
  paid_date: string | null
  paid_amount: number
  notes: string
  created_at: string
}
interface UpiAccount { id: string; display_name: string; upi_id: string; status: string }
interface NetBankingAccount { id: string; display_name: string; bank_name: string; account_number: string; ifsc: string; status: string }

// ── Styles ─────────────────────────────────────────────────────────────────────
const HS: React.CSSProperties = {
  border: '1px solid #000', padding: '4px 8px', fontSize: 12,
  fontFamily: 'Calibri,Arial,sans-serif', background: '#FFD700',
  color: '#000', fontWeight: 'bold', textAlign: 'center', whiteSpace: 'nowrap',
}
const CS: React.CSSProperties = {
  border: '1px solid #000', padding: '3px 7px', fontSize: 12,
  fontFamily: 'Calibri,Arial,sans-serif', background: '#fff',
  color: '#000', whiteSpace: 'nowrap', overflow: 'hidden',
  textOverflow: 'ellipsis', verticalAlign: 'middle', textAlign: 'center',
}
const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  Inclusive: { bg: '#d1fae5', text: '#065f46' },
  Exclusive: { bg: '#dbeafe', text: '#1e40af' },
  Deferred:  { bg: '#fef3c7', text: '#92400e' },
}
const MODE_COLORS: Record<string, { bg: string; text: string }> = {
  UPI:           { bg: '#ede9fe', text: '#5b21b6' },
  Cash:          { bg: '#dcfce7', text: '#166534' },
  'Net Banking': { bg: '#dbeafe', text: '#1e40af' },
}

function fmtAmt(n: number | null | undefined) {
  if (n == null) return '—'
  return '₹' + n.toLocaleString('en-IN')
}
function fmtDate(d: string | null) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${parseInt(day)}/${parseInt(m)}/${y.slice(2)}`
}
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function CommissionSheetView() {
  const [rows, setRows] = useState<CommissionRow[]>([])
  const [upiAccounts, setUpiAccounts] = useState<UpiAccount[]>([])
  const [netBankingAccounts, setNetBankingAccounts] = useState<NetBankingAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'dashboard' | 'all' | 'deferred' | 'upi' | 'net_banking' | 'cash' | 'reminders'>('dashboard')
  const [activeUpi, setActiveUpi] = useState('__all__')
  const [activeBank, setActiveBank] = useState('__all__')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // Payment modal
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [payingRow, setPayingRow] = useState<CommissionRow | null>(null)
  const [payMode, setPayMode] = useState<'UPI' | 'Cash' | 'Net Banking'>('UPI')
  const [payDetail, setPayDetail] = useState('')
  const [payDate, setPayDate] = useState(todayStr())
  const [payNotes, setPayNotes] = useState('')
  const [paySubmitting, setPaySubmitting] = useState(false)

  // UPI management
  const [showUpiPanel, setShowUpiPanel] = useState(false)
  const [newUpiName, setNewUpiName] = useState('')
  const [newUpiId, setNewUpiId] = useState('')
  const [upiSubmitting, setUpiSubmitting] = useState(false)

  // Net Banking management
  const [showNetPanel, setShowNetPanel] = useState(false)
  const [newBankDisplay, setNewBankDisplay] = useState('')
  const [newBankName, setNewBankName] = useState('')
  const [newBankAccount, setNewBankAccount] = useState('')
  const [newBankIfsc, setNewBankIfsc] = useState('')
  const [netSubmitting, setNetSubmitting] = useState(false)

  // Reminder modal
  const [showReminderModal, setShowReminderModal] = useState(false)
  const [reminderRow, setReminderRow] = useState<CommissionRow | null>(null)
  const [reminderDate, setReminderDate] = useState('')
  const [reminderTime, setReminderTime] = useState('10:00')
  const [reminderNote, setReminderNote] = useState('')
  const [reminders, setReminders] = useState<{ id: string; title: string; reminder_date: string; status: string; amount: number }[]>([])

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3500)
  }

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [{ data: cs }, { data: upi }, { data: nb }, { data: rem }] = await Promise.all([
      supabase.from('commission_sheet').select('*').order('date', { ascending: false }).order('sr_no', { ascending: false }),
      supabase.from('upi_accounts').select('*').eq('status', 'Active').order('display_name'),
      supabase.from('net_banking_accounts').select('*').eq('status', 'Active').order('display_name'),
      supabase.from('reminders').select('id,title,reminder_date,status,amount').eq('type', 'commission').order('reminder_date'),
    ])
    const upiList = (upi as UpiAccount[]) || []
    const nbList  = (nb as NetBankingAccount[]) || []
    setRows((cs as CommissionRow[]) || [])
    setUpiAccounts(upiList)
    setNetBankingAccounts(nbList)
    setReminders((rem as typeof reminders) || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    const ch = supabase.channel('commission_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commission_sheet' }, fetchAll)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchAll])

  // ── Derived data ────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let r = rows
    if (activeTab === 'deferred')         r = r.filter(x => x.commission_type === 'Deferred')
    else if (activeTab === 'cash')        r = r.filter(x => x.payment_mode === 'Cash')
    else if (activeTab === 'upi')         r = r.filter(x => x.payment_mode === 'UPI' && (!activeUpi || activeUpi === '__all__' || !x.payment_mode_detail || x.payment_mode_detail === activeUpi))
    else if (activeTab === 'net_banking') r = r.filter(x => x.payment_mode === 'Net Banking' && (!activeBank || activeBank === '__all__' || !x.payment_mode_detail || x.payment_mode_detail === activeBank))
    if (search) {
      const q = search.toLowerCase()
      r = r.filter(x => x.customer_name.toLowerCase().includes(q) || x.swap_machine.toLowerCase().includes(q))
    }
    return r
  }, [rows, activeTab, activeUpi, activeBank, search])

  const stats = useMemo(() => ({
    total:           rows.reduce((s, r) => s + r.commission_amount, 0),
    paid:            rows.filter(r => r.status === 'Paid').reduce((s, r) => s + r.commission_amount, 0),
    pending:         rows.filter(r => r.status === 'Pending').reduce((s, r) => s + r.commission_amount, 0),
    inclusive:       rows.filter(r => r.commission_type === 'Inclusive').reduce((s, r) => s + r.commission_amount, 0),
    exclusive:       rows.filter(r => r.commission_type === 'Exclusive').reduce((s, r) => s + r.commission_amount, 0),
    deferred:        rows.filter(r => r.commission_type === 'Deferred').reduce((s, r) => s + r.commission_amount, 0),
    deferredPending: rows.filter(r => r.commission_type === 'Deferred' && r.status === 'Pending').reduce((s, r) => s + r.commission_amount, 0),
    deferredCount:   rows.filter(r => r.commission_type === 'Deferred' && r.status === 'Pending').length,
  }), [rows])

  // ── Actions ─────────────────────────────────────────────────────────────────
  async function handleRecordPayment() {
    if (!payingRow) return
    setPaySubmitting(true)
    const amount = payingRow.commission_amount
    const { error } = await supabase.from('commission_sheet').update({
      status: 'Paid', payment_mode: payMode,
      payment_mode_detail: payDetail || null,
      paid_date: payDate, paid_amount: amount,
      notes: payNotes || payingRow.notes,
    }).eq('id', payingRow.id)
    if (error) { showToast('Update failed: ' + error.message, 'error'); setPaySubmitting(false); return }
    if (payMode === 'Cash') {
      await supabase.rpc('initialize_chamunda_sheet', { p_date: payDate })
      const { error: cErr } = await supabase.from('chamunda_sheet').insert({
        date: payDate, row_type: 'opening_person', sort_order: 35,
        opening_name: payingRow.customer_name, opening_amount: amount,
        transaction_id: payingRow.transaction_id || null,
      })
      if (!cErr) await supabase.rpc('recalculate_chamunda_totals', { p_date: payDate })
    }
    await supabase.from('reminders').update({ status: 'completed' }).eq('type', 'commission').ilike('title', `%${payingRow.customer_name}%`)
    showToast('Payment recorded')
    setShowPaymentModal(false); setPayingRow(null); setPayMode('UPI'); setPayDetail(''); setPayNotes('')
    fetchAll(); setPaySubmitting(false)
  }

  async function handleAddUpi() {
    if (!newUpiName.trim() || !newUpiId.trim()) { showToast('Name and UPI ID required', 'error'); return }
    setUpiSubmitting(true)
    const { error } = await supabase.from('upi_accounts').insert({ display_name: newUpiName.trim(), upi_id: newUpiId.trim() })
    if (error) showToast('Failed: ' + error.message, 'error')
    else { showToast('UPI account added'); setNewUpiName(''); setNewUpiId(''); fetchAll() }
    setUpiSubmitting(false)
  }

  async function handleAddNetBanking() {
    if (!newBankDisplay.trim() || !newBankName.trim()) { showToast('Display name and bank name required', 'error'); return }
    setNetSubmitting(true)
    const { error } = await supabase.from('net_banking_accounts').insert({
      display_name: newBankDisplay.trim(), bank_name: newBankName.trim(),
      account_number: newBankAccount.trim(), ifsc: newBankIfsc.trim(),
    })
    if (error) showToast('Failed: ' + error.message, 'error')
    else { showToast('Bank account added'); setNewBankDisplay(''); setNewBankName(''); setNewBankAccount(''); setNewBankIfsc(''); fetchAll() }
    setNetSubmitting(false)
  }

  async function handleSetReminder() {
    if (!reminderRow || !reminderDate) return
    const { error } = await supabase.from('reminders').insert({
      title: `Collect commission — ${reminderRow.customer_name}`,
      description: reminderNote || `SR #${reminderRow.sr_no} — ${fmtAmt(reminderRow.commission_amount)}`,
      reminder_date: reminderDate, reminder_time: reminderTime + ':00',
      type: 'commission', customer_name: reminderRow.customer_name,
      amount: reminderRow.commission_amount, status: 'pending',
    })
    if (error) showToast('Reminder failed: ' + error.message, 'error')
    else { showToast('Reminder set'); setShowReminderModal(false); setReminderRow(null); fetchAll() }
  }

  async function exportXlsx() {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Commission Sheet')
    const border = { top: { style: 'thin' as const, color: { argb: 'FF000000' } }, bottom: { style: 'thin' as const, color: { argb: 'FF000000' } }, left: { style: 'thin' as const, color: { argb: 'FF000000' } }, right: { style: 'thin' as const, color: { argb: 'FF000000' } } }
    ws.columns = [{ width: 6 }, { width: 12 }, { width: 22 }, { width: 18 }, { width: 10 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 10 }, { width: 16 }, { width: 20 }]
    const hRow = ws.addRow(['SR NO', 'DATE', 'CUSTOMER NAME', 'SWAP MACHINE', 'COMM %', 'COMM AMT', 'COMM TYPE', 'PAY MODE', 'PAY DETAIL', 'STATUS', 'PAID DATE', 'NOTES'])
    hRow.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD700' } }; c.font = { bold: true, name: 'Calibri', size: 11 }; c.border = border; c.alignment = { horizontal: 'center', vertical: 'middle' } })
    filtered.forEach((r, i) => {
      const dr = ws.addRow([r.sr_no || i + 1, r.date, r.customer_name, r.swap_machine, r.commission_pct, r.commission_amount, r.commission_type, r.payment_mode || '', r.payment_mode_detail || '', r.status, r.paid_date || '', r.notes || ''])
      dr.eachCell({ includeEmpty: true }, (c, col) => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFFFFFFF' : 'FFFFFDE7' } }
        c.font = { name: 'Calibri', size: 11 }; c.border = border
        if (col === 5 || col === 6) { c.numFmt = '#,##0.00'; c.alignment = { horizontal: 'right', vertical: 'middle' } }
        else c.alignment = { horizontal: 'center', vertical: 'middle' }
      })
    })
    const buf = await wb.xlsx.writeBuffer()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    a.download = `CommissionSheet_${todayStr()}.xlsx`; a.click(); URL.revokeObjectURL(a.href)
  }

  // ── Badge helpers (plain functions, not components) ─────────────────────────
  const typeBadge = (type: string) => {
    const c = TYPE_COLORS[type] || { bg: '#f3f4f6', text: '#374151' }
    return <span style={{ background: c.bg, color: c.text, borderRadius: 4, padding: '1px 7px', fontSize: 11, fontWeight: 600 }}>{type}</span>
  }
  const modeBadge = (mode: string | null) => {
    if (!mode) return <span style={{ color: '#9ca3af', fontSize: 11 }}>—</span>
    const c = MODE_COLORS[mode] || { bg: '#f3f4f6', text: '#374151' }
    return <span style={{ background: c.bg, color: c.text, borderRadius: 4, padding: '1px 7px', fontSize: 11, fontWeight: 600 }}>{mode}</span>
  }
  const statusBadge = (status: string) => {
    const ok = status === 'Paid'
    return <span style={{ background: ok ? '#d1fae5' : '#fef3c7', color: ok ? '#065f46' : '#92400e', borderRadius: 4, padding: '1px 7px', fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>{ok ? <Check size={10} /> : <AlertCircle size={10} />}{status}</span>
  }

  const inp = 'w-full rounded border px-2.5 py-1.5 text-xs outline-none focus:border-[#3ECF8E]'
  const lb  = 'block text-[11px] font-medium text-[#374151] mb-0.5'

  // ── Sheet table JSX ─────────────────────────────────────────────────────────
  const sheetTableJsx = loading
    ? <div className="flex items-center justify-center h-32 text-sm text-[#6b7280]">Loading...</div>
    : filtered.length === 0
      ? <div className="flex items-center justify-center h-32 text-sm text-[#9ca3af]">No entries found.</div>
      : (
        <div className="overflow-auto flex-1" style={{ fontFamily: 'Calibri,Arial,sans-serif' }}>
          <table style={{ borderCollapse: 'collapse', minWidth: 1000 }}>
            <thead>
              <tr>
                {['SR NO', 'DATE', 'CUSTOMER NAME', 'SWIPE MACHINE', 'COMM %', 'COMM AMOUNT', 'TYPE', 'PAY MODE', 'DETAIL', 'STATUS', 'ACTION'].map(h => (
                  <th key={h} style={HS}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#fffde7' }}>
                  <td style={{ ...CS, width: 60, color: '#6b7280' }}>{r.sr_no || i + 1}</td>
                  <td style={{ ...CS, width: 90 }}>{fmtDate(r.date)}</td>
                  <td style={{ ...CS, width: 180, textAlign: 'left' }}>{r.customer_name}</td>
                  <td style={{ ...CS, width: 150 }}>{r.swap_machine || '—'}</td>
                  <td style={{ ...CS, width: 70 }}>{r.commission_pct}%</td>
                  <td style={{ ...CS, width: 120, fontWeight: 'bold', color: r.status === 'Pending' ? '#dc2626' : '#16a34a' }}>{fmtAmt(r.commission_amount)}</td>
                  <td style={{ ...CS, width: 100 }}>{typeBadge(r.commission_type)}</td>
                  <td style={{ ...CS, width: 110 }}>{modeBadge(r.payment_mode)}</td>
                  <td style={{ ...CS, width: 130, fontSize: 11 }}>{r.payment_mode_detail || '—'}</td>
                  <td style={{ ...CS, width: 80 }}>{statusBadge(r.status)}</td>
                  <td style={{ ...CS, width: 120 }}>
                    {r.status === 'Pending' && r.commission_type === 'Deferred' && (
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        <button onClick={() => { setPayingRow(r); setShowPaymentModal(true) }}
                          style={{ background: '#3ECF8E', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer', fontWeight: 600 }}>
                          Collect
                        </button>
                        <button onClick={() => { setReminderRow(r); const d = new Date(); d.setDate(d.getDate() + 7); setReminderDate(d.toISOString().split('T')[0]); setShowReminderModal(true) }}
                          style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer' }}>
                          <Bell size={10} />
                        </button>
                      </div>
                    )}
                    {r.status === 'Paid' && <span style={{ fontSize: 10, color: '#16a34a' }}>{fmtDate(r.paid_date)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )

  // ── Main render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium text-white ${toast.type === 'success' ? 'bg-[#3ECF8E]' : 'bg-red-500'}`}>
          {toast.msg}
        </div>
      )}

      {/* ── Tab bar ── */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', background: '#f9f9f9', flexShrink: 0, alignItems: 'center', overflowX: 'auto' }}>
        {([
          { id: 'dashboard',   label: 'Dashboard' },
          { id: 'all',         label: 'All Entries' },
          { id: 'deferred',    label: 'Deferred' },
          { id: 'upi',         label: 'UPI' },
          { id: 'net_banking', label: 'Net Banking' },
          { id: 'cash',        label: 'Cash' },
          { id: 'reminders',   label: 'Reminders' },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{ padding: '8px 14px', fontSize: 12, fontWeight: activeTab === t.id ? 'bold' : 'normal', background: activeTab === t.id ? '#fff' : 'transparent', borderBottom: activeTab === t.id ? '2px solid #3ECF8E' : '2px solid transparent', borderTop: 'none', borderLeft: 'none', borderRight: '1px solid #e5e7eb', cursor: 'pointer', whiteSpace: 'nowrap', color: activeTab === t.id ? '#1a1a1a' : '#6b7280', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            {t.label}
            {t.id === 'deferred' && stats.deferredCount > 0 && (
              <span style={{ background: '#dc2626', color: '#fff', borderRadius: 99, fontSize: 9, padding: '0 5px', minWidth: 16, textAlign: 'center' }}>
                {stats.deferredCount}
              </span>
            )}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px' }}>
          {(activeTab === 'all' || activeTab === 'deferred' || activeTab === 'upi' || activeTab === 'net_banking' || activeTab === 'cash') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid #e5e7eb', borderRadius: 6, padding: '3px 8px' }}>
              <Search size={11} color="#9ca3af" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." style={{ border: 'none', outline: 'none', fontSize: 11, width: 100, fontFamily: 'inherit' }} />
              {search && <button onClick={() => setSearch('')}><X size={10} color="#9ca3af" /></button>}
            </div>
          )}
          <button onClick={fetchAll} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 8px', background: 'white', cursor: 'pointer' }}>
            <RefreshCw size={12} color="#6b7280" />
          </button>
          {activeTab !== 'dashboard' && activeTab !== 'reminders' && activeTab !== 'cash' && (
            <button onClick={exportXlsx} style={{ display: 'flex', alignItems: 'center', gap: 5, border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 10px', background: 'white', cursor: 'pointer', fontSize: 11, color: '#374151', fontWeight: 500 }}>
              <Download size={11} /> Export .xlsx
            </button>
          )}
        </div>
      </div>

      {/* ── Dashboard ── */}
      {activeTab === 'dashboard' && (
        <div className="flex-1 overflow-y-auto p-4">
          <h3 className="text-sm font-semibold text-[#1a1a1a] mb-4">Commission Overview</h3>
          <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
            {[
              { label: 'Total Commission',  value: stats.total,           color: '#3ECF8E' },
              { label: 'Collected (Paid)',   value: stats.paid,            color: '#16a34a' },
              { label: 'Pending',            value: stats.pending,         color: '#d97706' },
              { label: 'Deferred Pending',   value: stats.deferredPending, color: '#dc2626' },
            ].map(s => (
              <div key={s.label} className="rounded-xl border p-4 flex flex-col gap-1" style={{ borderColor: '#e5e7eb', background: '#fafafa' }}>
                <div className="text-xs text-[#6b7280]">{s.label}</div>
                <div className="text-xl font-bold" style={{ color: s.color }}>{fmtAmt(s.value)}</div>
              </div>
            ))}
          </div>
          <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            {[
              { label: 'Inclusive', value: stats.inclusive, count: rows.filter(r => r.commission_type === 'Inclusive').length, ...TYPE_COLORS.Inclusive },
              { label: 'Exclusive', value: stats.exclusive, count: rows.filter(r => r.commission_type === 'Exclusive').length, ...TYPE_COLORS.Exclusive },
              { label: 'Deferred',  value: stats.deferred,  count: rows.filter(r => r.commission_type === 'Deferred').length,  ...TYPE_COLORS.Deferred },
            ].map(t => (
              <div key={t.label} className="rounded-xl border p-4" style={{ background: t.bg, borderColor: t.bg }}>
                <div className="text-xs font-semibold mb-1" style={{ color: t.text }}>{t.label}</div>
                <div className="text-lg font-bold" style={{ color: t.text }}>{fmtAmt(t.value)}</div>
                <div className="text-[11px] mt-1" style={{ color: t.text, opacity: 0.75 }}>{t.count} entries</div>
              </div>
            ))}
          </div>
          <div className="rounded-xl border p-4 mb-5" style={{ borderColor: '#e5e7eb' }}>
            <div className="text-xs font-semibold text-[#374151] mb-3">By Payment Mode</div>
            <div className="flex flex-col gap-2">
              {(['UPI', 'Cash', 'Net Banking'] as const).map(mode => {
                const modeRows = rows.filter(r => r.payment_mode === mode)
                const modeTotal = modeRows.reduce((s, r) => s + r.commission_amount, 0)
                const c = MODE_COLORS[mode]
                return (
                  <div key={mode} className="flex items-center gap-3">
                    <span style={{ background: c.bg, color: c.text, borderRadius: 4, padding: '2px 10px', fontSize: 11, fontWeight: 600, minWidth: 90, textAlign: 'center' }}>{mode}</span>
                    <div className="flex-1 rounded-full h-2 bg-gray-100">
                      <div className="rounded-full h-2" style={{ background: c.text, width: stats.total ? `${(modeTotal / stats.total) * 100}%` : '0%' }} />
                    </div>
                    <span className="text-xs font-semibold text-[#374151]">{fmtAmt(modeTotal)}</span>
                    <span className="text-[10px] text-[#9ca3af]">{modeRows.length} entries</span>
                  </div>
                )
              })}
            </div>
          </div>
          {stats.deferredCount > 0 && (
            <div className="rounded-xl border p-4" style={{ borderColor: '#fde68a', background: '#fefce8' }}>
              <div className="text-xs font-semibold text-[#92400e] mb-3">Deferred — Pending Collection</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>{['SR', 'Date', 'Customer', 'Machine', 'Amount', 'Action'].map(h => <th key={h} style={{ ...HS, background: '#fde68a', fontSize: 11, padding: '3px 6px' }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.filter(r => r.commission_type === 'Deferred' && r.status === 'Pending').slice(0, 10).map((r, i) => (
                    <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#fffde7' }}>
                      <td style={{ ...CS, fontSize: 11 }}>{r.sr_no || i + 1}</td>
                      <td style={{ ...CS, fontSize: 11 }}>{fmtDate(r.date)}</td>
                      <td style={{ ...CS, fontSize: 11, textAlign: 'left' }}>{r.customer_name}</td>
                      <td style={{ ...CS, fontSize: 11 }}>{r.swap_machine}</td>
                      <td style={{ ...CS, fontSize: 11, fontWeight: 'bold', color: '#dc2626' }}>{fmtAmt(r.commission_amount)}</td>
                      <td style={{ ...CS, fontSize: 11 }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                          <button onClick={() => { setPayingRow(r); setShowPaymentModal(true) }} style={{ background: '#3ECF8E', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer', fontWeight: 600 }}>Collect</button>
                          <button onClick={() => { setReminderRow(r); const d = new Date(); d.setDate(d.getDate() + 7); setReminderDate(d.toISOString().split('T')[0]); setShowReminderModal(true) }} style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer' }}>Remind</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── All Entries / Deferred ── */}
      {(activeTab === 'all' || activeTab === 'deferred') && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div style={{ padding: '6px 12px', borderBottom: '1px solid #e5e7eb', fontSize: 11, color: '#6b7280', background: '#fafafa', flexShrink: 0 }}>
            {filtered.length} entries{activeTab === 'deferred' && ` · Pending: ${fmtAmt(stats.deferredPending)}`}
          </div>
          {sheetTableJsx}
        </div>
      )}

      {/* ── Cash tab ── */}
      {activeTab === 'cash' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div style={{ padding: '6px 12px', borderBottom: '1px solid #e5e7eb', fontSize: 11, color: '#6b7280', background: '#fafafa', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>{filtered.length} cash entries · Total: <strong style={{ color: '#166534' }}>{fmtAmt(filtered.reduce((s, r) => s + r.commission_amount, 0))}</strong></span>
            <button onClick={exportXlsx} style={{ display: 'flex', alignItems: 'center', gap: 5, border: '1px solid #e5e7eb', borderRadius: 6, padding: '3px 10px', background: 'white', cursor: 'pointer', fontSize: 11, color: '#374151', fontWeight: 500 }}>
              <Download size={11} /> Export .xlsx
            </button>
          </div>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-3">
              <Banknote size={32} color="#9ca3af" />
              <div className="text-sm text-[#6b7280]">No cash commission entries yet.</div>
            </div>
          ) : sheetTableJsx}
        </div>
      )}

      {/* ── UPI tab ── */}
      {activeTab === 'upi' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div style={{ display: 'flex', overflowX: 'auto', borderBottom: '1px solid #e5e7eb', background: '#f9f9f9', flexShrink: 0, alignItems: 'center' }}>
            {/* All UPI sub-tab */}
            <button onClick={() => setActiveUpi('__all__')}
              style={{ padding: '8px 14px', fontSize: 12, fontWeight: activeUpi === '__all__' ? 'bold' : 'normal', background: activeUpi === '__all__' ? '#fff' : 'transparent', borderBottom: activeUpi === '__all__' ? '2px solid #3ECF8E' : '2px solid transparent', borderTop: 'none', borderLeft: 'none', borderRight: '1px solid #e5e7eb', cursor: 'pointer', whiteSpace: 'nowrap', color: activeUpi === '__all__' ? '#000' : '#6b7280' }}>
              All
              <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 4 }}>({rows.filter(r => r.payment_mode === 'UPI').length})</span>
            </button>
            {upiAccounts.map(u => (
              <button key={u.id} onClick={() => setActiveUpi(u.display_name)}
                style={{ padding: '8px 14px', fontSize: 12, fontWeight: activeUpi === u.display_name ? 'bold' : 'normal', background: activeUpi === u.display_name ? '#fff' : 'transparent', borderBottom: activeUpi === u.display_name ? '2px solid #3ECF8E' : '2px solid transparent', borderTop: 'none', borderLeft: 'none', borderRight: '1px solid #e5e7eb', cursor: 'pointer', whiteSpace: 'nowrap', color: activeUpi === u.display_name ? '#000' : '#6b7280' }}>
                {u.display_name}
                <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 4 }}>({rows.filter(r => r.payment_mode === 'UPI' && r.payment_mode_detail === u.display_name).length})</span>
              </button>
            ))}
            <button onClick={() => setShowUpiPanel(p => !p)}
              style={{ marginLeft: 'auto', marginRight: 8, padding: '4px 10px', background: '#3ECF8E', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
              <Plus size={11} style={{ display: 'inline', marginRight: 3 }} />Add UPI
            </button>
          </div>
          {showUpiPanel && (
            <div style={{ background: '#f0fdf4', borderBottom: '1px solid #86efac', padding: '12px 16px', display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
              <div>
                <div className={lb}>Display Name</div>
                <input
                  className={inp} style={{ borderColor: '#e5e7eb', width: 160 }}
                  placeholder="e.g. HDFC UPI"
                  value={newUpiName}
                  onChange={e => setNewUpiName(e.target.value)}
                />
              </div>
              <div>
                <div className={lb}>UPI ID</div>
                <input
                  className={inp} style={{ borderColor: '#e5e7eb', width: 200 }}
                  placeholder="e.g. business@hdfcbank"
                  value={newUpiId}
                  onChange={e => setNewUpiId(e.target.value)}
                />
              </div>
              <button onClick={handleAddUpi} disabled={upiSubmitting}
                style={{ background: '#3ECF8E', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                {upiSubmitting ? 'Saving...' : 'Add'}
              </button>
              <button onClick={() => setShowUpiPanel(false)}
                style={{ background: 'transparent', border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px', fontSize: 12, cursor: 'pointer', color: '#6b7280' }}>
                Cancel
              </button>
            </div>
          )}
          {upiAccounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-3">
              <CreditCard size={32} color="#9ca3af" />
              <div className="text-sm text-[#6b7280]">No UPI accounts yet</div>
              <button onClick={() => setShowUpiPanel(true)} style={{ background: '#3ECF8E', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Add First UPI Account</button>
            </div>
          ) : sheetTableJsx}
        </div>
      )}

      {/* ── Net Banking tab ── */}
      {activeTab === 'net_banking' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div style={{ display: 'flex', overflowX: 'auto', borderBottom: '1px solid #e5e7eb', background: '#f9f9f9', flexShrink: 0, alignItems: 'center' }}>
            {/* All Net Banking sub-tab */}
            <button onClick={() => setActiveBank('__all__')}
              style={{ padding: '8px 14px', fontSize: 12, fontWeight: activeBank === '__all__' ? 'bold' : 'normal', background: activeBank === '__all__' ? '#fff' : 'transparent', borderBottom: activeBank === '__all__' ? '2px solid #3ECF8E' : '2px solid transparent', borderTop: 'none', borderLeft: 'none', borderRight: '1px solid #e5e7eb', cursor: 'pointer', whiteSpace: 'nowrap', color: activeBank === '__all__' ? '#000' : '#6b7280' }}>
              All
              <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 4 }}>({rows.filter(r => r.payment_mode === 'Net Banking').length})</span>
            </button>
            {netBankingAccounts.map(b => (
              <button key={b.id} onClick={() => setActiveBank(b.display_name)}
                style={{ padding: '8px 14px', fontSize: 12, fontWeight: activeBank === b.display_name ? 'bold' : 'normal', background: activeBank === b.display_name ? '#fff' : 'transparent', borderBottom: activeBank === b.display_name ? '2px solid #3ECF8E' : '2px solid transparent', borderTop: 'none', borderLeft: 'none', borderRight: '1px solid #e5e7eb', cursor: 'pointer', whiteSpace: 'nowrap', color: activeBank === b.display_name ? '#000' : '#6b7280' }}>
                {b.display_name}
                <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 4 }}>({rows.filter(r => r.payment_mode === 'Net Banking' && r.payment_mode_detail === b.display_name).length})</span>
              </button>
            ))}
            <button onClick={() => setShowNetPanel(p => !p)}
              style={{ marginLeft: 'auto', marginRight: 8, padding: '4px 10px', background: '#3ECF8E', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
              <Plus size={11} style={{ display: 'inline', marginRight: 3 }} />Add Bank
            </button>
          </div>
          {showNetPanel && (
            <div style={{ background: '#eff6ff', borderBottom: '1px solid #bfdbfe', padding: '12px 16px', display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0, flexWrap: 'wrap' }}>
              <div>
                <div className={lb}>Display Name</div>
                <input className={inp} style={{ borderColor: '#e5e7eb', width: 150 }} placeholder="e.g. HDFC Current" value={newBankDisplay} onChange={e => setNewBankDisplay(e.target.value)} />
              </div>
              <div>
                <div className={lb}>Bank Name</div>
                <input className={inp} style={{ borderColor: '#e5e7eb', width: 130 }} placeholder="HDFC Bank" value={newBankName} onChange={e => setNewBankName(e.target.value)} />
              </div>
              <div>
                <div className={lb}>Account No.</div>
                <input className={inp} style={{ borderColor: '#e5e7eb', width: 140 }} placeholder="XXXXXXXXXXXX" value={newBankAccount} onChange={e => setNewBankAccount(e.target.value)} />
              </div>
              <div>
                <div className={lb}>IFSC</div>
                <input className={inp} style={{ borderColor: '#e5e7eb', width: 110 }} placeholder="HDFC0001234" value={newBankIfsc} onChange={e => setNewBankIfsc(e.target.value)} />
              </div>
              <button onClick={handleAddNetBanking} disabled={netSubmitting}
                style={{ background: '#3ECF8E', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                {netSubmitting ? 'Saving...' : 'Add'}
              </button>
              <button onClick={() => setShowNetPanel(false)}
                style={{ background: 'transparent', border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px', fontSize: 12, cursor: 'pointer', color: '#6b7280' }}>
                Cancel
              </button>
            </div>
          )}
          {netBankingAccounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-3">
              <Building2 size={32} color="#9ca3af" />
              <div className="text-sm text-[#6b7280]">No Net Banking accounts yet</div>
              <button onClick={() => setShowNetPanel(true)} style={{ background: '#3ECF8E', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Add First Bank Account</button>
            </div>
          ) : sheetTableJsx}
        </div>
      )}

      {/* ── Reminders tab ── */}
      {activeTab === 'reminders' && (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="text-sm font-semibold text-[#1a1a1a] mb-4">Commission Reminders ({reminders.filter(r => r.status === 'pending').length} pending)</div>
          {reminders.filter(r => r.status === 'pending').length === 0 ? (
            <div className="text-sm text-[#9ca3af]">No pending reminders.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {reminders.filter(r => r.status === 'pending').map(r => (
                <div key={r.id} className="rounded-lg border p-3 flex items-center gap-3" style={{ borderColor: '#fde68a', background: '#fefce8' }}>
                  <Bell size={16} color="#d97706" />
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-[#1a1a1a]">{r.title}</div>
                    <div className="text-[10px] text-[#6b7280]">{r.reminder_date} · ₹{Number(r.amount || 0).toLocaleString('en-IN')}</div>
                  </div>
                  <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: 4, padding: '2px 8px', fontSize: 10 }}>Pending</span>
                </div>
              ))}
            </div>
          )}
          {reminders.filter(r => r.status === 'completed').length > 0 && (
            <>
              <div className="text-xs font-semibold text-[#6b7280] mt-5 mb-2">Completed</div>
              <div className="flex flex-col gap-2">
                {reminders.filter(r => r.status === 'completed').slice(0, 10).map(r => (
                  <div key={r.id} className="rounded-lg border p-3 flex items-center gap-3 opacity-60" style={{ borderColor: '#e5e7eb' }}>
                    <Check size={14} color="#16a34a" />
                    <div className="flex-1">
                      <div className="text-xs text-[#374151]">{r.title}</div>
                      <div className="text-[10px] text-[#9ca3af]">{r.reminder_date}</div>
                    </div>
                    <span style={{ background: '#d1fae5', color: '#065f46', borderRadius: 4, padding: '2px 8px', fontSize: 10 }}>Done</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Record Payment Modal ── */}
      {showPaymentModal && payingRow && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setShowPaymentModal(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl z-[60]" style={{ width: 420, maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid #e5e7eb' }}>
              <div className="text-sm font-semibold text-[#1a1a1a]">Record Commission Payment</div>
              <button onClick={() => setShowPaymentModal(false)}><X size={16} color="#6b7280" /></button>
            </div>
            <div style={{ padding: 18 }}>
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{payingRow.customer_name} · SR #{payingRow.sr_no}</div>
                <div style={{ fontSize: 18, fontWeight: 'bold', color: '#1a1a1a' }}>{fmtAmt(payingRow.commission_amount)}</div>
                <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>{payingRow.commission_type} · {payingRow.commission_pct}%</div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label className={lb}>Payment Mode</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['UPI', 'Cash', 'Net Banking'] as const).map(m => (
                    <button key={m} onClick={() => { setPayMode(m); setPayDetail('') }}
                      style={{ flex: 1, padding: '6px 4px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: payMode === m ? '2px solid #3ECF8E' : '1px solid #e5e7eb', background: payMode === m ? '#f0fdf4' : '#fff', color: payMode === m ? '#065f46' : '#374151' }}>
                      {m === 'UPI' && <CreditCard size={11} style={{ display: 'inline', marginRight: 3 }} />}
                      {m === 'Cash' && <Banknote size={11} style={{ display: 'inline', marginRight: 3 }} />}
                      {m === 'Net Banking' && <Building2 size={11} style={{ display: 'inline', marginRight: 3 }} />}
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              {payMode === 'UPI' && (
                <div style={{ marginBottom: 12 }}>
                  <label className={lb}>Select UPI Account</label>
                  {upiAccounts.length > 0
                    ? <select className={inp + ' bg-white'} style={{ borderColor: '#e5e7eb' }} value={payDetail} onChange={e => setPayDetail(e.target.value)}>
                        <option value="">Select UPI...</option>
                        {upiAccounts.map(u => <option key={u.id} value={u.display_name}>{u.display_name} ({u.upi_id})</option>)}
                      </select>
                    : <div style={{ fontSize: 11, color: '#9ca3af' }}>No UPI accounts. Add one in UPI tab.</div>}
                </div>
              )}
              {payMode === 'Net Banking' && (
                <div style={{ marginBottom: 12 }}>
                  <label className={lb}>Select Bank Account</label>
                  {netBankingAccounts.length > 0
                    ? <select className={inp + ' bg-white'} style={{ borderColor: '#e5e7eb' }} value={payDetail} onChange={e => setPayDetail(e.target.value)}>
                        <option value="">Select bank...</option>
                        {netBankingAccounts.map(b => <option key={b.id} value={b.display_name}>{b.display_name} — {b.bank_name}</option>)}
                      </select>
                    : <div style={{ fontSize: 11, color: '#9ca3af' }}>No bank accounts. Add one in Net Banking tab.</div>}
                </div>
              )}
              {payMode === 'Cash' && (
                <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 11, color: '#166534' }}>
                  Cash will be recorded in Chamunda Sheet below L-15 automatically.
                </div>
              )}
              <div style={{ marginBottom: 12 }}>
                <label className={lb}>Payment Date</label>
                <input type="date" className={inp} style={{ borderColor: '#e5e7eb' }} value={payDate} onChange={e => setPayDate(e.target.value)} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label className={lb}>Notes (optional)</label>
                <input className={inp} style={{ borderColor: '#e5e7eb' }} placeholder="Any notes..." value={payNotes} onChange={e => setPayNotes(e.target.value)} />
              </div>
              <button onClick={handleRecordPayment} disabled={paySubmitting}
                style={{ width: '100%', background: '#3ECF8E', color: '#fff', border: 'none', borderRadius: 8, padding: '10px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: paySubmitting ? 0.7 : 1 }}>
                {paySubmitting ? 'Saving...' : 'Record Payment'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Reminder Modal ── */}
      {showReminderModal && reminderRow && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setShowReminderModal(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl z-[60]" style={{ width: 360 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid #e5e7eb' }}>
              <div className="text-sm font-semibold text-[#1a1a1a]">Set Commission Reminder</div>
              <button onClick={() => setShowReminderModal(false)}><X size={16} color="#6b7280" /></button>
            </div>
            <div style={{ padding: 18 }}>
              <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: 10, marginBottom: 14, fontSize: 11, color: '#92400e' }}>
                {reminderRow.customer_name} · {fmtAmt(reminderRow.commission_amount)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                <div>
                  <label className={lb}>Date</label>
                  <input type="date" className={inp} style={{ borderColor: '#e5e7eb' }} value={reminderDate} onChange={e => setReminderDate(e.target.value)} />
                </div>
                <div>
                  <label className={lb}>Time</label>
                  <input type="time" className={inp} style={{ borderColor: '#e5e7eb' }} value={reminderTime} onChange={e => setReminderTime(e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 5, marginBottom: 12, flexWrap: 'wrap' }}>
                {[{ l: '+3d', d: 3 }, { l: '+7d', d: 7 }, { l: '+15d', d: 15 }, { l: '+30d', d: 30 }].map(({ l, d }) => (
                  <button key={d} onClick={() => { const dt = new Date(); dt.setDate(dt.getDate() + d); setReminderDate(dt.toISOString().split('T')[0]) }}
                    style={{ border: '1px solid #e5e7eb', borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer', color: '#374151', background: '#fff' }}>
                    {l}
                  </button>
                ))}
              </div>
              <div style={{ marginBottom: 14 }}>
                <label className={lb}>Note (optional)</label>
                <input className={inp} style={{ borderColor: '#e5e7eb' }} placeholder="Collect commission from..." value={reminderNote} onChange={e => setReminderNote(e.target.value)} />
              </div>
              <button onClick={handleSetReminder}
                style={{ width: '100%', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 8, padding: '10px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Set Reminder
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
