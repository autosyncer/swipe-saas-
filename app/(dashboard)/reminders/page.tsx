'use client'

import { useState } from 'react'

export default function RemindersPage() {
  const [filter, setFilter] = useState<7 | 15 | 30>(30)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold text-[#1a1a1a]">Upcoming Due Dates</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">Track and send reminders for upcoming card payment dues</p>
        </div>
        <div className="flex items-center gap-2">
          {([7, 15, 30] as const).map(d => (
            <button
              key={d}
              onClick={() => setFilter(d)}
              className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
              style={{
                background: filter === d ? '#3ECF8E' : '#f3f4f6',
                color: filter === d ? '#fff' : '#374151',
              }}
            >
              {d} days
            </button>
          ))}
        </div>
      </div>

      <div
        className="bg-white rounded-lg border overflow-hidden"
        style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
      >
        <table className="w-full text-sm">
          <thead className="bg-[#f9f9f9]">
            <tr>
              {['Customer', 'Card', 'Bank', 'Due Date', 'Days Left', 'Amount', 'Status', 'Action'].map(h => (
                <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-[#6b7280] uppercase border-b border-[#e5e7eb]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={8} className="px-4 py-8 text-center text-sm text-[#9ca3af]">No records yet</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
