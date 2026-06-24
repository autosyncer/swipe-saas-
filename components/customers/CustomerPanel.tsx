'use client'

import { useState, useEffect } from 'react'
import {
  X, Plus, Building2, CreditCard, FileText, StickyNote, Upload, Eye, Trash2,
  ChevronDown, ChevronRight,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase/admin-client'
import { logAction } from '@/lib/audit-log'
import { Customer, Card, CustomerBankAccount } from '@/types/database'

// ── Types ─────────────────────────────────────────────────────────────────────
interface CustomerDocument {
  id: string
  customer_id: string
  doc_type: 'aadhaar' | 'pan' | 'other'
  file_name: string
  file_url: string
  storage_path: string
  note: string | null
  created_at: string
}

const DOC_BUCKET = 'customer-docs'
const DOC_LABELS: Record<string, string> = { aadhaar: 'Aadhaar Card', pan: 'PAN Card', other: 'Other' }
const inputCls = 'w-full rounded border px-2.5 py-1.5 text-xs outline-none focus:border-[#3ECF8E] transition-colors bg-white'
const labelCls = 'block text-[11px] font-medium text-[#6b7280] mb-0.5'

function formatCardInput(v: string) {
  return v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1-').replace(/-$/, '')
}
function lastFour(num: string) {
  return num.replace(/\D/g, '').slice(-4) || ''
}
function fmtDue(d?: string) {
  if (!d) return ''
  try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) } catch { return d }
}

function blankCard(): Omit<Card, 'id' | 'customer_id'> & { _key: string; _expanded: boolean } {
  return { _key: Math.random().toString(36).slice(2), _expanded: true, card_nickname: '', bank_name: '', card_number: '', last4: '', pin: '', cvv: '', expiry: '', due_date: '', card_type: 'Credit' }
}
function blankAcct(): Omit<CustomerBankAccount, 'id' | 'customer_id'> & { _key: string } {
  return { _key: Math.random().toString(36).slice(2), bank_name: '', account_number: '', ifsc_code: '', branch: '', account_type: 'Savings' }
}

type DraftCard = ReturnType<typeof blankCard> & { id?: string }
type DraftAcct = ReturnType<typeof blankAcct> & { id?: string }

// ── DocViewer ─────────────────────────────────────────────────────────────────
function DocViewer({ doc, onClose }: { doc: CustomerDocument; onClose: () => void }) {
  const isPdf = doc.file_name.toLowerCase().endsWith('.pdf')
  return (
    <>
      <div className="fixed inset-0 bg-black/70 z-[70]" onClick={onClose} />
      <div
        className="fixed z-[80] flex flex-col bg-white rounded-xl overflow-hidden"
        style={{ top: '5%', left: '50%', transform: 'translateX(-50%)', width: '90%', maxWidth: 860, height: '90vh', boxShadow: '0 25px 60px rgba(0,0,0,0.35)' }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e7eb] flex-shrink-0" style={{ background: '#f9fafb' }}>
          <div className="flex items-center gap-2">
            <FileText size={15} color="#3ECF8E" />
            <span className="text-sm font-semibold text-[#1a1a1a]">{DOC_LABELS[doc.doc_type] || doc.doc_type}</span>
            <span className="text-xs text-[#6b7280]">— {doc.file_name}</span>
          </div>
          <div className="flex items-center gap-2">
            <a href={doc.file_url} download={doc.file_name}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium border hover:bg-white"
              style={{ borderColor: '#e5e7eb', color: '#374151' }}>
              <Upload size={11} style={{ transform: 'rotate(180deg)' }} /> Download
            </a>
            <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100"><X size={16} color="#6b7280" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden bg-[#f3f4f6] flex items-center justify-center">
          {isPdf
            ? <iframe src={doc.file_url} className="w-full h-full border-0" title={doc.file_name} />
            : <img src={doc.file_url} alt={doc.file_name} className="max-w-full max-h-full object-contain p-4" style={{ userSelect: 'none' }} />}
        </div>
      </div>
    </>
  )
}

