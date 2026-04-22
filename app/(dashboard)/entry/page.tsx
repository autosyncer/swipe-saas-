'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Download, Search, X, Check, ChevronDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Transaction, Customer, Card } from '@/types/database'

const ACCOUNT_OPTIONS = [
  'KTC INDUS', 'MAP IND', 'RT IND', 'BGM IND', 'SKT INDUS', 'MAP INDUS',
  'RT INDUS', 'BGM INDUS', 'NTC INDUS', 'SKT FDRL', 'NGM INDUS',
  'MAP IND+RT IND', 'MGs FDRL', 'SST FDRL', 'NTC FDRL', 'KTC FDRL',
  'MAP FDRL', 'TAPI FDRL', 'BGM FDRL', 'TAPI BOB', 'KTC BOB',
  'MNS BOB', 'NGM BOB', 'SKT FINK', 'NTC BOB', 'RT BOB',
  'MAP BOB', 'SKT BOB', 'NSS FDRL', 'BGM BOB',
]

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
  const nick = c.card_nickname ? `${c.card_nickname} — ` : ''
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

export default function EntryPage() {
  const today = new Date().toISOString().split('T')[0]

  const [nextSrNo, setNextSrNo] = useState<number>(6752)
  const [commPct, setCommPct] = useState<string>(DEFAULT_COMM.toString())
  const [form, setForm] = useState({
    customerName: '',
    bankCard: '',
    totalAmount: '',
    paidAmount: '',
    accountNames: [] as string[],
    swapAmount: '',
    swapNames: [] as string[],
    difference: '',
    remarks: 'PAID',
  })

  // Customer autocomplete
  const [custSearch, setCustSearch] = useState('')
  const [custSuggestions, setCustSuggestions] = useState<Customer[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [showCustDrop, setShowCustDrop] = useState(false)
  const custRef = useRef<HTMLDivElement>(null)

  // Customer cards
  const [customerCards, setCustomerCards] = useState<Card[]>([])
  const [selectedCardId, setSelectedCardId] = useState<string>('')
  const [customBankCard, setCustomBankCard] = useState(false) // true when "Other" selected

  // Account name multi-select
  const [acctDropOpen, setAcctDropOpen] = useState(false)
  const [acctCustomInput, setAcctCustomInput] = useState('')
  const acctRef = useRef<HTMLDivElement>(null)

  // Swap name tag input
  const [swapInput, setSwapInput] = useState('')
  const [swapFocused, setSwapFocused] = useState(false)
  const [showSwapSugg, setShowSwapSugg] = useState(false)
  const swapRef = useRef<HTMLDivElement>(null)
  const [machineNames, setMachineNames] = useState<string[]>(SWAP_SUGGESTIONS)

  // Right panel
  const [todayEntries, setTodayEntries] = useState<Transaction[]>([])
  const [loadingEntries, setLoadingEntries] = useState(false)

  // Toast
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // ── Load active machine names for swap suggestions ──
  useEffect(() => {
    supabase.from('swipe_machines').select('machine_name').eq('status', 'Active').then(({ data }) => {
      if (data && data.length > 0) setMachineNames(data.map((m: { machine_name: string }) => m.machine_name))
    })
  }, [])

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

  // ── Close dropdowns on outside click ──
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (acctRef.current && !acctRef.current.contains(e.target as Node)) setAcctDropOpen(false)
      if (custRef.current && !custRef.current.contains(e.target as Node)) setShowCustDrop(false)
      if (swapRef.current && !swapRef.current.contains(e.target as Node)) setShowSwapSugg(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Recalculate paid/swap when totalAmount OR commPct changes ──
  useEffect(() => {
    const total = parseFloat(form.totalAmount)
    const comm = parseFloat(commPct) || DEFAULT_COMM
    if (!total || isNaN(total)) return
    setForm(f => ({
      ...f,
      paidAmount: total.toString(),
      swapAmount: Math.round(total + (total * comm / 100)).toString(),
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.totalAmount, commPct])

  // ── Select a customer from autocomplete ──
  async function selectCustomer(c: Customer) {
    setSelectedCustomer(c)
    setCustSearch(c.name)
    setShowCustDrop(false)
    setCommPct((c.default_charge_pct || DEFAULT_COMM).toString())
    setForm(f => ({ ...f, customerName: c.name, bankCard: '' }))
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
    setCustomerCards((data as Card[]) || [])
  }

  function selectCard(c: Card) {
    setSelectedCardId(c.id)
    setForm(f => ({ ...f, bankCard: c.bank_name }))
    setCustomBankCard(false)
  }

  function toggleAccount(opt: string) {
    setForm(f => ({
      ...f,
      accountNames: f.accountNames.includes(opt)
        ? f.accountNames.filter(a => a !== opt)
        : [...f.accountNames, opt],
    }))
  }

  function addCustomAccount() {
    const val = acctCustomInput.trim()
    if (val && !form.accountNames.includes(val)) {
      setForm(f => ({ ...f, accountNames: [...f.accountNames, val] }))
    }
    setAcctCustomInput('')
  }

  function addSwapName(val?: string) {
    const v = (val ?? swapInput).trim()
    if (v && !form.swapNames.includes(v)) {
      setForm(f => ({ ...f, swapNames: [...f.swapNames, v] }))
    }
    setSwapInput('')
    setShowSwapSugg(false)
  }

  function resetForm() {
    setForm({ customerName: '', bankCard: '', totalAmount: '', paidAmount: '', accountNames: [], swapAmount: '', swapNames: [], difference: '', remarks: 'PAID' })
    setCustSearch('')
    setSelectedCustomer(null)
    setCustomerCards([])
    setSelectedCardId('')
    setCustomBankCard(false)
    setCommPct(DEFAULT_COMM.toString())
    setSwapInput('')
    setAcctCustomInput('')
  }

  async function createCCSheetRow(transaction: Record<string, unknown>) {
    try {
      const swapName = String(transaction.swap_name || '')
      const { data: machines } = await supabase.from('swipe_machines').select('*')
      let matchedMachine: Record<string, unknown> | null = null
      if (machines && swapName) {
        matchedMachine = (machines as Record<string, unknown>[]).find(m =>
          swapName.toUpperCase().includes(String(m.machine_name).toUpperCase()) ||
          swapName.toUpperCase().includes(String(m.account_name).toUpperCase())
        ) || null
      }
      const swipeAmount = Number(transaction.swap_amount) || Number(transaction.total_amount) || 0
      const bankCommPct = matchedMachine ? Number(matchedMachine.bank_commission_pct) : 1.320
      const bankCommission = (swipeAmount * bankCommPct) / 100
      const ourCommission = Number(transaction.commission_amount) || (swipeAmount * (Number(transaction.commission_pct) || 2.2) / 100)
      const customerAmount = swipeAmount - bankCommission
      const ccRow = {
        transaction_id: transaction.id,
        machine_id: matchedMachine ? matchedMachine.id : null,
        tid: matchedMachine ? String(matchedMachine.tid) : '',
        machine_name: matchedMachine ? String(matchedMachine.machine_name) : swapName,
        date: transaction.date,
        swipe_amount: swipeAmount,
        customer_amount: customerAmount,
        bank_commission: bankCommission,
        our_commission: ourCommission,
        status: String(transaction.remarks || ''),
        customer_name: String(transaction.customer_name || ''),
        agent_code: matchedMachine ? String(matchedMachine.agent_code || '') : '',
        account_name: String(transaction.account_name || ''),
      }
      const { error } = await supabase.from('cc_sheet').insert(ccRow)
      if (error) console.error('[CC Sheet] insert error:', error.message)
      else console.log('[CC Sheet] row created for SR:', transaction.sr_no)
    } catch (err) {
      console.error('[CC Sheet] auto-generation error:', err)
    }
  }

  async function createCustomerSheetRow(transaction: Record<string, unknown>) {
    try {
      let cardNumber = '', pin = '', cvvExpiry = '', dueDate: string | null = null, cardNetwork = ''
      const customerId = transaction.customer_id as string | null
      const bankCard = String(transaction.bank_card || '')
      if (customerId && bankCard) {
        const { data: cards } = await supabase.from('cards').select('*').eq('customer_id', customerId).ilike('bank_name', `%${bankCard}%`).limit(1)
        if (cards && cards.length > 0) {
          const c = cards[0] as Record<string, unknown>
          cardNumber = String(c.card_number || '')
          pin = String(c.pin || '')
          cvvExpiry = c.cvv ? `${c.cvv}/${c.expiry || ''}` : String(c.expiry || '')
          dueDate = c.due_date ? String(c.due_date) : null
          cardNetwork = String(c.card_type || '')
        }
      }
      const totalAmt = Number(transaction.total_amount) || 0
      const paidAmt = Number(transaction.paid_amount) || 0
      const swapAmt = Number(transaction.swap_amount) || 0
      const commission = Number(transaction.commission_amount) || 0
      const { error } = await supabase.from('customer_sheet').insert({
        transaction_id: transaction.id || null,
        customer_id: customerId || null,
        customer_name: String(transaction.customer_name || ''),
        due_date: dueDate,
        card: bankCard,
        card_number: cardNumber,
        pin,
        cvv_expiry: cvvExpiry,
        total_amount: totalAmt,
        paid_amount: paidAmt,
        swap_amount: swapAmt,
        commission,
        paid_remaining: totalAmt - paidAmt,
        swap_pending: swapAmt - totalAmt,
        account_name: String(transaction.account_name || ''),
        swap_name: String(transaction.swap_name || ''),
        paid_date: transaction.remarks === 'PAID' ? String(transaction.date || '') : null,
        card_network: cardNetwork,
        date: String(transaction.date || new Date().toISOString().split('T')[0]),
      })
      if (error) console.error('[Customer Sheet] insert error:', error.message)
      else console.log('[Customer Sheet] row created for:', transaction.customer_name)
    } catch (err) {
      console.error('[Customer Sheet] auto-generation error:', err)
    }
  }

  async function handleSubmit() {
    if (!form.customerName || !form.totalAmount) {
      setToast({ msg: 'Customer name and total amount are required', type: 'error' })
      setTimeout(() => setToast(null), 3000)
      return
    }
    setSubmitting(true)
    const total = parseFloat(form.totalAmount) || 0
    const comm = parseFloat(commPct) || DEFAULT_COMM
    const payload = {
      date: today,
      customer_name: form.customerName.trim(),
      bank_card: form.bankCard.trim() || '',
      total_amount: total,
      paid_amount: parseFloat(form.paidAmount) || 0,
      account_name: form.accountNames.join('+'),
      swap_amount: parseFloat(form.swapAmount) || 0,
      swap_name: form.swapNames.join('+'),
      difference: form.difference ? parseFloat(form.difference) : null,
      remarks: form.remarks,
      status: ({PAID:'Paid',PEND:'Pending',PURU:'Puru',UNPAID:'Unpaid',SE:'Paid',CANCEL:'Cancelled'} as Record<string,string>)[form.remarks] || 'Pending',
      commission_pct: comm,
      commission_amount: Math.round(total * comm / 100),
    }
    console.log('[entry] submit payload:', payload)
    const { data, error } = await supabase.from('transactions').insert(payload).select().single()
    console.log('[entry] result:', data, error)

    if (error) {
      setToast({ msg: `Error: ${error.message}`, type: 'error' })
    } else {
      setToast({ msg: `Entry saved — SR No: ${data?.sr_no ?? ''}`, type: 'success' })
      setNextSrNo(n => n + 1)
      resetForm()
      fetchTodayEntries()
      if (data) {
        createCCSheetRow(data)
        createCustomerSheetRow({ ...(data as Record<string, unknown>), customer_id: selectedCustomer?.id || null })
      }
    }
    setSubmitting(false)
    setTimeout(() => setToast(null), 4000)
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

  const filteredSwapSugg = machineNames.filter(
    s => !form.swapNames.includes(s) &&
      (swapInput.length === 0 || s.toLowerCase().includes(swapInput.toLowerCase()))
  )

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
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-[#1a1a1a]">New Entry</h1>
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
                  setCommPct(DEFAULT_COMM.toString())
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

        {/* 3. Bank Card */}
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

        {/* 4. Commission % */}
        <div>
          <label className={labelCls}>
            Commission %
            <span className="text-[10px] text-[#9ca3af] ml-1 font-normal">
              {selectedCustomer ? `(from customer: ${selectedCustomer.default_charge_pct}%)` : '(default 2.20)'}
            </span>
          </label>
          <input
            type="number"
            step="0.01"
            className={inputCls}
            style={{ borderColor: '#e5e7eb' }}
            value={commPct}
            onChange={e => setCommPct(e.target.value)}
            placeholder="2.20"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* 5. Total Amount */}
          <div>
            <label className={labelCls}>Total Amount (₹)</label>
            <input
              type="number"
              className={inputCls}
              style={{ borderColor: '#e5e7eb' }}
              value={form.totalAmount}
              onChange={e => setForm(f => ({ ...f, totalAmount: e.target.value }))}
              placeholder="0"
            />
          </div>

          {/* 6. Paid Amount */}
          <div>
            <label className={labelCls}>
              Paid Amount (₹)
              <span className="text-[10px] text-[#9ca3af] ml-1 font-normal">auto-fills</span>
            </label>
            <input
              type="number"
              className={inputCls}
              style={{ borderColor: '#e5e7eb' }}
              value={form.paidAmount}
              onChange={e => setForm(f => ({ ...f, paidAmount: e.target.value }))}
              placeholder="0"
            />
          </div>
        </div>

        {/* 7. Account Name */}
        <div ref={acctRef}>
          <label className={labelCls}>Account Name</label>
          <div
            className="min-h-[38px] rounded-md border px-2 py-1 cursor-pointer flex flex-wrap gap-1 items-center"
            style={{ borderColor: acctDropOpen ? '#3ECF8E' : '#e5e7eb' }}
            onClick={() => setAcctDropOpen(o => !o)}
          >
            {form.accountNames.map(a => (
              <span
                key={a}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                style={{ background: '#d1fae5', color: '#065f46' }}
                onClick={e => { e.stopPropagation(); toggleAccount(a) }}
              >
                {a} <X size={10} />
              </span>
            ))}
            {form.accountNames.length === 0 && (
              <span className="text-xs text-[#9ca3af]">Click to select accounts...</span>
            )}
            <ChevronDown size={12} color="#9ca3af" className="ml-auto" />
          </div>
          {acctDropOpen && (
            <div
              className="relative z-20 bg-white border rounded-md shadow-lg mt-1 p-2"
              style={{ borderColor: '#e5e7eb' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex flex-wrap gap-1 mb-2 max-h-32 overflow-y-auto">
                {ACCOUNT_OPTIONS.map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => toggleAccount(opt)}
                    className="px-2 py-0.5 rounded-full text-xs font-medium border transition-colors"
                    style={{
                      background: form.accountNames.includes(opt) ? '#3ECF8E' : '#f3f4f6',
                      color: form.accountNames.includes(opt) ? '#fff' : '#374151',
                      borderColor: form.accountNames.includes(opt) ? '#3ECF8E' : '#e5e7eb',
                    }}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              <div className="flex gap-1">
                <input
                  className="flex-1 border rounded px-2 py-1 text-xs outline-none focus:border-[#3ECF8E]"
                  style={{ borderColor: '#e5e7eb' }}
                  placeholder="Custom account..."
                  value={acctCustomInput}
                  onChange={e => setAcctCustomInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomAccount() } }}
                />
                <button
                  type="button"
                  className="px-2 py-1 rounded text-xs font-medium text-white"
                  style={{ background: '#3ECF8E' }}
                  onClick={addCustomAccount}
                >
                  Add
                </button>
              </div>
            </div>
          )}
          {form.accountNames.length > 0 && (
            <p className="text-[10px] text-[#9ca3af] mt-0.5">Saved as: {form.accountNames.join('+')}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* 8. Swap Amount */}
          <div>
            <label className={labelCls}>
              Swap Amount (₹)
              <span className="text-[10px] text-[#9ca3af] ml-1 font-normal">auto-suggests</span>
            </label>
            <input
              type="number"
              className={inputCls}
              style={{ borderColor: '#e5e7eb' }}
              value={form.swapAmount}
              onChange={e => setForm(f => ({ ...f, swapAmount: e.target.value }))}
              placeholder="0"
            />
          </div>

          {/* 10. Difference */}
          <div>
            <label className={labelCls}>Difference (₹)</label>
            <input
              type="number"
              className={inputCls}
              style={{ borderColor: '#e5e7eb' }}
              value={form.difference}
              onChange={e => setForm(f => ({ ...f, difference: e.target.value }))}
              placeholder="Optional"
            />
          </div>
        </div>

        {/* 9. Swap Name */}
        <div ref={swapRef}>
          <label className={labelCls}>Swap Name</label>
          <div
            className="min-h-[38px] rounded-md border px-2 py-1 flex flex-wrap gap-1 items-center"
            style={{ borderColor: swapFocused ? '#3ECF8E' : '#e5e7eb' }}
          >
            {form.swapNames.map(s => (
              <span
                key={s}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                style={{ background: '#d1fae5', color: '#065f46' }}
              >
                {s}
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, swapNames: f.swapNames.filter(n => n !== s) }))}
                >
                  <X size={10} />
                </button>
              </span>
            ))}
            <input
              className="flex-1 min-w-[120px] text-xs outline-none bg-transparent"
              placeholder="Type machine name and press Enter..."
              value={swapInput}
              onFocus={() => { setSwapFocused(true); setShowSwapSugg(true) }}
              onBlur={() => setSwapFocused(false)}
              onChange={e => { setSwapInput(e.target.value); setShowSwapSugg(true) }}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ',' || e.key === '+') {
                  e.preventDefault()
                  addSwapName()
                }
              }}
            />
          </div>
          {showSwapSugg && filteredSwapSugg.length > 0 && (
            <div
              className="relative z-20 bg-white border rounded-md shadow-md mt-1 p-1.5 flex flex-wrap gap-1 max-h-24 overflow-y-auto"
              style={{ borderColor: '#e5e7eb' }}
            >
              {filteredSwapSugg.slice(0, 15).map(s => (
                <button
                  key={s}
                  type="button"
                  onMouseDown={() => addSwapName(s)}
                  className="px-2 py-0.5 rounded-full text-xs font-medium border hover:bg-[#3ECF8E] hover:text-white hover:border-[#3ECF8E] transition-colors"
                  style={{ background: '#f3f4f6', color: '#374151', borderColor: '#e5e7eb' }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {form.swapNames.length > 0 && (
            <p className="text-[10px] text-[#9ca3af] mt-0.5">Saved as: {form.swapNames.join('+')}</p>
          )}
        </div>

        {/* 11. Remarks */}
        <div>
          <label className={labelCls}>Remarks</label>
          <select
            className={`${inputCls} bg-white`}
            style={{ borderColor: '#e5e7eb' }}
            value={form.remarks}
            onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
          >
            {REMARKS_OPTS.map(r => <option key={r}>{r}</option>)}
          </select>
        </div>

        {/* 12. Buttons */}
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
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between mb-3">
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
    </div>
  )
}
