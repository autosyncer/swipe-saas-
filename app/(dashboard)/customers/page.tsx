'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Plus, X, Edit, RefreshCw, ChevronDown, ChevronRight, CreditCard, Building2, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { Customer, Transaction, Card, CustomerBankAccount } from '@/types/database'

// ── helpers ──────────────────────────────────────────────────────────────────
function maskCard(num: string) {
  if (!num || num.length < 4) return num
  return 'XXXX-XXXX-XXXX-' + num.slice(-4)
}
function maskAcct(num: string) {
  if (!num || num.length < 4) return num
  return 'XXXXXXXX' + num.slice(-4)
}
function formatCardInput(v: string) {
  return v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1-').replace(/-$/, '')
}
function lastFour(num: string) {
  const digits = num.replace(/\D/g, '')
  return digits.slice(-4) || ''
}
function fmtDue(d?: string) {
  if (!d) return ''
  try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) } catch { return d }
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    PAID: { bg: '#d1fae5', color: '#065f46' },
    PEND: { bg: '#fef3c7', color: '#92400e' },
    PURU: { bg: '#dbeafe', color: '#1e40af' },
    UNPAID: { bg: '#fee2e2', color: '#991b1b' },
    SE: { bg: '#ffedd5', color: '#9a3412' },
    CANCEL: { bg: '#f3f4f6', color: '#374151' },
  }
  const s = map[status?.toUpperCase()] || { bg: '#f3f4f6', color: '#374151' }
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: s.bg, color: s.color }}>{status}</span>
}

// ── blank templates ───────────────────────────────────────────────────────────
function blankCard(): Omit<Card, 'id' | 'customer_id'> & { _key: string; _expanded: boolean } {
  return { _key: Math.random().toString(36).slice(2), _expanded: true, card_nickname: '', bank_name: '', card_number: '', last4: '', pin: '', cvv: '', expiry: '', due_date: '', card_type: 'Credit' }
}
function blankAcct(): Omit<CustomerBankAccount, 'id' | 'customer_id'> & { _key: string } {
  return { _key: Math.random().toString(36).slice(2), bank_name: '', account_number: '', ifsc_code: '', account_type: 'Savings' }
}

type DraftCard = ReturnType<typeof blankCard> & { id?: string }
type DraftAcct = ReturnType<typeof blankAcct> & { id?: string }

const inputCls = 'w-full rounded border px-2.5 py-1.5 text-xs outline-none focus:border-[#3ECF8E] transition-colors bg-white'
const labelCls = 'block text-[11px] font-medium text-[#6b7280] mb-0.5'

