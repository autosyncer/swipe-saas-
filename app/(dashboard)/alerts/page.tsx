'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { runRiskDetection } from '@/lib/risk-engine'
import { logAction } from '@/lib/audit-log'
import {
  AlertTriangle, RefreshCw, X, ChevronDown,
  ShieldAlert, Clock, User, ExternalLink,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Severity = 'high' | 'medium' | 'low'

interface RiskAlert {
  id: string
  alert_type: string
  severity: Severity
  customer_name: string
  customer_id: string | null
  transaction_id: string | null
  details: Record<string, unknown>
  is_dismissed: boolean
  reviewed_at: string | null
  created_at: string
}

type StatusFilter = 'active' | 'dismissed' | 'all'
type SeverityFilter = 'ALL' | 'high' | 'medium' | 'low'
type TypeFilter = 'ALL' | 'Multiple Swipes Same Day' | 'High Value Transaction' | 'High Outstanding Balance' | 'Card Due Soon' | 'Card Used Across Multiple Accounts' | 'High Volume in Short Time'

const DISMISS_REASONS = [
  'False Positive',
  'Already Reviewed',
  'Customer Verified',
  'Duplicate Alert',
  'Other',
]

const severityColor: Record<Severity, { border: string; badge: string; text: string; bg: string }> = {
  high: { border: '#ef4444', badge: '#fee2e2', text: '#dc2626', bg: '#fff5f5' },
  medium: { border: '#f59e0b', badge: '#fef3c7', text: '#d97706', bg: '#fffbeb' },
  low: { border: '#3b82f6', badge: '#dbeafe', text: '#2563eb', bg: '#eff6ff' },
}

// ─── Alert detail renderer ────────────────────────────────────────────────────

function AlertDetails({ alert }: { alert: RiskAlert }) {
  const d = alert.details
  const fmt = (n: unknown) =>
    '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })

  switch (alert.alert_type) {
    case 'Multiple Swipes Same Day': {
      const txns = (d.transactions as { sr_no: number; amount: number }[]) ?? []
      return (
        <div>
          <p className="text-sm text-[#374151] mb-2">
            ⚠️ <strong>{alert.customer_name}</strong> swiped{' '}
            <strong>{String(d.swipe_count)} times</strong> on {String(d.date)} — Total:{' '}
            <strong>{fmt(d.total_amount)}</strong>
          </p>
          {txns.length > 0 && (
            <div className="bg-[#f9fafb] rounded-lg p-2 text-xs">
              <div className="grid grid-cols-2 gap-x-4 font-semibold text-[#9ca3af] mb-1">
                <span>SR #</span><span>Amount</span>
              </div>
              {txns.slice(0, 5).map((t, i) => (
                <div key={i} className="grid grid-cols-2 gap-x-4 text-[#374151]">
                  <span>{t.sr_no}</span><span>{fmt(t.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }
    case 'High Value Transaction':
      return (
        <div className="text-sm text-[#374151] space-y-1">
          <p>🚨 Single transaction of <strong>{fmt(d.amount)}</strong> by <strong>{alert.customer_name}</strong></p>
          <p className="text-xs text-[#6b7280]">SR #{String(d.sr_no)} · {String(d.date)} · Account: {String(d.account)}</p>
        </div>
      )
    case 'High Outstanding Balance':
      return (
        <div className="text-sm text-[#374151] space-y-1">
          <p>💰 <strong>{alert.customer_name}</strong> has <strong>{fmt(d.outstanding)}</strong> outstanding</p>
          {!!d.customer_phone && (
            <p className="text-xs text-[#6b7280]">📞 {String(d.customer_phone)}</p>
          )}
        </div>
      )
    case 'Card Due Soon':
      return (
        <div className="text-sm text-[#374151] space-y-1">
          <p>📅 <strong>{String(d.bank)}</strong> card ...{String(d.last4)} of <strong>{alert.customer_name}</strong>{' '}
            due in <strong>{String(d.days_left)} day{Number(d.days_left) !== 1 ? 's' : ''}</strong>
          </p>
          <p className="text-xs text-[#6b7280]">Due date: {String(d.due_date)}</p>
        </div>
      )
    case 'Card Used Across Multiple Accounts': {
      const accounts = (d.accounts as string[]) ?? []
      return (
        <div className="text-sm text-[#374151] space-y-1">
          <p>⚡ <strong>{String(d.bank_card)}</strong> card of <strong>{alert.customer_name}</strong>{' '}
            used across <strong>{String(d.account_count)} accounts</strong>
          </p>
          <p className="text-xs text-[#6b7280]">{accounts.join(', ')}</p>
        </div>
      )
    }
    case 'High Volume in Short Time':
      return (
        <div className="text-sm text-[#374151] space-y-1">
          <p>🔥 <strong>{String(d.transaction_count)} transactions</strong> in 1 hour — Total: <strong>{fmt(d.total_amount)}</strong></p>
          <p className="text-xs text-[#6b7280]">Hour: {String(d.hour)}:xx</p>
        </div>
      )
    default:
      return <p className="text-sm text-[#374151]">{JSON.stringify(d)}</p>
  }
}

// ─── Alert Card ───────────────────────────────────────────────────────────────

function AlertCard({
  alert,
  onDismiss,
  onReview,
}: {
  alert: RiskAlert
  onDismiss: (a: RiskAlert) => void
  onReview: (a: RiskAlert) => void
}) {
  const sc = severityColor[alert.severity] ?? severityColor.low
  const timeAgo = (() => {
    const diff = Math.floor((Date.now() - new Date(alert.created_at).getTime()) / 1000)
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  })()

  return (
    <div
      className="bg-white rounded-xl border border-[#e5e7eb] overflow-hidden"
      style={{
        boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
        borderLeft: `4px solid ${sc.border}`,
        opacity: alert.is_dismissed ? 0.55 : 1,
      }}
    >
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wide"
              style={{ background: sc.badge, color: sc.text }}
            >
              {alert.severity}
            </span>
            <span className="text-sm font-semibold text-[#111827]">{alert.alert_type}</span>
            {alert.reviewed_at && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#d1fae5] text-[#065f46]">Reviewed</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[#9ca3af]">
            <Clock size={11} />
            {timeAgo}
          </div>
        </div>

        {/* Customer */}
        <div className="flex items-center gap-2 mb-3">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
            style={{ background: sc.border }}
          >
            {alert.customer_name.charAt(0).toUpperCase()}
          </div>
          <div className="flex items-center gap-1.5">
            <User size={12} color="#9ca3af" />
            <span className="text-sm font-medium text-[#374151]">{alert.customer_name}</span>
          </div>
        </div>

        {/* Details */}
        <AlertDetails alert={alert} />

        {/* Action buttons */}
        {!alert.is_dismissed && (
          <div className="flex items-center gap-2 mt-4">
            {alert.customer_name !== 'Multiple' && (
              <a
                href={`/transactions?search=${encodeURIComponent(alert.customer_name)}`}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-md border border-[#e5e7eb] hover:bg-[#f9fafb] text-[#374151]"
              >
                <ExternalLink size={11} />
                View Transactions
              </a>
            )}
            {!alert.reviewed_at && (
              <button
                onClick={() => onReview(alert)}
                className="text-xs px-3 py-1.5 rounded-md border border-[#e5e7eb] hover:bg-[#f9fafb] text-[#374151]"
              >
                Mark Reviewed
              </button>
            )}
            <button
              onClick={() => onDismiss(alert)}
              className="ml-auto text-xs px-3 py-1.5 rounded-md text-[#ef4444] border border-[#fca5a5] hover:bg-[#fff5f5]"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Dismiss Modal ────────────────────────────────────────────────────────────

function DismissModal({
  alert,
  onConfirm,
  onCancel,
}: {
  alert: RiskAlert
  onConfirm: (reason: string, notes: string) => void
  onCancel: () => void
}) {
  const [reason, setReason] = useState(DISMISS_REASONS[0])
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-[#e5e7eb]">
          <h2 className="font-semibold text-[#111827]">Dismiss Alert</h2>
          <button onClick={onCancel}><X size={18} color="#6b7280" /></button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <p className="text-sm text-[#6b7280] mb-1">Alert: <strong className="text-[#374151]">{alert.alert_type}</strong></p>
            <p className="text-sm text-[#6b7280]">Customer: <strong className="text-[#374151]">{alert.customer_name}</strong></p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#374151] mb-1">Reason for dismissal</label>
            <div className="relative">
              <select
                value={reason}
                onChange={e => setReason(e.target.value)}
                className="w-full border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm text-[#374151] appearance-none pr-8"
              >
                {DISMISS_REASONS.map(r => <option key={r}>{r}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9ca3af] pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#374151] mb-1">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Add any additional context..."
              className="w-full border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm text-[#374151] resize-none focus:outline-none focus:ring-1 focus:ring-[#3ECF8E]"
            />
          </div>
        </div>
        <div className="flex gap-2 p-4 border-t border-[#e5e7eb]">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 rounded-lg border border-[#e5e7eb] text-sm text-[#374151] hover:bg-[#f9fafb]"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              setLoading(true)
              await onConfirm(reason, notes)
              setLoading(false)
            }}
            disabled={loading}
            className="flex-1 px-4 py-2 rounded-lg text-sm text-white font-medium"
            style={{ background: '#ef4444' }}
          >
            {loading ? 'Dismissing…' : 'Confirm Dismiss'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<RiskAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [lastRun, setLastRun] = useState<string | null>(null)

  // Filters
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('ALL')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Dismiss modal
  const [dismissTarget, setDismissTarget] = useState<RiskAlert | null>(null)

  const fetchAlerts = useCallback(async () => {
    const supabase = createClient()
    setLoading(true)
    const { data } = await supabase
      .from('risk_alerts')
      .select('*')
      .order('created_at', { ascending: false })
    setAlerts((data as RiskAlert[]) ?? [])
    setLoading(false)
  }, [])

  // Initial load + run detection
  useEffect(() => {
    fetchAlerts()
    // Run detection on page load (non-blocking)
    runRiskDetection().then(() => {
      setLastRun(new Date().toLocaleTimeString())
      fetchAlerts()
    })
  }, [fetchAlerts])

  // Auto-run every 30 minutes
  useEffect(() => {
    const id = setInterval(async () => {
      await runRiskDetection()
      setLastRun(new Date().toLocaleTimeString())
      fetchAlerts()
    }, 30 * 60 * 1000)
    return () => clearInterval(id)
  }, [fetchAlerts])

  // Realtime subscription
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('risk_alerts_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'risk_alerts' }, () => {
        fetchAlerts()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchAlerts])

  const handleRunDetection = async () => {
    setRunning(true)
    try {
      const newCount = await runRiskDetection()
      setLastRun(new Date().toLocaleTimeString())
      await logAction({
        action: 'Risk Detection Run',
        module: 'Risk Alerts',
        details: { triggered_by: 'manual', alerts_found: newCount },
      })
      await fetchAlerts()
    } finally {
      setRunning(false)
    }
  }

  const handleReview = async (alert: RiskAlert) => {
    const supabase = createClient()
    await supabase
      .from('risk_alerts')
      .update({ reviewed_at: new Date().toISOString() })
      .eq('id', alert.id)
    fetchAlerts()
  }

  const handleDismissConfirm = async (reason: string, notes: string) => {
    if (!dismissTarget) return
    const supabase = createClient()
    await supabase
      .from('risk_alerts')
      .update({ is_dismissed: true })
      .eq('id', dismissTarget.id)

    await logAction({
      action: 'Risk Alert Dismissed',
      module: 'Risk Alerts',
      details: {
        alert_type: dismissTarget.alert_type,
        customer: dismissTarget.customer_name,
        severity: dismissTarget.severity,
        reason,
        notes,
      },
    })
    setDismissTarget(null)
    fetchAlerts()
  }

  // ── Filtered alerts ──
  const filtered = alerts.filter(a => {
    if (statusFilter === 'active' && a.is_dismissed) return false
    if (statusFilter === 'dismissed' && !a.is_dismissed) return false
    if (severityFilter !== 'ALL' && a.severity !== severityFilter) return false
    if (typeFilter !== 'ALL' && a.alert_type !== typeFilter) return false
    if (dateFrom && a.created_at < dateFrom) return false
    if (dateTo && a.created_at > dateTo + 'T23:59:59') return false
    return true
  })

  const highCount = alerts.filter(a => !a.is_dismissed && a.severity === 'high').length
  const mediumCount = alerts.filter(a => !a.is_dismissed && a.severity === 'medium').length
  const today = new Date().toISOString().split('T')[0]
  const dismissedToday = alerts.filter(a => a.is_dismissed && a.created_at.startsWith(today)).length

  const allTypes: TypeFilter[] = [
    'ALL',
    'Multiple Swipes Same Day',
    'High Value Transaction',
    'High Outstanding Balance',
    'Card Due Soon',
    'Card Used Across Multiple Accounts',
    'High Volume in Short Time',
  ]

  return (
    <div className="pb-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={20} color="#f59e0b" />
          <h1 className="text-lg font-bold text-[#1a1a1a]">Risk Alerts</h1>
          {lastRun && (
            <span className="text-xs text-[#9ca3af] ml-2">Last run: {lastRun}</span>
          )}
        </div>
        <button
          onClick={handleRunDetection}
          disabled={running}
          className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-medium text-white"
          style={{ background: running ? '#9ca3af' : '#3ECF8E' }}
        >
          <RefreshCw size={14} className={running ? 'animate-spin' : ''} />
          {running ? 'Scanning…' : 'Run Detection Now'}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[
          { label: 'High Risk', count: highCount, color: '#ef4444', bg: '#fee2e2', border: '#fca5a5' },
          { label: 'Medium Risk', count: mediumCount, color: '#d97706', bg: '#fef3c7', border: '#fcd34d' },
          { label: 'Dismissed Today', count: dismissedToday, color: '#6b7280', bg: '#f3f4f6', border: '#d1d5db' },
        ].map(c => (
          <div
            key={c.label}
            className="bg-white rounded-xl border p-4"
            style={{ borderColor: c.border, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', background: c.bg }}
          >
            <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: c.color }}>{c.label}</div>
            <div className="text-3xl font-bold" style={{ color: c.color }}>{c.count}</div>
          </div>
        ))}
      </div>

      {/* Filter toolbar */}
      <div
        className="bg-white rounded-xl border border-[#e5e7eb] p-3 mb-6 flex items-center flex-wrap gap-3"
        style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}
      >
        {/* Severity */}
        <div className="flex items-center gap-1">
          {(['ALL', 'high', 'medium', 'low'] as SeverityFilter[]).map(s => (
            <button
              key={s}
              onClick={() => setSeverityFilter(s)}
              className="text-xs px-2.5 py-1 rounded-md font-medium capitalize transition-all"
              style={{
                background: severityFilter === s ? '#111827' : 'transparent',
                color: severityFilter === s ? '#fff' : '#6b7280',
                border: `1px solid ${severityFilter === s ? '#111827' : '#e5e7eb'}`,
              }}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-[#e5e7eb]" />

        {/* Status */}
        <div className="flex items-center gap-1">
          {(['active', 'dismissed', 'all'] as StatusFilter[]).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className="text-xs px-2.5 py-1 rounded-md font-medium capitalize transition-all"
              style={{
                background: statusFilter === s ? '#111827' : 'transparent',
                color: statusFilter === s ? '#fff' : '#6b7280',
                border: `1px solid ${statusFilter === s ? '#111827' : '#e5e7eb'}`,
              }}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-[#e5e7eb]" />

        {/* Type */}
        <div className="relative">
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as TypeFilter)}
            className="text-xs border border-[#e5e7eb] rounded-md pl-2 pr-7 py-1.5 text-[#374151] appearance-none bg-white"
          >
            {allTypes.map(t => (
              <option key={t} value={t}>{t === 'ALL' ? 'All Types' : t}</option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9ca3af] pointer-events-none" />
        </div>

        {/* Date range */}
        <div className="flex items-center gap-1.5 ml-auto">
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="text-xs border border-[#e5e7eb] rounded-md px-2 py-1.5 text-[#374151]"
          />
          <span className="text-xs text-[#9ca3af]">→</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="text-xs border border-[#e5e7eb] rounded-md px-2 py-1.5 text-[#374151]"
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo('') }}
              className="text-xs text-[#9ca3af] hover:text-[#374151]"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Alert list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-[#e5e7eb] h-32 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="bg-white rounded-xl border border-[#e5e7eb] p-12 text-center"
          style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}
        >
          <ShieldAlert size={36} color="#9ca3af" className="mx-auto mb-3" />
          <p className="text-sm font-medium text-[#374151]">No alerts match your filters</p>
          <p className="text-xs text-[#9ca3af] mt-1">
            {statusFilter === 'active' ? 'All clear! No active risk alerts.' : 'Try adjusting your filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(alert => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onDismiss={setDismissTarget}
              onReview={handleReview}
            />
          ))}
        </div>
      )}

      {/* Dismiss modal */}
      {dismissTarget && (
        <DismissModal
          alert={dismissTarget}
          onConfirm={handleDismissConfirm}
          onCancel={() => setDismissTarget(null)}
        />
      )}
    </div>
  )
}
