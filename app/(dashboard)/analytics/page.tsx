'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  AreaChart, Area, Legend,
} from 'recharts'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { RefreshCw, Download, ChevronDown, AlertCircle } from 'lucide-react'
import { PrintableReport } from '@/components/analytics/PrintableReport'

// ─── Types ───────────────────────────────────────────────────────────────────

type TimeRange = 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'THIS_QUARTER' | 'THIS_YEAR' | 'CUSTOM'

interface KPIData {
  totalSwiped: number
  totalCommission: number
  totalOutstanding: number
  txnCount: number
  commissionCollectedToday: number
  amountToSettle: number
  cashInBank: number
  cashInHand: number
  amountInCards: number
}

interface KPIPrev {
  totalSwiped: number
  totalCommission: number
  totalOutstanding: number
  txnCount: number
}

interface DailyVolume {
  date: string
  total: number
  paid: number
  commission: number
}

interface AccountBreakdown {
  name: string
  value: number
}

interface MachineRow {
  machine: string
  tid: string
  account: string
  transactions: number
  total: number
  ourCommission: number
  bankCommission: number
}

interface CustomerRow {
  customer: string
  transactions: number
  total: number
  commission: number
  outstanding: number
}

interface StatusBreakdown {
  label: string
  key: string
  color: string
  count: number
  amount: number
}

interface HeatmapDay {
  date: string
  total: number
  count: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })

const fmtShort = (n: number) => {
  if (n >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L'
  if (n >= 1000) return '₹' + (n / 1000).toFixed(1) + 'K'
  return '₹' + n.toFixed(0)
}

const pct = (a: number, b: number) => {
  if (b === 0) return 0
  return ((a - b) / b) * 100
}

const dateStr = (d: Date) => d.toISOString().slice(0, 10)

function getRangeForPeriod(range: TimeRange, customFrom: string, customTo: string): { start: string; end: string } {
  const now = new Date()
  const today = dateStr(now)

  if (range === 'TODAY') return { start: today, end: today }
  if (range === 'THIS_WEEK') {
    const day = now.getDay()
    const mon = new Date(now); mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1))
    return { start: dateStr(mon), end: today }
  }
  if (range === 'THIS_MONTH') {
    return { start: today.slice(0, 8) + '01', end: today }
  }
  if (range === 'THIS_QUARTER') {
    const q = Math.floor(now.getMonth() / 3)
    const qStart = new Date(now.getFullYear(), q * 3, 1)
    return { start: dateStr(qStart), end: today }
  }
  if (range === 'THIS_YEAR') {
    return { start: now.getFullYear() + '-01-01', end: today }
  }
  return { start: customFrom || today, end: customTo || today }
}

function getPrevRange(start: string, end: string): { start: string; end: string } {
  const s = new Date(start), e = new Date(end)
  const diff = e.getTime() - s.getTime()
  const ps = new Date(s.getTime() - diff - 86400000)
  const pe = new Date(s.getTime() - 86400000)
  return { start: dateStr(ps), end: dateStr(pe) }
}

const ACCOUNTS = ['ALL', 'NSS', 'SKT', 'RT', 'KTC', 'TAP', 'BGM', 'NTC', 'MAHA', 'MAL', 'MAP', 'HASTI']

const PIE_COLORS = ['#3ECF8E', '#6366f1', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#f97316']

// ─── Skeleton ────────────────────────────────────────────────────────────────

function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`animate-pulse rounded bg-gray-100 ${className ?? ''}`}
      style={{ background: 'linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%)', backgroundSize: '400% 100%', animation: 'shimmer 1.4s infinite', ...style }}
    />
  )
}

// ─── Sparkline ───────────────────────────────────────────────────────────────

