'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Plus, X, Shield, ShieldCheck, Trash2, Eye, EyeOff, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { createAdminClient } from '@/lib/supabase/admin-client'
import { useAuth } from '@/lib/auth-context'
import { logAction } from '@/lib/audit-log'

type Profile = {
  id: string
  full_name: string
  email: string
  role: 'super_admin' | 'sub_admin'
  assigned_accounts: string[]
  is_active: boolean
  created_at: string
}

type Toast = { id: number; message: string; type: 'success' | 'error' }

type FormData = {
  full_name: string
  email: string
  password: string
  new_password: string
  role: 'super_admin' | 'sub_admin'
  assigned_accounts: string[]
  is_active: boolean
}

const ALL_ACCOUNTS = ['NSS', 'SKT', 'RT', 'KTC', 'TAP', 'BGM', 'NTC', 'MAHA', 'MAL', 'MAP', 'HASTI', 'MGS', 'MTC', 'TAPI']

const AVATAR_COLORS = ['#3ECF8E', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function AvatarCircle({ name, size = 40 }: { name: string; size?: number }) {
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
      style={{ width: size, height: size, background: AVATAR_COLORS[idx], fontSize: size * 0.35 }}
    >
      {initials(name)}
    </div>
  )
}

function ToastContainer({ toasts, remove }: { toasts: Toast[]; remove: (id: number) => void }) {
  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2">
      {toasts.map(t => (
        <div
          key={t.id}
          className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-white shadow-lg"
          style={{ background: t.type === 'success' ? '#3ECF8E' : '#ef4444', minWidth: 260 }}
        >
          <span className="flex-1">{t.message}</span>
          <button onClick={() => remove(t.id)} className="opacity-70 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}

const emptyForm = (): FormData => ({
  full_name: '',
  email: '',
  password: '',
  new_password: '',
  role: 'sub_admin',
  assigned_accounts: [],
  is_active: true,
})

export default function UsersPage() {
  const auth = useAuth()
  const router = useRouter()

  // Redirect non-super-admins away (once auth is loaded)
  useEffect(() => {
    if (auth !== undefined && auth?.role !== 'super_admin') {
      router.replace('/dashboard')
    }
  }, [auth, router])

  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [toastCounter, setToastCounter] = useState(0)

  // Panel state
  const [panelOpen, setPanelOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<Profile | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm())
  const [showPassword, setShowPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [saving, setSaving] = useState(false)

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null)
  const [deleting, setDeleting] = useState(false)

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    const id = toastCounter + 1
    setToastCounter(c => c + 1)
    setToasts(t => [...t, { id, message, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000)
  }, [toastCounter])

  const removeToast = (id: number) => setToasts(t => t.filter(x => x.id !== id))

  const fetchUsers = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: true })
    if (error) {
      console.error('Fetch users error:', error)
      showToast('Failed to load users', 'error')
    }
    setUsers((data as Profile[]) || [])
    setLoading(false)
  }, [showToast])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const openAdd = () => {
    setEditingUser(null)
    setForm(emptyForm())
    setShowPassword(false)
    setShowNewPassword(false)
    setPanelOpen(true)
  }

  const openEdit = (user: Profile) => {
    setEditingUser(user)
    setForm({
      full_name: user.full_name,
      email: user.email,
      password: '',
      new_password: '',
      role: user.role,
      assigned_accounts: user.assigned_accounts || [],
      is_active: user.is_active,
    })
    setShowPassword(false)
    setShowNewPassword(false)
    setPanelOpen(true)
  }

  const closePanel = () => {
    setPanelOpen(false)
    setEditingUser(null)
    setForm(emptyForm())
  }

  const toggleAccount = (acc: string) => {
    setForm(f => ({
      ...f,
      assigned_accounts: f.assigned_accounts.includes(acc)
        ? f.assigned_accounts.filter(a => a !== acc)
        : [...f.assigned_accounts, acc],
    }))
  }

  const handleSave = async () => {
    if (!form.full_name.trim()) { showToast('Full name is required', 'error'); return }
    if (!editingUser && !form.email.trim()) { showToast('Email is required', 'error'); return }
    if (!editingUser && !form.password.trim()) { showToast('Password is required', 'error'); return }

    setSaving(true)
    try {
      const admin = createAdminClient()

      if (editingUser) {
        // Update profile
        const { error } = await admin
          .from('profiles')
          .update({
            full_name: form.full_name,
            role: form.role,
            assigned_accounts: form.assigned_accounts,
            is_active: form.is_active,
          })
          .eq('id', editingUser.id)

        if (error) throw new Error(error.message)

        // Update password if provided
        if (form.new_password.trim()) {
          const { error: pwErr } = await admin.auth.admin.updateUserById(editingUser.id, {
            password: form.new_password,
          })
          if (pwErr) throw new Error(pwErr.message)
        }

        showToast('User updated', 'success')

        if (editingUser.role !== form.role) {
          logAction({
            action: 'User Role Changed',
            module: 'Users & Roles',
            details: { target_user: editingUser.email, old_role: editingUser.role, new_role: form.role },
          })
        }

        const oldAccounts = JSON.stringify((editingUser.assigned_accounts || []).slice().sort())
        const newAccounts = JSON.stringify((form.assigned_accounts || []).slice().sort())
        if (oldAccounts !== newAccounts) {
          logAction({
            action: 'Accounts Reassigned',
            module: 'Users & Roles',
            details: {
              target_user: editingUser.email,
              old_accounts: editingUser.assigned_accounts || [],
              new_accounts: form.assigned_accounts,
            },
          })
        }

        if (editingUser.is_active !== form.is_active) {
          logAction({
            action: form.is_active ? 'User Activated' : 'User Deactivated',
            module: 'Users & Roles',
            details: { target_user: editingUser.email },
          })
        }

        if (form.new_password.trim()) {
          logAction({
            action: 'Password Changed',
            module: 'Users & Roles',
            details: { target_user: editingUser.email },
          })
        }
      } else {
        // Create auth user
        const { data: authData, error: authError } = await admin.auth.admin.createUser({
          email: form.email,
          password: form.password,
          email_confirm: true,
        })
        if (authError) throw new Error('Auth error: ' + authError.message)

        // Insert profile
        const { error: profileError } = await admin.from('profiles').insert({
          id: authData.user.id,
          full_name: form.full_name,
          email: form.email,
          role: form.role,
          assigned_accounts: form.assigned_accounts,
          is_active: form.is_active,
        })
        if (profileError) throw new Error('Profile error: ' + profileError.message)

        showToast('User created successfully', 'success')
        logAction({
          action: 'User Created',
          module: 'Users & Roles',
          details: {
            new_user_email: form.email,
            new_user_name: form.full_name,
            role_assigned: form.role,
            accounts_assigned: form.assigned_accounts,
          },
        })
      }

      closePanel()
      await fetchUsers()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Something went wrong', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const admin = createAdminClient()
      const deletedEmail = deleteTarget.email
      const deletedName = deleteTarget.full_name
      const deletedRole = deleteTarget.role
      await admin.from('profiles').delete().eq('id', deleteTarget.id)
      await admin.auth.admin.deleteUser(deleteTarget.id)
      showToast('User deleted', 'success')
      logAction({
        action: 'User Deleted',
        module: 'Users & Roles',
        details: { target_user_email: deletedEmail, target_user_name: deletedName, role: deletedRole },
      })
      setDeleteTarget(null)
      await fetchUsers()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const toggleStatus = async (user: Profile) => {
    try {
      const admin = createAdminClient()
      const newActive = !user.is_active
      const { error } = await admin
        .from('profiles')
        .update({ is_active: newActive })
        .eq('id', user.id)
      if (error) throw new Error(error.message)
      logAction({
        action: newActive ? 'User Activated' : 'User Deactivated',
        module: 'Users & Roles',
        details: { target_user: user.email },
      })
      await fetchUsers()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update failed', 'error')
    }
  }

  const filtered = users.filter(u =>
    u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  )

  const superAdminCount = users.filter(u => u.role === 'super_admin').length
  const subAdminCount = users.filter(u => u.role === 'sub_admin').length

  return (
    <div>
      <ToastContainer toasts={toasts} remove={removeToast} />

      {/* Header */}
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
            onClick={openAdd}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium text-white"
            style={{ background: '#3ECF8E', borderRadius: 6 }}
          >
            <Plus size={14} /> Add User
          </button>
        </div>
      </div>

      {/* Role cards with counts */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {[
          {
            icon: ShieldCheck,
            title: 'Super Admin',
            desc: 'Full access to all modules, accounts, and settings. Can manage users and roles.',
            color: '#3ECF8E',
            count: superAdminCount,
          },
          {
            icon: Shield,
            title: 'Sub Admin',
            desc: 'Limited access based on assigned accounts. Cannot manage users or system settings.',
            color: '#6366f1',
            count: subAdminCount,
          },
        ].map(r => (
          <div
            key={r.title}
            className="bg-white rounded-lg border p-5 flex items-start gap-4"
            style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
          >
            <div className="p-3 rounded-lg" style={{ background: `${r.color}20` }}>
              <r.icon size={22} color={r.color} />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <div className="font-semibold text-[#1a1a1a]">{r.title}</div>
                <span
                  className="text-sm font-bold px-2 py-0.5 rounded-full"
                  style={{ background: `${r.color}20`, color: r.color }}
                >
                  {r.count}
                </span>
              </div>
              <div className="text-sm text-[#6b7280]">{r.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* User cards grid */}
      {loading ? (
        <div className="text-center py-16 text-[#6b7280] text-sm">Loading users...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-[#6b7280] text-sm">
          {search ? 'No users match your search.' : 'No users found. Add your first user.'}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {filtered.map(u => (
            <div
              key={u.id}
              className="bg-white rounded-lg border p-4 relative group"
              style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
            >
              {/* Hover action buttons */}
              <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => openEdit(u)}
                  className="p-1 rounded hover:bg-gray-100"
                  title="Edit"
                >
                  <Pencil size={13} color="#6b7280" />
                </button>
                <button
                  onClick={() => setDeleteTarget(u)}
                  className="p-1 rounded hover:bg-red-50"
                  title="Delete"
                >
                  <Trash2 size={13} color="#ef4444" />
                </button>
              </div>

              {/* Status dot — visible when not hovering */}
              <div
                className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full group-hover:opacity-0 transition-opacity cursor-pointer"
                style={{ background: u.is_active ? '#3ECF8E' : '#9ca3af' }}
                title={u.is_active ? 'Active — click to deactivate' : 'Inactive — click to activate'}
                onClick={() => toggleStatus(u)}
              />

              <div className="flex flex-col items-center text-center gap-2 pt-2">
                <AvatarCircle name={u.full_name || u.email} size={48} />
                <div>
                  <div className="font-semibold text-[#1a1a1a]">{u.full_name}</div>
                  <div className="text-xs text-[#6b7280] mt-0.5">{u.email}</div>
                </div>
                <span
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"
                  style={{
                    background: u.role === 'super_admin' ? '#d1fae5' : '#ede9fe',
                    color: u.role === 'super_admin' ? '#065f46' : '#5b21b6',
                  }}
                >
                  {u.role === 'super_admin' ? 'SUPER ADMIN' : 'SUB ADMIN'}
                </span>
                <div className="flex flex-wrap justify-center gap-1 mt-1">
                  {(u.assigned_accounts || []).slice(0, 5).map(a => (
                    <span key={a} className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-[#f3f4f6] text-[#374151]">{a}</span>
                  ))}
                  {(u.assigned_accounts || []).length > 5 && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-[#f3f4f6] text-[#6b7280]">
                      +{u.assigned_accounts.length - 5}
                    </span>
                  )}
                </div>
                {/* Active/inactive toggle pill */}
                <button
                  onClick={() => toggleStatus(u)}
                  className="mt-1 text-xs px-2 py-0.5 rounded-full border transition-colors"
                  style={{
                    borderColor: u.is_active ? '#3ECF8E' : '#9ca3af',
                    color: u.is_active ? '#065f46' : '#6b7280',
                    background: u.is_active ? '#d1fae5' : '#f3f4f6',
                  }}
                >
                  {u.is_active ? 'Active' : 'Inactive'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit slide-in panel */}
      {panelOpen && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={closePanel} />
          <div
            className="fixed right-0 top-0 h-full bg-white z-50 flex flex-col"
            style={{ width: 400, boxShadow: '-4px 0 20px rgba(0,0,0,0.12)' }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5e7eb]">
              <h2 className="font-semibold text-[#1a1a1a]">{editingUser ? 'Edit User' : 'Add User'}</h2>
              <button onClick={closePanel} className="p-1 hover:bg-gray-100 rounded">
                <X size={18} color="#6b7280" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
              {/* Full Name */}
              <div>
                <label className="block text-xs font-medium text-[#374151] mb-1">Full Name *</label>
                <input
                  type="text"
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-[#3ECF8E]"
                  style={{ borderColor: '#e5e7eb', borderRadius: 6 }}
                  placeholder="e.g. Ramesh Patel"
                  value={form.full_name}
                  onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-medium text-[#374151] mb-1">Email *</label>
                <input
                  type="email"
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none"
                  style={{
                    borderColor: '#e5e7eb',
                    borderRadius: 6,
                    background: editingUser ? '#f9f9f9' : undefined,
                    color: editingUser ? '#9ca3af' : undefined,
                  }}
                  placeholder="user@chamundaswipe.com"
                  value={form.email}
                  readOnly={!!editingUser}
                  onChange={e => !editingUser && setForm(f => ({ ...f, email: e.target.value }))}
                />
              </div>

              {/* Password (add) or New Password (edit) */}
              {!editingUser ? (
                <div>
                  <label className="block text-xs font-medium text-[#374151] mb-1">Password *</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-[#3ECF8E] pr-10"
                      style={{ borderColor: '#e5e7eb', borderRadius: 6 }}
                      placeholder="••••••••"
                      value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#374151]"
                      onClick={() => setShowPassword(v => !v)}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-[#374151] mb-1">New Password <span className="text-[#9ca3af] font-normal">(leave blank to keep)</span></label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-[#3ECF8E] pr-10"
                      style={{ borderColor: '#e5e7eb', borderRadius: 6 }}
                      placeholder="••••••••"
                      value={form.new_password}
                      onChange={e => setForm(f => ({ ...f, new_password: e.target.value }))}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#374151]"
                      onClick={() => setShowNewPassword(v => !v)}
                    >
                      {showNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              )}

              {/* Role */}
              <div>
                <label className="block text-xs font-medium text-[#374151] mb-1">Role</label>
                <select
                  className="w-full rounded-md border px-3 py-2 text-sm bg-white outline-none focus:border-[#3ECF8E]"
                  style={{ borderColor: '#e5e7eb', borderRadius: 6 }}
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value as 'super_admin' | 'sub_admin' }))}
                >
                  <option value="super_admin">Super Admin</option>
                  <option value="sub_admin">Sub Admin</option>
                </select>
              </div>

              {/* Assigned Accounts */}
              <div>
                <label className="block text-xs font-medium text-[#374151] mb-2">Assign Accounts</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_ACCOUNTS.map(a => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => toggleAccount(a)}
                      className="px-2.5 py-1 rounded text-xs font-medium border transition-colors"
                      style={{
                        background: form.assigned_accounts.includes(a) ? '#3ECF8E' : '#f9f9f9',
                        color: form.assigned_accounts.includes(a) ? '#fff' : '#374151',
                        borderColor: form.assigned_accounts.includes(a) ? '#3ECF8E' : '#e5e7eb',
                      }}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>

              {/* Is Active toggle */}
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-[#374151]">Active</label>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                  className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
                  style={{ background: form.is_active ? '#3ECF8E' : '#d1d5db' }}
                >
                  <span
                    className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
                    style={{ transform: form.is_active ? 'translateX(18px)' : 'translateX(2px)' }}
                  />
                </button>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-[#e5e7eb] flex gap-3">
              <button
                onClick={closePanel}
                className="flex-1 py-2 rounded-md border text-sm font-medium text-[#374151]"
                style={{ borderColor: '#e5e7eb', borderRadius: 6 }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2 rounded-md text-sm font-medium text-white disabled:opacity-60"
                style={{ background: '#3ECF8E', borderRadius: 6 }}
              >
                {saving ? 'Saving...' : editingUser ? 'Update User' : 'Save User'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => !deleting && setDeleteTarget(null)} />
          <div
            className="fixed z-[60] bg-white rounded-xl p-6 shadow-xl"
            style={{ top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 360 }}
          >
            <div className="mb-4">
              <div className="font-semibold text-[#1a1a1a] mb-1">Delete {deleteTarget.full_name}?</div>
              <div className="text-sm text-[#6b7280]">They will lose all access immediately. This cannot be undone.</div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 py-2 rounded-md border text-sm font-medium text-[#374151] disabled:opacity-60"
                style={{ borderColor: '#e5e7eb', borderRadius: 6 }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2 rounded-md text-sm font-medium text-white disabled:opacity-60"
                style={{ background: '#ef4444', borderRadius: 6 }}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
