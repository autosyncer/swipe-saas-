'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { logAction } from '@/lib/audit-log'
import {
  Receipt, Plus, Search, Eye, Download, X, Printer,
  ChevronDown, Filter, CheckCircle, Clock, Ban, FileText
} from 'lucide-react'



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
  items: InvoiceItem[]
  subtotal: number
  tax_percent: number
  tax_amount: number
  total_amount: number
  notes: string | null
  status: 'draft' | 'sent' | 'paid' | 'cancelled'
  created_at: string
  updated_at: string
}

interface Commodity {
  id: string
  name: string
  unit: string
  current_price: number
}

interface Customer {
  id: string
  name: string
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft:     { bg: 'rgba(107,114,128,0.15)', color: '#9ca3af' },
  sent:      { bg: 'rgba(59,130,246,0.15)',  color: '#60a5fa' },
  paid:      { bg: 'rgba(62,207,142,0.15)',  color: '#3ECF8E' },
  cancelled: { bg: 'rgba(239,68,68,0.15)',   color: '#ef4444' },
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  draft:     <Clock size={12} />,
  sent:      <FileText size={12} />,
  paid:      <CheckCircle size={12} />,
  cancelled: <Ban size={12} />,
}

export default function InvoicesPage() {
  const auth = useAuth()

  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  // Create invoice panel
  const [showCreate, setShowCreate] = useState(false)
  const [commodities, setCommodities] = useState<Commodity[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selCustomer, setSelCustomer] = useState('')
  const [items, setItems] = useState<InvoiceItem[]>([{ commodity_id: '', name: '', unit: 'pcs', qty: 1, price: 0, subtotal: 0 }])
  const [taxPercent, setTaxPercent] = useState('0')
  const [invoiceNotes, setInvoiceNotes] = useState('')
  const [creating, setCreating] = useState(false)

  // Detail modal
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null)
  const printRef = useRef<HTMLDivElement>(null)

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function fetchInvoices() {
    setLoading(true)
    const { data } = await supabase
      .from('invoices')
      .select('*')
      .order('created_at', { ascending: false })
    setInvoices(data ?? [])
    setLoading(false)
  }

  async function fetchCommoditiesAndCustomers() {
    const [{ data: comms }, { data: custs }] = await Promise.all([
      supabase.from('commodities').select('id, name, unit, current_price').eq('is_active', true).order('name'),
      supabase.from('customers').select('id, name').order('name'),
    ])
    setCommodities(comms ?? [])
    setCustomers(custs ?? [])
  }

  useEffect(() => {
    fetchInvoices()
    fetchCommoditiesAndCustomers()
  }, [])

  // --- item helpers ---
  function updateItem(index: number, field: keyof InvoiceItem, value: string | number) {
    setItems(prev => {
      const next = [...prev]
      const row = { ...next[index], [field]: value }
      if (field === 'commodity_id') {
        const c = commodities.find(c => c.id === value)
        if (c) { row.name = c.name; row.unit = c.unit; row.price = c.current_price }
      }
      if (field === 'qty' || field === 'price' || field === 'commodity_id') {
        row.subtotal = Number(row.qty) * Number(row.price)
      }
      next[index] = row
      return next
    })
  }

  function addItem() {
    setItems(prev => [...prev, { commodity_id: '', name: '', unit: 'pcs', qty: 1, price: 0, subtotal: 0 }])
  }

  function removeItem(index: number) {
    setItems(prev => prev.filter((_, i) => i !== index))
  }

  const subtotalCalc = items.reduce((s, r) => s + r.subtotal, 0)
  const taxAmt = subtotalCalc * (parseFloat(taxPercent) || 0) / 100
  const totalCalc = subtotalCalc + taxAmt

  async function handleCreate() {
    if (!selCustomer) { showToast('Select a customer', 'error'); return }
    const validItems = items.filter(i => i.name && i.qty > 0 && i.price >= 0)
    if (validItems.length === 0) { showToast('Add at least one item', 'error'); return }
    setCreating(true)

    const { data: invNumData } = await supabase.rpc('generate_invoice_number')
    const customer = customers.find(c => c.id === selCustomer)

    const { data, error } = await supabase
      .from('invoices')
      .insert({
        invoice_number: invNumData,
        customer_id: selCustomer,
        customer_name: customer?.name ?? '',
        items: validItems,
        subtotal: subtotalCalc,
        tax_percent: parseFloat(taxPercent) || 0,
        tax_amount: taxAmt,
        total_amount: totalCalc,
        notes: invoiceNotes.trim() || null,
        status: 'draft',
      })
      .select()
      .single()

    if (error) { showToast('Failed to create invoice', 'error') }
    else {
      logAction({ action: 'create_invoice', module: 'Invoices', details: { invoice_number: data.invoice_number, customer: customer?.name, total: totalCalc } })
      showToast(`Invoice ${data.invoice_number} created`)
      setShowCreate(false)
      setSelCustomer(''); setItems([{ commodity_id: '', name: '', unit: 'pcs', qty: 1, price: 0, subtotal: 0 }])
      setTaxPercent('0'); setInvoiceNotes('')
      fetchInvoices()
    }
    setCreating(false)
  }

  async function updateStatus(inv: Invoice, status: Invoice['status']) {
    await supabase.from('invoices').update({ status }).eq('id', inv.id)
    logAction({ action: 'update_invoice_status', module: 'Invoices', details: { invoice_number: inv.invoice_number, status } })
    showToast(`Status updated to ${status}`)
    fetchInvoices()
    if (detailInvoice?.id === inv.id) setDetailInvoice({ ...detailInvoice, status })
  }

  function printInvoice() {
    const content = printRef.current?.innerHTML
    if (!content) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <html><head><title>Invoice</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 32px; color: #111; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { padding: 8px 12px; border: 1px solid #ddd; text-align: left; }
        th { background: #f5f5f5; }
        .right { text-align: right; }
        .total-row td { font-weight: bold; }
      </style></head><body>${content}</body></html>
    `)
    win.document.close()
    win.print()
  }

  const filtered = invoices.filter(inv => {
    const matchSearch = inv.invoice_number.toLowerCase().includes(search.toLowerCase())
      || inv.customer_name.toLowerCase().includes(search.toLowerCase())
    const matchStatus = filterStatus === 'all' || inv.status === filterStatus
    return matchSearch && matchStatus
  })

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Toast */}
      {toast && (
        <div
          className="fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-white text-sm font-medium shadow-lg"
          style={{ background: toast.type === 'success' ? '#3ECF8E' : '#ef4444', color: toast.type === 'success' ? '#0a0a0a' : 'white' }}
        >
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Receipt size={24} color="#3ECF8E" />
          <div>
            <h1 className="text-white text-xl font-bold">Invoices</h1>
            <p className="text-[#9ca3af] text-sm">{invoices.length} total</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(v => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: '#3ECF8E', color: '#0a0a0a' }}
        >
          <Plus size={16} /> New Invoice
        </button>
      </div>

      {/* Create panel */}
      {showCreate && (
        <div className="rounded-xl p-5 mb-6 border border-[#2a2a2a]" style={{ background: '#1a1a1a' }}>
          <h3 className="text-white font-semibold mb-4">Create Invoice</h3>

          {/* Customer */}
          <div className="mb-4">
            <label className="text-[#9ca3af] text-xs mb-1 block">Customer *</label>
            <select
              value={selCustomer}
              onChange={e => setSelCustomer(e.target.value)}
              className="w-64 px-3 py-2 rounded-lg text-white text-sm border border-[#2a2a2a] outline-none"
              style={{ background: '#111' }}
            >
              <option value="">Select customer...</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Items */}
          <div className="mb-4">
            <table className="w-full text-sm mb-2">
              <thead>
                <tr className="text-[#6b7280]">
                  <th className="text-left pb-2 font-medium w-2/5">Commodity</th>
                  <th className="text-left pb-2 font-medium w-16">Unit</th>
                  <th className="text-right pb-2 font-medium w-20">Qty</th>
                  <th className="text-right pb-2 font-medium w-24">Price (₹)</th>
                  <th className="text-right pb-2 font-medium w-24">Subtotal</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i}>
                    <td className="pr-2 pb-2">
                      <select
                        value={item.commodity_id}
                        onChange={e => updateItem(i, 'commodity_id', e.target.value)}
                        className="w-full px-2 py-1.5 rounded text-white text-sm border border-[#2a2a2a] outline-none"
                        style={{ background: '#111' }}
                      >
                        <option value="">Select...</option>
                        {commodities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                    <td className="pr-2 pb-2 text-[#9ca3af] text-xs">{item.unit}</td>
                    <td className="pr-2 pb-2">
                      <input
                        type="number"
                        value={item.qty}
                        min={1}
                        onChange={e => updateItem(i, 'qty', parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1.5 rounded text-white text-sm border border-[#2a2a2a] outline-none text-right"
                        style={{ background: '#111' }}
                      />
                    </td>
                    <td className="pr-2 pb-2">
                      <input
                        type="number"
                        value={item.price}
                        min={0}
                        onChange={e => updateItem(i, 'price', parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1.5 rounded text-white text-sm border border-[#2a2a2a] outline-none text-right"
                        style={{ background: '#111' }}
                      />
                    </td>
                    <td className="pr-2 pb-2 text-right text-white font-medium">
                      ₹{item.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="pb-2">
                      {items.length > 1 && (
                        <button onClick={() => removeItem(i)} className="text-[#6b7280] hover:text-[#ef4444]">
                          <X size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={addItem} className="flex items-center gap-1 text-xs text-[#3ECF8E]">
              <Plus size={12} /> Add Item
            </button>
          </div>

          {/* Totals row */}
          <div className="flex gap-6 items-start mb-4">
            <div>
              <label className="text-[#9ca3af] text-xs mb-1 block">Tax %</label>
              <input
                type="number"
                value={taxPercent}
                min={0}
                max={100}
                onChange={e => setTaxPercent(e.target.value)}
                className="w-20 px-3 py-2 rounded-lg text-white text-sm border border-[#2a2a2a] outline-none"
                style={{ background: '#111' }}
              />
            </div>
            <div>
              <label className="text-[#9ca3af] text-xs mb-1 block">Notes</label>
              <input
                value={invoiceNotes}
                onChange={e => setInvoiceNotes(e.target.value)}
                placeholder="Optional notes..."
                className="w-64 px-3 py-2 rounded-lg text-white text-sm border border-[#2a2a2a] outline-none"
                style={{ background: '#111' }}
              />
            </div>
            <div className="ml-auto text-right">
              <div className="text-[#9ca3af] text-xs">Subtotal: <span className="text-white">₹{subtotalCalc.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
              <div className="text-[#9ca3af] text-xs">Tax ({taxPercent}%): <span className="text-white">₹{taxAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
              <div className="text-white font-bold text-lg">₹{totalCalc.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg text-sm text-[#9ca3af] border border-[#2a2a2a]">Cancel</button>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: '#3ECF8E', color: '#0a0a0a', opacity: creating ? 0.6 : 1 }}
            >
              {creating ? 'Creating...' : 'Create Invoice'}
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b7280]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by invoice # or customer..."
            className="w-full pl-9 pr-4 py-2 rounded-lg text-white text-sm border border-[#2a2a2a] outline-none"
            style={{ background: '#1a1a1a' }}
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 rounded-lg text-white text-sm border border-[#2a2a2a] outline-none"
          style={{ background: '#1a1a1a' }}
        >
          <option value="all">All Status</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="paid">Paid</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Invoice list */}
      <div className="rounded-xl border border-[#2a2a2a] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: '#111', borderBottom: '1px solid #2a2a2a' }}>
              <th className="text-left px-4 py-3 text-[#9ca3af] font-medium">Invoice #</th>
              <th className="text-left px-4 py-3 text-[#9ca3af] font-medium">Customer</th>
              <th className="text-left px-4 py-3 text-[#9ca3af] font-medium">Date</th>
              <th className="text-right px-4 py-3 text-[#9ca3af] font-medium">Amount</th>
              <th className="text-center px-4 py-3 text-[#9ca3af] font-medium">Status</th>
              <th className="text-right px-4 py-3 text-[#9ca3af] font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-12 text-[#6b7280]">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-[#6b7280]">No invoices found</td></tr>
            ) : filtered.map((inv, i) => (
              <tr key={inv.id} style={{ background: i % 2 === 0 ? '#0f0f0f' : '#111', borderBottom: '1px solid #1e1e1e' }}>
                <td className="px-4 py-3 text-[#3ECF8E] font-mono font-medium">{inv.invoice_number}</td>
                <td className="px-4 py-3 text-white">{inv.customer_name}</td>
                <td className="px-4 py-3 text-[#9ca3af]">{new Date(inv.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                <td className="px-4 py-3 text-right text-white font-semibold">₹{Number(inv.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-3 text-center">
                  <select
                    value={inv.status}
                    onChange={e => updateStatus(inv, e.target.value as Invoice['status'])}
                    className="px-2 py-0.5 rounded-full text-xs font-semibold border-0 outline-none cursor-pointer"
                    style={{ background: STATUS_COLORS[inv.status].bg, color: STATUS_COLORS[inv.status].color }}
                  >
                    <option value="draft">Draft</option>
                    <option value="sent">Sent</option>
                    <option value="paid">Paid</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => setDetailInvoice(inv)}
                    className="p-1.5 rounded-lg"
                    style={{ background: 'rgba(107,114,128,0.1)', color: '#9ca3af' }}
                    title="View invoice"
                  >
                    <Eye size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Invoice Detail Modal */}
      {detailInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="rounded-2xl border border-[#2a2a2a] w-full max-w-2xl max-h-[90vh] flex flex-col" style={{ background: '#1a1a1a' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2a2a]">
              <div className="flex items-center gap-2">
                <Receipt size={18} color="#3ECF8E" />
                <span className="text-white font-semibold">{detailInvoice.invoice_number}</span>
                <span
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ml-2"
                  style={STATUS_COLORS[detailInvoice.status]}
                >
                  {STATUS_ICONS[detailInvoice.status]}
                  {detailInvoice.status.charAt(0).toUpperCase() + detailInvoice.status.slice(1)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={printInvoice}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-[#9ca3af] border border-[#2a2a2a]"
                  title="Print"
                >
                  <Printer size={14} /> Print
                </button>
                <button onClick={() => setDetailInvoice(null)} className="text-[#9ca3af] hover:text-white">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 p-6" ref={printRef}>
              {/* Invoice content for print */}
              <div className="flex justify-between mb-6">
                <div>
                  <p className="text-[#9ca3af] text-xs">Customer</p>
                  <p className="text-white font-semibold text-lg">{detailInvoice.customer_name}</p>
                </div>
                <div className="text-right">
                  <p className="text-[#9ca3af] text-xs">Date</p>
                  <p className="text-white">{new Date(detailInvoice.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                </div>
              </div>

              <table className="w-full text-sm mb-6">
                <thead>
                  <tr style={{ borderBottom: '1px solid #2a2a2a' }} className="text-[#6b7280]">
                    <th className="text-left pb-2 font-medium">Item</th>
                    <th className="text-center pb-2 font-medium">Qty</th>
                    <th className="text-center pb-2 font-medium">Unit</th>
                    <th className="text-right pb-2 font-medium">Price</th>
                    <th className="text-right pb-2 font-medium">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {detailInvoice.items.map((item, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #1e1e1e' }}>
                      <td className="py-2 text-white">{item.name}</td>
                      <td className="py-2 text-center text-[#9ca3af]">{item.qty}</td>
                      <td className="py-2 text-center text-[#9ca3af]">{item.unit}</td>
                      <td className="py-2 text-right text-[#9ca3af]">₹{Number(item.price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="py-2 text-right text-white">₹{Number(item.subtotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-end">
                <div className="w-56 space-y-1 text-sm">
                  <div className="flex justify-between text-[#9ca3af]">
                    <span>Subtotal</span>
                    <span>₹{Number(detailInvoice.subtotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  {detailInvoice.tax_percent > 0 && (
                    <div className="flex justify-between text-[#9ca3af]">
                      <span>Tax ({detailInvoice.tax_percent}%)</span>
                      <span>₹{Number(detailInvoice.tax_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-white font-bold text-base border-t border-[#2a2a2a] pt-2 mt-2">
                    <span>Total</span>
                    <span>₹{Number(detailInvoice.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>

              {detailInvoice.notes && (
                <div className="mt-4 p-3 rounded-lg border border-[#2a2a2a]">
                  <p className="text-[#9ca3af] text-xs mb-1">Notes</p>
                  <p className="text-white text-sm">{detailInvoice.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
