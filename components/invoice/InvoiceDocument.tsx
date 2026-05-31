'use client'

import { useState } from 'react'
import { StoreSettings, DEFAULT_STORE } from '@/lib/store-settings'

export interface InvoiceDocItem {
  name: string
  unit: string
  qty: number
  price: number
  subtotal: number
}

export interface InvoiceDocProps {
  invoiceNumber: string
  date: string
  customerName: string
  customerAddress?: string
  consigneeName?: string
  consigneeAddress?: string
  buyerName?: string
  buyerAddress?: string
  items: InvoiceDocItem[]
  subtotal: number
  totalAmount: number
  remarks?: string | null
  paidBy?: string
  storeSettings?: StoreSettings
}

// ── Styles ───────────────────────────────────────────────────────────────────
const B  = '1px solid #000'
const F  = "'Arial', sans-serif"

function cell(extra?: React.CSSProperties): React.CSSProperties {
  return { border: B, padding: '3px 5px', fontSize: 11, fontFamily: F,
    verticalAlign: 'middle', ...extra }
}
function cellTop(extra?: React.CSSProperties): React.CSSProperties {
  return { ...cell(extra), verticalAlign: 'top' }
}

// Editable input — looks like plain text, click to type
function E({
  value, onChange, style, multiline, placeholder, bold, fontSize,
}: {
  value: string
  onChange: (v: string) => void
  style?: React.CSSProperties
  multiline?: boolean
  placeholder?: string
  bold?: boolean
  fontSize?: number
}) {
  const base: React.CSSProperties = {
    border: 'none',
    outline: 'none',
    background: 'transparent',
    fontFamily: F,
    fontSize: fontSize ?? 11,
    fontWeight: bold ? 'bold' : 'normal',
    color: '#000',
    width: '100%',
    padding: 0,
    margin: 0,
    resize: 'none',
    lineHeight: 1.4,
    ...style,
  }
  if (multiline) {
    const rows = Math.max(2, value.split('\n').length)
    return (
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        style={{ ...base, display: 'block', overflow: 'hidden' }}
        className="invoice-field"
      />
    )
  }
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={base}
      className="invoice-field"
    />
  )
}

// ── Number to Indian words ────────────────────────────────────────────────────
function toWords(n: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven',
    'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen',
    'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty',
    'Sixty', 'Seventy', 'Eighty', 'Ninety']
  function cvt(num: number): string {
    if (num === 0) return ''
    if (num < 20) return ones[num] + ' '
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '') + ' '
    if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred ' + cvt(num % 100)
    if (num < 100000) return cvt(Math.floor(num / 1000)) + 'Thousand ' + cvt(num % 1000)
    if (num < 10000000) return cvt(Math.floor(num / 100000)) + 'Lakh ' + cvt(num % 100000)
    return cvt(Math.floor(num / 10000000)) + 'Crore ' + cvt(num % 10000000)
  }
  const i = Math.floor(n), d = Math.round((n - i) * 100)
  let r = 'INR ' + cvt(i).trim()
  if (d > 0) r += ' and ' + cvt(d).trim() + ' Paise'
  return r + ' Only'
}

