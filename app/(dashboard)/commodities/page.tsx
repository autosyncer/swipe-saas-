'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import { logAction } from '@/lib/audit-log'
import {
  Package, Plus, Pencil, Check, X, Clock, TrendingUp, TrendingDown,
  Search, ChevronDown, ChevronUp, AlertCircle
} from 'lucide-react'

const supabase = createClient()

interface Commodity {
  id: string
  name: string
  unit: string
  current_price: number
  is_active: boolean
  created_at: string
  updated_at: string
}

interface PriceHistory {
  id: string
  price: number
  note: string | null
  created_at: string
}

const UNITS = ['pcs', 'kg', 'g', 'litre', 'ml', 'box', 'bag', 'roll', 'set', 'pair', 'dozen', 'meter']

export default function CommoditiesPage() {
  const auth = useAuth()
  const isSuperAdmin = auth?.role === 'super_admin'

  const [commodities, setCommodities] = useState<Commodity[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Add panel
  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState('')
  const [addUnit, setAddUnit] = useState('pcs')
  const [addPrice, setAddPrice] = useState('')
  const [addSaving, setAddSaving] = useState(false)

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editPrice, setEditPrice] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  // Price history modal
  const [historyModal, setHistoryModal] = useState<{ id: string; name: string } | null>(null)
  const [history, setHistory] = useState<PriceHistory[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function fetchCommodities() {
    setLoading(true)
    const { data } = await supabase
      .from('commodities')
      .select('*')
      .order('name')
    setCommodities(data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchCommodities() }, [])

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('commodities_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commodities' }, fetchCommodities)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  async function handleAdd() {
    if (!addName.trim() || !addPrice) return
    setAddSaving(true)
    const price = parseFloat(addPrice)
    const { data, error } = await supabase
      .from('commodities')
      .insert({ name: addName.trim(), unit: addUnit, current_price: price })
      .select()
      .single()
    if (error) { showToast('Failed to add commodity', 'error') }
    else {
      // seed price history
      await supabase.from('commodity_price_history').insert({
        commodity_id: data.id,
        price,
        note: 'Initial price'
      })
      logAction({ action: 'add_commodity', module: 'Commodities', details: { name: addName, price } })
      showToast('Commodity added')
      setAddName(''); setAddUnit('pcs'); setAddPrice(''); setShowAdd(false)
    }
    setAddSaving(false)
  }

  function startEdit(c: Commodity) {
    setEditingId(c.id)
    setEditPrice(c.current_price.toString())
    setEditNote('')
  }

  async function saveEdit(c: Commodity) {
    const newPrice = parseFloat(editPrice)
    if (isNaN(newPrice) || newPrice < 0) { showToast('Invalid price', 'error'); return }
    setEditSaving(true)
    const { error } = await supabase
      .from('commodities')
      .update({ current_price: newPrice })
      .eq('id', c.id)
    if (error) { showToast('Update failed', 'error') }
    else {
      // note update on history row
      if (editNote.trim()) {
        await supabase
          .from('commodity_price_history')
          .update({ note: editNote.trim() })
          .eq('commodity_id', c.id)
          .order('created_at', { ascending: false })
          .limit(1)
      }
      logAction({ action: 'update_commodity_price', module: 'Commodities', details: { id: c.id, name: c.name, old: c.current_price, new: newPrice } })
      showToast('Price updated')
      setEditingId(null)
    }
    setEditSaving(false)
  }

  async function toggleActive(c: Commodity) {
    await supabase.from('commodities').update({ is_active: !c.is_active }).eq('id', c.id)
    logAction({ action: 'toggle_commodity', module: 'Commodities', details: { id: c.id, name: c.name, active: !c.is_active } })
  }

  async function openHistory(c: Commodity) {
    setHistoryModal({ id: c.id, name: c.name })
    setHistoryLoading(true)
    const { data } = await supabase
      .from('commodity_price_history')
      .select('id, price, note, created_at')
      .eq('commodity_id', c.id)
      .order('created_at', { ascending: false })
      .limit(50)
    setHistory(data ?? [])
    setHistoryLoading(false)
  }

  const filtered = commodities.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Toast */}
      {toast && (
        <div
          className="fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-white text-sm font-medium shadow-lg"
          style={{ background: toast.type === 'success' ? '#3ECF8E' : '#ef4444' }}
        >
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Package size={24} color="#3ECF8E" />
          <div>
            <h1 className="text-white text-xl font-bold">Commodities</h1>
            <p className="text-[#9ca3af] text-sm">{commodities.filter(c => c.is_active).length} active items</p>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(v => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: '#3ECF8E', color: '#0a0a0a' }}
        >
          <Plus size={16} />
          Add Commodity
        </button>
      </div>

      {/* Add panel */}
      {showAdd && (
        <div className="rounded-xl p-4 mb-6 border border-[#2a2a2a]" style={{ background: '#1a1a1a' }}>
          <h3 className="text-white font-semibold mb-4">New Commodity</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="text-[#9ca3af] text-xs mb-1 block">Name *</label>
              <input
                value={addName}
                onChange={e => setAddName(e.target.value)}
                placeholder="e.g. Rice, Sugar, Oil"
                className="w-full px-3 py-2 rounded-lg text-white text-sm border border-[#2a2a2a] outline-none"
                style={{ background: '#111' }}
              />
            </div>
            <div>
              <label className="text-[#9ca3af] text-xs mb-1 block">Unit *</label>
              <select
                value={addUnit}
                onChange={e => setAddUnit(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-white text-sm border border-[#2a2a2a] outline-none"
                style={{ background: '#111' }}
              >
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[#9ca3af] text-xs mb-1 block">Price (₹) *</label>
              <input
                type="number"
                value={addPrice}
                onChange={e => setAddPrice(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 rounded-lg text-white text-sm border border-[#2a2a2a] outline-none"
                style={{ background: '#111' }}
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg text-sm text-[#9ca3af] border border-[#2a2a2a]">Cancel</button>
            <button
              onClick={handleAdd}
              disabled={addSaving || !addName.trim() || !addPrice}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: '#3ECF8E', color: '#0a0a0a', opacity: addSaving ? 0.6 : 1 }}
            >
              {addSaving ? 'Adding...' : 'Add Commodity'}
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b7280]" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search commodities..."
          className="w-full pl-9 pr-4 py-2 rounded-lg text-white text-sm border border-[#2a2a2a] outline-none"
          style={{ background: '#1a1a1a' }}
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[#2a2a2a] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: '#111', borderBottom: '1px solid #2a2a2a' }}>
              <th className="text-left px-4 py-3 text-[#9ca3af] font-medium">Name</th>
              <th className="text-left px-4 py-3 text-[#9ca3af] font-medium">Unit</th>
              <th className="text-right px-4 py-3 text-[#9ca3af] font-medium">Current Price</th>
              <th className="text-center px-4 py-3 text-[#9ca3af] font-medium">Status</th>
              <th className="text-right px-4 py-3 text-[#9ca3af] font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-12 text-[#6b7280]">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-12 text-[#6b7280]">No commodities found</td></tr>
            ) : filtered.map((c, i) => (
              <tr
                key={c.id}
                style={{ background: i % 2 === 0 ? '#0f0f0f' : '#111', borderBottom: '1px solid #1e1e1e' }}
              >
                <td className="px-4 py-3 text-white font-medium">{c.name}</td>
                <td className="px-4 py-3 text-[#9ca3af]">{c.unit}</td>
                <td className="px-4 py-3 text-right">
                  {editingId === c.id ? (
                    <div className="flex items-center gap-2 justify-end">
                      <span className="text-[#9ca3af]">₹</span>
                      <input
                        type="number"
                        value={editPrice}
                        onChange={e => setEditPrice(e.target.value)}
                        className="w-24 px-2 py-1 rounded text-white text-sm border border-[#3ECF8E] outline-none"
                        style={{ background: '#1a1a1a' }}
                        autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(c); if (e.key === 'Escape') setEditingId(null) }}
                      />
                      <input
                        value={editNote}
                        onChange={e => setEditNote(e.target.value)}
                        placeholder="Note (opt)"
                        className="w-28 px-2 py-1 rounded text-white text-xs border border-[#2a2a2a] outline-none"
                        style={{ background: '#1a1a1a' }}
                      />
                    </div>
                  ) : (
                    <span className="text-white font-semibold">₹{c.current_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => toggleActive(c)}
                    className="px-2 py-0.5 rounded-full text-xs font-semibold"
                    style={{
                      background: c.is_active ? 'rgba(62,207,142,0.15)' : 'rgba(107,114,128,0.15)',
                      color: c.is_active ? '#3ECF8E' : '#6b7280'
                    }}
                  >
                    {c.is_active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center gap-1 justify-end">
                    {editingId === c.id ? (
                      <>
                        <button
                          onClick={() => saveEdit(c)}
                          disabled={editSaving}
                          className="p-1.5 rounded-lg"
                          style={{ background: 'rgba(62,207,142,0.15)', color: '#3ECF8E' }}
                          title="Save"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="p-1.5 rounded-lg"
                          style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
                          title="Cancel"
                        >
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => startEdit(c)}
                        className="p-1.5 rounded-lg"
                        style={{ background: 'rgba(107,114,128,0.1)', color: '#9ca3af' }}
                        title="Edit price"
                      >
                        <Pencil size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => openHistory(c)}
                      className="p-1.5 rounded-lg"
                      style={{ background: 'rgba(107,114,128,0.1)', color: '#9ca3af' }}
                      title="Price history"
                    >
                      <Clock size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Price History Modal */}
      {historyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="rounded-2xl border border-[#2a2a2a] w-full max-w-lg max-h-[80vh] flex flex-col" style={{ background: '#1a1a1a' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2a2a]">
              <div className="flex items-center gap-2">
                <Clock size={18} color="#3ECF8E" />
                <span className="text-white font-semibold">Price History — {historyModal.name}</span>
              </div>
              <button onClick={() => { setHistoryModal(null); setHistory([]) }} className="text-[#9ca3af] hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              {historyLoading ? (
                <p className="text-center text-[#6b7280] py-8">Loading...</p>
              ) : history.length === 0 ? (
                <p className="text-center text-[#6b7280] py-8">No history found</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[#6b7280]">
                      <th className="text-left pb-2">Date</th>
                      <th className="text-right pb-2">Price</th>
                      <th className="text-left pb-2 pl-4">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h, i) => (
                      <tr key={h.id} style={{ borderTop: i > 0 ? '1px solid #2a2a2a' : undefined }}>
                        <td className="py-2 text-[#9ca3af]">
                          {new Date(h.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-2 text-right text-white font-medium">₹{Number(h.price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td className="py-2 pl-4 text-[#6b7280] text-xs">{h.note ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
