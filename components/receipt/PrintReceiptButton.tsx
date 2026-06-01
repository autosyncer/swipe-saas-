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
  const [receiptData, setReceiptData] = useState<Awaited<ReturnType<typeof transactionToReceiptProps>> | null>(null)

  async function handleOpen() {
    const data = await transactionToReceiptProps(transaction, relatedTransactions)
    setReceiptData(data)
    setOpen(true)
  }

  return (
    <>
      <button
        className="receipt-btn-print"
        style={{ fontSize: 11, padding: '3px 8px' }}
        onClick={handleOpen}
      >
        🖨 Receipt
      </button>

      {open && receiptData && (
        <PaymentReceiptModal
          receiptData={receiptData}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
