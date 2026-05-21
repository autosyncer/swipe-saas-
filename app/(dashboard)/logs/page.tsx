'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Download, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import ExcelJS from 'exceljs'

// ── Types ─────────────────────────────────────────────────────────────────────
interface AuditLog {
  id: string
  created_at: string
  user_id: string
  user_name: string
  user_email: string
  action: string
  module: string
  details: Record<string, unknown>
}

interface Filters {
  module: string
  userId: string
  search: string
  from: string
  to: string
}

interface UserOption { id: string; full_name: string; email: string }

// ── Helpers ───────────────────────────────────────────────────────────────────
const MODULES = ['All', 'Auth', 'Daily Register', 'Customers', 'Users & Roles', 'Swipe Machines', 'CC Sheet', 'Customer Sheet']

function fmtTs(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ', ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function actionBadgeStyle(action: string): { background: string; color: string } {
  const a = action.toLowerCase()
  if (a === 'login' || a === 'logout') return { background: '#dbeafe', color: '#1e40af' }
  if (a.includes('creat') || a.includes('add')) return { background: '#d1fae5', color: '#065f46' }
  if (a.includes('updat') || a.includes('edit') || a.includes('chang')) return { background: '#fef3c7', color: '#92400e' }
  if (a.includes('delet') || a.includes('remov')) return { background: '#fee2e2', color: '#991b1b' }
  if (a.includes('block')) return { background: '#ffedd5', color: '#9a3412' }
  return { background: '#f3f4f6', color: '#374151' }
}

