'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronLeft, ChevronRight, Download, RefreshCw, Plus, Pencil, Check, X, ChevronDown, ChevronUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { AcSheetRow, loadAcSheet, saveAcSheetCell, getOpeningBalance } from '@/lib/ac-sheet'
import { logAction } from '@/lib/audit-log'

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtDate(d: string) {
  if (!d) return ''
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
}

function isoDate(d: Date) {
  return d.toISOString().split('T')[0]
}

function prevDay(d: string) {
  const dt = new Date(d + 'T00:00:00')
  dt.setDate(dt.getDate() - 1)
  return isoDate(dt)
}

function nextDay(d: string) {
  const dt = new Date(d + 'T00:00:00')
  dt.setDate(dt.getDate() + 1)
  return isoDate(dt)
}

function fmt(n: number | null | undefined) {
  if (n == null || n === 0) return ''
  return n.toLocaleString('en-IN')
}

function fmtFull(n: number) {
  return n.toLocaleString('en-IN')
}

const EDITABLE_FIELDS: (keyof AcSheetRow)[] = [
  'bal_recd', 'trn_bal_recd', 'atm_withd', 'withd', 'transf', 'cc_pay', 'cust_trf', 'charges'
]

const COL_HEADERS = [
  { key: 'account_name' as keyof AcSheetRow, label: 'ACCOUNT', width: 140 },
  { key: 'open_bal' as keyof AcSheetRow, label: 'OPEN BAL', width: 110 },
  { key: 'bal_recd' as keyof AcSheetRow, label: 'BAL RECD', width: 110 },
  { key: 'trn_bal_recd' as keyof AcSheetRow, label: 'TRN BAL RECD', width: 120 },
  { key: 'avai_bal' as keyof AcSheetRow, label: 'AVAI BAL', width: 110 },
  { key: 'atm_withd' as keyof AcSheetRow, label: 'ATM WITHD', width: 110 },
  { key: 'withd' as keyof AcSheetRow, label: 'WITHD', width: 100 },
  { key: 'transf' as keyof AcSheetRow, label: 'TRANSF', width: 100 },
  { key: 'cc_pay' as keyof AcSheetRow, label: 'CC PAY', width: 100 },
  { key: 'cust_trf' as keyof AcSheetRow, label: 'CUST TRF', width: 110 },
  { key: 'charges' as keyof AcSheetRow, label: 'CHARGES', width: 100 },
  { key: 'closing_bal' as keyof AcSheetRow, label: 'CLOSI BAL', width: 110 },
]

// ── Bank Account Management Modal ─────────────────────────────────────────────
interface BankAccount {
  id: string
  account_name: string
  current_balance: number
  opening_balance: number
  is_active: boolean
}

interface AccountDetails {
  todayAC: Record<string, number> | null
  recentTxns: Array<{
    id: string
    sr_no: number
    date: string
    customer_name: string
    total_amount: number
    paid_amount: number
    remarks: string
  }>
}

const ADD_AMOUNT_OPTIONS = [
  { value: 'bal_recd',     label: 'BAL RECD (received)' },
  { value: 'trn_bal_recd', label: 'TRN BAL RECD (transfer received)' },
  { value: 'atm_withd',   label: 'ATM WITHDRAWAL' },
  { value: 'withd',       label: 'WITHDRAWAL' },
  { value: 'transf',      label: 'TRANSFER OUT' },
  { value: 'cc_pay',      label: 'CC PAYMENT' },
  { value: 'cust_trf',    label: 'CUSTOMER TRANSFER' },
  { value: 'charges',     label: 'CHARGES' },
]

