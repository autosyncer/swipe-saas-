'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  Plus, RefreshCw, Pencil, Trash2, Check, X,
  ChevronDown, ChevronUp, Building2, Search,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { logAction } from '@/lib/audit-log'

// ── Types ──────────────────────────────────────────────────────────────────────
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
  is_active: boolean
  created_at: string
}

interface AccountDetails {
  todayAC: Record<string, number> | null
  recentTxns: Array<{
    id: string; sr_no: number; date: string
    customer_name: string; total_amount: number; paid_amount: number; remarks: string
  }>
}

const ACCOUNT_TYPES = ['Current', 'Savings', 'OD', 'CC']
const COMMISSION_TYPES = ['Inclusive', 'Exclusive', 'Deferred']
const MACHINE_TYPE_OPTIONS = ['BONUSHUB','EZETAP','HDFC','FDRL','BOB','INDUS','YES','INSTA','PTM','GPAY','OTHER']

const EMPTY_MACHINE = {
  machine_name: '', tid: '', machine_type: 'BONUSHUB',
  agent_code: '', bank_commission_pct: '1.320',
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

const MOBILE_BANKING_OPTIONS = ['PhonePe', 'Google Pay', 'Paytm'] as const
type MobileBankingApp = typeof MOBILE_BANKING_OPTIONS[number]

const EMPTY_FORM = {
  account_name: '', bank_name: '', account_type: 'Current',
  account_number: '', ifsc_code: '', branch: '',
  commission_pct: '', commission_type: 'Inclusive',
  notes: '', contact_person: '', contact_phone: '',
  opening_balance: '0',
  mobile_banking_enabled: false,
  mobile_banking_app: '' as MobileBankingApp | '',
  mb_phonepay_phone: '', mb_phonepay_upi: '',
  mb_googlepay_phone: '', mb_googlepay_upi: '',
  mb_paytm_phone: '', mb_paytm_upi: '',
  store_name: '', store_address: '', store_bank_name: '',
  store_acc_no: '', store_branch_ifsc: '', store_gst_no: '',
}

interface SwipeMachineLinked {
  id?: string
  machine_name: string
  tid: string
  machine_type: string
  agent_code: string
  bank_commission_pct: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function maskAcctNo(n: string) {
  if (!n) return '—'
  return n.length > 4 ? `****${n.slice(-4)}` : n
}

function inp(extra?: string) {
  return `border border-[#e5e7eb] rounded-md px-3 py-2 text-sm outline-none focus:border-[#3ECF8E] transition-colors w-full ${extra || ''}`
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-[#374151] mb-1">{children}</label>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest mb-3 pb-1 border-b border-[#f3f4f6]">{title}</div>
      {children}
    </div>
  )
}

// ── Slide-in Panel ─────────────────────────────────────────────────────────────
function AccountPanel({
  mode, initial, onClose, onSaved,
}: {
  mode: 'add' | 'edit'
  initial?: BankAccount
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState(() => {
    if (initial) {
      return {
        account_name: initial.account_name,
        bank_name: initial.bank_name || '',
        account_type: initial.account_type || 'Current',
        account_number: initial.account_number || '',
        ifsc_code: initial.ifsc_code || '',
        branch: initial.branch || '',
        commission_pct: String(initial.commission_pct || ''),
        commission_type: initial.commission_type || 'Inclusive',
        notes: initial.notes || '',
        contact_person: initial.contact_person || '',
        contact_phone: initial.contact_phone || '',
        opening_balance: String(initial.opening_balance || 0),
        mobile_banking_enabled: !!((initial as unknown as Record<string,unknown>).mobile_banking_app),
        mobile_banking_app: (((initial as unknown as Record<string,unknown>).mobile_banking_app) as MobileBankingApp | '') || '',
        mb_phonepay_phone: String((initial as unknown as Record<string,unknown>).mb_phonepay_phone || ''),
        mb_phonepay_upi: String((initial as unknown as Record<string,unknown>).mb_phonepay_upi || ''),
        mb_googlepay_phone: String((initial as unknown as Record<string,unknown>).mb_googlepay_phone || ''),
        mb_googlepay_upi: String((initial as unknown as Record<string,unknown>).mb_googlepay_upi || ''),
        mb_paytm_phone: String((initial as unknown as Record<string,unknown>).mb_paytm_phone || ''),
        mb_paytm_upi: String((initial as unknown as Record<string,unknown>).mb_paytm_upi || ''),
        store_name: String((initial as unknown as Record<string,unknown>).store_name || ''),
        store_address: String((initial as unknown as Record<string,unknown>).store_address || ''),
        store_bank_name: String((initial as unknown as Record<string,unknown>).store_bank_name || ''),
        store_acc_no: String((initial as unknown as Record<string,unknown>).store_acc_no || ''),
        store_branch_ifsc: String((initial as unknown as Record<string,unknown>).store_branch_ifsc || ''),
        store_gst_no: String((initial as unknown as Record<string,unknown>).store_gst_no || ''),
      }
    }
    return EMPTY_FORM
  })
  const [machine, setMachine] = useState<SwipeMachineLinked>({ ...EMPTY_MACHINE })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // On edit mode, fetch linked machine
  useEffect(() => {
    if (mode === 'edit' && initial) {
      supabase.from('swipe_machines').select('*').eq('account_name', initial.account_name).maybeSingle()
        .then(({ data }) => {
          if (data) {
            setMachine({ id: data.id, machine_name: data.machine_name, tid: data.tid, machine_type: data.machine_type, agent_code: data.agent_code || '', bank_commission_pct: String(data.bank_commission_pct) })
          }
        })
    }
  }, [mode, initial])

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }
  function setM(k: string, v: string) { setMachine(m => ({ ...m, [k]: v })) }

  async function handleSave() {
    if (!form.account_name.trim()) { setError('Account name is required'); return }
    if (!form.bank_name.trim()) { setError('Bank name is required'); return }
    if (!machine.machine_name.trim() || !machine.tid.trim()) {
      setError('Machine Name and TID are required for the swipe machine'); return
    }
    setError('')
    setSaving(true)

    const accountName = form.account_name.trim().toUpperCase()
    const payload = {
      account_name: accountName,
      bank_name: form.bank_name.trim().toUpperCase(),
      account_type: form.account_type,
      account_number: form.account_number.trim(),
      ifsc_code: form.ifsc_code.trim().toUpperCase(),
      branch: form.branch.trim(),
      commission_pct: parseFloat(form.commission_pct) || 0,
      commission_type: form.commission_type,
      notes: form.notes.trim(),
      contact_person: form.contact_person.trim(),
      contact_phone: form.contact_phone.trim(),
      opening_balance: parseFloat(form.opening_balance) || 0,
      mobile_banking_app: form.mobile_banking_enabled && form.mobile_banking_app ? form.mobile_banking_app : null,
      mb_phonepay_phone: form.mb_phonepay_phone || null,
      mb_phonepay_upi: form.mb_phonepay_upi || null,
      mb_googlepay_phone: form.mb_googlepay_phone || null,
      mb_googlepay_upi: form.mb_googlepay_upi || null,
      mb_paytm_phone: form.mb_paytm_phone || null,
      mb_paytm_upi: form.mb_paytm_upi || null,
      store_name: form.store_name.trim() || null,
      store_address: form.store_address.trim() || null,
      store_bank_name: form.store_bank_name.trim() || null,
      store_acc_no: form.store_acc_no.trim() || null,
      store_branch_ifsc: form.store_branch_ifsc.trim() || null,
      store_gst_no: form.store_gst_no.trim() || null,
      ...(mode === 'add' ? { current_balance: parseFloat(form.opening_balance) || 0, is_active: true } : {}),
    }
    let dbError: { message: string; code?: string } | null = null
    if (mode === 'add') {
      const res = await supabase.from('bank_account_master').insert(payload)
      dbError = res.error
    } else {
      const res = await supabase.from('bank_account_master').update(payload).eq('id', initial!.id)
      dbError = res.error
    }
    if (dbError) {
      setSaving(false)
      setError(dbError.code === '23505' ? 'Account name already exists' : dbError.message)
      return
    }

    // Save linked swipe machine
    if (machine.machine_name.trim() && machine.tid.trim()) {
      const machinePayload = {
        machine_name: machine.machine_name.trim().toUpperCase(),
        tid: machine.tid.trim(),
        account_name: accountName,
        machine_type: machine.machine_type,
        agent_code: machine.agent_code.trim(),
        bank_commission_pct: parseFloat(machine.bank_commission_pct) || 1.320,
        status: 'Active',
      }
      if (machine.id) {
        await supabase.from('swipe_machines').update(machinePayload).eq('id', machine.id)
      } else {
        await supabase.from('swipe_machines').insert(machinePayload)
      }
    }

    setSaving(false)
    logAction({ action: mode === 'add' ? 'Bank Account Added' : 'Bank Account Updated', module: 'Bank Accounts', details: payload }).catch(() => {})
    onSaved()
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      {/* Wide side-by-side panel */}
      <div className="fixed right-0 top-0 h-full z-50 bg-[#f3f4f6] flex flex-col" style={{ width: 860, boxShadow: '-4px 0 24px rgba(0,0,0,0.18)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb] bg-white flex-shrink-0">
          <h2 className="text-base font-bold text-[#1a1a1a]">{mode === 'add' ? 'Add Bank Account + Swipe Machine' : 'Edit Bank Account + Swipe Machine'}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100"><X size={18} color="#6b7280" /></button>
        </div>

        {/* Two column body */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-0 h-full">

            {/* ── LEFT: Bank Account ── */}
            <div className="bg-white border-r border-[#e5e7eb] flex flex-col">
              <div className="px-5 py-3 border-b border-[#f3f4f6] flex-shrink-0">
                <div className="text-[11px] font-bold text-[#3ECF8E] uppercase tracking-widest flex items-center gap-1.5">
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3ECF8E', display: 'inline-block' }} />
                  Bank Account
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4">
                <Section title="Basic Info">
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <Label>Account Name *</Label>
                      <input className={inp()} placeholder="NSS, SKT, RT..." value={form.account_name} onChange={e => set('account_name', e.target.value.toUpperCase())} />
                    </div>
                    <div>
                      <Label>Bank Name *</Label>
                      <input className={inp()} placeholder="HDFC, SBI, FDRL..." value={form.bank_name} onChange={e => set('bank_name', e.target.value.toUpperCase())} />
                    </div>
                  </div>
                  <div>
                    <Label>Account Type</Label>
                    <select className={inp()} value={form.account_type} onChange={e => set('account_type', e.target.value)}>
                      {ACCOUNT_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                </Section>

                <Section title="Account Details">
                  <div className="mb-3">
                    <Label>Account Number</Label>
                    <input className={inp()} placeholder="123456789012" value={form.account_number} onChange={e => set('account_number', e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>IFSC Code</Label>
                      <input className={inp()} placeholder="HDFC0001234" value={form.ifsc_code} onChange={e => set('ifsc_code', e.target.value.toUpperCase())} />
                    </div>
                    <div>
                      <Label>Branch</Label>
                      <input className={inp()} placeholder="Main Branch" value={form.branch} onChange={e => set('branch', e.target.value)} />
                    </div>
                  </div>
                </Section>

                <Section title="Mobile Banking">
                  <div className="flex items-center gap-3 mb-3">
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, mobile_banking_enabled: !f.mobile_banking_enabled, mobile_banking_app: '' }))}
                      className="flex items-center gap-2 text-sm font-medium"
                      style={{ color: form.mobile_banking_enabled ? '#3ECF8E' : '#9ca3af' }}
                    >
                      <span style={{
                        width: 36, height: 20, borderRadius: 10, background: form.mobile_banking_enabled ? '#3ECF8E' : '#d1d5db',
                        display: 'inline-flex', alignItems: 'center', padding: '0 2px', transition: 'background 0.2s', flexShrink: 0,
                      }}>
                        <span style={{
                          width: 16, height: 16, borderRadius: '50%', background: '#fff',
                          transform: form.mobile_banking_enabled ? 'translateX(16px)' : 'translateX(0)',
                          transition: 'transform 0.2s', display: 'block',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                        }} />
                      </span>
                      {form.mobile_banking_enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                  {form.mobile_banking_enabled && (
                    <div className="flex flex-col gap-2">
                      {([
                        { app: 'PhonePe', key: 'phonepay', color: '#5f259f', bg: '#f5f0fb', icon: '📱' },
                        { app: 'Google Pay', key: 'googlepay', color: '#1a73e8', bg: '#f0f6ff', icon: '💳' },
                        { app: 'Paytm', key: 'paytm', color: '#002970', bg: '#f0f4ff', icon: '🔵' },
                      ] as const).map(({ app, key, color, bg, icon }) => {
                        const isSelected = form.mobile_banking_app === app
                        const phoneKey = `mb_${key}_phone` as keyof typeof form
                        const upiKey = `mb_${key}_upi` as keyof typeof form
                        return (
                          <div key={app} style={{ border: `1.5px solid ${isSelected ? color : '#e5e7eb'}`, borderRadius: 8, overflow: 'hidden', transition: 'border-color 0.2s' }}>
                            <button
                              type="button"
                              onClick={() => setForm(f => ({ ...f, mobile_banking_app: isSelected ? '' : app }))}
                              className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
                              style={{ background: isSelected ? bg : '#fafafa', transition: 'background 0.2s' }}
                            >
                              <span style={{ fontSize: 16 }}>{icon}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: isSelected ? color : '#374151' }}>{app}</span>
                              <span style={{ marginLeft: 'auto', width: 16, height: 16, borderRadius: '50%', border: `2px solid ${isSelected ? color : '#d1d5db'}`, background: isSelected ? color : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                {isSelected && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', display: 'block' }} />}
                              </span>
                            </button>
                            {isSelected && (
                              <div style={{ padding: '10px 12px', borderTop: `1px solid ${color}20`, background: bg, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <div>
                                  <Label>Phone Number</Label>
                                  <input className={inp()} placeholder="10-digit mobile number" type="tel"
                                    value={String(form[phoneKey] || '')}
                                    onChange={e => set(phoneKey, e.target.value)} />
                                </div>
                                <div>
                                  <Label>UPI ID</Label>
                                  <input className={inp()} placeholder={`yourname@${key === 'googlepay' ? 'okaxis' : key === 'paytm' ? 'paytm' : 'ybl'}`}
                                    value={String(form[upiKey] || '')}
                                    onChange={e => set(upiKey, e.target.value)} />
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </Section>

                <Section title="Notes">
                  <div>
                    <Label>Notes (optional)</Label>
                    <textarea className={inp()} rows={2} placeholder="Any notes about this account..." value={form.notes} onChange={e => set('notes', e.target.value)} />
                  </div>
                </Section>

                <Section title="Contact">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Contact Person</Label>
                      <input className={inp()} placeholder="Name" value={form.contact_person} onChange={e => set('contact_person', e.target.value)} />
                    </div>
                    <div>
                      <Label>Contact Phone</Label>
                      <input className={inp()} placeholder="9876543210" value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} />
                    </div>
                  </div>
                </Section>

                <Section title="Balance">
                  <div>
                    <Label>Opening Balance (₹)</Label>
                    <input type="number" className={inp()} placeholder="0" value={form.opening_balance} onChange={e => set('opening_balance', e.target.value)} />
                    <p className="text-[10px] text-[#9ca3af] mt-1">Set the initial balance for this account</p>
                  </div>
                </Section>
              </div>
            </div>

            {/* ── RIGHT: Swipe Machine ── */}
            <div className="bg-white flex flex-col">
              <div className="px-5 py-3 border-b border-[#f3f4f6] flex-shrink-0">
                <div className="text-[11px] font-bold uppercase tracking-widest flex items-center gap-1.5" style={{ color: '#6366f1' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1', display: 'inline-block' }} />
                  Swipe Machine
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4">
                <Section title="Machine Info">
                  <div className="mb-3">
                    <Label>Machine Name *</Label>
                    <input className={inp()} placeholder="e.g. NSS BONUSHUB" value={machine.machine_name} onChange={e => setM('machine_name', e.target.value.toUpperCase())} />
                  </div>
                  <div>
                    <Label>TID *</Label>
                    <input className={inp()} placeholder="e.g. TID 63012501" value={machine.tid} onChange={e => setM('tid', e.target.value.toUpperCase())} />
                  </div>
                </Section>

                <Section title="Commission & Agent">
                  <div className="mb-3">
                    <Label>Machine / Bank Code</Label>
                    <input className={inp()} placeholder="e.g. AMS019" value={machine.agent_code} onChange={e => setM('agent_code', e.target.value.toUpperCase())} />
                  </div>
                  <div>
                    <Label>MDR Charges % (3 decimals)</Label>
                    <input type="number" step="0.001" className={inp()} placeholder="1.320" value={machine.bank_commission_pct} onChange={e => setM('bank_commission_pct', e.target.value)} />
                  </div>
                </Section>

                <div className="mt-4 rounded-lg border border-[#e5e7eb] p-3 bg-[#f9fafb] text-xs text-[#6b7280]">
                  <div className="font-semibold text-[#374151] mb-1">Linked to account</div>
                  <div className="font-mono text-[#3ECF8E] font-bold">{form.account_name.trim().toUpperCase() || '—'}</div>
                  <div className="mt-1 text-[10px]">This machine will be automatically linked to the bank account on the left.</div>
                </div>

                {/* Store Details */}
                <div className="mt-4">
                  <div className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest mb-3 pb-1 border-b border-[#f3f4f6]">Store Details</div>
                  <div className="space-y-3">
                    <div>
                      <Label>Store Name</Label>
                      <input className={inp()} placeholder="Mahalaxmi Grain Store" value={form.store_name} onChange={e => setForm(p => ({ ...p, store_name: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Store Address</Label>
                      <textarea className={inp()} rows={3} placeholder="Shop No. 109, Orchid Harmony, Palanpur, Surat" value={form.store_address} onChange={e => setForm(p => ({ ...p, store_address: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Store Bank Name</Label>
                      <input className={inp()} placeholder="BANK OF BARODA CA" value={form.store_bank_name} onChange={e => setForm(p => ({ ...p, store_bank_name: e.target.value }))} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Store A/c No.</Label>
                        <input className={inp()} placeholder="028102000002596" value={form.store_acc_no} onChange={e => setForm(p => ({ ...p, store_acc_no: e.target.value }))} />
                      </div>
                      <div>
                        <Label>Branch &amp; IFSC</Label>
                        <input className={inp()} placeholder="UDHNA SURAT & BARB0UDHNAX" value={form.store_branch_ifsc} onChange={e => setForm(p => ({ ...p, store_branch_ifsc: e.target.value }))} />
                      </div>
                    </div>
                    <div>
                      <Label>GST No.</Label>
                      <input className={inp()} placeholder="27AAAAA0000A1Z5" value={form.store_gst_no} onChange={e => setForm(p => ({ ...p, store_gst_no: e.target.value.toUpperCase() }))} />
                    </div>
                  </div>
                </div>

              </div>
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#e5e7eb] bg-white flex-shrink-0 flex items-center gap-3">
          {error && <div className="flex-1 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
          {!error && <div className="flex-1" />}
          <button onClick={onClose} className="px-5 py-2.5 rounded-lg text-sm font-medium border text-[#374151] hover:bg-gray-50" style={{ borderColor: '#e5e7eb' }}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-8 py-2.5 rounded-lg text-sm font-bold text-white flex items-center gap-2 disabled:opacity-60"
            style={{ background: '#3ECF8E' }}
          >
            {saving ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Plus size={15} />}
            {saving ? 'Saving...' : mode === 'add' ? 'Add Bank Account' : 'Save Changes'}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Delete confirm ─────────────────────────────────────────────────────────────
function DeleteConfirm({ account, onClose, onDeleted }: { account: BankAccount; onClose: () => void; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false)
  async function confirm() {
    setDeleting(true)
    
    await supabase.from('bank_account_master').delete().eq('id', account.id)
    logAction({ action: 'Bank Account Deleted', module: 'Bank Accounts', details: { account_name: account.account_name } }).catch(() => {})
    onDeleted()
    onClose()
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-96">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <Trash2 size={18} color="#ef4444" />
          </div>
          <div>
            <div className="font-bold text-[#1a1a1a]">Delete {account.account_name}?</div>
            <div className="text-sm text-[#6b7280]">This will not delete transactions.</div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border text-sm font-medium text-[#374151] hover:bg-gray-50" style={{ borderColor: '#e5e7eb' }}>Cancel</button>
          <button onClick={confirm} disabled={deleting} className="flex-1 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-60" style={{ background: '#ef4444' }}>
            {deleting ? 'Deleting...' : 'Delete Account'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Expanded row details ───────────────────────────────────────────────────────
function ExpandedDetails({
  account, accounts, details, detailsLoading,
  addAmountType, setAddAmountType, addAmount, setAddAmount, handleAddAmount,
}: {
  account: BankAccount
  accounts: BankAccount[]
  details: AccountDetails | null
  detailsLoading: boolean
  addAmountType: string
  setAddAmountType: (v: string) => void
  addAmount: string
  setAddAmount: (v: string) => void
  handleAddAmount: (name: string) => void
}) {
  const [tab, setTab] = useState<'details' | 'balance'>('details')
  const liveAcc = accounts.find(a => a.id === account.id) || account

  return (
    <tr>
      <td colSpan={9} style={{ padding: 0 }}>
        <div style={{ padding: '0 0 0 0', borderTop: '2px solid #3ECF8E', background: '#f8fffe' }}>
          {/* Tabs */}
          <div className="flex border-b border-[#e5e7eb] px-6 pt-3 gap-0">
            {(['details', 'balance'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className="px-4 py-2 text-xs font-semibold capitalize border-b-2 transition-colors"
                style={{ borderColor: tab === t ? '#3ECF8E' : 'transparent', color: tab === t ? '#1a1a1a' : '#6b7280' }}>
                {t === 'details' ? 'Account Details' : 'Balance & Transactions'}
              </button>
            ))}
          </div>

          <div className="px-6 py-4">
            {tab === 'details' ? (
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Bank Name', value: liveAcc.bank_name || '—' },
                  { label: 'Account Type', value: liveAcc.account_type || '—' },
                  { label: 'Account Number', value: liveAcc.account_number || '—' },
                  { label: 'IFSC Code', value: liveAcc.ifsc_code || '—' },
                  { label: 'Branch', value: liveAcc.branch || '—' },
                  { label: 'Commission %', value: liveAcc.commission_pct ? `${liveAcc.commission_pct}%` : '—' },
                  { label: 'Commission Type', value: liveAcc.commission_type || '—' },
                  { label: 'Contact Person', value: liveAcc.contact_person || '—' },
                  { label: 'Contact Phone', value: liveAcc.contact_phone || '—' },
                ].map(f => (
                  <div key={f.label} className="bg-white rounded-lg border border-[#e5e7eb] p-3">
                    <div className="text-[10px] text-[#9ca3af] uppercase tracking-wide mb-1">{f.label}</div>
                    <div className="text-sm font-semibold text-[#1a1a1a]">{f.value}</div>
                  </div>
                ))}
                {liveAcc.notes && (
                  <div className="col-span-3 bg-white rounded-lg border border-[#e5e7eb] p-3">
                    <div className="text-[10px] text-[#9ca3af] uppercase tracking-wide mb-1">Notes</div>
                    <div className="text-sm text-[#374151]">{liveAcc.notes}</div>
                  </div>
                )}
              </div>
            ) : detailsLoading ? (
              <div className="text-sm text-[#6b7280] text-center py-8">Loading...</div>
            ) : (
              <>
                {/* Balance cards */}
                <div className="grid grid-cols-4 gap-3 mb-5">
                  {[
                    { label: 'Opening Balance', value: liveAcc.opening_balance, color: '#1a1a1a', bg: '#f9fafb' },
                    { label: 'Current Balance', value: liveAcc.current_balance, color: '#3ECF8E', bg: '#f0fdf4' },
                    { label: "Today's Received", value: details?.todayAC?.bal_recd || 0, color: '#3b82f6', bg: '#eff6ff' },
                    { label: "Today's Closing", value: details?.todayAC?.closing_bal || 0, color: Number(details?.todayAC?.closing_bal || 0) >= 0 ? '#16a34a' : '#ef4444', bg: Number(details?.todayAC?.closing_bal || 0) >= 0 ? '#f0fdf4' : '#fef2f2' },
                  ].map(card => (
                    <div key={card.label} style={{ background: card.bg, border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>{card.label}</div>
                      <div style={{ fontSize: 20, fontWeight: 'bold', color: card.color }}>₹{Number(card.value).toLocaleString('en-IN')}</div>
                    </div>
                  ))}
                </div>

                {/* Add amount */}
                <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
                  <div className="text-sm font-semibold text-[#1a1a1a] mb-3">Add Amount to AC Sheet (Today)</div>
                  <div className="flex gap-2 items-center flex-wrap">
                    <select value={addAmountType} onChange={e => setAddAmountType(e.target.value)}
                      className="border border-[#e5e7eb] rounded-lg px-3 py-2 text-xs outline-none focus:border-[#3ECF8E] bg-white">
                      {ADD_AMOUNT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <input type="number" placeholder="Amount (₹)..." value={addAmount} onChange={e => setAddAmount(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleAddAmount(account.account_name) }}
                      className="border border-[#e5e7eb] rounded-lg px-3 py-2 text-xs outline-none focus:border-[#3ECF8E]" style={{ width: 150 }} />
                    <button onClick={() => handleAddAmount(account.account_name)}
                      className="px-5 py-2 rounded-lg text-xs font-bold text-white" style={{ background: '#3ECF8E' }}>
                      Add
                    </button>
                  </div>
                </div>

                {/* Recent txns */}
                <div className="text-sm font-semibold text-[#1a1a1a] mb-3">Recent Transactions — Last 7 Days</div>
                {details && details.recentTxns.length > 0 ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#FFFF00' }}>
                        {['SR', 'DATE', 'CUSTOMER', 'TOTAL', 'PAID', 'REMARKS'].map(h => (
                          <th key={h} style={{ border: '1px solid #000', padding: '5px 8px', textAlign: h === 'CUSTOMER' ? 'left' : 'center', fontWeight: 'bold' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {details.recentTxns.map(t => (
                        <tr key={t.id}>
                          <td style={{ border: '1px solid #d1d5db', padding: '4px 8px', textAlign: 'center', color: '#6b7280' }}>{t.sr_no}</td>
                          <td style={{ border: '1px solid #d1d5db', padding: '4px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>{t.date}</td>
                          <td style={{ border: '1px solid #d1d5db', padding: '4px 8px', fontWeight: 500 }}>{t.customer_name}</td>
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
                  <div className="text-sm text-[#9ca3af]">No recent transactions for this account.</div>
                )}
              </>
            )}
          </div>
        </div>
      </td>
    </tr>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function BankAccountsPage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // Panel
  const [panel, setPanel] = useState<{ mode: 'add' | 'edit'; account?: BankAccount } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<BankAccount | null>(null)

  // Expand
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [accountDetails, setAccountDetails] = useState<AccountDetails | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)

  // Add amount
  const [addAmountType, setAddAmountType] = useState('bal_recd')
  const [addAmount, setAddAmount] = useState('')

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const fetchAccounts = useCallback(async () => {
    setLoading(true)
    
    const { data } = await supabase.from('bank_account_master').select('*').order('account_name')
    setAccounts((data as BankAccount[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAccounts() }, [fetchAccounts])

  async function refreshExpandedAccount(accountName: string) {
    
    const today = new Date().toISOString().split('T')[0]
    const last7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const [{ data: todayAC }, { data: recentTxns }] = await Promise.all([
      supabase.from('ac_sheet').select('*').eq('account_name', accountName).eq('date', today).maybeSingle(),
      supabase.from('transactions').select('id,sr_no,date,customer_name,total_amount,paid_amount,remarks').ilike('account_name', `%${accountName}%`).gte('date', last7).order('date', { ascending: false }).limit(10),
    ])
    setAccountDetails({ todayAC: todayAC as Record<string, number> | null, recentTxns: recentTxns || [] })
  }

  async function toggleStatus(e: React.MouseEvent, acc: BankAccount) {
    e.stopPropagation()
    
    await supabase.from('bank_account_master').update({ is_active: !acc.is_active }).eq('id', acc.id)
    showToast(acc.is_active ? `${acc.account_name} deactivated` : `${acc.account_name} activated`, 'success')
    fetchAccounts()
  }

  async function expandAccount(acc: BankAccount) {
    if (expandedId === acc.id) { setExpandedId(null); setAccountDetails(null); return }
    setExpandedId(acc.id)
    setDetailsLoading(true)
    setAccountDetails(null)
    await refreshExpandedAccount(acc.account_name)
    setDetailsLoading(false)
  }

  async function handleAddAmount(accountName: string) {
    if (!addAmount || parseFloat(addAmount) <= 0) { showToast('Enter valid amount', 'error'); return }
    
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
        const { error } = await supabase.from('ac_sheet').update({ [addAmountType]: updated[addAmountType], avai_bal: updated.avai_bal, closing_bal: updated.closing_bal }).eq('id', (existing as { id: string }).id)
        if (error) throw error
      } else {
        const { data: prev } = await supabase.from('ac_sheet').select('closing_bal').eq('account_name', accountName).lt('date', today).order('date', { ascending: false }).limit(1)
        const openBal = Number(prev?.[0]?.closing_bal) || 0
        const newRow: Record<string, unknown> = { date: today, account_name: accountName, open_bal: openBal, bal_recd: 0, trn_bal_recd: 0, atm_withd: 0, withd: 0, transf: 0, cc_pay: 0, cust_trf: 0, charges: 0, [addAmountType]: amount }
        newRow.avai_bal = (Number(newRow.open_bal) || 0) + (Number(newRow.bal_recd) || 0) + (Number(newRow.trn_bal_recd) || 0)
        newRow.closing_bal = Number(newRow.avai_bal) - (Number(newRow.atm_withd) || 0) - (Number(newRow.withd) || 0) - (Number(newRow.transf) || 0) - (Number(newRow.cc_pay) || 0) - (Number(newRow.cust_trf) || 0) - (Number(newRow.charges) || 0)
        newClosingBal = Number(newRow.closing_bal)
        const { error } = await supabase.from('ac_sheet').insert(newRow)
        if (error) throw error
      }
      await supabase.from('bank_account_master').update({ current_balance: newClosingBal }).eq('account_name', accountName)
      showToast(`₹${amount.toLocaleString('en-IN')} added to ${accountName}!`, 'success')
      setAddAmount('')
      setDetailsLoading(true)
      await Promise.all([refreshExpandedAccount(accountName), fetchAccounts()])
      setDetailsLoading(false)
      logAction({ action: 'Amount Added to Account', module: 'Bank Accounts', details: { account: accountName, type: addAmountType, amount } }).catch(() => {})
    } catch (err: unknown) {
      showToast('Failed: ' + (err instanceof Error ? err.message : String(err)), 'error')
    }
  }

  // Filtered accounts
  const filtered = accounts.filter(acc => {
    const q = search.toLowerCase()
    const matchSearch = !q || acc.account_name.toLowerCase().includes(q) || (acc.bank_name || '').toLowerCase().includes(q)
    const matchStatus = statusFilter === 'all' || (statusFilter === 'active' ? acc.is_active : !acc.is_active)
    return matchSearch && matchStatus
  })

  const activeCount = accounts.filter(a => a.is_active).length

  return (
    <div className="flex flex-col h-full gap-0 -mt-2">

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium text-white"
          style={{ background: toast.type === 'success' ? '#3ECF8E' : '#ef4444' }}>
          {toast.type === 'success' ? <Check size={15} /> : <X size={15} />}
          {toast.msg}
        </div>
      )}

      {/* Slide-in panel */}
      {panel && (
        <AccountPanel
          mode={panel.mode}
          initial={panel.account}
          onClose={() => setPanel(null)}
          onSaved={() => { fetchAccounts(); showToast(panel.mode === 'add' ? 'Account added!' : 'Account updated!', 'success') }}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <DeleteConfirm account={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={() => { fetchAccounts(); showToast('Account deleted', 'success') }} />
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: '#f0fdf4', border: '1px solid #3ECF8E' }}>
            <Building2 size={18} color="#3ECF8E" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#1a1a1a]">Bank Accounts</h1>
            <p className="text-xs text-[#6b7280]">Manage bank accounts and track daily balances</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#6b7280] bg-[#f3f4f6] px-2.5 py-1 rounded-md">
            {activeCount} active · {accounts.length} total
          </span>
          <button onClick={fetchAccounts} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium hover:bg-gray-50" style={{ borderColor: '#e5e7eb', color: '#374151' }}>
            <RefreshCw size={12} /> Refresh
          </button>
          <button onClick={() => setPanel({ mode: 'add' })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white" style={{ background: '#3ECF8E' }}>
            <Plus size={13} /> Add Account
          </button>
        </div>
      </div>

      {/* Empty state */}
      {!loading && accounts.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: '#f3f4f6' }}>
            <Building2 size={36} color="#9ca3af" />
          </div>
          <div className="text-center">
            <div className="text-base font-semibold text-[#1a1a1a] mb-1">No bank accounts yet</div>
            <div className="text-sm text-[#6b7280] mb-5">Add your first bank account to get started</div>
            <button onClick={() => setPanel({ mode: 'add' })} className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold text-white mx-auto" style={{ background: '#3ECF8E' }}>
              <Plus size={16} /> Add Account
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#e5e7eb] flex flex-col overflow-hidden flex-1" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>

          {/* Search + filter toolbar */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[#e5e7eb] flex-shrink-0">
            <div className="flex items-center gap-2 flex-1 border border-[#e5e7eb] rounded-lg px-3 py-1.5">
              <Search size={13} color="#9ca3af" />
              <input
                className="flex-1 text-xs outline-none bg-transparent"
                placeholder="Search by account name or bank..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && <button onClick={() => setSearch('')}><X size={12} color="#9ca3af" /></button>}
            </div>
            <div className="flex items-center gap-1">
              {(['all', 'active', 'inactive'] as const).map(f => (
                <button key={f} onClick={() => setStatusFilter(f)}
                  className="px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors"
                  style={{
                    background: statusFilter === f ? '#3ECF8E' : '#f3f4f6',
                    color: statusFilter === f ? '#fff' : '#374151',
                  }}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-48 text-sm text-[#6b7280]">Loading accounts...</div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-[#9ca3af]">No accounts match your search</div>
          ) : (
            <div className="overflow-auto flex-1">
              <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                <thead className="sticky top-0 z-10" style={{ background: '#f9f9f9' }}>
                  <tr>
                    {['', 'Account Name', 'Bank Name', 'Account No', 'IFSC', 'Branch', 'Commission %', 'Current Balance', 'Status', 'Actions'].map(h => (
                      <th key={h} className="px-3 py-3 text-left font-semibold text-[#6b7280] border-b border-[#e5e7eb] text-[10px] uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((acc, idx) => (
                    <React.Fragment key={acc.id}>
                      <tr
                        className="border-b border-[#f3f4f6] hover:bg-[#f9fafb] cursor-pointer transition-colors"
                        style={{ background: expandedId === acc.id ? '#f0fdf4' : idx % 2 === 0 ? '#fff' : '#fafafa' }}
                        onClick={() => expandAccount(acc)}
                      >
                        <td className="px-3 py-3 text-[#9ca3af]">
                          {expandedId === acc.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </td>
                        <td className="px-3 py-3 font-bold text-[#1a1a1a]">{acc.account_name}</td>
                        <td className="px-3 py-3 text-[#374151]">{acc.bank_name || '—'}</td>
                        <td className="px-3 py-3 font-mono text-[#6b7280]">{maskAcctNo(acc.account_number)}</td>
                        <td className="px-3 py-3 text-[#6b7280]">{acc.ifsc_code || '—'}</td>
                        <td className="px-3 py-3 text-[#6b7280]">{acc.branch || '—'}</td>
                        <td className="px-3 py-3 font-semibold" style={{ color: '#1F4E79' }}>
                          {acc.commission_pct ? `${Number(acc.commission_pct).toFixed(3)}%` : '—'}
                        </td>
                        <td className="px-3 py-3 font-semibold" style={{ color: Number(acc.current_balance) >= 0 ? '#3ECF8E' : '#ef4444' }}>
                          ₹{Number(acc.current_balance || 0).toLocaleString('en-IN')}
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
                            style={{ background: acc.is_active ? '#d1fae5' : '#f3f4f6', color: acc.is_active ? '#065f46' : '#6b7280' }}>
                            {acc.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                            <button onClick={e => { e.stopPropagation(); setPanel({ mode: 'edit', account: acc }) }}
                              className="text-[#9ca3af] hover:text-[#3ECF8E] transition-colors" title="Edit">
                              <Pencil size={13} />
                            </button>
                            <button onClick={e => toggleStatus(e, acc)}
                              className="text-xs font-medium underline"
                              style={{ color: acc.is_active ? '#d97706' : '#16a34a' }}>
                              {acc.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                            <button onClick={e => { e.stopPropagation(); setDeleteTarget(acc) }}
                              className="text-[#9ca3af] hover:text-red-500 transition-colors" title="Delete">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {expandedId === acc.id && (
                        <ExpandedDetails
                          account={acc}
                          accounts={accounts}
                          details={accountDetails}
                          detailsLoading={detailsLoading}
                          addAmountType={addAmountType}
                          setAddAmountType={setAddAmountType}
                          addAmount={addAmount}
                          setAddAmount={setAddAmount}
                          handleAddAmount={handleAddAmount}
                        />
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
