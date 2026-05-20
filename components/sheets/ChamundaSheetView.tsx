'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ChevronLeft, ChevronRight, Download, Plus, RefreshCw, X } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface ChamundaRow {
  id: string
  date: string
  row_type: string
  sort_order: number
  opening_name: string | null
  opening_amount: number | null
  transaction_id: string | null
  name: string | null
  bank_charge_pct: number | null
  paid_amount: number | null
  swap_amount: number | null
  commission_pct: number | null
  commission_type: string | null
  machine_name: string | null
  trf_firm_name: string | null
  cash_gp_recd: number | null
  expense_id: string | null
  expense_name: string | null
  expense_amount: number | null
  expense_note: string | null
  total_cash_in: number | null
  total_paid_out: number | null
  closing_balance: number | null
}

interface L15Entry {
  id: string
  date: string
  customer_name: string
  amount: number
  notes: string | null
}

interface ExpenseMaster {
  id: string
  expense_name: string
  category: string
  sort_order: number
}

// ── Style constants ────────────────────────────────────────────────────────────
const HS: React.CSSProperties = {
  border: '1px solid #000', padding: '3px 5px', fontSize: 11,
  fontFamily: 'Calibri,Arial,sans-serif', background: '#FFFF00',
  color: '#000', fontWeight: 'bold', textAlign: 'center', whiteSpace: 'nowrap',
}
const CS: React.CSSProperties = {
  border: '1px solid #000', padding: '2px 5px', fontSize: 11,
  fontFamily: 'Calibri,Arial,sans-serif', background: '#fff',
  color: '#000', whiteSpace: 'nowrap', overflow: 'hidden',
  textOverflow: 'ellipsis', verticalAlign: 'middle', textAlign: 'center',
}
const EMPTY_ROW_STYLE: React.CSSProperties = {
  border: 'none', background: '#fff', height: 10, padding: 0,
}

// A=date | B=opening name | C=opening amt | D=DR name | E=paid | F=swap | G=comm | H=swap firm(yellow) | I=TRF firm | J=cash/GP
const COL_WIDTHS = { a: 70, b: 160, c: 100, d: 200, e: 90, f: 110, g: 80, h: 140, i: 120, j: 100 }
const NCOLS = 10
const TBL_W = Object.values(COL_WIDTHS).reduce((s, v) => s + v, 0)

function fmt(n: number | null | undefined) {
  if (n == null || n === 0) return ''
  return n.toLocaleString('en-IN')
}
function fmtDate(d: string) {
  const [y, m, day] = d.split('-')
  return `${parseInt(day)}/${parseInt(m)}/${y.slice(2)}`
}
function toDateStr(d: Date) {
  return d.toISOString().split('T')[0]
}

