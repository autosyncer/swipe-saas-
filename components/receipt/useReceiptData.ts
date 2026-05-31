import { Transaction } from '@/types/database'
import { PaymentReceiptProps } from './PaymentReceipt'
import { supabase } from '@/lib/supabase'

export async function transactionToReceiptProps(
  txn: Transaction,
  relatedTxns: Transaction[] = []
): Promise<PaymentReceiptProps> {
  const allTxns = [txn, ...relatedTxns.filter((t) => t.id !== txn.id)]

  let mobileNo: string | undefined
  let ifscCode: string | undefined
  let branch: string | undefined
  let accNo: string | undefined
  let bankCCName: string = txn.bank_card || ''

  // Fetch customer phone + bank account in one go
  const { data: customer, error: custErr } = await supabase
    .from('customers')
    .select('id, phone')
    .ilike('name', txn.customer_name)
    .maybeSingle()

  console.log('[receipt] customer lookup:', txn.customer_name, '→', customer, custErr)

  if (customer) {
    if (customer.phone) mobileNo = customer.phone

    const { data: bankAcc, error: bankErr } = await supabase
      .from('customer_bank_accounts')
      .select('*')
      .eq('customer_id', customer.id)
      .limit(1)
      .maybeSingle()

    console.log('[receipt] bank account:', bankAcc, bankErr)

    if (bankAcc) {
      const acc = bankAcc as Record<string, unknown>
      ifscCode = (acc.ifsc_code as string) || undefined
      branch = (acc.branch as string) || undefined
      accNo = (acc.account_number as string) || undefined
      // Use saved bank name if transaction bank_card is empty
      if (!bankCCName) bankCCName = (acc.bank_name as string) || ''
    }
  }

  return {
    name: txn.customer_name,
    mobileNo,
    srNo: txn.sr_no,
    bankCCName,
    branch,
    accNo,
    ifscCode,
    transactions: allTxns.map((t) => ({
      date: t.date,
      bankName: t.swap_name ?? t.account_name ?? '',
      amount: t.swap_amount ?? 0,
    })),
    totalAmount: allTxns.reduce((sum, t) => sum + (t.swap_amount ?? 0), 0),
    status: txn.remarks ?? '',
  }
}
