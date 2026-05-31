import { supabase } from '@/lib/supabase'

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function fmtDate(d: string) {
  const [y, m, day] = d.split('-')
  return `${parseInt(day)}/${parseInt(m)}/${y.slice(2)}`
}

// ── Download helper ───────────────────────────────────────────────────────────
function downloadBuffer(buffer: ArrayBuffer, filename: string) {
  const url = URL.createObjectURL(new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

// ── AC Sheet Export ───────────────────────────────────────────────────────────
export async function downloadAcSheet(date: string) {
  const ExcelJS = (await import('exceljs')).default

  const { data: rows } = await supabase
    .from('ac_sheet')
    .select('*')
    .eq('date', date)
    .order('account_name')

  const COL_HEADERS = [
    { key: 'account_name',       label: 'Account' },
    { key: 'open_bal',           label: 'Opening\nBal' },
    { key: 'bal_recd',           label: 'Bal\nRecd' },
    { key: 'same_day_bal_paytm', label: 'Paytm' },
    { key: 'same_day_bal_finkeda',label: 'Finkeda' },
    { key: 'same_day_bal_qr',    label: 'QR' },
    { key: 'same_day_bal',       label: 'Same\nDay' },
    { key: 'trn_bal_recd',       label: 'TRN Bal\nRecd' },
    { key: 'avai_bal',           label: 'Avail\nBal' },
    { key: 'atm_withd',          label: 'ATM\nWithd' },
    { key: 'withd',              label: 'Withd' },
    { key: 'transf',             label: 'Transf' },
    { key: 'cc_pay',             label: 'CC Pay' },
    { key: 'cust_trf',           label: 'Cust\nTrf' },
    { key: 'charges',            label: 'Charges' },
    { key: 'closing_bal',        label: 'Closing\nBal' },
  ]

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('AC Sheet')
  const thin = { style: 'thin' as const }
  const border = { top: thin, left: thin, bottom: thin, right: thin }

  ws.columns = COL_HEADERS.map(c => ({
    width: c.key === 'account_name' ? 16 : 13,
  }))

  // Title row
  ws.mergeCells(1, 1, 1, COL_HEADERS.length)
  const titleCell = ws.getCell(1, 1)
  titleCell.value = `AC Sheet — ${fmtDate(date)}`
  titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } }
  titleCell.border = border
  ws.getRow(1).height = 24

  // Header row
  COL_HEADERS.forEach((col, i) => {
    const cell = ws.getCell(2, i + 1)
    cell.value = col.label
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E6DA4' } }
    cell.border = border
  })
  ws.getRow(2).height = 30

  // Data rows
  ;(rows || []).forEach((row, ri) => {
    const r = row as Record<string, unknown>
    ws.getRow(ri + 3).height = 18
    COL_HEADERS.forEach((col, ci) => {
      const cell = ws.getCell(ri + 3, ci + 1)
      const val = r[col.key]
      const isNum = col.key !== 'account_name'
      cell.value = isNum ? (Number(val) || 0) : String(val || '')
      cell.font = { size: 11, bold: ['avai_bal','closing_bal','account_name'].includes(col.key) }
      cell.alignment = { horizontal: isNum ? 'right' : 'left', vertical: 'middle' }
      cell.border = border
      cell.numFmt = isNum ? '#,##0' : '@'
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
      if (col.key === 'avai_bal')
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } }
      if (col.key === 'closing_bal') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: Number(val) >= 0 ? 'FFC6EFCE' : 'FFFFC7CE' } }
        cell.font = { bold: true, size: 11, color: { argb: Number(val) >= 0 ? 'FF375623' : 'FF9C0006' } }
      }
    })
  })

  const buf = await wb.xlsx.writeBuffer()
  downloadBuffer(buf, `AC_Sheet_${date}.xlsx`)
}