function Sparkline({ data, color = '#3ECF8E' }: { data: number[]; color?: string }) {
  const pts = data.map((v, i) => ({ v, i }))
  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={pts}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KPICard({
  title, value, sub, subColor, sparkData, sparkColor, loading, extra,
}: {
  title: string
  value: string
  sub?: string
  subColor?: string
  sparkData?: number[]
  sparkColor?: string
  loading: boolean
  extra?: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl border border-[#e5e7eb] p-4" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
      <div className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-2">{title}</div>
      {loading ? (
        <>
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-3 w-24" />
        </>
      ) : (
        <>
          <div className="text-2xl font-bold text-[#111827]">{value}</div>
          {sub && <div className="text-xs mt-1 font-medium" style={{ color: subColor ?? '#6b7280' }}>{sub}</div>}
          {extra}
          {sparkData && sparkData.length > 1 && (
            <div className="mt-2">
              <Sparkline data={sparkData} color={sparkColor} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Chart Card ──────────────────────────────────────────────────────────────

function ChartCard({
  title, loading, error, onRetry, children, height = 260,
}: {
  title: string
  loading: boolean
  error?: string | null
  onRetry?: () => void
  children: React.ReactNode
  height?: number
}) {
  return (
    <div className="bg-white rounded-xl border border-[#e5e7eb] p-4" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
      <div className="font-semibold text-sm text-[#111827] mb-4">{title}</div>
      {loading ? (
        <div className="flex flex-col gap-2" style={{ height }}>
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="w-full" style={{ height: `${12 + (i % 3) * 8}px`, opacity: 1 - i * 0.12 }} />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-3" style={{ height }}>
          <AlertCircle size={20} color="#ef4444" />
          <span className="text-sm text-[#6b7280]">{error}</span>
          {onRetry && (
            <button
              onClick={onRetry}
              className="text-xs px-3 py-1 rounded-md border border-[#e5e7eb] hover:bg-[#f9fafb] text-[#374151]"
            >
              Retry
            </button>
          )}
        </div>
      ) : (
        <div style={{ height }}>{children}</div>
      )}
    </div>
  )
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white rounded-lg border border-[#e5e7eb] p-3 text-xs shadow-lg">
      {label && <div className="font-semibold text-[#111827] mb-2">{label}</div>}
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-[#6b7280]">{p.name}:</span>
          <span className="font-semibold text-[#111827]">{fmtShort(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Heatmap ─────────────────────────────────────────────────────────────────

function HeatmapCell({ day, max }: { day: HeatmapDay | null; max: number }) {
  if (!day) return <div className="w-4 h-4 rounded-sm bg-transparent" />
  const intensity = max > 0 ? day.total / max : 0
  let bg = '#ebedf0'
  if (intensity > 0.75) bg = '#196127'
  else if (intensity > 0.5) bg = '#239a3b'
  else if (intensity > 0.25) bg = '#7bc96f'
  else if (intensity > 0) bg = '#c6e48b'

  return (
    <div
      className="w-4 h-4 rounded-sm cursor-pointer relative group"
      style={{ background: bg }}
      title={`${day.date}: ${fmt(day.total)} (${day.count} txns)`}
    />
  )
}

function WeeklyHeatmap({ data, loading }: { data: HeatmapDay[]; loading: boolean }) {
  if (loading) return <Skeleton className="h-32 w-full" />

  const dayMap: Record<string, HeatmapDay> = {}
  data.forEach(d => { dayMap[d.date] = d })

  const today = new Date()
  const weeks: (HeatmapDay | null)[][] = []
  const start = new Date(today)
  start.setDate(today.getDate() - 83)
  // align to Monday
  while (start.getDay() !== 1) start.setDate(start.getDate() - 1)

  let cur = new Date(start)
  const max = Math.max(...data.map(d => d.total), 1)

  while (cur <= today) {
    const week: (HeatmapDay | null)[] = []
    for (let d = 0; d < 7; d++) {
      const ds = dateStr(cur)
      week.push(cur <= today ? (dayMap[ds] ?? { date: ds, total: 0, count: 0 }) : null)
      cur = new Date(cur); cur.setDate(cur.getDate() + 1)
    }
    weeks.push(week)
  }

  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-1">
        <div className="flex flex-col gap-1 mr-1">
          {days.map((d, i) => (
            <div key={i} className="text-[10px] text-[#9ca3af] w-3 h-4 flex items-center">{d}</div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((day, di) => (
              <HeatmapCell key={di} day={day} max={max} />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1 mt-2">
        <span className="text-[10px] text-[#9ca3af]">Less</span>
        {['#ebedf0', '#c6e48b', '#7bc96f', '#239a3b', '#196127'].map((c, i) => (
          <div key={i} className="w-3 h-3 rounded-sm" style={{ background: c }} />
        ))}
        <span className="text-[10px] text-[#9ca3af]">More</span>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const auth = useAuth()

  // Filter state
  const [range, setRange] = useState<TimeRange>('THIS_MONTH')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [account, setAccount] = useState('ALL')
  const [compare, setCompare] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const [refreshCount, setRefreshCount] = useState(0)

  // Data state
  const [kpi, setKpi] = useState<KPIData | null>(null)
  const [kpiPrev, setKpiPrev] = useState<KPIPrev | null>(null)
  const [dailyVolume, setDailyVolume] = useState<DailyVolume[]>([])
  const [accountBreakdown, setAccountBreakdown] = useState<AccountBreakdown[]>([])
  const [machinePerf, setMachinePerf] = useState<MachineRow[]>([])
  const [topCustomers, setTopCustomers] = useState<CustomerRow[]>([])
  const [statusBreakdown, setStatusBreakdown] = useState<StatusBreakdown[]>([])
  const [heatmapData, setHeatmapData] = useState<HeatmapDay[]>([])
  const [growthData, setGrowthData] = useState<{ name: string; thisMonth: number; lastMonth: number }[]>([])
  const [showPrintModal, setShowPrintModal] = useState(false)

  // Loading state
  const [loadingKPI, setLoadingKPI] = useState(true)
  const [loadingDaily, setLoadingDaily] = useState(true)
  const [loadingAccount, setLoadingAccount] = useState(true)
  const [loadingMachine, setLoadingMachine] = useState(true)
  const [loadingCustomers, setLoadingCustomers] = useState(true)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [loadingHeatmap, setLoadingHeatmap] = useState(true)
  const [loadingGrowth, setLoadingGrowth] = useState(true)

  // Error state
  const [errorKPI, setErrorKPI] = useState<string | null>(null)
  const [errorDaily, setErrorDaily] = useState<string | null>(null)
  const [errorAccount, setErrorAccount] = useState<string | null>(null)
  const [errorMachine, setErrorMachine] = useState<string | null>(null)
  const [errorCustomers, setErrorCustomers] = useState<string | null>(null)
  const [errorStatus, setErrorStatus] = useState<string | null>(null)

  const { start, end } = getRangeForPeriod(range, customFrom, customTo)
  const prevRange = getPrevRange(start, end)

  // Sub-admin account filter
  const effectiveAccount = auth?.role === 'sub_admin' && auth.assigned_accounts?.length
    ? (account === 'ALL' ? auth.assigned_accounts[0] : account)
    : account

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyAccountFilter = useCallback((query: any): any => {
    if (auth?.role === 'sub_admin' && auth.assigned_accounts?.length) {
      return query.in('account_name', auth.assigned_accounts)
    }
    if (effectiveAccount !== 'ALL') {
      return query.ilike('account_name', `%${effectiveAccount}%`)
    }
    return query
  }, [auth, effectiveAccount])

  // ── Fetch KPIs ──
  const fetchKPIs = useCallback(async () => {
    
    setLoadingKPI(true); setErrorKPI(null)
    try {
      const today = new Date().toISOString().split('T')[0]
      let q = supabase.from('transactions').select('total_amount,paid_amount,commission_amount,remarks').gte('date', start).lte('date', end)
      q = applyAccountFilter(q)
      const [{ data, error }, { data: todayData }, { data: pendingData }, { data: bankAccs }, { data: chamundaRows }, { data: refillTxns }] = await Promise.all([
        q,
        supabase.from('transactions').select('commission_amount').eq('date', today),
        supabase.from('transactions').select('total_amount,paid_amount').in('remarks', ['PEND', 'UNPAID', 'PURU']),
        supabase.from('bank_accounts').select('current_balance'),
        supabase.from('chamunda_sheet').select('closing_balance').eq('row_type', 'total').order('date', { ascending: false }).limit(1),
        supabase.from('transactions').select('total_amount').eq('entry_type', 'refill'),
      ])
      if (error) throw error

      const totalSwiped = data?.reduce((s, t) => s + (Number(t.total_amount) || 0), 0) ?? 0
      const totalCommission = data?.reduce((s, t) => s + (Number(t.commission_amount) || 0), 0) ?? 0
      const totalOutstanding = data?.reduce((s, t) => s + Math.max(0, (Number(t.total_amount) - Number(t.paid_amount)) || 0), 0) ?? 0
      const txnCount = data?.length ?? 0
      const commissionCollectedToday = todayData?.reduce((s, t) => s + (Number(t.commission_amount) || 0), 0) ?? 0
      const amountToSettle = pendingData?.reduce((s, t) => s + Math.max(0, (Number(t.total_amount) - Number(t.paid_amount)) || 0), 0) ?? 0
      const cashInBank = (bankAccs as { current_balance: number }[] || []).reduce((s, b) => s + (Number(b.current_balance) || 0), 0)
      const cashInHand = Number((chamundaRows as { closing_balance: number }[] || [])[0]?.closing_balance || 0)
      const amountInCards = (refillTxns as { total_amount: number }[] || []).reduce((s, t) => s + (Number(t.total_amount) || 0), 0)

      setKpi({ totalSwiped, totalCommission, totalOutstanding, txnCount, commissionCollectedToday, amountToSettle, cashInBank, cashInHand, amountInCards })

      // Previous period
      if (compare) {
        let pq = supabase.from('transactions').select('total_amount,paid_amount,commission_amount,remarks').gte('date', prevRange.start).lte('date', prevRange.end)
        pq = applyAccountFilter(pq) as typeof pq
        const { data: pd } = await pq
        const ps = pd?.reduce((s, t) => s + (Number(t.total_amount) || 0), 0) ?? 0
        const pc = pd?.reduce((s, t) => s + (Number(t.commission_amount) || 0), 0) ?? 0
        const po = pd?.reduce((s, t) => s + Math.max(0, (Number(t.total_amount) - Number(t.paid_amount)) || 0), 0) ?? 0
        setKpiPrev({ totalSwiped: ps, totalCommission: pc, totalOutstanding: po, txnCount: pd?.length ?? 0 })
      } else {
        setKpiPrev(null)
      }
    } catch {
      setErrorKPI('Failed to load KPIs')
    } finally {
      setLoadingKPI(false)
    }
  }, [start, end, compare, applyAccountFilter, prevRange.start, prevRange.end])

  // ── Fetch Daily Volume ──
  const fetchDailyVolume = useCallback(async () => {
    
    setLoadingDaily(true); setErrorDaily(null)
    try {
      let q = supabase.from('transactions').select('date,total_amount,paid_amount,commission_amount').gte('date', start).lte('date', end).order('date')
      q = applyAccountFilter(q)
      const { data, error } = await q
      if (error) throw error

      const grouped: Record<string, DailyVolume> = {}
      data?.forEach(t => {
        const d = t.date ?? ''
        if (!grouped[d]) grouped[d] = { date: d, total: 0, paid: 0, commission: 0 }
        grouped[d].total += Number(t.total_amount) || 0
        grouped[d].paid += Number(t.paid_amount) || 0
        grouped[d].commission += Number(t.commission_amount) || 0
      })
      setDailyVolume(Object.values(grouped))
    } catch {
      setErrorDaily('Failed to load daily volume')
    } finally {
      setLoadingDaily(false)
    }
  }, [start, end, applyAccountFilter])

  // ── Fetch Account Breakdown ──
  const fetchAccountBreakdown = useCallback(async () => {
    
    setLoadingAccount(true); setErrorAccount(null)
    try {
      let q = supabase.from('transactions').select('account_name,total_amount').gte('date', start).lte('date', end)
      q = applyAccountFilter(q)
      const { data, error } = await q
      if (error) throw error

      const grouped: Record<string, number> = {}
      data?.forEach(t => {
        const accs = (t.account_name ?? '').split(/[+,]/).map((a: string) => a.trim()).filter(Boolean)
        accs.forEach((acc: string) => {
          grouped[acc] = (grouped[acc] ?? 0) + (Number(t.total_amount) || 0)
        })
      })
      setAccountBreakdown(
        Object.entries(grouped)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)
      )
    } catch {
      setErrorAccount('Failed to load account breakdown')
    } finally {
      setLoadingAccount(false)
    }
  }, [start, end, applyAccountFilter])

  // ── Fetch Machine Performance ──
  const fetchMachinePerf = useCallback(async () => {
    
    setLoadingMachine(true); setErrorMachine(null)
    try {
      const { data, error } = await supabase
        .from('cc_sheet')
        .select('machine_name,tid,account_name,swipe_amount,our_commission,bank_commission')
        .gte('date', start)
        .lte('date', end)
      if (error) throw error

      const grouped: Record<string, MachineRow> = {}
      data?.forEach(r => {
        const name = r.machine_name ?? 'Unknown'
        if (!grouped[name]) grouped[name] = { machine: name, tid: r.tid ?? '', account: r.account_name ?? '', transactions: 0, total: 0, ourCommission: 0, bankCommission: 0 }
        grouped[name].transactions++
        grouped[name].total += Number(r.swipe_amount) || 0
        grouped[name].ourCommission += Number(r.our_commission) || 0
        grouped[name].bankCommission += Number(r.bank_commission) || 0
      })
      setMachinePerf(Object.values(grouped).sort((a, b) => b.total - a.total))
    } catch {
      setErrorMachine('Failed to load machine data')
    } finally {
      setLoadingMachine(false)
    }
  }, [start, end])

  // ── Fetch Top Customers ──
  const fetchTopCustomers = useCallback(async () => {
    
    setLoadingCustomers(true); setErrorCustomers(null)
    try {
      let q = supabase.from('transactions').select('customer_name,total_amount,paid_amount,commission_amount,remarks').gte('date', start).lte('date', end)
      q = applyAccountFilter(q)
      const { data, error } = await q
      if (error) throw error

      const grouped: Record<string, CustomerRow> = {}
      data?.forEach(t => {
        const name = t.customer_name ?? 'Unknown'
        if (!grouped[name]) grouped[name] = { customer: name, transactions: 0, total: 0, commission: 0, outstanding: 0 }
        grouped[name].transactions++
        grouped[name].total += Number(t.total_amount) || 0
        grouped[name].commission += Number(t.commission_amount) || 0
        grouped[name].outstanding += Math.max(0, (Number(t.total_amount) - Number(t.paid_amount)) || 0)
      })
      setTopCustomers(Object.values(grouped).sort((a, b) => b.total - a.total).slice(0, 10))
    } catch {
      setErrorCustomers('Failed to load customer data')
    } finally {
      setLoadingCustomers(false)
    }
  }, [start, end, applyAccountFilter])

  // ── Fetch Status Breakdown ──
  const fetchStatus = useCallback(async () => {
    
    setLoadingStatus(true); setErrorStatus(null)
    try {
      let q = supabase.from('transactions').select('remarks,total_amount').gte('date', start).lte('date', end)
      q = applyAccountFilter(q)
      const { data, error } = await q
      if (error) throw error

      const statusMap: Record<string, { count: number; amount: number }> = {}
      data?.forEach(t => {
        const r = (t.remarks ?? 'UNKNOWN').toUpperCase()
        if (!statusMap[r]) statusMap[r] = { count: 0, amount: 0 }
        statusMap[r].count++
        statusMap[r].amount += Number(t.total_amount) || 0
      })

      const configs = [
        { label: 'PAID', key: 'PAID', color: '#3ECF8E' },
        { label: 'PEND', key: 'PEND', color: '#f59e0b' },
        { label: 'PURU', key: 'PURU', color: '#6366f1' },
        { label: 'UNPAID', key: 'UNPAID', color: '#ef4444' },
      ]

      setStatusBreakdown(configs.map(c => ({
        ...c,
        count: statusMap[c.key]?.count ?? 0,
        amount: statusMap[c.key]?.amount ?? 0,
      })))
    } catch {
      setErrorStatus('Failed to load status data')
    } finally {
      setLoadingStatus(false)
    }
  }, [start, end, applyAccountFilter])

  // ── Fetch Heatmap (last 3 months always) ──
  const fetchHeatmap = useCallback(async () => {
    
    setLoadingHeatmap(true)
    try {
      const hStart = dateStr(new Date(Date.now() - 84 * 86400000))
      let q = supabase.from('transactions').select('date,total_amount').gte('date', hStart).lte('date', dateStr(new Date()))
      q = applyAccountFilter(q)
      const { data } = await q

      const grouped: Record<string, HeatmapDay> = {}
      data?.forEach(t => {
        const d = t.date ?? ''
        if (!grouped[d]) grouped[d] = { date: d, total: 0, count: 0 }
        grouped[d].total += Number(t.total_amount) || 0
        grouped[d].count++
      })
      setHeatmapData(Object.values(grouped))
    } catch {
      // silent
    } finally {
      setLoadingHeatmap(false)
    }
  }, [applyAccountFilter])

  // ── Fetch Growth ──
  const fetchGrowth = useCallback(async () => {
    
    setLoadingGrowth(true)
    try {
      const now = new Date()
      const thisStart = dateStr(new Date(now.getFullYear(), now.getMonth(), 1))
      const lastStart = dateStr(new Date(now.getFullYear(), now.getMonth() - 1, 1))
      const lastEnd = dateStr(new Date(now.getFullYear(), now.getMonth(), 0))

      const [{ data: thisData }, { data: lastData }] = await Promise.all([
        supabase.from('transactions').select('total_amount,commission_amount,customer_name').gte('date', thisStart).lte('date', dateStr(now)),
        supabase.from('transactions').select('total_amount,commission_amount,customer_name').gte('date', lastStart).lte('date', lastEnd),
      ])

      const sumAmt = (d: { total_amount: number | null }[] | null) => d?.reduce((s, t) => s + (Number(t.total_amount) || 0), 0) ?? 0
      const sumComm = (d: { commission_amount: number | null }[] | null) => d?.reduce((s, t) => s + (Number(t.commission_amount) || 0), 0) ?? 0
      const uniq = (d: { customer_name: string | null }[] | null) => new Set(d?.map(t => t.customer_name)).size

      setGrowthData([
        { name: 'Volume', thisMonth: sumAmt(thisData as { total_amount: number | null }[]), lastMonth: sumAmt(lastData as { total_amount: number | null }[]) },
        { name: 'Commission', thisMonth: sumComm(thisData as { commission_amount: number | null }[]), lastMonth: sumComm(lastData as { commission_amount: number | null }[]) },
        { name: 'Transactions', thisMonth: thisData?.length ?? 0, lastMonth: lastData?.length ?? 0 },
        { name: 'Customers', thisMonth: uniq(thisData as { customer_name: string | null }[]), lastMonth: uniq(lastData as { customer_name: string | null }[]) },
      ])
    } catch {
      // silent
    } finally {
      setLoadingGrowth(false)
    }
  }, [])

  // ── Refresh all ──
  const refreshAll = useCallback(() => {
    setLastUpdated(new Date())
    fetchKPIs()
    fetchDailyVolume()
    fetchAccountBreakdown()
    fetchMachinePerf()
    fetchTopCustomers()
    fetchStatus()
    fetchHeatmap()
    fetchGrowth()
  }, [fetchKPIs, fetchDailyVolume, fetchAccountBreakdown, fetchMachinePerf, fetchTopCustomers, fetchStatus, fetchHeatmap, fetchGrowth])

  useEffect(() => { refreshAll() }, [refreshAll, refreshCount])

  // Auto-refresh every 5 min
  useEffect(() => {
    const id = setInterval(() => setRefreshCount(c => c + 1), 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  const [timeSince, setTimeSince] = useState('just now')
  useEffect(() => {
    const id = setInterval(() => {
      const diff = Math.floor((Date.now() - lastUpdated.getTime()) / 1000)
      if (diff < 60) setTimeSince('just now')
      else if (diff < 3600) setTimeSince(`${Math.floor(diff / 60)} min ago`)
      else setTimeSince(`${Math.floor(diff / 3600)} hr ago`)
    }, 30000)
    return () => clearInterval(id)
  }, [lastUpdated])

  // ── Export ──
  const handleExport = () => setShowPrintModal(true)

  // ── Delta display ──
  const delta = (cur: number, prev: number) => {
    const d = pct(cur, prev)
    const sign = d >= 0 ? '+' : ''
    return { label: `${sign}${d.toFixed(1)}% vs prev period`, color: d >= 0 ? '#3ECF8E' : '#ef4444' }
  }

  const sparkFrom = dailyVolume.map(d => d.total)
  const sparkComm = dailyVolume.map(d => d.commission)

  const totalStatus = statusBreakdown.reduce((s, b) => s + b.amount, 0)

  // ── Available accounts for sub_admin ──
  const availableAccounts = auth?.role === 'sub_admin'
    ? ['ALL', ...(auth.assigned_accounts ?? [])]
    : ACCOUNTS

  return (
    <div className="pb-16">
      <style>{`
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @media print { .no-print { display: none !important } }
      `}</style>

      {/* ── SECTION 1: Top Filter Bar ── */}
      <div
        className="no-print sticky top-0 z-20 bg-white border-b border-[#e5e7eb] px-0 py-3 mb-6 -mx-6 px-6"
        style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
      >
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Range buttons */}
            {(['TODAY', 'THIS_WEEK', 'THIS_MONTH', 'THIS_QUARTER', 'THIS_YEAR', 'CUSTOM'] as TimeRange[]).map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className="text-xs px-3 py-1.5 rounded-md font-medium transition-all"
                style={{
                  background: range === r ? '#111827' : 'transparent',
                  color: range === r ? '#fff' : '#6b7280',
                  border: `1px solid ${range === r ? '#111827' : '#e5e7eb'}`,
                }}
              >
                {r.replace('_', ' ')}
              </button>
            ))}

            {/* Custom date pickers */}
            {range === 'CUSTOM' && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customFrom}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="text-xs border border-[#e5e7eb] rounded-md px-2 py-1.5 text-[#374151]"
                />
                <span className="text-xs text-[#9ca3af]">→</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={e => setCustomTo(e.target.value)}
                  className="text-xs border border-[#e5e7eb] rounded-md px-2 py-1.5 text-[#374151]"
                />
              </div>
            )}

            {/* Account filter */}
            <div className="relative">
              <select
                value={account}
                onChange={e => setAccount(e.target.value)}
                className="text-xs border border-[#e5e7eb] rounded-md pl-2 pr-7 py-1.5 text-[#374151] appearance-none bg-white"
              >
                {availableAccounts.map(a => <option key={a}>{a}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9ca3af] pointer-events-none" />
            </div>

            {/* Compare toggle */}
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={compare}
                onChange={e => setCompare(e.target.checked)}
                className="w-3 h-3 accent-[#3ECF8E]"
              />
              <span className="text-xs text-[#6b7280]">Compare with previous period</span>
            </label>
          </div>

          <div className="flex items-center gap-3">
            {/* Live indicator */}
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#3ECF8E] animate-pulse" />
              <span className="text-xs text-[#6b7280]">Live · Updated {timeSince}</span>
            </div>

            {/* Refresh */}
            <button
              onClick={() => setRefreshCount(c => c + 1)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-[#e5e7eb] hover:bg-[#f9fafb] text-[#374151]"
            >
              <RefreshCw size={12} />
              Refresh
            </button>

            {/* Export */}
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md text-white font-medium"
              style={{ background: '#111827' }}
            >
              <Download size={12} />
              Export Report
            </button>
          </div>
        </div>
      </div>

      {/* ── SECTION 2: KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <KPICard
          title="Total Swiped"
          value={kpi ? fmt(kpi.totalSwiped) : '—'}
          sub={compare && kpiPrev ? delta(kpi?.totalSwiped ?? 0, kpiPrev.totalSwiped).label : undefined}
          subColor={compare && kpiPrev ? delta(kpi?.totalSwiped ?? 0, kpiPrev.totalSwiped).color : undefined}
          sparkData={sparkFrom}
          sparkColor="#3ECF8E"
          loading={loadingKPI}
        />
        <KPICard
          title="Total Commission"
          value={kpi ? fmt(kpi.totalCommission) : '—'}
          sub={compare && kpiPrev ? delta(kpi?.totalCommission ?? 0, kpiPrev.totalCommission).label : undefined}
          subColor={compare && kpiPrev ? delta(kpi?.totalCommission ?? 0, kpiPrev.totalCommission).color : undefined}
          sparkData={sparkComm}
          sparkColor="#6366f1"
          loading={loadingKPI}
        />
        <KPICard
          title="Outstanding Balance"
          value={kpi ? fmt(kpi.totalOutstanding) : '—'}
          sub={compare && kpiPrev ? (() => { const d = delta(kpi?.totalOutstanding ?? 0, kpiPrev.totalOutstanding); return { label: d.label, color: d.color === '#3ECF8E' ? '#ef4444' : '#3ECF8E' } })().label : undefined}
          subColor={compare && kpiPrev ? (() => { const d = delta(kpi?.totalOutstanding ?? 0, kpiPrev.totalOutstanding); return { label: d.label, color: d.color === '#3ECF8E' ? '#ef4444' : '#3ECF8E' } })().color : undefined}
          loading={loadingKPI}
        />
        <KPICard
          title="Transactions Count"
          value={kpi ? String(kpi.txnCount) : '—'}
          sub={compare && kpiPrev ? `${kpi && kpi.txnCount - kpiPrev.txnCount >= 0 ? '+' : ''}${kpi ? kpi.txnCount - kpiPrev.txnCount : 0} vs prev period` : undefined}
          subColor={compare && kpiPrev && kpi ? (kpi.txnCount >= kpiPrev.txnCount ? '#3ECF8E' : '#ef4444') : undefined}
          loading={loadingKPI}
        />
        <KPICard
          title="Commission Collected Today"
          value={kpi ? fmt(Math.round(kpi.commissionCollectedToday)) : '—'}
          sub="today's commission earned"
          loading={loadingKPI}
        />
        <KPICard
          title="Amount to Settle"
          value={kpi ? fmt(Math.round(kpi.amountToSettle)) : '—'}
          sub="pending across all transactions"
          loading={loadingKPI}
        />
      </div>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <KPICard
          title="Cash in Bank"
          value={kpi ? fmt(Math.round(kpi.cashInBank)) : '—'}
          sub="sum of all account balances"
          loading={loadingKPI}
        />
        <KPICard
          title="Cash in Hand"
          value={kpi ? fmt(Math.round(kpi.cashInHand)) : '—'}
          sub="chamunda sheet closing balance"
          loading={loadingKPI}
        />
        <KPICard
          title="Amount in Cards"
          value={kpi ? fmt(Math.round(kpi.amountInCards)) : '—'}
          sub="total card refill amount"
          loading={loadingKPI}
        />
      </div>

      {/* ── SECTION 3: Account Breakdown ── */}
      <div className="grid grid-cols-1 mb-6">
        <ChartCard title="Account-wise Volume Breakdown" loading={loadingAccount} error={errorAccount} onRetry={fetchAccountBreakdown} height={280}>
          <div className="flex items-center gap-4 h-full">
            <ResponsiveContainer width="55%" height="100%">
              <PieChart>
                <Pie data={accountBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} innerRadius={50}>
                  {accountBreakdown.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => fmtShort(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-1.5 overflow-y-auto" style={{ maxHeight: 240 }}>
              {accountBreakdown.map((a, i) => {
                const total = accountBreakdown.reduce((s, x) => s + x.value, 0)
                const p = total > 0 ? ((a.value / total) * 100).toFixed(1) : '0.0'
                return (
                  <div key={a.name} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-[#374151] truncate max-w-[80px]">{a.name}</span>
                    <span className="text-[#9ca3af] ml-auto">{p}%</span>
                  </div>
                )
              })}
            </div>
          </div>
        </ChartCard>
      </div>

      {/* ── SECTION 5: Status Breakdown ── */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-[#374151] mb-3">Remarks / Status Breakdown</h2>
        {loadingStatus ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : errorStatus ? (
          <div className="text-sm text-[#ef4444] flex items-center gap-2"><AlertCircle size={14} />{errorStatus}</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {statusBreakdown.map(s => (
              <div
                key={s.key}
                className="bg-white rounded-xl border border-[#e5e7eb] p-4"
                style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.07)', borderLeft: `3px solid ${s.color}` }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold" style={{ color: s.color }}>{s.label}</span>
                  <span className="text-xs text-[#9ca3af]">{totalStatus > 0 ? ((s.amount / totalStatus) * 100).toFixed(1) : 0}%</span>
                </div>
                <div className="text-xl font-bold text-[#111827]">{s.count} txns</div>
                <div className="text-xs text-[#6b7280] mt-0.5">{fmt(s.amount)}</div>
                <div className="mt-2 h-1 rounded-full bg-[#f3f4f6]">
                  <div className="h-full rounded-full" style={{ width: `${totalStatus > 0 ? (s.amount / totalStatus) * 100 : 0}%`, background: s.color }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Status donut chart */}
      {!loadingStatus && !errorStatus && (
        <div className="bg-white rounded-xl border border-[#e5e7eb] p-4 mb-6" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
          <div className="font-semibold text-sm text-[#111827] mb-3">Status Distribution</div>
          <div className="flex items-center gap-6">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={statusBreakdown} dataKey="amount" nameKey="label" cx="50%" cy="50%" outerRadius={80} innerRadius={45}>
                  {statusBreakdown.map((s, i) => <Cell key={i} fill={s.color} />)}
                </Pie>
                <Tooltip formatter={(v: number) => fmtShort(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-2">
              {statusBreakdown.map(s => (
                <div key={s.key} className="flex items-center gap-2 text-sm">
                  <span className="w-3 h-3 rounded-full" style={{ background: s.color }} />
                  <span className="text-[#374151]">{s.label}</span>
                  <span className="font-semibold text-[#111827] ml-2">{s.count}</span>
                  <span className="text-[#9ca3af] text-xs">· {fmt(s.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── SECTION 6: Top Customers Table ── */}
      <div className="bg-white rounded-xl border border-[#e5e7eb] mb-6 overflow-hidden" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
        <div className="p-4 border-b border-[#e5e7eb]">
          <h2 className="font-semibold text-sm text-[#111827]">Top Customers by Volume</h2>
        </div>
        {loadingCustomers ? (
          <div className="p-4 flex flex-col gap-2">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : errorCustomers ? (
          <div className="p-6 flex items-center gap-2 text-sm text-[#ef4444]">
            <AlertCircle size={14} />{errorCustomers}
            <button onClick={fetchTopCustomers} className="ml-2 text-xs underline text-[#6b7280]">Retry</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#f3f4f6] bg-[#f9fafb]">
                  {['#', 'Customer', 'Transactions', 'Total Swiped', 'Commission', 'Outstanding', 'Status'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[#6b7280]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topCustomers.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-[#9ca3af]">No data for this period</td></tr>
                ) : topCustomers.map((c, i) => (
                  <tr key={c.customer} className="border-b border-[#f9fafb] hover:bg-[#f9fafb] transition-colors">
                    <td className="px-4 py-2.5 text-xs text-[#9ca3af] font-medium">{i + 1}</td>
                    <td className="px-4 py-2.5 font-medium text-[#111827]">{c.customer}</td>
                    <td className="px-4 py-2.5 text-[#374151]">{c.transactions}</td>
                    <td className="px-4 py-2.5 font-semibold text-[#111827]">{fmt(c.total)}</td>
                    <td className="px-4 py-2.5 text-[#3ECF8E] font-medium">{fmt(c.commission)}</td>
                    <td className="px-4 py-2.5">
                      <span style={{ color: c.outstanding > 0 ? '#ef4444' : '#3ECF8E' }}>{fmt(c.outstanding)}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{
                          background: c.outstanding === 0 ? '#d1fae5' : '#fee2e2',
                          color: c.outstanding === 0 ? '#065f46' : '#991b1b',
                        }}
                      >
                        {c.outstanding === 0 ? 'Cleared' : 'Pending'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── SECTION 7: Machine Performance Table ── */}
      <div className="bg-white rounded-xl border border-[#e5e7eb] mb-6 overflow-hidden" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
        <div className="p-4 border-b border-[#e5e7eb]">
          <h2 className="font-semibold text-sm text-[#111827]">Swipe Machine Performance</h2>
        </div>
        {loadingMachine ? (
          <div className="p-4 flex flex-col gap-2">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : errorMachine ? (
          <div className="p-6 flex items-center gap-2 text-sm text-[#ef4444]">
            <AlertCircle size={14} />{errorMachine}
            <button onClick={fetchMachinePerf} className="ml-2 text-xs underline text-[#6b7280]">Retry</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#f3f4f6] bg-[#f9fafb]">
                  {['Machine', 'TID', 'Account', 'Transactions', 'Total Swiped', 'Our Commission', 'Bank Commission', 'Avg Ticket'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[#6b7280]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {machinePerf.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-[#9ca3af]">No machine data for this period</td></tr>
                ) : machinePerf.map(m => (
                  <tr key={m.machine} className="border-b border-[#f9fafb] hover:bg-[#f9fafb] transition-colors">
                    <td className="px-4 py-2.5 font-medium text-[#111827]">{m.machine}</td>
                    <td className="px-4 py-2.5 text-xs text-[#6b7280] font-mono">{m.tid}</td>
                    <td className="px-4 py-2.5 text-[#374151]">{m.account}</td>
                    <td className="px-4 py-2.5 text-[#374151]">{m.transactions}</td>
                    <td className="px-4 py-2.5 font-semibold text-[#111827]">{fmt(m.total)}</td>
                    <td className="px-4 py-2.5 text-[#3ECF8E] font-medium">{fmt(m.ourCommission)}</td>
                    <td className="px-4 py-2.5 text-[#ef4444]">{fmt(m.bankCommission)}</td>
                    <td className="px-4 py-2.5 text-[#374151]">{m.transactions > 0 ? fmt(m.total / m.transactions) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── SECTION 8: Weekly Heatmap ── */}
      <div className="bg-white rounded-xl border border-[#e5e7eb] p-4 mb-6" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
        <div className="font-semibold text-sm text-[#111827] mb-4">Activity Heatmap — Last 3 Months</div>
        <WeeklyHeatmap data={heatmapData} loading={loadingHeatmap} />
      </div>

      {/* ── SECTION 9: Growth Metrics ── */}
      <ChartCard title="Month-over-Month Growth" loading={loadingGrowth} height={280}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={growthData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} />
            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={fmtShort} width={52} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="thisMonth" name="This Month" fill="#3ECF8E" radius={[3, 3, 0, 0]} />
            <Bar dataKey="lastMonth" name="Last Month" fill="#d1fae5" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* ── Print / Export Modal ── */}
      {showPrintModal && kpi && (
        <PrintableReport
          data={{
            kpis: kpi,
            statusBreakdown: {
              paid:   { count: statusBreakdown.find(s => s.key === 'PAID')?.count   ?? 0, amount: statusBreakdown.find(s => s.key === 'PAID')?.amount   ?? 0 },
              pend:   { count: statusBreakdown.find(s => s.key === 'PEND')?.count   ?? 0, amount: statusBreakdown.find(s => s.key === 'PEND')?.amount   ?? 0 },
              puru:   { count: statusBreakdown.find(s => s.key === 'PURU')?.count   ?? 0, amount: statusBreakdown.find(s => s.key === 'PURU')?.amount   ?? 0 },
              unpaid: { count: statusBreakdown.find(s => s.key === 'UNPAID')?.count ?? 0, amount: statusBreakdown.find(s => s.key === 'UNPAID')?.amount ?? 0 },
            },
            topCustomers,
            accountBreakdown,
            machinePerformance: machinePerf,
          }}
          filters={{ startDate: start, endDate: end, account: effectiveAccount }}
          onClose={() => setShowPrintModal(false)}
        />
      )}
    </div>
  )
}
