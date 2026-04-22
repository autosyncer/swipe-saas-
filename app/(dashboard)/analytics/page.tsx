'use client'

import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid
} from 'recharts'

const kpiLabels = [
  { label: 'Total Volume', key: 'totalVolume' },
  { label: 'Commission Earned', key: 'commission' },
  { label: 'Active Customers', key: 'customers' },
  { label: 'Avg Transaction Size', key: 'avgTxn' },
]

const pieData = [
  { name: 'Paid', value: 0, color: '#3ECF8E' },
  { name: 'Unpaid', value: 0, color: '#ef4444' },
  { name: 'Pending', value: 0, color: '#f59e0b' },
  { name: 'Puru', value: 0, color: '#6366f1' },
]

export default function AnalyticsPage() {
  return (
    <div>
      <h1 className="text-lg font-bold text-[#1a1a1a] mb-6">Analytics</h1>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {kpiLabels.map(k => (
          <div
            key={k.label}
            className="bg-white rounded-lg border p-4"
            style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
          >
            <div className="text-xs font-semibold text-[#6b7280] uppercase mb-1">{k.label}</div>
            <div className="text-2xl font-bold text-[#9ca3af]">—</div>
            <div className="text-xs mt-1 font-medium text-[#9ca3af]">No data yet</div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Line chart */}
        <div
          className="bg-white rounded-lg border p-4"
          style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
        >
          <div className="font-semibold text-sm text-[#1a1a1a] mb-4">Daily Transaction Volume (7 days)</div>
          <div className="flex items-center justify-center h-[220px] text-sm text-[#9ca3af]">No data yet</div>
        </div>

        {/* Bar chart */}
        <div
          className="bg-white rounded-lg border p-4"
          style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
        >
          <div className="font-semibold text-sm text-[#1a1a1a] mb-4">Account-wise Volume</div>
          <div className="flex items-center justify-center h-[220px] text-sm text-[#9ca3af]">No data yet</div>
        </div>
      </div>

      {/* Bottom: pie + top customers */}
      <div className="grid grid-cols-2 gap-4">
        {/* Pie chart placeholder */}
        <div
          className="bg-white rounded-lg border p-4"
          style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
        >
          <div className="font-semibold text-sm text-[#1a1a1a] mb-4">Status Distribution</div>
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center" style={{ width: 180, height: 180 }}>
              <span className="text-sm text-[#9ca3af]">No data yet</span>
            </div>
            <div className="flex flex-col gap-2">
              {[
                { name: 'Paid', color: '#3ECF8E' },
                { name: 'Unpaid', color: '#ef4444' },
                { name: 'Pending', color: '#f59e0b' },
                { name: 'Puru', color: '#6366f1' },
              ].map(d => (
                <div key={d.name} className="flex items-center gap-2 text-sm">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: d.color }} />
                  <span className="text-[#374151]">{d.name}</span>
                  <span className="font-semibold text-[#9ca3af] ml-1">0%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top customers */}
        <div
          className="bg-white rounded-lg border p-4"
          style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
        >
          <div className="font-semibold text-sm text-[#1a1a1a] mb-4">Top 5 Customers by Volume</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#e5e7eb]">
                {['Customer', 'Volume', 'Txns', 'Commission'].map(h => (
                  <th key={h} className="pb-2 text-left text-xs font-semibold text-[#6b7280]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={4} className="py-6 text-center text-sm text-[#9ca3af]">No records yet</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
