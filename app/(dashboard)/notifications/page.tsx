'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { addSwapToAcSheet, updateAcSheetCashType } from '@/lib/ac-sheet'
import { CheckCircle, Clock, RefreshCw } from 'lucide-react'

interface PendingSwap {
  id: string
  sr_no: number
  date: string
  customer_name: string
  bank_card: string
  account_name: string
  swap_name: string
  total_amount: number
  swap_amount: number
  paid_in_cash: number | null
  cash_type: string | null
  commission_pct: number
  commission_type: string
  remarks: string
  created_at: string
}

function fmt(n: number) { return n.toLocaleString('en-IN') }
function fmtDate(d: string) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

export default function NotificationsPage() {
  const [pending, setPending] = useState<PendingSwap[]>([])
  const [loading, setLoading] = useState(true)
  const [releasing, setReleasing] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const isReleasingRef = useRef(false)

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const fetchPending = useCallback(async () => {
    setLoading(true)
    try {
      // Fetch all swap transactions then exclude those in swap_releases
      const { data: released } = await supabase
        .from('swap_releases')
        .select('transaction_id')

      const releasedIds = new Set((released || []).map((r: { transaction_id: string }) => r.transaction_id))

      const { data: swaps, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('entry_type', 'swap')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('[Notifications] fetch error:', error.message)
        setPending([])
      } else {
        const pending = (swaps || []).filter((t: PendingSwap) => !releasedIds.has(t.id))
        setPending(pending as PendingSwap[])
      }
    } catch (e) {
      console.error('[Notifications] exception:', e)
      setPending([])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchPending() }, [fetchPending])

  useEffect(() => {
    const ch = supabase
      .channel('notifications-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions' }, () => {
        if (!isReleasingRef.current) fetchPending()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'swap_releases' }, () => {
        if (!isReleasingRef.current) fetchPending()
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchPending])

  async function handleRelease(txn: PendingSwap) {
    if (isReleasingRef.current) return
    isReleasingRef.current = true
    setReleasing(txn.id)

    // Remove from UI immediately
    setPending(prev => prev.filter(t => t.id !== txn.id))

    try {
      // Mark as released by inserting into swap_releases table
      const { error } = await supabase
        .from('swap_releases')
        .insert({ transaction_id: txn.id })

      if (error) {
        // Rollback UI
        setPending(prev => [txn, ...prev])
        showToast('Release failed: ' + error.message, 'error')
        return
      }

      // Also update release_status column (best-effort, ignore error)
      await supabase.from('transactions').update({ release_status: 'released' }).eq('id', txn.id)

      // ADD swap amount to account (card swap = money coming IN)
      const swapAmt = txn.swap_amount || txn.total_amount
      await addSwapToAcSheet({ date: txn.date, account_name: txn.account_name, swap_amount: swapAmt })

      // Update cash type display column if applicable
      if (txn.cash_type && txn.cash_type !== 'CASH' && txn.paid_in_cash) {
        const accounts = (txn.account_name || '').split(/[+,]/).map(a => a.trim()).filter(Boolean)
        for (const acc of accounts) {
          await updateAcSheetCashType({ date: txn.date, account_name: acc, cashType: txn.cash_type, amount: txn.paid_in_cash })
        }
      }

      showToast(`SR #${txn.sr_no} released — ₹${fmt(swapAmt)} added to ${txn.account_name}`)
    } catch (e) {
      showToast('Error: ' + String(e), 'error')
      setPending(prev => [txn, ...prev]) // rollback
    } finally {
      setReleasing(null)
      isReleasingRef.current = false
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-sm font-medium shadow-lg"
          style={{ background: toast.type === 'success' ? '#3ECF8E' : '#ef4444', color: '#fff', maxWidth: 400 }}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#1a1a1a]">Notifications</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">Card Swap transactions pending confirmation & release</p>
        </div>
        <button onClick={fetchPending} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border"
          style={{ borderColor: '#e5e7eb', color: '#6b7280' }}>
          <RefreshCw size={13} />Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-sm text-[#9ca3af]">Loading...</div>
      ) : pending.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-56 gap-3">
          <CheckCircle size={40} color="#3ECF8E" />
          <p className="text-sm font-medium text-[#6b7280]">All caught up — no pending releases</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {pending.map(txn => (
            <div key={txn.id} className="bg-white rounded-xl border p-4 flex items-center justify-between gap-4"
              style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="flex-shrink-0 rounded-full flex items-center justify-center mt-0.5"
                  style={{ width: 36, height: 36, background: '#fef9c3', border: '1.5px solid #facc15' }}>
                  <Clock size={16} color="#b45309" />
                </div>
                <div className="flex flex-col gap-1 min-w-0">
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
                    {txn.cash_type && txn.paid_in_cash
                      ? <span className="px-1.5 py-0.5 rounded bg-[#fef9c3] text-[#713f12] font-semibold">{txn.cash_type}: ₹{fmt(txn.paid_in_cash)}</span>
                      : null}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 flex-shrink-0">
                <div className="text-right">
                  <div className="text-xs text-[#9ca3af]">Swap Amount</div>
                  <div className="text-base font-bold text-[#1a1a1a]">₹{fmt(txn.swap_amount || txn.total_amount)}</div>
                </div>
                <button
                  onClick={() => handleRelease(txn)}
                  disabled={releasing === txn.id}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold"
                  style={{
                    background: releasing === txn.id ? '#9ca3af' : '#3ECF8E',
                    color: '#fff',
                    cursor: releasing === txn.id ? 'not-allowed' : 'pointer',
                  }}
                >
                  <CheckCircle size={14} />
                  {releasing === txn.id ? 'Releasing...' : 'Confirm & Release'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
