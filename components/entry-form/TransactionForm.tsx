'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { ACCOUNT_NAMES, today } from '@/lib/utils'
import { applyMappingsToSheets, migrateOldMappings, type MappingState } from '@/components/FieldMappingEditor'
import { createClient } from '@/lib/supabase/client'

interface Card {
  id: string
  card_nickname: string | null
  last4: string | null
  bank_name: string | null
  is_active: boolean
}

interface Customer {
  id: string
  name: string
  phone: string | null
  outstanding_balance: number
  default_charge_pct: number
  cards: Card[]
}

interface BankAccount {
  id: string
  account_name: string
  bank_name: string
  account_type: string
  account_number: string
  ifsc_code: string
  branch: string
  commission_pct: number
  commission_type: string
  notes: string
  contact_person: string
  contact_phone: string
  opening_balance: number
  current_balance: number
}

interface SwipeMachine {
  id: string
  machine_name: string
  tid: string
  account_name: string
  machine_type: string
  agent_code: string
  bank_commission_pct: number
  status: string
}

interface Props {
  onSuccess?: (txn: unknown) => void
}

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4002'

export default function TransactionForm({ onSuccess }: Props) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Customer[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [savedMappings, setSavedMappings] = useState<MappingState | null>(null)
  const [selectedAccount, setSelectedAccount] = useState<BankAccount | null>(null)
  const [selectedMachine, setSelectedMachine] = useState<SwipeMachine | null>(null)

  const [form, setForm] = useState({
    date: today(),
    bank_card: '',
    total_amount: '',
    paid_amount: '',
    account_name: '',
    swap_amount: '',
    swap_name: '',
    remarks: 'Pending' as string,
    commission_pct: '',
  })

  // Load field mappings saved by the mapping editor
  useEffect(() => {
    try {
      const raw = localStorage.getItem('field_mapping_rules')
      if (raw) setSavedMappings(migrateOldMappings(JSON.parse(raw)))
    } catch { /* ignore */ }
  }, [])

  // Fetch full bank account details when account_name is selected
  useEffect(() => {
    if (!form.account_name) { setSelectedAccount(null); return }
    const supabase = createClient()
    supabase.from('bank_accounts').select('*').eq('account_name', form.account_name).single()
      .then(({ data }) => setSelectedAccount(data ?? null))
  }, [form.account_name])

  // Fetch swap machine details when swap_name is filled
  useEffect(() => {
    if (!form.swap_name) { setSelectedMachine(null); return }
    const supabase = createClient()
    supabase.from('swipe_machines').select('*').ilike('machine_name', form.swap_name).limit(1)
      .then(({ data }) => setSelectedMachine(data?.[0] ?? null))
  }, [form.swap_name])

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.length < 1) { setSuggestions([]); return }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API}/api/customers/search?q=${encodeURIComponent(query)}`)
        const json = await res.json()
        setSuggestions(json.customers || [])
        setShowDropdown(true)
      } catch { /* ignore */ }
    }, 300)
  }, [query])

  function selectCustomer(c: Customer) {
    setSelectedCustomer(c)
    setQuery(c.name)
    setShowDropdown(false)
    setSelectedCard(null)
    setForm(f => ({
      ...f,
      bank_card: '',
      commission_pct: String(c.default_charge_pct ?? 3),
    }))
  }

  function selectCard(card: Card) {
    setSelectedCard(card)
    setForm(f => ({
      ...f,
      bank_card: `${card.bank_name ?? ''} ...${card.last4 ?? ''}`.trim(),
    }))
  }

  function updateField(key: keyof typeof form, value: string) {
    setForm(f => {
      const updated = { ...f, [key]: value }
      // Auto-suggest swap amount = total * 1.02
      if (key === 'total_amount' && value) {
        const total = parseFloat(value)
        if (!isNaN(total)) {
          updated.swap_amount = (total * 1.02).toFixed(2)
        }
      }
      return updated
    })
  }

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      // Build the full form data map so applyMappingsToSheets can route values
      const totalAmt = parseFloat(form.total_amount) || 0
      const paidAmt  = parseFloat(form.paid_amount)  || 0
      const commPct  = parseFloat(form.commission_pct) || 0
      const commAmt  = totalAmt * commPct / 100

      const formDataMap: Record<string, unknown> = {
        // transaction core
        date:              form.date,
        customer_name:     selectedCustomer?.name ?? query,
        bank_card:         form.bank_card,
        total_amount:      totalAmt,
        paid_amount:       paidAmt,
        difference:        totalAmt - paidAmt,
        account_name:      form.account_name,
        swap_amount:       form.swap_amount ? parseFloat(form.swap_amount) : undefined,
        swap_name:         form.swap_name,
        remarks:           form.remarks,
        status:            form.remarks,
        commission_pct:    commPct || undefined,
        commission_amount: commAmt || undefined,
        // customer details
        customer_phone:      selectedCustomer?.phone ?? undefined,
        outstanding_balance: selectedCustomer?.outstanding_balance ?? undefined,
        // card details
        card_last4:     selectedCard?.last4     ?? undefined,
        card_bank_name: selectedCard?.bank_name ?? undefined,
        card_nickname:  selectedCard?.card_nickname ?? undefined,
        // bank account details
        acct_bank_name:      selectedAccount?.bank_name       ?? undefined,
        acct_type:           selectedAccount?.account_type    ?? undefined,
        acct_number:         selectedAccount?.account_number  ?? undefined,
        acct_ifsc:           selectedAccount?.ifsc_code       ?? undefined,
        acct_branch:         selectedAccount?.branch          ?? undefined,
        acct_commission_pct: selectedAccount?.commission_pct  ?? undefined,
        acct_commission_type:selectedAccount?.commission_type ?? undefined,
        acct_contact_person: selectedAccount?.contact_person  ?? undefined,
        acct_contact_phone:  selectedAccount?.contact_phone   ?? undefined,
        acct_current_balance:selectedAccount?.current_balance ?? undefined,
        // swap machine details
        machine_tid:          selectedMachine?.tid               ?? undefined,
        machine_type:         selectedMachine?.machine_type      ?? undefined,
        machine_agent_code:   selectedMachine?.agent_code        ?? undefined,
        machine_bank_comm_pct:selectedMachine?.bank_commission_pct ?? undefined,
        machine_account:      selectedMachine?.account_name      ?? undefined,
      }

      // Produce per-sheet column values based on saved mappings.
      // The result is included in the payload so the backend (or future middleware)
      // can use it to write the correct value into the correct column in each sheet.
      const sheetData = savedMappings
        ? applyMappingsToSheets(formDataMap, savedMappings)
        : {}

      const payload = {
        date: form.date,
        customer_id: selectedCustomer?.id,
        customer_name: selectedCustomer?.name ?? query,
        bank_card: form.bank_card,
        total_amount: parseFloat(form.total_amount),
        paid_amount: parseFloat(form.paid_amount),
        account_name: form.account_name,
        swap_amount: form.swap_amount ? parseFloat(form.swap_amount) : undefined,
        swap_name: form.swap_name,
        remarks: form.remarks,
        status: form.remarks as 'Paid' | 'Unpaid' | 'Pending' | 'Puru',
        commission_pct: form.commission_pct ? parseFloat(form.commission_pct) : undefined,
        // Mapping-derived per-sheet values (used by sheet write logic)
        field_mappings: sheetData,
      }

      const res = await fetch(`${API}/api/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')

      showToast('Transaction added successfully!', 'success')
      // Write dedicated customer sheet row
      if (json.transaction) writeCustomerSheetRow(json.transaction, selectedCustomer, selectedCard)
      onSuccess?.(json.transaction)

      // Reset form
      setQuery('')
      setSelectedCustomer(null)
      setSelectedCard(null)
      setSelectedAccount(null)
      setSelectedMachine(null)
      setForm({ date: today(), bank_card: '', total_amount: '', paid_amount: '', account_name: '', swap_amount: '', swap_name: '', remarks: 'Pending', commission_pct: '' })
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error submitting', 'error')
    } finally {
      setLoading(false)
    }
  }, [form, selectedCustomer, selectedCard, query, onSuccess])

  return (
    <div className="relative">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.msg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 p-4">
        <h2 className="text-lg font-bold text-gray-900">New Transaction</h2>

        {/* Customer Autocomplete */}
        <div className="relative">
          <label className="block text-xs font-medium text-gray-600 mb-1">Customer Name *</label>
          <input
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedCustomer(null) }}
            onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
            placeholder="Search customer..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {showDropdown && suggestions.length > 0 && (
            <div className="absolute z-20 top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl mt-1 max-h-48 overflow-y-auto">
              {suggestions.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectCustomer(c)}
                  className="w-full text-left px-4 py-3 hover:bg-blue-50 transition text-sm"
                >
                  <span className="font-medium">{c.name}</span>
                  <span className="text-gray-400 ml-2 text-xs">{c.phone}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Customer Info Cards */}
        {selectedCustomer && (
          <div className="bg-blue-50 rounded-xl p-3 space-y-2">
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <p className="text-gray-500">Phone</p>
                <p className="font-medium">{selectedCustomer.phone || '—'}</p>
              </div>
              <div>
                <p className="text-gray-500">Outstanding</p>
                <p className="font-medium text-red-600">₹{selectedCustomer.outstanding_balance?.toLocaleString('en-IN') || '0'}</p>
              </div>
              <div>
                <p className="text-gray-500">Comm %</p>
                <p className="font-medium">{selectedCustomer.default_charge_pct}%</p>
              </div>
            </div>
            {selectedCustomer.cards?.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-1.5">Cards — tap to select:</p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedCustomer.cards.filter(c => c.is_active).map(card => (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => selectCard(card)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition font-medium ${selectedCard?.id === card.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'}`}
                    >
                      {card.bank_name ?? ''} ...{card.last4 ?? ''}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Date */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
            <input type="date" value={form.date} onChange={e => updateField('date', e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Bank Card</label>
            <input type="text" value={form.bank_card} onChange={e => updateField('bank_card', e.target.value)} placeholder="Auto-fills from card" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Total Amount *</label>
            <input type="number" step="0.01" value={form.total_amount} onChange={e => updateField('total_amount', e.target.value)} required placeholder="0.00" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Paid Amount *</label>
            <input type="number" step="0.01" value={form.paid_amount} onChange={e => updateField('paid_amount', e.target.value)} required placeholder="0.00" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Account Name *</label>
          <select value={form.account_name} onChange={e => updateField('account_name', e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="">Select account...</option>
            {ACCOUNT_NAMES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Swap Amount</label>
            <input type="number" step="0.01" value={form.swap_amount} onChange={e => updateField('swap_amount', e.target.value)} placeholder="Auto: total×1.02" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Swap Name</label>
            <input type="text" value={form.swap_name} onChange={e => updateField('swap_name', e.target.value)} placeholder="Swap party name" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Remarks / Status</label>
            <select value={form.remarks} onChange={e => updateField('remarks', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              {['Paid', 'Unpaid', 'Pending', 'Puru'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Commission %</label>
            <input type="number" step="0.01" value={form.commission_pct} onChange={e => updateField('commission_pct', e.target.value)} placeholder="3.00" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 px-4 rounded-xl transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          {loading ? 'Submitting...' : '+ Add Transaction'}
        </button>
      </form>
    </div>
  )
}

// ── Write a row to customer_sheet after a transaction is saved ────────────────
async function writeCustomerSheetRow(
  tx: Record<string, unknown>,
  customer: { id: string; name: string; phone: string | null; outstanding_balance: number } | null,
  card: { last4: string | null; bank_name: string | null; card_nickname: string | null } | null,
) {
  try {
    const supabase = createClient()
    let cardNumber = '', pin = '', cvvExpiry = '', dueDate: string | null = null, cardNetwork = ''

    // Fetch full card details if we have a customer + bank_card reference
    if (customer?.id && tx.bank_card) {
      const { data: cards } = await supabase.from('cards').select('*')
        .eq('customer_id', customer.id)
        .ilike('bank_name', `%${tx.bank_card}%`)
        .limit(1)
      if (cards && cards.length > 0) {
        const c = cards[0] as Record<string, unknown>
        cardNumber  = String(c.card_number || '')
        pin         = String(c.pin || '')
        cvvExpiry   = c.cvv ? `${c.cvv}/${c.expiry || ''}` : String(c.expiry || '')
        dueDate     = c.due_date ? String(c.due_date) : null
        cardNetwork = String(c.card_type || '')
      }
    }

    const totalAmt  = Number(tx.total_amount)  || 0
    const paidAmt   = Number(tx.paid_amount)   || 0
    const swapAmt   = Number(tx.swap_amount)   || 0
    const commission = Number(tx.commission_amount) || 0

    const { error } = await supabase.from('customer_sheet').insert({
      transaction_id:  tx.id         || null,
      customer_id:     customer?.id  || null,
      customer_name:   String(tx.customer_name || customer?.name || ''),
      date:            String(tx.date || new Date().toISOString().split('T')[0]),
      due_date:        dueDate,
      card:            String(tx.bank_card || card?.bank_name || ''),
      card_number:     cardNumber,
      pin,
      cvv_expiry:      cvvExpiry,
      card_network:    cardNetwork,
      total_amount:    totalAmt,
      paid_amount:     paidAmt,
      swap_amount:     swapAmt,
      commission,
      paid_remaining:  totalAmt - paidAmt,
      swap_pending:    swapAmt - totalAmt,
      account_name:    String(tx.account_name || ''),
      swap_name:       String(tx.swap_name || ''),
      paid_date:       String(tx.remarks || '').toUpperCase() === 'PAID' ? String(tx.date || '') : null,
    })
    if (error) console.error('[customer_sheet] insert error:', error.message)
  } catch (err) {
    console.error('[customer_sheet] write error:', err)
  }
}
