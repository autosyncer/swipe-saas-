'use client'

import { useState } from 'react'

const allUsers = ['All Users']
const allActions = ['All Actions', 'Transaction Created', 'Customer Added', 'Login', 'Export Generated', 'Settings Updated']

export default function LogsPage() {
  const today = new Date().toISOString().split('T')[0]
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
  const [fromDate, setFromDate] = useState(weekAgo)
  const [toDate, setToDate] = useState(today)
  const [userFilter, setUserFilter] = useState('All Users')
  const [actionFilter, setActionFilter] = useState('All Actions')

  return (
    <div>
      <h1 className="text-lg font-bold text-[#1a1a1a] mb-4">Audit Logs</h1>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-1">
          <label className="text-xs text-[#6b7280]">From</label>
          <input
            type="date"
            className="rounded-md border px-2 py-1.5 text-sm outline-none"
            style={{ borderColor: '#e5e7eb' }}
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1">
          <label className="text-xs text-[#6b7280]">To</label>
          <input
            type="date"
            className="rounded-md border px-2 py-1.5 text-sm outline-none"
            style={{ borderColor: '#e5e7eb' }}
            value={toDate}
            onChange={e => setToDate(e.target.value)}
          />
        </div>
        <select
          className="rounded-md border px-2 py-1.5 text-sm bg-white outline-none"
          style={{ borderColor: '#e5e7eb' }}
          value={userFilter}
          onChange={e => setUserFilter(e.target.value)}
        >
          {allUsers.map(u => <option key={u}>{u}</option>)}
        </select>
        <select
          className="rounded-md border px-2 py-1.5 text-sm bg-white outline-none"
          style={{ borderColor: '#e5e7eb' }}
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
        >
          {allActions.map(a => <option key={a}>{a}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-lg border overflow-hidden" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <table className="w-full text-sm">
          <thead className="bg-[#f9f9f9]">
            <tr>
              {['Timestamp', 'User', 'Action', 'Details', 'IP Address'].map(h => (
                <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-[#6b7280] uppercase border-b border-[#e5e7eb]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-sm text-[#9ca3af]">No records yet</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
