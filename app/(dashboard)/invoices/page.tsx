'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { logAction } from '@/lib/audit-log'
import { Receipt, Plus, Search, Eye, X, Printer, CheckCircle, Clock, Ban, FileText, Settings } from 'lucide-react'
import InvoiceDocument from '@/components/invoice/InvoiceDocument'
import { StoreSettings, DEFAULT_STORE, loadStoreSettings, saveStoreSettings } from '@/lib/store-settings'

interface InvoiceItem {
  commodity_id: string
  name: string
  unit: string
  qty: number
  price: number
  subtotal: number
}

interface Invoice {
  id: string
  invoice_number: string
  transaction_id: string | null
  customer_id: string | null
  customer_name: string
  customer_address?: string
  transaction_date?: string
  paid_by?: string
  consignee_name?: string
  consignee_address?: string
  buyer_name?: string
  buyer_address?: string
  items: InvoiceItem[]
  subtotal: number
  tax_percent: number
  tax_amount: number
  total_amount: number
  notes: string | null
  status: 'draft' | 'sent' | 'paid' | 'cancelled'
  created_at: string
  updated_at: string
  store_id?: string | null
  bank_account_id?: string | null
}

interface BankAccount {
  id: string
  account_name: string
  bank_name: string
  account_number_masked: string
  ifsc: string
}

interface Commodity { id: string; name: string; unit: string; current_price: number }
interface Customer { id: string; name: string }

