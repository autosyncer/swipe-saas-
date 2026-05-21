import { createClient } from '@/lib/supabase/client'
import { logAction } from '@/lib/audit-log'

export interface AcSheetRow {
  id: string | null
  date: string
  account_name: string
  open_bal: number
  bal_recd: number
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
  const supabase = createClient()

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
      .select('current_balance, opening_balance')
      .eq('account_name', accountName)
      .single()
    return Number(master?.current_balance ?? master?.opening_balance) || 0
  } catch { /* column may not exist yet */ }

  return 0
}

export async function loadAcSheet(date: string): Promise<AcSheetRow[]> {
  const supabase = createClient()

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
      if (existingMap[acc.account_name]) return existingMap[acc.account_name]

      const openBal = await getOpeningBalance(acc.account_name, date)
      return {
        id: null,
        date,
        account_name: acc.account_name,
        open_bal: openBal,
        bal_recd: 0,
        trn_bal_recd: 0,
        avai_bal: openBal,
        atm_withd: 0,
        withd: 0,
        transf: 0,
        cc_pay: 0,
        cust_trf: 0,
        charges: 0,
        closing_bal: openBal,
      }
    })
  )

  return rows
}

function recalc(row: AcSheetRow): AcSheetRow {
  const avai_bal = Number(row.open_bal) + Number(row.bal_recd) + Number(row.trn_bal_recd)
  const closing_bal = avai_bal - Number(row.atm_withd) - Number(row.withd) - Number(row.transf) - Number(row.cc_pay) - Number(row.cust_trf) - Number(row.charges)
  return { ...row, avai_bal, closing_bal }
}

export async function saveAcSheetCell(
  row: AcSheetRow,
  field: keyof AcSheetRow,
  value: number,
  onIdUpdate?: (id: string) => void
): Promise<AcSheetRow> {
  const supabase = createClient()
  const updated = recalc({ ...row, [field]: value })

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

export async function updateAcSheetFromTransaction(transaction: {
  date: string
  account_name: string
  total_amount: number
}): Promise<void> {
  const supabase = createClient()
  const date = transaction.date

  const accounts = (transaction.account_name || '')
    .split(/[+,]/)
    .map((a: string) => a.trim())
    .filter(Boolean)

  for (const acc of accounts) {
    const { data: existing } = await supabase
      .from('ac_sheet')
      .select('*')
      .eq('account_name', acc)
      .eq('date', date)
      .single()

    if (existing) {
      const newBalRecd = Number(existing.bal_recd) + Number(transaction.total_amount)
      const newAvai = Number(existing.open_bal) + newBalRecd + Number(existing.trn_bal_recd)
      const newClosing = newAvai - Number(existing.atm_withd) - Number(existing.withd) - Number(existing.transf) - Number(existing.cc_pay) - Number(existing.cust_trf) - Number(existing.charges)

      await supabase.from('ac_sheet').update({
        bal_recd: newBalRecd,
        avai_bal: newAvai,
        closing_bal: newClosing,
      }).eq('id', existing.id)
    } else {
      const openBal = await getOpeningBalance(acc, date)
      const balRecd = Number(transaction.total_amount)
      const avai = openBal + balRecd

      await supabase.from('ac_sheet').insert({
        date,
        account_name: acc,
        open_bal: openBal,
        bal_recd: balRecd,
        trn_bal_recd: 0,
        avai_bal: avai,
        atm_withd: 0,
        withd: 0,
        transf: 0,
        cc_pay: 0,
        cust_trf: 0,
        charges: 0,
        closing_bal: avai,
      })
    }
  }
}
