'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ChevronLeft, ChevronRight, Download, RefreshCw, X } from 'lucide-react'

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
  paid_in_cash: number | null
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

// A=date | B=opening name | C=opening amt | D=DR name | E=paid in cash | F=swap | G=comm | H=swap firm(yellow) | I=TRF firm | J=cash/GP
const COL_WIDTHS = { a: 70, b: 160, c: 100, d: 200, e: 100, f: 110, g: 80, h: 140, i: 120, j: 100 }
const NCOLS = 11
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
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

const CATEGORY_LABELS: Record<string, string> = {
  office: '🏢 Office', transport: '🚗 Transport', utility: '⚡ Utilities',
  salary: '👤 Salaries', on_hand: '💰 On Hand', rent: '🏠 Rent', other: '📦 Other',
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function ChamundaSheetView() {
  const [selectedDate, setSelectedDate] = useState(() => toDateStr(new Date()))
  const [allRows, setAllRows] = useState<ChamundaRow[]>([])
  const [allL15, setAllL15] = useState<L15Entry[]>([])
  const [entryTypeMap, setEntryTypeMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // Inline edit
  const [editCell, setEditCell] = useState<{ id: string; field: string; value: string } | null>(null)
  const [flashCells, setFlashCells] = useState<Set<string>>(new Set())
  const editInputRef = useRef<HTMLInputElement>(null)

  // Popups
  const [showL15, setShowL15] = useState(false)
  const [showExpense, setShowExpense] = useState(false)

  // L-15 state
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

  // ── Fetch all dates ───────────────────────────────────────────────────────────
  const fetchSheet = useCallback(async (date: string, forceInit = false) => {
    if (forceInit || !initializedDates.current.has(date)) {
      const { data: existing } = await supabase.from('chamunda_sheet').select('id, row_type').eq('date', date)
      if (!existing || existing.length === 0) {
        await supabase.rpc('initialize_chamunda_sheet', { p_date: date })
        // Set opening cash = most recent previous date's closing balance
        const { data: prevTotalRow } = await supabase
          .from('chamunda_sheet')
          .select('date, closing_balance, opening_amount')
          .eq('row_type', 'total')
          .lt('date', date)
          .order('date', { ascending: false })
          .limit(1)
          .maybeSingle()

        let prevClosing = 0
        if (prevTotalRow && prevTotalRow.closing_balance != null) {
          prevClosing = Number(prevTotalRow.closing_balance)
        } else if (prevTotalRow == null) {
          // No total row yet — compute from raw rows of most recent date
          const { data: prevAllRows } = await supabase
            .from('chamunda_sheet')
            .select('date, row_type, opening_amount, paid_in_cash, expense_amount')
            .lt('date', date)
            .order('date', { ascending: false })
            .limit(200)
          if (prevAllRows && prevAllRows.length > 0) {
            const prevDate = prevAllRows[0].date
            const pRows = prevAllRows.filter((r: { date: string }) => r.date === prevDate)
            const pCashIn  = pRows.filter((r: { row_type: string }) => ['opening_cash','opening_hdfc','opening_l15','opening_person'].includes(r.row_type))
              .reduce((s: number, r: { opening_amount: number | null }) => s + (Number(r.opening_amount) || 0), 0)
            const pPaidOut = pRows.filter((r: { row_type: string }) => r.row_type === 'transaction')
              .reduce((s: number, r: { paid_in_cash: number | null }) => s + (Number(r.paid_in_cash) || 0), 0)
            const pExpenses = pRows.filter((r: { row_type: string }) => r.row_type === 'expense')
              .reduce((s: number, r: { expense_amount: number | null }) => s + (Number(r.expense_amount) || 0), 0)
            prevClosing = pCashIn - pPaidOut - pExpenses
          }
        }

        if (prevClosing !== 0) {
          await supabase.from('chamunda_sheet')
            .update({ opening_amount: prevClosing })
            .eq('date', date)
            .eq('row_type', 'opening_cash')
        }
      } else {
        const fixed = ['opening_cash', 'opening_hdfc', 'opening_l15', 'total']
        for (const rt of fixed) {
          const dupes = existing.filter(r => r.row_type === rt)
          if (dupes.length > 1) {
            await supabase.from('chamunda_sheet').delete().in('id', dupes.slice(1).map(r => r.id))
          }
        }
      }
      initializedDates.current.add(date)
    }
    await fetchAll()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [{ data: sheetData }, { data: l15Data }, { data: txData }] = await Promise.all([
      supabase.from('chamunda_sheet').select('*').order('date', { ascending: false }).order('sort_order', { ascending: true }).limit(5000),
      supabase.from('l15_entries').select('*').order('date', { ascending: false }).order('created_at').limit(2000),
      supabase.from('transactions').select('id,entry_type').limit(5000),
    ])
    setAllRows((sheetData as ChamundaRow[]) || [])
    setAllL15((l15Data as L15Entry[]) || [])
    const etMap: Record<string, string> = {}
    ;(txData || []).forEach((t: { id: string; entry_type: string }) => { etMap[t.id] = t.entry_type })
    setEntryTypeMap(etMap)
    setLoading(false)
  }, [])

  useEffect(() => { fetchSheet(selectedDate) }, [fetchSheet, selectedDate])

  // Keep l15Entries in sync for the popup (today's date)
  const l15Entries = allL15.filter(e => e.date === selectedDate)

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

  // Realtime: auto-refresh on any change
  useEffect(() => {
    const channel = supabase
      .channel('chamunda_realtime_all')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chamunda_sheet' }, () => fetchAll())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chamunda_sheet' }, () => fetchAll())
      .subscribe(status => console.log('[Chamunda] Realtime status:', status))
    return () => { supabase.removeChannel(channel) }
  }, [fetchAll])

  // ── Midnight auto-refresh: initialize new day's table at 12:00 AM ────────────
  useEffect(() => {
    function msUntilMidnight() {
      const now = new Date()
      const midnight = new Date(now)
      midnight.setHours(24, 0, 0, 0)
      return midnight.getTime() - now.getTime()
    }
    let dailyInterval: ReturnType<typeof setInterval>
    const timeout = setTimeout(() => {
      const newDate = toDateStr(new Date())
      setSelectedDate(newDate)
      fetchSheet(newDate, true)
      // Then repeat every 24h
      dailyInterval = setInterval(() => {
        const d = toDateStr(new Date())
        setSelectedDate(d)
        fetchSheet(d, true)
      }, 24 * 60 * 60 * 1000)
    }, msUntilMidnight())
    return () => { clearTimeout(timeout); clearInterval(dailyInterval) }
  }, [fetchSheet])

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

    const rowDate = allRows.find(r => r.id === id)?.date || selectedDate
    const { error } = await supabase.from('chamunda_sheet').update({ [field]: dbVal }).eq('id', id)
    if (!error) {
      setAllRows(rs => rs.map(r => r.id === id ? { ...r, [field]: dbVal } : r))
      const key = `${id}__${field}`
      setFlashCells(s => new Set(Array.from(s).concat(key)))
      setTimeout(() => setFlashCells(s => { const n = new Set(s); n.delete(key); return n }), 800)
      await supabase.rpc('recalculate_chamunda_totals', { p_date: rowDate })
      await fetchAll()
    } else {
      showToast('Save failed: ' + error.message, 'error')
    }
  }

  // ── L-15 ─────────────────────────────────────────────────────────────────────
  async function fetchL15() { await fetchAll() }

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
    await fetchAll()
    showToast('L-15 entry added')
  }

  async function deleteL15Entry(id: string) {
    await supabase.from('l15_entries').delete().eq('id', id)
    const { data: entries } = await supabase.from('l15_entries').select('amount').eq('date', selectedDate)
    const total = (entries || []).reduce((s, r) => s + Number(r.amount), 0)
    await supabase.from('chamunda_sheet').update({ opening_amount: total }).eq('date', selectedDate).eq('row_type', 'opening_l15')
    await supabase.rpc('recalculate_chamunda_totals', { p_date: selectedDate })
    await fetchL15()
    await fetchAll()
  }

  // ── Expense popup ─────────────────────────────────────────────────────────────
  async function openExpensePopup() {
    // Always re-initialize to ensure expense rows exist for this date
    // (safe to call multiple times — initialize uses IF NOT EXISTS per row)
    await supabase.rpc('initialize_chamunda_sheet', { p_date: selectedDate })

    const [{ data: em }, { data: expRows }] = await Promise.all([
      supabase.from('expense_master').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('chamunda_sheet').select('*').eq('date', selectedDate).eq('row_type', 'expense').order('sort_order'),
    ])
    setExpenseMaster((em as ExpenseMaster[]) || [])
    const freshExpRows = (expRows as ChamundaRow[]) || []
    setAllRows(prev => [...prev.filter(r => !(r.date === selectedDate && r.row_type === 'expense')), ...freshExpRows])
    const edits: Record<string, { amount: string; note: string }> = {}
    freshExpRows.forEach(r => {
      edits[r.id] = { amount: r.expense_amount ? String(r.expense_amount) : '', note: r.expense_note || '' }
    })
    setExpenseEdits(edits)
    setShowExpense(true)
  }

  async function saveExpenses() {
    setExpenseSaving(true)
    console.log('[saveExpenses] expenseEdits:', expenseEdits)
    let saveError = false
    for (const [rowId, edit] of Object.entries(expenseEdits)) {
      const amt = parseFloat(edit.amount) || 0
      const { error } = await supabase.from('chamunda_sheet')
        .update({ expense_amount: amt, expense_note: edit.note || null })
        .eq('id', rowId)
      if (error) { console.error('[saveExpenses] update error:', error.message); saveError = true }
    }
    if (saveError) { showToast('Some expenses failed to save', 'error'); setExpenseSaving(false); return }
    await supabase.rpc('recalculate_chamunda_totals', { p_date: selectedDate })

    // Directly patch allRows with saved amounts so UI reflects immediately
    setAllRows(prev => prev.map(r => {
      const edit = expenseEdits[r.id]
      if (!edit) return r
      return { ...r, expense_amount: parseFloat(edit.amount) || 0, expense_note: edit.note || null }
    }))

    await fetchAll()
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
      await fetchAll()
      setExpenseMaster(prev => [...prev, em as ExpenseMaster])
    }
    setNewExpName(''); setNewExpAmt(''); setNewExpCat('other')
    showToast('Custom expense added')
  }


  // ── Export XLSX — mirrors screen layout exactly ──────────────────────────────
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
    const yellow  = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFFF00' } }
    const white   = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFFFFF' } }
    const ctr     = { horizontal: 'center' as const, vertical: 'middle' as const }
    const bold    = { bold: true,  name: 'Calibri', size: 11 }
    const normal  = { bold: false, name: 'Calibri', size: 11 }
    const numFmt  = '#,##0'
    const E10     = () => ['','','','','','','','','',''] as (string|number)[]
    const COLS    = ['A','B','C','D','E','F','G','H','I','J']
    void white // used in styleRow

    ws.columns = [
      { key:'A', width:10 }, { key:'B', width:22 }, { key:'C', width:14 },
      { key:'D', width:28 }, { key:'E', width:14 }, { key:'F', width:14 },
      { key:'G', width:11 }, { key:'H', width:18 }, { key:'I', width:18 }, { key:'J', width:14 },
    ]

    // helper: add a row with thin borders + white bg + center align on all 10 cols
    function cell(r: import('exceljs').Row, col: string) { return r.getCell(col) }
    function styleRow(r: import('exceljs').Row) {
      COLS.forEach(c => {
        cell(r,c).border    = border
        cell(r,c).fill      = white
        cell(r,c).alignment = ctr
        cell(r,c).font      = normal
      })
    }
    function addDataRow() { const r = ws.addRow(E10()); styleRow(r); return r }
    // bordered empty rows (within table gaps)
    function addGapRows(n: number) {
      for (let i = 0; i < n; i++) { const r = ws.addRow(E10()); styleRow(r); r.height = 16 }
    }
    // no-border spacer rows (between tables or between machine groups)
    function addSpacer(n: number) {
      for (let i = 0; i < n; i++) { const r = ws.addRow(E10()); r.height = 12 }
    }

    // newest first — same order as screen
    dateGroups.forEach(([date, dateRows], gi) => {
      const dOpeningRows = dateRows.filter(r => ['opening_cash','opening_hdfc','opening_l15','opening_person'].includes(r.row_type))
      const dTxRows      = dateRows.filter(r => r.row_type === 'transaction')
      const dExpRows     = dateRows.filter(r => r.row_type === 'expense' && (r.expense_amount ?? 0) > 0)
      const dL15         = allL15.filter(e => e.date === date)

      const machineMap = new Map<string, ChamundaRow[]>()
      dTxRows.forEach(r => { const k = r.machine_name||''; if(!machineMap.has(k)) machineMap.set(k,[]); machineMap.get(k)!.push(r) })
      const machineGroups = Array.from(machineMap.entries())

      const totalCashIn       = dOpeningRows.reduce((s,r) => s+(Number(r.opening_amount)||0), 0)
      const totalPaidInCash   = dTxRows.reduce((s,r) => s+(Number(r.paid_in_cash)||0), 0)
      const totalCashGpRecdXlsx = dTxRows.reduce((s,r) => s+(Number(r.cash_gp_recd)||0), 0)
      const totalExpensesXlsx = dateRows.filter(r => r.row_type === 'expense').reduce((s,r) => s+(Number(r.expense_amount)||0), 0)
      const closingBalance    = totalCashIn - totalPaidInCash + totalCashGpRecdXlsx - totalExpensesXlsx

      // spacer between date tables
      if (gi > 0) addSpacer(4)

      // ── Title row (merged, yellow) ──
      const tRowNum = ws.rowCount + 1
      ws.addRow([`"Shree Ganeshay Namah"  —  DT ${fmtDate(date)}`,...Array(9).fill('')])
      const tRow = ws.getRow(tRowNum)
      ws.mergeCells(tRowNum, 1, tRowNum, 10)
      tRow.height = 22
      const tCell = tRow.getCell(1)
      tCell.fill      = yellow
      tCell.font      = { bold: true, name: 'Calibri', size: 13 }
      tCell.alignment = ctr
      tCell.border    = border
      for (let c = 2; c <= 10; c++) { tRow.getCell(c).border = border; tRow.getCell(c).fill = yellow }

      // ── Header row ──
      const hRowNum = ws.rowCount + 1
      ws.addRow(['DT','OPENING BAL','Amount','NAME','Paid in Cash','Swap Amount','COMM','Swap Firm Name','TRF Firm Name','Cash/GP Recd'])
      const hRow = ws.getRow(hRowNum)
      hRow.height = 18
      COLS.forEach(c => { hRow.getCell(c).fill = yellow; hRow.getCell(c).font = bold; hRow.getCell(c).border = border; hRow.getCell(c).alignment = ctr })

      // ── Opening rows ──
      dOpeningRows.forEach(row => {
        const isL15  = row.row_type === 'opening_l15'
        const isCash = row.row_type === 'opening_cash'
        const r = addDataRow()
        cell(r,'B').value = row.opening_name || ''
        cell(r,'B').font  = isCash ? bold : normal
        if (!isL15 && row.opening_amount != null) {
          cell(r,'C').value  = row.opening_amount
          cell(r,'C').numFmt = numFmt
          cell(r,'C').font   = bold
        }
        if (isL15) {
          dL15.forEach(e => {
            const sub = addDataRow()
            cell(sub,'B').value  = e.customer_name
            cell(sub,'C').value  = e.amount
            cell(sub,'C').numFmt = numFmt
          })
        }
      })

      // ── 5 gap rows ──
      addGapRows(5)

      // ── Transactions by machine ──
      machineGroups.forEach(([, txRows], mgi) => {
        if (mgi > 0) addGapRows(1)
        txRows.forEach(row => {
          const name = (row.name||(row as unknown as Record<string,string>).card_holder||'').trim()
          const r = addDataRow()
          cell(r,'D').value  = `DR ${(row.bank_charge_pct||3).toFixed(2)} ${name}`
          if (row.paid_in_cash) { cell(r,'E').value = row.paid_in_cash; cell(r,'E').numFmt = numFmt }
          if (row.swap_amount)  { cell(r,'F').value = row.swap_amount;  cell(r,'F').numFmt = numFmt }
          cell(r,'G').value  = row.commission_type || ''
          cell(r,'H').value  = row.machine_name || ''
          cell(r,'H').fill   = yellow
          cell(r,'H').font   = { bold: true, name: 'Calibri', size: 11, color: { argb: 'FFFF0000' } }
          cell(r,'I').value  = row.trf_firm_name || ''
          if (row.cash_gp_recd) { cell(r,'J').value = row.cash_gp_recd; cell(r,'J').numFmt = numFmt }
        })
      })

      // ── 5 gap rows ──
      addGapRows(5)

      // ── Expense rows ──
      if (dExpRows.length > 0) {
        dExpRows.forEach(row => {
          const r = addDataRow()
          cell(r,'D').value = `DR ${row.expense_name||''}`
          if (row.expense_amount) { cell(r,'E').value = row.expense_amount; cell(r,'E').numFmt = numFmt; cell(r,'E').font = bold }
          cell(r,'G').value = row.expense_note || ''
        })
        addGapRows(5)
      }

      // ── Total / Closing row ──
      const tr = addDataRow()
      cell(tr,'B').value  = 'TOTAL / CLOSING'
      cell(tr,'B').fill   = yellow
      cell(tr,'B').font   = bold
      cell(tr,'C').value  = totalCashIn;  cell(tr,'C').numFmt = numFmt; cell(tr,'C').font = bold
      cell(tr,'C').fill   = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFFDFBE7' } }
      cell(tr,'E').value  = totalPaidInCash; cell(tr,'E').numFmt = numFmt; cell(tr,'E').font = bold
      cell(tr,'E').fill   = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFFDFBE7' } }
      cell(tr,'F').value  = closingBalance; cell(tr,'F').numFmt = numFmt
      cell(tr,'F').fill   = { type:'pattern', pattern:'solid', fgColor:{ argb: 'FFFFFF00' } }
      cell(tr,'F').font   = { bold:true, name:'Calibri', size:12, color:{ argb: closingBalance>=0?'FF000000':'FFFF0000' } }
    })

    const buf = await wb.xlsx.writeBuffer()
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    const a = document.createElement('a'); a.href = url
    a.download = `ChamundaSheet_${selectedDate}.xlsx`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }

  // ── Group all rows by date ────────────────────────────────────────────────────
  const dateGroups = React.useMemo(() => {
    const map = new Map<string, ChamundaRow[]>()
    allRows.forEach(r => {
      if (!map.has(r.date)) map.set(r.date, [])
      map.get(r.date)!.push(r)
    })
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a)) // newest first
  }, [allRows])

  // rows/derived for today (used by popups)
  const rows = allRows.filter(r => r.date === selectedDate)
  const expenseRows = rows.filter(r => r.row_type === 'expense')

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

        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setShowL15(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded border text-xs font-medium hover:bg-gray-50"
            style={{ borderColor: '#e5e7eb' }}>
            L-15
          </button>
          <button onClick={openExpensePopup}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded border text-xs font-medium hover:bg-gray-50"
            style={{ borderColor: '#e5e7eb' }}>
            Expenses
          </button>
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
                await fetchAll()
                showToast(synced > 0 ? `Synced ${synced} transaction(s)!` : 'Already in sync', 'success')
              } else {
                showToast('No transactions found for this date', 'error')
              }
            }}
            style={{ background: '#f59e0b', color: 'white', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 'bold' }}
          >
            🔄 Sync
          </button>
          <button onClick={fetchAll} className="p-1.5 rounded border hover:bg-gray-50" style={{ borderColor: '#e5e7eb' }}>
            <RefreshCw size={12} color="#6b7280" className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Tables — one per date */}
      <div className="flex-1 overflow-auto p-3 flex flex-col gap-8" style={{ fontFamily: 'Calibri,Arial,sans-serif' }}>
        {loading ? (
          <div className="flex items-center justify-center h-32 text-sm text-[#6b7280]">Loading…</div>
        ) : dateGroups.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-[#6b7280]">No data yet</div>
        ) : dateGroups.map(([date, dateRows]) => {
          const dOpeningRows = dateRows.filter(r => ['opening_cash','opening_hdfc','opening_l15','opening_person'].includes(r.row_type))
          const dTxRows = dateRows.filter(r => r.row_type === 'transaction')
          const dExpRows = dateRows.filter(r => r.row_type === 'expense')
          const dTotalRow = dateRows.find(r => r.row_type === 'total')
          const dL15 = allL15.filter(e => e.date === date)
          const machineMap = new Map<string, ChamundaRow[]>()
          dTxRows.forEach(r => { const k = r.machine_name||''; if(!machineMap.has(k)) machineMap.set(k,[]); machineMap.get(k)!.push(r) })
          const dMachineGroups = Array.from(machineMap.entries())
          const totalCashIn = dOpeningRows.reduce((s,r) => s+(Number(r.opening_amount)||0), 0)
          const totalPaidInCash = dTxRows.reduce((s,r) => s+(Number(r.paid_in_cash)||0), 0)
          const totalCashGpRecd = dTxRows.reduce((s,r) => s+(Number(r.cash_gp_recd)||0), 0)
          const totalExpenses = dateRows.filter(r => r.row_type === 'expense').reduce((s,r) => s+(Number(r.expense_amount)||0), 0)
          const closingBalance = totalCashIn - totalPaidInCash + totalCashGpRecd - totalExpenses
          return (
            <table key={date} style={{ width: TBL_W, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup>
                {(Object.values(COL_WIDTHS) as number[]).map((w, i) => <col key={i} style={{ width: w }} />)}
              </colgroup>
              <tbody>
                {/* Title */}
                <tr>
                  <td colSpan={NCOLS} style={{ ...HS, textAlign: 'center', fontSize: 13, letterSpacing: 1 }}>
                    &quot;Shree Ganeshay Namah&quot; &nbsp;—&nbsp; DT {fmtDate(date)}
                  </td>
                </tr>
                {/* Headers */}
                <tr>
                  <th style={{...HS}}>DT</th><th style={{...HS}}>OPENING BAL</th><th style={{...HS}}>Amount</th>
                  <th style={{...HS}}>NAME</th><th style={{...HS}}>Paid in Cash</th><th style={{...HS}}>Swap Amount</th>
                  <th style={{...HS}}>COMM</th><th style={{...HS}}>Swap Firm Name</th><th style={{...HS}}>TRF Firm Name</th>
                  <th style={{...HS}}>Cash/GP Recd</th><th style={{...HS}}>TXN TYPE</th>
                </tr>
                {/* Opening rows */}
                {dOpeningRows.map(row => {
                  const isCash = row.row_type === 'opening_cash'
                  const isL15  = row.row_type === 'opening_l15'
                  const flash  = flashCells.has(`${row.id}__opening_amount`)
                  const rest = Array.from({length:8}).map((_,i) => <td key={i} style={{...CS}}></td>)
                  return (
                    <React.Fragment key={row.id}>
                      <tr>
                        <td style={{...CS}}></td>
                        <td style={{...CS, textAlign:'center', fontWeight: isCash?'bold':'normal'}}>{row.opening_name}</td>
                        <td onClick={() => !isCash&&!isL15&&startEdit(row,'opening_amount')}
                          style={{...CS, textAlign:'center', background: flash?'#bbf7d0':isCash?'#f3f4f6':'#fff',
                            cursor: isCash||isL15?'default':'text', color: isCash?'#6b7280':'#000', fontWeight:'bold', transition:'background 0.3s'}}>
                          {isL15 ? '' : editCell?.id===row.id && editCell?.field==='opening_amount' && !isCash ? (
                            <input ref={editInputRef} autoFocus type="number" value={editCell.value}
                              onChange={e => setEditCell(ec => ec?{...ec,value:e.target.value}:ec)}
                              onBlur={commitEdit}
                              onKeyDown={e => { if(e.key==='Enter'){e.preventDefault();commitEdit()} if(e.key==='Escape')setEditCell(null) }}
                              style={{width:'100%',border:'none',outline:'2px solid #3ECF8E',padding:'2px 4px',fontSize:11,fontFamily:'Calibri,Arial,sans-serif',background:'#fff',boxSizing:'border-box',textAlign:'center'}} />
                          ) : (fmt(row.opening_amount)||(isCash?<span style={{color:'#9ca3af',fontWeight:'normal',fontSize:10}}>prev day closing</span>:''))}
                        </td>
                        {rest}
                      </tr>
                      {isL15 && dL15.map(e => (
                        <tr key={e.id}>
                          <td style={{...CS}}></td>
                          <td style={{...CS, textAlign:'center', fontSize:11}}>{e.customer_name}</td>
                          <td style={{...CS, textAlign:'center', fontSize:11}}>{e.amount?e.amount.toLocaleString('en-IN'):''}</td>
                          {Array.from({length:8}).map((_,i) => <td key={i} style={{...CS}}></td>)}
                        </tr>
                      ))}
                    </React.Fragment>
                  )
                })}
                {/* Gap */}
                {[0,1,2,3,4].map(i => <tr key={`g1-${i}`}>{Array.from({length:NCOLS}).map((_,j)=><td key={j} style={{...CS,height:16}}></td>)}</tr>)}
                {/* Transactions */}
                {dMachineGroups.map(([machine, txRows], mgi) => (
                  <React.Fragment key={machine}>
                    {mgi > 0 && <tr>{Array.from({length:NCOLS}).map((_,j)=><td key={j} style={{...CS,height:16}}></td>)}</tr>}
                    {txRows.map(row => {
                      const isEditingCash = editCell?.id===row.id && editCell?.field==='cash_gp_recd'
                      const flashCash = flashCells.has(`${row.id}__cash_gp_recd`)
                      const name = (row.name||(row as unknown as Record<string,string>).card_holder||'').trim()
                      return (
                        <tr key={row.id} onMouseEnter={e=>(e.currentTarget.style.background='#FFFEF0')} onMouseLeave={e=>(e.currentTarget.style.background='#fff')}>
                          <td style={{...CS}}></td><td style={{...CS}}></td><td style={{...CS}}></td>
                          <td style={{...CS}}>{`DR ${(row.bank_charge_pct||3).toFixed(2)} ${name}`}</td>
                          <td style={{...CS,textAlign:'center'}}>{fmt(row.paid_in_cash)}</td>
                          <td style={{...CS,textAlign:'center'}}>{fmt(row.swap_amount)}</td>
                          <td style={{...CS,fontSize:10}}>{row.commission_type||''}</td>
                          <td style={{...CS,background:'#FFFF00',color:'#FF0000',fontWeight:'bold'}}>{row.machine_name||''}</td>
                          <td style={{...CS}}>{row.trf_firm_name||''}</td>
                          <td onClick={()=>startEdit(row,'cash_gp_recd')} style={{...CS,textAlign:'center',background:flashCash?'#bbf7d0':'#fff',cursor:'text',transition:'background 0.3s'}}>
                            {isEditingCash ? (
                              <input ref={editInputRef} autoFocus type="number" value={editCell.value}
                                onChange={e=>setEditCell(ec=>ec?{...ec,value:e.target.value}:ec)}
                                onBlur={commitEdit}
                                onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();commitEdit()}if(e.key==='Escape')setEditCell(null)}}
                                style={{width:'100%',border:'none',outline:'2px solid #3ECF8E',padding:'2px 4px',fontSize:11,fontFamily:'Calibri,Arial,sans-serif',background:'#fff',boxSizing:'border-box',textAlign:'center'}} />
                            ) : fmt(row.cash_gp_recd)}
                          </td>
                          <td style={{...CS,textAlign:'center'}}>
                            {(() => {
                              const et = row.transaction_id ? entryTypeMap[row.transaction_id] : null
                              if (!et) return <span style={{color:'#9ca3af',fontSize:10}}>—</span>
                              const isSwap = et === 'swap'
                              return (
                                <span style={{
                                  padding:'2px 6px', borderRadius:4, fontSize:10, fontWeight:700,
                                  background: isSwap ? '#dbeafe' : '#dcfce7',
                                  color: isSwap ? '#1e40af' : '#166534',
                                }}>
                                  {isSwap ? 'Card Swap' : 'Card Refill'}
                                </span>
                              )
                            })()}
                          </td>
                        </tr>
                      )
                    })}
                  </React.Fragment>
                ))}
                {/* Gap */}
                {[0,1,2,3,4].map(i => <tr key={`g2-${i}`}>{Array.from({length:NCOLS}).map((_,j)=><td key={j} style={{...CS,height:16}}></td>)}</tr>)}
                {/* Expense rows — inline editable */}
                {dExpRows.map(row => {
                  const isEditingAmt  = editCell?.id === row.id && editCell?.field === 'expense_amount'
                  const isEditingNote = editCell?.id === row.id && editCell?.field === 'expense_note'
                  const flashAmt  = flashCells.has(`${row.id}__expense_amount`)
                  return (
                    <tr key={row.id} onMouseEnter={e=>(e.currentTarget.style.background='#FFFEF0')} onMouseLeave={e=>(e.currentTarget.style.background='#fff')}>
                      <td style={{...CS}}></td><td style={{...CS}}></td><td style={{...CS}}></td>
                      <td style={{...CS, color: (row.expense_amount ?? 0) > 0 ? '#000' : '#9ca3af'}}>DR {row.expense_name||''}</td>
                      <td onClick={() => startEdit(row, 'expense_amount')}
                        style={{...CS, fontWeight:'bold', cursor:'text', background: flashAmt ? '#bbf7d0' : (row.expense_amount ?? 0) > 0 ? '#fff' : '#fafafa', transition:'background 0.3s'}}>
                        {isEditingAmt ? (
                          <input ref={editInputRef} autoFocus type="number" value={editCell.value}
                            onChange={e => setEditCell(ec => ec ? {...ec, value: e.target.value} : ec)}
                            onBlur={commitEdit}
                            onKeyDown={e => { if(e.key==='Enter'){e.preventDefault();commitEdit()} if(e.key==='Escape')setEditCell(null) }}
                            style={{width:'100%',border:'none',outline:'2px solid #3ECF8E',padding:'2px 4px',fontSize:11,fontFamily:'Calibri,Arial,sans-serif',background:'#fff',boxSizing:'border-box',textAlign:'center'}} />
                        ) : fmt(row.expense_amount)}
                      </td>
                      <td style={{...CS}}></td>
                      <td onClick={() => startEdit(row, 'expense_note')} style={{...CS, color:'#6b7280', fontSize:10, cursor:'text'}}>
                        {isEditingNote ? (
                          <input ref={editInputRef} autoFocus value={editCell.value}
                            onChange={e => setEditCell(ec => ec ? {...ec, value: e.target.value} : ec)}
                            onBlur={commitEdit}
                            onKeyDown={e => { if(e.key==='Enter'){e.preventDefault();commitEdit()} if(e.key==='Escape')setEditCell(null) }}
                            style={{width:'100%',border:'none',outline:'2px solid #3ECF8E',padding:'2px 4px',fontSize:10,fontFamily:'Calibri,Arial,sans-serif',background:'#fff',boxSizing:'border-box'}} />
                        ) : (row.expense_note || <span style={{color:'#d1d5db'}}>note…</span>)}
                      </td>
                      <td style={{...CS}}></td><td style={{...CS}}></td><td style={{...CS}}></td>
                    </tr>
                  )
                })}
                {/* Gap */}
                {[0,1,2,3,4].map(i => <tr key={`g3-${i}`}>{Array.from({length:NCOLS}).map((_,j)=><td key={j} style={{...CS,height:16}}></td>)}</tr>)}
                {/* Total row — always shown */}
                <tr style={{fontWeight:'bold'}}>
                  <td style={{...CS}}></td><td style={{...CS}}></td>
                  <td style={{...CS,background:'#FFFDE7',textAlign:'center'}}>{totalCashIn?totalCashIn.toLocaleString('en-IN'):''}</td>
                  <td style={{...CS}}></td>
                  <td style={{...CS,background:'#FFFDE7',textAlign:'center'}}>{totalPaidInCash?totalPaidInCash.toLocaleString('en-IN'):''}</td>
                  <td style={{...CS,fontSize:12,background:'#FFFF00',color:closingBalance>=0?'#000':'#FF0000',textAlign:'center'}}>
                    {closingBalance.toLocaleString('en-IN')}
                  </td>
                  <td style={{...CS}}></td><td style={{...CS}}></td><td style={{...CS}}></td><td style={{...CS}}></td>
                </tr>
              </tbody>
            </table>
          )
        })}
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

    </div>
  )
}