const STATUS_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  draft:     { bg: '#f3f4f6', color: '#6b7280', border: '#e5e7eb' },
  sent:      { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
  paid:      { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
  cancelled: { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  draft:     <Clock size={11} />,
  sent:      <FileText size={11} />,
  paid:      <CheckCircle size={11} />,
  cancelled: <Ban size={11} />,
}

const inp = 'w-full px-3 py-2 rounded-lg text-sm border border-[#e5e7eb] outline-none focus:border-[#3ECF8E] bg-white text-[#111]'
const lbl = 'block text-xs font-medium text-[#374151] mb-1'

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')

  const [showCreate, setShowCreate] = useState(false)
  const [commodities, setCommodities] = useState<Commodity[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selCustomer, setSelCustomer] = useState('')
  const [items, setItems] = useState<InvoiceItem[]>([{ commodity_id: '', name: '', unit: 'pcs', qty: 1, price: 0, subtotal: 0 }])
  const [taxPercent, setTaxPercent] = useState('0')
  const [invoiceNotes, setInvoiceNotes] = useState('')
  const [creating, setCreating] = useState(false)

  // Store details (localStorage)
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(loadStoreSettings())
  const [showStoreSettings, setShowStoreSettings] = useState(false)
  const [storeDraft, setStoreDraft] = useState<StoreSettings>(loadStoreSettings())

  // Bank accounts
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [selBank, setSelBank] = useState('')

  // Inline bank picker on invoice row
  const [pickerInvoiceId, setPickerInvoiceId] = useState<string | null>(null)
  const [pickerBank, setPickerBank] = useState('')
  const [savingPicker, setSavingPicker] = useState(false)

  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null)
  const printRef = useRef<HTMLDivElement>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000)
  }

  async function fetchInvoices() {
    setLoading(true)
    const { data } = await supabase.from('invoices').select('*').order('created_at', { ascending: false })
    setInvoices(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchInvoices()
    Promise.all([
      supabase.from('commodities').select('id,name,unit,current_price').eq('is_active', true).order('name'),
      supabase.from('customers').select('id,name').order('name'),
      supabase.from('bank_accounts').select('id,account_name,bank_name,account_number_masked,ifsc').order('account_name'),
    ]).then(([{ data: comms }, { data: custs }, { data: banks }]) => {
      setCommodities(comms ?? [])
      setCustomers(custs ?? [])
      setBankAccounts(banks ?? [])
    })
  }, [])

  function updateItem(index: number, field: keyof InvoiceItem, value: string | number) {
    setItems(prev => {
      const next = [...prev]
      const row = { ...next[index], [field]: value }
      if (field === 'commodity_id') {
        const c = commodities.find(c => c.id === value)
        if (c) { row.name = c.name; row.unit = c.unit; row.price = c.current_price }
      }
      if (['qty', 'price', 'commodity_id'].includes(field as string))
        row.subtotal = Number(row.qty) * Number(row.price)
      next[index] = row
      return next
    })
  }

  const subtotalCalc = items.reduce((s, r) => s + r.subtotal, 0)
  const taxAmt = subtotalCalc * (parseFloat(taxPercent) || 0) / 100
  const totalCalc = subtotalCalc + taxAmt

  async function handleCreate() {
    if (!selCustomer) { showToast('Select a customer', 'error'); return }
    const validItems = items.filter(i => i.name && i.qty > 0 && i.price >= 0)
    if (!validItems.length) { showToast('Add at least one item', 'error'); return }
    setCreating(true)
    const { data: invNum } = await supabase.rpc('generate_invoice_number')
    const customer = customers.find(c => c.id === selCustomer)
    const { data, error } = await supabase.from('invoices').insert({
      invoice_number: invNum,
      customer_id: selCustomer,
      customer_name: customer?.name ?? '',
      items: validItems,
      subtotal: subtotalCalc,
      tax_percent: parseFloat(taxPercent) || 0,
      tax_amount: taxAmt,
      total_amount: totalCalc,
      notes: invoiceNotes.trim() || null,
      status: 'draft',
      bank_account_id: selBank || null,
    }).select().single()
    if (error) showToast('Failed to create invoice', 'error')
    else {
      logAction({ action: 'create_invoice', module: 'Invoices', details: { invoice_number: data.invoice_number, total: totalCalc } })
      showToast(`Invoice ${data.invoice_number} created`)
      setShowCreate(false)
      setSelCustomer(''); setSelBank('')
      setItems([{ commodity_id: '', name: '', unit: 'pcs', qty: 1, price: 0, subtotal: 0 }])
      setTaxPercent('0'); setInvoiceNotes('')
      fetchInvoices()
    }
    setCreating(false)
  }

  function openPicker(inv: Invoice) {
    setPickerInvoiceId(inv.id)
    setPickerBank((inv.bank_account_id as string) ?? '')
  }

  async function savePickerDetails(invId: string) {
    setSavingPicker(true)
    await supabase.from('invoices').update({
      bank_account_id: pickerBank || null,
    }).eq('id', invId)
    await fetchInvoices()
    setPickerInvoiceId(null)
    setSavingPicker(false)
    showToast('Invoice updated')
  }

  async function updateStatus(inv: Invoice, status: Invoice['status']) {
    await supabase.from('invoices').update({ status }).eq('id', inv.id)
    showToast(`Status updated to ${status}`)
    fetchInvoices()
    if (detailInvoice?.id === inv.id) setDetailInvoice({ ...detailInvoice, status })
  }

  function printInvoice() {
    const content = printRef.current?.innerHTML
    if (!content) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<html><head><title>Invoice</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#111}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{padding:8px 12px;border:1px solid #ddd;text-align:left}th{background:#f5f5f5}.right{text-align:right}</style></head><body>${content}</body></html>`)
    win.document.close(); win.print()
  }

  // Store management

  // Resolve store settings for invoice display
  function resolveStoreSettings(): StoreSettings {
    return storeSettings
  }

  const filtered = invoices.filter(inv =>
    (inv.invoice_number.toLowerCase().includes(search.toLowerCase()) || inv.customer_name.toLowerCase().includes(search.toLowerCase()))
    && (filterStatus === 'all' || inv.status === filterStatus)
  )

  const selectedBankObj = bankAccounts.find(b => b.id === selBank)

  return (
    <div className="p-6 max-w-5xl mx-auto">

      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-white text-sm font-medium shadow-lg"
          style={{ background: toast.type === 'success' ? '#3ECF8E' : '#ef4444' }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: '#f0fdf4' }}>
            <Receipt size={18} color="#3ECF8E" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#111]">Invoice</h1>
            <p className="text-xs text-[#6b7280]">{invoices.length} total</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setShowStoreSettings(v => !v); setStoreDraft(storeSettings) }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm border border-[#e5e7eb] text-[#374151] hover:bg-gray-50">
            <Settings size={14} /> Store Details
          </button>
          <button onClick={() => setShowCreate(v => !v)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: '#3ECF8E' }}>
            <Plus size={15} /> New Invoice
          </button>
        </div>
      </div>

      {/* Store Details Panel */}
      {showStoreSettings && (
        <div className="rounded-xl p-5 mb-5 border border-[#e5e7eb] bg-white shadow-sm">
          <h3 className="text-sm font-semibold text-[#111] mb-4">Store Details</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className={lbl}>Store Name</label>
              <input className={inp} value={storeDraft.name} onChange={e => setStoreDraft(p => ({ ...p, name: e.target.value }))} placeholder="Mahalaxmi Grain Store" />
            </div>
            <div>
              <label className={lbl}>Bank Name</label>
              <input className={inp} value={storeDraft.bankName} onChange={e => setStoreDraft(p => ({ ...p, bankName: e.target.value }))} placeholder="e.g. BANK OF BARODA CA" />
            </div>
            <div>
              <label className={lbl}>Account No.</label>
              <input className={inp} value={storeDraft.accNo} onChange={e => setStoreDraft(p => ({ ...p, accNo: e.target.value }))} placeholder="Account Number" />
            </div>
            <div>
              <label className={lbl}>Branch &amp; IFSC</label>
              <input className={inp} value={storeDraft.ifsc} onChange={e => setStoreDraft(p => ({ ...p, ifsc: e.target.value }))} placeholder="Branch & IFSC Code" />
            </div>
            <div>
              <label className={lbl}>Jurisdiction</label>
              <input className={inp} value={storeDraft.jurisdiction} onChange={e => setStoreDraft(p => ({ ...p, jurisdiction: e.target.value }))} placeholder="SUBJECT TO SURAT JURISDICTION" />
            </div>
            <div className="col-span-2">
              <label className={lbl}>Store Address</label>
              <textarea className={inp} rows={2} value={storeDraft.address} onChange={e => setStoreDraft(p => ({ ...p, address: e.target.value }))} placeholder="Shop No., Area, City" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowStoreSettings(false)}
              className="px-3 py-1.5 rounded-lg text-sm border border-[#e5e7eb] text-[#374151] hover:bg-gray-50">Cancel</button>
            <button onClick={() => { saveStoreSettings(storeDraft); setStoreSettings(storeDraft); setShowStoreSettings(false); showToast('Store details saved') }}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white"
              style={{ background: '#3ECF8E' }}>Save</button>
          </div>
        </div>
      )}

      {/* Create panel */}
      {showCreate && (
        <div className="rounded-xl p-5 mb-5 border border-[#e5e7eb] bg-white shadow-sm">
          <h3 className="text-sm font-semibold text-[#111] mb-4">Create Invoice</h3>

          {/* Bank + Customer row */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className={lbl}>Select Bank Account</label>
              <select className={inp} value={selBank} onChange={e => setSelBank(e.target.value)}>
                <option value="">— No bank —</option>
                {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.account_name}</option>)}
              </select>
              {selectedBankObj && (
                <div className="mt-1.5 px-2 py-1.5 rounded-lg text-xs text-[#374151] border border-[#e5e7eb] bg-[#f9fafb]">
                  <div>{selectedBankObj.bank_name}</div>
                  <div className="text-[#6b7280]">A/C: {selectedBankObj.account_number_masked}</div>
                  <div className="text-[#6b7280]">{selectedBankObj.ifsc}</div>
                </div>
              )}
            </div>
            <div>
              <label className={lbl}>Customer *</label>
              <select className={inp} value={selCustomer} onChange={e => setSelCustomer(e.target.value)}>
                <option value="">Select customer...</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          {/* Items table */}
          <div className="mb-4 rounded-lg border border-[#e5e7eb] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e5e7eb]" style={{ background: '#f9fafb' }}>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-[#6b7280]">Commodity</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-[#6b7280] w-16">Unit</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-[#6b7280] w-20">Qty</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-[#6b7280] w-28">Price (₹)</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-[#6b7280] w-28">Subtotal</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f3f4f6]">
                {items.map((item, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2">
                      <select value={item.commodity_id} onChange={e => updateItem(i, 'commodity_id', e.target.value)}
                        className="w-full px-2 py-1.5 rounded border border-[#e5e7eb] text-sm outline-none focus:border-[#3ECF8E] text-[#111]">
                        <option value="">Select...</option>
                        {commodities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-[#6b7280] text-xs">{item.unit}</td>
                    <td className="px-3 py-2">
                      <input type="number" value={item.qty} min={1} onChange={e => updateItem(i, 'qty', parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1.5 rounded border border-[#e5e7eb] text-sm text-right outline-none focus:border-[#3ECF8E] text-[#111]" />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" value={item.price} min={0} onChange={e => updateItem(i, 'price', parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1.5 rounded border border-[#e5e7eb] text-sm text-right outline-none focus:border-[#3ECF8E] text-[#111]" />
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-[#111]">₹{item.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="px-3 py-2">
                      {items.length > 1 && (
                        <button onClick={() => setItems(p => p.filter((_, j) => j !== i))} className="text-[#9ca3af] hover:text-red-500"><X size={14} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-3 py-2 border-t border-[#f3f4f6]">
              <button onClick={() => setItems(p => [...p, { commodity_id: '', name: '', unit: 'pcs', qty: 1, price: 0, subtotal: 0 }])}
                className="flex items-center gap-1 text-xs font-medium" style={{ color: '#3ECF8E' }}>
                <Plus size={12} /> Add Item
              </button>
            </div>
          </div>

          <div className="flex gap-6 items-start mb-4">
            <div>
              <label className={lbl}>Tax %</label>
              <input type="number" value={taxPercent} min={0} max={100} onChange={e => setTaxPercent(e.target.value)}
                className={`${inp} w-20`} />
            </div>
            <div className="flex-1">
              <label className={lbl}>Notes</label>
              <input value={invoiceNotes} onChange={e => setInvoiceNotes(e.target.value)} placeholder="Optional notes..."
                className={inp} />
            </div>
            <div className="text-right text-sm mt-5">
              <div className="text-[#6b7280]">Subtotal: <span className="text-[#111] font-medium">₹{subtotalCalc.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
              <div className="text-[#6b7280]">Tax ({taxPercent}%): <span className="text-[#111] font-medium">₹{taxAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
              <div className="text-[#111] font-bold text-base mt-1">Total: ₹{totalCalc.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg text-sm border border-[#e5e7eb] text-[#374151] hover:bg-gray-50">Cancel</button>
            <button onClick={handleCreate} disabled={creating}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: '#3ECF8E' }}>
              {creating ? 'Creating...' : 'Create Invoice'}
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by invoice # or customer..."
            className="w-full pl-9 pr-4 py-2 rounded-lg text-sm border border-[#e5e7eb] outline-none focus:border-[#3ECF8E] bg-white text-[#111]" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm border border-[#e5e7eb] outline-none bg-white text-[#111]">
          <option value="all">All Status</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="paid">Paid</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[#e5e7eb] overflow-hidden bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e5e7eb]" style={{ background: '#f9fafb' }}>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Invoice #</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Customer</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Date</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Amount</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Status</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f3f4f6]">
            {loading ? (
              <tr><td colSpan={6} className="text-center py-12 text-sm text-[#9ca3af]">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-sm text-[#9ca3af]">No invoices found</td></tr>
            ) : filtered.map(inv => {
              const isPicking = pickerInvoiceId === inv.id
              const invBank = bankAccounts.find(b => b.id === inv.bank_account_id)
              return (
                <>
                  <tr key={inv.id} className="hover:bg-[#f9fafb] transition-colors">
                    <td className="px-4 py-3 font-mono font-semibold text-xs" style={{ color: '#3ECF8E' }}>{inv.invoice_number}</td>
                    <td className="px-4 py-3 font-medium text-[#111]">{inv.customer_name}</td>
                    <td className="px-4 py-3 text-[#6b7280]">{new Date(inv.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                    <td className="px-4 py-3 text-right font-semibold text-[#111]">₹{Number(inv.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-center">
                      <select value={inv.status} onChange={e => updateStatus(inv, e.target.value as Invoice['status'])}
                        className="px-2.5 py-0.5 rounded-full text-xs font-semibold border outline-none cursor-pointer"
                        style={{ background: STATUS_STYLE[inv.status].bg, color: STATUS_STYLE[inv.status].color, borderColor: STATUS_STYLE[inv.status].border }}>
                        <option value="draft">Draft</option>
                        <option value="sent">Sent</option>
                        <option value="paid">Paid</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => isPicking ? setPickerInvoiceId(null) : openPicker(inv)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-[#9ca3af] hover:text-[#374151]"
                          title="Set Store & Bank"
                        >
                          <Settings size={14} />
                        </button>
                        <button onClick={() => setDetailInvoice(inv)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-[#9ca3af] hover:text-[#374151]" title="View">
                          <Eye size={14} />
                        </button>
                      </div>
                      {/* Bank badge */}
                      {!isPicking && invBank && (
                        <div className="flex gap-1 justify-end mt-1">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">{invBank.account_name}</span>
                        </div>
                      )}
                    </td>
                  </tr>
                  {isPicking && (
                    <tr key={`${inv.id}-picker`} style={{ background: '#f0f9ff' }}>
                      <td colSpan={6} className="px-4 py-3">
                        <div className="flex items-end gap-4">
                          <div style={{ flex: 1 }}>
                            <label className={lbl}>Select Bank Account</label>
                            <select className={inp} value={pickerBank} onChange={e => setPickerBank(e.target.value)}>
                              <option value="">— No bank —</option>
                              {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.account_name}</option>)}
                            </select>
                            {pickerBank && bankAccounts.find(b => b.id === pickerBank) && (() => {
                              const b = bankAccounts.find(b => b.id === pickerBank)!
                              return <div className="mt-1 text-xs text-[#6b7280]">{b.bank_name} · {b.account_number_masked} · {b.ifsc}</div>
                            })()}
                          </div>
                          <div className="flex gap-2 pb-0.5">
                            <button onClick={() => setPickerInvoiceId(null)}
                              className="px-3 py-2 rounded-lg text-sm border border-[#e5e7eb] text-[#374151] hover:bg-white">Cancel</button>
                            <button onClick={() => savePickerDetails(inv.id)} disabled={savingPicker}
                              className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                              style={{ background: '#3ECF8E' }}>
                              {savingPicker ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {detailInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-xl border border-[#e5e7eb] shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5e7eb]">
              <div className="flex items-center gap-2">
                <Receipt size={16} color="#3ECF8E" />
                <span className="font-semibold text-[#111]">{detailInvoice.invoice_number}</span>
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border"
                  style={{ background: STATUS_STYLE[detailInvoice.status].bg, color: STATUS_STYLE[detailInvoice.status].color, borderColor: STATUS_STYLE[detailInvoice.status].border }}>
                  {STATUS_ICONS[detailInvoice.status]}
                  {detailInvoice.status.charAt(0).toUpperCase() + detailInvoice.status.slice(1)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={printInvoice}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border border-[#e5e7eb] text-[#374151] hover:bg-gray-50">
                  <Printer size={13} /> Print
                </button>
                <button onClick={() => setDetailInvoice(null)} className="text-[#9ca3af] hover:text-[#374151]"><X size={18} /></button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-4" ref={printRef}>
              <InvoiceDocument
                invoiceNumber={detailInvoice.invoice_number}
                date={new Date(detailInvoice.transaction_date || detailInvoice.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                customerName={detailInvoice.customer_name}
                customerAddress={detailInvoice.customer_address ?? ''}
                consigneeName={detailInvoice.consignee_name ?? ''}
                consigneeAddress={detailInvoice.consignee_address ?? ''}
                buyerName={detailInvoice.buyer_name ?? ''}
                buyerAddress={detailInvoice.buyer_address ?? ''}
                items={detailInvoice.items.map(i => ({
                  name: i.name,
                  unit: i.unit,
                  qty: Number(i.qty),
                  price: Number(i.price),
                  subtotal: Number(i.subtotal),
                }))}
                subtotal={Number(detailInvoice.subtotal)}
                totalAmount={Number(detailInvoice.total_amount)}
                remarks={detailInvoice.notes}
                paidBy={detailInvoice.paid_by ?? ''}
                storeSettings={resolveStoreSettings()}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
