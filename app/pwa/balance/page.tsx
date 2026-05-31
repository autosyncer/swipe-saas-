'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const FIELD_OPTIONS = [
  { key: 'bal_recd',    label: 'BAL RECD',       desc: 'Balance received',        color: '#3ECF8E' },
  { key: 'trn_bal_recd',label: 'TRN BAL RECD',   desc: 'Transfer balance received',color: '#3b82f6' },
  { key: 'atm_withd',  label: 'ATM WITHDRAWAL',  desc: 'ATM withdrawal',           color: '#ef4444' },
  { key: 'withd',      label: 'WITHDRAWAL',      desc: 'Cash withdrawal',          color: '#ef4444' },
  { key: 'transf',     label: 'TRANSFER',        desc: 'Transfer out',             color: '#f59e0b' },
  { key: 'cc_pay',     label: 'CC PAYMENT',      desc: 'Credit card payment',      color: '#8b5cf6' },
  { key: 'cust_trf',   label: 'CUST TRANSFER',   desc: 'Customer transfer',        color: '#06b6d4' },
  { key: 'charges',    label: 'CHARGES',         desc: 'Bank charges',             color: '#ec4899' },
]

const ADDITIVE = ['bal_recd', 'trn_bal_recd']

export default function PWABalance() {
  const router = useRouter()
  const [selectedAccount, setSelectedAccount] = useState('')
  const [selectedField, setSelectedField] = useState('bal_recd')
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [accounts, setAccounts] = useState<string[]>([])
  const [todayBalances, setTodayBalances] = useState<Record<string, unknown>[]>([])
  const [success, setSuccess] = useState(false)

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    supabase.from('bank_account_master').select('account_name').eq('is_active', true).order('account_name')
      .then(({ data }) => setAccounts((data || []).map((r: { account_name: string }) => r.account_name)))
    fetchTodayBalances()
  }, [])

  async function fetchTodayBalances() {
    const { data } = await supabase.from('ac_sheet').select('*').eq('date', today).order('account_name')
    setTodayBalances(data || [])
  }

  async function handleAddBalance() {
    if (!selectedAccount) { alert('Select account'); return }
    if (!amount || parseFloat(amount) <= 0) { alert('Enter valid amount'); return }
    setSaving(true)
    try {
      const amt = parseFloat(amount)
      const { data: existing } = await supabase.from('ac_sheet').select('*').eq('account_name', selectedAccount).eq('date', today).maybeSingle()
      const row = existing as Record<string, number> | null

      if (row) {
        const newVal = (Number(row[selectedField]) || 0) + amt
        const updatedField = { [selectedField]: newVal }
        const avai_bal = ADDITIVE.includes(selectedField)
          ? Number(row.avai_bal) + amt
          : Number(row.avai_bal)
        const closing_bal = avai_bal - Number(row.atm_withd) - Number(row.withd) - Number(row.transf) - Number(row.cc_pay) - Number(row.cust_trf) - Number(row.charges)
        await supabase.from('ac_sheet').update({ ...updatedField, avai_bal, closing_bal }).eq('id', row.id)
      } else {
        const { data: prev } = await supabase.from('ac_sheet').select('closing_bal').eq('account_name', selectedAccount).lt('date', today).order('date', { ascending: false }).limit(1)
        const openBal = Number((prev as { closing_bal: number }[] | null)?.[0]?.closing_bal) || 0
        const newRow: Record<string, unknown> = {
          date: today, account_name: selectedAccount, open_bal: openBal,
          bal_recd: 0, trn_bal_recd: 0, atm_withd: 0, withd: 0, transf: 0, cc_pay: 0, cust_trf: 0, charges: 0,
          [selectedField]: amt,
        }
        const avai_bal = openBal + (ADDITIVE.includes(selectedField) ? amt : 0)
        const deductions = ADDITIVE.includes(selectedField) ? 0 : amt
        newRow.avai_bal = avai_bal
        newRow.closing_bal = avai_bal - deductions
        await supabase.from('ac_sheet').insert(newRow)
      }
      setAmount('')
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
      fetchTodayBalances()
    } catch (err) {
      alert('Failed: ' + (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const fieldInfo = FIELD_OPTIONS.find(f => f.key === selectedField)

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: 'system-ui, sans-serif', paddingBottom: '80px' }}>
      <div style={{ background: '#1a1a1a', color: 'white', padding: '16px', paddingTop: 'calc(16px + env(safe-area-inset-top))', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button onClick={() => router.push('/dashboard')} style={{ background: 'none', border: 'none', color: '#3ECF8E', fontSize: '22px', cursor: 'pointer' }}>‹</button>
        <div>
          <div style={{ fontWeight: 'bold', fontSize: '16px' }}>🏦 Add Balance</div>
          <div style={{ color: '#9ca3af', fontSize: '12px' }}>{new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {success && (
          <div style={{ background: '#f0fdf4', border: '1px solid #3ECF8E', borderRadius: '10px', padding: '12px 16px', color: '#16a34a', fontWeight: 'bold' }}>
            ✅ Balance added successfully!
          </div>
        )}

        {/* Account */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}>Select Account</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {accounts.map(acc => (
              <button key={acc} onClick={() => setSelectedAccount(acc)} style={{
                padding: '8px 14px',
                background: selectedAccount === acc ? '#3ECF8E' : '#f3f4f6',
                color: selectedAccount === acc ? 'white' : '#374151',
                border: `1px solid ${selectedAccount === acc ? '#3ECF8E' : '#e5e7eb'}`,
                borderRadius: '999px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold',
              }}>{acc}</button>
            ))}
          </div>
        </div>

        {/* Field */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}>Transaction Type</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {FIELD_OPTIONS.map(f => (
              <button key={f.key} onClick={() => setSelectedField(f.key)} style={{
                padding: '10px 14px', borderRadius: '8px', cursor: 'pointer',
                background: selectedField === f.key ? f.color + '15' : '#f9fafb',
                border: `1px solid ${selectedField === f.key ? f.color : '#e5e7eb'}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontWeight: 'bold', fontSize: '13px', color: selectedField === f.key ? f.color : '#374151' }}>{f.label}</span>
                <span style={{ fontSize: '11px', color: '#9ca3af' }}>{f.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Amount */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px', fontWeight: 'bold', textTransform: 'uppercase' }}>Amount (₹)</div>
          <input type="number" inputMode="numeric" placeholder="0" value={amount} onChange={e => setAmount(e.target.value)}
            style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '14px', fontSize: '28px', fontWeight: 'bold', color: fieldInfo?.color || '#374151', textAlign: 'right', outline: 'none', boxSizing: 'border-box' }} />
          {selectedAccount && amount && (
            <div style={{ marginTop: '10px', fontSize: '13px', color: '#6b7280', textAlign: 'center' }}>
              {selectedAccount} {fieldInfo?.label} +₹{parseFloat(amount).toLocaleString('en-IN')}
            </div>
          )}
        </div>

        <button onClick={handleAddBalance} disabled={saving || !selectedAccount || !amount} style={{
          background: saving || !selectedAccount || !amount ? '#9ca3af' : '#3ECF8E',
          color: 'white', border: 'none', borderRadius: '12px', padding: '16px',
          fontWeight: 'bold', fontSize: '16px', cursor: saving || !selectedAccount || !amount ? 'not-allowed' : 'pointer',
        }}>
          {saving ? '⏳ Adding...' : '+ Add Balance'}
        </button>

        {/* Today balances */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>Today&apos;s Account Balances</div>
          {todayBalances.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#9ca3af', padding: '20px', fontSize: '13px' }}>No balances added today yet</div>
          ) : todayBalances.map((b) => (
            <div key={String(b.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{String(b.account_name)}</div>
                <div style={{ fontSize: '11px', color: '#9ca3af' }}>Recd: ₹{Number(b.bal_recd || 0).toLocaleString('en-IN')}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 'bold', fontSize: '15px', color: Number(b.closing_bal) >= 0 ? '#16a34a' : '#ef4444' }}>
                  ₹{Number(b.closing_bal || 0).toLocaleString('en-IN')}
                </div>
                <div style={{ fontSize: '11px', color: '#9ca3af' }}>Closing</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
