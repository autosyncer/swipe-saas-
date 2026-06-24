'use client'

import { useState, useEffect } from 'react'
import { X, Plus, Building2, CreditCard, FileText, StickyNote, Upload, Eye, Trash2 } from 'lucide-react'
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
const labelCls = 'block text-[11px] font-medium text-[#6b7280] mb-0.5'
const inputCls = 'w-full rounded border px-2.5 py-1.5 text-xs outline-none focus:border-[#3ECF8E] transition-colors bg-white'

function lastFour(num: string) {
  return num.replace(/\D/g, '').slice(-4) || ''
}

function blankCard() {
  return { _key: Math.random().toString(36).slice(2), _expanded: true, card_nickname: '', bank_name: '', card_number: '', last4: '', pin: '', cvv: '', expiry: '', due_date: '', card_type: 'Credit' as string }
}
function blankAcct() {
  return { _key: Math.random().toString(36).slice(2), bank_name: '', account_number: '', ifsc_code: '', branch: '', account_type: 'Savings' as string }
}

type DraftCard = ReturnType<typeof blankCard> & { id?: string }
type DraftAcct = ReturnType<typeof blankAcct> & { id?: string }

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

// ── CardBlock ──────────────────────────────────────────────────────────────────
function CardBlock({ card, onChange, onRemove }: { card: DraftCard; onChange: (u: Partial<DraftCard>) => void; onRemove: () => void }) {
  return (
    <div className="rounded-lg border p-3 bg-[#fafafa]" style={{ borderColor: '#e5e7eb' }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-[#374151]">{card.bank_name || 'New Card'}</span>
        <button type="button" onClick={onRemove} className="text-[#9ca3af] hover:text-red-500"><X size={13} /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {([
          { label: 'Bank Name *', field: 'bank_name', placeholder: 'HDFC, SBI...' },
          { label: 'Card Nickname', field: 'card_nickname', placeholder: 'My HDFC Credit' },
          { label: 'Card Number', field: 'card_number', placeholder: '16-digit number' },
          { label: 'Card Type', field: 'card_type', placeholder: 'Credit / Debit' },
          { label: 'Expiry', field: 'expiry', placeholder: 'MM/YY' },
          { label: 'CVV', field: 'cvv', placeholder: '3 digits' },
        ] as { label: string; field: string; placeholder: string }[]).map(({ label, field, placeholder }) => (
          <div key={field}>
            <label className={labelCls}>{label}</label>
            <input
              className={inputCls}
              style={{ borderColor: '#e5e7eb' }}
              placeholder={placeholder}
              value={(card as unknown as Record<string, string>)[field] || ''}
              onChange={e => onChange({ [field]: e.target.value })}
            />
          </div>
        ))}
        <div>
          <label className={labelCls}>Due Date</label>
          <input type="date" className={inputCls} style={{ borderColor: '#e5e7eb' }}
            value={card.due_date || ''}
            onChange={e => onChange({ due_date: e.target.value })} />
        </div>
      </div>
    </div>
  )
}

// ── AcctRow ────────────────────────────────────────────────────────────────────
function AcctRow({ acct, onChange, onRemove }: { acct: DraftAcct; onChange: (u: Partial<DraftAcct>) => void; onRemove: () => void }) {
  return (
    <div className="rounded-lg border p-3 bg-[#fafafa]" style={{ borderColor: '#e5e7eb' }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-[#374151]">{acct.bank_name || 'New Account'}</span>
        <button type="button" onClick={onRemove} className="text-[#9ca3af] hover:text-red-500"><X size={13} /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {([
          { label: 'Bank Name', field: 'bank_name', placeholder: 'HDFC Bank' },
          { label: 'Account Number', field: 'account_number', placeholder: 'Account number' },
          { label: 'IFSC Code', field: 'ifsc_code', placeholder: 'HDFC0001234' },
          { label: 'Branch', field: 'branch', placeholder: 'Branch name' },
        ] as { label: string; field: string; placeholder: string }[]).map(({ label, field, placeholder }) => (
          <div key={field}>
            <label className={labelCls}>{label}</label>
            <input
              className={inputCls}
              style={{ borderColor: '#e5e7eb' }}
              placeholder={placeholder}
              value={(acct as Record<string, string>)[field] || ''}
              onChange={e => onChange({ [field]: e.target.value })}
            />
          </div>
        ))}
        <div>
          <label className={labelCls}>Account Type</label>
          <select className={inputCls} style={{ borderColor: '#e5e7eb' }}
            value={acct.account_type}
            onChange={e => onChange({ account_type: e.target.value })}>
            <option>Savings</option>
            <option>Current</option>
          </select>
        </div>
      </div>
    </div>
  )
}

// ── DocViewer ──────────────────────────────────────────────────────────────────
function DocViewer({ doc, onClose }: { doc: CustomerDocument; onClose: () => void }) {
  const isPdf = doc.file_name.toLowerCase().endsWith('.pdf')
  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[60]" onClick={onClose} />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col pointer-events-auto">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="text-sm font-medium">{doc.file_name}</span>
            <button onClick={onClose}><X size={18} /></button>
          </div>
          <div className="flex-1 overflow-auto flex items-center justify-center bg-gray-50">
            {isPdf
              ? <iframe src={doc.file_url} className="w-full h-full min-h-[500px]" title={doc.file_name} />
              : <img src={doc.file_url} alt={doc.file_name} className="max-w-full max-h-full object-contain p-4" />
            }
          </div>
        </div>
      </div>
    </>
  )
}

// ── Main CustomerPanel ─────────────────────────────────────────────────────────
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
    consignee_name: customer?.consignee_name || '',
    consignee_address: customer?.consignee_address || '',
    buyer_name: customer?.buyer_name || '',
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
        if (ue) throw new Error('Update failed: ' + ue.message)
      } else {
        const { data: cd, error: ce } = await supabaseAdmin.from('customers').insert({
          ...customerPayload, outstanding_balance: 0,
        }).select('id,name,phone,default_charge_pct,outstanding_balance').single()
        if (ce || !cd) throw new Error('Create failed: ' + (ce?.message || 'unknown'))
        customerId = (cd as { id: string }).id
      }
      if (customerId) {
        await supabaseAdmin.from('customers').update({ notes: notes.trim() || null }).eq('id', customerId)
      }
      if (isEdit && customer) {
        await supabaseAdmin.from('cards').delete().eq('customer_id', customer.id)
        await supabaseAdmin.from('customer_bank_accounts').delete().eq('customer_id', customer.id)
      }
      for (const c of cards.filter(c => c.bank_name)) {
        await supabaseAdmin.from('cards').insert({
          customer_id: customerId!, card_nickname: c.card_nickname ?? '', bank_name: c.bank_name,
          card_number: c.card_number ?? '', last4: c.last4 || lastFour(c.card_number || ''),
          pin: c.pin ?? '', cvv: c.cvv ?? '', expiry: c.expiry ?? '', due_date: c.due_date || null,
          card_type: c.card_type ?? 'Credit', is_active: true,
        })
      }
      for (const a of accts.filter(a => a.bank_name || a.account_number)) {
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
      await logAction({
        action: isEdit ? 'Customer Updated' : 'Customer Created',
        module: 'Customers',
        details: { name: basic.name, phone: basic.phone },
      })
      setToast('Saved!')
      const { data: saved } = await supabase.from('customers')
        .select('id,name,phone,default_charge_pct,outstanding_balance,consignee_name,consignee_address,buyer_name,buyer_address,notes,cards(*)')
        .eq('id', customerId!).single()
      setSaving(false)
      setTimeout(() => { onSaved(saved as Customer); onClose() }, 800)
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
                    onChange={e => setBasic(p => ({ ...p, [field]: e.target.value }))}
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
              <input className="w-full rounded border px-2.5 py-1.5 text-xs outline-none focus:border-[#3ECF8E] transition-colors bg-white" style={{ borderColor: '#e5e7eb' }}
                placeholder="Leave blank to use customer name"
                value={basic.consignee_name}
                onChange={e => setBasic(p => ({ ...p, consignee_name: e.target.value, buyer_name: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Address (Ship to &amp; Bill to)</label>
              <textarea className="w-full rounded border px-2.5 py-1.5 text-xs outline-none focus:border-[#3ECF8E] transition-colors bg-white resize-none" style={{ borderColor: '#e5e7eb' }}
                rows={3} placeholder="Street, Area, City, State"
                value={basic.consignee_address}
                onChange={e => setBasic(p => ({ ...p, consignee_address: e.target.value, buyer_address: e.target.value }))} />
            </div>
          </div>

          {/* Bank Accounts */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-[#374151] uppercase tracking-wide flex items-center gap-1">
                <Building2 size={13} /> Bank Accounts
              </div>
              <button type="button" className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded border" style={{ borderColor: '#3ECF8E', color: '#3ECF8E' }}
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

          {/* Cards */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-[#374151] uppercase tracking-wide flex items-center gap-1">
                <CreditCard size={13} /> Cards on File
              </div>
              <button type="button" className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded border" style={{ borderColor: '#3ECF8E', color: '#3ECF8E' }}
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

          {/* Documents */}
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
                  <div key={docType} className="flex items-center justify-between rounded-lg border px-3 py-2.5" style={{ borderColor: '#e5e7eb', background: existing || pending ? '#f0fdf4' : '#fafafa' }}>
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
                          <button type="button" onClick={async () => { await deleteCustomerDoc(existing); setExistingDocs(d => d.filter(x => x.id !== existing.id)) }}
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
                      <label className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border cursor-pointer hover:bg-white" style={{ borderColor: '#e5e7eb', color: '#374151' }}>
                        <Upload size={10} /> {existing || pending ? 'Replace' : 'Upload'}
                        <input type="file" className="hidden" accept="image/*,.pdf" onChange={e => {
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
            <textarea className="w-full rounded border px-3 py-2 text-xs outline-none focus:border-[#3ECF8E] transition-colors bg-white resize-none" style={{ borderColor: '#e5e7eb' }}
              rows={3} placeholder="Add any notes about this customer — e.g. reference, special terms, contact info..."
              value={notes} onChange={e => setNotes(e.target.value)} />
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
          <button onClick={() => { onClose(); setError(null) }} className="flex-1 py-2 rounded-md border text-sm font-medium text-[#374151]" style={{ borderColor: '#e5e7eb' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2 rounded-md text-sm font-medium text-white disabled:opacity-60" style={{ background: '#3ECF8E' }}>
            {saving ? 'Saving...' : 'Save Customer'}
          </button>
        </div>
      </div>
      {viewDoc && <DocViewer doc={viewDoc} onClose={() => setViewDoc(null)} />}
    </>
  )
}
