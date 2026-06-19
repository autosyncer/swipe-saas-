'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { addSwapToAcSheet, updateAcSheetCashType } from '@/lib/ac-sheet'
import { CheckCircle, Clock, RefreshCw, CreditCard, Wallet } from 'lucide-react'

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

export default function SettlementPage() {
  const [swapPending, setSwapPending] = useState<Transaction[]>([])
  const [acctPending, setAcctPending] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [releasing, setReleasing] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const isReleasingRef = useRef(false)

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      // ── Card Swap: pending release ──
      const { data: released } = await supabase.from('swap_releases').select('transaction_id')
      const releasedIds = new Set((released || []).map((r: { transaction_id: string }) => r.transaction_id))

      const { data: swaps } = await supabase
        .from('transactions')
        .select('*')
        .eq('entry_type', 'swap')
        .order('created_at', { ascending: false })

      setSwapPending(((swaps || []).filter((t: Transaction) => !releasedIds.has(t.id))) as Transaction[])

      // ── Account Settlement: any transaction with paid_amount < total_amount ──
      const { data: allTxns } = await supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false })

      const pendingPayment = (allTxns || []).filter((t: Transaction) => {
        const total = Number(t.total_amount || 0)
        const paid = Number(t.paid_amount || 0)
        return total > 0 && paid < total
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
      const { error } = await supabase.from('swap_releases').insert({ transaction_id: txn.id })
      if (error) {
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
    const { error } = await supabase
      .from('transactions')
      .update({ paid_amount: txn.total_amount, remarks: 'PAID', status: 'Paid' })
      .eq('id', txn.id)
    if (error) { showToast('Update failed: ' + error.message, 'error'); return }
    setAcctPending(prev => prev.filter(t => t.id !== txn.id))
    showToast(`SR #${txn.sr_no} marked as fully paid`)
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

      {loading ? (
        <div className="flex items-center justify-center h-40 text-sm text-[#9ca3af]">Loading...</div>
      ) : (
        <>
          {swapSection}
          <div style={{ height: 1, background: '#e5e7eb', marginBottom: 24 }} />
          {acctSection}
        </>
      )}
    </div>
  )
}
