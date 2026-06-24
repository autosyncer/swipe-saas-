'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { addSwapToAcSheet, updateAcSheetCashType } from '@/lib/ac-sheet'
import { CheckCircle, Clock, RefreshCw, CreditCard, Wallet, Search, X } from 'lucide-react'

interface Transaction {
  id: string
  sr_no: number
  date: string
  customer_name: string
  bank_card: string
  account_name: string
  swap_name: string
  total_amount: number
  swap_amount: number
  paid_amount: number | null
  paid_in_cash: number | null
  cash_type: string | null
  payment_modes: { mode: string; amount: number; accountName?: string }[] | null
  commission_pct: number
  commission_type: string
  remarks: string
  entry_type: string
  created_at: string
}

function fmt(n: number) { return n.toLocaleString('en-IN') }
function fmtDate(d: string) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}
function fmtDateTime(iso: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
}

export default function SettlementPage() {
  const [swapPending, setSwapPending] = useState<Transaction[]>([])
  const [swapSettled, setSwapSettled] = useState<Transaction[]>([])
  const [acctPending, setAcctPending] = useState<Transaction[]>([])
  const [releaseTimeMap, setReleaseTimeMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [releasing, setReleasing] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const isReleasingRef = useRef(false)

  // SR search
  const [srInput, setSrInput] = useState('')
  const [srTxn, setSrTxn] = useState<Transaction | null>(null)
  const [srSearching, setSrSearching] = useState(false)
  const [srNotFound, setSrNotFound] = useState(false)
  const [settlingPartial, setSettlingPartial] = useState(false)
  const [partialAmount, setPartialAmount] = useState('')

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      // ── Card Swap: pending release ──
      const { data: released, error: relErr } = await supabase.from('swap_releases').select('transaction_id,created_at')
      if (relErr) { console.error('[Settlement] swap_releases fetch error:', relErr); showToast('Failed to load release data — refresh to retry', 'error') }
      const releasedIds = new Set((released || []).map((r: { transaction_id: string }) => r.transaction_id))
      const releaseTimeMap = Object.fromEntries((released || []).map((r: { transaction_id: string; created_at: string }) => [r.transaction_id, r.created_at]))

      const { data: swaps } = await supabase
        .from('transactions')
        .select('*')
        .eq('entry_type', 'swap')
        .order('created_at', { ascending: false })

      setReleaseTimeMap(releaseTimeMap)
      setSwapPending(((swaps || []).filter((t: Transaction) => !releasedIds.has(t.id))) as Transaction[])
      setSwapSettled(((swaps || []).filter((t: Transaction) => releasedIds.has(t.id)).slice(0, 20)) as Transaction[])

      // ── Account Settlement: any transaction with paid_amount < total_amount ──
      const { data: allTxns } = await supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false })

      const pendingPayment = (allTxns || []).filter((t: Transaction) => {
        const total = Number(t.total_amount || 0)
        const paid = Number(t.paid_amount || 0)
        const settled = t.remarks === 'PAID' || t.remarks === 'SE'
        return total > 0 && paid < total && !settled
      })
      setAcctPending(pendingPayment as Transaction[])
    } catch (e) {
      console.error('[Settlement] fetch error:', e)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    const ch = supabase
      .channel('settlement-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions' }, () => {
        if (!isReleasingRef.current) fetchAll()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'swap_releases' }, () => {
        if (!isReleasingRef.current) fetchAll()
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchAll])

  async function handleRelease(txn: Transaction) {
    if (isReleasingRef.current) return
    isReleasingRef.current = true
    setReleasing(txn.id)
    setSwapPending(prev => prev.filter(t => t.id !== txn.id))

    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('swap_releases').insert({ transaction_id: txn.id, settled_by: user?.id ?? null })
      if (error) {
        // Duplicate key = already released, treat as success and refresh
        if (error.code === '23505') {
          await fetchAll()
          showToast(`SR #${txn.sr_no} already released`, 'success')
          return
        }
        setSwapPending(prev => [txn, ...prev])
        showToast('Release failed: ' + error.message, 'error')
        return
      }
      await supabase.from('transactions').update({ release_status: 'released' }).eq('id', txn.id)
      const swapAmt = txn.swap_amount || txn.total_amount
      await addSwapToAcSheet({ date: txn.date, account_name: txn.account_name, swap_amount: swapAmt })
      if (txn.cash_type && txn.cash_type !== 'CASH' && txn.paid_in_cash) {
        const accounts = (txn.account_name || '').split(/[+,]/).map(a => a.trim()).filter(Boolean)
        for (const acc of accounts) {
          await updateAcSheetCashType({ date: txn.date, account_name: acc, cashType: txn.cash_type, amount: txn.paid_in_cash })
        }
      }
      showToast(`SR #${txn.sr_no} released — ₹${fmt(swapAmt)} added to ${txn.account_name}`)
    } catch (e) {
      showToast('Error: ' + String(e), 'error')
      setSwapPending(prev => [txn, ...prev])
    } finally {
      setReleasing(null)
      isReleasingRef.current = false
    }
  }

  async function markAccountPaid(txn: Transaction) {
    const today = new Date().toISOString().split('T')[0]
    const total = Number(txn.total_amount || 0)

    // 1. transactions
    const { error } = await supabase
      .from('transactions')
      .update({ paid_amount: total, remarks: 'PAID', status: 'Paid' })
      .eq('id', txn.id)
    if (error) { showToast('Update failed: ' + error.message, 'error'); return }

    // 2. chamunda_sheet
    await supabase
      .from('chamunda_sheet')
      .update({ paid_amount: total })
      .eq('transaction_id', txn.id)

    // 3. customer_sheet
    await supabase
      .from('customer_sheet')
      .update({ paid_amount: total, paid_remaining: 0, paid_date: today })
      .eq('transaction_id', txn.id)

    // 4. cc_sheet
    await supabase
      .from('cc_sheet')
      .update({ status: 'Paid' })
      .eq('transaction_id', txn.id)

    // 5. commission_sheet — only update if Deferred (was Pending)
    await supabase
      .from('commission_sheet')
      .update({ status: 'Paid', paid_date: today, paid_amount: Number(txn.total_amount) })
      .eq('transaction_id', txn.id)
      .eq('status', 'Pending')

    setAcctPending(prev => prev.filter(t => t.id !== txn.id))
    showToast(`SR #${txn.sr_no} marked as fully paid across all sheets`)
  }

  async function searchBySr() {
    if (!srInput.trim()) return
    setSrSearching(true); setSrNotFound(false); setSrTxn(null); setPartialAmount('')
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .eq('sr_no', parseInt(srInput))
      .maybeSingle()
    setSrSearching(false)
    if (!data) { setSrNotFound(true); return }
    setSrTxn(data as Transaction)
  }

  async function settleSrFull() {
    if (!srTxn) return
    const today = new Date().toISOString().split('T')[0]
    const total = Number(srTxn.total_amount || 0)
    setSettlingPartial(true)
    const { error } = await supabase.from('transactions')
      .update({ paid_amount: total, remarks: 'PAID', status: 'Paid' }).eq('id', srTxn.id)
    if (error) { showToast('Failed: ' + error.message, 'error'); setSettlingPartial(false); return }
    await supabase.from('customer_sheet').update({ paid_amount: total, paid_remaining: 0, paid_date: today }).eq('transaction_id', srTxn.id)
    await supabase.from('commission_sheet').update({ status: 'Paid', paid_date: today, paid_amount: total }).eq('transaction_id', srTxn.id).eq('status', 'Pending')
    setSrTxn(prev => prev ? { ...prev, paid_amount: total, remarks: 'PAID' } : prev)
    setAcctPending(prev => prev.filter(t => t.id !== srTxn.id))
    showToast(`SR #${srTxn.sr_no} fully settled`)
    setSettlingPartial(false)
  }

  async function settleSrPartial() {
    if (!srTxn || !partialAmount) return
    const amt = parseFloat(partialAmount) || 0
    if (amt <= 0) { showToast('Enter a valid amount', 'error'); return }
    const prevPaid = Number(srTxn.paid_amount || 0)
    const newPaid = prevPaid + amt
    const total = Number(srTxn.total_amount || 0)
    const fullyPaid = newPaid >= total
    const today = new Date().toISOString().split('T')[0]
    setSettlingPartial(true)
    const { error } = await supabase.from('transactions')
      .update({ paid_amount: newPaid, remarks: fullyPaid ? 'PAID' : 'PEND', status: fullyPaid ? 'Paid' : 'Pending' }).eq('id', srTxn.id)
    if (error) { showToast('Failed: ' + error.message, 'error'); setSettlingPartial(false); return }
    if (fullyPaid) {
      await supabase.from('customer_sheet').update({ paid_amount: newPaid, paid_remaining: 0, paid_date: today }).eq('transaction_id', srTxn.id)
      await supabase.from('commission_sheet').update({ status: 'Paid', paid_date: today, paid_amount: total }).eq('transaction_id', srTxn.id).eq('status', 'Pending')
    }
    setSrTxn(prev => prev ? { ...prev, paid_amount: newPaid, remarks: fullyPaid ? 'PAID' : 'PEND' } : prev)
    if (fullyPaid) setAcctPending(prev => prev.filter(t => t.id !== srTxn.id))
    setPartialAmount('')
    showToast(fullyPaid ? `SR #${srTxn.sr_no} fully settled` : `₹${fmt(amt)} recorded — ₹${fmt(total - newPaid)} still pending`)
    setSettlingPartial(false)
  }

  const swapSection = (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg" style={{ background: '#eff6ff' }}>
          <CreditCard size={15} color="#1d4ed8" />
        </div>
        <h2 className="text-sm font-bold text-[#1a1a1a] uppercase tracking-wide">Card Swap Settlement</h2>
        {swapPending.length > 0 && (
          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: '#fef9c3', color: '#92400e' }}>
            {swapPending.length} pending
          </span>
        )}
      </div>

      {swapPending.length === 0 ? (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm text-[#6b7280]"
          style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <CheckCircle size={16} color="#16a34a" />
          All card swaps released
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {swapPending.map(txn => {
            const swapAmt = txn.swap_amount || txn.total_amount
            const paidAmt = Number(txn.paid_amount || 0)
            const pendingAmt = swapAmt - paidAmt
            return (
              <div key={txn.id} className="bg-white rounded-xl border p-4 flex items-center justify-between gap-4"
                style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="flex-shrink-0 rounded-full flex items-center justify-center"
                    style={{ width: 34, height: 34, background: '#eff6ff', border: '1.5px solid #bfdbfe' }}>
                    <Clock size={15} color="#1d4ed8" />
                  </div>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-[#1a1a1a] text-sm">{txn.customer_name}</span>
                      <span className="text-xs text-[#6b7280]">SR #{txn.sr_no}</span>
                      <span className="text-xs text-[#6b7280]">{fmtDate(txn.date)}</span>
                      {txn.bank_card && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#f3f4f6] text-[#374151]">{txn.bank_card}</span>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[#6b7280] flex-wrap">
                      <span>Account: <span className="font-medium text-[#374151]">{txn.account_name}</span></span>
                      <span>Machine: <span className="font-medium text-[#374151]">{txn.swap_name || '—'}</span></span>
                      <span>Comm: <span className="font-medium text-[#374151]">{txn.commission_pct}% {txn.commission_type}</span></span>
                    </div>
                    <div className="flex items-center gap-4 text-[11px] text-[#9ca3af] mt-0.5">
                      <span>🕐 Swap: <span className="text-[#374151] font-medium">{fmtDateTime(txn.created_at)}</span></span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <div className="text-[10px] text-[#9ca3af]">Swap Amt</div>
                    <div className="text-sm font-bold text-[#1a1a1a]">₹{fmt(swapAmt)}</div>
                  </div>
                  {pendingAmt > 0 && (
                    <div className="text-right">
                      <div className="text-[10px] text-[#9ca3af]">Pending</div>
                      <div className="text-sm font-bold" style={{ color: '#dc2626' }}>₹{fmt(pendingAmt)}</div>
                    </div>
                  )}
                  <button onClick={() => handleRelease(txn)} disabled={releasing === txn.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                    style={{ background: releasing === txn.id ? '#9ca3af' : '#3ECF8E', color: '#fff', cursor: releasing === txn.id ? 'not-allowed' : 'pointer' }}>
                    <CheckCircle size={13} />
                    {releasing === txn.id ? 'Releasing...' : 'Confirm & Release'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  const settledSection = swapSettled.length > 0 && (
    <div className="mt-6">
      <div className="flex items-center gap-2 mb-3">
        <CheckCircle size={16} color="#16a34a" />
        <span className="text-sm font-bold text-[#1a1a1a] uppercase tracking-wide">Recently Settled</span>
        <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: '#d1fae5', color: '#065f46' }}>{swapSettled.length}</span>
      </div>
      <div className="flex flex-col gap-3">
        {swapSettled.map(txn => {
          const swapAmt = Number(txn.swap_amount || txn.total_amount || 0)
          const settledAt = releaseTimeMap[txn.id]
          return (
            <div key={txn.id} className="bg-white rounded-xl border p-4"
              style={{ borderColor: '#bbf7d0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="flex-shrink-0 rounded-full flex items-center justify-center"
                    style={{ width: 34, height: 34, background: '#f0fdf4', border: '1.5px solid #86efac' }}>
                    <CheckCircle size={15} color="#16a34a" />
                  </div>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-[#1a1a1a] text-sm">{txn.customer_name}</span>
                      <span className="text-xs text-[#6b7280]">SR #{txn.sr_no}</span>
                      {txn.bank_card && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#f3f4f6] text-[#374151]">{txn.bank_card}</span>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[#6b7280] flex-wrap">
                      <span>Account: <span className="font-medium text-[#374151]">{txn.account_name}</span></span>
                      <span>Machine: <span className="font-medium text-[#374151]">{txn.swap_name || '—'}</span></span>
                      <span>Comm: <span className="font-medium text-[#374151]">{txn.commission_pct}% {txn.commission_type}</span></span>
                    </div>
                    <div className="flex gap-4 text-[11px] mt-0.5 flex-wrap">
                      <span className="text-[#9ca3af]">🕐 Swap: <span className="text-[#374151] font-medium">{fmtDateTime(txn.created_at)}</span></span>
                      {settledAt && <span className="text-[#9ca3af]">✅ Settled: <span className="text-[#16a34a] font-medium">{fmtDateTime(settledAt)}</span></span>}
                    </div>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-[10px] text-[#9ca3af]">Swap Amt</div>
                  <div className="text-sm font-bold text-[#1a1a1a]">₹{fmt(swapAmt)}</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  const acctSection = (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg" style={{ background: '#fff7ed' }}>
          <Wallet size={15} color="#c2410c" />
        </div>
        <h2 className="text-sm font-bold text-[#1a1a1a] uppercase tracking-wide">Account Settlement</h2>
        {acctPending.length > 0 && (
          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: '#fef2f2', color: '#991b1b' }}>
            {acctPending.length} pending
          </span>
        )}
      </div>

      {acctPending.length === 0 ? (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm text-[#6b7280]"
          style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <CheckCircle size={16} color="#16a34a" />
          All accounts settled
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {acctPending.map(txn => {
            const total = Number(txn.total_amount || 0)
            const paid = Number(txn.paid_amount || 0)
            const pendingAmt = total - paid
            const modes = txn.payment_modes || []
            return (
              <div key={txn.id} className="bg-white rounded-xl border p-4 flex items-center justify-between gap-4"
                style={{ borderColor: '#fee2e2', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="flex-shrink-0 rounded-full flex items-center justify-center"
                    style={{ width: 34, height: 34, background: '#fef2f2', border: '1.5px solid #fecaca' }}>
                    <Clock size={15} color="#dc2626" />
                  </div>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-[#1a1a1a] text-sm">{txn.customer_name}</span>
                      <span className="text-xs text-[#6b7280]">SR #{txn.sr_no}</span>
                      <span className="text-xs text-[#6b7280]">{fmtDate(txn.date)}</span>
                      {txn.bank_card && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#f3f4f6] text-[#374151]">{txn.bank_card}</span>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[#6b7280] flex-wrap">
                      <span>Account: <span className="font-medium text-[#374151]">{txn.account_name}</span></span>
                      {modes.length > 0 && (
                        <span className="flex gap-1">
                          {modes.map((m, i) => (
                            <span key={i} className="px-1.5 py-0.5 rounded font-semibold text-[10px]"
                              style={{ background: '#f3f4f6', color: '#374151' }}>
                              {m.mode} ₹{fmt(m.amount)}
                            </span>
                          ))}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <div className="text-[10px] text-[#9ca3af]">Total</div>
                    <div className="text-sm font-bold text-[#1a1a1a]">₹{fmt(total)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-[#9ca3af]">Paid</div>
                    <div className="text-sm font-bold" style={{ color: '#16a34a' }}>₹{fmt(paid)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-[#9ca3af]">Pending</div>
                    <div className="text-sm font-bold" style={{ color: '#dc2626' }}>₹{fmt(pendingAmt)}</div>
                  </div>
                  <button onClick={() => markAccountPaid(txn)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                    style={{ background: '#f97316', color: '#fff' }}>
                    <CheckCircle size={13} /> Mark Paid
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-sm font-medium shadow-lg"
          style={{ background: toast.type === 'success' ? '#3ECF8E' : '#ef4444', color: '#fff', maxWidth: 400 }}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#1a1a1a]">Settlement</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">Card swap releases & pending payment settlements</p>
        </div>
        <button onClick={fetchAll} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border"
          style={{ borderColor: '#e5e7eb', color: '#6b7280' }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* SR Search */}
      <div className="mb-6 rounded-xl border p-4" style={{ borderColor: '#e5e7eb', background: '#fafafa' }}>
        <div className="flex items-center gap-2 mb-3">
          <Search size={15} color="#6b7280" />
          <span className="text-sm font-bold text-[#1a1a1a]">Search by SR Number</span>
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            placeholder="Enter SR No..."
            value={srInput}
            onChange={e => { setSrInput(e.target.value); setSrTxn(null); setSrNotFound(false) }}
            onKeyDown={e => e.key === 'Enter' && searchBySr()}
            className="border rounded-lg px-3 py-2 text-sm outline-none focus:border-[#3ECF8E] w-40"
            style={{ borderColor: '#e5e7eb' }}
          />
          <button onClick={searchBySr} disabled={srSearching}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: '#3ECF8E', opacity: srSearching ? 0.6 : 1 }}>
            {srSearching ? 'Searching…' : 'Search'}
          </button>
          {srTxn && (
            <button onClick={() => { setSrTxn(null); setSrInput(''); setSrNotFound(false) }}
              className="p-2 rounded-lg border hover:bg-gray-100"
              style={{ borderColor: '#e5e7eb' }}>
              <X size={14} color="#6b7280" />
            </button>
          )}
        </div>

        {srNotFound && (
          <div className="mt-3 text-sm text-[#ef4444]">No transaction found for SR #{srInput}</div>
        )}

        {srTxn && (() => {
          const total = Number(srTxn.total_amount || 0)
          const paid = Number(srTxn.paid_amount || 0)
          const pending = total - paid
          const commAmt = Number(srTxn.commission_pct || 0) * total / 100
          const isFullyPaid = srTxn.remarks === 'PAID' || paid >= total
          return (
            <div className="mt-3 rounded-xl border p-4" style={{ borderColor: isFullyPaid ? '#bbf7d0' : '#fecaca', background: isFullyPaid ? '#f0fdf4' : '#fff' }}>
              {/* Header */}
              <div className="flex items-center gap-3 flex-wrap mb-3">
                <span className="font-bold text-[#1a1a1a]">{srTxn.customer_name}</span>
                <span className="text-xs text-[#6b7280]">SR #{srTxn.sr_no}</span>
                <span className="text-xs text-[#6b7280]">{fmtDate(srTxn.date)}</span>
                {srTxn.bank_card && <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#f3f4f6] text-[#374151]">{srTxn.bank_card}</span>}
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                  style={{ background: isFullyPaid ? '#d1fae5' : '#fef9c3', color: isFullyPaid ? '#065f46' : '#92400e' }}>
                  {isFullyPaid ? '✓ Settled' : srTxn.remarks}
                </span>
              </div>

              {/* Amounts row */}
              <div className="flex gap-6 text-sm mb-3 flex-wrap">
                <div><div className="text-[10px] text-[#9ca3af] mb-0.5">Total Amount</div><div className="font-bold">₹{fmt(total)}</div></div>
                <div><div className="text-[10px] text-[#9ca3af] mb-0.5">Paid</div><div className="font-bold" style={{ color: '#16a34a' }}>₹{fmt(paid)}</div></div>
                <div><div className="text-[10px] text-[#9ca3af] mb-0.5">Pending</div><div className="font-bold" style={{ color: pending > 0 ? '#dc2626' : '#16a34a' }}>₹{fmt(pending)}</div></div>
                <div><div className="text-[10px] text-[#9ca3af] mb-0.5">Commission</div><div className="font-bold" style={{ color: '#7c3aed' }}>{srTxn.commission_pct}% — ₹{fmt(Math.round(commAmt))}</div></div>
                <div><div className="text-[10px] text-[#9ca3af] mb-0.5">Comm Type</div><div className="font-bold text-[#374151]">{srTxn.commission_type}</div></div>
              </div>
              <div className="flex gap-6 text-[11px] text-[#9ca3af] mb-4 flex-wrap">
                <span>🕐 Swap: <span className="text-[#374151] font-medium">{fmtDateTime(srTxn.created_at)}</span></span>
                {releaseTimeMap[srTxn.id] && (
                  <span>✅ Settled: <span className="text-[#16a34a] font-medium">{fmtDateTime(releaseTimeMap[srTxn.id])}</span></span>
                )}
              </div>

              {!isFullyPaid && (
                <div className="flex flex-col gap-3">
                  {/* Full settle */}
                  <div className="flex items-center gap-3">
                    <button onClick={settleSrFull} disabled={settlingPartial}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white"
                      style={{ background: '#16a34a', opacity: settlingPartial ? 0.6 : 1 }}>
                      <CheckCircle size={14} /> Settle Full Amount (₹{fmt(pending)})
                    </button>
                  </div>

                  {/* Partial settle */}
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder={`Partial amount (max ₹${fmt(pending)})`}
                      value={partialAmount}
                      onChange={e => setPartialAmount(e.target.value)}
                      className="border rounded-lg px-3 py-2 text-sm outline-none focus:border-[#3ECF8E] w-56"
                      style={{ borderColor: '#e5e7eb' }}
                    />
                    <button onClick={settleSrPartial} disabled={settlingPartial || !partialAmount}
                      className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                      style={{ background: '#f97316', opacity: (settlingPartial || !partialAmount) ? 0.6 : 1 }}>
                      Settle Partial
                    </button>
                  </div>
                </div>
              )}

              {isFullyPaid && (
                <div className="flex items-center gap-2 text-sm text-[#16a34a] font-semibold">
                  <CheckCircle size={15} /> All amounts settled for this transaction
                </div>
              )}
            </div>
          )
        })()}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-sm text-[#9ca3af]">Loading...</div>
      ) : (
        <>
          {swapSection}
          {settledSection}
          <div style={{ height: 1, background: '#e5e7eb', marginTop: 24, marginBottom: 24 }} />
          {acctSection}
        </>
      )}
    </div>
  )
}
