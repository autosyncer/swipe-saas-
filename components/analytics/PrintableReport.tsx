'use client'

import { useRef } from 'react'
import { X, Download } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface StatusEntry {
  count: number
  amount: number
}

interface StatusBreakdownData {
  paid: StatusEntry
  pend: StatusEntry
  puru: StatusEntry
  unpaid: StatusEntry
}

interface CustomerRow {
  customer: string
  transactions: number
  total: number
  commission: number
  outstanding: number
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

interface ReportData {
  kpis: KPIData
  statusBreakdown: StatusBreakdownData
  topCustomers: CustomerRow[]
  accountBreakdown: AccountBreakdown[]
  machinePerformance: MachineRow[]
}

interface ReportFilters {
  startDate: string
  endDate: string
  account: string
}

interface Props {
  data: ReportData
  filters: ReportFilters
  onClose: () => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fc = (n: number) =>
  '₹' + (n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })

const PRINT_STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Calibri, Arial, sans-serif; color: #000; background: white; font-size: 12px; }
  .page { padding: 24px 28px; }

  .report-header {
    display: flex; justify-content: space-between; align-items: flex-start;
    border-bottom: 3px solid #3ECF8E; padding-bottom: 14px; margin-bottom: 22px;
  }
  .logo { font-size: 20px; font-weight: 900; color: #3ECF8E; letter-spacing: -0.5px; }
  .report-title { font-size: 20px; font-weight: 700; color: #111; margin-top: 2px; }
  .report-subtitle { font-size: 12px; color: #6b7280; margin-top: 3px; }
  .report-meta { font-size: 11px; color: #6b7280; text-align: right; line-height: 1.6; }
  .report-meta strong { color: #111; }

  .section-title {
    font-size: 13px; font-weight: 700; margin-bottom: 10px;
    padding-bottom: 5px; border-bottom: 1.5px solid #e5e7eb; color: #111;
    text-transform: uppercase; letter-spacing: 0.4px;
  }

  .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 22px; }
  .kpi-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 14px; background: #f9fafb; }
  .kpi-label { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.6px; font-weight: 600; }
  .kpi-value { font-size: 22px; font-weight: 800; color: #111; margin: 3px 0 2px; }
  .kpi-sub { font-size: 10px; color: #9ca3af; }

  .status-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 22px; }
  .status-card { border-radius: 8px; padding: 12px; text-align: center; }
  .status-paid { background: #dcfce7; border: 1px solid #86efac; }
  .status-pend { background: #fef9c3; border: 1px solid #fde047; }
  .status-puru { background: #dbeafe; border: 1px solid #93c5fd; }
  .status-unpaid { background: #fee2e2; border: 1px solid #fca5a5; }
  .status-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .status-count { font-size: 22px; font-weight: 800; }
  .status-amount { font-size: 11px; margin-top: 2px; font-weight: 600; }

  table { width: 100%; border-collapse: collapse; margin-bottom: 22px; font-size: 11px; }
  th {
    background: #FFFF00; font-weight: 700; padding: 7px 10px;
    text-align: left; border: 1px solid #000; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.3px;
  }
  th.right { text-align: right; }
  td { padding: 6px 10px; border: 1px solid #d1d5db; vertical-align: middle; }
  tr:nth-child(even) td { background: #f9fafb; }
  td.right { text-align: right; font-weight: 600; }
  td.rank { text-align: center; font-weight: 700; color: #6b7280; width: 32px; }

  .report-footer {
    margin-top: 28px; padding-top: 10px; border-top: 1px solid #e5e7eb;
    font-size: 10px; color: #9ca3af; display: flex; justify-content: space-between;
  }

  @media print {
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .no-print { display: none !important; }
    .page-break { page-break-before: always; padding-top: 20px; }
  }
`

// ─── Component ────────────────────────────────────────────────────────────────

export function PrintableReport({ data, filters, onClose }: Props) {
  const printRef = useRef<HTMLDivElement>(null)

  const today = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  const totalAccountVol = data.accountBreakdown.reduce((s, a) => s + a.value, 0)

  const handlePrint = () => {
    const content = printRef.current?.innerHTML
    if (!content) return
    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) { alert('Allow pop-ups to generate PDF'); return }
    w.document.write(`<!DOCTYPE html><html><head>
      <title>SwipeSaaS Analytics Report — ${filters.startDate} to ${filters.endDate}</title>
      <meta charset="utf-8"/>
      <style>${PRINT_STYLES}</style>
    </head><body>${content}</body></html>`)
    w.document.close()
    setTimeout(() => { w.focus(); w.print(); }, 600)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
    >
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col"
        style={{ width: '92vw', maxWidth: 920, maxHeight: '90vh' }}>

        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#e5e7eb] flex-shrink-0">
          <span className="font-bold text-[#111827]">Export Analytics Report</span>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold text-white"
              style={{ background: '#3ECF8E' }}
            >
              <Download size={14} /> Download PDF
            </button>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-[#f3f4f6]">
              <X size={18} color="#6b7280" />
            </button>
          </div>
        </div>

        {/* Scrollable preview */}
        <div className="overflow-y-auto flex-1 bg-[#f3f4f6] p-4">
          <div ref={printRef} className="page bg-white shadow-sm" style={{ minWidth: 700 }}>

            {/* ── HEADER ── */}
            <div className="report-header">
              <div>
                <div className="logo">SwipeSaaS</div>
                <div className="report-title">Analytics Report</div>
                <div className="report-subtitle">
                  Period: {filters.startDate} → {filters.endDate}
                  {filters.account && filters.account !== 'ALL' ? ` · Account: ${filters.account}` : ' · All Accounts'}
                </div>
              </div>
              <div className="report-meta">
                <div><strong>Generated:</strong> {today}</div>
                <div><strong>Project:</strong> chamundaswipe</div>
                <div><strong>Status:</strong> PRODUCTION</div>
              </div>
            </div>

            {/* ── KPI CARDS ── */}
            <div className="section-title">Key Performance Indicators</div>
            <div className="kpi-grid">
              {[
                { label: 'Total Swiped', value: fc(data.kpis.totalSwiped), sub: 'Gross swipe volume' },
                { label: 'Total Commission', value: fc(data.kpis.totalCommission), sub: 'Our earnings' },
                { label: 'Outstanding Balance', value: fc(data.kpis.totalOutstanding), sub: 'Pending collections' },
                { label: 'Transactions', value: String(data.kpis.txnCount), sub: 'Total entries' },
                { label: 'Commission Collected Today', value: fc(data.kpis.commissionCollectedToday), sub: "Today's commission earned" },
                { label: 'Amount to Settle', value: fc(data.kpis.amountToSettle), sub: 'Pending across all transactions' },
                { label: 'Cash in Bank', value: fc(data.kpis.cashInBank), sub: 'Sum of all account balances' },
                { label: 'Cash in Hand', value: fc(data.kpis.cashInHand), sub: 'Chamunda sheet closing balance' },
                { label: 'Amount in Cards', value: fc(data.kpis.amountInCards), sub: 'Total card refill amount' },
              ].map(k => (
                <div key={k.label} className="kpi-card">
                  <div className="kpi-label">{k.label}</div>
                  <div className="kpi-value">{k.value}</div>
                  <div className="kpi-sub">{k.sub}</div>
                </div>
              ))}
            </div>

            {/* ── STATUS BREAKDOWN ── */}
            <div className="section-title">Transaction Status Breakdown</div>
            <div className="status-grid">
              <div className="status-card status-paid">
                <div className="status-label">✓ Paid</div>
                <div className="status-count">{data.statusBreakdown.paid.count}</div>
                <div className="status-amount">{fc(data.statusBreakdown.paid.amount)}</div>
              </div>
              <div className="status-card status-pend">
                <div className="status-label">⏳ Pending</div>
                <div className="status-count">{data.statusBreakdown.pend.count}</div>
                <div className="status-amount">{fc(data.statusBreakdown.pend.amount)}</div>
              </div>
              <div className="status-card status-puru">
                <div className="status-label">◎ Puru</div>
                <div className="status-count">{data.statusBreakdown.puru.count}</div>
                <div className="status-amount">{fc(data.statusBreakdown.puru.amount)}</div>
              </div>
              <div className="status-card status-unpaid">
                <div className="status-label">✗ Unpaid</div>
                <div className="status-count">{data.statusBreakdown.unpaid.count}</div>
                <div className="status-amount">{fc(data.statusBreakdown.unpaid.amount)}</div>
              </div>
            </div>

            {/* ── TOP CUSTOMERS ── */}
            <div className="section-title">Top Customers by Volume</div>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 32 }}>#</th>
                  <th>Customer Name</th>
                  <th className="right">Transactions</th>
                  <th className="right">Total Swiped</th>
                  <th className="right">Commission</th>
                  <th className="right">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {data.topCustomers.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9ca3af' }}>No data</td></tr>
                ) : data.topCustomers.map((c, i) => (
                  <tr key={i}>
                    <td className="rank">{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{c.customer}</td>
                    <td className="right">{c.transactions}</td>
                    <td className="right">{fc(c.total)}</td>
                    <td className="right">{fc(c.commission)}</td>
                    <td className="right" style={{ color: c.outstanding > 0 ? '#dc2626' : '#16a34a' }}>
                      {fc(c.outstanding)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* ── ACCOUNT BREAKDOWN ── */}
            <div className="section-title">Account-wise Volume Breakdown</div>
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th className="right">Total Volume</th>
                  <th className="right">% Share</th>
                </tr>
              </thead>
              <tbody>
                {data.accountBreakdown.length === 0 ? (
                  <tr><td colSpan={3} style={{ textAlign: 'center', color: '#9ca3af' }}>No data</td></tr>
                ) : data.accountBreakdown.map((a, i) => {
                  const pct = totalAccountVol > 0 ? ((a.value / totalAccountVol) * 100).toFixed(1) : '0.0'
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{a.name}</td>
                      <td className="right">{fc(a.value)}</td>
                      <td className="right">{pct}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* ── MACHINE PERFORMANCE ── */}
            <div className="page-break" />
            <div className="section-title">Swipe Machine Performance</div>
            <table>
              <thead>
                <tr>
                  <th>Machine</th>
                  <th>TID</th>
                  <th>Account</th>
                  <th className="right">Txns</th>
                  <th className="right">Total Swiped</th>
                  <th className="right">Our Commission</th>
                  <th className="right">Bank Commission</th>
                  <th className="right">Avg Ticket</th>
                </tr>
              </thead>
              <tbody>
                {data.machinePerformance.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9ca3af' }}>No data</td></tr>
                ) : data.machinePerformance.map((m, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{m.machine}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 10 }}>{m.tid}</td>
                    <td>{m.account}</td>
                    <td className="right">{m.transactions}</td>
                    <td className="right">{fc(m.total)}</td>
                    <td className="right" style={{ color: '#16a34a' }}>{fc(m.ourCommission)}</td>
                    <td className="right" style={{ color: '#dc2626' }}>{fc(m.bankCommission)}</td>
                    <td className="right">{m.transactions > 0 ? fc(Math.round(m.total / m.transactions)) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* ── FOOTER ── */}
            <div className="report-footer">
              <span>SwipeSaaS · chamundaswipe · CONFIDENTIAL</span>
              <span>Generated {today}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
