'use client'

import { useState, useEffect, useCallback } from 'react'
import { Download, RefreshCw, X, Printer } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Transaction } from '@/types/database'
import dynamic from 'next/dynamic'
import { transactionToReceiptProps } from '@/components/receipt/useReceiptData'
import type { PaymentReceiptProps } from '@/components/receipt/PaymentReceipt'

const PaymentReceiptModal = dynamic(() => import('@/components/receipt/PaymentReceiptModal'), { ssr: false })

const ACCOUNTS = ['All', 'NSS', 'SKT', 'RT', 'KTC', 'TAP', 'BGM', 'NTC', 'MAHA', 'MAL', 'MAP', 'HASTI', 'MGS', 'MNS', 'TAPI', 'FDRL', 'BOB', 'INDUS', 'YES', 'INSTA']

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    Paid: { bg: '#d1fae5', color: '#065f46' },
    Unpaid: { bg: '#fee2e2', color: '#991b1b' },
    Pending: { bg: '#fef3c7', color: '#92400e' },
    Puru: { bg: '#dbeafe', color: '#1e40af' },
    Cancel: { bg: '#f3f4f6', color: '#374151' },
  }
  const s = map[status] || { bg: '#f3f4f6', color: '#374151' }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: s.bg, color: s.color }}>
      {status}
    </span>
  )
}

