export interface Transaction {
  id: string
  sr_no: number
  date: string
  customer_name: string
  bank_card: string
  total_amount: number
  paid_amount: number
  account_name: string
  swap_amount: number
  swap_name: string
  difference: number | null
  remarks: string
  created_at?: string
}

export interface Customer {
  id: string
  name: string
  phone: string
  address?: string
  consignee_name?: string
  consignee_address?: string
  buyer_name?: string
  buyer_address?: string
  default_charge_pct: number
  outstanding_balance: number
  created_at?: string
}

export interface Card {
  id: string
  customer_id: string
  card_nickname?: string
  bank_name: string
  card_number?: string
  last4: string
  pin?: string
  cvv?: string
  expiry?: string
  due_date?: string
  card_type?: string
  is_active?: boolean
}

export interface CustomerBankAccount {
  id: string
  customer_id: string
  bank_name: string
  account_number: string
  ifsc_code: string
  branch?: string
  account_type: string
  created_at?: string
}
