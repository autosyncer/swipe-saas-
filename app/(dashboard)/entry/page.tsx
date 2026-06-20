'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Download, Search, X, Check, ChevronDown, Bell, Package, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Transaction, Customer, Card } from '@/types/database'
import { logAction } from '@/lib/audit-log'
import { runRiskDetection } from '@/lib/risk-engine'
import { deductTransactionFromAcSheet, getAccountCurrentBalance, AccountBalanceInfo, updateAcSheetCashType } from '@/lib/ac-sheet'
import { createCCSheetRow, createChamundaSheetRow, createCustomerSheetRow as createCustomerSheetRowHelper, createCommissionSheetRow } from '@/lib/sheet-helpers'
import { saveTransactionToStorage } from '@/lib/transaction-backup'

// Loaded dynamically from bank_account_master
const ACCOUNT_OPTIONS: string[] = []

interface PaymentModeEntry {
  id: string
  mode: 'CASH' | 'NEFT' | 'RTGS' | 'UPI' | 'GPAY' | 'PHONEPAY'
  accountId: string
  accountName: string
  amount: string
}

interface AccountEntry {
  id: string
  accountName: string
  machineName: string
  mdrPct: number
  commPct: string
  commType: string
  commPayMode: string
  commUpiId: string
  commNetBankId: string
  paymentModes: PaymentModeEntry[]
  totalAmount: string
  paidAmount: string
  swapAmount: string
  difference: string
  remarks: string
  acctDropOpen: boolean
}

function makePayment(): PaymentModeEntry {
  return { id: Math.random().toString(36).slice(2), mode: 'CASH', accountId: '', accountName: '', amount: '' }
}

function makeEntry(defaultCommPct = DEFAULT_COMM.toString()): AccountEntry {
  return {
    id: Math.random().toString(36).slice(2),
    accountName: '', machineName: '', mdrPct: 0,
    commPct: defaultCommPct, commType: 'Inclusive', commPayMode: 'Cash',
    commUpiId: '', commNetBankId: '', paymentModes: [],
    totalAmount: '', paidAmount: '', swapAmount: '',
    difference: '', remarks: 'PAID', acctDropOpen: false,
  }
}

const SWAP_SUGGESTIONS = [
  'RT', 'BGM YES', 'NTC YES', 'SKT IND', 'KTC YES', 'MAP IND',
  'BGM IND', 'NTC IND', 'SST', 'MGS BOB', 'KTC BOB', 'KTC B',
  'SKT FINK', 'SST QR', 'TAPI B', 'RT IND', 'SKT FDRL',
  'NTC B', 'MAP FDRL', 'KTC FDRL',
]

const REMARKS_OPTS = ['PAID', 'PEND', 'PURU', 'UNPAID', 'SE', 'CANCEL']
const DEFAULT_COMM = 2.2

function fmt(n: number | null | undefined) {
  if (n == null) return '0'
  return n.toLocaleString('en-IN')
}

function fmtDate(d: string) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function cardLabel(c: Card) {
  const nick = c.card_nickname && c.card_nickname.toLowerCase() !== c.bank_name.toLowerCase()
    ? `${c.card_nickname} — ` : ''
  return `${nick}${c.bank_name} ...${c.last4}`
}

function remarksBadgeStyle(r: string): { background: string; color: string } {
  const map: Record<string, { background: string; color: string }> = {
    PAID:   { background: '#d1fae5', color: '#065f46' },
    PEND:   { background: '#fef3c7', color: '#92400e' },
    PURU:   { background: '#dbeafe', color: '#1e40af' },
    UNPAID: { background: '#fee2e2', color: '#991b1b' },
    SE:     { background: '#ffedd5', color: '#9a3412' },
    CANCEL: { background: '#f3f4f6', color: '#374151' },
  }
  return map[r] || { background: '#f3f4f6', color: '#374151' }
}

