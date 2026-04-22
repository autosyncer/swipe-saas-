'use client'

import { useState } from 'react'

type Tab = 'General' | 'Security' | 'Notifications' | 'Accounts'

const accounts = [
  { name: 'NSS', balance: 1820000 },
  { name: 'SKT', balance: 1250000 },
  { name: 'RT', balance: 890000 },
  { name: 'KTC', balance: 670000 },
  { name: 'TAP', balance: 540000 },
  { name: 'BGM', balance: 320000 },
  { name: 'NTC', balance: 280000 },
  { name: 'MAHA', balance: 410000 },
  { name: 'MAL', balance: 190000 },
  { name: 'MAP', balance: 230000 },
  { name: 'HASTI', balance: 160000 },
]

function ToggleSwitch({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0"
      style={{ background: enabled ? '#3ECF8E' : '#d1d5db' }}
    >
      <span
        className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
        style={{ transform: enabled ? 'translateX(18px)' : 'translateX(2px)' }}
      />
    </button>
  )
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('General')
  const [bizName, setBizName] = useState('chamundaswipe')
  const [commission, setCommission] = useState('2.2')
  const [timezone, setTimezone] = useState('Asia/Kolkata')
  const [twoFA, setTwoFA] = useState(false)
  const [notifs, setNotifs] = useState({
    email: true,
    sms: false,
    dueDate: true,
    risk: true,
  })
  const [accts, setAccts] = useState(accounts.map(a => ({ ...a, editing: false, draft: String(a.balance) })))

  function toggleNotif(key: keyof typeof notifs) {
    setNotifs(n => ({ ...n, [key]: !n[key] }))
  }

  const tabs: Tab[] = ['General', 'Security', 'Notifications', 'Accounts']

  return (
    <div>
      <h1 className="text-lg font-bold text-[#1a1a1a] mb-4">Settings</h1>

      {/* Tab bar */}
      <div className="flex border-b border-[#e5e7eb] mb-6">
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
            style={{
              borderColor: activeTab === t ? '#3ECF8E' : 'transparent',
              color: activeTab === t ? '#3ECF8E' : '#6b7280',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* General tab */}
      {activeTab === 'General' && (
        <div
          className="bg-white rounded-lg border p-6 max-w-xl"
          style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
        >
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">Business Name</label>
              <input
                className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-[#3ECF8E]"
                style={{ borderColor: '#e5e7eb', borderRadius: 6 }}
                value={bizName}
                onChange={e => setBizName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">Default Commission %</label>
              <input
                type="number"
                step="0.1"
                className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-[#3ECF8E]"
                style={{ borderColor: '#e5e7eb', borderRadius: 6 }}
                value={commission}
                onChange={e => setCommission(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">Currency</label>
              <input
                disabled
                className="w-full rounded-md border px-3 py-2 text-sm bg-[#f9f9f9] text-[#6b7280] cursor-not-allowed"
                style={{ borderColor: '#e5e7eb', borderRadius: 6 }}
                value="₹ INR"
              />
              <p className="text-xs text-[#9ca3af] mt-1">Currency is locked for this account</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">Timezone</label>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm bg-white outline-none focus:border-[#3ECF8E]"
                style={{ borderColor: '#e5e7eb', borderRadius: 6 }}
                value={timezone}
                onChange={e => setTimezone(e.target.value)}
              >
                <option value="Asia/Kolkata">(GMT+5:30) Asia/Kolkata</option>
                <option value="Asia/Dubai">(GMT+4:00) Asia/Dubai</option>
                <option value="UTC">(GMT+0:00) UTC</option>
              </select>
            </div>
            <button
              className="self-start px-4 py-2 rounded-md text-sm font-medium text-white"
              style={{ background: '#3ECF8E', borderRadius: 6 }}
            >
              Save Changes
            </button>
          </div>
        </div>
      )}

      {/* Security tab */}
      {activeTab === 'Security' && (
        <div className="flex flex-col gap-4 max-w-xl">
          <div
            className="bg-white rounded-lg border p-6"
            style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
          >
            <h2 className="font-semibold text-[#1a1a1a] mb-4">Change Password</h2>
            <div className="flex flex-col gap-3">
              {['Current Password', 'New Password', 'Confirm New Password'].map(l => (
                <div key={l}>
                  <label className="block text-xs font-medium text-[#374151] mb-1">{l}</label>
                  <input
                    type="password"
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-[#3ECF8E]"
                    style={{ borderColor: '#e5e7eb', borderRadius: 6 }}
                    placeholder="••••••••"
                  />
                </div>
              ))}
              <button
                className="self-start px-4 py-2 rounded-md text-sm font-medium text-white mt-1"
                style={{ background: '#3ECF8E', borderRadius: 6 }}
              >
                Update Password
              </button>
            </div>
          </div>

          <div
            className="bg-white rounded-lg border p-6"
            style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-[#1a1a1a]">Two-Factor Authentication</h2>
                <p className="text-sm text-[#6b7280] mt-0.5">Add an extra layer of security to your account</p>
              </div>
              <ToggleSwitch enabled={twoFA} onChange={() => setTwoFA(v => !v)} />
            </div>
          </div>
        </div>
      )}

      {/* Notifications tab */}
      {activeTab === 'Notifications' && (
        <div
          className="bg-white rounded-lg border p-6 max-w-xl"
          style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
        >
          <h2 className="font-semibold text-[#1a1a1a] mb-4">Notification Preferences</h2>
          <div className="flex flex-col divide-y divide-[#e5e7eb]">
            {[
              { key: 'email', label: 'Email Alerts', desc: 'Receive important alerts and reports via email' },
              { key: 'sms', label: 'SMS Alerts', desc: 'Get critical notifications via SMS' },
              { key: 'dueDate', label: 'Due Date Reminders', desc: 'Automatic reminders before card payment due dates' },
              { key: 'risk', label: 'Risk Alerts', desc: 'Instant alerts for high-risk transaction patterns' },
            ].map(n => (
              <div key={n.key} className="flex items-center justify-between py-4">
                <div>
                  <div className="font-medium text-sm text-[#1a1a1a]">{n.label}</div>
                  <div className="text-xs text-[#6b7280] mt-0.5">{n.desc}</div>
                </div>
                <ToggleSwitch
                  enabled={notifs[n.key as keyof typeof notifs]}
                  onChange={() => toggleNotif(n.key as keyof typeof notifs)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Accounts tab */}
      {activeTab === 'Accounts' && (
        <div
          className="bg-white rounded-lg border overflow-hidden max-w-2xl"
          style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
        >
          <div className="px-4 py-3 border-b border-[#e5e7eb] font-semibold text-sm text-[#1a1a1a]">
            Bank Accounts ({accts.length})
          </div>
          <table className="w-full text-sm">
            <thead className="bg-[#f9f9f9]">
              <tr>
                {['Account Name', 'Current Balance', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-[#6b7280] uppercase border-b border-[#e5e7eb]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {accts.map((a, i) => (
                <tr key={a.name} className="border-b border-[#e5e7eb] hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <span
                      className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold"
                      style={{ background: '#dbeafe', color: '#1e40af' }}
                    >
                      {a.name}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {a.editing ? (
                      <input
                        type="number"
                        className="rounded border px-2 py-1 text-sm w-36 outline-none focus:border-[#3ECF8E]"
                        style={{ borderColor: '#e5e7eb' }}
                        value={a.draft}
                        onChange={e => setAccts(prev => prev.map((x, j) => j === i ? { ...x, draft: e.target.value } : x))}
                      />
                    ) : (
                      <span className="font-medium">₹{a.balance.toLocaleString('en-IN')}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {a.editing ? (
                      <div className="flex gap-2">
                        <button
                          className="px-2.5 py-1 rounded text-xs text-white font-medium"
                          style={{ background: '#3ECF8E' }}
                          onClick={() => setAccts(prev => prev.map((x, j) => j === i ? { ...x, balance: Number(x.draft), editing: false } : x))}
                        >
                          Save
                        </button>
                        <button
                          className="px-2.5 py-1 rounded text-xs border"
                          style={{ borderColor: '#e5e7eb' }}
                          onClick={() => setAccts(prev => prev.map((x, j) => j === i ? { ...x, editing: false, draft: String(x.balance) } : x))}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        className="px-2.5 py-1 rounded border text-xs"
                        style={{ borderColor: '#e5e7eb' }}
                        onClick={() => setAccts(prev => prev.map((x, j) => j === i ? { ...x, editing: true } : x))}
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