// ── CardBlock ─────────────────────────────────────────────────────────────────
function CardBlock({ card, onChange, onRemove }: { card: DraftCard; onChange: (updates: Partial<DraftCard>) => void; onRemove: () => void }) {
  const collapsed = !card._expanded
  const title = card.card_nickname || (card.bank_name ? `${card.bank_name}${card.last4 ? ` ...${card.last4}` : ''}` : 'New Card')
  const subtitle = card.due_date ? `Due: ${fmtDue(card.due_date)}` : card.expiry ? `Exp: ${card.expiry}` : ''

  return (
    <div className="border rounded-lg overflow-hidden" style={{ borderColor: '#e5e7eb' }}>
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
            {(() => {
              const digits = (card.card_number || '').replace(/\D/g, '')
              const incomplete = digits.length > 0 && digits.length < 16
              return (
                <>
                  <input
                    className={inputCls}
                    style={{ borderColor: incomplete ? '#ef4444' : '#e5e7eb' }}
                    placeholder="XXXX-XXXX-XXXX-XXXX"
                    value={card.card_number || ''}
                    onChange={e => { const f = formatCardInput(e.target.value); onChange({ card_number: f, last4: lastFour(f) }) }}
                    maxLength={19}
                  />
                  {incomplete && <div className="text-[10px] text-red-500 mt-0.5">Must be 16 digits</div>}
                </>
              )
            })()}
          </div>
          <div>
            <label className={labelCls}>Last 4 Digits</label>
            <input className={inputCls} style={{ borderColor: '#e5e7eb' }} placeholder="Auto from card no." value={card.last4} onChange={e => onChange({ last4: e.target.value.slice(-4) })} maxLength={4} />
          </div>
          <div>
            <label className={labelCls}>Card Type</label>
            <select className={inputCls} style={{ borderColor: '#e5e7eb' }} value={card.card_type || 'Credit'} onChange={e => onChange({ card_type: e.target.value })}>
              <option>Credit</option><option>Debit</option>
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
            <input className={inputCls} style={{ borderColor: '#e5e7eb' }} placeholder="06/27"
              value={card.expiry || ''}
              onChange={e => {
                const raw = e.target.value.replace(/\D/g, '').slice(0, 4)
                const formatted = raw.length > 2 ? raw.slice(0, 2) + '/' + raw.slice(2) : raw
                onChange({ expiry: formatted })
              }}
              maxLength={5}
            />
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

// ── AcctRow ───────────────────────────────────────────────────────────────────
function AcctRow({ acct, onChange, onRemove }: { acct: DraftAcct; onChange: (u: Partial<DraftAcct>) => void; onRemove: () => void }) {
  return (
    <div className="grid grid-cols-6 gap-2 items-end">
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
        <label className={labelCls}>Branch</label>
        <input className={inputCls} style={{ borderColor: '#e5e7eb' }} placeholder="Main Branch" value={acct.branch || ''} onChange={e => onChange({ branch: e.target.value })} />
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

// ── Upload / delete helpers ───────────────────────────────────────────────────
async function uploadCustomerDoc(customerId: string, docType: string, file: File): Promise<CustomerDocument | null> {
  const ext = file.name.split('.').pop()
  const path = `${customerId}/${docType}_${Date.now()}.${ext}`
  const { error: upErr } = await supabase.storage.from(DOC_BUCKET).upload(path, file, { upsert: true })
  if (upErr) { console.error('[doc upload]', upErr.message); return null }
  const { data: urlData } = supabase.storage.from(DOC_BUCKET).getPublicUrl(path)
  const { data, error } = await supabase.from('customer_documents').insert({
    customer_id: customerId, doc_type: docType, file_name: file.name,
    file_url: urlData.publicUrl, storage_path: path,
  }).select().single()
  if (error) { console.error('[doc insert]', error.message); return null }
  return data as CustomerDocument
}
async function deleteCustomerDoc(doc: CustomerDocument) {
  await supabase.storage.from(DOC_BUCKET).remove([doc.storage_path])
  await supabase.from('customer_documents').delete().eq('id', doc.id)
}

// ── Main CustomerPanel ────────────────────────────────────────────────────────
export interface CustomerPanelProps {
  customer?: Customer | null
  onClose: () => void
  onSaved: (saved: Customer) => void
  onDeleteRequest?: (c: Customer) => void
}

export default function CustomerPanel({ customer, onClose, onSaved, onDeleteRequest }: CustomerPanelProps) {
  const isEdit = !!customer
  const [basic, setBasic] = useState({
    name: customer?.name || '',
    phone: customer?.phone || '',
    charge: String(customer?.default_charge_pct || '2.2'),
    consignee_name: customer?.consignee_name || customer?.name || '',
    consignee_address: customer?.consignee_address || '',
    buyer_name: customer?.buyer_name || customer?.name || '',
    buyer_address: customer?.buyer_address || '',
  })
  const [cards, setCards] = useState<DraftCard[]>([])
  const [accts, setAccts] = useState<DraftAcct[]>([])
  const [notes, setNotes] = useState<string>(customer?.notes || '')
  const [pendingDocs, setPendingDocs] = useState<{ docType: 'aadhaar' | 'pan'; file: File }[]>([])
  const [existingDocs, setExistingDocs] = useState<CustomerDocument[]>([])
  const [uploadingDocs, setUploadingDocs] = useState(false)
  const [viewDoc, setViewDoc] = useState<CustomerDocument | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!isEdit || !customer) return
    supabase.from('cards').select('*').eq('customer_id', customer.id).then(({ data }) => {
      if (data) setCards((data as Card[]).map(c => ({ ...c, _key: c.id, _expanded: false })) as DraftCard[])
    })
    supabase.from('customer_bank_accounts').select('*').eq('customer_id', customer.id).then(({ data }) => {
      if (data) setAccts((data as CustomerBankAccount[]).map(a => ({ ...a, _key: a.id })) as DraftAcct[])
    })
    supabase.from('customer_documents').select('*').eq('customer_id', customer.id).order('created_at').then(({ data, error: e }) => {
      if (!e && data) setExistingDocs(data as CustomerDocument[])
    })
    supabase.from('customers').select('notes').eq('id', customer.id).single().then(({ data, error: e }) => {
      if (!e && data) setNotes((data as Record<string, string>).notes || '')
    })
  }, [customer, isEdit])

  function updateCard(key: string, u: Partial<DraftCard>) { setCards(cs => cs.map(c => c._key === key ? { ...c, ...u } : c)) }
  function removeCard(key: string) { setCards(cs => cs.filter(c => c._key !== key)) }
  function updateAcct(key: string, u: Partial<DraftAcct>) { setAccts(as => as.map(a => a._key === key ? { ...a, ...u } : a)) }
  function removeAcct(key: string) { setAccts(as => as.filter(a => a._key !== key)) }

  async function handleSave() {
    if (!basic.name || !basic.phone) { setError('Name and phone are required'); return }
    setSaving(true); setError(null)
    try {
      let customerId = customer?.id
      const customerPayload = {
        name: basic.name,
        phone: basic.phone,
        default_charge_pct: parseFloat(basic.charge) || 2.2,
        address: basic.consignee_address.trim() || null,
        consignee_name: basic.consignee_name.trim() || null,
        consignee_address: basic.consignee_address.trim() || null,
        buyer_name: basic.buyer_name.trim() || null,
        buyer_address: basic.buyer_address.trim() || null,
      }
      if (isEdit && customer) {
        const { error: ue } = await supabaseAdmin.from('customers').update(customerPayload).eq('id', customer.id)
        if (ue) throw new Error('Update customer failed: ' + ue.message)
      } else {
        const { data: cd, error: ce } = await supabaseAdmin.from('customers').insert({
          ...customerPayload, outstanding_balance: 0,
        }).select('id').single()
        if (ce || !cd) throw new Error('Create customer failed: ' + (ce?.message || 'unknown'))
        customerId = (cd as { id: string }).id
      }
      if (customerId) {
        await supabaseAdmin.from('customers').update({ notes: notes.trim() || null }).eq('id', customerId).then(({ error: ne }) => {
          if (ne) console.warn('[save] notes column not ready:', ne.message)
        })
      }
      if (isEdit && customer) {
        await supabaseAdmin.from('cards').delete().eq('customer_id', customer.id)
        await supabaseAdmin.from('customer_bank_accounts').delete().eq('customer_id', customer.id)
      }
      const validCards = cards.filter(c => c.bank_name)
      for (const c of validCards) {
        const last4val = c.last4 || lastFour(c.card_number || '')
        await supabaseAdmin.from('cards').insert({
          customer_id: customerId!, card_nickname: c.card_nickname ?? '', bank_name: c.bank_name,
          card_number: c.card_number ?? '', last4: last4val, pin: c.pin ?? '', cvv: c.cvv ?? '',
          expiry: c.expiry ?? '', due_date: c.due_date || null, card_type: c.card_type ?? 'Credit', is_active: true,
        })
      }
      const validAccts = accts.filter(a => a.bank_name || a.account_number)
      for (const a of validAccts) {
        await supabaseAdmin.from('customer_bank_accounts').insert({
          customer_id: customerId!, bank_name: a.bank_name || '', account_number: a.account_number || '',
          ifsc_code: a.ifsc_code || '', branch: a.branch || '', account_type: a.account_type || 'Savings',
        })
      }
      if (pendingDocs.length > 0) {
        setUploadingDocs(true)
        for (const { docType, file } of pendingDocs) await uploadCustomerDoc(customerId!, docType, file)
        setPendingDocs([]); setUploadingDocs(false)
      }
      setToast(`Saved with ${validCards.length} card(s) and ${validAccts.length} account(s)`)
      await logAction({
        action: isEdit ? 'Customer Updated' : 'Customer Created',
        module: 'Customers',
        details: { name: basic.name, phone: basic.phone, default_charge_pct: parseFloat(basic.charge) || 2.2 },
      })
      setSaving(false)
      const { data: saved } = await supabase.from('customers')
        .select('id,name,phone,default_charge_pct,outstanding_balance,consignee_name,consignee_address,buyer_name,buyer_address,notes,cards(*)')
        .eq('id', customerId!).single()
      setTimeout(() => { onSaved(saved as Customer); onClose() }, 1200)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error')
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
                    onChange={e => setBasic(p => ({
                      ...p,
                      [field]: e.target.value,
                      ...(field === 'name' && p.consignee_name === p.name ? { consignee_name: e.target.value, buyer_name: e.target.value } : {}),
                    }))}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Invoice Details */}
          <div>
            <div className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest mb-3 pb-1 border-b border-[#f3f4f6]">Invoice Details</div>
            <div className="mb-3">
              <label className={labelCls}>Consignee / Buyer Name</label>
              <input
                className="w-full rounded border px-2.5 py-1.5 text-xs outline-none focus:border-[#3ECF8E] transition-colors bg-white"
                style={{ borderColor: '#e5e7eb' }}
                placeholder="Leave blank to use customer name"
                value={basic.consignee_name}
                onChange={e => setBasic(p => ({ ...p, consignee_name: e.target.value, buyer_name: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelCls}>Address (Ship to &amp; Bill to)</label>
              <textarea
                className="w-full rounded border px-2.5 py-1.5 text-xs outline-none focus:border-[#3ECF8E] transition-colors bg-white resize-none"
                style={{ borderColor: '#e5e7eb' }}
                rows={3}
                placeholder="Street, Area, City, State"
                value={basic.consignee_address}
                onChange={e => setBasic(p => ({ ...p, consignee_address: e.target.value, buyer_address: e.target.value }))}
              />
            </div>
          </div>

          {/* Bank Accounts */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-[#374151] uppercase tracking-wide flex items-center gap-1">
                <Building2 size={13} /> Bank Accounts
              </div>
              <button type="button"
                className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded border"
                style={{ borderColor: '#3ECF8E', color: '#3ECF8E' }}
                onClick={() => setAccts(a => [...a, blankAcct()])}>
                <Plus size={11} /> Add Account
              </button>
            </div>
            {accts.length === 0
              ? <div className="text-xs text-[#9ca3af] py-2">No bank accounts added yet</div>
              : <div className="flex flex-col gap-2">
                  {accts.map(a => <AcctRow key={a._key} acct={a} onChange={u => updateAcct(a._key, u)} onRemove={() => removeAcct(a._key)} />)}
                </div>}
          </div>

          {/* Cards on File */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-[#374151] uppercase tracking-wide flex items-center gap-1">
                <CreditCard size={13} /> Cards on File
              </div>
              <button type="button"
                className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded border"
                style={{ borderColor: '#3ECF8E', color: '#3ECF8E' }}
                onClick={() => setCards(c => [...c, blankCard()])}>
                <Plus size={11} /> Add Card
              </button>
            </div>
            {cards.length === 0
              ? <div className="text-xs text-[#9ca3af] py-2">No cards added yet</div>
              : <div className="flex flex-col gap-2">
                  {cards.map(c => <CardBlock key={c._key} card={c} onChange={u => updateCard(c._key, u)} onRemove={() => removeCard(c._key)} />)}
                </div>}
          </div>

          {/* KYC Documents */}
          <div>
            <div className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest mb-3 pb-1 border-b border-[#f3f4f6] flex items-center gap-1">
              <FileText size={11} /> KYC Documents
            </div>
            <div className="flex flex-col gap-3">
              {(['aadhaar', 'pan'] as const).map(docType => {
                const existing = existingDocs.find(d => d.doc_type === docType)
                const pending = pendingDocs.find(d => d.docType === docType)
                const label = DOC_LABELS[docType]
                return (
                  <div key={docType} className="flex items-center justify-between rounded-lg border px-3 py-2.5"
                    style={{ borderColor: '#e5e7eb', background: existing || pending ? '#f0fdf4' : '#fafafa' }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="p-1.5 rounded" style={{ background: existing || pending ? '#dcfce7' : '#f3f4f6' }}>
                        <FileText size={14} color={existing || pending ? '#16a34a' : '#9ca3af'} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[#374151]">{label}</div>
                        {(existing || pending)
                          ? <div className="text-[10px] text-[#16a34a] truncate max-w-[180px]">{pending ? `Ready: ${pending.file.name}` : existing!.file_name}</div>
                          : <div className="text-[10px] text-[#9ca3af]">Not uploaded</div>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {existing && (
                        <>
                          <button type="button" onClick={() => setViewDoc(existing)}
                            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border hover:bg-white"
                            style={{ borderColor: '#bbf7d0', color: '#16a34a' }}>
                            <Eye size={10} /> View
                          </button>
                          <button type="button"
                            onClick={async () => { await deleteCustomerDoc(existing); setExistingDocs(d => d.filter(x => x.id !== existing.id)) }}
                            className="p-1 rounded hover:bg-red-50 text-red-400">
                            <Trash2 size={11} />
                          </button>
                        </>
                      )}
                      {pending && !existing && (
                        <button type="button" onClick={() => setPendingDocs(d => d.filter(x => x.docType !== docType))}
                          className="p-1 rounded hover:bg-red-50 text-red-400">
                          <X size={11} />
                        </button>
                      )}
                      <label className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border cursor-pointer hover:bg-white"
                        style={{ borderColor: '#e5e7eb', color: '#374151' }}>
                        <Upload size={10} /> {existing || pending ? 'Replace' : 'Upload'}
                        <input type="file" className="hidden" accept="image/*,.pdf"
                          onChange={e => {
                            const file = e.target.files?.[0]; if (!file) return
                            setPendingDocs(d => [...d.filter(x => x.docType !== docType), { docType, file }])
                            e.target.value = ''
                          }} />
                      </label>
                    </div>
                  </div>
                )
              })}
              {uploadingDocs && <div className="text-[10px] text-[#3ECF8E] animate-pulse">Uploading documents...</div>}
            </div>
          </div>

          {/* Notes */}
          <div>
            <div className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest mb-2 pb-1 border-b border-[#f3f4f6] flex items-center gap-1">
              <StickyNote size={11} /> Notes
            </div>
            <textarea
              className="w-full rounded border px-3 py-2 text-xs outline-none focus:border-[#3ECF8E] transition-colors bg-white resize-none"
              style={{ borderColor: '#e5e7eb' }}
              rows={3}
              placeholder="Add any notes about this customer — e.g. reference, special terms, contact info..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>

        {/* footer */}
        <div className="px-5 py-4 border-t border-[#e5e7eb] flex gap-3 flex-shrink-0">
          {isEdit && customer && onDeleteRequest && (
            <button type="button" onClick={() => onDeleteRequest(customer)}
              className="px-3 py-2 rounded-md border text-sm font-medium text-red-500 hover:bg-red-50 flex items-center gap-1"
              style={{ borderColor: '#fca5a5' }}>
              <Trash2 size={14} /> Delete
            </button>
          )}
          <button onClick={() => { onClose(); setError(null) }}
            className="flex-1 py-2 rounded-md border text-sm font-medium text-[#374151]"
            style={{ borderColor: '#e5e7eb' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2 rounded-md text-sm font-medium text-white disabled:opacity-60"
            style={{ background: '#3ECF8E' }}>
            {saving ? 'Saving...' : 'Save Customer'}
          </button>
        </div>
      </div>
      {viewDoc && <DocViewer doc={viewDoc} onClose={() => setViewDoc(null)} />}
    </>
  )
}
