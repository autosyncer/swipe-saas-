'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Transaction } from '@/types/database'
import { transactionToReceiptProps } from './useReceiptData'

const PaymentReceiptModal = dynamic(() => import('./PaymentReceiptModal'), { ssr: false })

interface PrintReceiptButtonProps {
  transaction: Transaction
  /** Other transactions for the same customer/day to include in the table */
  relatedTransactions?: Transaction[]
}

export default function PrintReceiptButton({ transaction, relatedTransactions = [] }: PrintReceiptButtonProps) {
  const [open, setOpen] = useState(false)
  const receiptData = transactionToReceiptProps(transaction, relatedTransactions)

  return (
    <>
      <button
        className="receipt-btn-print"
        style={{ fontSize: 11, padding: '3px 8px' }}
        onClick={() => setOpen(true)}
      >
        🖨 Receipt
      </button>

      {open && (
        <PaymentReceiptModal
          receiptData={receiptData}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
