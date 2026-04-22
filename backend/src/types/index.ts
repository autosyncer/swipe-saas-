export interface Customer {
  id: string
  name: string
  phone: string | null
  address: string | null
  default_charge_pct: number
  outstanding_balance: number
  created_at: string
  cards?: Card[]
}

export interface Card {
  id: string
  customer_id: string
  card_nickname: string | null
  last4: string | null
  bank_name: string | null
  due_date: string | null
  billing_cycle: number | null
  pin: string | null
  cvv_expiry: string | null
  card_type: string | null
  is_active: boolean
}

export interface Transaction {
  id: string
  sr_no: number
  date: string
  customer_id: string | null
  customer_name: string | null
  bank_card: string | null
  total_amount: number | null
  paid_amount: number | null
  account_name: string | null
  swap_amount: number | null
  swap_name: string | null
  difference: number | null
  remarks: string | null
  status: 'Paid' | 'Unpaid' | 'Pending' | 'Puru'
  commission_pct: number | null
  commission_amount: number | null
  commission_status: 'collected' | 'pending'
  created_by: string | null
  created_at: string
}

export interface CreateTransactionBody {
  date?: string
  customer_id?: string
  customer_name: string
  bank_card?: string
  total_amount: number
  paid_amount: number
  account_name: string
  swap_amount?: number
  swap_name?: string
  difference?: number
  remarks?: string
  status?: 'Paid' | 'Unpaid' | 'Pending' | 'Puru'
  commission_pct?: number
  commission_amount?: number
}
