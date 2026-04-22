'use client'

import { useState } from 'react'
import { Search, Plus, X, Shield, ShieldCheck } from 'lucide-react'

const users = [
  { id: 1, name: 'Rakesh Patel', email: 'rakesh@chamundaswipe.com', role: 'SUPER ADMIN', accounts: ['NSS', 'SKT', 'RT', 'KTC', 'TAP', 'BGM', 'NTC', 'MAHA', 'MAL', 'MAP', 'HASTI'], active: true },
  { id: 2, name: 'Priya Shah', email: 'priya@chamundaswipe.com', role: 'SUB ADMIN', accounts: ['NSS', 'SKT'], active: true },
  { id: 3, name: 'Amit Desai', email: 'amit@chamundaswipe.com', role: 'SUB ADMIN', accounts: ['RT', 'KTC'], active: true },
  { id: 4, name: 'Neha Joshi', email: 'neha@chamundaswipe.com', role: 'SUB ADMIN', accounts: ['TAP', 'BGM'], active: false },
  { id: 5, name: 'Vikram Mehta', email: 'vikram@chamundaswipe.com', role: 'SUB ADMIN', accounts: ['MAHA'], active: true },
  { id: 6, name: 'Sunita Rao', email: 'sunita@chamundaswipe.com', role: 'SUPER ADMIN', accounts: ['NSS', 'SKT', 'RT', 'KTC', 'TAP', 'BGM', 'NTC', 'MAHA', 'MAL', 'MAP', 'HASTI'], active: true },
]

const allAccounts = ['NSS', 'SKT', 'RT', 'KTC', 'TAP', 'BGM', 'NTC', 'MAHA', 'MAL', 'MAP', 'HASTI']

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function AvatarCircle({ name, size = 40 }: { name: string; size?: number }) {
  const colors = ['#3ECF8E', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']
  const idx = name.charCodeAt(0) % colors.length
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
      style={{ width: size, height: size, background: colors[idx], fontSize: size * 0.35 }}
    >
      {initials(name)}
    </div>
  )
}

