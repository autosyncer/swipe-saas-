import { supabase } from '@/lib/supabase'
import { logAction } from '@/lib/audit-log'

export interface AcSheetRow {
  id: string | null
  date: string
  account_name: string
  open_bal: number
  bal_recd: number
  same_day_bal_paytm: number
  same_day_bal_finkeda: number
  same_day_bal_qr: number
  same_day_bal: number
  trn_bal_recd: number
  avai_bal: number
  atm_withd: number
  withd: number
  transf: number
  cc_pay: number
  cust_trf: number
  charges: number
  closing_bal: number
}

export async function getOpeningBalance(accountName: string, date: string): Promise<number> {
  try {
    const { data } = await supabase
      .from('ac_sheet')
      .select('closing_bal, date')
      .eq('account_name', accountName)
      .lt('date', date)
      .order('date', { ascending: false })
      .limit(1)
    if (data && data.length > 0) return Number(data[0].closing_bal) || 0
  } catch { /* table not ready yet */ }

  try {
    const { data: master } = await supabase
      .from('bank_account_master')
      .select('*')
      .eq('account_name', accountName)
      .maybeSingle()
    if (master) {
      const row = master as Record<string, unknown>
      return Number(row.current_balance ?? row.opening_balance ?? row.balance) || 0
    }
  } catch { /* table/column not ready yet */ }

  return 0
}

export async function loadAcSheet(date: string): Promise<AcSheetRow[]> {
  const { data: accounts } = await supabase
    .from('bank_account_master')
    .select('*')
    .eq('is_active', true)
    .order('account_name')

  const { data: existing } = await supabase
    .from('ac_sheet')
    .select('*')
    .eq('date', date)

  const existingMap: Record<string, AcSheetRow> = {}
  existing?.forEach((row: AcSheetRow) => { existingMap[row.account_name] = row })

  const rows = await Promise.all(
    (accounts || []).map(async (acc: { account_name: string }) => {
      if (existingMap[acc.account_name]) return recalcExisting(existingMap[acc.account_name])

      const openBal = await getOpeningBalance(acc.account_name, date)
      return recalc({
        id: null,
        date,
        account_name: acc.account_name,
        open_bal: openBal,
        bal_recd: 0,
        same_day_bal_paytm: 0,
        same_day_bal_finkeda: 0,
        same_day_bal_qr: 0,
        same_day_bal: 0,
        trn_bal_recd: 0,
        avai_bal: 0,
        atm_withd: 0,
        withd: 0,
        transf: 0,
        cc_pay: 0,
        cust_trf: 0,
        charges: 0,
        closing_bal: 0,
      })
    })
  )

  return rows
}

function recalc(row: AcSheetRow): AcSheetRow {
  const avai_bal = Number(row.open_bal) + Number(row.bal_recd)
    + Number(row.same_day_bal_paytm) + Number(row.same_day_bal_finkeda) + Number(row.same_day_bal_qr)
    + Number(row.same_day_bal) + Number(row.trn_bal_recd)
  // atm_withd, withd, transf, cc_pay, cust_trf are display-only — not deducted from closing_bal
  const closing_bal = avai_bal - Number(row.charges)
  return { ...row, avai_bal, closing_bal }
}

// For existing DB rows: keep avai_bal as stored (already reduced by swap transactions)
function recalcExisting(row: AcSheetRow): AcSheetRow {
  const avai_bal = Number(row.avai_bal) || (
    Number(row.open_bal) + Number(row.bal_recd)
    + Number(row.same_day_bal_paytm) + Number(row.same_day_bal_finkeda) + Number(row.same_day_bal_qr)
    + Number(row.same_day_bal) + Number(row.trn_bal_recd)
  )
  // atm_withd, withd, transf, cc_pay, cust_trf are display-only — not deducted from closing_bal
  const closing_bal = avai_bal - Number(row.charges)
  return { ...row, avai_bal, closing_bal }
}

// Fields that ADD to avai_bal (delta-based update to preserve transaction deductions)
const ADDITIVE_FIELDS: (keyof AcSheetRow)[] = [
  'open_bal', 'bal_recd', 'same_day_bal_paytm', 'same_day_bal_finkeda',
  'same_day_bal_qr', 'same_day_bal', 'trn_bal_recd',
]