function initials(name: string) {
  return (name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

const AVATAR_COLORS = ['#3ECF8E', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']
function avatarColor(name: string) {
  return AVATAR_COLORS[(name || 'U').charCodeAt(0) % AVATAR_COLORS.length]
}

// ── Details expander ──────────────────────────────────────────────────────────
function DetailsCell({ details }: { details: Record<string, unknown> }) {
  const [open, setOpen] = useState(false)
  const keys = Object.keys(details || {})
  if (keys.length === 0) return <span className="text-[#9ca3af] text-xs">—</span>

  const preview = keys.slice(0, 2).map(k => `${k}: ${String(details[k])}`).join(', ')

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-xs text-[#6b7280] hover:text-[#1a1a1a] transition-colors"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="truncate max-w-[180px]">{preview}{keys.length > 2 ? '...' : ''}</span>
      </button>
      {open && (
        <div className="mt-1 rounded-md p-2 text-xs font-mono text-[#374151] bg-[#f9f9f9] border border-[#e5e7eb] max-w-[260px] whitespace-pre-wrap break-all">
          {JSON.stringify(details, null, 2)}
        </div>
      )}
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="bg-white rounded-lg border p-4" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
      <div className="text-xs text-[#6b7280] mb-1">{label}</div>
      <div className="text-2xl font-bold truncate" style={{ color }}>{value}</div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function LogsPage() {
  const auth = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (auth !== undefined && auth?.role !== 'super_admin') router.replace('/dashboard')
  }, [auth, router])

  const today = new Date().toISOString().split('T')[0]
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]

  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [userOptions, setUserOptions] = useState<UserOption[]>([])
  const [todayLogs, setTodayLogs] = useState<AuditLog[]>([])
  const [filters, setFilters] = useState<Filters>({
    module: '',
    userId: '',
    search: '',
    from: weekAgo,
    to: today,
  })

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    
    let query = supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)

    if (filters.module) query = query.eq('module', filters.module)
    if (filters.userId) query = query.eq('user_id', filters.userId)
    if (filters.from) query = query.gte('created_at', filters.from + 'T00:00:00')
    if (filters.to) query = query.lte('created_at', filters.to + 'T23:59:59')
    if (filters.search) query = query.ilike('action', '%' + filters.search + '%')

    const { data, error } = await query
    if (error) console.error('Audit logs fetch error:', error)
    setLogs((data as AuditLog[]) || [])
    setLoading(false)
  }, [filters])

  useEffect(() => {
    
    supabase.from('profiles').select('id, full_name, email').then(({ data }) => {
      setUserOptions((data as UserOption[]) || [])
    })
  }, [])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  // Today's stats (independent of date filters)
  useEffect(() => {
    
    supabase.from('audit_logs')
      .select('*')
      .gte('created_at', today + 'T00:00:00')
      .lte('created_at', today + 'T23:59:59')
      .then(({ data }) => setTodayLogs((data as AuditLog[]) || []))
  }, [today])

  // Realtime
  useEffect(() => {
    
    const ch = supabase.channel('audit-logs-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_logs' }, () => {
        fetchLogs()
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchLogs])

  const stats = useMemo(() => {
    const total = todayLogs.length
    const logins = todayLogs.filter(l => l.action === 'Login').length
    const txCreated = todayLogs.filter(l => l.action === 'Transaction Created').length
    const userCounts: Record<string, { name: string; count: number }> = {}
    todayLogs.forEach(l => {
      if (!userCounts[l.user_id]) userCounts[l.user_id] = { name: l.user_name || l.user_email, count: 0 }
      userCounts[l.user_id].count++
    })
    const mostActive = Object.values(userCounts).sort((a, b) => b.count - a.count)[0]?.name || '—'
    return { total, logins, txCreated, mostActive }
  }, [todayLogs])

  const setFilter = (key: keyof Filters, value: string) =>
    setFilters(f => ({ ...f, [key]: value }))

  async function exportXlsx() {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Audit Logs')
    ws.columns = [
      { header: 'Timestamp', key: 'ts', width: 22 },
      { header: 'User', key: 'user', width: 20 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Action', key: 'action', width: 22 },
      { header: 'Module', key: 'module', width: 18 },
      { header: 'Details', key: 'details', width: 40 },
    ]
    ws.getRow(1).font = { bold: true }
    logs.forEach(l => {
      ws.addRow({
        ts: fmtTs(l.created_at),
        user: l.user_name,
        email: l.user_email,
        action: l.action,
        module: l.module,
        details: JSON.stringify(l.details || {}),
      })
    })
    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `AuditLogs_${today.split('-').reverse().join('-')}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (auth !== undefined && auth?.role !== 'super_admin') return null

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-[#1a1a1a]">Audit Logs</h1>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: '#f3f4f6', color: '#374151' }}>
            {logs.length} records
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchLogs}
            className="p-1.5 rounded-md hover:bg-gray-100 text-[#6b7280]"
            title="Refresh"
          >
            <RefreshCw size={15} />
          </button>
          <button
            onClick={exportXlsx}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white"
            style={{ background: '#3ECF8E' }}
          >
            <Download size={13} /> Export .xlsx
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Actions Today" value={stats.total} color="#1a1a1a" />
        <StatCard label="Logins Today" value={stats.logins} color="#3b82f6" />
        <StatCard label="Transactions Created Today" value={stats.txCreated} color="#3ECF8E" />
        <StatCard label="Most Active User" value={stats.mostActive} color="#6366f1" />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4 bg-white rounded-lg border p-3" style={{ borderColor: '#e5e7eb' }}>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-[#6b7280]">From</label>
          <input
            type="date"
            className="rounded-md border px-2 py-1.5 text-sm outline-none focus:border-[#3ECF8E]"
            style={{ borderColor: '#e5e7eb' }}
            value={filters.from}
            onChange={e => setFilter('from', e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-[#6b7280]">To</label>
          <input
            type="date"
            className="rounded-md border px-2 py-1.5 text-sm outline-none focus:border-[#3ECF8E]"
            style={{ borderColor: '#e5e7eb' }}
            value={filters.to}
            onChange={e => setFilter('to', e.target.value)}
          />
        </div>
        <select
          className="rounded-md border px-2 py-1.5 text-sm bg-white outline-none focus:border-[#3ECF8E]"
          style={{ borderColor: '#e5e7eb' }}
          value={filters.module}
          onChange={e => setFilter('module', e.target.value === 'All' ? '' : e.target.value)}
        >
          {MODULES.map(m => <option key={m} value={m === 'All' ? '' : m}>{m}</option>)}
        </select>
        <select
          className="rounded-md border px-2 py-1.5 text-sm bg-white outline-none focus:border-[#3ECF8E]"
          style={{ borderColor: '#e5e7eb' }}
          value={filters.userId}
          onChange={e => setFilter('userId', e.target.value)}
        >
          <option value="">All Users</option>
          {userOptions.map(u => (
            <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
          ))}
        </select>
        <div className="flex items-center gap-2 rounded-md border px-2 py-1.5 flex-1 min-w-[160px]" style={{ borderColor: '#e5e7eb' }}>
          <Search size={13} color="#9ca3af" />
          <input
            className="text-sm outline-none bg-transparent flex-1"
            placeholder="Search actions..."
            value={filters.search}
            onChange={e => setFilter('search', e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border overflow-hidden" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead style={{ background: '#f9f9f9' }}>
              <tr>
                {['Timestamp', 'User', 'Action', 'Module', 'Details'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[#6b7280] uppercase tracking-wide border-b border-[#e5e7eb]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-[#9ca3af]">Loading...</td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-[#9ca3af]">No audit logs found.</td>
                </tr>
              ) : logs.map((log, i) => (
                <tr
                  key={log.id}
                  className="border-b last:border-0 hover:bg-[#f9f9f9] transition-colors"
                  style={{ borderColor: '#f3f4f6', background: i % 2 === 0 ? '#fff' : '#fafafa' }}
                >
                  <td className="px-4 py-3 text-xs text-[#6b7280] whitespace-nowrap">
                    {fmtTs(log.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                        style={{ background: avatarColor(log.user_name || log.user_email) }}
                      >
                        {initials(log.user_name || log.user_email)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-[#1a1a1a] truncate max-w-[120px]">{log.user_name || '—'}</div>
                        <div className="text-[10px] text-[#9ca3af] truncate max-w-[120px]">{log.user_email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap"
                      style={actionBadgeStyle(log.action)}
                    >
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium" style={{ background: '#f3f4f6', color: '#374151' }}>
                      {log.module}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <DetailsCell details={log.details || {}} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
