'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Search, Plus, RefreshCw, X, ChevronDown, ChevronUp, Edit2, ShieldOff, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { logAction } from '@/lib/audit-log'

interface SwipeMachine {
  id: string
  machine_name: string
  tid: string
  account_name: string
  machine_type: string
  agent_code: string
  bank_commission_pct: number
  status: 'Active' | 'Blocked'
  created_at: string
  txn_count?: number
}

interface CCRow {
  id: string
  date: string
  customer_name: string
  swipe_amount: number
  our_commission: number
  bank_commission: number
  status: string
}

const ACCOUNT_OPTIONS = ['NSS','SKT','RT','KTC','TAPI','BGM','NTC','MAHA','MAL','MAP','HASTI','MTC','MGS','HSR','NGM']
const TYPE_OPTIONS = ['BONUSHUB','EZETAP','HDFC','FDRL','BOB','INDUS','YES','INSTA','PTM','GPAY','OTHER']

function fmtAmt(n: number | null | undefined) {
  if (n == null) return '₹0'
  return '₹' + Number(n).toLocaleString('en-IN')
}
function fmtDate(d: string) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${parseInt(day)}/${parseInt(m)}/${y.slice(2)}`
}

export default function MachinesPage() {
  const [machines, setMachines] = useState<SwipeMachine[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showPanel, setShowPanel] = useState(false)
  const [editMachine, setEditMachine] = useState<SwipeMachine | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedRows, setExpandedRows] = useState<CCRow[]>([])
  const [expandLoading, setExpandLoading] = useState(false)
  const [confirmBlock, setConfirmBlock] = useState<SwipeMachine | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    machine_name: '', tid: '', account_name: 'NSS', machine_type: 'BONUSHUB',
    agent_code: '', bank_commission_pct: '1.320', status: 'Active' as 'Active' | 'Blocked',
  })

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const fetchMachines = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('swipe_machines')
      .select('*')
      .order('machine_name', { ascending: true })
    if (error) { showToast('Failed to load machines: ' + error.message, 'error'); setLoading(false); return }

    const ids = (data || []).map((m: SwipeMachine) => m.id)
    let counts: Record<string, number> = {}
    if (ids.length > 0) {
      const { data: ccData } = await supabase
        .from('cc_sheet')
        .select('machine_id')
        .in('machine_id', ids)
      ;(ccData || []).forEach((r: { machine_id: string }) => {
        counts[r.machine_id] = (counts[r.machine_id] || 0) + 1
      })
    }
    setMachines((data || []).map((m: SwipeMachine) => ({ ...m, txn_count: counts[m.id] || 0 })))
    setLoading(false)
  }, [])

  useEffect(() => { fetchMachines() }, [fetchMachines])

  async function expandMachine(machine: SwipeMachine) {
    if (expandedId === machine.id) { setExpandedId(null); return }
    setExpandedId(machine.id)
    setExpandLoading(true)
    const { data } = await supabase
      .from('cc_sheet')
      .select('id,date,customer_name,swipe_amount,our_commission,bank_commission,status')
      .eq('machine_id', machine.id)
      .order('date', { ascending: false })
      .limit(10)
    setExpandedRows((data as CCRow[]) || [])
    setExpandLoading(false)
  }

  function openAdd() {
    setEditMachine(null)
    setForm({ machine_name: '', tid: '', account_name: 'NSS', machine_type: 'BONUSHUB', agent_code: '', bank_commission_pct: '1.320', status: 'Active' })
    setShowPanel(true)
  }
  function openEdit(m: SwipeMachine) {
    setEditMachine(m)
    setForm({ machine_name: m.machine_name, tid: m.tid, account_name: m.account_name, machine_type: m.machine_type, agent_code: m.agent_code, bank_commission_pct: String(m.bank_commission_pct), status: m.status })
    setShowPanel(true)
  }

  async function handleSave() {
    if (!form.machine_name.trim() || !form.tid.trim()) { showToast('Machine name and TID are required', 'error'); return }
    setSaving(true)
    const payload = {
      machine_name: form.machine_name.trim(),
      tid: form.tid.trim(),
      account_name: form.account_name,
      machine_type: form.machine_type,
      agent_code: form.agent_code.trim(),
      bank_commission_pct: parseFloat(form.bank_commission_pct) || 1.320,
      status: form.status,
    }
    if (editMachine) {
      const { error } = await supabase.from('swipe_machines').update(payload).eq('id', editMachine.id)
      if (error) showToast('Update failed: ' + error.message, 'error')
      else {
        showToast('Machine updated'); setShowPanel(false); fetchMachines()
        const changedFields: Record<string, { old: unknown; new: unknown }> = {}
        if (editMachine.machine_name !== payload.machine_name) changedFields.machine_name = { old: editMachine.machine_name, new: payload.machine_name }
        if (editMachine.tid !== payload.tid) changedFields.tid = { old: editMachine.tid, new: payload.tid }
        if (editMachine.account_name !== payload.account_name) changedFields.account_name = { old: editMachine.account_name, new: payload.account_name }
        if (editMachine.machine_type !== payload.machine_type) changedFields.machine_type = { old: editMachine.machine_type, new: payload.machine_type }
        if (editMachine.agent_code !== payload.agent_code) changedFields.agent_code = { old: editMachine.agent_code, new: payload.agent_code }
        if (editMachine.bank_commission_pct !== payload.bank_commission_pct) changedFields.bank_commission_pct = { old: editMachine.bank_commission_pct, new: payload.bank_commission_pct }
        if (editMachine.status !== payload.status) changedFields.status = { old: editMachine.status, new: payload.status }
        logAction({
          action: 'Machine Updated',
          module: 'Swipe Machines',
          details: { machine_name: payload.machine_name, changed_fields: changedFields },
        })
      }
    } else {
      const { error } = await supabase.from('swipe_machines').insert(payload)
      if (error) showToast('Insert failed: ' + error.message, 'error')
      else {
        showToast('Machine added'); setShowPanel(false); fetchMachines()
        logAction({
          action: 'Machine Added',
          module: 'Swipe Machines',
          details: {
            machine_name: payload.machine_name,
            tid: payload.tid,
            account: payload.account_name,
            bank_commission_pct: payload.bank_commission_pct,
          },
        })
      }
    }
    setSaving(false)
  }

  async function toggleStatus(m: SwipeMachine) {
    const newStatus = m.status === 'Active' ? 'Blocked' : 'Active'
    const { error } = await supabase.from('swipe_machines').update({ status: newStatus }).eq('id', m.id)
    if (error) showToast('Failed: ' + error.message, 'error')
    else {
      showToast(`${m.machine_name} ${newStatus === 'Blocked' ? 'blocked' : 'activated'}`)
      setConfirmBlock(null); fetchMachines()
      logAction({
        action: newStatus === 'Blocked' ? 'Machine Blocked' : 'Machine Activated',
        module: 'Swipe Machines',
        details: { machine_name: m.machine_name, tid: m.tid },
      })
    }
  }

  const filtered = machines.filter(m =>
    !search || m.machine_name.toLowerCase().includes(search.toLowerCase()) ||
    m.tid.toLowerCase().includes(search.toLowerCase()) ||
    m.account_name.toLowerCase().includes(search.toLowerCase())
  )

  const totalSwipe = expandedRows.reduce((s, r) => s + Number(r.swipe_amount || 0), 0)
  const totalComm = expandedRows.reduce((s, r) => s + Number(r.our_commission || 0), 0)

  const inp = 'w-full rounded border px-2.5 py-1.5 text-xs outline-none focus:border-[#3ECF8E]'
  const lb = 'block text-[11px] font-medium text-[#374151] mb-0.5'

  return (
    <div className="flex flex-col h-full bg-[#f9fafb]">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium text-white ${toast.type === 'success' ? 'bg-[#3ECF8E]' : 'bg-red-500'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-[#e5e7eb] px-4 py-3 flex items-center gap-3">
        <div>
          <h1 className="text-sm font-semibold text-[#1a1a1a]">Swipe Machines</h1>
          <p className="text-[11px] text-[#6b7280]">{machines.length} machines registered</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded border px-2.5 py-1.5 bg-white" style={{ borderColor: '#e5e7eb', width: 220 }}>
            <Search size={12} color="#9ca3af" />
            <input className="flex-1 text-xs outline-none" placeholder="Search machine, TID, account..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button onClick={() => fetchMachines()} className="p-1.5 rounded border hover:bg-gray-50" style={{ borderColor: '#e5e7eb' }}><RefreshCw size={13} color="#6b7280" /></button>
          <button onClick={openAdd} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-white" style={{ background: '#3ECF8E' }}>
            <Plus size={13} /> Add Machine
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-4 py-3">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-sm text-[#6b7280]">Loading...</div>
        ) : (
          <div className="bg-white border border-[#e5e7eb] rounded-lg overflow-hidden">
            <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  {['MACHINE NAME','TID','ACCOUNT','TYPE','AGENT CODE','BANK MDR %','STATUS','TXN COUNT','ACTIONS'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-[#374151] whitespace-nowrap" style={{ fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-10 text-[#9ca3af]">No machines found</td></tr>
                ) : filtered.map(m => (
                  <React.Fragment key={m.id}>
                    <tr
                      className="border-b hover:bg-[#f9fafb] cursor-pointer"
                      style={{ borderColor: '#e5e7eb' }}
                      onClick={() => expandMachine(m)}
                    >
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-[#1a1a1a]">{m.machine_name}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="font-mono text-[#6b7280]">{m.tid}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: '#d1fae5', color: '#065f46' }}>{m.account_name}</span>
                      </td>
                      <td className="px-3 py-2.5 text-[#374151]">{m.machine_type}</td>
                      <td className="px-3 py-2.5 font-mono text-[#6b7280]">{m.agent_code || '—'}</td>
                      <td className="px-3 py-2.5 text-[#374151]">{Number(m.bank_commission_pct).toFixed(3)}%</td>
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${m.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {m.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center font-semibold text-[#374151]">{m.txn_count ?? 0}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <button onClick={() => openEdit(m)} className="p-1 rounded hover:bg-gray-100" title="Edit"><Edit2 size={12} color="#6b7280" /></button>
                          <button onClick={() => setConfirmBlock(m)} className="p-1 rounded hover:bg-gray-100" title={m.status === 'Active' ? 'Block' : 'Activate'}>
                            {m.status === 'Active' ? <ShieldOff size={12} color="#dc2626" /> : <ShieldCheck size={12} color="#16a34a" />}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded detail row */}
                    {expandedId === m.id && (
                      <tr style={{ background: '#fafafa' }}>
                        <td colSpan={9} className="px-4 py-3">
                          {expandLoading ? (
                            <div className="text-xs text-[#6b7280] py-2">Loading transactions...</div>
                          ) : (
                            <div>
                              <div className="flex gap-4 mb-3">
                                {[['TID', m.tid], ['Account', m.account_name], ['Type', m.machine_type], ['Agent Code', m.agent_code || '—'], ['MDR %', `${Number(m.bank_commission_pct).toFixed(3)}%`]].map(([k, v]) => (
                                  <div key={k} className="bg-white rounded border border-[#e5e7eb] px-3 py-1.5 text-xs">
                                    <div className="text-[10px] text-[#9ca3af]">{k}</div>
                                    <div className="font-semibold text-[#1a1a1a]">{v}</div>
                                  </div>
                                ))}
                                <div className="bg-white rounded border border-[#e5e7eb] px-3 py-1.5 text-xs">
                                  <div className="text-[10px] text-[#9ca3af]">Total Swiped</div>
                                  <div className="font-semibold text-[#16a34a]">{fmtAmt(totalSwipe)}</div>
                                </div>
                                <div className="bg-white rounded border border-[#e5e7eb] px-3 py-1.5 text-xs">
                                  <div className="text-[10px] text-[#9ca3af]">Our Commission</div>
                                  <div className="font-semibold text-[#2563eb]">{fmtAmt(totalComm)}</div>
                                </div>
                              </div>
                              {expandedRows.length === 0 ? (
                                <div className="text-xs text-[#9ca3af]">No transactions yet</div>
                              ) : (
                                <table className="text-xs w-full" style={{ borderCollapse: 'collapse' }}>
                                  <thead>
                                    <tr style={{ background: '#f3f4f6' }}>
                                      {['Date', 'Customer', 'Swipe Amt', 'Our Comm', 'Bank Comm', 'Status'].map(h => (
                                        <th key={h} className="px-2 py-1.5 text-left font-semibold text-[#374151]">{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {expandedRows.map(r => (
                                      <tr key={r.id} className="border-t" style={{ borderColor: '#e5e7eb' }}>
                                        <td className="px-2 py-1.5">{fmtDate(r.date)}</td>
                                        <td className="px-2 py-1.5">{r.customer_name}</td>
                                        <td className="px-2 py-1.5 text-right">{fmtAmt(r.swipe_amount)}</td>
                                        <td className="px-2 py-1.5 text-right text-[#2563eb]">{fmtAmt(r.our_commission)}</td>
                                        <td className="px-2 py-1.5 text-right">{fmtAmt(r.bank_commission)}</td>
                                        <td className="px-2 py-1.5">
                                          <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: '#f3f4f6' }}>{r.status}</span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Block confirm modal */}
      {confirmBlock && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl p-6 w-80">
            <h3 className="font-semibold text-sm text-[#1a1a1a] mb-2">
              {confirmBlock.status === 'Active' ? 'Block' : 'Activate'} {confirmBlock.machine_name}?
            </h3>
            <p className="text-xs text-[#6b7280] mb-4">
              {confirmBlock.status === 'Active'
                ? 'New transactions will not be assigned to this machine.'
                : 'This machine will be available for new transactions.'}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmBlock(null)} className="flex-1 px-3 py-1.5 rounded border text-xs" style={{ borderColor: '#e5e7eb' }}>Cancel</button>
              <button onClick={() => toggleStatus(confirmBlock)} className={`flex-1 px-3 py-1.5 rounded text-xs text-white font-medium ${confirmBlock.status === 'Active' ? 'bg-red-500' : 'bg-[#3ECF8E]'}`}>
                {confirmBlock.status === 'Active' ? 'Block' : 'Activate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit slide-in panel */}
      {showPanel && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setShowPanel(false)} />
          <div className="fixed right-0 top-0 h-full bg-white z-50 flex flex-col" style={{ width: 400, boxShadow: '-4px 0 20px rgba(0,0,0,0.12)' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e7eb]">
              <h2 className="font-semibold text-sm text-[#1a1a1a]">{editMachine ? 'Edit Machine' : 'Add Machine'}</h2>
              <button onClick={() => setShowPanel(false)} className="p-1 hover:bg-gray-100 rounded"><X size={16} color="#6b7280" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
              <div>
                <label className={lb}>Machine Name *</label>
                <input className={inp} style={{ borderColor: '#e5e7eb' }} placeholder="e.g. NSS BONUSHUB" value={form.machine_name} onChange={e => setForm(f => ({ ...f, machine_name: e.target.value }))} />
              </div>
              <div>
                <label className={lb}>TID *</label>
                <input className={inp} style={{ borderColor: '#e5e7eb' }} placeholder="e.g. TID 63012501" value={form.tid} onChange={e => setForm(f => ({ ...f, tid: e.target.value }))} />
              </div>
              <div>
                <label className={lb}>Account Name</label>
                <select className={inp + ' bg-white'} style={{ borderColor: '#e5e7eb' }} value={form.account_name} onChange={e => setForm(f => ({ ...f, account_name: e.target.value }))}>
                  {ACCOUNT_OPTIONS.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className={lb}>Machine Type</label>
                <select className={inp + ' bg-white'} style={{ borderColor: '#e5e7eb' }} value={form.machine_type} onChange={e => setForm(f => ({ ...f, machine_type: e.target.value }))}>
                  {TYPE_OPTIONS.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className={lb}>Agent Code</label>
                <input className={inp} style={{ borderColor: '#e5e7eb' }} placeholder="e.g. AMS019" value={form.agent_code} onChange={e => setForm(f => ({ ...f, agent_code: e.target.value }))} />
              </div>
              <div>
                <label className={lb}>Bank Commission % (3 decimals)</label>
                <input type="number" step="0.001" className={inp} style={{ borderColor: '#e5e7eb' }} value={form.bank_commission_pct} onChange={e => setForm(f => ({ ...f, bank_commission_pct: e.target.value }))} />
              </div>
              <div>
                <label className={lb}>Status</label>
                <div className="flex gap-2">
                  {(['Active', 'Blocked'] as const).map(s => (
                    <button key={s} onClick={() => setForm(f => ({ ...f, status: s }))}
                      className="flex-1 py-1.5 rounded border text-xs font-medium transition-colors"
                      style={{ borderColor: form.status === s ? (s === 'Active' ? '#3ECF8E' : '#ef4444') : '#e5e7eb', background: form.status === s ? (s === 'Active' ? '#d1fae5' : '#fee2e2') : 'white', color: form.status === s ? (s === 'Active' ? '#065f46' : '#991b1b') : '#374151' }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-4 py-3 border-t border-[#e5e7eb]">
              <button onClick={handleSave} disabled={saving} className="w-full py-2 rounded text-sm font-semibold text-white" style={{ background: '#3ECF8E' }}>
                {saving ? 'Saving...' : editMachine ? 'Update Machine' : 'Add Machine'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
