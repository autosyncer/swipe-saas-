'use client'

export interface ReceiptTransaction {
  date: string
  bankName: string
  amount: number
}

export interface PaymentReceiptProps {
  name?: string
  mobileNo?: string
  srNo?: string | number
  bankCCName?: string
  branch?: string
  accNo?: string
  ifscCode?: string
  transactions: ReceiptTransaction[]
  totalAmount: number
  status: string
}

export default function PaymentReceipt({
  name,
  mobileNo,
  srNo,
  bankCCName,
  branch,
  accNo,
  ifscCode,
  transactions,
  totalAmount,
  status,
}: PaymentReceiptProps) {
  // Always show at least 2 data rows + pad to 2 minimum empty rows
  const dataRows = transactions.length > 0 ? transactions : []
  const emptyCount = Math.max(0, 2 - dataRows.length)

  return (
    <div className="pr-receipt">

      <div className="pr-title-row">PAYMENT RECEIPT</div>

      <div className="pr-info-section">
        <div className="pr-info-left">
          <div><span className="pr-info-label">Name:</span> {name}</div>
          <div><span className="pr-info-label">Mobile No:</span> {mobileNo}</div>
          <div><span className="pr-info-label">SR No:</span> {srNo}</div>
        </div>
        <div className="pr-info-right">
          <div><span className="pr-info-label">Bank / CC Name:</span> {bankCCName}</div>
          <div><span className="pr-info-label">Branch:</span> {branch}</div>
          <div><span className="pr-info-label">AC/CC No:</span> {accNo}</div>
          <div><span className="pr-info-label">IFSC Code:</span> {ifscCode}</div>
        </div>
      </div>

      <div className="pr-table-section">
        <table className="pr-table">
          <thead>
            <tr>
              <th style={{ width: '22%' }}>Dates</th>
              <th style={{ width: '46%' }}>Bank Name</th>
              <th style={{ width: '32%' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {dataRows.map((t, i) => (
              <tr key={i}>
                <td>{t.date}</td>
                <td>{t.bankName}</td>
                <td>{t.amount ? `₹${t.amount.toLocaleString('en-IN')}` : ''}</td>
              </tr>
            ))}
            {Array.from({ length: emptyCount }).map((_, i) => (
              <tr key={`e${i}`} className="pr-empty">
                <td></td><td></td><td></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pr-status-row">
        <span className="pr-status"><strong>Status:</strong> {status}</span>
        <span className="pr-total">
          <strong>Total Amount:</strong> {totalAmount ? `₹${totalAmount.toLocaleString('en-IN')}` : ''}
        </span>
      </div>

      <div className="pr-sign-row">
        <div className="pr-sign-block">
          <div className="pr-sign-line"></div>
          <div className="pr-sign-label">Reciever Sign</div>
        </div>
        <div className="pr-sign-block-right">
          <div className="pr-sign-line"></div>
          <div className="pr-sign-label">Signature</div>
        </div>
      </div>

    </div>
  )
}
