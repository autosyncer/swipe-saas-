import { Transaction } from '@/types/database'
import { PaymentReceiptProps } from './PaymentReceipt'

export function transactionToReceiptProps(
  txn: Transaction,
  relatedTxns: Transaction[] = []
): PaymentReceiptProps {
  const allTxns = [txn, ...relatedTxns.filter((t) => t.id !== txn.id)]

  return {
    name: txn.customer_name,
    mobileNo: undefined,
    srNo: txn.sr_no,
    bankCCName: txn.bank_card,
    branch: undefined,
    accNo: txn.account_name,
    ifscCode: undefined,
    transactions: allTxns.map((t) => ({
      date: t.date,
      bankName: t.swap_name ?? t.account_name ?? '',
      amount: t.total_amount ?? 0,
    })),
    totalAmount: allTxns.reduce((sum, t) => sum + (t.total_amount ?? 0), 0),
    status: txn.remarks ?? '',
  }
}