function BankAccountsModal({ onClose }: { onClose: () => void }) {
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // Add account
  const [newName, setNewName] = useState('')
  const [newBal, setNewBal] = useState('')

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<{ account_name: string; current_balance: string; opening_balance: string }>({
    account_name: '', current_balance: '', opening_balance: '',
  })

  // Expanded row
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [accountDetails, setAccountDetails] = useState<AccountDetails | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)

  // Add amount to AC sheet
  const [addAmountType, setAddAmountType] = useState('bal_recd')
  const [addAmount, setAddAmount] = useState('')

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function fetchAccounts() {
    const supabase = createClient()
    const { data, error } = await supabase.from('bank_account_master').select('*').order('account_name')
    if (error) { console.error('Fetch accounts error:', error); return }
    setAccounts((data as BankAccount[]) || [])
    setLoading(false)
  }

  useEffect(() => { fetchAccounts() }, [])

  // FIX 7 — Refresh expanded details (standalone, called after mutations)
  async function refreshExpandedAccount(accountName: string) {
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]
    const last7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const [{ data: todayAC }, { data: recentTxns }] = await Promise.all([
      supabase.from('ac_sheet').select('*').eq('account_name', accountName).eq('date', today).maybeSingle(),
      supabase.from('transactions').select('id,sr_no,date,customer_name,total_amount,paid_amount,remarks').ilike('account_name', `%${accountName}%`).gte('date', last7).order('date', { ascending: false }).limit(10),
    ])
    setAccountDetails({ todayAC: todayAC as Record<string, number> | null, recentTxns: recentTxns || [] })
  }

  // FIX 4 — Add Account
  async function addAccount() {
    const name = newName.trim().toUpperCase()
    if (!name) { showToast('Account name required', 'error'); return }
    const supabase = createClient()
    const openingBal = parseFloat(newBal) || 0
    const { error } = await supabase.from('bank_account_master').insert({
      account_name: name,
      opening_balance: openingBal,
      current_balance: openingBal,
      is_active: true,
    })
    if (error) {
      showToast(error.code === '23505' ? 'Account already exists!' : 'Failed: ' + error.message, 'error')
      return
    }
    showToast(`${name} account added!`, 'success')
    setNewName('')
    setNewBal('')
    fetchAccounts()
    logAction({ action: 'Bank Account Added', module: 'Bank Accounts', details: { account_name: name, opening_balance: openingBal } }).catch(() => {})
  }

  // FIX 6 — Inline edit (with stopPropagation)
  function startEdit(e: React.MouseEvent, acc: BankAccount) {
    e.stopPropagation()
    setEditingId(acc.id)
    setExpandedId(null)
    setEditValues({
      account_name: acc.account_name,
      current_balance: String(acc.current_balance || 0),
      opening_balance: String(acc.opening_balance || 0),
    })
  }

  async function saveEdit(accountId: string) {
    const supabase = createClient()
    const { error } = await supabase.from('bank_account_master').update({
      account_name: editValues.account_name.toUpperCase(),
      opening_balance: parseFloat(editValues.opening_balance) || 0,
      current_balance: parseFloat(editValues.current_balance) || 0,
    }).eq('id', accountId)
    if (error) { showToast('Failed: ' + error.message, 'error'); return }
    showToast('Account updated!', 'success')
    setEditingId(null)
    fetchAccounts()
    logAction({ action: 'Bank Account Updated', module: 'Bank Accounts', details: editValues }).catch(() => {})
  }

  // FIX 5 — Toggle active (with stopPropagation)
  async function toggleStatus(e: React.MouseEvent, accountId: string, isActive: boolean, accountName: string) {
    e.stopPropagation()
    const supabase = createClient()
    const { error } = await supabase.from('bank_account_master').update({ is_active: !isActive }).eq('id', accountId)
    if (error) { showToast('Failed: ' + error.message, 'error'); return }
    showToast(isActive ? `${accountName} deactivated` : `${accountName} activated`, 'success')
    fetchAccounts()
  }

  // FIX 2 — Expand row with details
  async function expandAccount(acc: BankAccount) {
    if (expandedId === acc.id) { setExpandedId(null); setAccountDetails(null); return }
    setEditingId(null)
    setExpandedId(acc.id)
    setDetailsLoading(true)
    setAccountDetails(null)
    await refreshExpandedAccount(acc.account_name)
    setDetailsLoading(false)
  }

  // FIX 1 — Add amount to AC sheet (fully rewritten, no rpc)
  async function handleAddAmount(accountName: string) {
    if (!addAmount || parseFloat(addAmount) <= 0) { showToast('Enter valid amount', 'error'); return }
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]
    const amount = parseFloat(addAmount)

    try {
      const { data: existing } = await supabase.from('ac_sheet').select('*').eq('account_name', accountName).eq('date', today).maybeSingle()

      let newClosingBal = 0

      if (existing) {
        const row = existing as Record<string, number>
        const updated = { ...row, [addAmountType]: (Number(row[addAmountType]) || 0) + amount }
        updated.avai_bal = (Number(updated.open_bal) || 0) + (Number(updated.bal_recd) || 0) + (Number(updated.trn_bal_recd) || 0)
        updated.closing_bal = updated.avai_bal - (Number(updated.atm_withd) || 0) - (Number(updated.withd) || 0) - (Number(updated.transf) || 0) - (Number(updated.cc_pay) || 0) - (Number(updated.cust_trf) || 0) - (Number(updated.charges) || 0)
        newClosingBal = updated.closing_bal
        console.log('[handleAddAmount] updating existing row:', { id: (existing as { id: string }).id, field: addAmountType, value: updated[addAmountType], avai_bal: updated.avai_bal, closing_bal: updated.closing_bal })
        const { error } = await supabase.from('ac_sheet').update({ [addAmountType]: updated[addAmountType], avai_bal: updated.avai_bal, closing_bal: updated.closing_bal }).eq('id', (existing as { id: string }).id)
        if (error) throw error
      } else {
        // Get opening balance from previous day's closing
        const { data: prevDay } = await supabase.from('ac_sheet').select('closing_bal').eq('account_name', accountName).lt('date', today).order('date', { ascending: false }).limit(1)
        const openBal = Number(prevDay?.[0]?.closing_bal) || 0
        const newRow: Record<string, unknown> = { date: today, account_name: accountName, open_bal: openBal, bal_recd: 0, trn_bal_recd: 0, atm_withd: 0, withd: 0, transf: 0, cc_pay: 0, cust_trf: 0, charges: 0, [addAmountType]: amount }
        newRow.avai_bal = (Number(newRow.open_bal) || 0) + (Number(newRow.bal_recd) || 0) + (Number(newRow.trn_bal_recd) || 0)
        newRow.closing_bal = Number(newRow.avai_bal) - (Number(newRow.atm_withd) || 0) - (Number(newRow.withd) || 0) - (Number(newRow.transf) || 0) - (Number(newRow.cc_pay) || 0) - (Number(newRow.cust_trf) || 0) - (Number(newRow.charges) || 0)
        newClosingBal = Number(newRow.closing_bal)
        console.log('[handleAddAmount] inserting new row:', newRow)
        const { error } = await supabase.from('ac_sheet').insert(newRow)
        if (error) throw error
      }

      // Update current_balance in bank_account_master to today's closing
      await supabase.from('bank_account_master').update({ current_balance: newClosingBal }).eq('account_name', accountName)

      showToast(`₹${amount.toLocaleString('en-IN')} added to ${accountName}!`, 'success')
      setAddAmount('')

      // Refresh everything
      setDetailsLoading(true)
      await Promise.all([refreshExpandedAccount(accountName), fetchAccounts()])
      setDetailsLoading(false)

      logAction({ action: 'Amount Added to Account', module: 'Bank Accounts', details: { account: accountName, type: addAmountType, amount, new_closing_bal: newClosingBal } }).catch(() => {})
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[handleAddAmount] error:', err)
      showToast('Failed: ' + msg, 'error')
    }
  }

  const inpCls = 'border rounded px-2 py-1 text-xs outline-none focus:border-[#3ECF8E]'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-xl shadow-2xl flex flex-col" style={{ width: 860, maxHeight: '88vh' }}>

        {/* Toast */}
        {toast && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium text-white"
            style={{ background: toast.type === 'success' ? '#3ECF8E' : '#ef4444' }}>
            {toast.type === 'success' ? <Check size={15} /> : <X size={15} />}
            {toast.msg}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5e7eb] flex-shrink-0">
          <h2 className="text-base font-bold text-[#1a1a1a]">Bank Account Management</h2>
          <button onClick={onClose}><X size={18} color="#6b7280" /></button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-sm text-[#6b7280]">Loading...</div>
          ) : (
            <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
              <thead className="sticky top-0 z-10" style={{ background: '#f3f4f6' }}>
                <tr>
                  {['', 'Account Name', 'Current Balance', 'Opening Balance', 'Status', 'Actions'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-[#6b7280] border-b border-[#e5e7eb]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {accounts.map(acc => (
                  <React.Fragment key={acc.id}>
                    {editingId === acc.id ? (
                      /* ── Inline edit row ── */
                      <tr style={{ background: '#f0fdf4' }}>
                        <td className="px-3 py-2"><ChevronDown size={13} color="#9ca3af" /></td>
                        <td className="px-3 py-2">
                          <input className={inpCls} value={editValues.account_name} onChange={e => setEditValues({ ...editValues, account_name: e.target.value })} style={{ width: 140 }} autoFocus />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" className={inpCls} value={editValues.current_balance} onChange={e => setEditValues({ ...editValues, current_balance: e.target.value })} style={{ width: 110 }} />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" className={inpCls} value={editValues.opening_balance} onChange={e => setEditValues({ ...editValues, opening_balance: e.target.value })} style={{ width: 110 }} />
                        </td>
                        <td className="px-3 py-2" />
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <button onClick={() => saveEdit(acc.id)} className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-white" style={{ background: '#3ECF8E' }}><Check size={12} /> Save</button>
                            <button onClick={() => setEditingId(null)} className="px-2 py-1 rounded text-xs border border-[#e5e7eb] text-[#6b7280]">Cancel</button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      /* ── Normal row ── */
                      <tr
                        className="border-b border-[#f3f4f6] hover:bg-[#f9fafb] cursor-pointer"
                        onClick={() => expandAccount(acc)}
                      >
                        <td className="px-3 py-2.5 text-[#9ca3af]">
                          {expandedId === acc.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-[#1a1a1a]">{acc.account_name}</td>
                        <td className="px-3 py-2.5 font-medium" style={{ color: '#3ECF8E' }}>₹{Number(acc.current_balance || 0).toLocaleString('en-IN')}</td>
                        <td className="px-3 py-2.5 text-[#6b7280]">₹{Number(acc.opening_balance || 0).toLocaleString('en-IN')}</td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
                            style={{ background: acc.is_active ? '#d1fae5' : '#f3f4f6', color: acc.is_active ? '#065f46' : '#6b7280' }}>
                            {acc.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-3">
                            <button onClick={e => startEdit(e, acc)} className="text-[#6b7280] hover:text-[#3ECF8E] transition-colors" title="Edit">
                              <Pencil size={13} />
                            </button>
                            <button onClick={e => toggleStatus(e, acc.id, acc.is_active, acc.account_name)} className="text-xs font-medium underline"
                              style={{ color: acc.is_active ? '#dc2626' : '#16a34a' }}>
                              {acc.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* ── Expanded dropdown details ── */}
                    {expandedId === acc.id && editingId !== acc.id && (
                      <tr>
                        <td colSpan={6} style={{ padding: 0, background: '#f9fafb' }}>
                          <div style={{ padding: 16, borderTop: '2px solid #3ECF8E' }}>
                            {detailsLoading ? (
                              <div className="text-sm text-[#6b7280] text-center py-4">Loading details...</div>
                            ) : accountDetails ? (
                              <>
                                {/* Balance cards — read from live accounts state so refreshes after handleAddAmount */}
                                {(() => {
                                  const liveAcc = accounts.find(a => a.id === acc.id) || acc
                                  return (
                                <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                                  {[
                                    { label: 'Opening Balance', value: liveAcc.opening_balance, color: '#1a1a1a', sub: 'Initial balance set' },
                                    { label: 'Current Balance', value: liveAcc.current_balance, color: '#3ECF8E', sub: 'Live balance' },
                                    { label: "Today's Received", value: accountDetails.todayAC?.bal_recd || 0, color: '#3b82f6', sub: 'BAL RECD today' },
                                    { label: "Today's Closing", value: accountDetails.todayAC?.closing_bal || 0, color: Number(accountDetails.todayAC?.closing_bal || 0) >= 0 ? '#16a34a' : '#ef4444', sub: 'CLOSI BAL today' },
                                  ].map(card => (
                                    <div key={card.label} style={{ flex: 1, background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
                                      <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', marginBottom: 4 }}>{card.label}</div>
                                      <div style={{ fontSize: 20, fontWeight: 'bold', color: card.color }}>₹{Number(card.value).toLocaleString('en-IN')}</div>
                                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{card.sub}</div>
                                    </div>
                                  ))}
                                </div>
                                  )
                                })()}

                                {/* Add amount */}
                                <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                                  <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 8 }}>Add Amount to AC Sheet (Today)</div>
                                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <select
                                      value={addAmountType}
                                      onChange={e => setAddAmountType(e.target.value)}
                                      style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px', fontSize: 12, outline: 'none' }}
                                    >
                                      {ADD_AMOUNT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                    <input
                                      type="number"
                                      placeholder="Amount..."
                                      value={addAmount}
                                      onChange={e => setAddAmount(e.target.value)}
                                      onKeyDown={e => { if (e.key === 'Enter') handleAddAmount(acc.account_name) }}
                                      style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px', fontSize: 12, width: 140, outline: 'none' }}
                                    />
                                    <button
                                      onClick={() => handleAddAmount(acc.account_name)}
                                      style={{ background: '#3ECF8E', color: 'white', border: 'none', borderRadius: 6, padding: '6px 16px', cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}
                                    >
                                      Add
                                    </button>
                                  </div>
                                </div>

                                {/* Recent transactions */}
                                <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 8 }}>Recent Transactions (Last 7 Days)</div>
                                {accountDetails.recentTxns.length > 0 ? (
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead>
                                      <tr style={{ background: '#FFFF00' }}>
                                        {['SR', 'DATE', 'CUSTOMER', 'TOTAL', 'PAID', 'REMARKS'].map(h => (
                                          <th key={h} style={{ border: '1px solid #000', padding: '5px 8px', textAlign: h === 'CUSTOMER' ? 'left' : 'center', fontWeight: 'bold' }}>{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {accountDetails.recentTxns.map(t => (
                                        <tr key={t.id} style={{ background: '#fff' }}>
                                          <td style={{ border: '1px solid #d1d5db', padding: '4px 8px', textAlign: 'center' }}>{t.sr_no}</td>
                                          <td style={{ border: '1px solid #d1d5db', padding: '4px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>{t.date}</td>
                                          <td style={{ border: '1px solid #d1d5db', padding: '4px 8px' }}>{t.customer_name}</td>
                                          <td style={{ border: '1px solid #d1d5db', padding: '4px 8px', textAlign: 'right' }}>₹{Number(t.total_amount).toLocaleString('en-IN')}</td>
                                          <td style={{ border: '1px solid #d1d5db', padding: '4px 8px', textAlign: 'right' }}>₹{Number(t.paid_amount).toLocaleString('en-IN')}</td>
                                          <td style={{ border: '1px solid #d1d5db', padding: '4px 8px', textAlign: 'center', fontWeight: 'bold',
                                            color: t.remarks === 'PAID' ? '#16a34a' : t.remarks === 'PEND' ? '#d97706' : '#ef4444' }}>
                                            {t.remarks}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                ) : (
                                  <div style={{ color: '#6b7280', fontSize: 13 }}>No recent transactions found for this account.</div>
                                )}
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Add account footer */}
        <div className="px-5 py-3 border-t border-[#e5e7eb] flex items-center gap-2 flex-shrink-0" style={{ background: '#fafafa' }}>
          <input
            className="border rounded-md px-3 py-1.5 text-xs outline-none focus:border-[#3ECF8E] flex-1"
            style={{ borderColor: '#e5e7eb' }}
            placeholder="New account name (e.g. KTC INDUS)..."
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addAccount() }}
          />
          <input
            type="number"
            className="border rounded-md px-3 py-1.5 text-xs outline-none focus:border-[#3ECF8E]"
            style={{ borderColor: '#e5e7eb', width: 160 }}
            placeholder="Opening balance..."
            value={newBal}
            onChange={e => setNewBal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addAccount() }}
          />
          <button
            onClick={addAccount}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold text-white whitespace-nowrap"
            style={{ background: '#3ECF8E' }}
          >
            <Plus size={13} /> Add Account
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Editable cell ──────────────────────────────────────────────────────────────
function EditableCell({
  value,
  onSave,
  align = 'right',
  bg,
  bold,
  color,
}: {
  value: number
  onSave: (v: number) => void
  align?: 'left' | 'right'
  bg?: string
  bold?: boolean
  color?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function startEdit() {
    setDraft(value === 0 ? '' : String(value))
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  function commit() {
    const v = parseFloat(draft) || 0
    onSave(v)
    setEditing(false)
  }

  const cellStyle: React.CSSProperties = {
    padding: '3px 6px',
    border: '1px solid #d1d5db',
    textAlign: align,
    background: bg || 'transparent',
    fontWeight: bold ? 'bold' : 'normal',
    color: color || '#1a1a1a',
    cursor: 'pointer',
    minWidth: 90,
    fontSize: 12,
    fontFamily: 'Calibri, Arial, sans-serif',
  }

  if (editing) {
    return (
      <td style={{ ...cellStyle, padding: 0 }}>
        <input
          ref={inputRef}
          type="number"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
          style={{
            width: '100%',
            height: '100%',
            border: '2px solid #3ECF8E',
            outline: 'none',
            textAlign: align,
            padding: '3px 6px',
            fontSize: 12,
            fontFamily: 'Calibri, Arial, sans-serif',
            background: '#f0fdf4',
          }}
          autoFocus
        />
      </td>
    )
  }

  return (
    <td style={cellStyle} onDoubleClick={startEdit} onClick={startEdit}>
      {value !== 0 ? fmtFull(value) : ''}
    </td>
  )
}

// ── Main AC Sheet View ─────────────────────────────────────────────────────────
export default function AcSheetView() {
  const today = isoDate(new Date())
  const [date, setDate] = useState(today)
  const [rows, setRows] = useState<AcSheetRow[]>([])
  const [loading, setLoading] = useState(false)
  const [showBankMgmt, setShowBankMgmt] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)

  const load = useCallback(async (d: string) => {
    setLoading(true)
    const data = await loadAcSheet(d)
    setRows(data)
    setLoading(false)
  }, [])

  useEffect(() => { load(date) }, [date, load])

  async function handleCellSave(rowIdx: number, field: keyof AcSheetRow, value: number) {
    const row = rows[rowIdx]
    setSaving(row.account_name + field)
    const updated = await saveAcSheetCell(row, field, value, (newId) => {
      setRows(prev => prev.map((r, i) => i === rowIdx ? { ...r, id: newId } : r))
    })
    setRows(prev => prev.map((r, i) => i === rowIdx ? updated : r))
    setSaving(null)
  }

  async function exportXlsx() {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('AC Sheet')

    const dateLabel = fmtDate(date)

    // Date header row (merged)
    ws.mergeCells(1, 1, 1, COL_HEADERS.length)
    const dateCell = ws.getCell(1, 1)
    dateCell.value = dateLabel
    dateCell.font = { bold: true, size: 13 }
    dateCell.alignment = { horizontal: 'center', vertical: 'middle' }
    dateCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } }
    ws.getRow(1).height = 20

    // Column headers
    COL_HEADERS.forEach((col, i) => {
      const cell = ws.getCell(2, i + 1)
      cell.value = col.label
      cell.font = { bold: true, size: 11 }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } }
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
      ws.getColumn(i + 1).width = col.width / 7
    })
    ws.getRow(2).height = 18

    // Data rows
    rows.forEach((row, ri) => {
      COL_HEADERS.forEach((col, ci) => {
        const cell = ws.getCell(ri + 3, ci + 1)
        const val = row[col.key]
        cell.value = typeof val === 'number' ? val : String(val || '')
        cell.alignment = { horizontal: col.key === 'account_name' ? 'left' : 'right', vertical: 'middle' }
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }

        if (col.key === 'avai_bal' || col.key === 'closing_bal') {
          cell.font = { bold: true, size: 11 }
        }

        // Yellow for non-zero entered values
        if (['bal_recd', 'trn_bal_recd', 'atm_withd', 'withd', 'transf', 'cc_pay', 'cust_trf', 'charges'].includes(col.key as string) && Number(val) !== 0) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
        }
        // Green for zero bal_recd
        if (col.key === 'bal_recd' && Number(val) === 0) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92D050' } }
        }
        // Light blue for avai_bal
        if (col.key === 'avai_bal') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } }
        }
        // Green/red for closing_bal
        if (col.key === 'closing_bal') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: Number(val) >= 0 ? 'FFC6EFCE' : 'FFFFC7CE' } }
        }
      })
    })

    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `ACSheet_${date.split('-').reverse().join('-')}.xlsx`
    a.click()
  }

  const totalRow = rows.reduce((acc, r) => ({
    open_bal: acc.open_bal + Number(r.open_bal),
    bal_recd: acc.bal_recd + Number(r.bal_recd),
    trn_bal_recd: acc.trn_bal_recd + Number(r.trn_bal_recd),
    avai_bal: acc.avai_bal + Number(r.avai_bal),
    atm_withd: acc.atm_withd + Number(r.atm_withd),
    withd: acc.withd + Number(r.withd),
    transf: acc.transf + Number(r.transf),
    cc_pay: acc.cc_pay + Number(r.cc_pay),
    cust_trf: acc.cust_trf + Number(r.cust_trf),
    charges: acc.charges + Number(r.charges),
    closing_bal: acc.closing_bal + Number(r.closing_bal),
  }), { open_bal: 0, bal_recd: 0, trn_bal_recd: 0, avai_bal: 0, atm_withd: 0, withd: 0, transf: 0, cc_pay: 0, cust_trf: 0, charges: 0, closing_bal: 0 })

  const HS: React.CSSProperties = {
    border: '1px solid #1a1a2e',
    padding: '4px 6px',
    fontSize: 11,
    fontFamily: 'Calibri, Arial, sans-serif',
    background: '#1F4E79',
    color: '#ffffff',
    fontWeight: 'bold',
    textAlign: 'center',
    whiteSpace: 'nowrap',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: '#fafafa' }}>
      {showBankMgmt && <BankAccountsModal onClose={() => setShowBankMgmt(false)} />}

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[#e5e7eb] bg-white flex-shrink-0">
        {/* Date navigation */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setDate(prevDay(date))}
            className="p-1.5 rounded border hover:bg-gray-50 transition-colors"
            style={{ borderColor: '#e5e7eb' }}
          >
            <ChevronLeft size={14} />
          </button>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="border rounded-md px-3 py-1.5 text-sm font-medium outline-none focus:border-[#3ECF8E]"
            style={{ borderColor: '#e5e7eb' }}
          />
          <button
            onClick={() => setDate(nextDay(date))}
            disabled={date >= today}
            className="p-1.5 rounded border hover:bg-gray-50 transition-colors disabled:opacity-40"
            style={{ borderColor: '#e5e7eb' }}
          >
            <ChevronRight size={14} />
          </button>
        </div>

        <div
          className="px-3 py-1 rounded text-sm font-semibold"
          style={{ background: '#1F4E79', color: '#fff' }}
        >
          {fmtDate(date)}
        </div>

        <div className="flex-1" />

        <button
          onClick={() => load(date)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-medium hover:bg-gray-50"
          style={{ borderColor: '#e5e7eb', color: '#374151' }}
        >
          <RefreshCw size={12} /> Refresh
        </button>

        <button
          onClick={() => setShowBankMgmt(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-medium hover:bg-gray-50"
          style={{ borderColor: '#e5e7eb', color: '#374151' }}
        >
          <Plus size={12} /> Bank Accounts
        </button>

        <button
          onClick={exportXlsx}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium text-white"
          style={{ background: '#3ECF8E' }}
        >
          <Download size={12} /> Export .xlsx
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-sm text-[#6b7280]">
            Loading AC Sheet for {fmtDate(date)}...
          </div>
        ) : (
          <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
            <thead>
              {/* Date header */}
              <tr>
                <th
                  colSpan={COL_HEADERS.length}
                  style={{
                    ...HS,
                    fontSize: 13,
                    background: '#1a1a2e',
                    padding: '6px 10px',
                    letterSpacing: '0.02em',
                  }}
                >
                  {fmtDate(date)}
                </th>
              </tr>
              {/* Column headers */}
              <tr>
                {COL_HEADERS.map(col => (
                  <th
                    key={col.key}
                    style={{
                      ...HS,
                      minWidth: col.width,
                      textAlign: col.key === 'account_name' ? 'left' : 'center',
                      ...(col.key === 'account_name' ? { position: 'sticky', left: 0, zIndex: 20 } : {}),
                    }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => (
                <tr key={row.account_name} style={{ background: rowIdx % 2 === 0 ? '#ffffff' : '#f9f9f9' }}>
                  {/* Account name - sticky */}
                  <td style={{
                    border: '1px solid #d1d5db',
                    padding: '3px 8px',
                    fontSize: 12,
                    fontFamily: 'Calibri, Arial, sans-serif',
                    fontWeight: 'bold',
                    whiteSpace: 'nowrap',
                    position: 'sticky',
                    left: 0,
                    background: rowIdx % 2 === 0 ? '#fff' : '#f9f9f9',
                    zIndex: 5,
                    minWidth: 140,
                  }}>
                    {row.account_name}
                    {saving && saving.startsWith(row.account_name) && (
                      <span className="ml-1 text-[10px] text-[#3ECF8E]">saving…</span>
                    )}
                  </td>

                  {/* OPEN BAL - read-only */}
                  <td style={{
                    border: '1px solid #d1d5db',
                    padding: '3px 6px',
                    fontSize: 12,
                    fontFamily: 'Calibri, Arial, sans-serif',
                    textAlign: 'right',
                    background: '#f3f4f6',
                    color: '#374151',
                    minWidth: 110,
                  }}>
                    {fmt(row.open_bal)}
                  </td>

                  {/* BAL RECD */}
                  <EditableCell
                    value={Number(row.bal_recd)}
                    bg={Number(row.bal_recd) === 0 ? '#92D050' : '#ffff00'}
                    onSave={v => handleCellSave(rowIdx, 'bal_recd', v)}
                  />

                  {/* TRN BAL RECD */}
                  <EditableCell
                    value={Number(row.trn_bal_recd)}
                    bg={Number(row.trn_bal_recd) !== 0 ? '#ffff00' : undefined}
                    onSave={v => handleCellSave(rowIdx, 'trn_bal_recd', v)}
                  />

                  {/* AVAI BAL - read-only, light blue */}
                  <td style={{
                    border: '1px solid #d1d5db',
                    padding: '3px 6px',
                    fontSize: 12,
                    fontFamily: 'Calibri, Arial, sans-serif',
                    textAlign: 'right',
                    background: '#D9E1F2',
                    fontWeight: 'bold',
                    minWidth: 110,
                  }}>
                    {fmt(row.avai_bal)}
                  </td>

                  {/* ATM WITHD */}
                  <EditableCell
                    value={Number(row.atm_withd)}
                    bg={Number(row.atm_withd) !== 0 ? '#ffff00' : undefined}
                    onSave={v => handleCellSave(rowIdx, 'atm_withd', v)}
                  />

                  {/* WITHD */}
                  <EditableCell
                    value={Number(row.withd)}
                    bg={Number(row.withd) !== 0 ? '#ffff00' : undefined}
                    onSave={v => handleCellSave(rowIdx, 'withd', v)}
                  />

                  {/* TRANSF */}
                  <EditableCell
                    value={Number(row.transf)}
                    bg={Number(row.transf) !== 0 ? '#ffff00' : undefined}
                    onSave={v => handleCellSave(rowIdx, 'transf', v)}
                  />

                  {/* CC PAY */}
                  <EditableCell
                    value={Number(row.cc_pay)}
                    bg={Number(row.cc_pay) !== 0 ? '#ffff00' : undefined}
                    onSave={v => handleCellSave(rowIdx, 'cc_pay', v)}
                  />

                  {/* CUST TRF */}
                  <EditableCell
                    value={Number(row.cust_trf)}
                    bg={Number(row.cust_trf) !== 0 ? '#ffff00' : undefined}
                    onSave={v => handleCellSave(rowIdx, 'cust_trf', v)}
                  />

                  {/* CHARGES - always yellow bg per screenshot */}
                  <EditableCell
                    value={Number(row.charges)}
                    bg={Number(row.charges) !== 0 ? '#ffff00' : '#fffde7'}
                    onSave={v => handleCellSave(rowIdx, 'charges', v)}
                  />

                  {/* CLOSI BAL - read-only, green/red */}
                  <td style={{
                    border: '1px solid #d1d5db',
                    padding: '3px 6px',
                    fontSize: 12,
                    fontFamily: 'Calibri, Arial, sans-serif',
                    textAlign: 'right',
                    background: Number(row.closing_bal) >= 0 ? '#C6EFCE' : '#FFC7CE',
                    color: Number(row.closing_bal) >= 0 ? '#375623' : '#9C0006',
                    fontWeight: 'bold',
                    minWidth: 110,
                  }}>
                    {fmtFull(Number(row.closing_bal))}
                  </td>
                </tr>
              ))}

              {/* Totals row */}
              {rows.length > 0 && (
                <tr style={{ background: '#1F4E79' }}>
                  <td style={{
                    border: '1px solid #1a1a2e',
                    padding: '4px 8px',
                    fontSize: 12,
                    fontFamily: 'Calibri, Arial, sans-serif',
                    fontWeight: 'bold',
                    color: '#fff',
                    position: 'sticky',
                    left: 0,
                    background: '#1F4E79',
                    zIndex: 5,
                  }}>
                    TOTAL
                  </td>
                  {[
                    totalRow.open_bal, totalRow.bal_recd, totalRow.trn_bal_recd,
                    totalRow.avai_bal, totalRow.atm_withd, totalRow.withd,
                    totalRow.transf, totalRow.cc_pay, totalRow.cust_trf,
                    totalRow.charges, totalRow.closing_bal
                  ].map((v, i) => (
                    <td key={i} style={{
                      border: '1px solid #1a1a2e',
                      padding: '4px 6px',
                      fontSize: 12,
                      fontFamily: 'Calibri, Arial, sans-serif',
                      textAlign: 'right',
                      fontWeight: 'bold',
                      color: '#fff',
                    }}>
                      {v !== 0 ? fmtFull(v) : ''}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer info */}
      <div className="px-4 py-2 border-t border-[#e5e7eb] bg-white flex items-center gap-4 text-xs text-[#6b7280] flex-shrink-0">
        <span>{rows.length} accounts</span>
        <span className="flex items-center gap-1">
          <span style={{ display: 'inline-block', width: 10, height: 10, background: '#92D050', border: '1px solid #d1d5db' }} />
          Zero BAL RECD
        </span>
        <span className="flex items-center gap-1">
          <span style={{ display: 'inline-block', width: 10, height: 10, background: '#ffff00', border: '1px solid #d1d5db' }} />
          Non-zero value
        </span>
        <span className="flex items-center gap-1">
          <span style={{ display: 'inline-block', width: 10, height: 10, background: '#D9E1F2', border: '1px solid #d1d5db' }} />
          AVAI BAL (auto)
        </span>
        <span className="flex items-center gap-1">
          <span style={{ display: 'inline-block', width: 10, height: 10, background: '#C6EFCE', border: '1px solid #d1d5db' }} />
          Positive CLOSI BAL
        </span>
        <span className="ml-auto text-[10px]">Click any editable cell to edit • Enter to confirm • Esc to cancel</span>
      </div>
    </div>
  )
}
