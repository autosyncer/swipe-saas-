'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { logAction } from '@/lib/audit-log'
import { Package, Plus, Pencil, Check, X, Clock, Search } from 'lucide-react'

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

const UNITS = ['pcs', 'kg', 'g', 'ltr', 'ml', 'box', 'bag', 'roll', 'set', 'pair', 'dozen', 'meter']

const inp = 'w-full px-3 py-2 rounded-lg text-sm border border-[#e5e7eb] outline-none focus:border-[#3ECF8E] bg-white text-[#111]'
const lbl = 'block text-xs font-medium text-[#374151] mb-1'

export default function CommoditiesPage() {
  const auth = useAuth()

  const [commodities, setCommodities] = useState<Commodity[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState('')
  const [addUnit, setAddUnit] = useState('kg')
  const [addPrice, setAddPrice] = useState('')
  const [addSaving, setAddSaving] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editPrice, setEditPrice] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editSaving, setEditSaving] = useState(false)

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
    const { data } = await supabase.from('commodities').select('*').order('name')
    setCommodities(data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchCommodities() }, [])

  useEffect(() => {
    const ch = supabase.channel('commodities_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commodities' }, fetchCommodities)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  async function handleAdd() {
    if (!addName.trim() || !addPrice) return
    setAddSaving(true)
    const price = parseFloat(addPrice)
    const { data, error } = await supabase
      .from('commodities').insert({ name: addName.trim(), unit: addUnit, current_price: price })
      .select().single()
    if (error) showToast('Failed to add commodity', 'error')
    else {
      await supabase.from('commodity_price_history').insert({ commodity_id: data.id, price, note: 'Initial price' })
      logAction({ action: 'add_commodity', module: 'Commodities', details: { name: addName, price } })
      showToast('Commodity added')
      setAddName(''); setAddUnit('kg'); setAddPrice(''); setShowAdd(false)
    }
    setAddSaving(false)
  }

  async function saveEdit(c: Commodity) {
    const newPrice = parseFloat(editPrice)
    if (isNaN(newPrice) || newPrice < 0) { showToast('Invalid price', 'error'); return }
    setEditSaving(true)
    const { error } = await supabase.from('commodities').update({ current_price: newPrice }).eq('id', c.id)
    if (error) showToast('Update failed', 'error')
    else {
      await supabase.from('commodity_price_history').insert({ commodity_id: c.id, price: newPrice, note: editNote.trim() || null })
      logAction({ action: 'update_commodity_price', module: 'Commodities', details: { name: c.name, old: c.current_price, new: newPrice } })
      showToast('Price updated')
      setEditingId(null)
    }
    setEditSaving(false)
  }

  async function toggleActive(c: Commodity) {
    await supabase.from('commodities').update({ is_active: !c.is_active }).eq('id', c.id)
  }

  async function openHistory(c: Commodity) {
    setHistoryModal({ id: c.id, name: c.name })
    setHistoryLoading(true)
    const { data } = await supabase.from('commodity_price_history')
      .select('id, price, note, created_at').eq('commodity_id', c.id)
      .order('created_at', { ascending: false }).limit(50)
    setHistory(data ?? [])
    setHistoryLoading(false)
  }

  const filtered = commodities.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
  const activeCount = commodities.filter(c => c.is_active).length

  return (
    <div className="p-6 max-w-4xl mx-auto">

      {/* Toast */}
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
            <Package size={18} color="#3ECF8E" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#111]">Commodities</h1>
            <p className="text-xs text-[#6b7280]">{activeCount} active item{activeCount !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(v => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ background: '#3ECF8E' }}
        >
          <Plus size={15} /> Add Commodity
        </button>
      </div>

      {/* Add panel */}
      {showAdd && (
        <div className="rounded-xl p-4 mb-5 border border-[#e5e7eb] bg-white shadow-sm">
          <h3 className="text-sm font-semibold text-[#111] mb-4">New Commodity</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className={lbl}>Name *</label>
              <input className={inp} value={addName} onChange={e => setAddName(e.target.value)} placeholder="e.g. Rice, Sugar" />
            </div>
            <div>
              <label className={lbl}>Unit *</label>
              <select className={inp} value={addUnit} onChange={e => setAddUnit(e.target.value)}>
                {UNITS.map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Price (₹) *</label>
              <input className={inp} type="number" value={addPrice} onChange={e => setAddPrice(e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg text-sm border border-[#e5e7eb] text-[#374151] hover:bg-gray-50">Cancel</button>
            <button
              onClick={handleAdd} disabled={addSaving || !addName.trim() || !addPrice}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: '#3ECF8E' }}
            >
              {addSaving ? 'Adding...' : 'Add Commodity'}
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search commodities..."
          className="w-full pl-9 pr-4 py-2 rounded-lg text-sm border border-[#e5e7eb] outline-none focus:border-[#3ECF8E] bg-white text-[#111]"
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[#e5e7eb] overflow-hidden bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e5e7eb]" style={{ background: '#f9fafb' }}>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Name</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Unit</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Current Price</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Status</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f3f4f6]">
            {loading ? (
              <tr><td colSpan={5} className="text-center py-12 text-sm text-[#9ca3af]">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-12 text-sm text-[#9ca3af]">No commodities found</td></tr>
            ) : filtered.map(c => (
              <tr key={c.id} className="hover:bg-[#f9fafb] transition-colors">
                <td className="px-4 py-3 font-medium text-[#111]">{c.name}</td>
                <td className="px-4 py-3 text-[#6b7280]">{c.unit}</td>
                <td className="px-4 py-3 text-right">
                  {editingId === c.id ? (
                    <div className="flex items-center gap-2 justify-end">
                      <input
                        type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)} autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(c); if (e.key === 'Escape') setEditingId(null) }}
                        className="w-24 px-2 py-1 rounded border border-[#3ECF8E] outline-none text-sm text-[#111]"
                      />
                      <input
                        value={editNote} onChange={e => setEditNote(e.target.value)} placeholder="Note (opt)"
                        className="w-28 px-2 py-1 rounded border border-[#e5e7eb] outline-none text-xs text-[#111]"
                      />
                    </div>
                  ) : (
                    <span className="font-semibold text-[#111]">₹{c.current_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => toggleActive(c)}
                    className="px-2.5 py-0.5 rounded-full text-xs font-semibold"
                    style={{
                      background: c.is_active ? '#f0fdf4' : '#f3f4f6',
                      color: c.is_active ? '#16a34a' : '#6b7280',
                      border: `1px solid ${c.is_active ? '#bbf7d0' : '#e5e7eb'}`,
                    }}
                  >
                    {c.is_active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center gap-1 justify-end">
                    {editingId === c.id ? (
                      <>
                        <button onClick={() => saveEdit(c)} disabled={editSaving}
                          className="p-1.5 rounded-lg hover:bg-green-50" style={{ color: '#3ECF8E' }} title="Save">
                          <Check size={14} />
                        </button>
                        <button onClick={() => setEditingId(null)}
                          className="p-1.5 rounded-lg hover:bg-red-50" style={{ color: '#ef4444' }} title="Cancel">
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <button onClick={() => { setEditingId(c.id); setEditPrice(c.current_price.toString()); setEditNote('') }}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-[#9ca3af] hover:text-[#374151]" title="Edit price">
                        <Pencil size={14} />
                      </button>
                    )}
                    <button onClick={() => openHistory(c)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-[#9ca3af] hover:text-[#374151]" title="Price history">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-xl border border-[#e5e7eb] shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5e7eb]">
              <div className="flex items-center gap-2">
                <Clock size={16} color="#3ECF8E" />
                <span className="font-semibold text-[#111] text-sm">Price History — {historyModal.name}</span>
              </div>
              <button onClick={() => { setHistoryModal(null); setHistory([]) }} className="text-[#9ca3af] hover:text-[#374151]">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              {historyLoading ? (
                <p className="text-center text-[#9ca3af] py-8 text-sm">Loading...</p>
              ) : history.length === 0 ? (
                <p className="text-center text-[#9ca3af] py-8 text-sm">No history found</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#e5e7eb]">
                      <th className="text-left pb-2 text-xs text-[#6b7280] font-medium">Date</th>
                      <th className="text-right pb-2 text-xs text-[#6b7280] font-medium">Price</th>
                      <th className="text-left pb-2 pl-4 text-xs text-[#6b7280] font-medium">Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f3f4f6]">
                    {history.map(h => (
                      <tr key={h.id}>
                        <td className="py-2 text-[#6b7280] text-xs">
                          {new Date(h.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="py-2 text-right font-semibold text-[#111]">₹{Number(h.price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td className="py-2 pl-4 text-[#9ca3af] text-xs">{h.note ?? '—'}</td>
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
