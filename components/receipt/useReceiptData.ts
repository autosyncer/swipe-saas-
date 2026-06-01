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

  // Step 1: Fetch customer
  const { data: customer } = await supabase
    .from('customers')
    .select('id, phone')
    .ilike('name', txn.customer_name)
    .maybeSingle()

  if (customer) {
    if (customer.phone) mobileNo = customer.phone

    // Step 2: Try customer bank accounts first
    const { data: bankAcc } = await supabase
      .from('customer_bank_accounts')
      .select('*')
      .eq('customer_id', customer.id)
      .limit(1)
      .maybeSingle()

    if (bankAcc) {
      const acc = bankAcc as Record<string, unknown>
      ifscCode = (acc.ifsc_code as string) || undefined
      branch   = (acc.branch as string) || undefined
      accNo    = (acc.account_number as string) || undefined
      if (!bankCCName) bankCCName = (acc.bank_name as string) || ''
    }

    // Step 3: If bank account missing, try card details from cards table
    if (!accNo && txn.bank_card) {
      const { data: card } = await supabase
        .from('cards')
        .select('card_number, last4, bank_name, card_nickname')
        .eq('customer_id', customer.id)
        .ilike('bank_name', `%${txn.bank_card}%`)
        .limit(1)
        .maybeSingle()

      if (card) {
        const c = card as Record<string, unknown>
        accNo      = (c.card_number as string) || (c.last4 ? `XXXX-XXXX-XXXX-${c.last4}` : undefined)
        if (!bankCCName) bankCCName = (c.bank_name as string) || txn.bank_card || ''
      }
    }

    // Step 4: If still nothing, try any card for this customer
    if (!accNo) {
      const { data: anyCard } = await supabase
        .from('cards')
        .select('card_number, last4, bank_name')
        .eq('customer_id', customer.id)
        .limit(1)
        .maybeSingle()

      if (anyCard) {
        const c = anyCard as Record<string, unknown>
        accNo = (c.card_number as string) || (c.last4 ? `XXXX-XXXX-XXXX-${c.last4}` : undefined)
      }
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
