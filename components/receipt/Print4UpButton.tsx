'use client'

import { useRef } from 'react'
import dynamic from 'next/dynamic'
import { createRoot } from 'react-dom/client'
import { Transaction } from '@/types/database'
import { transactionToReceiptProps } from './useReceiptData'

const PaymentReceiptA4 = dynamic(() => import('./PaymentReceiptA4'), { ssr: false })

interface Print4UpButtonProps {
  transactions: Transaction[]
}

export default function Print4UpButton({ transactions }: Print4UpButtonProps) {
  const last4 = transactions.slice(-4)
  const receiptProps = last4.map((t) => transactionToReceiptProps(t))

  const handlePrint = async () => {
    const { default: A4 } = await import('./PaymentReceiptA4')
    const win = window.open('', '_blank', 'width=900,height=700')
    if (!win) return

    // Copy all stylesheets into the new window
    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map(el => el.outerHTML)
      .join('\n')

    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">${styles}</head><body style="margin:0;padding:0;background:#fff"></body></html>`)
    win.document.close()

    const container = win.document.body
    const root = createRoot(container)
    root.render(<A4 transactions={receiptProps} />)

    // Wait for fonts/styles to load then print
    setTimeout(() => {
      win.focus()
      win.print()
      win.close()
    }, 600)
  }

  return (
    <button className="receipt-btn-print" onClick={handlePrint}>
      🖨 Print 4 Receipts
    </button>
  )
}