function EntryPageInner() {
  const searchParams = useSearchParams()
  const prefillCustomerId = searchParams.get('customer_id')
  const prefillCustomerName = searchParams.get('customer_name')
  const entryType = (searchParams.get('type') || 'swap') as 'swap' | 'refill'
  const entryTypeLabel = entryType === 'refill' ? 'Card Refill' : 'Card Swap'
  const entryTypeBadgeStyle = entryType === 'refill'
    ? { background: '#eff6ff', color: '#1d4ed8' }
    : { background: '#f0fdf4', color: '#16a34a' }

  const getToday = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
  const [today, setToday] = useState(getToday)

  // Update today at midnight
  useEffect(() => {
    const msUntilMidnight = () => { const n=new Date(),m=new Date(n); m.setHours(24,0,0,0); return m.getTime()-n.getTime() }
    let interval: ReturnType<typeof setInterval>
    const timeout = setTimeout(() => {
      setToday(getToday())
      interval = setInterval(() => setToday(getToday()), 24*60*60*1000)
    }, msUntilMidnight())
    return () => { clearTimeout(timeout); clearInterval(interval) }
  }, [])

  const [nextSrNo, setNextSrNo] = useState<number>(6752)
  const [form, setForm] = useState({ customerName: '', bankCard: '' })
  const initialEntry = makeEntry()
  const [accountEntries, setAccountEntries] = useState<AccountEntry[]>([initialEntry])
  const [activeEntryId, setActiveEntryId] = useState<string>(initialEntry.id)

  // Customer autocomplete
  const [custSearch, setCustSearch] = useState('')
  const [custSuggestions, setCustSuggestions] = useState<Customer[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [showCustDrop, setShowCustDrop] = useState(false)
  const custRef = useRef<HTMLDivElement>(null)

  // Customer cards
  const [customerCards, setCustomerCards] = useState<Card[]>([])
  const [selectedCardId, setSelectedCardId] = useState<string>('')
  const [selectedCardLast4, setSelectedCardLast4] = useState<string>('')
  const [customBankCard, setCustomBankCard] = useState(false)

  const [machineNames, setMachineNames] = useState<string[]>(SWAP_SUGGESTIONS)
  const [accountOptions, setAccountOptions] = useState<string[]>([])
  const [accountMachineMap, setAccountMachineMap] = useState<Record<string, string>>({})
  const [upiAccounts, setUpiAccounts] = useState<{ id: string; name: string; upi_id: string }[]>([])
  const [netBankAccounts, setNetBankAccounts] = useState<{ id: string; name: string; bank_name: string; account_number: string }[]>([])
  const [paymentAccounts, setPaymentAccounts] = useState<{ id: string; name: string; type: string; detail: string }[]>([])
  const [showAddPayAcct, setShowAddPayAcct] = useState<string | null>(null) // entry id
  const [newPayAcctForm, setNewPayAcctForm] = useState({ name: '', type: 'GPAY' as PaymentModeEntry['mode'], detail: '' })

  // Right panel
  const [todayEntries, setTodayEntries] = useState<Transaction[]>([])
  const [loadingEntries, setLoadingEntries] = useState(false)

  // Commodity calculator + invoice
  const router = useRouter()
  const [showCommodities, setShowCommodities] = useState(false)
  const [availableCommodities, setAvailableCommodities] = useState<{ id: string; name: string; unit: string; current_price: number }[]>([])
  const [commodityItems, setCommodityItems] = useState<{ commodity_id: string; name: string; unit: string; qty: number; price: number; subtotal: number }[]>([])
  const [generatedInvoice, setGeneratedInvoice] = useState<{ invoice_number: string; customer_name: string; total_amount: number; items: { name: string; unit: string; qty: number; subtotal: number }[] } | null>(null)
  const [generatingInvoice, setGeneratingInvoice] = useState(false)

  // Reminder
  const [showReminder, setShowReminder] = useState(false)
  const [reminderDate, setReminderDate] = useState('')
  const [reminderTime, setReminderTime] = useState('09:00')
  const [reminderType, setReminderType] = useState('payment')
  const [reminderNotes, setReminderNotes] = useState('')

  // Toast
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // Account balances keyed by entry id
  const [accountBalances, setAccountBalances] = useState<Record<string, AccountBalanceInfo | null>>({})

  // L-15 modal
  const [showL15, setShowL15] = useState(false)
  const [l15Entries, setL15Entries] = useState<{ id: string; date: string; customer_name: string; amount: number; notes: string | null }[]>([])
  const [l15Name, setL15Name] = useState('')
  const [l15Amount, setL15Amount] = useState('')
  const [l15Notes, setL15Notes] = useState('')
  const [l15Saving, setL15Saving] = useState(false)

  // Expenses modal
  const [showExpense, setShowExpense] = useState(false)
  const [expenseMaster, setExpenseMaster] = useState<{ id: string; expense_name: string; category: string; sort_order: number }[]>([])
  const [expenseEdits, setExpenseEdits] = useState<Record<string, { amount: string; note: string }>>({})
  const [expenseSaving, setExpenseSaving] = useState(false)
  const [newExpName, setNewExpName] = useState('')
  const [newExpAmt, setNewExpAmt] = useState('')
  const [newExpCat, setNewExpCat] = useState('other')
  const [chamundaExpenseRows, setChamundaExpenseRows] = useState<{ id: string; expense_id: string | null; expense_name: string | null; expense_amount: number | null; expense_note: string | null }[]>([])

  // ── Load active machine names for swap suggestions ──
  useEffect(() => {
    supabase.from('swipe_machines').select('machine_name').eq('status', 'Active').then(({ data }) => {
      if (data && data.length > 0) setMachineNames(data.map((m: { machine_name: string }) => m.machine_name))
    })
  }, [])

  // ── Load bank accounts + linked machines dynamically ──
  useEffect(() => {
    Promise.all([
      supabase.from('bank_account_master').select('account_name').eq('is_active', true).order('account_name'),
      supabase.from('swipe_machines').select('account_name, machine_name').eq('status', 'Active'),
    ]).then(([{ data: accounts }, { data: machines }]) => {
      if (accounts && accounts.length > 0) {
        setAccountOptions(accounts.map((a: { account_name: string }) => a.account_name))
      }
      if (machines && machines.length > 0) {
        const map: Record<string, string> = {}
        machines.forEach((m: { account_name: string; machine_name: string }) => {
          map[m.account_name] = m.machine_name
        })
        setAccountMachineMap(map)
      }
    })
  }, [])

  // ── Load UPI + net banking accounts for commission payment ──
  useEffect(() => {
    supabase.from('upi_accounts').select('id, name, upi_id').eq('is_active', true).order('name').then(({ data }) => {
      setUpiAccounts((data as typeof upiAccounts) || [])
    })
    supabase.from('net_banking_accounts').select('id, name, bank_name, account_number').eq('is_active', true).order('name').then(({ data }) => {
      setNetBankAccounts((data as typeof netBankAccounts) || [])
    })
    supabase.from('payment_accounts').select('id, name, type, detail').eq('status', 'Active').order('name').then(({ data }) => {
      setPaymentAccounts((data as typeof paymentAccounts) || [])
    })
  }, [])

  const refreshPaymentAccounts = async () => {
    const { data } = await supabase.from('payment_accounts').select('id, name, type, detail').eq('status', 'Active').order('name')
    setPaymentAccounts((data as typeof paymentAccounts) || [])
  }

  // ── Load active commodities ──
  useEffect(() => {
    supabase.from('commodities').select('id, name, unit, current_price').eq('is_active', true).order('name').then(({ data }) => {
      setAvailableCommodities(data ?? [])
    })
  }, [])

  // ── Prefill customer from URL params (coming from Reminders) ──
  useEffect(() => {
    if (!prefillCustomerId) return
    supabase
      .from('customers')
      .select('id, name, phone, default_charge_pct, outstanding_balance, cards(*)')
      .eq('id', prefillCustomerId)
      .single()
      .then(({ data }) => {
        if (data) {
          selectCustomer(data as Customer)
        }
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillCustomerId])

  // ── Fetch next SR_NO on mount ──
  useEffect(() => {
    supabase
      .from('transactions')
      .select('sr_no')
      .order('sr_no', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) setNextSrNo((data[0].sr_no as number) + 1)
      })
  }, [])

  // ── Fetch today's entries ──
  const fetchTodayEntries = useCallback(async () => {
    setLoadingEntries(true)
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .eq('date', today)
      .order('sr_no', { ascending: true })
    setTodayEntries((data as Transaction[]) || [])
    setLoadingEntries(false)
  }, [today])

  useEffect(() => { fetchTodayEntries() }, [fetchTodayEntries])

  // ── Realtime ──
  useEffect(() => {
    const ch = supabase
      .channel('entry-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
        fetchTodayEntries()
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchTodayEntries])

  // ── Customer autocomplete search ──
  useEffect(() => {
    if (custSearch.length < 2) { setCustSuggestions([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('customers')
        .select('id, name, phone, default_charge_pct, outstanding_balance')
        .ilike('name', `%${custSearch}%`)
        .limit(10)
      setCustSuggestions((data as Customer[]) || [])
    }, 200)
    return () => clearTimeout(t)
  }, [custSearch])

  // ── Close customer dropdown on outside click ──
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (custRef.current && !custRef.current.contains(e.target as Node)) setShowCustDrop(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Helper: update a single account entry field ──
  function updateEntry(id: string, patch: Partial<AccountEntry>) {
    setAccountEntries(prev => prev.map(e => {
      if (e.id !== id) return e
      const updated = { ...e, ...patch }
      // Auto-recalculate paid/swap when total or commission changes
      const total = parseFloat(updated.totalAmount)
      if (!isNaN(total) && total > 0 && ('totalAmount' in patch || 'commPct' in patch || 'commType' in patch)) {
        const comm = parseFloat(updated.commPct) || DEFAULT_COMM
        const commAmt = Math.round(total * comm / 100)
        const swap = updated.commType === 'Inclusive' ? total + commAmt : total
        updated.paidAmount = total.toString()
        updated.swapAmount = Math.round(swap).toString()
        // Exclusive & Deferred: difference = commission amount (paid separately)
        if (updated.commType === 'Exclusive' || updated.commType === 'Deferred') updated.difference = commAmt.toString()
        else if ('commType' in patch) updated.difference = ''
      }
      return updated
    }))
  }

  function addEntry() {
    const defaultComm = selectedCustomer ? String(selectedCustomer.default_charge_pct || DEFAULT_COMM) : String(DEFAULT_COMM)
    const newEntry = makeEntry(defaultComm)
    setAccountEntries(prev => [...prev, newEntry])
    setActiveEntryId(newEntry.id)
  }

  function removeEntry(id: string) {
    setAccountEntries(prev => {
      if (prev.length <= 1) return prev
      const next = prev.filter(e => e.id !== id)
      if (id === activeEntryId) setActiveEntryId(next[next.length - 1].id)
      return next
    })
  }

  function selectAccountForEntry(id: string, accountName: string) {
    const machineName = accountMachineMap[accountName] || ''
    supabase.from('bank_account_master').select('commission_pct').eq('account_name', accountName).maybeSingle()
      .then(async ({ data }) => {
        const commPct = data?.commission_pct ? String(data.commission_pct) : String(DEFAULT_COMM)
        let mdrPct = 0
        if (machineName) {
          const { data: m } = await supabase.from('swipe_machines').select('bank_commission_pct').eq('machine_name', machineName).maybeSingle()
          mdrPct = Number(m?.bank_commission_pct || 0)
        }
        updateEntry(id, { accountName, machineName, mdrPct, commPct, acctDropOpen: false })
      })
    getAccountCurrentBalance(accountName, today).then(bal => {
      setAccountBalances(prev => ({ ...prev, [id]: bal }))
    }).catch(() => {})
  }

  // ── Select a customer from autocomplete ──
  async function selectCustomer(c: Customer) {
    setSelectedCustomer(c)
    setCustSearch(c.name)
    setShowCustDrop(false)
    const defaultComm = String(c.default_charge_pct || DEFAULT_COMM)
    setForm(f => ({ ...f, customerName: c.name, bankCard: '' }))
    // Apply customer commission to all existing entries
    setAccountEntries(prev => prev.map(e => ({ ...e, commPct: defaultComm })))
    setSelectedCardId('')
    setCustomBankCard(false)

    // Fetch customer's cards
    console.log('[cards] fetching for customer_id:', c.id)
    const { data, error } = await supabase
      .from('cards')
      .select('id, card_nickname, bank_name, last4, card_number, expiry, due_date, card_type')
      .eq('customer_id', c.id)

    if (error) {
      console.error('[cards] fetch error:', error.message, error)
    } else {
      console.log('[cards] fetched:', data)
    }
    const cards = (data as Card[]) || []
    setCustomerCards(cards)

    // Auto-fill reminder
    const cardWithDue = cards.find(card => card.due_date)
    if (cardWithDue && cardWithDue.due_date) {
      setReminderDate(cardWithDue.due_date)
      setReminderType('card_due')
    } else {
      const d = new Date()
      d.setDate(d.getDate() + 7)
      setReminderDate(d.toISOString().split('T')[0])
      setReminderType('payment')
    }
  }

  function selectCard(c: Card) {
    setSelectedCardId(c.id)
    setSelectedCardLast4(c.last4 || '')
    setForm(f => ({ ...f, bankCard: c.bank_name }))
    setCustomBankCard(false)
  }

  function resetForm() {
    setForm({ customerName: '', bankCard: '' })
    setSelectedCardLast4('')
    const fresh = makeEntry()
    setAccountEntries([fresh])
    setActiveEntryId(fresh.id)
    setCustSearch('')
    setSelectedCustomer(null)
    setCustomerCards([])
    setSelectedCardId('')
    setCustomBankCard(false)
    setShowReminder(false)
    setReminderDate('')
    setReminderTime('09:00')
    setReminderType('payment')
    setReminderNotes('')
    setShowCommodities(false)
    setCommodityItems([])
    setGeneratedInvoice(null)
    setGeneratingInvoice(false)
  }

  // ── L-15 helpers ──
  async function fetchL15() {
    const { data } = await supabase.from('l15_entries').select('*').eq('date', today).order('created_at')
    setL15Entries((data as typeof l15Entries) || [])
  }
  async function addL15Entry() {
    if (!l15Name || !l15Amount) { setToast({ msg: 'Name and amount required', type: 'error' }); setTimeout(() => setToast(null), 3000); return }
    setL15Saving(true)
    const amt = parseFloat(l15Amount) || 0
    await supabase.from('l15_entries').insert({ date: today, customer_name: l15Name, amount: amt, notes: l15Notes || null })
    const { data: entries } = await supabase.from('l15_entries').select('amount').eq('date', today)
    const total = (entries || []).reduce((s: number, r: { amount: number }) => s + Number(r.amount), 0)
    await supabase.from('chamunda_sheet').update({ opening_amount: total }).eq('date', today).eq('row_type', 'opening_l15')
    await supabase.rpc('recalculate_chamunda_totals', { p_date: today })
    setL15Name(''); setL15Amount(''); setL15Notes('')
    setL15Saving(false)
    await fetchL15()
    setToast({ msg: 'L-15 entry added', type: 'success' }); setTimeout(() => setToast(null), 3000)
  }
  async function deleteL15Entry(id: string) {
    await supabase.from('l15_entries').delete().eq('id', id)
    const { data: entries } = await supabase.from('l15_entries').select('amount').eq('date', today)
    const total = (entries || []).reduce((s: number, r: { amount: number }) => s + Number(r.amount), 0)
    await supabase.from('chamunda_sheet').update({ opening_amount: total }).eq('date', today).eq('row_type', 'opening_l15')
    await supabase.rpc('recalculate_chamunda_totals', { p_date: today })
    await fetchL15()
  }

  // ── Expense helpers ──
  async function openExpensePopup() {
    const { data: em } = await supabase.from('expense_master').select('*').eq('is_active', true).order('sort_order')
    setExpenseMaster((em as typeof expenseMaster) || [])
    const { data: rows } = await supabase.from('chamunda_sheet').select('id,expense_id,expense_name,expense_amount,expense_note').eq('date', today).eq('row_type', 'expense')
    const expRows = (rows as typeof chamundaExpenseRows) || []
    setChamundaExpenseRows(expRows)
    const edits: Record<string, { amount: string; note: string }> = {}
    expRows.forEach(r => { edits[r.id] = { amount: r.expense_amount ? String(r.expense_amount) : '', note: r.expense_note || '' } })
    setExpenseEdits(edits)
    setShowExpense(true)
  }
  async function saveExpenses() {
    setExpenseSaving(true)
    for (const row of chamundaExpenseRows) {
      const edit = expenseEdits[row.id]
      if (!edit) continue
      const amt = parseFloat(edit.amount) || 0
      await supabase.from('chamunda_sheet').update({ expense_amount: amt, expense_note: edit.note || null }).eq('id', row.id)
    }
    await supabase.rpc('recalculate_chamunda_totals', { p_date: today })
    setExpenseSaving(false)
    setShowExpense(false)
    setToast({ msg: 'Expenses saved!', type: 'success' }); setTimeout(() => setToast(null), 3000)
  }
  async function addCustomExpense() {
    if (!newExpName) { setToast({ msg: 'Expense name required', type: 'error' }); setTimeout(() => setToast(null), 3000); return }
    const { data: em } = await supabase.from('expense_master').insert({ expense_name: newExpName, category: newExpCat, sort_order: 900 }).select().single()
    if (em) {
      const amt = parseFloat(newExpAmt) || 0
      const { data: newRow } = await supabase.from('chamunda_sheet').insert({
        date: today, row_type: 'expense', sort_order: 1400,
        expense_id: (em as { id: string }).id, expense_name: newExpName, expense_amount: amt,
      }).select('id,expense_id,expense_name,expense_amount,expense_note').single()
      if (newRow) {
        setChamundaExpenseRows(prev => [...prev, newRow as typeof chamundaExpenseRows[0]])
        setExpenseEdits(ed => ({ ...ed, [(newRow as { id: string }).id]: { amount: newExpAmt, note: '' } }))
        setExpenseMaster(prev => [...prev, em as typeof expenseMaster[0]])
      }
      await supabase.rpc('recalculate_chamunda_totals', { p_date: today })
    }
    setNewExpName(''); setNewExpAmt(''); setNewExpCat('other')
    setToast({ msg: 'Custom expense added', type: 'success' }); setTimeout(() => setToast(null), 3000)
  }

  async function generateInvoice(
    transaction: Record<string, unknown>,
    items: { commodity_id: string; name: string; unit: string; qty: number; price: number; subtotal: number }[]
  ) {
    const validItems = items.filter(i => i.name && i.qty > 0)

    console.log('[invoice] generateInvoice called', { transaction, items: validItems })
    setGeneratingInvoice(true)

    try {
      // Step 1: Build invoice number from SR no
      const srNo = transaction.sr_no ? String(transaction.sr_no).padStart(4, '0') : '0000'
      const invoiceNum = `INV-SR-${srNo}`

      // Step 2: Check invoices table accessible
      const { data: tableCheck, error: tableErr } = await supabase.from('invoices').select('id').limit(1)
      console.log('[invoice] table check:', tableCheck, tableErr)
      if (tableErr) {
        console.error('[invoice] invoices table error:', tableErr)
        setToast({ msg: `Invoices table error: ${tableErr.message}. Run commodities_invoices.sql first.`, type: 'error' })
        return null
      }

      // Step 3: Fetch customer details for invoice
      let customerAddress = ''
      let consigneeName = ''
      let consigneeAddress = ''
      let buyerName = ''
      let buyerAddress = ''
      const custId = transaction.customer_id as string | null
      // First fetch base fields (always exist)
      const baseQuery = custId
        ? supabase.from('customers').select('id, address, name').eq('id', custId).maybeSingle()
        : supabase.from('customers').select('id, address, name').ilike('name', transaction.customer_name as string).maybeSingle()
      const { data: custBase } = await baseQuery
      if (custBase) {
        customerAddress = custBase.address || ''
        consigneeName   = (transaction.customer_name as string)
        consigneeAddress = custBase.address || ''
        buyerName        = (transaction.customer_name as string)
        buyerAddress     = custBase.address || ''
        // Try to fetch invoice-specific fields (may not exist if migration not run)
        const { data: custExtra } = await supabase
          .from('customers')
          .select('consignee_name, consignee_address, buyer_name, buyer_address')
          .eq('id', custBase.id)
          .maybeSingle()
        if (custExtra) {
          if (custExtra.consignee_name)    consigneeName    = custExtra.consignee_name
          if (custExtra.consignee_address) consigneeAddress = custExtra.consignee_address
          if (custExtra.buyer_name)        buyerName        = custExtra.buyer_name
          if (custExtra.buyer_address)     buyerAddress     = custExtra.buyer_address
        }
      } else {
        consigneeName = buyerName = transaction.customer_name as string
      }

      // Step 3b: Fetch bank account details from transaction's account_name
      let storeBankName = ''
      let storeAccNo = ''
      let storeIfsc = ''
      let storeBranch = ''
      const acctName = (transaction.account_name as string || '').split(/[+,]/)[0].trim()
      if (acctName) {
        const { data: bankAcc } = await supabase
          .from('bank_account_master')
          .select('bank_name, account_number, ifsc_code, branch')
          .eq('account_name', acctName)
          .maybeSingle()
        if (bankAcc) {
          storeBankName = (bankAcc as Record<string, string>).bank_name || ''
          storeAccNo    = (bankAcc as Record<string, string>).account_number || ''
          storeIfsc     = (bankAcc as Record<string, string>).ifsc_code || ''
          storeBranch   = (bankAcc as Record<string, string>).branch || ''
        }
      }

      // Step 4: Build insert payload
      const subtotal = validItems.reduce((s, i) => s + i.subtotal, 0)
      const swapTotal = Number(transaction.swap_amount) || 0
      const invoiceTotal = swapTotal > 0 ? swapTotal : subtotal
      const discount = subtotal - invoiceTotal
      const insertPayload = {
        invoice_number: invoiceNum as string,
        transaction_id: (transaction.id as string) || null,
        customer_id: custId || null,
        customer_name: (transaction.customer_name as string) || '',
        customer_address: customerAddress,
        consignee_name: consigneeName,
        consignee_address: consigneeAddress,
        buyer_name: buyerName,
        buyer_address: buyerAddress,
        items: validItems.map(i => ({
          commodity_id: i.commodity_id,
          name: i.name,
          unit: i.unit,
          qty: i.qty,
          price: i.price,
          subtotal: i.subtotal,
        })),
        subtotal,
        tax_percent: 0,
        tax_amount: 0,
        total_amount: invoiceTotal,
        transaction_date: (transaction.date as string) || null,
        paid_by: (() => {
          const name = (transaction.bank_card as string) || ''
          const last4 = (transaction.card_last4 as string) || ''
          if (name && last4) return `${name} -XXXX-${last4}`
          return name
        })(),
        notes: discount > 0
          ? `SR #${transaction.sr_no} | Discount: ₹${discount.toLocaleString('en-IN')}`
          : `SR #${transaction.sr_no}`,
        status: 'draft',
        store_bank_name: storeBankName,
        store_acc_no:    storeAccNo,
        store_ifsc:      storeIfsc ? `${storeBranch} & ${storeIfsc}` : storeBranch,
      }
      console.log('[invoice] inserting:', insertPayload)

      const { data: invoice, error: insertError } = await supabase
        .from('invoices')
        .insert(insertPayload)
        .select()
        .single()

      console.log('[invoice] insert result:', invoice, 'error:', insertError)

      if (insertError) {
        console.error('[invoice] insert error:', insertError)
        setToast({ msg: `Invoice failed: ${insertError.message}`, type: 'error' })
        return null
      }

      // Step 4: Link invoice back to transaction
      if (invoice && transaction.id) {
        await supabase
          .from('transactions')
          .update({ invoice_id: invoice.id })
          .eq('id', transaction.id as string)
        console.log('[invoice] linked to transaction', transaction.id)
      }

      logAction({ action: 'generate_invoice', module: 'Invoices', details: { invoice_number: invoice.invoice_number, sr_no: transaction.sr_no } })
      console.log('[invoice] success:', invoice.invoice_number)
      return invoice
    } finally {
      setGeneratingInvoice(false)
    }
  }

  async function handleSubmit() {
    if (!form.customerName) {
      setToast({ msg: 'Customer name is required', type: 'error' })
      setTimeout(() => setToast(null), 3000)
      return
    }
    const validEntries = accountEntries.filter(e => e.totalAmount && parseFloat(e.totalAmount) > 0)
    if (validEntries.length === 0) {
      setToast({ msg: 'At least one account entry with a total amount is required', type: 'error' })
      setTimeout(() => setToast(null), 3000)
      return
    }

    // Block only if any account has zero or negative balance
    const noBalEntries = validEntries.filter(e => {
      const bal = accountBalances[e.id]
      return bal != null && bal.remaining <= 0
    })
    if (noBalEntries.length > 0) {
      const names = noBalEntries.map(e => `${e.accountName} (₹${accountBalances[e.id]!.remaining.toLocaleString('en-IN')})`).join(', ')
      setToast({ msg: `⚠️ No balance — cannot proceed: ${names}`, type: 'error' })
      setTimeout(() => setToast(null), 4000)
      return
    }

    setSubmitting(true)
    const snapCustomer = selectedCustomer
    const snapShowReminder = showReminder
    const snapReminderDate = reminderDate
    const snapReminderTime = reminderTime
    const snapReminderType = reminderType
    const snapReminderNotes = reminderNotes
    const snapShowCommodities = showCommodities
    const snapCommodityItems = [...commodityItems]
    const snapCardLast4 = selectedCardLast4

    const savedSrNos: number[] = []
    let lastTransaction: Record<string, unknown> | null = null
    let hasError = false

    for (const entry of validEntries) {
      const total = parseFloat(entry.totalAmount) || 0
      const comm = parseFloat(entry.commPct) || DEFAULT_COMM
      const commAmt = Math.round(total * comm / 100)
      const cashAmt = entry.paymentModes.filter(p => p.mode === 'CASH').reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
      const payload = {
        date: today,
        customer_name: form.customerName.trim(),
        bank_card: form.bankCard.trim() || '',
        total_amount: total,
        paid_amount: parseFloat(entry.paidAmount) || 0,
        ...(cashAmt > 0 ? { paid_in_cash: cashAmt } : {}),
        cash_type: entry.paymentModes.length === 1 ? entry.paymentModes[0].mode : entry.paymentModes.length > 1 ? 'MULTI' : null,
        payment_modes: entry.paymentModes.length > 0 ? entry.paymentModes.map(p => ({ mode: p.mode, accountId: p.accountId || null, accountName: p.accountName || null, amount: parseFloat(p.amount) || 0 })) : null,
        account_name: entry.accountName,
        swap_amount: parseFloat(entry.swapAmount) || 0,
        swap_name: entry.machineName,
        difference: entry.difference ? parseFloat(entry.difference) : null,
        remarks: entryType === 'refill' ? 'PAID' : entry.remarks,
        status: entryType === 'refill' ? 'Paid' : (({PAID:'Paid',PEND:'Pending',PURU:'Puru',UNPAID:'Unpaid',SE:'Paid',CANCEL:'Cancelled'} as Record<string,string>)[entry.remarks] || 'Pending'),
        commission_pct: comm,
        commission_amount: commAmt,
        commission_type: entry.commType,
        ...(entry.mdrPct > 0 ? { bank_commission_pct: entry.mdrPct } : {}),
        entry_type: entryType,
        commodity_items: [],
      }
      const { data, error } = await supabase.from('transactions').insert(payload).select().single()
      if (error) {
        setToast({ msg: `Error saving ${entry.accountName || 'entry'}: ${error.message}`, type: 'error' })
        hasError = true
        break
      }
      // Set release_status separately so INSERT doesn't fail if column not yet in schema cache
      await supabase.from('transactions').update({
        release_status: entryType === 'swap' ? 'pending' : 'released',
      }).eq('id', data.id)
      savedSrNos.push(data.sr_no)
      lastTransaction = data as Record<string, unknown>
      createCCSheetRow(data as Record<string, unknown>)
      createChamundaSheetRow(data as Record<string, unknown>)
      createCustomerSheetRowHelper(data as Record<string, unknown>, snapCustomer?.id || null, snapReminderDate || null)
      createCommissionSheetRow(data as Record<string, unknown>, entry.commPayMode || null)
      // Card Swap: AC deduction happens only after confirm & release in Notifications
      // Card Refill: deduct immediately as before
      if (entryType !== 'swap') {
        ;(async () => {
          try {
            const swapAmt = Number(data.swap_amount)
            const acctName = data.account_name as string
            if (!swapAmt || !acctName) return
            const results = await deductTransactionFromAcSheet({ date: data.date as string, account_name: acctName, swap_amount: swapAmt })
            const lowAccounts = results.filter(r => r.low_balance)
            if (lowAccounts.length > 0) {
              const names = lowAccounts.map(r => `${r.account_name} (₹${r.closing_bal.toLocaleString('en-IN')})`).join(', ')
              setTimeout(() => setToast({ msg: `⚠️ Low Balance: ${names}`, type: 'error' }), 3500)
            }
            // No AC sheet column updates for new payment modes (NEFT/RTGS/UPI/GPAY/PHONEPAY tracked separately)
          } catch (e) { console.error('[AC Sheet update failed]', e) }
        })()
      }
      logAction({ action: 'Transaction Created', module: 'Daily Register', details: { sr_no: data.sr_no, customer_name: data.customer_name, account_name: data.account_name, total_amount: data.total_amount } })
    }

    if (!hasError) {
      setNextSrNo(n => n + validEntries.length)
      runRiskDetection().catch(() => {})
      if (lastTransaction) saveTransactionToStorage(lastTransaction).catch(() => {})
      fetchTodayEntries()

      // Reminder (once, from first entry)
      let reminderSaved = false
      if (snapShowReminder && snapReminderDate) {
        const titleMap: Record<string, string> = { payment: `Collect payment — ${form.customerName}`, card_due: `Card due — ${form.customerName}`, follow_up: `Follow up — ${form.customerName}`, custom: `Reminder — ${form.customerName}` }
        const { error: remErr } = await supabase.from('reminders').insert({
          title: titleMap[snapReminderType] || `Reminder — ${form.customerName}`,
          description: snapReminderNotes || `${validEntries.length} entries — SR #${savedSrNos.join(', #')}`,
          reminder_date: snapReminderDate,
          reminder_time: snapReminderTime || '09:00:00',
          type: snapReminderType,
          customer_id: snapCustomer?.id || null,
          customer_name: form.customerName || '',
          bank_name: form.bankCard || '',
          amount: validEntries.reduce((s, e) => s + (parseFloat(e.totalAmount) || 0), 0),
          status: 'pending',
          phone: snapCustomer?.phone || '',
        })
        if (!remErr) reminderSaved = true
      }

      // Invoice — always generate for every transaction submission
      let invoiceResult = null
      if (lastTransaction) {
        const totalSwapAcrossEntries = validEntries.reduce((s, e) => s + (parseFloat(e.swapAmount) || 0), 0)
        const txWithCustomer = {
          ...lastTransaction,
          customer_id: snapCustomer?.id || null,
          swap_amount: totalSwapAcrossEntries,
          card_last4: snapCardLast4,
        }
        const commodityItemsToUse = snapShowCommodities ? snapCommodityItems : []
        invoiceResult = await generateInvoice(txWithCustomer, commodityItemsToUse)
        if (invoiceResult) setGeneratedInvoice(invoiceResult)
      }

      resetForm()
      const parts = [`${savedSrNos.length} entr${savedSrNos.length > 1 ? 'ies' : 'y'} saved — SR #${savedSrNos.join(', #')}`]
      if (reminderSaved) parts.push('Reminder set!')
      if (invoiceResult) parts.push(`Invoice ${invoiceResult.invoice_number} generated!`)
      setToast({ msg: parts.join(' + '), type: 'success' })
    }
    setSubmitting(false)
    setTimeout(() => setToast(null), 5000)
  }

  async function exportXlsx() {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet("Today's Entries")
    ws.columns = [
      { header: 'SR_NO', key: 'sr_no', width: 8 },
      { header: 'DATE', key: 'date', width: 12 },
      { header: 'CUSTOMER_NAME', key: 'customer_name', width: 20 },
      { header: 'BANK_CARD', key: 'bank_card', width: 14 },
      { header: 'TOTAL_AMOUNT', key: 'total_amount', width: 14 },
      { header: 'PAID_AMOUNT', key: 'paid_amount', width: 14 },
      { header: 'ACCOUNT_NAME', key: 'account_name', width: 16 },
      { header: 'SWAP_AMOUNT', key: 'swap_amount', width: 14 },
      { header: 'SWAP_NAME', key: 'swap_name', width: 20 },
      { header: 'DIFFERENCE', key: 'difference', width: 12 },
      { header: 'REMARKS', key: 'remarks', width: 12 },
    ]
    todayEntries.forEach(row => ws.addRow(row as unknown as Record<string, unknown>))
    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `entries_${today}.xlsx`
    a.click()
  }

  // filteredSwapSugg unused — machine is auto-filled per entry from accountMachineMap

  const inputCls = 'w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-[#3ECF8E] transition-colors'
  const labelCls = 'block text-xs font-medium text-[#374151] mb-1'

  return (
    <div className="flex gap-6 h-full relative">
      {/* Toast */}
      {toast && (
        <div
          className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white"
          style={{ background: toast.type === 'success' ? '#3ECF8E' : '#ef4444' }}
        >
          {toast.type === 'success' ? <Check size={16} /> : <X size={16} />}
          {toast.msg}
        </div>
      )}

      {/* ── LEFT FORM 40% ── */}
      <div className="w-[40%] flex flex-col gap-3 overflow-y-auto pb-6">
        {/* L-15 + Expenses quick buttons */}
        <div className="flex items-center gap-2">
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
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-[#1a1a1a]">New Entry</h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={entryTypeBadgeStyle}>
              {entryTypeLabel}
            </span>
          </div>
          <span className="text-xs text-[#6b7280] bg-[#f0fdf4] px-2 py-1 rounded font-medium">
            SR #{nextSrNo}
          </span>
        </div>

        {/* 1. Customer Name */}
        <div className="relative" ref={custRef}>
          <label className={labelCls}>Customer Name</label>
          <div className="flex items-center gap-2 rounded-md border px-3 py-2" style={{ borderColor: '#e5e7eb' }}>
            <Search size={14} color="#9ca3af" />
            <input
              className="flex-1 text-sm outline-none bg-transparent"
              placeholder="Search customer..."
              value={custSearch}
              onChange={e => {
                setCustSearch(e.target.value)
                setForm(f => ({ ...f, customerName: e.target.value }))
                setShowCustDrop(true)
                if (!e.target.value) {
                  setSelectedCustomer(null)
                  setCustomerCards([])
                  setAccountEntries(prev => prev.map(e => ({ ...e, commPct: String(DEFAULT_COMM) })))
                }
              }}
              onFocus={() => custSearch.length >= 2 && setShowCustDrop(true)}
            />
          </div>
          {showCustDrop && custSuggestions.length > 0 && (
            <div className="absolute z-30 w-full bg-white border rounded-md shadow-lg mt-1" style={{ borderColor: '#e5e7eb' }}>
              {custSuggestions.map(c => (
                <button
                  key={c.id}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-[#f3f4f6] last:border-0"
                  onMouseDown={() => selectCustomer(c)}
                >
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-[#6b7280]">{c.phone} — {c.default_charge_pct}% commission</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 2. Customer info card */}
        {selectedCustomer && (
          <div className="rounded-lg p-3 text-sm" style={{ border: '1px solid #3ECF8E', background: '#f0fdf4' }}>
            <div className="flex items-center justify-between">
              <div className="font-semibold text-[#1a1a1a]">{selectedCustomer.name}</div>
              <span className="text-[10px] text-[#6b7280]">{selectedCustomer.phone}</span>
            </div>
            <div className="flex gap-4 mt-1.5 text-xs">
              <div>
                <span className="text-[#6b7280]">Outstanding</span>
                <div className="font-semibold text-[#1a1a1a]">₹{fmt(selectedCustomer.outstanding_balance)}</div>
              </div>
              <div>
                <span className="text-[#6b7280]">Commission</span>
                <div className="font-semibold text-[#1a1a1a]">{selectedCustomer.default_charge_pct}%</div>
              </div>
            </div>
            {/* Card pills */}
            {customerCards.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {customerCards.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => selectCard(c)}
                    className="px-2 py-0.5 rounded-full text-xs font-medium border transition-colors"
                    style={{
                      background: selectedCardId === c.id ? '#3ECF8E' : '#ffffff',
                      color: selectedCardId === c.id ? '#fff' : '#374151',
                      borderColor: selectedCardId === c.id ? '#3ECF8E' : '#d1d5db',
                    }}
                  >
                    {cardLabel(c)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 2. Bank Card */}
        <div>
          <label className={labelCls}>Bank Card</label>
          {customerCards.length > 0 && !customBankCard ? (
            <div className="flex gap-2">
              <select
                className={`${inputCls} flex-1 bg-white`}
                style={{ borderColor: '#e5e7eb' }}
                value={selectedCardId}
                onChange={e => {
                  if (e.target.value === '__other__') {
                    setCustomBankCard(true)
                    setSelectedCardId('')
                    setForm(f => ({ ...f, bankCard: '' }))
                  } else {
                    const card = customerCards.find(c => c.id === e.target.value)
                    if (card) {
                      setSelectedCardId(card.id)
                      setForm(f => ({ ...f, bankCard: card.bank_name }))
                    }
                  }
                }}
              >
                <option value="">Select card...</option>
                {customerCards.map(c => (
                  <option key={c.id} value={c.id}>
                    {cardLabel(c)}
                  </option>
                ))}
                <option value="__other__">Other (type manually)</option>
              </select>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                className={`${inputCls} flex-1`}
                style={{ borderColor: '#e5e7eb' }}
                value={form.bankCard}
                onChange={e => setForm(f => ({ ...f, bankCard: e.target.value }))}
                placeholder="RBL, SBI, HDFC, AXIS..."
                autoFocus={customBankCard}
              />
              {customBankCard && (
                <button
                  type="button"
                  className="text-xs text-[#6b7280] underline whitespace-nowrap"
                  onClick={() => { setCustomBankCard(false); setForm(f => ({ ...f, bankCard: '' })) }}
                >
                  ← back
                </button>
              )}
            </div>
          )}
        </div>

        {/* 3–N. Account Entries — Chrome-style tabs */}
        <div className="rounded-lg border overflow-visible" style={{ borderColor: '#e5e7eb' }}>
          {/* Tab bar */}
          <div className="flex items-end overflow-x-auto" style={{ background: '#f3f4f6', borderBottom: '1px solid #e5e7eb', minHeight: 38 }}>
            {accountEntries.map((entry, idx) => {
              const isActive = entry.id === activeEntryId
              return (
                <div
                  key={entry.id}
                  onClick={() => setActiveEntryId(entry.id)}
                  className="flex items-center gap-1 cursor-pointer select-none flex-shrink-0"
                  style={{
                    padding: '6px 12px 6px 12px',
                    background: isActive ? '#ffffff' : 'transparent',
                    borderRight: '1px solid #e5e7eb',
                    borderTop: isActive ? '2px solid #3ECF8E' : '2px solid transparent',
                    borderBottom: isActive ? '1px solid #ffffff' : 'none',
                    marginBottom: isActive ? -1 : 0,
                    fontSize: 12,
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? '#1a1a1a' : '#6b7280',
                    whiteSpace: 'nowrap',
                    transition: 'background 0.1s',
                  }}
                >
                  <span>{entry.accountName || `Account ${idx + 1}`}</span>
                  {accountEntries.length > 1 && (
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); removeEntry(entry.id) }}
                      style={{ marginLeft: 4, color: '#9ca3af', background: 'none', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 1 }}
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
              )
            })}
            {/* + New tab button */}
            <button
              type="button"
              onClick={addEntry}
              style={{
                padding: '6px 10px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#6b7280',
                fontSize: 16,
                lineHeight: 1,
                flexShrink: 0,
              }}
              title="Add account"
            >+</button>
          </div>

          {/* Active tab content */}
          {accountEntries.filter(e => e.id === activeEntryId).map(entry => (
            <div key={entry.id} className="p-3 flex flex-col gap-2.5" style={{ background: '#ffffff' }}>
              {/* Account Name dropdown */}
              <div className="relative">
                <label className={labelCls}>Account Name</label>
                <div
                  className="min-h-[36px] rounded-md border px-2 py-1.5 cursor-pointer flex items-center justify-between text-sm"
                  style={{ borderColor: entry.acctDropOpen ? '#3ECF8E' : '#e5e7eb' }}
                  onClick={() => updateEntry(entry.id, { acctDropOpen: !entry.acctDropOpen })}
                >
                  {entry.accountName
                    ? <span className="font-medium text-[#1a1a1a]">{entry.accountName}</span>
                    : <span className="text-[#9ca3af] text-xs">Select account...</span>}
                  <ChevronDown size={12} color="#9ca3af" />
                </div>
                {entry.accountName && accountBalances[entry.id] != null && (
                  <div className="mt-1 px-1 text-xs" style={{ color: (accountBalances[entry.id]!.remaining < 50000) ? '#ef4444' : '#6b7280' }}>
                    Remaining: ₹{accountBalances[entry.id]!.remaining.toLocaleString('en-IN')}
                    {accountBalances[entry.id]!.remaining < 50000 && <span className="ml-1 font-semibold">⚠️ Low</span>}
                  </div>
                )}
                {entry.acctDropOpen && (
                  <div className="absolute z-30 left-0 right-0 bg-white border rounded-md shadow-lg mt-1 p-2" style={{ borderColor: '#e5e7eb' }}>
                    <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                      {accountOptions.length === 0
                        ? <span className="text-xs text-[#9ca3af] px-1">No accounts found. Add in Bank Accounts page.</span>
                        : accountOptions.map(opt => (
                          <button key={opt} type="button"
                            onClick={() => selectAccountForEntry(entry.id, opt)}
                            className="px-2 py-0.5 rounded-full text-xs font-medium border transition-colors"
                            style={{ background: entry.accountName === opt ? '#3ECF8E' : '#f3f4f6', color: entry.accountName === opt ? '#fff' : '#374151', borderColor: entry.accountName === opt ? '#3ECF8E' : '#e5e7eb' }}
                          >{opt}</button>
                        ))
                      }
                    </div>
                  </div>
                )}
              </div>

              {/* Machine Name — swap only */}
              {entryType === 'swap' && (
                <div>
                  <label className={labelCls}>Swipe Machine</label>
                  <input className={inputCls} style={{ borderColor: '#e5e7eb' }}
                    value={entry.machineName}
                    onChange={async e => {
                      const machineName = e.target.value
                      updateEntry(entry.id, { machineName })
                      if (machineName) {
                        const { data: m } = await supabase.from('swipe_machines').select('bank_commission_pct').eq('machine_name', machineName).maybeSingle()
                        if (m) updateEntry(entry.id, { mdrPct: Number(m.bank_commission_pct || 0) })
                      }
                    }}
                    placeholder="Auto-filled from account..."
                  />
                </div>
              )}

              {/* Commission */}
              {(() => {
                const total = parseFloat(entry.totalAmount) || 0
                const comm = parseFloat(entry.commPct) || 0
                const commAmt = total > 0 ? Math.round(total * comm / 100) : 0
                const swapAmt = entry.commType === 'Inclusive' ? total + commAmt : total
                const needsPayMode = entry.commType === 'Exclusive' || entry.commType === 'Deferred'
                return (
                  <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={labelCls}>Commission %</label>
                        <input type="number" step="0.01" className={inputCls} style={{ borderColor: '#e5e7eb' }}
                          value={entry.commPct}
                          onChange={e => updateEntry(entry.id, { commPct: e.target.value })}
                          placeholder="2.20"
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Commission Type</label>
                        <select className={`${inputCls} bg-white`} style={{ borderColor: '#e5e7eb' }}
                          value={entry.commType}
                          onChange={e => updateEntry(entry.id, { commType: e.target.value, commPayMode: 'Cash', commUpiId: '', commNetBankId: '' })}
                        >
                          <option value="Inclusive">Inclusive</option>
                          <option value="Exclusive">Exclusive</option>
                          <option value="Deferred">Deferred</option>
                        </select>
                      </div>
                    </div>

                    {/* Commission Type Logic Summary */}
                    <div className="rounded-md px-3 py-2 text-xs" style={{
                      background: entry.commType === 'Inclusive' ? '#f0fdf4' : entry.commType === 'Deferred' ? '#fff7ed' : '#eff6ff',
                      border: `1px solid ${entry.commType === 'Inclusive' ? '#bbf7d0' : entry.commType === 'Deferred' ? '#fed7aa' : '#bfdbfe'}`,
                    }}>
                      {entry.commType === 'Inclusive' && (
                        <div className="flex flex-col gap-0.5 text-[#166534]">
                          <span className="font-semibold">Inclusive — commission included in swap amount</span>
                          <span>Swap = Total + Commission &nbsp;|&nbsp; Difference = 0 &nbsp;|&nbsp; No separate payment needed</span>
                          {total > 0 && <span className="font-medium mt-0.5">₹{total.toLocaleString('en-IN')} + ₹{commAmt.toLocaleString('en-IN')} = Swap ₹{swapAmt.toLocaleString('en-IN')}</span>}
                        </div>
                      )}
                      {entry.commType === 'Exclusive' && (
                        <div className="flex flex-col gap-0.5 text-[#1e40af]">
                          <span className="font-semibold">Exclusive — commission paid separately by customer</span>
                          <span>Swap = Total &nbsp;|&nbsp; Difference = Commission amount &nbsp;|&nbsp; Paid via UPI / Cash / Net Banking</span>
                          {total > 0 && <span className="font-medium mt-0.5">Swap ₹{swapAmt.toLocaleString('en-IN')} &nbsp;|&nbsp; Collect ₹{commAmt.toLocaleString('en-IN')} separately</span>}
                        </div>
                      )}
                      {entry.commType === 'Deferred' && (
                        <div className="flex flex-col gap-0.5 text-[#9a3412]">
                          <span className="font-semibold">Deferred — commission to be collected later</span>
                          <span>Swap = Total &nbsp;|&nbsp; Difference = Commission amount &nbsp;|&nbsp; Added to deferred list for follow-up</span>
                          {total > 0 && <span className="font-medium mt-0.5">Amount to collect later: ₹{commAmt.toLocaleString('en-IN')}</span>}
                        </div>
                      )}
                    </div>

                    {/* Pay Mode (Exclusive + Deferred) */}
                    {needsPayMode && (
                      <div className="flex flex-col gap-2">
                        <div>
                          <label className={labelCls}>{entry.commType === 'Deferred' ? 'Will Pay Via' : 'Commission Pay Mode'}</label>
                          <div className="flex gap-2">
                            {(['Cash', 'UPI', 'Net Banking'] as const).map(mode => (
                              <button
                                key={mode}
                                type="button"
                                onClick={() => updateEntry(entry.id, { commPayMode: mode, commUpiId: '', commNetBankId: '' })}
                                className="flex-1 py-1.5 rounded-md text-xs font-medium border transition-colors"
                                style={{
                                  background: entry.commPayMode === mode ? '#1a1a1a' : '#f9fafb',
                                  color: entry.commPayMode === mode ? '#ffffff' : '#374151',
                                  borderColor: entry.commPayMode === mode ? '#1a1a1a' : '#e5e7eb',
                                }}
                              >{mode}</button>
                            ))}
                          </div>
                        </div>

                        {entry.commPayMode === 'UPI' && (
                          <div>
                            <label className={labelCls}>UPI Account</label>
                            <select className={`${inputCls} bg-white`} style={{ borderColor: '#e5e7eb' }}
                              value={entry.commUpiId}
                              onChange={e => updateEntry(entry.id, { commUpiId: e.target.value })}
                            >
                              <option value="">Select UPI...</option>
                              {upiAccounts.map(u => (
                                <option key={u.id} value={u.id}>{u.name} — {u.upi_id}</option>
                              ))}
                            </select>
                            {upiAccounts.length === 0 && (
                              <p className="text-[10px] text-[#9ca3af] mt-1">No UPI accounts. Add them in the Sheets page.</p>
                            )}
                          </div>
                        )}

                        {entry.commPayMode === 'Net Banking' && (
                          <div>
                            <label className={labelCls}>Net Banking Account</label>
                            <select className={`${inputCls} bg-white`} style={{ borderColor: '#e5e7eb' }}
                              value={entry.commNetBankId}
                              onChange={e => updateEntry(entry.id, { commNetBankId: e.target.value })}
                            >
                              <option value="">Select account...</option>
                              {netBankAccounts.map(nb => (
                                <option key={nb.id} value={nb.id}>{nb.name} — {nb.bank_name} {nb.account_number}</option>
                              ))}
                            </select>
                            {netBankAccounts.length === 0 && (
                              <p className="text-[10px] text-[#9ca3af] mt-1">No net banking accounts. Add them in the Sheets page.</p>
                            )}
                          </div>
                        )}

                        {entry.commPayMode === 'Cash' && (
                          <p className="text-[10px] text-[#6b7280] -mt-1">Cash commission will be recorded in Chamunda Sheet.</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Total + Paid + Pending */}
              {(() => {
                const totalVal = parseFloat(entry.totalAmount) || 0
                const totalPaid = entry.paymentModes.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
                const pending = totalVal - totalPaid
                // Auto-sync paidAmount and remarks when payment modes change
                if (totalPaid > 0 && entry.paidAmount !== String(totalPaid)) {
                  setTimeout(() => updateEntry(entry.id, {
                    paidAmount: String(totalPaid),
                    remarks: pending > 0 ? 'PEND' : entry.remarks === 'PEND' ? 'PAID' : entry.remarks,
                  }), 0)
                }
                return (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelCls}>Total Amount (₹)</label>
                      <input type="number" className={inputCls} style={{ borderColor: '#e5e7eb' }}
                        value={entry.totalAmount}
                        onChange={e => updateEntry(entry.id, { totalAmount: e.target.value })}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Paid Amount (₹) <span className="text-[10px] text-[#9ca3af] font-normal">auto</span></label>
                      <input type="number" readOnly className={inputCls}
                        style={{ borderColor: '#e5e7eb', background: '#f9fafb', cursor: 'default' }}
                        value={totalPaid || entry.paidAmount}
                        placeholder="0"
                      />
                    </div>
                  </div>
                )
              })()}

              {/* Payment Mode — swap only */}
              {entryType === 'swap' && (() => {
                const MODES: PaymentModeEntry['mode'][] = ['CASH', 'NEFT', 'RTGS', 'UPI', 'GPAY', 'PHONEPAY']
                const totalVal = parseFloat(entry.totalAmount) || 0
                const totalPaid = entry.paymentModes.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
                const remaining = totalVal - totalPaid
                const pending = remaining
                const selectedModes = entry.paymentModes.map(p => p.mode)

                const toggleMode = (mode: PaymentModeEntry['mode']) => {
                  const existing = entry.paymentModes.find(p => p.mode === mode)
                  if (existing) {
                    // deselect — remove it
                    updateEntry(entry.id, { paymentModes: entry.paymentModes.filter(p => p.mode !== mode) })
                  } else {
                    // select — add new row for this mode
                    updateEntry(entry.id, { paymentModes: [...entry.paymentModes, { id: Math.random().toString(36).slice(2), mode, accountId: '', accountName: '', amount: '' }] })
                  }
                }

                const updatePayment = (mode: PaymentModeEntry['mode'], patch: Partial<PaymentModeEntry>) => {
                  updateEntry(entry.id, { paymentModes: entry.paymentModes.map(p => p.mode === mode ? { ...p, ...patch } : p) })
                }

                const saveNewPayAcct = async () => {
                  if (!newPayAcctForm.name.trim()) return
                  const { data } = await supabase.from('payment_accounts').insert({
                    name: newPayAcctForm.name.trim(), type: newPayAcctForm.type, detail: newPayAcctForm.detail.trim(),
                  }).select().single()
                  if (data) { await refreshPaymentAccounts(); setShowAddPayAcct(null); setNewPayAcctForm({ name: '', type: 'GPAY', detail: '' }) }
                }

                return (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className={labelCls} style={{ marginBottom: 0 }}>Payment Mode</label>
                      {totalVal > 0 && totalPaid > 0 && (
                        <span className="text-[10px] font-semibold" style={{ color: remaining < 0 ? '#dc2626' : remaining === 0 ? '#16a34a' : '#6b7280' }}>
                          {remaining === 0 ? '✓ Fully paid' : remaining < 0 ? `Over ₹${fmt(Math.abs(remaining))}` : `Rem: ₹${fmt(remaining)}`}
                        </span>
                      )}
                    </div>

                    {/* Mode toggle chips */}
                    <div className="flex gap-1 mb-2">
                      {MODES.map(m => {
                        const active = selectedModes.includes(m)
                        return (
                          <button key={m} type="button" onClick={() => toggleMode(m)}
                            className="flex-1 rounded font-bold text-center transition-all"
                            style={{
                              padding: '5px 2px', fontSize: 9,
                              background: active ? '#3ECF8E' : '#f3f4f6',
                              color: active ? '#fff' : '#374151',
                              border: active ? '1.5px solid #16a34a' : '1px solid #e5e7eb',
                              boxShadow: active ? '0 1px 4px rgba(62,207,142,0.3)' : 'none',
                            }}>
                            {m}
                          </button>
                        )
                      })}
                    </div>

                    {/* Amount + account inputs for each selected mode */}
                    <div className="flex flex-col gap-1.5">
                      {entry.paymentModes.map(pm => {
                        const acctOptions = paymentAccounts.filter(a => a.type === pm.mode)
                        return (
                          <div key={pm.mode} className="rounded-lg px-2.5 py-2 flex flex-col gap-1.5"
                            style={{ background: '#f0fdf4', border: '1.5px solid #86efac' }}>
                            <div className="text-[10px] font-bold" style={{ color: '#166534' }}>{pm.mode}</div>

                            {/* Account selector for non-CASH */}
                            {pm.mode !== 'CASH' && (
                              <div>
                                <select className={inputCls} style={{ borderColor: '#86efac', fontSize: 11 }}
                                  value={pm.accountId}
                                  onChange={e => {
                                    const acct = acctOptions.find(a => a.id === e.target.value)
                                    updatePayment(pm.mode, { accountId: e.target.value, accountName: acct?.name || '' })
                                  }}>
                                  <option value="">Select {pm.mode} account...</option>
                                  {acctOptions.map(a => <option key={a.id} value={a.id}>{a.name}{a.detail ? ` · ${a.detail}` : ''}</option>)}
                                </select>
                                <button type="button" onClick={() => { setShowAddPayAcct(entry.id); setNewPayAcctForm(f => ({ ...f, type: pm.mode })) }}
                                  className="text-[10px] font-semibold mt-0.5" style={{ color: '#16a34a' }}>
                                  + Add {pm.mode} account
                                </button>
                              </div>
                            )}

                            {/* Amount */}
                            <input type="number" className={inputCls}
                              style={{ borderColor: '#86efac', background: '#fff' }}
                              value={pm.amount} placeholder={`${pm.mode} amount (₹)`}
                              onChange={e => updatePayment(pm.mode, { amount: e.target.value })} />
                          </div>
                        )
                      })}
                    </div>

                    {/* Multi-mode total summary */}
                    {entry.paymentModes.length > 1 && totalPaid > 0 && (
                      <div className="mt-1.5 flex gap-1.5 flex-wrap items-center">
                        {entry.paymentModes.filter(p => p.amount).map(p => (
                          <span key={p.mode} className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: '#d1fae5', color: '#065f46' }}>
                            {p.mode} ₹{fmt(parseFloat(p.amount) || 0)}
                          </span>
                        ))}
                        <span className="text-[10px] font-bold" style={{ color: '#1a1a1a' }}>= ₹{fmt(totalPaid)}</span>
                      </div>
                    )}

                    {/* Pending / Fully Paid banner */}
                    {totalVal > 0 && totalPaid > 0 && pending > 0 && (
                      <div className="mt-1.5 flex items-center justify-between rounded-lg px-3 py-2"
                        style={{ background: '#fef2f2', border: '1.5px solid #fecaca' }}>
                        <span className="text-xs font-semibold" style={{ color: '#dc2626' }}>⏳ Pending Amount</span>
                        <span className="text-sm font-bold" style={{ color: '#dc2626' }}>₹{fmt(pending)}</span>
                      </div>
                    )}
                    {totalVal > 0 && pending === 0 && totalPaid > 0 && (
                      <div className="mt-1.5 flex items-center justify-between rounded-lg px-3 py-2"
                        style={{ background: '#f0fdf4', border: '1.5px solid #86efac' }}>
                        <span className="text-xs font-semibold" style={{ color: '#16a34a' }}>✓ Fully Paid</span>
                        <span className="text-sm font-bold" style={{ color: '#16a34a' }}>₹{fmt(totalPaid)}</span>
                      </div>
                    )}

                    {/* Add account inline form */}
                    {showAddPayAcct === entry.id && (
                      <div className="mt-2 rounded-lg p-2.5" style={{ background: '#fffde7', border: '1px solid #fde68a' }}>
                        <div className="text-[10px] font-bold text-[#713f12] mb-1.5">Add Payment Account</div>
                        <div className="flex gap-1 mb-1.5">
                          {(['NEFT','RTGS','UPI','GPAY','PHONEPAY'] as const).map(t => (
                            <button key={t} type="button" onClick={() => setNewPayAcctForm(f => ({ ...f, type: t }))}
                              className="flex-1 rounded text-[9px] font-bold py-1"
                              style={{ background: newPayAcctForm.type === t ? '#facc15' : '#fff', border: newPayAcctForm.type === t ? '1.5px solid #eab308' : '1px solid #fde68a', color: '#713f12' }}>
                              {t}
                            </button>
                          ))}
                        </div>
                        <input className={inputCls} style={{ borderColor: '#fde68a', marginBottom: 4 }}
                          placeholder="Name (e.g. My GPay)" value={newPayAcctForm.name}
                          onChange={e => setNewPayAcctForm(f => ({ ...f, name: e.target.value }))} />
                        <input className={inputCls} style={{ borderColor: '#fde68a', marginBottom: 6 }}
                          placeholder="UPI ID / Phone / Account No." value={newPayAcctForm.detail}
                          onChange={e => setNewPayAcctForm(f => ({ ...f, detail: e.target.value }))} />
                        <div className="flex gap-1.5">
                          <button type="button" onClick={saveNewPayAcct}
                            className="flex-1 py-1 rounded text-[11px] font-bold" style={{ background: '#3ECF8E', color: '#fff' }}>Save</button>
                          <button type="button" onClick={() => setShowAddPayAcct(null)}
                            className="flex-1 py-1 rounded text-[11px] font-bold" style={{ background: '#f3f4f6', color: '#374151' }}>Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Swap + Difference — swap only */}
              {entryType === 'swap' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>Swap Amount (₹) <span className="text-[10px] text-[#9ca3af] font-normal">auto</span></label>
                    <input type="number" className={inputCls} style={{ borderColor: '#e5e7eb' }}
                      value={entry.swapAmount}
                      onChange={e => updateEntry(entry.id, { swapAmount: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Difference (₹)</label>
                    <input type="number" className={inputCls} style={{ borderColor: '#e5e7eb' }}
                      value={entry.difference}
                      onChange={e => updateEntry(entry.id, { difference: e.target.value })}
                      placeholder="Optional"
                    />
                  </div>
                </div>
              )}

              {/* Remarks — auto-set by payment mode logic, hidden from UI */}
            </div>
          ))}
        </div>

        {/* Commodity Calculator */}
        <div>
          <div
            onClick={() => {
              setShowCommodities(v => !v)
              if (commodityItems.length === 0) {
                setCommodityItems([{ commodity_id: '', name: '', unit: 'pcs', qty: 1, price: 0, subtotal: 0 }])
              }
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              cursor: 'pointer', padding: '8px 0',
              color: '#6366f1', fontSize: '13px', fontWeight: '500',
              borderTop: '1px solid #e5e7eb', marginTop: '4px',
            }}
          >
            <Package size={16} />
            {showCommodities ? '− Remove Commodity Items' : '+ Add Commodity Items'}
          </div>

          {showCommodities && (
            <div style={{ background: '#f5f3ff', border: '1px solid #c4b5fd', borderRadius: '8px', padding: '12px', marginBottom: '8px' }}>
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#4c1d95', marginBottom: '8px' }}>
                📦 Commodity Calculator
              </div>
              <table style={{ width: '100%', fontSize: '12px', marginBottom: '8px' }}>
                <thead>
                  <tr style={{ color: '#6b7280' }}>
                    <th style={{ textAlign: 'left', paddingBottom: '4px', fontWeight: 500 }}>Item</th>
                    <th style={{ textAlign: 'right', paddingBottom: '4px', fontWeight: 500, width: '50px' }}>Qty</th>
                    <th style={{ textAlign: 'right', paddingBottom: '4px', fontWeight: 500, width: '70px' }}>Price</th>
                    <th style={{ textAlign: 'right', paddingBottom: '4px', fontWeight: 500, width: '70px' }}>Total</th>
                    <th style={{ width: '20px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {commodityItems.map((item, i) => (
                    <tr key={i}>
                      <td style={{ paddingRight: '4px', paddingBottom: '4px' }}>
                        <select
                          value={item.commodity_id}
                          onChange={e => {
                            const c = availableCommodities.find(x => x.id === e.target.value)
                            const totalSwap = accountEntries.reduce((s, ae) => s + (parseFloat(ae.swapAmount) || 0), 0)
                            const price = c?.current_price ?? 0
                            const autoQty = price > 0 ? Math.ceil(totalSwap / price) : 1
                            setCommodityItems(prev => {
                              const next = [...prev]
                              next[i] = { ...next[i], commodity_id: e.target.value, name: c?.name ?? '', unit: c?.unit ?? 'pcs', price, qty: autoQty, subtotal: price * autoQty }
                              return next
                            })
                          }}
                          style={{ width: '100%', border: '1px solid #ddd6fe', borderRadius: '4px', padding: '4px 6px', fontSize: '12px', background: 'white' }}
                        >
                          <option value="">Select...</option>
                          {availableCommodities.map(c => <option key={c.id} value={c.id}>{c.name} ({c.unit})</option>)}
                        </select>
                      </td>
                      <td style={{ paddingRight: '4px', paddingBottom: '4px' }}>
                        <input
                          type="number"
                          value={item.qty}
                          min={1}
                          onChange={e => {
                            const qty = parseFloat(e.target.value) || 0
                            setCommodityItems(prev => {
                              const next = [...prev]
                              next[i] = { ...next[i], qty, subtotal: qty * next[i].price }
                              return next
                            })
                          }}
                          style={{ width: '100%', border: '1px solid #ddd6fe', borderRadius: '4px', padding: '4px 6px', fontSize: '12px', textAlign: 'right' }}
                        />
                      </td>
                      <td style={{ paddingRight: '4px', paddingBottom: '4px' }}>
                        <input
                          type="number"
                          value={item.price}
                          min={0}
                          onChange={e => {
                            const price = parseFloat(e.target.value) || 0
                            setCommodityItems(prev => {
                              const next = [...prev]
                              next[i] = { ...next[i], price, subtotal: price * next[i].qty }
                              return next
                            })
                          }}
                          style={{ width: '100%', border: '1px solid #ddd6fe', borderRadius: '4px', padding: '4px 6px', fontSize: '12px', textAlign: 'right' }}
                        />
                      </td>
                      <td style={{ textAlign: 'right', paddingBottom: '4px', fontWeight: 600, color: '#4c1d95', paddingRight: '4px' }}>
                        ₹{item.subtotal.toLocaleString('en-IN')}
                      </td>
                      <td style={{ paddingBottom: '4px' }}>
                        {commodityItems.length > 1 && (
                          <button onClick={() => setCommodityItems(prev => prev.filter((_, j) => j !== i))} style={{ color: '#ef4444', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}>
                            <Trash2 size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <button
                  type="button"
                  onClick={() => setCommodityItems(prev => [...prev, { commodity_id: '', name: '', unit: 'pcs', qty: 1, price: 0, subtotal: 0 }])}
                  style={{ fontSize: '12px', color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <Plus size={12} /> Add Row
                </button>
                <div style={{ textAlign: 'right' }}>
                  {(() => {
                    const subtotal = commodityItems.reduce((s, r) => s + r.subtotal, 0)
                    const totalSwap = accountEntries.reduce((s, ae) => s + (parseFloat(ae.swapAmount) || 0), 0)
                    const discount = subtotal > 0 ? subtotal - totalSwap : 0
                    return (
                      <>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          Subtotal: ₹{subtotal.toLocaleString('en-IN')}
                        </div>
                        {discount > 0 && (
                          <div style={{ fontSize: '12px', color: '#dc2626' }}>
                            Discount: −₹{discount.toLocaleString('en-IN')}
                          </div>
                        )}
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#4c1d95' }}>
                          Invoice Total: ₹{totalSwap > 0 ? totalSwap.toLocaleString('en-IN') : subtotal.toLocaleString('en-IN')}
                        </div>
                      </>
                    )
                  })()}
                </div>
              </div>
              <p style={{ fontSize: '11px', color: '#7c3aed', marginTop: '4px' }}>
                Invoice will be auto-generated on Submit if items are filled.
              </p>
            </div>
          )}

          {/* Generated invoice success card */}
          {generatedInvoice && (
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '12px', marginTop: '8px' }}>
              <div style={{ fontWeight: 'bold', color: '#166534', marginBottom: '6px', fontSize: '13px' }}>
                ✅ Invoice Generated!
              </div>
              <div style={{ fontSize: '13px', color: '#374151', marginBottom: '2px' }}>
                Invoice No: <strong>{generatedInvoice.invoice_number}</strong>
              </div>
              <div style={{ fontSize: '13px', color: '#374151', marginBottom: '2px' }}>
                Customer: {generatedInvoice.customer_name}
              </div>
              {generatedInvoice.items.map((item, i) => (
                <div key={i} style={{ fontSize: '12px', color: '#6b7280' }}>
                  {(item as Record<string,unknown>).name as string}: {item.qty} {item.unit} x {Number((item as Record<string,unknown>).price).toLocaleString('en-IN')} = {Number(item.subtotal).toLocaleString('en-IN')}
                </div>
              ))}
              {Number((generatedInvoice as Record<string,unknown>).subtotal) > Number(generatedInvoice.total_amount) && (
                <div style={{ fontSize: '12px', color: '#dc2626' }}>
                  Discount: -{(Number((generatedInvoice as Record<string,unknown>).subtotal) - Number(generatedInvoice.total_amount)).toLocaleString('en-IN')}
                </div>
              )}
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#166534', marginTop: '4px' }}>
                Invoice Total: ₹{Number(generatedInvoice.total_amount).toLocaleString('en-IN')}
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button
                  onClick={() => router.push('/invoices')}
                  style={{ background: '#3ECF8E', color: 'white', border: 'none', borderRadius: '4px', padding: '5px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                >
                  View Invoice →
                </button>
                <button
                  onClick={() => setGeneratedInvoice(null)}
                  style={{ background: 'none', color: '#9ca3af', border: '1px solid #d1d5db', borderRadius: '4px', padding: '5px 12px', cursor: 'pointer', fontSize: '12px' }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 13. Reminder */}
        <div>
          <div
            onClick={() => setShowReminder(!showReminder)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              cursor: 'pointer', padding: '8px 0',
              color: '#3ECF8E', fontSize: '13px', fontWeight: '500',
              borderTop: '1px solid #e5e7eb', marginTop: '8px',
            }}
          >
            <Bell size={16} />
            {showReminder ? '− Remove Reminder' : '+ Add Reminder for this entry'}
          </div>

          {showReminder && (
            <div style={{
              background: '#f0fdf4', border: '1px solid #86efac',
              borderRadius: '8px', padding: '12px', marginBottom: '8px',
            }}>
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#166534', marginBottom: '8px' }}>
                🔔 Set Reminder
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#6b7280' }}>Reminder Date</label>
                  <input
                    type="date"
                    value={reminderDate}
                    onChange={e => setReminderDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    style={{ width: '100%', border: '1px solid #d1fae5', borderRadius: '6px', padding: '6px 8px', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#6b7280' }}>Time</label>
                  <input
                    type="time"
                    value={reminderTime}
                    onChange={e => setReminderTime(e.target.value)}
                    style={{ width: '100%', border: '1px solid #d1fae5', borderRadius: '6px', padding: '6px 8px', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '8px' }}>
                <label style={{ fontSize: '11px', color: '#6b7280' }}>Reminder Type</label>
                <select
                  value={reminderType}
                  onChange={e => setReminderType(e.target.value)}
                  style={{ width: '100%', border: '1px solid #d1fae5', borderRadius: '6px', padding: '6px 8px', fontSize: '13px' }}
                >
                  <option value="payment">💰 Payment Collection</option>
                  <option value="follow_up">📞 Follow Up</option>
                  <option value="card_due">💳 Card Due</option>
                  <option value="custom">⭐ Custom</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#6b7280' }}>Notes (optional)</label>
                <input
                  type="text"
                  value={reminderNotes}
                  onChange={e => setReminderNotes(e.target.value)}
                  placeholder="e.g. Collect commission, Follow up on payment..."
                  style={{ width: '100%', border: '1px solid #d1fae5', borderRadius: '6px', padding: '6px 8px', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                {[
                  { label: 'Tomorrow', days: 1 },
                  { label: '+3 Days', days: 3 },
                  { label: '+7 Days', days: 7 },
                  { label: '+15 Days', days: 15 },
                ].map(({ label, days }) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => {
                      const d = new Date()
                      d.setDate(d.getDate() + days)
                      setReminderDate(d.toISOString().split('T')[0])
                    }}
                    style={{
                      background: 'white', border: '1px solid #86efac',
                      borderRadius: '4px', padding: '3px 8px',
                      fontSize: '11px', cursor: 'pointer', color: '#166534',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 14. Buttons */}
        <div className="flex gap-2 mt-1">
          <button
            type="button"
            onClick={resetForm}
            className="px-4 py-2 rounded-md border text-sm font-medium text-[#374151] hover:bg-gray-50"
            style={{ borderColor: '#e5e7eb' }}
          >
            Reset
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: '#3ECF8E' }}
          >
            {submitting ? 'Saving...' : 'Submit Entry'}
          </button>
        </div>
      </div>

      {/* ── RIGHT PREVIEW 60% ── */}
      <div className="flex-1 flex flex-col min-w-0 gap-3">

        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#1a1a1a]">
            Today&apos;s Entries
            <span className="ml-2 text-xs text-[#6b7280] font-normal">
              ({todayEntries.length} records) — {fmtDate(today)}
            </span>
          </h2>
          <button
            onClick={exportXlsx}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium border hover:bg-gray-50"
            style={{ borderColor: '#e5e7eb', color: '#374151' }}
          >
            <Download size={12} /> Export .xlsx
          </button>
        </div>
        <div
          className="bg-white rounded-lg border overflow-auto flex-1"
          style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
        >
          {loadingEntries ? (
            <div className="flex items-center justify-center h-32 text-sm text-[#6b7280]">Loading...</div>
          ) : todayEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-1">
              <div className="text-sm text-[#6b7280]">No entries yet today</div>
              <div className="text-xs text-[#9ca3af]">Submit a form entry to see it here</div>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-[#f9f9f9] sticky top-0">
                <tr>
                  {['SR', 'Customer', 'Card', 'Total', 'Paid', 'A/C', 'Swap', 'Swap Name', 'Diff', 'Remarks'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-semibold text-[#6b7280] uppercase border-b border-[#e5e7eb] whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {todayEntries.map(e => (
                  <tr key={e.id} className="border-b border-[#e5e7eb] hover:bg-gray-50">
                    <td className="px-3 py-2 text-[#6b7280]">{e.sr_no}</td>
                    <td className="px-3 py-2 font-medium whitespace-nowrap">{e.customer_name}</td>
                    <td className="px-3 py-2 text-[#6b7280] whitespace-nowrap">{e.bank_card}</td>
                    <td className="px-3 py-2 whitespace-nowrap">₹{fmt(e.total_amount)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">₹{fmt(e.paid_amount)}</td>
                    <td className="px-3 py-2 text-[#6b7280] max-w-[90px] truncate">{e.account_name}</td>
                    <td className="px-3 py-2 whitespace-nowrap">₹{fmt(e.swap_amount)}</td>
                    <td className="px-3 py-2 text-[#6b7280] max-w-[90px] truncate">{e.swap_name}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{e.difference != null ? `₹${fmt(e.difference)}` : '—'}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap" style={remarksBadgeStyle(e.remarks)}>
                        {e.remarks}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── L-15 Modal ── */}
      {showL15 && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setShowL15(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl z-[60] flex flex-col" style={{ width: 520, maxHeight: '85vh' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5e7eb]">
              <div>
                <h2 className="font-semibold text-sm text-[#1a1a1a]">L-15 Walk-in Cash Entries</h2>
                <p className="text-xs text-[#6b7280]">{today}</p>
              </div>
              <button onClick={() => setShowL15(false)} className="p-1 hover:bg-gray-100 rounded"><X size={16} color="#6b7280" /></button>
            </div>
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
            <div className="flex-1 overflow-y-auto">
              {l15Entries.length === 0 ? (
                <div className="text-xs text-[#9ca3af] text-center py-8">No L-15 entries for today</div>
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
            <div className="px-5 py-3 border-t border-[#e5e7eb] flex justify-between items-center">
              <span className="text-xs text-[#6b7280]">Total L-15 Cash</span>
              <span className="text-sm font-bold text-[#1a1a1a]">
                ₹{l15Entries.reduce((s, e) => s + Number(e.amount), 0).toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        </>
      )}

      {/* ── Expenses Modal ── */}
      {showExpense && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setShowExpense(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl z-[60] flex flex-col" style={{ width: 580, maxHeight: '88vh' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5e7eb]">
              <div>
                <h2 className="font-semibold text-sm text-[#1a1a1a]">Daily Expenses</h2>
                <p className="text-xs text-[#6b7280]">{today}</p>
              </div>
              <button onClick={() => setShowExpense(false)} className="p-1 hover:bg-gray-100 rounded"><X size={16} color="#6b7280" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3 flex flex-col gap-4">
              {Object.entries({ office: '🏢 Office', transport: '🚗 Transport', utility: '⚡ Utilities', salary: '👤 Salaries', on_hand: '💰 On Hand', rent: '🏠 Rent', other: '📦 Other' }).map(([cat, label]) => {
                const catRows = chamundaExpenseRows.filter(r => expenseMaster.find(em => em.id === r.expense_id && em.category === cat))
                if (catRows.length === 0) return null
                return (
                  <div key={cat}>
                    <div className="text-xs font-semibold text-[#374151] mb-1.5">{label}</div>
                    <div className="flex flex-col gap-1.5">
                      {catRows.map(row => (
                        <div key={row.id} className="flex items-center gap-2">
                          <span className="text-xs text-[#374151] w-36 flex-shrink-0">{row.expense_name}</span>
                          <input type="number" placeholder="0" value={expenseEdits[row.id]?.amount ?? ''}
                            onChange={e => setExpenseEdits(ed => ({ ...ed, [row.id]: { ...ed[row.id], amount: e.target.value } }))}
                            className="w-28 border rounded px-2 py-1 text-xs outline-none focus:border-[#3ECF8E]" style={{ borderColor: '#e5e7eb' }} />
                          <input placeholder="Notes" value={expenseEdits[row.id]?.note ?? ''}
                            onChange={e => setExpenseEdits(ed => ({ ...ed, [row.id]: { ...ed[row.id], note: e.target.value } }))}
                            className="flex-1 border rounded px-2 py-1 text-xs outline-none focus:border-[#3ECF8E]" style={{ borderColor: '#e5e7eb' }} />
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
              <div className="border-t border-[#e5e7eb] pt-3">
                <div className="text-xs font-semibold text-[#374151] mb-2">+ Add Custom Expense</div>
                <div className="flex gap-2 flex-wrap">
                  <input placeholder="Expense name" value={newExpName} onChange={e => setNewExpName(e.target.value)}
                    className="border rounded px-2 py-1 text-xs outline-none focus:border-[#3ECF8E] w-36" style={{ borderColor: '#e5e7eb' }} />
                  <input type="number" placeholder="Amount" value={newExpAmt} onChange={e => setNewExpAmt(e.target.value)}
                    className="border rounded px-2 py-1 text-xs outline-none focus:border-[#3ECF8E] w-24" style={{ borderColor: '#e5e7eb' }} />
                  <select value={newExpCat} onChange={e => setNewExpCat(e.target.value)}
                    className="border rounded px-2 py-1 text-xs outline-none focus:border-[#3ECF8E] bg-white" style={{ borderColor: '#e5e7eb' }}>
                    {Object.entries({ office: '🏢 Office', transport: '🚗 Transport', utility: '⚡ Utilities', salary: '👤 Salaries', on_hand: '💰 On Hand', rent: '🏠 Rent', other: '📦 Other' }).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <button onClick={addCustomExpense} className="px-3 py-1 rounded text-xs font-medium text-white" style={{ background: '#3ECF8E' }}>Add</button>
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

export default function EntryPage() {
  return (
    <Suspense fallback={null}>
      <EntryPageInner />
    </Suspense>
  )
}
