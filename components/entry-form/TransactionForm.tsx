'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { ACCOUNT_NAMES, today } from '@/lib/utils'

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
      }

      const res = await fetch(`${API}/api/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')

      showToast('Transaction added successfully!', 'success')
      onSuccess?.(json.transaction)

      // Reset form
      setQuery('')
      setSelectedCustomer(null)
      setSelectedCard(null)
      setForm({ date: today(), bank_card: '', total_amount: '', paid_amount: '', account_name: '', swap_amount: '', swap_name: '', remarks: 'Pending', commission_pct: '' })
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error submitting', 'error')
    } finally {
      setLoading(false)
    }
  }, [form, selectedCustomer, query, onSuccess])

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
