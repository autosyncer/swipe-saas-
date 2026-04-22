'use client'

import { AlertTriangle } from 'lucide-react'

export default function AlertsPage() {
  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <AlertTriangle size={20} color="#f59e0b" />
        <h1 className="text-lg font-bold text-[#1a1a1a]">Risk Alerts</h1>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'High Risk', count: 0, color: '#ef4444', bg: '#fee2e2' },
          { label: 'Medium Risk', count: 0, color: '#f59e0b', bg: '#fef3c7' },
          { label: 'Flagged Today', count: 0, color: '#f97316', bg: '#ffedd5' },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-lg border p-4" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <div className="text-xs font-semibold text-[#6b7280] uppercase mb-1">{c.label}</div>
            <div className="text-3xl font-bold" style={{ color: c.color }}>{c.count}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg border p-8 text-center" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <p className="text-sm text-[#9ca3af]">No records yet</p>
      </div>
    </div>
  )
}
