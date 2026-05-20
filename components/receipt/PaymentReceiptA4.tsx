'use client'

import PaymentReceipt, { PaymentReceiptProps } from './PaymentReceipt'

interface PaymentReceiptA4Props {
  transactions: PaymentReceiptProps[]
}

const EMPTY_RECEIPT: PaymentReceiptProps = {
  name: '', mobileNo: '', srNo: '', bankCCName: '', branch: '',
  accNo: '', ifscCode: '', transactions: [], totalAmount: 0, status: '',
}

export default function PaymentReceiptA4({ transactions }: PaymentReceiptA4Props) {
  const slots: PaymentReceiptProps[] = [
    transactions[0] ?? EMPTY_RECEIPT,
    transactions[1] ?? EMPTY_RECEIPT,
    transactions[2] ?? EMPTY_RECEIPT,
    transactions[3] ?? EMPTY_RECEIPT,
  ]

  return (
    <div className="pr-a4">
      <PaymentReceipt {...slots[0]} />
      <div className="pr-cut"></div>
      <PaymentReceipt {...slots[1]} />
      <div className="pr-cut"></div>
      <PaymentReceipt {...slots[2]} />
      <div className="pr-cut"></div>
      <PaymentReceipt {...slots[3]} />
    </div>
  )
}