// ── Main component ────────────────────────────────────────────────────────────
export default function InvoiceDocument({
  invoiceNumber, date, customerName, customerAddress,
  consigneeName, consigneeAddress, buyerName, buyerAddress,
  items: initItems, subtotal: initSubtotal, totalAmount: initTotal, remarks: initRemarks,
  paidBy,
  storeSettings,
}: InvoiceDocProps) {
  const store = storeSettings ?? DEFAULT_STORE

  // Company / header fields
  const [companyName,  setCompanyName]  = useState(store.name)
  const [companyAddr,  setCompanyAddr]  = useState(store.address)
  const [invNo,        setInvNo]        = useState(invoiceNumber)
  const [invDate,      setInvDate]      = useState(date)
  const [delivNote,    setDelivNote]    = useState('')
  const [modeTerms,    setModeTerms]    = useState('')
  const [refNo,        setRefNo]        = useState('')
  const [otherRef,     setOtherRef]     = useState('')

  // Consignee / dispatch
  const [consigneeNameVal, setConsigneeName] = useState(consigneeName ?? customerName)
  const [consigneeAddr, setConsigneeAddr] = useState(consigneeAddress ?? customerAddress ?? '')
  const [buyerOrderNo,  setBuyerOrderNo]  = useState('')
  const [buyerOrderDt,  setBuyerOrderDt]  = useState('')
  const [dispatchDocNo, setDispatchDocNo] = useState('')
  const [delivNoteDate, setDelivNoteDate] = useState('')
  const [dispatchedThru,setDispatchedThru]= useState('Local Tempo')
  const [destination,   setDestination]   = useState('Surat')
  const [termsDelivery, setTermsDelivery] = useState('')

  // Buyer (Bill to)
  const [buyerNameVal, setBuyerName] = useState(buyerName ?? consigneeName ?? customerName)
  const [buyerAddr, setBuyerAddr] = useState(buyerAddress ?? consigneeAddress ?? customerAddress ?? '')

  // Items
  const [rows, setRows] = useState<{ name: string; qty: string; rate: string; per: string }[]>(
    initItems.length > 0
      ? initItems.map(i => ({ name: i.name, qty: String(i.qty), rate: String(i.price), per: i.unit }))
      : [{ name: '', qty: '', rate: '', per: 'kg' }]
  )

  // Remarks / footer
  const [paidByVal,   setPaidByVal]   = useState(paidBy ? `PAID BY ${paidBy}` : '')
  const [remarks,     setRemarks]     = useState(initRemarks ?? '')
  const [declaration, setDeclaration] = useState('We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.')
  const [bankName,    setBankName]    = useState(store.bankName)
  const [accNo,       setAccNo]       = useState(store.accNo)
  const [ifsc,        setIfsc]        = useState(store.ifsc)
  const [jurisdiction,setJurisdiction]= useState(store.jurisdiction)

  // Computed totals from rows
  const computedRows = rows.map(r => {
    const qty  = parseFloat(r.qty)  || 0
    const rate = parseFloat(r.rate) || 0
    return { ...r, qtyNum: qty, rateNum: rate, amount: qty * rate }
  })
  const computedSubtotal = computedRows.reduce((s, r) => s + r.amount, 0)
  // If initTotal < initSubtotal there's a discount; preserve that ratio if user hasn't changed prices
  const [manualTotal, setManualTotal] = useState(String(initTotal))
  const finalTotal   = parseFloat(manualTotal) || computedSubtotal
  const discount     = computedSubtotal - finalTotal
  const totalQty     = computedRows.reduce((s, r) => s + r.qtyNum, 0)
  const unit         = rows[0]?.per ?? ''

  function updateRow(i: number, key: string, val: string) {
    setRows(prev => { const next = [...prev]; (next[i] as Record<string, string>)[key] = val; return next })
  }
  function addRow() {
    setRows(prev => [...prev, { name: '', qty: '', rate: '', per: rows[rows.length - 1]?.per ?? 'kg' }])
  }
  function removeRow(i: number) {
    setRows(prev => prev.filter((_, j) => j !== i))
  }

  return (
    <>
      {/* Print style */}
      <style>{`
        .invoice-field:hover { background: #fffbeb !important; }
        .invoice-a4 { width: 210mm; min-height: 297mm; margin: 0 auto; box-sizing: border-box; }
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          body * { visibility: hidden; }
          .invoice-print-root, .invoice-print-root * { visibility: visible; }
          .invoice-print-root { position: fixed; top: 0; left: 0; width: 100%; }
          .invoice-field { background: transparent !important; }
          .no-print { display: none !important; }
          .invoice-a4 { width: 100%; min-height: unset; margin: 0; }
        }
      `}</style>

      <div className="invoice-print-root invoice-a4" style={{ border: B, fontFamily: F, fontSize: 11, color: '#000' }}>

        {/* Title */}
        <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: 14, letterSpacing: 3,
          padding: '5px 0', borderBottom: B }}>
          INVOICE
        </div>

        {/* Top block */}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td rowSpan={3} style={{ ...cellTop({ width: '38%' }), borderRight: B }}>
                <div style={{ fontWeight: 'bold', fontSize: 12, fontFamily: F }}>{companyName}</div>
                {companyAddr.split('\n').map((l, i) => <div key={i} style={{ fontFamily: F, fontSize: 11 }}>{l}</div>)}
              </td>
              <td style={{ ...cell({ width: '16%', color: '#444' }), borderRight: B }}>Invoice No.</td>
              <td style={{ ...cell({ width: '18%' }), borderRight: B }}>
                <E value={invNo} onChange={setInvNo} bold fontSize={13} placeholder="Invoice No." />
              </td>
              <td style={{ ...cell({ width: '12%', color: '#444' }), borderRight: B }}>Dated</td>
              <td style={cell({ width: '16%' })}>
                <E value={invDate} onChange={setInvDate} bold placeholder="Date" />
              </td>
            </tr>
            <tr>
              <td style={{ ...cell({ color: '#444' }), borderRight: B }}>Delivery Note</td>
              <td style={{ ...cell(), borderRight: B }}>
                <E value={delivNote} onChange={setDelivNote} placeholder="—" />
              </td>
              <td style={{ ...cell({ color: '#444' }), borderRight: B }}>Mode/Terms of Payment</td>
              <td style={cell()}>
                <E value={modeTerms} onChange={setModeTerms} placeholder="—" />
              </td>
            </tr>
            <tr>
              <td style={{ ...cell({ color: '#444' }), borderRight: B }}>Reference No. &amp; Date.</td>
              <td style={{ ...cell(), borderRight: B }}>
                <E value={refNo} onChange={setRefNo} placeholder="—" />
              </td>
              <td style={{ ...cell({ color: '#444' }), borderRight: B }}>Other References</td>
              <td style={cell()}>
                <E value={otherRef} onChange={setOtherRef} placeholder="—" />
              </td>
            </tr>
          </tbody>
        </table>

        {/* Consignee + dispatch */}
        <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: B }}>
          <tbody>
            <tr>
              <td rowSpan={4} style={{ ...cellTop({ width: '38%' }), borderRight: B }}>
                <div style={{ fontSize: 10, color: '#555', marginBottom: 2 }}>Consignee (Ship to)</div>
                <div style={{ fontWeight: 'bold', fontFamily: F }}>{consigneeNameVal}</div>
                {consigneeAddr.split('\n').map((l, i) => <div key={i} style={{ fontFamily: F, fontSize: 11 }}>{l}</div>)}
              </td>
              <td style={{ ...cell({ width: '16%', color: '#444' }), borderRight: B }}>Buyer's Order No.</td>
              <td style={{ ...cell({ width: '18%' }), borderRight: B }}>
                <E value={buyerOrderNo} onChange={setBuyerOrderNo} placeholder="—" />
              </td>
              <td style={{ ...cell({ width: '12%', color: '#444' }), borderRight: B }}>Dated</td>
              <td style={cell({ width: '16%' })}>
                <E value={buyerOrderDt} onChange={setBuyerOrderDt} placeholder="—" />
              </td>
            </tr>
            <tr>
              <td style={{ ...cell({ color: '#444' }), borderRight: B }}>Dispatch Doc No.</td>
              <td style={{ ...cell(), borderRight: B }}>
                <E value={dispatchDocNo} onChange={setDispatchDocNo} placeholder="—" />
              </td>
              <td style={{ ...cell({ color: '#444' }), borderRight: B }}>Delivery Note Date</td>
              <td style={cell()}>
                <E value={delivNoteDate} onChange={setDelivNoteDate} placeholder="—" />
              </td>
            </tr>
            <tr>
              <td style={{ ...cell({ color: '#444' }), borderRight: B }}>Dispatched through</td>
              <td style={{ ...cell(), borderRight: B }}>
                <E value={dispatchedThru} onChange={setDispatchedThru} bold placeholder="—" />
              </td>
              <td style={{ ...cell({ color: '#444' }), borderRight: B }}>Destination</td>
              <td style={cell()}>
                <E value={destination} onChange={setDestination} bold placeholder="—" />
              </td>
            </tr>
            <tr>
              <td colSpan={4} style={{ ...cell({ color: '#444' }), borderRight: B }}>
                Terms of Delivery&nbsp;
                <E value={termsDelivery} onChange={setTermsDelivery} placeholder="—"
                  style={{ display: 'inline', width: 'auto', minWidth: 100 }} />
              </td>
            </tr>
          </tbody>
        </table>

        {/* Buyer (Bill to) */}
        <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: B }}>
          <tbody>
            <tr>
              <td style={{ ...cellTop({ width: '38%', minHeight: 60 }), borderRight: B }}>
                <div style={{ fontSize: 10, color: '#555', marginBottom: 2 }}>Buyer (Bill to)</div>
                <div style={{ fontWeight: 'bold', fontFamily: F }}>{buyerNameVal}</div>
                {buyerAddr.split('\n').map((l, i) => <div key={i} style={{ fontFamily: F, fontSize: 11 }}>{l}</div>)}
              </td>
              <td style={cellTop()}></td>
            </tr>
          </tbody>
        </table>

        {/* Items table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: B }}>
          <colgroup>
            <col style={{ width: '5%' }} /><col style={{ width: '42%' }} />
            <col style={{ width: '15%' }} /><col style={{ width: '11%' }} />
            <col style={{ width: '8%' }} /><col style={{ width: '15%' }} />
            <col style={{ width: '4%' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ ...cell({ textAlign: 'center', fontWeight: 'normal' }), borderRight: B }}>Sl<br />No.</th>
              <th style={{ ...cell({ textAlign: 'center', fontWeight: 'normal' }), borderRight: B }}>Description of Goods</th>
              <th style={{ ...cell({ textAlign: 'center', fontWeight: 'normal' }), borderRight: B }}>Quantity</th>
              <th style={{ ...cell({ textAlign: 'center', fontWeight: 'normal' }), borderRight: B }}>Rate</th>
              <th style={{ ...cell({ textAlign: 'center', fontWeight: 'normal' }), borderRight: B }}>per</th>
              <th style={{ ...cell({ textAlign: 'center', fontWeight: 'normal' }), borderRight: B }}>Amount</th>
              <th className="no-print" style={cell({ border: 'none', background: '#fafafa' })}></th>
            </tr>
          </thead>
          <tbody>
            {computedRows.map((row, i) => (
              <tr key={i}>
                <td style={{ ...cell({ textAlign: 'center' }), borderRight: B }}>{i + 1}</td>
                <td style={{ ...cell({ fontWeight: 'bold' }), borderRight: B }}>
                  <E value={row.name} onChange={v => updateRow(i, 'name', v)}
                    bold placeholder="Item description" style={{ textTransform: 'uppercase' }} />
                </td>
                <td style={{ ...cell({ textAlign: 'center' }), borderRight: B }}>
                  <E value={row.qty} onChange={v => updateRow(i, 'qty', v)}
                    placeholder="0" style={{ textAlign: 'center' }} />
                  <E value={row.per} onChange={v => updateRow(i, 'per', v)}
                    placeholder="kg" style={{ textAlign: 'center' }} />
                </td>
                <td style={{ ...cell({ textAlign: 'center' }), borderRight: B }}>
                  <E value={row.rate} onChange={v => updateRow(i, 'rate', v)}
                    placeholder="0.00" style={{ textAlign: 'center' }} />
                </td>
                <td style={{ ...cell({ textAlign: 'center' }), borderRight: B }}>
                  <E value={row.per} onChange={v => updateRow(i, 'per', v)} placeholder="kg" style={{ textAlign: 'center' }} />
                </td>
                <td style={{ ...cell({ textAlign: 'center', fontWeight: 'bold' }), borderRight: B }}>
                  {row.amount > 0 ? row.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : ''}
                </td>
                <td className="no-print" style={{ border: 'none', textAlign: 'center', paddingLeft: 2 }}>
                  {rows.length > 1 && (
                    <button onClick={() => removeRow(i)}
                      style={{ color: '#ef4444', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>
                      ×
                    </button>
                  )}
                </td>
              </tr>
            ))}

            {/* Discount row */}
            {discount > 0.01 && (
              <tr>
                <td style={{ ...cell(), borderRight: B }}></td>
                <td colSpan={4} style={{ ...cell({ textAlign: 'right' }), borderRight: B }}>
                  <em style={{ fontSize: 10 }}>Less : </em>
                  <strong>Discount on Sale</strong>
                </td>
                <td style={{ ...cell({ textAlign: 'right', fontWeight: 'bold' }), borderRight: B }}>
                  (-){discount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </td>
                <td className="no-print" style={{ border: 'none' }}></td>
              </tr>
            )}

            {/* Spacer rows */}
            {Array.from({ length: Math.max(0, 3 - rows.length - (discount > 0.01 ? 1 : 0)) }).map((_, i) => (
              <tr key={`sp${i}`}>
                <td style={{ ...cell({ height: 22 }), borderRight: B }}></td>
                <td style={{ ...cell(), borderRight: B }}></td>
                <td style={{ ...cell(), borderRight: B }}></td>
                <td style={{ ...cell(), borderRight: B }}></td>
                <td style={{ ...cell(), borderRight: B }}></td>
                <td style={{ ...cell(), borderRight: B }}></td>
                <td className="no-print" style={{ border: 'none' }}></td>
              </tr>
            ))}

            {/* Total row */}
            <tr>
              <td style={{ ...cell({ borderTop: B }), borderRight: B }}></td>
              <td style={{ ...cell({ textAlign: 'center', borderTop: B }), borderRight: B }}>Total</td>
              <td style={{ ...cell({ textAlign: 'center', fontWeight: 'bold', borderTop: B }), borderRight: B }}>
                {totalQty > 0 ? totalQty.toLocaleString('en-IN') : ''} {unit}
              </td>
              <td style={{ ...cell({ borderTop: B }), borderRight: B }}></td>
              <td style={{ ...cell({ borderTop: B }), borderRight: B }}></td>
              <td style={{ ...cell({ textAlign: 'center', fontWeight: 'bold', fontSize: 12, borderTop: B }), borderRight: B }}>
                ₹&nbsp;
                <input
                  type="text"
                  value={manualTotal}
                  onChange={e => setManualTotal(e.target.value)}
                  className="invoice-field"
                  style={{ border: 'none', outline: 'none', background: 'transparent', fontFamily: F,
                    fontSize: 12, fontWeight: 'bold', width: 90, textAlign: 'center', padding: 0 }}
                />
              </td>
              <td className="no-print" style={{ border: 'none' }}></td>
            </tr>
          </tbody>
        </table>

        {/* Add row button */}
        <div className="no-print" style={{ padding: '4px 6px', borderTop: B, borderLeft: B, borderRight: B }}>
          <button onClick={addRow}
            style={{ fontSize: 11, color: '#6366f1', background: 'none', border: 'none',
              cursor: 'pointer', padding: '2px 6px' }}>
            + Add Row
          </button>
        </div>

        {/* Amount in words */}
        <div style={{ borderTop: B, padding: '4px 6px', display: 'flex', justifyContent: 'space-between' }}>
          <span>Amount Chargeable (in words)</span>
          <em>E. &amp; O.E</em>
        </div>
        <div style={{ borderTop: B, padding: '4px 6px 8px', fontWeight: 'bold' }}>
          {toWords(finalTotal)}
        </div>

        {/* Remarks */}
        <div style={{ borderTop: B, padding: '5px 6px 20px' }}>
          <div style={{ fontStyle: 'italic', fontSize: 10, marginBottom: 4 }}>Remarks:</div>
          {paidByVal && <div style={{ fontWeight: 'bold', fontFamily: F, marginBottom: 3 }}>{paidByVal}</div>}
          <E value={typeof remarks === 'string' ? remarks : ''} onChange={v => setRemarks(v)} multiline placeholder="Additional remarks..." />
        </div>

        {/* Declaration + Bank details */}
        <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: B }}>
          <tbody>
            <tr>
              <td style={{ ...cellTop({ width: '50%' }), borderRight: B }}>
                <div style={{ fontStyle: 'italic', marginBottom: 3 }}>Declaration</div>
                <E value={declaration} onChange={setDeclaration} multiline
                  style={{ fontSize: 10, lineHeight: 1.4 }} />
              </td>
              <td style={cellTop()}>
                <div style={{ marginBottom: 4 }}>Company's Bank Details</div>
                <div style={{ marginBottom: 2 }}>
                  <span style={{ fontSize: 10 }}>Bank Name : </span>
                  <strong>{bankName}</strong>
                </div>
                <div style={{ marginBottom: 2 }}>
                  <span style={{ fontSize: 10 }}>A/c No. : </span>
                  <strong>{accNo}</strong>
                </div>
                <div>
                  <span style={{ fontSize: 10 }}>Branch &amp; IFS Code: </span>
                  <strong>{ifsc}</strong>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Signature row */}
        <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: B }}>
          <tbody>
            <tr>
              <td style={{ ...cell({ width: '50%', height: 55, verticalAlign: 'bottom' }), borderRight: B }}>
                Customer's Seal and Signature
              </td>
              <td style={cell({ verticalAlign: 'bottom', textAlign: 'right' })}>
                <div>for <strong>{companyName}</strong></div>
                <div style={{ marginTop: 26 }}>Authorised Signatory</div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Footer */}
        <div style={{ textAlign: 'center', padding: '4px 6px', fontSize: 10 }}>
          <E value={jurisdiction} onChange={setJurisdiction} style={{ textAlign: 'center' }} />
        </div>
        <div style={{ textAlign: 'center', padding: '2px 0 4px', fontSize: 10, borderTop: B }}>
          This is a Computer Generated Invoice
        </div>
      </div>
    </>
  )
}
