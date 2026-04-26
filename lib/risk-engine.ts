import { createClient } from '@/lib/supabase/client'

interface AlertPayload {
  alert_type: string
  severity: 'high' | 'medium' | 'low'
  customer_name: string
  customer_id: string | null
  transaction_id: string | null
  details: Record<string, unknown>
}

const createAlertIfNotExists = async (alert: AlertPayload) => {
  const supabase = createClient()

  const { data: existing } = await supabase
    .from('risk_alerts')
    .select('id')
    .eq('alert_type', alert.alert_type)
    .eq('customer_name', alert.customer_name)
    .eq('is_dismissed', false)
    .limit(1)

  if (existing && existing.length > 0) return false

  const { error } = await supabase.from('risk_alerts').insert({
    ...alert,
    is_dismissed: false,
    created_at: new Date().toISOString(),
  })

  return !error
}

export const runRiskDetection = async (): Promise<number> => {
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]
  const last7days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0]

  const { data: txns } = await supabase
    .from('transactions')
    .select('*')
    .gte('date', last7days)
    .order('date', { ascending: false })

  if (!txns) return 0

  let newAlerts = 0

  // RULE 1: Same customer swiped 3+ times in one day
  const customerDayMap: Record<string, typeof txns> = {}
  txns.forEach(t => {
    const key = `${t.customer_name}_${t.date}`
    if (!customerDayMap[key]) customerDayMap[key] = []
    customerDayMap[key].push(t)
  })

  for (const [key, rows] of Object.entries(customerDayMap)) {
    if (rows.length >= 3) {
      const parts = key.split('_')
      const date = parts[parts.length - 1]
      const customer = parts.slice(0, -1).join('_')
      const totalAmt = rows.reduce((s, r) => s + Number(r.total_amount), 0)
      const created = await createAlertIfNotExists({
        alert_type: 'Multiple Swipes Same Day',
        severity: rows.length >= 5 ? 'high' : 'medium',
        customer_name: customer,
        customer_id: rows[0].customer_id ?? null,
        transaction_id: rows[0].id,
        details: {
          date,
          swipe_count: rows.length,
          total_amount: totalAmt,
          transactions: rows.map(r => ({ sr_no: r.sr_no, amount: r.total_amount })),
        },
      })
      if (created) newAlerts++
    }
  }

  // RULE 2: High value single transaction > ₹2,00,000
  const highValueTxns = txns.filter(t => Number(t.total_amount) > 200000)
  for (const t of highValueTxns) {
    const created = await createAlertIfNotExists({
      alert_type: 'High Value Transaction',
      severity: 'high',
      customer_name: t.customer_name ?? 'Unknown',
      customer_id: t.customer_id ?? null,
      transaction_id: t.id,
      details: {
        amount: t.total_amount,
        date: t.date,
        account: t.account_name,
        sr_no: t.sr_no,
      },
    })
    if (created) newAlerts++
  }

  // RULE 3: Customer outstanding > ₹1,00,000
  const { data: customers } = await supabase
    .from('customers')
    .select('*')
    .gt('outstanding_balance', 100000)

  for (const c of customers ?? []) {
    const created = await createAlertIfNotExists({
      alert_type: 'High Outstanding Balance',
      severity: c.outstanding_balance > 500000 ? 'high' : 'medium',
      customer_name: c.name,
      customer_id: c.id,
      transaction_id: null,
      details: {
        outstanding: c.outstanding_balance,
        customer_phone: c.phone,
      },
    })
    if (created) newAlerts++
  }

  // RULE 4: Card due date within 3 days
  const in3days = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0]

  const { data: dueSoonCards } = await supabase
    .from('cards')
    .select('*, customers(name, phone)')
    .lte('due_date', in3days)
    .gte('due_date', today)

  for (const card of dueSoonCards ?? []) {
    const customerName = (card.customers as { name?: string } | null)?.name ?? ''
    const daysLeft = Math.ceil(
      (new Date(card.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    )
    const created = await createAlertIfNotExists({
      alert_type: 'Card Due Soon',
      severity: 'medium',
      customer_name: customerName,
      customer_id: card.customer_id,
      transaction_id: null,
      details: {
        bank: card.bank_name,
        last4: card.last4,
        due_date: card.due_date,
        days_left: daysLeft,
      },
    })
    if (created) newAlerts++
  }

  // RULE 5: Same bank card used across 3+ different accounts
  const cardAccountMap: Record<string, Set<string>> = {}
  txns.forEach(t => {
    const card = `${t.customer_name}_${t.bank_card}`
    if (!cardAccountMap[card]) cardAccountMap[card] = new Set()
    if (t.account_name) {
      t.account_name.split(/[+,]/).forEach((a: string) => {
        cardAccountMap[card].add(a.trim())
      })
    }
  })

  for (const [card, accounts] of Object.entries(cardAccountMap)) {
    if (accounts.size >= 3) {
      const underscoreIdx = card.indexOf('_')
      const customer = card.substring(0, underscoreIdx)
      const bank = card.substring(underscoreIdx + 1)
      const relatedTxns = txns.filter(
        t => t.customer_name === customer && t.bank_card === bank
      )
      const created = await createAlertIfNotExists({
        alert_type: 'Card Used Across Multiple Accounts',
        severity: 'high',
        customer_name: customer,
        customer_id: relatedTxns[0]?.customer_id ?? null,
        transaction_id: relatedTxns[0]?.id ?? null,
        details: {
          bank_card: bank,
          accounts: Array.from(accounts),
          account_count: accounts.size,
        },
      })
      if (created) newAlerts++
    }
  }

  // RULE 6: High volume in short time (10+ txns in same hour)
  const timeGrouped: Record<string, typeof txns> = {}
  txns.forEach(t => {
    if (!t.created_at) return
    const hour = new Date(t.created_at).toISOString().substring(0, 13)
    if (!timeGrouped[hour]) timeGrouped[hour] = []
    timeGrouped[hour].push(t)
  })

  for (const [hour, rows] of Object.entries(timeGrouped)) {
    if (rows.length >= 10) {
      const created = await createAlertIfNotExists({
        alert_type: 'High Volume in Short Time',
        severity: 'high',
        customer_name: 'Multiple',
        customer_id: null,
        transaction_id: rows[0].id,
        details: {
          hour,
          transaction_count: rows.length,
          total_amount: rows.reduce((s, r) => s + Number(r.total_amount), 0),
        },
      })
      if (created) newAlerts++
    }
  }

  return newAlerts
}