export async function saveAcSheetCell(
  row: AcSheetRow,
  field: keyof AcSheetRow,
  value: number,
  onIdUpdate?: (id: string) => void
): Promise<AcSheetRow> {
  // For input fields: preserve transaction-deducted avai_bal by applying delta
  // For deduction fields (atm_withd etc): avai_bal unchanged, only closing_bal changes
  let new_avai_bal: number
  if (ADDITIVE_FIELDS.includes(field)) {
    const delta = value - Number(row[field])
    new_avai_bal = Number(row.avai_bal) + delta
  } else {
    new_avai_bal = Number(row.avai_bal)
  }

  const updatedRow = { ...row, [field]: value, avai_bal: new_avai_bal }
  const closing_bal = new_avai_bal - Number(updatedRow.charges)
  const updated: AcSheetRow = { ...updatedRow, closing_bal }

  if (row.id) {
    await supabase.from('ac_sheet').update({
      [field]: value,
      avai_bal: updated.avai_bal,
      closing_bal: updated.closing_bal,
    }).eq('id', row.id)
  } else {
    const { data } = await supabase.from('ac_sheet').insert({
      date: row.date,
      account_name: row.account_name,
      open_bal: updated.open_bal,
      bal_recd: updated.bal_recd,
      same_day_bal_paytm: updated.same_day_bal_paytm,
      same_day_bal_finkeda: updated.same_day_bal_finkeda,
      same_day_bal_qr: updated.same_day_bal_qr,
      same_day_bal: updated.same_day_bal,
      trn_bal_recd: updated.trn_bal_recd,
      avai_bal: updated.avai_bal,
      atm_withd: updated.atm_withd,
      withd: updated.withd,
      transf: updated.transf,
      cc_pay: updated.cc_pay,
      cust_trf: updated.cust_trf,
      charges: updated.charges,
      closing_bal: updated.closing_bal,
    }).select().single()

    if (data?.id) {
      updated.id = data.id
      onIdUpdate?.(data.id)
    }
  }

  logAction({
    action: 'AC Sheet Updated',
    module: 'AC Sheet',
    details: {
      account: row.account_name,
      date: row.date,
      field_changed: field,
      new_value: value,
      closing_bal: updated.closing_bal,
    },
  }).catch(() => {})

  return updated
}

const LOW_BALANCE_THRESHOLD = 50000

export interface AccountBalanceInfo {
  account_name: string
  avai_bal: number
  cust_trf: number
  closing_bal: number
  remaining: number
}

export async function getAccountCurrentBalance(accountName: string, date: string): Promise<AccountBalanceInfo | null> {
  const { data } = await supabase.from('ac_sheet').select('*').eq('account_name', accountName).eq('date', date).maybeSingle()
  if (!data) {
    const openBal = await getOpeningBalance(accountName, date)
    return { account_name: accountName, avai_bal: openBal, cust_trf: 0, closing_bal: openBal, remaining: openBal }
  }
  // If avai_bal is 0 in DB, compute it from input columns
  const storedAvai = Number(data.avai_bal)
  const avai_bal = storedAvai !== 0 ? storedAvai : (
    Number(data.open_bal) + Number(data.bal_recd)
    + Number(data.same_day_bal_paytm || 0) + Number(data.same_day_bal_finkeda || 0)
    + Number(data.same_day_bal_qr || 0) + Number(data.same_day_bal || 0)
    + Number(data.trn_bal_recd)
  )
  const cust_trf = Number(data.cust_trf) || 0
  return { account_name: accountName, avai_bal, cust_trf, closing_bal: Number(data.closing_bal) || 0, remaining: avai_bal }
}

export interface DeductResult {
  account_name: string
  closing_bal: number
  low_balance: boolean
}

export async function deductTransactionFromAcSheet(transaction: {
  date: string
  account_name: string
  swap_amount: number
}): Promise<DeductResult[]> {
  const date = transaction.date
  const accounts = (transaction.account_name || '').split(/[+,]/).map((a: string) => a.trim()).filter(Boolean)

  const { data: validAccounts } = await supabase.from('bank_account_master').select('account_name').in('account_name', accounts)
  const validSet = new Set((validAccounts || []).map((a: { account_name: string }) => a.account_name))

  const results: DeductResult[] = []
  const validCount = accounts.filter(a => validSet.has(a)).length
  const amountPerAccount = validCount > 0 ? transaction.swap_amount / validCount : transaction.swap_amount

  for (const acc of accounts) {
    if (!acc || !validSet.has(acc)) continue

    const { data: existing } = await supabase.from('ac_sheet').select('*').eq('account_name', acc).eq('date', date).maybeSingle()

    // Get actual current avai_bal (DB row or computed from opening balance)
    const currentBal = await getAccountCurrentBalance(acc, date)
    const currentAvai = currentBal ? Number(currentBal.avai_bal) : 0
    const newAvai = currentAvai - amountPerAccount

    if (existing) {
      const closing_bal = newAvai - Number(existing.charges || 0)
      await supabase.from('ac_sheet').update({ avai_bal: newAvai, closing_bal }).eq('id', existing.id)
    } else {
      const openBal = await getOpeningBalance(acc, date)
      await supabase.from('ac_sheet').insert({
        date, account_name: acc, open_bal: openBal, bal_recd: 0,
        same_day_bal_paytm: 0, same_day_bal_finkeda: 0, same_day_bal_qr: 0, same_day_bal: 0,
        trn_bal_recd: 0, avai_bal: newAvai,
        atm_withd: 0, withd: 0, transf: 0, cc_pay: 0, cust_trf: 0, charges: 0,
        closing_bal: newAvai, // no deduction from display columns
      })
    }
    results.push({ account_name: acc, closing_bal: newAvai, low_balance: newAvai < LOW_BALANCE_THRESHOLD })
  }
  return results
}

