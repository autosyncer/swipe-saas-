// Canonical form fields and built-in sheet definitions shared across
// the mapping page and the useSheets hook seed function.

export interface FormFieldDef {
  id: string
  label: string
  type: string
}

export interface ColumnDef {
  id: string
  label: string
}

export interface SheetDef {
  id: string
  label: string
  themeColor: string
  columns: ColumnDef[]
}

export const FORM_FIELDS: FormFieldDef[] = [
  // ── Transaction core ──────────────────────────────────────────────────────
  { id: 'sr_no',              label: 'SR No',               type: 'number' },
  { id: 'date',               label: 'Date',                type: 'date'   },
  { id: 'customer_name',      label: 'Customer Name',       type: 'text'   },
  { id: 'bank_card',          label: 'Bank Card',           type: 'text'   },
  { id: 'total_amount',       label: 'Total Amount',        type: 'number' },
  { id: 'paid_amount',        label: 'Paid Amount',         type: 'number' },
  { id: 'difference',         label: 'Difference',          type: 'number' },
  { id: 'account_name',       label: 'Account Name',        type: 'select' },
  { id: 'swap_amount',        label: 'Swap Amount',         type: 'number' },
  { id: 'swap_name',          label: 'Swap Name',           type: 'text'   },
  { id: 'remarks',            label: 'Remarks / Status',    type: 'select' },
  { id: 'status',             label: 'Status',              type: 'select' },
  { id: 'commission_pct',     label: 'Commission %',        type: 'number' },
  { id: 'commission_amount',  label: 'Commission Amount',   type: 'number' },
  // ── Customer details ─────────────────────────────────────────────────────
  { id: 'customer_phone',       label: 'Customer Phone',       type: 'text'   },
  { id: 'outstanding_balance',  label: 'Outstanding Balance',  type: 'number' },
  // ── Card details ─────────────────────────────────────────────────────────
  { id: 'card_last4',     label: 'Card Last 4',      type: 'text' },
  { id: 'card_bank_name', label: 'Card Bank Name',   type: 'text' },
  { id: 'card_nickname',  label: 'Card Nickname',    type: 'text' },
  // ── Bank account details (auto-filled from selected account) ─────────────
  { id: 'acct_bank_name',       label: 'Acct Bank Name',       type: 'text'   },
  { id: 'acct_type',            label: 'Acct Type',            type: 'text'   },
  { id: 'acct_number',          label: 'Acct Number',          type: 'text'   },
  { id: 'acct_ifsc',            label: 'Acct IFSC Code',       type: 'text'   },
  { id: 'acct_branch',          label: 'Acct Branch',          type: 'text'   },
  { id: 'acct_commission_pct',  label: 'Acct Commission %',    type: 'number' },
  { id: 'acct_commission_type', label: 'Acct Commission Type', type: 'text'   },
  { id: 'acct_contact_person',  label: 'Acct Contact Person',  type: 'text'   },
  { id: 'acct_contact_phone',   label: 'Acct Contact Phone',   type: 'text'   },
  { id: 'acct_current_balance', label: 'Acct Current Balance', type: 'number' },
  // ── Swap machine details (auto-filled from swap_name match) ──────────────
  { id: 'machine_tid',          label: 'Machine TID',          type: 'text'   },
  { id: 'machine_type',         label: 'Machine Type',         type: 'text'   },
  { id: 'machine_agent_code',   label: 'Machine Agent Code',   type: 'text'   },
  { id: 'machine_bank_comm_pct',label: 'Machine Bank MDR %',   type: 'number' },
  { id: 'machine_account',      label: 'Machine Account',      type: 'text'   },
]

export const BUILT_IN_SHEETS: SheetDef[] = [
  {
    id: 'sheet_daily',
    label: 'Daily Register',
    themeColor: '#3ECF8E',
    columns: [
      { id: 'sr_no', label: 'SR NO' },
      { id: 'date', label: 'DATE' },
      { id: 'customer_name', label: 'CUSTOMER NAME' },
      { id: 'bank_card', label: 'BANK CARD' },
      { id: 'total_amount', label: 'TOTAL AMOUNT' },
      { id: 'paid_amount', label: 'PAID AMOUNT' },
      { id: 'account_name', label: 'A/C NAME' },
      { id: 'swap_amount', label: 'SWAP AMOUNT' },
      { id: 'swap_name', label: 'SWAP NAME' },
      { id: 'difference', label: 'DIFFERENCE' },
      { id: 'remarks', label: 'REMARKS' },
      { id: 'status', label: 'STATUS' },
      { id: 'commission_pct', label: 'COMM %' },
      { id: 'commission_amount', label: 'COMM AMT' },
    ],
  },
  {
    id: 'sheet_ac',
    label: 'AC Sheet',
    themeColor: '#3b82f6',
    columns: [
      { id: 'date', label: 'DATE' },
      { id: 'account_name', label: 'ACCOUNT' },
      { id: 'open_bal', label: 'OPEN BAL' },
      { id: 'bal_recd', label: 'BAL RECD' },
      { id: 'trn_bal_recd', label: 'TRN BAL' },
      { id: 'avai_bal', label: 'AVAI BAL' },
      { id: 'atm_withd', label: 'ATM WITHD' },
      { id: 'withd', label: 'WITHD' },
      { id: 'transf', label: 'TRANSF' },
      { id: 'cc_pay', label: 'CC PAY' },
      { id: 'cust_trf', label: 'CUST TRF' },
      { id: 'charges', label: 'CHARGES' },
      { id: 'closing_bal', label: 'CLOSING BAL' },
    ],
  },
  {
    id: 'sheet_cc',
    label: 'CC Sheet',
    themeColor: '#f59e0b',
    columns: [
      { id: 'date', label: 'DATE' },
      { id: 'tid', label: 'TID' },
      { id: 'firm_name', label: 'FIRM NAME' },
      { id: 'swipe_amount', label: 'SWIPE AMOUNT' },
      { id: 'charges_deducted', label: 'CHARGES' },
      { id: 'net_received', label: 'NET RECEIVED' },
      { id: 'customer_name', label: 'CUSTOMER' },
    ],
  },
  {
    id: 'sheet_bl',
    label: 'BL Sheet',
    themeColor: '#8b5cf6',
    columns: [
      { id: 'date', label: 'DATE' },
      { id: 'credited_account', label: 'CR ACCOUNT' },
      { id: 'credited_amount', label: 'CR AMOUNT' },
      { id: 'debited_account', label: 'DR ACCOUNT' },
      { id: 'debited_amount', label: 'DR AMOUNT' },
      { id: 'reference', label: 'REFERENCE' },
      { id: 'pending', label: 'PENDING' },
      { id: 'firm_name', label: 'FIRM' },
    ],
  },
]
