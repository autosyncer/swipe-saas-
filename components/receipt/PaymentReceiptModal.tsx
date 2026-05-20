'use client'

import { useEffect, useRef } from 'react'
import PaymentReceipt, { PaymentReceiptProps } from './PaymentReceipt'

interface PaymentReceiptModalProps {
  receiptData: PaymentReceiptProps
  onClose: () => void
}

export default function PaymentReceiptModal({ receiptData, onClose }: PaymentReceiptModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      ref={overlayRef}
      className="receipt-modal-overlay"
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="receipt-modal-box">
        <div className="receipt-modal-actions no-print">
          <button className="receipt-btn-print" onClick={() => window.print()}>
            🖨 Print
          </button>
          <button className="receipt-btn-close" onClick={onClose}>✕ Close</button>
        </div>
        <div id="receipt-print-area">
          <PaymentReceipt {...receiptData} />
        </div>
      </div>
    </div>
  )
}