const CATEGORY_LABELS: Record<string, string> = {
  office: '🏢 Office', transport: '🚗 Transport', utility: '⚡ Utilities',
  salary: '👤 Salaries', on_hand: '💰 On Hand', rent: '🏠 Rent', other: '📦 Other',
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function ChamundaSheetView() {
  const [selectedDate, setSelectedDate] = useState(toDateStr(new Date()))
  const [rows, setRows] = useState<ChamundaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // Inline edit
  const [editCell, setEditCell] = useState<{ id: string; field: string; value: string } | null>(null)
  const [flashCells, setFlashCells] = useState<Set<string>>(new Set())
  const editInputRef = useRef<HTMLInputElement>(null)

  // Popups
  const [showL15, setShowL15] = useState(false)
  const [showExpense, setShowExpense] = useState(false)
  const [showAddPerson, setShowAddPerson] = useState(false)

  // L-15 state
  const [l15Entries, setL15Entries] = useState<L15Entry[]>([])
  const [l15Name, setL15Name] = useState('')
  const [l15Amount, setL15Amount] = useState('')
  const [l15Notes, setL15Notes] = useState('')
  const [l15Saving, setL15Saving] = useState(false)

  // Expense state
  const [expenseMaster, setExpenseMaster] = useState<ExpenseMaster[]>([])
  const [expenseEdits, setExpenseEdits] = useState<Record<string, { amount: string; note: string }>>({})
  const [expenseSaving, setExpenseSaving] = useState(false)
  const [newExpName, setNewExpName] = useState('')
  const [newExpAmt, setNewExpAmt] = useState('')
  const [newExpCat, setNewExpCat] = useState('other')

  // Add person state
  const [personName, setPersonName] = useState('')
  const [personAmount, setPersonAmount] = useState('')

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000)
  }

  // ── Local createChamundaSheetRow (used by Sync button) ──────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createChamundaSheetRow = async (transaction: any) => {
    try {
      const date = transaction.date
      await supabase.rpc('initialize_chamunda_sheet', { p_date: date })
      const commPct  = Number(transaction.commission_pct) || 0
      const commType = transaction.commission_type || 'Inclusive'
      let commStr = `TRF ${commPct}`
      if (commType === 'Exclusive') commStr = `CH ${commPct}`
      if (commType === 'Deferred')  commStr = 'PAY PURU'
      const { data, error } = await supabase.from('chamunda_sheet').insert({
        date,
        row_type: 'transaction',
        transaction_id: transaction.id || null,
        name: transaction.customer_name || '',
        bank_charge_pct: 3.00,
        paid_amount: Number(transaction.paid_amount) || 0,
        swap_amount: Number(transaction.swap_amount) || 0,
        commission_pct: commPct,
        commission_type: commStr,
        machine_name: transaction.swap_name || '',
        sort_order: Date.now(),
      }).select()
      if (error) { console.error('❌ Sync insert failed:', error.message, error.details); return }
      console.log('✅ Sync chamunda row:', data)
      await supabase.rpc('recalculate_chamunda_totals', { p_date: date })
    } catch (err) {
      console.error('❌ createChamundaSheetRow exception:', err)
    }
  }

  // Track which dates have already been initialized this session
  const initializedDates = useRef<Set<string>>(new Set())

  // ── Fetch sheet ──────────────────────────────────────────────────────────────
  const fetchSheet = useCallback(async (date: string, forceInit = false) => {
    setLoading(true)
    // Only call initialize once per date per session to prevent duplicate rows
    if (forceInit || !initializedDates.current.has(date)) {
      const { data: existing } = await supabase
        .from('chamunda_sheet')
        .select('id, row_type')
        .eq('date', date)

      if (!existing || existing.length === 0) {
        await supabase.rpc('initialize_chamunda_sheet', { p_date: date })
      } else {
        // Remove duplicates for fixed row types (keep only the first of each)
        const fixed = ['opening_cash', 'opening_hdfc', 'opening_l15', 'total']
        for (const rt of fixed) {
          const dupes = existing.filter(r => r.row_type === rt)
          if (dupes.length > 1) {
            const idsToDelete = dupes.slice(1).map(r => r.id)
            await supabase.from('chamunda_sheet').delete().in('id', idsToDelete)
          }
        }
      }
      initializedDates.current.add(date)
    }
    const { data } = await supabase
      .from('chamunda_sheet')
      .select('*')
      .eq('date', date)
      .order('sort_order', { ascending: true })
    setRows((data as ChamundaRow[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchSheet(selectedDate) }, [fetchSheet, selectedDate])

  // Fetch L-15 entries whenever date changes (show inline below L-15 row)
  useEffect(() => {
    supabase.from('l15_entries').select('*').eq('date', selectedDate).order('created_at')
      .then(({ data }) => setL15Entries((data as L15Entry[]) || []))
  }, [selectedDate])

  // Fetch expense master
  useEffect(() => {
    supabase.from('expense_master').select('*').eq('is_active', true).order('sort_order').then(({ data }) => {
      setExpenseMaster((data as ExpenseMaster[]) || [])
    })
  }, [])

  // Verify table exists on first mount
  useEffect(() => {
    supabase.from('chamunda_sheet').select('*', { count: 'exact', head: true }).then(({ error }) => {
      if (error) {
        console.error('[Chamunda] Table check failed:', error.message)
        showToast('⚠️ Run chamunda_schema.sql in Supabase first', 'error')
      } else {
        console.log('[Chamunda] Table OK')
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Realtime: auto-refresh when new transaction rows arrive for this date
  useEffect(() => {
    const channel = supabase
      .channel('chamunda_realtime_' + selectedDate)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chamunda_sheet',
      }, payload => {
        console.log('[Chamunda] Realtime INSERT:', payload.new)
        const newRow = payload.new as ChamundaRow
        if (newRow.date === selectedDate) {
          console.log('[Chamunda] Refreshing sheet for date:', selectedDate)
          fetchSheet(selectedDate)
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'chamunda_sheet',
      }, payload => {
        const updated = payload.new as ChamundaRow
        if (updated.date === selectedDate) {
          setRows(rs => rs.map(r => r.id === updated.id ? updated : r))
        }
      })
      .subscribe(status => console.log('[Chamunda] Realtime status:', status))

    return () => { supabase.removeChannel(channel) }
  }, [selectedDate, fetchSheet])

  // Focus edit input
  useEffect(() => { if (editCell) editInputRef.current?.focus() }, [editCell])

  // ── Date navigation ──────────────────────────────────────────────────────────
  function prevDay() {
    const d = new Date(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(toDateStr(d))
  }
  function nextDay() {
    const d = new Date(selectedDate); d.setDate(d.getDate() + 1); setSelectedDate(toDateStr(d))
  }

  // ── Inline edit ──────────────────────────────────────────────────────────────
  function startEdit(row: ChamundaRow, field: string) {
    const val = String((row as unknown as Record<string, unknown>)[field] ?? '')
    setEditCell({ id: row.id, field, value: val === '0' ? '' : val })
  }

  async function commitEdit() {
    if (!editCell) return
    const { id, field, value } = editCell
    setEditCell(null)
    const numVal = value === '' ? 0 : parseFloat(value) || 0
    const dbVal = ['opening_amount', 'expense_amount', 'cash_gp_recd'].includes(field) ? numVal : value

    const { error } = await supabase.from('chamunda_sheet').update({ [field]: dbVal }).eq('id', id)
    if (!error) {
      setRows(rs => rs.map(r => r.id === id ? { ...r, [field]: dbVal } : r))
      const key = `${id}__${field}`
      setFlashCells(s => new Set(Array.from(s).concat(key)))
      setTimeout(() => setFlashCells(s => { const n = new Set(s); n.delete(key); return n }), 800)
      // Recalculate totals
      await supabase.rpc('recalculate_chamunda_totals', { p_date: selectedDate })
      const { data } = await supabase.from('chamunda_sheet').select('*').eq('date', selectedDate).order('sort_order', { ascending: true })
      setRows((data as ChamundaRow[]) || [])
    } else {
      showToast('Save failed: ' + error.message, 'error')
    }
  }

  // ── L-15 ─────────────────────────────────────────────────────────────────────
  async function fetchL15(date = selectedDate) {
    const { data } = await supabase.from('l15_entries').select('*').eq('date', date).order('created_at')
    setL15Entries((data as L15Entry[]) || [])
  }

  async function addL15Entry() {
    if (!l15Name || !l15Amount) { showToast('Name and amount required', 'error'); return }
    setL15Saving(true)
    const amt = parseFloat(l15Amount) || 0
    await supabase.from('l15_entries').insert({ date: selectedDate, customer_name: l15Name, amount: amt, notes: l15Notes || null })
    // Update L-15 row total
    const { data: entries } = await supabase.from('l15_entries').select('amount').eq('date', selectedDate)
    const total = (entries || []).reduce((s, r) => s + Number(r.amount), 0)
    await supabase.from('chamunda_sheet').update({ opening_amount: total }).eq('date', selectedDate).eq('row_type', 'opening_l15')
    await supabase.rpc('recalculate_chamunda_totals', { p_date: selectedDate })
    setL15Name(''); setL15Amount(''); setL15Notes('')
    setL15Saving(false)
    await fetchL15()
    await fetchSheet(selectedDate)
    showToast('L-15 entry added')
  }

  async function deleteL15Entry(id: string) {
    await supabase.from('l15_entries').delete().eq('id', id)
    const { data: entries } = await supabase.from('l15_entries').select('amount').eq('date', selectedDate)
    const total = (entries || []).reduce((s, r) => s + Number(r.amount), 0)
    await supabase.from('chamunda_sheet').update({ opening_amount: total }).eq('date', selectedDate).eq('row_type', 'opening_l15')
    await supabase.rpc('recalculate_chamunda_totals', { p_date: selectedDate })
    await fetchL15()
    await fetchSheet(selectedDate)
  }

  // ── Expense popup ─────────────────────────────────────────────────────────────
  function openExpensePopup() {
    const edits: Record<string, { amount: string; note: string }> = {}
    rows.filter(r => r.row_type === 'expense').forEach(r => {
      edits[r.id] = { amount: r.expense_amount ? String(r.expense_amount) : '', note: r.expense_note || '' }
    })
    setExpenseEdits(edits)
    setShowExpense(true)
  }

  async function saveExpenses() {
    setExpenseSaving(true)
    const expenseRows = rows.filter(r => r.row_type === 'expense')
    for (const row of expenseRows) {
      const edit = expenseEdits[row.id]
      if (!edit) continue
      const amt = parseFloat(edit.amount) || 0
      await supabase.from('chamunda_sheet')
        .update({ expense_amount: amt, expense_note: edit.note || null })
        .eq('id', row.id)
    }
    await supabase.rpc('recalculate_chamunda_totals', { p_date: selectedDate })
    await fetchSheet(selectedDate)
    setExpenseSaving(false)
    setShowExpense(false)
    showToast('Expenses saved!')
  }

  async function addCustomExpense() {
    if (!newExpName) { showToast('Expense name required', 'error'); return }
    const { data: em } = await supabase.from('expense_master').insert({ expense_name: newExpName, category: newExpCat, sort_order: 900 }).select().single()
    if (em) {
      const amt = parseFloat(newExpAmt) || 0
      await supabase.from('chamunda_sheet').insert({
        date: selectedDate, row_type: 'expense', sort_order: 1400,
        expense_id: (em as ExpenseMaster).id, expense_name: newExpName, expense_amount: amt,
      })
      await supabase.rpc('recalculate_chamunda_totals', { p_date: selectedDate })
      await fetchSheet(selectedDate)
      setExpenseMaster(prev => [...prev, em as ExpenseMaster])
    }
    setNewExpName(''); setNewExpAmt(''); setNewExpCat('other')
    showToast('Custom expense added')
  }

  // ── Add Opening Person ────────────────────────────────────────────────────────
  async function addOpeningPerson() {
    if (!personName || !personAmount) { showToast('Name and amount required', 'error'); return }
    const amt = parseFloat(personAmount) || 0
    const maxSort = Math.max(...rows.filter(r => r.row_type === 'opening_person').map(r => r.sort_order), 30) + 10
    await supabase.from('chamunda_sheet').insert({
      date: selectedDate, row_type: 'opening_person', sort_order: maxSort,
      opening_name: personName, opening_amount: amt,
    })
    await supabase.rpc('recalculate_chamunda_totals', { p_date: selectedDate })
    await fetchSheet(selectedDate)
    setPersonName(''); setPersonAmount(''); setShowAddPerson(false)
    showToast('Opening person added')
  }

  // ── Export XLSX ─────────────────────────────────────────────────────────────
  // Columns: A=DT | B=OPENING BAL | C=Amount | D=NAME | E=PAID | F=SWAP AMOUNT | G=COMM | H=SWAP FIRM NAME | I=TRF FIRM NAME | J=CASH/GP RECD
  async function exportXlsx() {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Chamunda Sheet')

    const border = {
      top:    { style: 'thin' as const, color: { argb: 'FF000000' } },
      bottom: { style: 'thin' as const, color: { argb: 'FF000000' } },
      left:   { style: 'thin' as const, color: { argb: 'FF000000' } },
      right:  { style: 'thin' as const, color: { argb: 'FF000000' } },
    }
    const yellow     = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFFF00' } }
    const yellowFirm = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFFF00' } }
    const ctr = { horizontal: 'center' as const, vertical: 'middle' as const }
    const bold = { bold: true, name: 'Calibri', size: 11 }
    const normal = { name: 'Calibri', size: 11 }
    const numFmt = '#,##0'
    const EMPTY10 = ['', '', '', '', '', '', '', '', '', '']

    ws.columns = [
      { key: 'A', width: 10 },  // A: DT
      { key: 'B', width: 22 },  // B: OPENING BAL / name
      { key: 'C', width: 14 },  // C: Amount
      { key: 'D', width: 28 },  // D: NAME (DR 3.00...)
      { key: 'E', width: 12 },  // E: PAID
      { key: 'F', width: 14 },  // F: SWAP AMOUNT
      { key: 'G', width: 11 },  // G: COMM
      { key: 'H', width: 18 },  // H: SWAP FIRM NAME
      { key: 'I', width: 18 },  // I: TRF FIRM NAME
      { key: 'J', width: 14 },  // J: CASH/GP RECD
    ]

    const allCols = ['A','B','C','D','E','F','G','H','I','J']
    const applyBorder = (r: import('exceljs').Row, cols = allCols) => cols.forEach(c => { r.getCell(c).border = border })
    const applyCenter = (r: import('exceljs').Row, cols = allCols) => cols.forEach(c => { r.getCell(c).alignment = ctr })

    // ── Title ──
    const tRow = ws.addRow([...EMPTY10])
    tRow.getCell('A').value = '"Shree Ganeshay Namah"'
    ws.mergeCells(`A${tRow.number}:J${tRow.number}`)
    tRow.getCell('A').fill = yellow
    tRow.getCell('A').font = { bold: true, name: 'Calibri', size: 13 }
    tRow.getCell('A').alignment = { horizontal: 'center', vertical: 'middle' }
    tRow.height = 22

    // ── Date row ──
    const dRow = ws.addRow([...EMPTY10])
    dRow.getCell('A').value = `DT ${fmtDate(selectedDate)}`
    dRow.getCell('A').font = bold

    // ── Column headers ──
    const hRow = ws.addRow(['DT', 'OPENING BAL', 'Amount', 'NAME', 'PAID', 'SWAP AMOUNT', 'COMM', 'SWAP FIRM NAME', 'TRF FIRM NAME', 'CASH/GP RECD'])
    hRow.eachCell(c => { c.fill = yellow; c.font = bold; c.border = border; c.alignment = ctr })
    hRow.height = 18

    // ── Opening rows ──
    for (const row of rows.filter(r => ['opening_cash','opening_hdfc','opening_l15','opening_person'].includes(r.row_type))) {
      const r = ws.addRow([...EMPTY10])
      r.getCell('B').value = row.opening_name || ''
      r.getCell('B').font = row.row_type === 'opening_cash' ? bold : normal
      if (row.opening_amount) {
        r.getCell('C').value = row.opening_amount
        r.getCell('C').numFmt = numFmt
      }
      applyBorder(r, allCols)
      applyCenter(r, allCols)
    }

    // ── 5 empty gap rows ──
    for (let i = 0; i < 5; i++) {
      const r = ws.addRow([...EMPTY10])
      applyBorder(r, allCols)
    }

    // ── Transaction rows ──
    for (const row of rows.filter(r => r.row_type === 'transaction')) {
      const name = (row.name || (row as unknown as Record<string,string>).card_holder || '').trim()
      const r = ws.addRow([...EMPTY10])
      r.getCell('D').value = `DR ${(row.bank_charge_pct || 3).toFixed(2)} ${name}`
      if (row.paid_amount)   { r.getCell('E').value = row.paid_amount;   r.getCell('E').numFmt = numFmt }
      if (row.swap_amount)   { r.getCell('F').value = row.swap_amount;   r.getCell('F').numFmt = numFmt }
      r.getCell('G').value = row.commission_type || ''
      r.getCell('H').value = row.machine_name || ''
      r.getCell('H').fill = yellowFirm
      r.getCell('H').font = { bold: true, name: 'Calibri', size: 11, color: { argb: 'FFFF0000' } }
      r.getCell('I').value = row.trf_firm_name || ''
      if (row.cash_gp_recd)  { r.getCell('J').value = row.cash_gp_recd; r.getCell('J').numFmt = numFmt }
      applyBorder(r, allCols)
      applyCenter(r, allCols)
    }

    // ── 5 empty gap rows ──
    for (let i = 0; i < 5; i++) {
      const r = ws.addRow([...EMPTY10])
      applyBorder(r, allCols)
    }

    // ── Expense rows ──
    for (const row of rows.filter(r => r.row_type === 'expense')) {
      if (!row.expense_amount && !row.expense_note) continue
      const r = ws.addRow([...EMPTY10])
      r.getCell('D').value = `DR ${row.expense_name || ''}`
      if (row.expense_amount) { r.getCell('E').value = row.expense_amount; r.getCell('E').numFmt = numFmt; r.getCell('E').font = bold }
      r.getCell('F').value = row.expense_note || ''
      applyBorder(r, allCols)
      applyCenter(r, allCols)
    }

    // ── 5 empty gap rows ──
    for (let i = 0; i < 5; i++) {
      const r = ws.addRow([...EMPTY10])
      applyBorder(r, allCols)
    }

    // ── Total row ──
    const totalRow = rows.find(r => r.row_type === 'total')
    if (totalRow) {
      const r = ws.addRow([...EMPTY10])
      r.getCell('B').value = 'TOTAL / CLOSING'
      r.getCell('B').fill = yellow
      r.getCell('B').font = bold
      if (totalRow.total_cash_in)  { r.getCell('C').value = totalRow.total_cash_in;  r.getCell('C').numFmt = numFmt }
      if (totalRow.total_paid_out) { r.getCell('E').value = totalRow.total_paid_out; r.getCell('E').numFmt = numFmt }
      r.getCell('F').value = totalRow.closing_balance ?? 0
      r.getCell('F').numFmt = numFmt
      r.getCell('F').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: (totalRow.closing_balance ?? 0) >= 0 ? 'FFFFFF00' : 'FFFF4444' } }
      r.getCell('F').font = { bold: true, name: 'Calibri', size: 12, color: { argb: (totalRow.closing_balance ?? 0) >= 0 ? 'FF000000' : 'FFFF0000' } }
      applyBorder(r, allCols)
      applyCenter(r, allCols)
    }

    const buf = await wb.xlsx.writeBuffer()
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    const a = document.createElement('a'); a.href = url
    a.download = `ChamundaSheet_${selectedDate}.xlsx`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }

  // ── Derived data ──────────────────────────────────────────────────────────────
  const openingRows    = rows.filter(r => ['opening_cash','opening_hdfc','opening_l15','opening_person'].includes(r.row_type))
  const transactionRows = rows.filter(r => r.row_type === 'transaction')
  const expenseRows    = rows.filter(r => r.row_type === 'expense')
  const totalRow       = rows.find(r => r.row_type === 'total')

  // Group transactions by machine
  const machineGroups = React.useMemo(() => {
    const map = new Map<string, ChamundaRow[]>()
    transactionRows.forEach(r => {
      const key = r.machine_name || '(No Machine)'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    })
    return Array.from(map.entries())
  }, [transactionRows])

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[200] px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium text-white ${toast.type === 'success' ? 'bg-[#3ECF8E]' : 'bg-red-500'}`}>
          {toast.msg}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#e5e7eb] bg-white flex-shrink-0 flex-wrap">
        {/* Date nav */}
        <button onClick={prevDay} className="p-1 rounded border hover:bg-gray-50" style={{ borderColor: '#e5e7eb' }}>
          <ChevronLeft size={14} />
        </button>
        <span className="text-xs font-semibold text-[#1a1a1a] px-1">{fmtDate(selectedDate)}</span>
        <button onClick={nextDay} className="p-1 rounded border hover:bg-gray-50" style={{ borderColor: '#e5e7eb' }}>
          <ChevronRight size={14} />
        </button>

        <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
          className="text-xs border rounded px-2 py-1 outline-none focus:border-[#3ECF8E]"
          style={{ borderColor: '#e5e7eb' }} />

        <div className="w-px h-4 bg-[#e5e7eb]" />

        <button onClick={() => { fetchL15(); setShowL15(true) }}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium border hover:bg-gray-50"
          style={{ borderColor: '#e5e7eb' }}>
          <Plus size={12} /> L-15 Entries
        </button>

        <button onClick={openExpensePopup}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium border hover:bg-gray-50"
          style={{ borderColor: '#e5e7eb' }}>
          <Plus size={12} /> Expenses
        </button>

        <button onClick={() => setShowAddPerson(true)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium border hover:bg-gray-50"
          style={{ borderColor: '#e5e7eb' }}>
          <Plus size={12} /> Add Person
        </button>

        <div className="ml-auto flex items-center gap-2">
          <button onClick={exportXlsx}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded border text-xs font-medium hover:bg-gray-50"
            style={{ borderColor: '#e5e7eb' }}>
            <Download size={12} /> Export .xlsx
          </button>
          <button
            onClick={async () => {
              const { data: txns } = await supabase.from('transactions').select('*').eq('date', selectedDate)
              const { data: chamRows } = await supabase.from('chamunda_sheet').select('*').eq('date', selectedDate)
              console.log('Transactions today:', txns?.length, txns)
              console.log('Chamunda rows today:', chamRows?.length, chamRows)
              if (txns && txns.length > 0) {
                let synced = 0
                for (const txn of txns) {
                  const exists = chamRows?.some(r => r.transaction_id === txn.id)
                  if (!exists) {
                    console.log('Missing chamunda row for:', txn.customer_name)
                    await createChamundaSheetRow(txn)
                    synced++
                  }
                }
                await fetchSheet(selectedDate)
                showToast(synced > 0 ? `Synced ${synced} transaction(s)!` : 'Already in sync', 'success')
              } else {
                showToast('No transactions found for this date', 'error')
              }
            }}
            style={{ background: '#f59e0b', color: 'white', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 'bold' }}
          >
            🔄 Sync
          </button>
          <button onClick={() => fetchSheet(selectedDate)} className="p-1.5 rounded border hover:bg-gray-50" style={{ borderColor: '#e5e7eb' }}>
            <RefreshCw size={12} color="#6b7280" className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-3" style={{ fontFamily: 'Calibri,Arial,sans-serif' }}>
        {loading ? (
          <div className="flex items-center justify-center h-32 text-sm text-[#6b7280]">Loading…</div>
        ) : (
          <table style={{ width: TBL_W, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              {(Object.values(COL_WIDTHS) as number[]).map((w, i) => <col key={i} style={{ width: w }} />)}
            </colgroup>
            <tbody>
              {/* ── Title ── */}
              <tr>
                <td colSpan={NCOLS} style={{ ...HS, textAlign: 'center', fontSize: 13, letterSpacing: 1 }}>
                  &quot;Shree Ganeshay Namah&quot; &nbsp;—&nbsp; DT {fmtDate(selectedDate)}
                </td>
              </tr>

              {/* ── Column headers ── */}
              <tr>
                <th style={{ ...HS }}>DT</th>
                <th style={{ ...HS }}>OPENING BAL</th>
                <th style={{ ...HS }}>Amount</th>
                <th style={{ ...HS }}>NAME</th>
                <th style={{ ...HS }}>Paid</th>
                <th style={{ ...HS }}>Swap Amount</th>
                <th style={{ ...HS }}>COMM</th>
                <th style={{ ...HS }}>Swap Firm Name</th>
                <th style={{ ...HS }}>TRF Firm Name</th>
                <th style={{ ...HS }}>Cash/GP Recd</th>
              </tr>

              {/* ── Opening rows ── */}
              {openingRows.map(row => {
                const isCash = row.row_type === 'opening_cash'
                const isL15  = row.row_type === 'opening_l15'
                const flash  = flashCells.has(`${row.id}__opening_amount`)
                const rest = Array.from({length: 7}).map((_,i) => <td key={i} style={{...CS}}></td>)
                return (
                  <React.Fragment key={row.id}>
                    <tr>
                      <td style={{...CS}}></td>
                      <td style={{...CS, textAlign:'center', fontWeight: isCash ? 'bold' : 'normal'}}>{row.opening_name}</td>
                      <td onClick={() => !isCash && !isL15 && startEdit(row, 'opening_amount')}
                        style={{...CS, textAlign:'center', background: flash ? '#bbf7d0' : isCash ? '#f3f4f6' : '#fff',
                          cursor: isCash||isL15 ? 'default' : 'text', color: isCash ? '#6b7280' : '#000', fontWeight:'bold', transition:'background 0.3s'}}>
                        {editCell?.id === row.id && editCell?.field === 'opening_amount' && !isCash && !isL15 ? (
                          <input ref={editInputRef} autoFocus type="number" value={editCell.value}
                            onChange={e => setEditCell(ec => ec ? {...ec, value: e.target.value} : ec)}
                            onBlur={commitEdit}
                            onKeyDown={e => { if(e.key==='Enter'){e.preventDefault();commitEdit()} if(e.key==='Escape')setEditCell(null) }}
                            style={{width:'100%',border:'none',outline:'2px solid #3ECF8E',padding:'2px 4px',fontSize:11,fontFamily:'Calibri,Arial,sans-serif',background:'#fff',boxSizing:'border-box',textAlign:'center'}} />
                        ) : (fmt(row.opening_amount) || (isCash ? <span style={{color:'#9ca3af',fontWeight:'normal',fontSize:10}}>prev day closing</span> : ''))}
                      </td>
                      {rest}
                    </tr>
                  </React.Fragment>
                )
              })}

              {/* ── Gap rows with borders between opening and transactions ── */}
              {[0,1,2,3,4].map(i => <tr key={`g1-${i}`}>{Array.from({length:NCOLS}).map((_,j)=><td key={j} style={{...CS, height:16}}></td>)}</tr>)}

              {/* ── Transaction rows: A=empty, B=empty, C=empty, D=empty, E=empty, F=DR name, G=paid, H=swap, I=comm, J=firm(yellow), K=trf, L=cash ── */}
              {machineGroups.map(([machine, txRows]) => (
                <React.Fragment key={machine}>
                  {txRows.map(row => {
                    const isEditingCash = editCell?.id === row.id && editCell?.field === 'cash_gp_recd'
                    const flashCash = flashCells.has(`${row.id}__cash_gp_recd`)
                    const name = (row.name || (row as unknown as Record<string,string>).card_holder || '').trim()
                    return (
                      <tr key={row.id}
                        onMouseEnter={e => (e.currentTarget.style.background = '#FFFEF0')}
                        onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                        <td style={{...CS}}></td><td style={{...CS}}></td><td style={{...CS}}></td>
                        <td style={{...CS}}>{`DR ${(row.bank_charge_pct||3).toFixed(2)} ${name}`}</td>
                        <td style={{...CS, textAlign:'center'}}>{fmt(row.paid_amount)}</td>
                        <td style={{...CS, textAlign:'center'}}>{fmt(row.swap_amount)}</td>
                        <td style={{...CS, fontSize:10}}>{row.commission_type||''}</td>
                        <td style={{...CS, background:'#FFFF00', color:'#FF0000', fontWeight:'bold'}}>{row.machine_name||''}</td>
                        <td style={{...CS}}>{row.trf_firm_name||''}</td>
                        <td onClick={() => startEdit(row, 'cash_gp_recd')}
                          style={{...CS, textAlign:'center', background: flashCash ? '#bbf7d0' : '#fff', cursor:'text', transition:'background 0.3s'}}>
                          {isEditingCash ? (
                            <input ref={editInputRef} autoFocus type="number" value={editCell.value}
                              onChange={e => setEditCell(ec => ec ? {...ec, value: e.target.value} : ec)}
                              onBlur={commitEdit}
                              onKeyDown={e => { if(e.key==='Enter'){e.preventDefault();commitEdit()} if(e.key==='Escape')setEditCell(null) }}
                              style={{width:'100%',border:'none',outline:'2px solid #3ECF8E',padding:'2px 4px',fontSize:11,fontFamily:'Calibri,Arial,sans-serif',background:'#fff',boxSizing:'border-box',textAlign:'center'}} />
                          ) : fmt(row.cash_gp_recd)}
                        </td>
                      </tr>
                    )
                  })}
                </React.Fragment>
              ))}

              {/* ── Gap rows with borders between transactions and expenses ── */}
              {[0,1,2,3,4].map(i => <tr key={`g2-${i}`}>{Array.from({length:NCOLS}).map((_,j)=><td key={j} style={{...CS, height:16}}></td>)}</tr>)}

              {/* ── Expense rows: F=DR name, G=amount, H=note ── */}
              {expenseRows.filter(r => (r.expense_amount ?? 0) > 0 || r.expense_note).map(row => (
                <tr key={row.id}>
                  <td style={{...CS}}></td><td style={{...CS}}></td><td style={{...CS}}></td>
                  <td style={{...CS}}>DR {row.expense_name||''}</td>
                  <td style={{...CS, fontWeight:'bold'}}>{fmt(row.expense_amount)}</td>
                  <td style={{...CS, color:'#6b7280', fontSize:10}}>{row.expense_note||''}</td>
                  <td style={{...CS}}></td><td style={{...CS}}></td><td style={{...CS}}></td><td style={{...CS}}></td>
                </tr>
              ))}

              {/* ── Gap rows with borders between expenses and total ── */}
              {[0,1,2,3,4].map(i => <tr key={`g3-${i}`}>{Array.from({length:NCOLS}).map((_,j)=><td key={j} style={{...CS, height:16}}></td>)}</tr>)}

              {/* ── Total row: C=opening, G=paid+exp, H=closing(yellow) ── */}
              {totalRow && (
                <tr style={{fontWeight:'bold'}}>
                  <td style={{...CS}}></td><td style={{...CS}}></td>
                  <td style={{...CS, background:'#FFFDE7'}}>{fmt(totalRow.total_cash_in)}</td>
                  <td style={{...CS}}></td>
                  <td style={{...CS, background:'#FFFDE7'}}>{fmt(totalRow.total_paid_out)}</td>
                  <td style={{...CS, fontSize:12, background:'#FFFF00', color:(totalRow.closing_balance??0)>=0?'#000':'#FF0000'}}>
                    {totalRow.closing_balance!=null ? totalRow.closing_balance.toLocaleString('en-IN') : ''}
                  </td>
                  <td style={{...CS}}></td><td style={{...CS}}></td><td style={{...CS}}></td><td style={{...CS}}></td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* ── L-15 Popup ─────────────────────────────────────────────────────────── */}
      {showL15 && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setShowL15(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl z-[60] flex flex-col" style={{ width: 520, maxHeight: '85vh' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5e7eb]">
              <div>
                <h2 className="font-semibold text-sm text-[#1a1a1a]">L-15 Walk-in Cash Entries</h2>
                <p className="text-xs text-[#6b7280]">{fmtDate(selectedDate)}</p>
              </div>
              <button onClick={() => setShowL15(false)} className="p-1 hover:bg-gray-100 rounded"><X size={16} color="#6b7280" /></button>
            </div>

            {/* Add form */}
            <div className="px-5 py-3 border-b border-[#e5e7eb] flex flex-col gap-2">
              <div className="flex gap-2">
                <input placeholder="Customer name" value={l15Name} onChange={e => setL15Name(e.target.value)}
                  className="flex-1 border rounded px-2.5 py-1.5 text-xs outline-none focus:border-[#3ECF8E]"
                  style={{ borderColor: '#e5e7eb' }} />
                <input type="number" placeholder="Amount" value={l15Amount} onChange={e => setL15Amount(e.target.value)}
                  className="w-28 border rounded px-2.5 py-1.5 text-xs outline-none focus:border-[#3ECF8E]"
                  style={{ borderColor: '#e5e7eb' }} />
              </div>
              <div className="flex gap-2">
                <input placeholder="Notes (optional)" value={l15Notes} onChange={e => setL15Notes(e.target.value)}
                  className="flex-1 border rounded px-2.5 py-1.5 text-xs outline-none focus:border-[#3ECF8E]"
                  style={{ borderColor: '#e5e7eb' }} />
                <button onClick={addL15Entry} disabled={l15Saving}
                  className="px-3 py-1.5 rounded text-xs font-semibold text-white"
                  style={{ background: '#3ECF8E', opacity: l15Saving ? 0.6 : 1 }}>
                  {l15Saving ? 'Adding…' : 'Add'}
                </button>
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {l15Entries.length === 0 ? (
                <div className="text-xs text-[#9ca3af] text-center py-8">No L-15 entries for this date</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-[#f9f9f9] sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-[#6b7280] font-medium">Name</th>
                      <th className="px-3 py-2 text-right text-[#6b7280] font-medium">Amount</th>
                      <th className="px-3 py-2 text-left text-[#6b7280] font-medium">Notes</th>
                      <th className="px-3 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {l15Entries.map(e => (
                      <tr key={e.id} className="border-t border-[#e5e7eb]">
                        <td className="px-3 py-2">{e.customer_name}</td>
                        <td className="px-3 py-2 text-right font-medium">₹{Number(e.amount).toLocaleString('en-IN')}</td>
                        <td className="px-3 py-2 text-[#6b7280]">{e.notes || '—'}</td>
                        <td className="px-3 py-2">
                          <button onClick={() => deleteL15Entry(e.id)} className="text-red-400 hover:text-red-600">✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Total */}
            <div className="px-5 py-3 border-t border-[#e5e7eb] flex justify-between items-center">
              <span className="text-xs text-[#6b7280]">Total L-15 Cash</span>
              <span className="text-sm font-bold text-[#1a1a1a]">
                ₹{l15Entries.reduce((s, e) => s + Number(e.amount), 0).toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        </>
      )}

      {/* ── Expense Popup ───────────────────────────────────────────────────────── */}
      {showExpense && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setShowExpense(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl z-[60] flex flex-col" style={{ width: 580, maxHeight: '88vh' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5e7eb]">
              <div>
                <h2 className="font-semibold text-sm text-[#1a1a1a]">Daily Expenses</h2>
                <p className="text-xs text-[#6b7280]">{fmtDate(selectedDate)}</p>
              </div>
              <button onClick={() => setShowExpense(false)} className="p-1 hover:bg-gray-100 rounded"><X size={16} color="#6b7280" /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3 flex flex-col gap-4">
              {/* Group expenses by category */}
              {Object.entries(CATEGORY_LABELS).map(([cat, label]) => {
                const catRows = rows.filter(r => r.row_type === 'expense' && expenseMaster.find(em => em.id === r.expense_id && em.category === cat))
                if (catRows.length === 0) return null
                return (
                  <div key={cat}>
                    <div className="text-xs font-semibold text-[#374151] mb-1.5">{label}</div>
                    <div className="flex flex-col gap-1.5">
                      {catRows.map(row => (
                        <div key={row.id} className="flex items-center gap-2">
                          <span className="text-xs text-[#374151] w-36 flex-shrink-0">{row.expense_name}</span>
                          <input type="number" placeholder="0"
                            value={expenseEdits[row.id]?.amount ?? ''}
                            onChange={e => setExpenseEdits(ed => ({ ...ed, [row.id]: { ...ed[row.id], amount: e.target.value } }))}
                            className="w-28 border rounded px-2 py-1 text-xs outline-none focus:border-[#3ECF8E]"
                            style={{ borderColor: '#e5e7eb' }} />
                          <input placeholder="Notes" value={expenseEdits[row.id]?.note ?? ''}
                            onChange={e => setExpenseEdits(ed => ({ ...ed, [row.id]: { ...ed[row.id], note: e.target.value } }))}
                            className="flex-1 border rounded px-2 py-1 text-xs outline-none focus:border-[#3ECF8E]"
                            style={{ borderColor: '#e5e7eb' }} />
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}

              {/* Custom expense rows (category = other, not in master default) */}
              {(() => {
                const customRows = rows.filter(r => r.row_type === 'expense' && !expenseMaster.find(em => em.id === r.expense_id))
                if (customRows.length === 0) return null
                return (
                  <div>
                    <div className="text-xs font-semibold text-[#374151] mb-1.5">📦 Custom</div>
                    {customRows.map(row => (
                      <div key={row.id} className="flex items-center gap-2 mb-1.5">
                        <span className="text-xs text-[#374151] w-36 flex-shrink-0">{row.expense_name}</span>
                        <input type="number" placeholder="0"
                          value={expenseEdits[row.id]?.amount ?? ''}
                          onChange={e => setExpenseEdits(ed => ({ ...ed, [row.id]: { ...ed[row.id], amount: e.target.value } }))}
                          className="w-28 border rounded px-2 py-1 text-xs outline-none focus:border-[#3ECF8E]"
                          style={{ borderColor: '#e5e7eb' }} />
                        <input placeholder="Notes" value={expenseEdits[row.id]?.note ?? ''}
                          onChange={e => setExpenseEdits(ed => ({ ...ed, [row.id]: { ...ed[row.id], note: e.target.value } }))}
                          className="flex-1 border rounded px-2 py-1 text-xs outline-none focus:border-[#3ECF8E]"
                          style={{ borderColor: '#e5e7eb' }} />
                      </div>
                    ))}
                  </div>
                )
              })()}

              {/* Add custom expense */}
              <div className="border-t border-[#e5e7eb] pt-3">
                <div className="text-xs font-semibold text-[#374151] mb-2">+ Add Custom Expense</div>
                <div className="flex gap-2 flex-wrap">
                  <input placeholder="Expense name" value={newExpName} onChange={e => setNewExpName(e.target.value)}
                    className="border rounded px-2 py-1 text-xs outline-none focus:border-[#3ECF8E] w-36"
                    style={{ borderColor: '#e5e7eb' }} />
                  <input type="number" placeholder="Amount" value={newExpAmt} onChange={e => setNewExpAmt(e.target.value)}
                    className="border rounded px-2 py-1 text-xs outline-none focus:border-[#3ECF8E] w-24"
                    style={{ borderColor: '#e5e7eb' }} />
                  <select value={newExpCat} onChange={e => setNewExpCat(e.target.value)}
                    className="border rounded px-2 py-1 text-xs outline-none focus:border-[#3ECF8E] bg-white"
                    style={{ borderColor: '#e5e7eb' }}>
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <button onClick={addCustomExpense} className="px-3 py-1 rounded text-xs font-medium text-white" style={{ background: '#3ECF8E' }}>
                    Add
                  </button>
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-[#e5e7eb]">
              <button onClick={saveExpenses} disabled={expenseSaving}
                className="w-full py-2 rounded text-sm font-semibold text-white"
                style={{ background: '#3ECF8E', opacity: expenseSaving ? 0.6 : 1 }}>
                {expenseSaving ? 'Saving…' : 'Save Expenses'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Add Opening Person Popup ─────────────────────────────────────────────── */}
      {showAddPerson && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setShowAddPerson(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl z-[60] p-6" style={{ width: 360 }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-sm text-[#1a1a1a]">Add to Opening Balance</h2>
              <button onClick={() => setShowAddPerson(false)} className="p-1 hover:bg-gray-100 rounded"><X size={16} color="#6b7280" /></button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-[11px] font-medium text-[#374151] mb-0.5">Person Name</label>
                <input placeholder="e.g. Ramesh" value={personName} onChange={e => setPersonName(e.target.value)}
                  className="w-full border rounded px-2.5 py-1.5 text-xs outline-none focus:border-[#3ECF8E]"
                  style={{ borderColor: '#e5e7eb' }} />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#374151] mb-0.5">Amount Received</label>
                <input type="number" placeholder="0" value={personAmount} onChange={e => setPersonAmount(e.target.value)}
                  className="w-full border rounded px-2.5 py-1.5 text-xs outline-none focus:border-[#3ECF8E]"
                  style={{ borderColor: '#e5e7eb' }} />
              </div>
              <button onClick={addOpeningPerson} className="w-full py-2 rounded text-sm font-semibold text-white mt-1" style={{ background: '#3ECF8E' }}>
                Add to Opening
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