export default function TransactionsPage() {
  const today = new Date().toISOString().split('T')[0]
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
  const [fromDate, setFromDate] = useState(weekAgo)
  const [toDate, setToDate] = useState(today)
  const [statusFilter, setStatusFilter] = useState('All')
  const [accountFilter, setAccountFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [txns, setTxns] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Transaction | null>(null)
  const [receiptData, setReceiptData] = useState<PaymentReceiptProps | null>(null)

  const fetchTxns = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('transactions')
      .select('*')
      .gte('date', fromDate)
      .lte('date', toDate)
      .order('sr_no', { ascending: false })
      .limit(500)

    if (statusFilter !== 'All') query = query.eq('remarks', statusFilter)
    if (accountFilter !== 'All') query = query.ilike('account_name', `%${accountFilter}%`)

    const { data } = await query
    let rows = (data as Transaction[]) || []
    if (search) rows = rows.filter(t =>
      t.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      t.bank_card.toLowerCase().includes(search.toLowerCase())
    )
    setTxns(rows)
    setLoading(false)
  }, [fromDate, toDate, statusFilter, accountFilter, search])

  useEffect(() => { fetchTxns() }, [fetchTxns])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-[#1a1a1a]">
          Transactions
          {!loading && <span className="ml-2 text-sm font-normal text-[#6b7280]">({txns.length})</span>}
        </h1>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-1">
          <label className="text-xs text-[#6b7280]">From</label>
          <input type="date" className="rounded-md border px-2 py-1.5 text-sm outline-none focus:border-[#3ECF8E]"
            style={{ borderColor: '#e5e7eb' }} value={fromDate} onChange={e => setFromDate(e.target.value)} />
        </div>
        <div className="flex items-center gap-1">
          <label className="text-xs text-[#6b7280]">To</label>
          <input type="date" className="rounded-md border px-2 py-1.5 text-sm outline-none focus:border-[#3ECF8E]"
            style={{ borderColor: '#e5e7eb' }} value={toDate} onChange={e => setToDate(e.target.value)} />
        </div>
        <select className="rounded-md border px-2 py-1.5 text-sm outline-none bg-white" style={{ borderColor: '#e5e7eb' }}
          value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          {['All', 'Paid', 'Unpaid', 'Pending', 'Puru', 'Cancel'].map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="rounded-md border px-2 py-1.5 text-sm outline-none bg-white" style={{ borderColor: '#e5e7eb' }}
          value={accountFilter} onChange={e => setAccountFilter(e.target.value)}>
          {ACCOUNTS.map(a => <option key={a}>{a}</option>)}
        </select>
        <input
          className="rounded-md border px-3 py-1.5 text-sm outline-none focus:border-[#3ECF8E]"
          style={{ borderColor: '#e5e7eb' }}
          placeholder="Search customer / card..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="flex-1" />
        <button
          className="flex items-center gap-1 px-3 py-1.5 rounded-md border text-sm"
          style={{ borderColor: '#e5e7eb' }}
          onClick={async () => {
            const { default: A4 } = await import('@/components/receipt/PaymentReceiptA4')
            const { createRoot } = await import('react-dom/client')
            const { createElement } = await import('react')
            const win = window.open('', '_blank', 'width=900,height=700')
            if (!win) return
            const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).map(el => el.outerHTML).join('\n')
            win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">${styles}</head><body style="margin:0;padding:0;background:#fff"></body></html>`)
            win.document.close()
            const receiptProps = await Promise.all(txns.slice(0, 4).map(t => transactionToReceiptProps(t)))
            createRoot(win.document.body).render(createElement(A4, { transactions: receiptProps }))
            setTimeout(() => { win.focus(); win.print(); win.close() }, 600)
          }}
        >
          <Printer size={14} /> Print 4
        </button>
        <button className="flex items-center gap-1 px-3 py-1.5 rounded-md border text-sm" style={{ borderColor: '#e5e7eb' }}>
          <Download size={14} /> Export
        </button>
        <button onClick={fetchTxns} className="p-1.5 rounded-md border hover:bg-gray-50" style={{ borderColor: '#e5e7eb' }}>
          <RefreshCw size={16} color="#6b7280" className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border overflow-x-auto" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        {loading ? (
          <div className="flex items-center justify-center h-32 text-sm text-[#6b7280]">Loading...</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[#f9f9f9]">
              <tr>
                {['SR', 'Date', 'Customer', 'Bank Card', 'Total Amt', 'Paid Amt', 'A/C Name', 'Swap Amt', 'Swap Name', 'Diff', 'Remarks', ''].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-[#6b7280] uppercase border-b border-[#e5e7eb] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {txns.length === 0 ? (
                <tr><td colSpan={11} className="px-4 py-8 text-center text-sm text-[#6b7280]">No data yet</td></tr>
              ) : txns.map(t => (
                <tr key={t.id} className="border-b border-[#e5e7eb] hover:bg-gray-50 cursor-pointer" onClick={() => setSelected(t)}>
                  <td className="px-3 py-2.5 text-[#6b7280]">{t.sr_no}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{t.date}</td>
                  <td className="px-3 py-2.5 font-medium whitespace-nowrap">{t.customer_name}</td>
                  <td className="px-3 py-2.5 text-[#6b7280] whitespace-nowrap">{t.bank_card}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">₹{t.total_amount.toLocaleString('en-IN')}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">₹{t.paid_amount.toLocaleString('en-IN')}</td>
                  <td className="px-3 py-2.5 text-[#6b7280]">{t.account_name}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">₹{t.swap_amount.toLocaleString('en-IN')}</td>
                  <td className="px-3 py-2.5 text-[#6b7280]">{t.swap_name}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: (t.difference || 0) < 0 ? '#ef4444' : '#22c55e' }}>
                    {t.difference != null ? `₹${t.difference.toLocaleString('en-IN')}` : '—'}
                  </td>
                  <td className="px-3 py-2.5"><StatusBadge status={t.remarks} /></td>
                  <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    <button
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-[#e5e7eb] hover:bg-gray-50 whitespace-nowrap"
                      onClick={async () => setReceiptData(await transactionToReceiptProps(t))}
                    >
                      <Printer size={11} /> Receipt
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Receipt modal — single transaction */}
      {receiptData && (
        <PaymentReceiptModal receiptData={receiptData} onClose={() => setReceiptData(null)} />
      )}


      {/* Detail panel */}
      {selected && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setSelected(null)} />
          <div className="fixed right-0 top-0 h-full bg-white z-50 flex flex-col" style={{ width: 400, boxShadow: '-4px 0 20px rgba(0,0,0,0.12)' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5e7eb]">
              <h2 className="font-semibold text-[#1a1a1a]">Transaction Details</h2>
              <button onClick={() => setSelected(null)} className="p-1 hover:bg-gray-100 rounded">
                <X size={18} color="#6b7280" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="flex flex-col gap-3">
                {([
                  ['SR No.', selected.sr_no],
                  ['Date', selected.date],
                  ['Customer', selected.customer_name],
                  ['Bank Card', selected.bank_card],
                  ['Total Amount', `₹${selected.total_amount.toLocaleString('en-IN')}`],
                  ['Paid Amount', `₹${selected.paid_amount.toLocaleString('en-IN')}`],
                  ['Account', selected.account_name],
                  ['Swap Amount', `₹${selected.swap_amount.toLocaleString('en-IN')}`],
                  ['Swap Name', selected.swap_name],
                  ['Difference', selected.difference != null ? `₹${selected.difference.toLocaleString('en-IN')}` : '—'],
                ] as [string, string | number][]).map(([k, v]) => (
                  <div key={String(k)} className="flex justify-between py-2 border-b border-[#e5e7eb]">
                    <span className="text-sm text-[#6b7280]">{k}</span>
                    <span className="text-sm font-medium text-[#1a1a1a]">{v}</span>
                  </div>
                ))}
                <div className="flex justify-between py-2">
                  <span className="text-sm text-[#6b7280]">Remarks</span>
                  <StatusBadge status={selected.remarks} />
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