// ── Chamunda Sheet Export ─────────────────────────────────────────────────────
export async function downloadChamundaSheet(date: string) {
  const ExcelJS = (await import('exceljs')).default

  const [{ data: sheetData }, { data: l15Data }] = await Promise.all([
    supabase.from('chamunda_sheet').select('*').eq('date', date).order('sort_order'),
    supabase.from('l15_entries').select('*').eq('date', date).order('created_at'),
  ])

  const rows = (sheetData || []) as Record<string, unknown>[]
  const l15  = (l15Data  || []) as Record<string, unknown>[]

  const dOpeningRows = rows.filter(r => ['opening_cash','opening_hdfc','opening_l15','opening_person'].includes(String(r.row_type)))
  const dTxRows      = rows.filter(r => r.row_type === 'transaction')
  const dExpRows     = rows.filter(r => r.row_type === 'expense' && Number(r.expense_amount) > 0)

  const totalCashIn    = dOpeningRows.reduce((s, r) => s + (Number(r.opening_amount) || 0), 0)
  const totalPaidOut   = dTxRows.reduce((s, r) => s + (Number(r.paid_in_cash) || 0), 0)
  const totalExpenses  = dExpRows.reduce((s, r) => s + (Number(r.expense_amount) || 0), 0)
  const closingBalance = totalCashIn + totalPaidOut - totalExpenses

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Chamunda Sheet')

  const thin = { style: 'thin' as const }
  const border = { top: thin, left: thin, bottom: thin, right: thin }
  const yellow = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFFF00' } }
  const white  = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFFFFF' } }
  const ctr    = { horizontal: 'center' as const, vertical: 'middle' as const }
  const bold   = { bold: true, name: 'Calibri', size: 11 }
  const normal = { bold: false, name: 'Calibri', size: 11 }
  const COLS   = ['A','B','C','D','E','F','G','H','I','J']
  const numFmt = '#,##0'

  ws.columns = [
    { width: 10 }, { width: 22 }, { width: 14 }, { width: 28 },
    { width: 14 }, { width: 14 }, { width: 11 }, { width: 18 }, { width: 18 }, { width: 14 },
  ]

  function styleRow(row: import('exceljs').Row) {
    COLS.forEach(c => {
      row.getCell(c).border = border
      row.getCell(c).fill = white
      row.getCell(c).alignment = ctr
      row.getCell(c).font = normal
    })
  }
  function addRow() { const r = ws.addRow(['','','','','','','','','','']); styleRow(r); return r }

  // Title
  const tRowNum = ws.rowCount + 1
  ws.addRow([`"Shree Ganeshay Namah"  —  DT ${fmtDate(date)}`,...Array(9).fill('')])
  ws.mergeCells(tRowNum, 1, tRowNum, 10)
  const tRow = ws.getRow(tRowNum)
  tRow.height = 22
  tRow.getCell(1).fill = yellow
  tRow.getCell(1).font = { bold: true, name: 'Calibri', size: 13 }
  tRow.getCell(1).alignment = ctr
  tRow.getCell(1).border = border
  for (let c = 2; c <= 10; c++) { tRow.getCell(c).border = border; tRow.getCell(c).fill = yellow }

  // Header
  const hRowNum = ws.rowCount + 1
  ws.addRow(['DT','OPENING BAL','Amount','NAME','Paid in Cash','Swap Amount','COMM','Swap Firm Name','TRF Firm Name','Cash/GP Recd'])
  const hRow = ws.getRow(hRowNum)
  hRow.height = 18
  COLS.forEach(c => { hRow.getCell(c).fill = yellow; hRow.getCell(c).font = bold; hRow.getCell(c).border = border; hRow.getCell(c).alignment = ctr })

  // Opening rows
  dOpeningRows.forEach(row => {
    const isL15 = row.row_type === 'opening_l15'
    const r = addRow()
    r.getCell('B').value = String(row.opening_name || '')
    r.getCell('B').font = row.row_type === 'opening_cash' ? bold : normal
    if (!isL15 && row.opening_amount != null) {
      r.getCell('C').value = Number(row.opening_amount)
      r.getCell('C').numFmt = numFmt
      r.getCell('C').font = bold
    }
    if (isL15) {
      l15.forEach(e => {
        const sub = addRow()
        sub.getCell('B').value = String(e.customer_name || '')
        sub.getCell('C').value = Number(e.amount || 0)
        sub.getCell('C').numFmt = numFmt
      })
    }
  })

  // Gap
  for (let i = 0; i < 5; i++) { const r = addRow(); r.height = 16 }

  // Transactions
  const machineMap = new Map<string, Record<string, unknown>[]>()
  dTxRows.forEach(r => { const k = String(r.machine_name||''); if(!machineMap.has(k)) machineMap.set(k,[]); machineMap.get(k)!.push(r) })
  Array.from(machineMap.entries()).forEach(([, txRows], mgi) => {
    if (mgi > 0) { const r = addRow(); r.height = 16 }
    txRows.forEach(row => {
      const r = addRow()
      r.getCell('D').value = `DR ${(Number(row.bank_charge_pct)||3).toFixed(2)} ${String(row.name||'').trim()}`
      if (row.paid_in_cash) { r.getCell('E').value = Number(row.paid_in_cash); r.getCell('E').numFmt = numFmt }
      if (row.swap_amount)  { r.getCell('F').value = Number(row.swap_amount);  r.getCell('F').numFmt = numFmt }
      r.getCell('G').value = String(row.commission_type || '')
      r.getCell('H').value = String(row.machine_name || '')
      r.getCell('H').fill  = yellow
      r.getCell('H').font  = { bold: true, name: 'Calibri', size: 11, color: { argb: 'FFFF0000' } }
      r.getCell('I').value = String(row.trf_firm_name || '')
      if (row.cash_gp_recd) { r.getCell('J').value = Number(row.cash_gp_recd); r.getCell('J').numFmt = numFmt }
    })
  })

  // Gap
  for (let i = 0; i < 5; i++) { const r = addRow(); r.height = 16 }

  // Expenses
  if (dExpRows.length > 0) {
    dExpRows.forEach(row => {
      const r = addRow()
      r.getCell('D').value = `DR ${String(row.expense_name||'')}`
      if (row.expense_amount) { r.getCell('E').value = Number(row.expense_amount); r.getCell('E').numFmt = numFmt; r.getCell('E').font = bold }
      r.getCell('G').value = String(row.expense_note || '')
    })
    for (let i = 0; i < 5; i++) { const r = addRow(); r.height = 16 }
  }

  // Total row
  const tr = addRow()
  tr.getCell('B').value = 'TOTAL / CLOSING'; tr.getCell('B').fill = yellow; tr.getCell('B').font = bold
  tr.getCell('C').value = totalCashIn;   tr.getCell('C').numFmt = numFmt; tr.getCell('C').font = bold
  tr.getCell('C').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDFBE7' } }
  tr.getCell('E').value = totalPaidOut;  tr.getCell('E').numFmt = numFmt; tr.getCell('E').font = bold
  tr.getCell('E').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDFBE7' } }
  tr.getCell('F').value = closingBalance; tr.getCell('F').numFmt = numFmt
  tr.getCell('F').fill = yellow
  tr.getCell('F').font = { bold: true, name: 'Calibri', size: 12, color: { argb: closingBalance >= 0 ? 'FF000000' : 'FFFF0000' } }

  const buf = await wb.xlsx.writeBuffer()
  downloadBuffer(buf, `Chamunda_Sheet_${date}.xlsx`)
}

// ── Export both for date range ────────────────────────────────────────────────
export async function downloadBothSheets(date: string) {
  await Promise.all([
    downloadAcSheet(date),
    downloadChamundaSheet(date),
  ])
}