// Add swap amount to account balance on release (card swap = money coming IN)
export async function addSwapToAcSheet(params: {
  date: string
  account_name: string
  swap_amount: number
}): Promise<void> {
  const accounts = (params.account_name || '').split(/[+,]/).map(a => a.trim()).filter(Boolean)
  const amountPerAccount = accounts.length > 0 ? params.swap_amount / accounts.length : params.swap_amount

  for (const acc of accounts) {
    const { data: existing } = await supabase.from('ac_sheet').select('*').eq('account_name', acc).eq('date', params.date).maybeSingle()
    if (existing) {
      const newAvai = Number(existing.avai_bal || 0) + amountPerAccount
      const closing_bal = newAvai - Number(existing.charges || 0)
      await supabase.from('ac_sheet').update({ avai_bal: newAvai, closing_bal }).eq('id', existing.id)
    } else {
      const openBal = await getOpeningBalance(acc, params.date)
      const newAvai = openBal + amountPerAccount
      await supabase.from('ac_sheet').insert({
        date: params.date, account_name: acc, open_bal: openBal,
        bal_recd: amountPerAccount,
        same_day_bal_paytm: 0, same_day_bal_finkeda: 0, same_day_bal_qr: 0, same_day_bal: 0,
        trn_bal_recd: 0, avai_bal: newAvai,
        atm_withd: 0, withd: 0, transf: 0, cc_pay: 0, cust_trf: 0, charges: 0,
        closing_bal: newAvai,
      })
    }
  }
}

const CASH_TYPE_COLUMN_MAP: Record<string, keyof AcSheetRow> = {
  'ATM WITHD': 'atm_withd',
  'WITHD':     'withd',
  'TRANSF':    'transf',
  'CC PAY':    'cc_pay',
  'CUST TRF':  'cust_trf',
}

export async function updateAcSheetCashType(params: {
  date: string
  account_name: string
  cashType: string
  amount: number
}): Promise<void> {
  const col = CASH_TYPE_COLUMN_MAP[params.cashType]
  if (!col) return

  // Sum all transactions for this account+date+cashType to get accurate total
  const colToType: Record<string, string> = {
    atm_withd: 'ATM WITHD', withd: 'WITHD', transf: 'TRANSF', cc_pay: 'CC PAY', cust_trf: 'CUST TRF',
  }
  const { data: txns } = await supabase
    .from('transactions')
    .select('paid_in_cash, cash_type')
    .eq('account_name', params.account_name)
    .eq('date', params.date)
    .eq('cash_type', colToType[col as string])

  const totalForCol = (txns || []).reduce((sum: number, t: { paid_in_cash: number | null }) => sum + (Number(t.paid_in_cash) || 0), 0)

  const { data: existing } = await supabase
    .from('ac_sheet')
    .select('*')
    .eq('account_name', params.account_name)
    .eq('date', params.date)
    .maybeSingle()

  if (existing) {
    await supabase.from('ac_sheet').update({ [col]: totalForCol }).eq('id', existing.id)
  } else {
    const openBal = await getOpeningBalance(params.account_name, params.date)
    await supabase.from('ac_sheet').insert({
      date: params.date,
      account_name: params.account_name,
      open_bal: openBal, bal_recd: 0,
      same_day_bal_paytm: 0, same_day_bal_finkeda: 0, same_day_bal_qr: 0, same_day_bal: 0,
      trn_bal_recd: 0, avai_bal: openBal,
      atm_withd: col === 'atm_withd' ? totalForCol : 0,
      withd:     col === 'withd'     ? totalForCol : 0,
      transf:    col === 'transf'    ? totalForCol : 0,
      cc_pay:    col === 'cc_pay'    ? totalForCol : 0,
      cust_trf:  col === 'cust_trf'  ? totalForCol : 0,
      charges: 0, closing_bal: openBal,
    })
  }
}

export async function updateAcSheetFromTransaction(transaction: {
  date: string
  account_name: string
  total_amount: number
}): Promise<void> {
  const date = transaction.date
  const accounts = (transaction.account_name || '').split(/[+,]/).map((a: string) => a.trim()).filter(Boolean)

  const { data: validAccounts } = await supabase.from('bank_account_master').select('account_name').in('account_name', accounts)
  const validSet = new Set((validAccounts || []).map((a: { account_name: string }) => a.account_name))

  for (const acc of accounts) {
    if (!acc || !validSet.has(acc)) continue

    const { data: existing } = await supabase.from('ac_sheet').select('*').eq('account_name', acc).eq('date', date).maybeSingle()

    if (existing) {
      const newBalRecd = Number(existing.bal_recd) + Number(transaction.total_amount)
      await supabase.from('ac_sheet').update({ bal_recd: newBalRecd }).eq('id', existing.id)
    } else {
      const openBal = await getOpeningBalance(acc, date)
      await supabase.from('ac_sheet').insert({
        date,
        account_name: acc,
        open_bal: openBal,
        bal_recd: Number(transaction.total_amount),
        same_day_bal_paytm: 0, same_day_bal_finkeda: 0, same_day_bal_qr: 0, same_day_bal: 0,
        trn_bal_recd: 0,
        atm_withd: 0, withd: 0, transf: 0, cc_pay: 0, cust_trf: 0, charges: 0,
      })
    }
  }
}
