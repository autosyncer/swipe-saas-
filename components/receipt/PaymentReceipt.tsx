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

const B = '1px solid #000'
const F = "'Courier New', Courier, monospace"

function td(extra?: React.CSSProperties): React.CSSProperties {
  return { border: B, padding: '5px 8px', fontSize: 11, fontFamily: F, verticalAlign: 'middle' as const, ...extra }
}

export default function PaymentReceipt({
  name, mobileNo, srNo, bankCCName, branch, accNo, ifscCode,
  transactions, totalAmount, status,
}: PaymentReceiptProps) {
  const dataRows = transactions.length > 0 ? transactions : []

  // 4 cols: [18%, 32%, 18%, 32%]
  // Transaction rows use: date=col1, bankName=col2+col3 (colspan2), amount=col4

  return (
    <div style={{ border: B, fontFamily: F, fontSize: 11, color: '#000' }}>

      {/* Title */}
      <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: 13, letterSpacing: 2, padding: '6px 0', borderBottom: B }}>
        PAYMENT RECEIPT
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <colgroup>
          <col style={{ width: '18%' }} />
          <col style={{ width: '32%' }} />
          <col style={{ width: '18%' }} />
          <col style={{ width: '32%' }} />
        </colgroup>
        <tbody>

          {/* Detail rows */}
          <tr>
            <td style={td({ fontWeight: 'bold' })}>Name</td>
            <td style={td()}>{name || '—'}</td>
            <td style={td({ fontWeight: 'bold' })}>Bank / CC Name</td>
            <td style={td()}>{bankCCName || '—'}</td>
          </tr>
          <tr>
            <td style={td({ fontWeight: 'bold' })}>Mobile No</td>
            <td style={td()}>{mobileNo || '—'}</td>
            <td style={td({ fontWeight: 'bold' })}>Branch</td>
            <td style={td()}>{branch || '—'}</td>
          </tr>
          <tr>
            <td style={td({ fontWeight: 'bold' })}>SR No</td>
            <td style={td()}>{srNo || '—'}</td>
            <td style={td({ fontWeight: 'bold' })}>AC / CC No</td>
            <td style={td()}>{accNo || '—'}</td>
          </tr>
          <tr>
            <td style={td()}></td>
            <td style={td()}></td>
            <td style={td({ fontWeight: 'bold' })}>IFSC Code</td>
            <td style={td()}>{ifscCode || '—'}</td>
          </tr>

        </tbody>
      </table>

      {/* One table per entry */}
      {dataRows.map((t, i) => (
        <table key={i} style={{ width: '100%', borderCollapse: 'collapse', borderTop: B }}>
          <colgroup>
            <col style={{ width: '18%' }} />
            <col style={{ width: '32%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '32%' }} />
          </colgroup>
          <tbody>
            <tr>
              <td style={td({ fontWeight: 'bold', textAlign: 'center', background: '#f0f0f0' })}>Date</td>
              <td colSpan={2} style={td({ fontWeight: 'bold', textAlign: 'center', background: '#f0f0f0' })}>Bank Name</td>
              <td style={td({ fontWeight: 'bold', textAlign: 'center', background: '#f0f0f0' })}>Amount</td>
            </tr>
            <tr>
              <td style={td({ textAlign: 'center' })}>{t.date}</td>
              <td colSpan={2} style={td({ textAlign: 'center' })}>{t.bankName}</td>
              <td style={td({ textAlign: 'center', fontWeight: 'bold' })}>{t.amount ? `₹${t.amount.toLocaleString('en-IN')}` : ''}</td>
            </tr>
          </tbody>
        </table>
      ))}

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', borderTop: B, fontSize: 11, fontFamily: F }}>
        <span><strong>Status:</strong> {status}</span>
        <span><strong>Total Amount:</strong> {totalAmount ? `₹${totalAmount.toLocaleString('en-IN')}` : '—'}</span>
      </div>

      {/* Signatures */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 10px 8px', fontSize: 11, fontFamily: F }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ width: 120, borderBottom: B }}></div>
          <span>Receiver Sign</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <div style={{ width: 120, borderBottom: B }}></div>
          <span>Signature</span>
        </div>
      </div>

    </div>
  )
}
