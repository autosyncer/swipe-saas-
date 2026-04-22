'use client'

import {
  TrendingUp, User, Download, BarChart2, Users, MonitorSmartphone,
  Wallet, DollarSign, AlertCircle, CalendarDays
} from 'lucide-react'

const featured = [
  {
    icon: TrendingUp,
    title: 'Daily P&L Report',
    desc: 'Generate daily profit & loss summary with commission breakdown',
    badge: 'GENERATE',
  },
  {
    icon: User,
    title: 'Customer Statement',
    desc: 'Per customer transaction history with outstanding balance',
    badge: 'GENERATE',
  },
]

const reportCards = [
  { icon: Users, title: 'Customer-wise Profit', desc: 'Net profit per customer after commission deductions' },
  { icon: BarChart2, title: 'Bank-wise Volume', desc: 'Transaction volume grouped by bank account' },
  { icon: MonitorSmartphone, title: 'Agent Performance', desc: 'Swipe counts and volume per field agent' },
  { icon: AlertCircle, title: 'Pending Collections', desc: 'Outstanding dues with aging breakdown' },
  { icon: DollarSign, title: 'Commission Summary', desc: 'Total commissions earned by date range' },
  { icon: MonitorSmartphone, title: 'Swipe Machine Report', desc: 'TID-wise transaction count and volume' },
  { icon: Wallet, title: 'Outstanding Balance', desc: 'Customer-wise pending balance snapshot' },
  { icon: CalendarDays, title: 'Monthly Summary', desc: 'Month-over-month comparison of key metrics' },
]

export default function ReportsPage() {
  return (
    <div>
      <h1 className="text-lg font-bold text-[#1a1a1a] mb-6">Reports</h1>

      {/* Featured 2 cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {featured.map(r => (
          <div
            key={r.title}
            className="bg-white rounded-lg border p-6 flex items-start gap-4"
            style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
          >
            <div className="p-3 rounded-lg" style={{ background: '#f0fdf4' }}>
              <r.icon size={24} color="#3ECF8E" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="font-semibold text-[#1a1a1a]">{r.title}</h2>
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                  style={{ background: '#d1fae5', color: '#065f46' }}
                >
                  {r.badge}
                </span>
              </div>
              <p className="text-sm text-[#6b7280] mb-3">{r.desc}</p>
              <button
                className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium text-white"
                style={{ background: '#3ECF8E', borderRadius: 6 }}
              >
                <Download size={14} /> Generate Report
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 4-col grid */}
      <div className="grid grid-cols-4 gap-4">
        {reportCards.map(r => (
          <div
            key={r.title}
            className="group bg-white rounded-lg border p-4 flex flex-col gap-3 cursor-pointer hover:shadow-md transition-shadow"
            style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
          >
            <div className="p-2.5 rounded-lg w-fit" style={{ background: '#f0fdf4' }}>
              <r.icon size={20} color="#3ECF8E" />
            </div>
            <div>
              <div className="font-semibold text-sm text-[#1a1a1a] mb-1">{r.title}</div>
              <div className="text-xs text-[#6b7280]">{r.desc}</div>
            </div>
            <div className="flex items-center justify-between mt-auto">
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                style={{ background: '#d1fae5', color: '#065f46' }}
              >
                GENERATE
              </span>
              <button
                className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 px-2 py-1 rounded-md text-xs border"
                style={{ borderColor: '#e5e7eb' }}
              >
                <Download size={11} /> Download
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
