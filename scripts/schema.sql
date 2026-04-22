-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- USERS / ROLES TABLE
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  role text check (role in ('super_admin', 'sub_admin')) default 'sub_admin',
  created_at timestamptz default now()
);

-- CUSTOMERS TABLE
create table if not exists customers (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  phone text,
  address text,
  default_charge_pct numeric(5,2) default 3.00,
  outstanding_balance numeric(12,2) default 0,
  created_at timestamptz default now(),
  created_by uuid references profiles(id)
);

-- CARDS TABLE (per customer)
create table if not exists cards (
  id uuid default uuid_generate_v4() primary key,
  customer_id uuid references customers(id) on delete cascade,
  card_nickname text,
  last4 text,
  bank_name text,
  due_date date,
  billing_cycle int,
  pin text,
  cvv_expiry text,
  card_type text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- BANK ACCOUNTS TABLE
create table if not exists bank_accounts (
  id uuid default uuid_generate_v4() primary key,
  account_name text not null,
  bank_name text,
  account_number_masked text,
  ifsc text,
  current_balance numeric(12,2) default 0,
  created_at timestamptz default now()
);

-- TRANSACTIONS TABLE (Daily Register)
create table if not exists transactions (
  id uuid default uuid_generate_v4() primary key,
  sr_no serial,
  date date not null default current_date,
  customer_id uuid references customers(id),
  customer_name text,
  bank_card text,
  total_amount numeric(12,2),
  paid_amount numeric(12,2),
  account_name text,
  swap_amount numeric(12,2),
  swap_name text,
  difference numeric(12,2),
  remarks text,
  status text check (status in ('Paid','Unpaid','Pending','Puru')) default 'Pending',
  commission_pct numeric(5,2),
  commission_amount numeric(12,2),
  commission_status text check (commission_status in ('collected','pending')) default 'pending',
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- AC SHEET TABLE (daily rolling ledger per account)
create table if not exists ac_sheet (
  id uuid default uuid_generate_v4() primary key,
  date date not null default current_date,
  account_name text not null,
  open_bal numeric(12,2) default 0,
  bal_recd numeric(12,2) default 0,
  trn_bal_recd numeric(12,2) default 0,
  avai_bal numeric(12,2) generated always as (open_bal + bal_recd + trn_bal_recd) stored,
  atm_withd numeric(12,2) default 0,
  withd numeric(12,2) default 0,
  transf numeric(12,2) default 0,
  cc_pay numeric(12,2) default 0,
  cust_trf numeric(12,2) default 0,
  charges numeric(12,2) default 0,
  closing_bal numeric(12,2) generated always as (open_bal + bal_recd + trn_bal_recd - atm_withd - withd - transf - cc_pay - cust_trf - charges) stored,
  created_by uuid references profiles(id)
);

-- CC SHEET TABLE (machine swipe data)
create table if not exists cc_sheet (
  id uuid default uuid_generate_v4() primary key,
  date date not null default current_date,
  tid text,
  firm_name text,
  swipe_amount numeric(12,2),
  charges_deducted numeric(12,2),
  net_received numeric(12,2),
  customer_name text,
  customer_id uuid references customers(id),
  transaction_id uuid references transactions(id),
  created_at timestamptz default now()
);

-- BL SHEET TABLE (cash & transfer ledger)
create table if not exists bl_sheet (
  id uuid default uuid_generate_v4() primary key,
  date date not null default current_date,
  credited_account text,
  credited_amount numeric(12,2) default 0,
  debited_account text,
  debited_amount numeric(12,2) default 0,
  reference text,
  pending numeric(12,2) default 0,
  firm_name text,
  created_at timestamptz default now()
);

-- EXPENSES TABLE
create table if not exists expenses (
  id uuid default uuid_generate_v4() primary key,
  date date not null default current_date,
  category text,
  amount numeric(12,2),
  linked_bank_account uuid references bank_accounts(id),
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- Row Level Security
alter table profiles enable row level security;
alter table customers enable row level security;
alter table cards enable row level security;
alter table transactions enable row level security;
alter table ac_sheet enable row level security;
alter table cc_sheet enable row level security;
alter table bl_sheet enable row level security;
alter table expenses enable row level security;

-- RLS Policies
create policy "Users can view own profile" on profiles for select using (auth.uid() = id);
create policy "Super admin sees all customers" on customers for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'super_admin')
);
create policy "Sub admin sees all customers" on customers for select using (
  exists (select 1 from profiles where id = auth.uid() and role = 'sub_admin')
);
create policy "Admins can insert customers" on customers for insert with check (
  exists (select 1 from profiles where id = auth.uid())
);
create policy "All admins see transactions" on transactions for select using (
  exists (select 1 from profiles where id = auth.uid())
);
create policy "All admins insert transactions" on transactions for insert with check (
  exists (select 1 from profiles where id = auth.uid())
);
create policy "All admins see ac_sheet" on ac_sheet for all using (
  exists (select 1 from profiles where id = auth.uid())
);
create policy "All admins see cc_sheet" on cc_sheet for all using (
  exists (select 1 from profiles where id = auth.uid())
);
create policy "All admins see bl_sheet" on bl_sheet for all using (
  exists (select 1 from profiles where id = auth.uid())
);