export default function UsersPage() {
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', email: '', password: '', role: 'SUB ADMIN', accounts: [] as string[] })

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  )

  function toggleAccount(acc: string) {
    setAddForm(f => ({
      ...f,
      accounts: f.accounts.includes(acc)
        ? f.accounts.filter(a => a !== acc)
        : [...f.accounts, acc],
    }))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-bold text-[#1a1a1a]">Users & Roles</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-md border px-3 py-1.5" style={{ borderColor: '#e5e7eb' }}>
            <Search size={14} color="#9ca3af" />
            <input
              className="text-sm outline-none bg-transparent"
              placeholder="Search users..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium text-white"
            style={{ background: '#3ECF8E', borderRadius: 6 }}
          >
            <Plus size={14} /> Add User
          </button>
        </div>
      </div>

      {/* Featured role cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {[
          { icon: ShieldCheck, title: 'Super Admin', desc: 'Full access to all modules, accounts, and settings. Can manage users and roles.', color: '#3ECF8E' },
          { icon: Shield, title: 'Sub Admin', desc: 'Limited access based on assigned accounts. Cannot manage users or system settings.', color: '#6366f1' },
        ].map(r => (
          <div
            key={r.title}
            className="bg-white rounded-lg border p-5 flex items-start gap-4"
            style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
          >
            <div className="p-3 rounded-lg" style={{ background: `${r.color}20` }}>
              <r.icon size={22} color={r.color} />
            </div>
            <div>
              <div className="font-semibold text-[#1a1a1a] mb-1">{r.title}</div>
              <div className="text-sm text-[#6b7280]">{r.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* User cards grid */}
      <div className="grid grid-cols-3 gap-4">
        {filtered.map(u => (
          <div
            key={u.id}
            className="bg-white rounded-lg border p-4 relative"
            style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
          >
            {/* Status dot */}
            <div
              className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full"
              style={{ background: u.active ? '#3ECF8E' : '#9ca3af' }}
              title={u.active ? 'Active' : 'Inactive'}
            />
            <div className="flex flex-col items-center text-center gap-2 pt-2">
              <AvatarCircle name={u.name} size={48} />
              <div>
                <div className="font-semibold text-[#1a1a1a]">{u.name}</div>
                <div className="text-xs text-[#6b7280] mt-0.5">{u.email}</div>
              </div>
              <span
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"
                style={{
                  background: u.role === 'SUPER ADMIN' ? '#d1fae5' : '#ede9fe',
                  color: u.role === 'SUPER ADMIN' ? '#065f46' : '#5b21b6',
                }}
              >
                {u.role}
              </span>
              <div className="flex flex-wrap justify-center gap-1 mt-1">
                {u.accounts.slice(0, 5).map(a => (
                  <span key={a} className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-[#f3f4f6] text-[#374151]">{a}</span>
                ))}
                {u.accounts.length > 5 && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-[#f3f4f6] text-[#6b7280]">+{u.accounts.length - 5}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add User slide-in */}
      {showAdd && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setShowAdd(false)} />
          <div
            className="fixed right-0 top-0 h-full bg-white z-50 flex flex-col"
            style={{ width: 400, boxShadow: '-4px 0 20px rgba(0,0,0,0.12)' }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5e7eb]">
              <h2 className="font-semibold text-[#1a1a1a]">Add User</h2>
              <button onClick={() => setShowAdd(false)} className="p-1 hover:bg-gray-100 rounded">
                <X size={18} color="#6b7280" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
              {[
                { label: 'Full Name', field: 'name', type: 'text', placeholder: 'e.g. Ramesh Patel' },
                { label: 'Email', field: 'email', type: 'email', placeholder: 'user@chamundaswipe.com' },
                { label: 'Password', field: 'password', type: 'password', placeholder: '••••••••' },
              ].map(({ label, field, type, placeholder }) => (
                <div key={field}>
                  <label className="block text-xs font-medium text-[#374151] mb-1">{label}</label>
                  <input
                    type={type}
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-[#3ECF8E]"
                    style={{ borderColor: '#e5e7eb', borderRadius: 6 }}
                    placeholder={placeholder}
                    value={(addForm as unknown as Record<string, string>)[field]}
                    onChange={e => setAddForm(f => ({ ...f, [field]: e.target.value }))}
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-[#374151] mb-1">Role</label>
                <select
                  className="w-full rounded-md border px-3 py-2 text-sm bg-white outline-none focus:border-[#3ECF8E]"
                  style={{ borderColor: '#e5e7eb', borderRadius: 6 }}
                  value={addForm.role}
                  onChange={e => setAddForm(f => ({ ...f, role: e.target.value }))}
                >
                  <option>SUPER ADMIN</option>
                  <option>SUB ADMIN</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#374151] mb-2">Assign Accounts</label>
                <div className="flex flex-wrap gap-2">
                  {allAccounts.map(a => (
                    <button
                      key={a}
                      onClick={() => toggleAccount(a)}
                      className="px-2.5 py-1 rounded text-xs font-medium border transition-colors"
                      style={{
                        background: addForm.accounts.includes(a) ? '#3ECF8E' : '#f9f9f9',
                        color: addForm.accounts.includes(a) ? '#fff' : '#374151',
                        borderColor: addForm.accounts.includes(a) ? '#3ECF8E' : '#e5e7eb',
                      }}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-[#e5e7eb] flex gap-3">
              <button
                onClick={() => setShowAdd(false)}
                className="flex-1 py-2 rounded-md border text-sm font-medium text-[#374151]"
                style={{ borderColor: '#e5e7eb', borderRadius: 6 }}
              >
                Cancel
              </button>
              <button
                className="flex-1 py-2 rounded-md text-sm font-medium text-white"
                style={{ background: '#3ECF8E', borderRadius: 6 }}
              >
                Save User
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
