'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'

const LuckysheetCanvas = dynamic(() => import('@/components/excel-canvas/LuckysheetCanvas'), { ssr: false })

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4002'
const ACCOUNT_NAMES = ['NSS', 'SKT', 'RT', 'KTC', 'TAP', 'BGM', 'NTC', 'MAHA', 'MAL', 'MAP', 'HASTI']

function todayStr() { return new Date().toISOString().split('T')[0] }

interface Card { id: string; bank_name: string | null; last4: string | null; is_active: boolean }
interface Customer { id: string; name: string; phone: string | null; outstanding_balance: number; default_charge_pct: number; cards: Card[] }

export default function CanvasPage() {
  // Autocomplete state
  const [custQuery, setCustQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Customer[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [showDrop, setShowDrop] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Form fields
  const [date, setDate] = useState(todayStr())
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [bankCard, setBankCard] = useState('')
  const [totalAmount, setTotalAmount] = useState('')
  const [paidAmount, setPaidAmount] = useState('')
  const [accountName, setAccountName] = useState('')
  const [swapAmount, setSwapAmount] = useState('')
  const [swapName, setSwapName] = useState('')
  const [remarks, setRemarks] = useState('Pending')
  const [commPct, setCommPct] = useState('3')

  // Submit state
  const [submitting, setSubmitting] = useState(false)
  const [submitMsg, setSubmitMsg] = useState<{ text: string; ok: boolean } | null>(null)

  // Canvas refresh trigger
  const [refreshKey, setRefreshKey] = useState(0)
  const [canvasDate, setCanvasDate] = useState(todayStr())
  const [lastTxn, setLastTxn] = useState<unknown>(null)

  // Autocomplete search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!custQuery.trim()) { setSuggestions([]); return }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API}/api/customers/search?q=${encodeURIComponent(custQuery)}`)
        const json = await res.json()
        setSuggestions(json.customers || [])
        setShowDrop(true)
      } catch { /* ignore */ }
    }, 300)
  }, [custQuery])

  function selectCustomer(c: Customer) {
    setSelectedCustomer(c)
    setCustQuery(c.name)
    setShowDrop(false)
    setSuggestions([])
    setCommPct(String(c.default_charge_pct ?? 3))
    setSelectedCardId(null)
    setBankCard('')
  }

  function selectCard(card: Card) {
    setSelectedCardId(card.id)
    setBankCard(`${card.bank_name ?? ''} ...${card.last4 ?? ''}`.trim())
  }

  // Auto-calc swap amount = total * 1.02
  useEffect(() => {
    const t = parseFloat(totalAmount)
    if (!isNaN(t) && t > 0) setSwapAmount((t * 1.02).toFixed(2))
  }, [totalAmount])

  function resetForm() {
    setCustQuery('')
    setSelectedCustomer(null)
    setSuggestions([])
    setSelectedCardId(null)
    setBankCard('')
    setDate(todayStr())
    setTotalAmount('')
    setPaidAmount('')
    setAccountName('')
    setSwapAmount('')
    setSwapName('')
    setRemarks('Pending')
    setCommPct('3')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setSubmitMsg(null)
    try {
      const total = parseFloat(totalAmount)
      const paid = parseFloat(paidAmount)
      const comm = parseFloat(commPct) || 0
      const payload = {
        date,
        customer_id: selectedCustomer?.id,
        customer_name: selectedCustomer?.name ?? custQuery,
        bank_card: bankCard,
        total_amount: total,
        paid_amount: paid,
        account_name: accountName,
        swap_amount: parseFloat(swapAmount) || undefined,
        swap_name: swapName || undefined,
        remarks,
        status: remarks as 'Paid' | 'Unpaid' | 'Pending' | 'Puru',
        commission_pct: comm,
        commission_amount: parseFloat((total * comm / 100).toFixed(2)),
      }
      const res = await fetch(`${API}/api/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      setSubmitMsg({ text: 'Entry saved!', ok: true })
      setLastTxn(json.transaction)
      setRefreshKey(k => k + 1)
      resetForm()
      setTimeout(() => setSubmitMsg(null), 3000)
    } catch (e) {
      setSubmitMsg({ text: e instanceof Error ? e.message : 'Error', ok: false })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-[calc(100vh-32px)] overflow-hidden">
      {/* LEFT — Entry Form */}
      <div className="overflow-y-auto border-r border-gray-400" style={{ width: '40%', minWidth: 340 }}>
        <div className="p-3">
          <h2 className="text-sm font-bold mb-3">New Transaction Entry</h2>
          <form onSubmit={handleSubmit} className="space-y-2 text-sm">

            {/* 1. Customer Name autocomplete */}
            <div className="relative">
              <label className="block text-xs font-semibold mb-0.5">1. Customer Name *</label>
              <input
                type="text"
                value={custQuery}
                onChange={e => { setCustQuery(e.target.value); setSelectedCustomer(null) }}
                onFocus={() => suggestions.length > 0 && setShowDrop(true)}
                onBlur={() => setTimeout(() => setShowDrop(false), 150)}
                placeholder="Type to search..."
                className="w-full border border-gray-400 px-2 py-1 text-sm"
              />
              {showDrop && suggestions.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 border border-gray-400 bg-white max-h-36 overflow-y-auto">
                  {suggestions.map(c => (
                    <div
                      key={c.id}
                      onMouseDown={() => selectCustomer(c)}
                      className="px-2 py-1 hover:bg-gray-100 cursor-pointer"
                    >
                      <span className="font-medium">{c.name}</span>
                      {c.phone && <span className="text-gray-500 ml-2 text-xs">{c.phone}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Customer info box */}
            {selectedCustomer && (
              <div className="border border-gray-400 p-2 bg-gray-50 text-xs">
                <div className="flex gap-4 mb-1">
                  <span>Phone: <b>{selectedCustomer.phone || '—'}</b></span>
                  <span>Outstanding: <b>₹{(selectedCustomer.outstanding_balance || 0).toLocaleString('en-IN')}</b></span>
                  <span>Charge: <b>{selectedCustomer.default_charge_pct}%</b></span>
                </div>
                {selectedCustomer.cards?.length > 0 && (
                  <div>
                    <span className="font-semibold">Cards: </span>
                    {selectedCustomer.cards.filter(c => c.is_active).map(card => (
                      <button
                        key={card.id}
                        type="button"
                        onMouseDown={() => selectCard(card)}
                        className={`border px-2 py-0.5 mr-1 mb-1 text-xs ${selectedCardId === card.id ? 'border-black bg-gray-200 font-bold' : 'border-gray-400 hover:bg-gray-100'}`}
                      >
                        {card.bank_name} ...{card.last4}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 2. Date */}
            <div>
              <label className="block text-xs font-semibold mb-0.5">2. Date *</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required className="border border-gray-400 px-2 py-1 text-sm" />
            </div>

            {/* 3. Bank Card */}
            <div>
              <label className="block text-xs font-semibold mb-0.5">3. Bank Card</label>
              <input type="text" value={bankCard} onChange={e => setBankCard(e.target.value)} placeholder="Auto-fills from card" className="w-full border border-gray-400 px-2 py-1 text-sm" />
            </div>

            {/* 4 & 5. Total / Paid amounts */}
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs font-semibold mb-0.5">4. Total Amount *</label>
                <input type="number" step="0.01" value={totalAmount} onChange={e => setTotalAmount(e.target.value)} required placeholder="0.00" className="w-full border border-gray-400 px-2 py-1 text-sm" />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-semibold mb-0.5">5. Paid Amount *</label>
                <input type="number" step="0.01" value={paidAmount} onChange={e => setPaidAmount(e.target.value)} required placeholder="0.00" className="w-full border border-gray-400 px-2 py-1 text-sm" />
              </div>
            </div>

            {/* 6. Account Name */}
            <div>
              <label className="block text-xs font-semibold mb-0.5">6. Account Name *</label>
              <select value={accountName} onChange={e => setAccountName(e.target.value)} required className="w-full border border-gray-400 px-2 py-1 text-sm bg-white">
                <option value="">Select account...</option>
                {ACCOUNT_NAMES.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            {/* 7 & 8. Swap */}
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs font-semibold mb-0.5">7. Swap Amount</label>
                <input type="number" step="0.01" value={swapAmount} onChange={e => setSwapAmount(e.target.value)} placeholder="auto" className="w-full border border-gray-400 px-2 py-1 text-sm" />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-semibold mb-0.5">8. Swap Name</label>
                <input type="text" value={swapName} onChange={e => setSwapName(e.target.value)} placeholder="party name" className="w-full border border-gray-400 px-2 py-1 text-sm" />
              </div>
            </div>

            {/* 9 & 10. Remarks / Comm */}
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs font-semibold mb-0.5">9. Remarks</label>
                <select value={remarks} onChange={e => setRemarks(e.target.value)} className="w-full border border-gray-400 px-2 py-1 text-sm bg-white">
                  {['Paid', 'Unpaid', 'Pending', 'Puru'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-semibold mb-0.5">10. Commission %</label>
                <input type="number" step="0.01" value={commPct} onChange={e => setCommPct(e.target.value)} className="w-full border border-gray-400 px-2 py-1 text-sm" />
              </div>
            </div>

            {/* Computed preview */}
            {totalAmount && commPct && (
              <div className="text-xs text-gray-600 border border-gray-300 px-2 py-1 bg-gray-50">
                Comm: ₹{(parseFloat(totalAmount) * parseFloat(commPct) / 100).toFixed(2)} |
                Diff: ₹{(parseFloat(swapAmount || '0') - parseFloat(totalAmount)).toFixed(2)}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full border border-gray-600 bg-gray-100 px-3 py-1.5 text-sm font-semibold disabled:opacity-50 mt-2"
            >
              {submitting ? 'Submitting...' : 'Submit Entry'}
            </button>

            {submitMsg && (
              <p className={`text-sm font-medium ${submitMsg.ok ? 'text-green-700' : 'text-red-600'}`}>
                {submitMsg.text}
              </p>
            )}
          </form>
        </div>
      </div>

      {/* RIGHT — Excel Canvas */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b border-gray-400 px-2 py-1 flex items-center gap-2 text-xs">
          <span className="font-semibold">Canvas Date:</span>
          <input
            type="date"
            value={canvasDate}
            onChange={e => { setCanvasDate(e.target.value); setRefreshKey(k => k + 1) }}
            className="border border-gray-400 px-1 py-0.5 text-xs"
          />
        </div>
        <div className="flex-1 overflow-hidden">
          <LuckysheetCanvas key={refreshKey} date={canvasDate} newTransaction={lastTxn} />
        </div>
      </div>
    </div>
  )
}