// ── Card block component ──────────────────────────────────────────────────────
function CardBlock({
  card, onChange, onRemove,
}: {
  card: DraftCard
  onChange: (updates: Partial<DraftCard>) => void
  onRemove: () => void
}) {
  const collapsed = !card._expanded
  const title = card.card_nickname || (card.bank_name ? `${card.bank_name}${card.last4 ? ` ...${card.last4}` : ''}` : 'New Card')
  const subtitle = card.due_date ? `Due: ${fmtDue(card.due_date)}` : card.expiry ? `Exp: ${card.expiry}` : ''

  return (
    <div className="border rounded-lg overflow-hidden" style={{ borderColor: '#e5e7eb' }}>
      {/* header */}
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-50"
        style={{ background: collapsed ? '#f9f9f9' : '#fff' }}
        onClick={() => onChange({ _expanded: !card._expanded })}
      >
        <div className="flex items-center gap-2">
          <CreditCard size={14} color="#3ECF8E" />
          <span className="text-xs font-semibold text-[#1a1a1a]">{title}</span>
          {subtitle && <span className="text-[10px] text-[#6b7280]">— {subtitle}</span>}
          {card.card_type && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#eff6ff', color: '#1d4ed8' }}>{card.card_type}</span>}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={e => { e.stopPropagation(); onRemove() }} className="p-1 hover:bg-red-50 rounded">
            <Trash2 size={12} color="#ef4444" />
          </button>
          {collapsed ? <ChevronRight size={14} color="#9ca3af" /> : <ChevronDown size={14} color="#9ca3af" />}
        </div>
      </div>

      {/* body */}
      {!collapsed && (
        <div className="px-3 pb-3 pt-2 grid grid-cols-2 gap-2 border-t" style={{ borderColor: '#f3f4f6' }}>
          <div>
            <label className={labelCls}>Card Nickname</label>
            <input className={inputCls} style={{ borderColor: '#e5e7eb' }} placeholder="e.g. AXIS Personal" value={card.card_nickname || ''} onChange={e => onChange({ card_nickname: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Bank Name</label>
            <input className={inputCls} style={{ borderColor: '#e5e7eb' }} placeholder="AXIS, HDFC, RBL..." value={card.bank_name} onChange={e => onChange({ bank_name: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Card Number</label>
            <input
              className={inputCls} style={{ borderColor: '#e5e7eb' }}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              value={card.card_number || ''}
              onChange={e => {
                const formatted = formatCardInput(e.target.value)
                onChange({ card_number: formatted, last4: lastFour(formatted) })
              }}
              maxLength={19}
            />
          </div>
          <div>
            <label className={labelCls}>Last 4 Digits</label>
            <input className={inputCls} style={{ borderColor: '#e5e7eb' }} placeholder="Auto from card no." value={card.last4} onChange={e => onChange({ last4: e.target.value.slice(-4) })} maxLength={4} />
          </div>
          <div>
            <label className={labelCls}>Card Type</label>
            <select className={inputCls} style={{ borderColor: '#e5e7eb' }} value={card.card_type || 'Credit'} onChange={e => onChange({ card_type: e.target.value })}>
              <option>Credit</option><option>Debit</option><option>Prepaid</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>PIN</label>
            <input className={inputCls} style={{ borderColor: '#e5e7eb' }} placeholder="••••" type="password" value={card.pin || ''} onChange={e => onChange({ pin: e.target.value })} maxLength={6} />
          </div>
          <div>
            <label className={labelCls}>CVV</label>
            <input className={inputCls} style={{ borderColor: '#e5e7eb' }} placeholder="•••" type="password" value={card.cvv || ''} onChange={e => onChange({ cvv: e.target.value })} maxLength={4} />
          </div>
          <div>
            <label className={labelCls}>Expiry (MM/YY)</label>
            <input className={inputCls} style={{ borderColor: '#e5e7eb' }} placeholder="12/27" value={card.expiry || ''} onChange={e => onChange({ expiry: e.target.value })} maxLength={5} />
          </div>
          <div>
            <label className={labelCls}>Due Date</label>
            <input className={`${inputCls} bg-white`} style={{ borderColor: '#e5e7eb' }} type="date" value={card.due_date || ''} onChange={e => onChange({ due_date: e.target.value })} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Account row ───────────────────────────────────────────────────────────────
function AcctRow({ acct, onChange, onRemove }: { acct: DraftAcct; onChange: (u: Partial<DraftAcct>) => void; onRemove: () => void }) {
  return (
    <div className="grid grid-cols-5 gap-2 items-end">
      <div>
        <label className={labelCls}>Bank</label>
        <input className={inputCls} style={{ borderColor: '#e5e7eb' }} placeholder="HDFC" value={acct.bank_name} onChange={e => onChange({ bank_name: e.target.value })} />
      </div>
      <div>
        <label className={labelCls}>Account No.</label>
        <input className={inputCls} style={{ borderColor: '#e5e7eb' }} placeholder="0001234567" value={acct.account_number} onChange={e => onChange({ account_number: e.target.value })} />
      </div>
      <div>
        <label className={labelCls}>IFSC</label>
        <input className={inputCls} style={{ borderColor: '#e5e7eb' }} placeholder="HDFC0001234" value={acct.ifsc_code} onChange={e => onChange({ ifsc_code: e.target.value })} />
      </div>
      <div>
        <label className={labelCls}>Type</label>
        <select className={inputCls} style={{ borderColor: '#e5e7eb' }} value={acct.account_type} onChange={e => onChange({ account_type: e.target.value })}>
          <option>Savings</option><option>Current</option><option>OD</option>
        </select>
      </div>
      <div className="pb-0.5">
        <button type="button" onClick={onRemove} className="w-full py-1.5 rounded border text-xs text-red-500 hover:bg-red-50" style={{ borderColor: '#fca5a5' }}>
          <Trash2 size={12} className="inline mr-1" />Remove
        </button>
      </div>
    </div>
  )
}

// ── Customer panel (add/edit) ─────────────────────────────────────────────────
function CustomerPanel({
  customer, onClose, onSaved, onDeleteRequest,
}: {
  customer: Customer | null
  onClose: () => void
  onSaved: () => void
  onDeleteRequest?: (c: Customer) => void
}) {
  const isEdit = !!customer
  const [basic, setBasic] = useState({ name: customer?.name || '', phone: customer?.phone || '', charge: String(customer?.default_charge_pct || '2.2') })
  const [cards, setCards] = useState<DraftCard[]>([])
  const [accts, setAccts] = useState<DraftAcct[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!isEdit || !customer) return
    // Load existing cards
    supabase.from('cards').select('*').eq('customer_id', customer.id).then(({ data }) => {
      if (data) setCards((data as Card[]).map(c => ({ ...c, _key: c.id, _expanded: false })))
    })
    // Load existing bank accounts
    supabase.from('customer_bank_accounts').select('*').eq('customer_id', customer.id).then(({ data }) => {
      if (data) setAccts((data as CustomerBankAccount[]).map(a => ({ ...a, _key: a.id })))
    })
  }, [customer, isEdit])

  function updateCard(key: string, updates: Partial<DraftCard>) {
    setCards(cs => cs.map(c => c._key === key ? { ...c, ...updates } : c))
  }
  function removeCard(key: string) {
    setCards(cs => cs.filter(c => c._key !== key))
  }
  function updateAcct(key: string, updates: Partial<DraftAcct>) {
    setAccts(as => as.map(a => a._key === key ? { ...a, ...updates } : a))
  }
  function removeAcct(key: string) {
    setAccts(as => as.filter(a => a._key !== key))
  }

  async function handleSave() {
    if (!basic.name || !basic.phone) { setError('Name and phone are required'); return }
    setSaving(true); setError(null)

    try {
      let customerId = customer?.id

      if (isEdit && customer) {
        const { error: ue } = await supabaseAdmin.from('customers').update({
          name: basic.name, phone: basic.phone,
          default_charge_pct: parseFloat(basic.charge) || 2.2,
        }).eq('id', customer.id)
        if (ue) throw new Error('Update customer failed: ' + ue.message)
      } else {
        const { data: cd, error: ce } = await supabaseAdmin.from('customers').insert({
          name: basic.name, phone: basic.phone,
          default_charge_pct: parseFloat(basic.charge) || 2.2,
          outstanding_balance: 0,
        }).select('id').single()
        if (ce || !cd) throw new Error('Create customer failed: ' + (ce?.message || 'unknown'))
        customerId = (cd as { id: string }).id
      }

      console.log('[save] customerId =', customerId)

      // Cards: delete all existing, then insert fresh
      if (isEdit && customer) {
        const { error: de } = await supabaseAdmin.from('cards').delete().eq('customer_id', customer.id)
        if (de) console.error('[save] delete cards error:', de.message)
      }
      const validCards = cards.filter(c => c.bank_name)
      for (const c of validCards) {
        const last4val = c.last4 || lastFour(c.card_number || '')
        const { error: ce } = await supabaseAdmin.from('cards').insert({
          customer_id: customerId!,
          card_nickname: c.card_nickname ?? '',
          bank_name: c.bank_name,
          card_number: c.card_number ?? '',
          last4: last4val,
          pin: c.pin ?? '',
          cvv: c.cvv ?? '',
          expiry: c.expiry ?? '',
          due_date: c.due_date || null,
          card_type: c.card_type ?? 'Credit',
          is_active: true,
        })
        if (ce) throw new Error('Save card failed: ' + ce.message)
        console.log('[save] card inserted:', c.bank_name, last4val)
      }

      // Bank accounts: delete all existing, then insert fresh
      if (isEdit && customer) {
        const { error: dae } = await supabaseAdmin.from('customer_bank_accounts').delete().eq('customer_id', customer.id)
        if (dae) console.error('[save] delete accounts error:', dae.message)
      }
      const validAccts = accts.filter(a => a.bank_name || a.account_number)
      for (const a of validAccts) {
        const { error: ae } = await supabaseAdmin.from('customer_bank_accounts').insert({
          customer_id: customerId!,
          bank_name: a.bank_name || '',
          account_number: a.account_number || '',
          ifsc_code: a.ifsc_code || '',
          account_type: a.account_type || 'Savings',
        })
        if (ae) throw new Error('Save bank account failed: ' + ae.message)
        console.log('[save] account inserted:', a.bank_name)
      }

      console.log('[save] done — cards:', validCards.length, 'accounts:', validAccts.length)
      setSaving(false)
      setToast(`Saved with ${validCards.length} card(s) and ${validAccts.length} account(s)`)
      setTimeout(() => { onSaved(); onClose() }, 1200)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error('[save] error:', msg)
      setError(msg)
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full bg-white z-50 flex flex-col" style={{ width: 520, boxShadow: '-4px 0 20px rgba(0,0,0,0.12)' }}>
        {/* header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5e7eb] flex-shrink-0">
          <h2 className="font-semibold text-[#1a1a1a]">{isEdit ? `Edit — ${customer?.name}` : 'Add Customer'}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} color="#6b7280" /></button>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded">{error}</div>}
          {toast && <div className="bg-green-50 border border-green-200 text-green-700 text-xs px-3 py-2 rounded">{toast}</div>}

          {/* Basic info */}
          <div>
            <div className="text-xs font-semibold text-[#374151] uppercase mb-2 tracking-wide">Basic Info</div>
            <div className="grid grid-cols-2 gap-3">
              {([
                { label: 'Full Name *', field: 'name', placeholder: 'e.g. Ramesh Patel', col: 2 },
                { label: 'Phone *', field: 'phone', placeholder: '9876543210', col: 1 },
                { label: 'Default Charge %', field: 'charge', placeholder: '2.2', col: 1 },
              ] as { label: string; field: string; placeholder: string; col: number }[]).map(({ label, field, placeholder, col }) => (
                <div key={field} className={col === 2 ? 'col-span-2' : ''}>
                  <label className="block text-xs font-medium text-[#374151] mb-1">{label}</label>
                  <input
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-[#3ECF8E]"
                    style={{ borderColor: '#e5e7eb' }}
                    placeholder={placeholder}
                    value={(basic as Record<string, string>)[field]}
                    onChange={e => setBasic(p => ({ ...p, [field]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Bank Accounts */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-[#374151] uppercase tracking-wide flex items-center gap-1">
                <Building2 size={13} /> Bank Accounts
              </div>
              <button
                type="button"
                className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded border"
                style={{ borderColor: '#3ECF8E', color: '#3ECF8E' }}
                onClick={() => setAccts(a => [...a, blankAcct()])}
              >
                <Plus size={11} /> Add Account
              </button>
            </div>
            {accts.length === 0
              ? <div className="text-xs text-[#9ca3af] py-2">No bank accounts added yet</div>
              : <div className="flex flex-col gap-2">
                  {accts.map(a => (
                    <AcctRow key={a._key} acct={a} onChange={u => updateAcct(a._key, u)} onRemove={() => removeAcct(a._key)} />
                  ))}
                </div>
            }
          </div>

          {/* Cards */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-[#374151] uppercase tracking-wide flex items-center gap-1">
                <CreditCard size={13} /> Cards on File
              </div>
              <button
                type="button"
                className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded border"
                style={{ borderColor: '#3ECF8E', color: '#3ECF8E' }}
                onClick={() => setCards(c => [...c, blankCard()])}
              >
                <Plus size={11} /> Add Card
              </button>
            </div>
            {cards.length === 0
              ? <div className="text-xs text-[#9ca3af] py-2">No cards added yet</div>
              : <div className="flex flex-col gap-2">
                  {cards.map(c => (
                    <CardBlock key={c._key} card={c} onChange={u => updateCard(c._key, u)} onRemove={() => removeCard(c._key)} />
                  ))}
                </div>
            }
          </div>
        </div>

        {/* footer */}
        <div className="px-5 py-4 border-t border-[#e5e7eb] flex gap-3 flex-shrink-0">
          {isEdit && customer && onDeleteRequest && (
            <button
              type="button"
              onClick={() => onDeleteRequest(customer)}
              className="px-3 py-2 rounded-md border text-sm font-medium text-red-500 hover:bg-red-50 flex items-center gap-1"
              style={{ borderColor: '#fca5a5' }}
            >
              <Trash2 size={14} /> Delete
            </button>
          )}
          <button onClick={() => { onClose(); setError(null) }} className="flex-1 py-2 rounded-md border text-sm font-medium text-[#374151]" style={{ borderColor: '#e5e7eb' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2 rounded-md text-sm font-medium text-white disabled:opacity-60" style={{ background: '#3ECF8E' }}>
            {saving ? 'Saving...' : 'Save Customer'}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Expanded detail row ───────────────────────────────────────────────────────
function ExpandedRow({
  customer, txns,
}: {
  customer: Customer
  txns: Transaction[]
}) {
  const [tab, setTab] = useState<'cards' | 'accounts'>('cards')
  const [cards, setCards] = useState<Card[]>([])
  const [accts, setAccts] = useState<CustomerBankAccount[]>([])

  useEffect(() => {
    supabase.from('cards').select('*').eq('customer_id', customer.id).then(({ data }) => setCards((data as Card[]) || []))
    supabase.from('customer_bank_accounts').select('*').eq('customer_id', customer.id).then(({ data }) => setAccts((data as CustomerBankAccount[]) || []))
  }, [customer.id])

  async function deleteCard(id: string) {
    await supabase.from('cards').delete().eq('id', id)
    setCards(cs => cs.filter(c => c.id !== id))
  }
  async function deleteAcct(id: string) {
    await supabaseAdmin.from('customer_bank_accounts').delete().eq('id', id)
    setAccts(as => as.filter(a => a.id !== id))
  }

  return (
    <tr>
      <td colSpan={7} className="px-6 py-4 bg-[#f9f9f9] border-b border-[#e5e7eb]">
        <div className="grid grid-cols-4 gap-6 mb-4">
          <div>
            <div className="text-xs font-semibold text-[#6b7280] uppercase mb-1">Name</div>
            <div className="text-sm font-medium">{customer.name}</div>
            <div className="text-xs text-[#6b7280] mt-0.5">{customer.phone}</div>
            <div className="text-xs text-[#6b7280]">{customer.phone}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-[#6b7280] uppercase mb-1">Commission</div>
            <div className="text-sm font-medium">{customer.default_charge_pct}%</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-[#6b7280] uppercase mb-1">Outstanding</div>
            <div className="text-lg font-bold text-[#1a1a1a]">₹{customer.outstanding_balance.toLocaleString('en-IN')}</div>
            <button className="mt-1 px-2.5 py-1 rounded text-xs font-medium text-white" style={{ background: '#3ECF8E' }}>Mark Paid</button>
          </div>
          <div>
            <div className="text-xs font-semibold text-[#6b7280] uppercase mb-1">Joined</div>
            <div className="text-sm">{customer.created_at ? new Date(customer.created_at).toLocaleDateString('en-IN') : '—'}</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-3 border-b border-[#e5e7eb]">
          {(['cards', 'accounts'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-3 py-1.5 text-xs font-medium capitalize transition-colors"
              style={{
                borderBottom: tab === t ? '2px solid #3ECF8E' : '2px solid transparent',
                color: tab === t ? '#3ECF8E' : '#6b7280',
              }}
            >
              {t === 'cards' ? `Cards (${cards.length})` : `Bank Accounts (${accts.length})`}
            </button>
          ))}
        </div>

        {tab === 'cards' && (
          <table className="w-full text-xs">
            <thead><tr className="border-b border-[#e5e7eb]">
              {['Nickname', 'Bank', 'Card No', 'Expiry', 'Due Date', 'Type', 'Actions'].map(h => (
                <th key={h} className="px-3 py-1.5 text-left font-semibold text-[#6b7280]">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {cards.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-3 text-center text-[#9ca3af]">No cards on file</td></tr>
              ) : cards.map(c => (
                <tr key={c.id} className="border-b border-[#f3f4f6] hover:bg-white">
                  <td className="px-3 py-2">{c.card_nickname || '—'}</td>
                  <td className="px-3 py-2 font-medium">{c.bank_name}</td>
                  <td className="px-3 py-2 font-mono">{maskCard(c.card_number || c.last4)}</td>
                  <td className="px-3 py-2">{c.expiry || '—'}</td>
                  <td className="px-3 py-2">{fmtDue(c.due_date)}</td>
                  <td className="px-3 py-2">{c.card_type || 'Credit'}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => deleteCard(c.id)} className="p-1 hover:bg-red-50 rounded text-red-500">
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'accounts' && (
          <table className="w-full text-xs">
            <thead><tr className="border-b border-[#e5e7eb]">
              {['Bank', 'Account No', 'IFSC', 'Type', 'Actions'].map(h => (
                <th key={h} className="px-3 py-1.5 text-left font-semibold text-[#6b7280]">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {accts.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-3 text-center text-[#9ca3af]">No bank accounts on file</td></tr>
              ) : accts.map(a => (
                <tr key={a.id} className="border-b border-[#f3f4f6] hover:bg-white">
                  <td className="px-3 py-2 font-medium">{a.bank_name}</td>
                  <td className="px-3 py-2 font-mono">{maskAcct(a.account_number)}</td>
                  <td className="px-3 py-2">{a.ifsc_code || '—'}</td>
                  <td className="px-3 py-2">{a.account_type}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => deleteAcct(a.id)} className="p-1 hover:bg-red-50 rounded text-red-500">
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {txns.length > 0 && (
          <div className="mt-4">
            <div className="text-xs font-semibold text-[#6b7280] uppercase mb-2">Recent Transactions</div>
            <table className="w-full text-xs">
              <thead><tr className="border-b border-[#e5e7eb]">
                {['SR', 'Date', 'Total', 'Paid', 'Remarks'].map(h => (
                  <th key={h} className="px-3 py-1.5 text-left font-semibold text-[#6b7280]">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {txns.map(t => (
                  <tr key={t.id} className="border-b border-[#e5e7eb] hover:bg-white">
                    <td className="px-3 py-1.5">{t.sr_no}</td>
                    <td className="px-3 py-1.5">{t.date}</td>
                    <td className="px-3 py-1.5">₹{t.total_amount.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-1.5">₹{t.paid_amount.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-1.5"><StatusBadge status={t.remarks} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </td>
    </tr>
  )
}

// ── Delete confirmation dialog ────────────────────────────────────────────────
function DeleteConfirmDialog({
  customer,
  onCancel,
  onConfirm,
  deleting,
}: {
  customer: Customer
  onCancel: () => void
  onConfirm: () => void
  deleting: boolean
}) {
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onCancel} />
      <div
        className="fixed z-50 bg-white rounded-xl shadow-2xl p-6 w-[400px]"
        style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 rounded-full bg-red-50">
            <Trash2 size={18} color="#ef4444" />
          </div>
          <h3 className="text-base font-semibold text-[#1a1a1a]">Delete Customer</h3>
        </div>
        <p className="text-sm text-[#374151] mb-1">
          Are you sure you want to delete <span className="font-semibold">{customer.name}</span>?
        </p>
        <p className="text-xs text-[#6b7280] mb-5">
          This will also delete all their cards and bank accounts. This action cannot be undone.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="flex-1 py-2 rounded-md border text-sm font-medium text-[#374151] hover:bg-gray-50 disabled:opacity-50"
            style={{ borderColor: '#e5e7eb' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 py-2 rounded-md text-sm font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50"
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
interface CustomerWithMeta extends Customer { _cardCount?: number }

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerWithMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [expandedTxns, setExpandedTxns] = useState<Record<string, Transaction[]>>({})
  const [cardCounts, setCardCounts] = useState<Record<string, number>>({})
  const [acctCounts, setAcctCounts] = useState<Record<string, number>>({})
  const [panelCustomer, setPanelCustomer] = useState<Customer | null | 'new'>('new')
  const [showPanel, setShowPanel] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const fetchCustomers = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('customers').select('*').order('name')
    const list = (data as CustomerWithMeta[]) || []
    setCustomers(list)
    // Fetch card counts
    const { data: cd } = await supabase.from('cards').select('customer_id')
    if (cd) {
      const counts: Record<string, number> = {}
      ;(cd as { customer_id: string }[]).forEach(r => { counts[r.customer_id] = (counts[r.customer_id] || 0) + 1 })
      setCardCounts(counts)
    }
    // Fetch account counts
    const { data: ad } = await supabaseAdmin.from('customer_bank_accounts').select('customer_id')
    if (ad) {
      const aCounts: Record<string, number> = {}
      ;(ad as { customer_id: string }[]).forEach(r => { aCounts[r.customer_id] = (aCounts[r.customer_id] || 0) + 1 })
      setAcctCounts(aCounts)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchCustomers() }, [fetchCustomers])

  async function toggleExpand(c: CustomerWithMeta) {
    if (expanded === c.id) { setExpanded(null); return }
    setExpanded(c.id)
    if (!expandedTxns[c.id]) {
      const { data } = await supabase.from('transactions').select('*').eq('customer_name', c.name).order('sr_no', { ascending: false }).limit(10)
      setExpandedTxns(t => ({ ...t, [c.id]: (data as Transaction[]) || [] }))
    }
  }

  function openAdd() { setPanelCustomer(null); setShowPanel(true) }
  function openEdit(c: Customer, e: React.MouseEvent) { e.stopPropagation(); setPanelCustomer(c); setShowPanel(true) }
  function openDelete(c: Customer, e: React.MouseEvent) { e.stopPropagation(); setDeleteTarget(c) }

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const { error: ce } = await supabaseAdmin.from('cards').delete().eq('customer_id', deleteTarget.id)
      if (ce) throw new Error('Delete cards failed: ' + ce.message)
      const { error: ae } = await supabaseAdmin.from('customer_bank_accounts').delete().eq('customer_id', deleteTarget.id)
      if (ae) throw new Error('Delete accounts failed: ' + ae.message)
      const { error: cue } = await supabaseAdmin.from('customers').delete().eq('id', deleteTarget.id)
      if (cue) throw new Error('Delete customer failed: ' + cue.message)
      setDeleteTarget(null)
      showToast(`${deleteTarget.name} deleted`)
      fetchCustomers()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Delete failed'
      console.error('[delete]', msg)
      showToast(msg, 'error')
    }
    setDeleting(false)
  }

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
  )

  return (
    <div style={{ position: 'relative' }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-[#1a1a1a]">
          Customers
          {!loading && <span className="ml-2 text-sm font-normal text-[#6b7280]">({customers.length})</span>}
        </h1>
        <div className="flex items-center gap-3">
          <button onClick={fetchCustomers} className="p-1.5 rounded-md border hover:bg-gray-50" style={{ borderColor: '#e5e7eb' }}>
            <RefreshCw size={15} color="#6b7280" />
          </button>
          <div className="flex items-center gap-2 rounded-md border px-3 py-1.5" style={{ borderColor: '#e5e7eb' }}>
            <Search size={14} color="#9ca3af" />
            <input className="text-sm outline-none bg-transparent" placeholder="Search customers..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button onClick={openAdd} className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium text-white" style={{ background: '#3ECF8E' }}>
            <Plus size={14} /> Add Customer
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border overflow-hidden" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        {loading ? (
          <div className="flex items-center justify-center h-32 text-sm text-[#6b7280]">Loading customers...</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[#f9f9f9]">
              <tr>
                {['Name', 'Phone', 'Charge %', 'Outstanding', 'Cards', 'Accounts', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-[#6b7280] uppercase border-b border-[#e5e7eb]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-[#6b7280]">No customers yet</td></tr>
              ) : filtered.map(c => (
                <>
                  <tr key={c.id} className="border-b border-[#e5e7eb] hover:bg-gray-50 cursor-pointer" onClick={() => toggleExpand(c)}>
                    <td className="px-4 py-2.5 font-medium text-[#1a1a1a]">{c.name}</td>
                    <td className="px-4 py-2.5 text-[#6b7280]">{c.phone}</td>
                    <td className="px-4 py-2.5">{c.default_charge_pct}%</td>
                    <td className="px-4 py-2.5 font-medium">₹{c.outstanding_balance.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: '#eff6ff', color: '#1d4ed8' }}>
                        <CreditCard size={10} /> {cardCounts[c.id] || 0} cards
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                        <Building2 size={10} /> {acctCounts[c.id] || 0} accts
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1">
                        <button
                          className="flex items-center gap-1 px-2.5 py-1 rounded border text-xs hover:bg-gray-50"
                          style={{ borderColor: '#e5e7eb' }}
                          onClick={e => openEdit(c, e)}
                        >
                          <Edit size={12} /> Edit
                        </button>
                        <button
                          title="Delete customer"
                          className="p-1.5 rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
                          onClick={e => openDelete(c, e)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expanded === c.id && (
                    <ExpandedRow key={c.id + '-exp'} customer={c} txns={expandedTxns[c.id] || []} />
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Panel */}
      {showPanel && (
        <CustomerPanel
          customer={panelCustomer && panelCustomer !== 'new' ? panelCustomer : null}
          onClose={() => setShowPanel(false)}
          onSaved={fetchCustomers}
          onDeleteRequest={c => { setShowPanel(false); setDeleteTarget(c) }}
        />
      )}

      {/* Delete dialog */}
      {deleteTarget && (
        <DeleteConfirmDialog
          customer={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
          deleting={deleting}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 z-[60] flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white"
          style={{ background: toast.type === 'success' ? '#3ECF8E' : '#ef4444' }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  )
}
