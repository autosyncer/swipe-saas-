-- ============================================================
-- CHAMUNDA SHEET MIGRATION
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================

-- 1. EXPENSE MASTER TABLE
create table if not exists expense_master (
  id uuid default uuid_generate_v4() primary key,
  expense_name text not null,
  category text not null default 'other',
  is_active boolean default true,
  sort_order int default 100,
  created_at timestamptz default now()
);

-- Seed default expenses
insert into expense_master (expense_name, category, sort_order) values
  ('Calculator',    'office',    10),
  ('Book Printing', 'office',    20),
  ('Office Exp',    'office',    30),
  ('CA Ankit',      'office',    40),
  ('Tempo Rent',    'transport', 50),
  ('Petrol',        'transport', 60),
  ('Water Bill',    'utility',   70),
  ('Aaji',          'salary',    80),
  ('Anil Surti',    'salary',    90),
  ('Pooja',         'salary',   100),
  ('Dhruvi',        'salary',   110),
  ('Gautam',        'salary',   120),
  ('NS',            'on_hand',  130),
  ('HK',            'on_hand',  140),
  ('Kala',          'on_hand',  150),
  ('Puru',          'on_hand',  160),
  ('Pandesara',     'rent',     170),
  ('U4 Rent',       'rent',     180)
on conflict do nothing;

-- 2. CHAMUNDA SHEET TABLE
create table if not exists chamunda_sheet (
  id uuid default uuid_generate_v4() primary key,
  date date not null,
  row_type text not null,
  -- row_type values:
  --   opening_cash   → Cash In Hand (auto from prev day closing)
  --   opening_hdfc   → SKT/KT/NSS/RT HDFC
  --   opening_l15    → L-15 total
  --   opening_person → Manual person entry
  --   transaction    → Swipe transaction row
  --   expense        → Expense row
  --   total          → Closing balance row
  sort_order int default 100,

  -- Opening rows
  opening_name   text,
  opening_amount numeric(12,2) default 0,

  -- Transaction rows
  transaction_id  uuid references transactions(id) on delete set null,
  card_holder     text,
  bank_charge_pct numeric(5,2) default 3.00,
  paid_amount     numeric(12,2) default 0,
  swap_amount     numeric(12,2) default 0,
  commission_pct  numeric(5,2)  default 0,
  commission_type text,
  machine_name    text,
  trf_firm_name   text,
  cash_gp_recd    numeric(12,2) default 0,

  -- Expense rows
  expense_id     uuid references expense_master(id) on delete set null,
  expense_name   text,
  expense_amount numeric(12,2) default 0,
  expense_note   text,

  -- Total row
  total_cash_in    numeric(12,2) default 0,
  total_paid_out   numeric(12,2) default 0,
  closing_balance  numeric(12,2) default 0,

  created_at timestamptz default now()
);

-- Index for fast date lookups
create index if not exists idx_chamunda_sheet_date on chamunda_sheet(date);
create index if not exists idx_chamunda_sheet_date_type on chamunda_sheet(date, row_type);

-- 3. L-15 ENTRIES TABLE
create table if not exists l15_entries (
  id uuid default uuid_generate_v4() primary key,
  date date not null,
  customer_name text not null,
  amount numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz default now()
);

create index if not exists idx_l15_entries_date on l15_entries(date);

-- 4. RLS
alter table expense_master enable row level security;
alter table chamunda_sheet  enable row level security;
alter table l15_entries     enable row level security;

create policy "Admins manage expense_master" on expense_master for all
  using (exists (select 1 from profiles where id = auth.uid()));

create policy "Admins manage chamunda_sheet" on chamunda_sheet for all
  using (exists (select 1 from profiles where id = auth.uid()));

create policy "Admins manage l15_entries" on l15_entries for all
  using (exists (select 1 from profiles where id = auth.uid()));

-- 5. RPC: recalculate_chamunda_totals
create or replace function recalculate_chamunda_totals(p_date date)
returns void language plpgsql security definer as $$
declare
  v_cash_in       numeric(12,2) := 0;
  v_paid_in_cash  numeric(12,2) := 0;
  v_cash_gp_recd  numeric(12,2) := 0;
  v_expenses      numeric(12,2) := 0;
  v_closing       numeric(12,2) := 0;
begin
  -- Cash in = all opening rows (cash in hand, hdfc, l15, person entries)
  select coalesce(sum(opening_amount), 0) into v_cash_in
  from chamunda_sheet
  where date = p_date
    and row_type in ('opening_cash','opening_hdfc','opening_l15','opening_person');

  -- Cash paid OUT to customers (column E: Paid in Cash)
  select coalesce(sum(paid_in_cash), 0) into v_paid_in_cash
  from chamunda_sheet
  where date = p_date and row_type = 'transaction';

  -- Cash/GP received (column J: Cash/GP Recd)
  select coalesce(sum(cash_gp_recd), 0) into v_cash_gp_recd
  from chamunda_sheet
  where date = p_date and row_type = 'transaction';

  -- Expenses paid in cash
  select coalesce(sum(expense_amount), 0) into v_expenses
  from chamunda_sheet
  where date = p_date and row_type = 'expense';

  -- Closing = Opening Cash In − Cash Paid Out + Cash/GP Received − Expenses
  v_closing := v_cash_in - v_paid_in_cash + v_cash_gp_recd - v_expenses;

  -- Upsert total row
  update chamunda_sheet
     set total_cash_in   = v_cash_in,
         total_paid_out  = v_paid_in_cash,
         closing_balance = v_closing
   where date = p_date and row_type = 'total';

  if not found then
    insert into chamunda_sheet (date, row_type, sort_order, total_cash_in, total_paid_out, closing_balance)
    values (p_date, 'total', 9999, v_cash_in, v_paid_in_cash, v_closing);
  end if;
end;
$$;

-- 6. RPC: initialize_chamunda_sheet
create or replace function initialize_chamunda_sheet(p_date date)
returns void language plpgsql security definer as $$
declare
  prev_date    date := p_date - interval '1 day';
  prev_closing numeric(12,2) := 0;
  exp          record;
begin
  -- Pull previous day closing
  select coalesce(closing_balance, 0) into prev_closing
  from chamunda_sheet
  where date = prev_date and row_type = 'total'
  limit 1;

  -- Opening Cash In Hand
  if not exists (select 1 from chamunda_sheet where date = p_date and row_type = 'opening_cash') then
    insert into chamunda_sheet (date, row_type, sort_order, opening_name, opening_amount)
    values (p_date, 'opening_cash', 10, 'Cash In Hand', prev_closing);
  end if;

  -- Opening HDFC
  if not exists (select 1 from chamunda_sheet where date = p_date and row_type = 'opening_hdfc') then
    insert into chamunda_sheet (date, row_type, sort_order, opening_name, opening_amount)
    values (p_date, 'opening_hdfc', 20, 'SKT/KT/NSS/RT HDFC', 0);
  end if;

  -- Opening L-15
  if not exists (select 1 from chamunda_sheet where date = p_date and row_type = 'opening_l15') then
    insert into chamunda_sheet (date, row_type, sort_order, opening_name, opening_amount)
    values (p_date, 'opening_l15', 30, 'L-15', 0);
  end if;

  -- Total row
  if not exists (select 1 from chamunda_sheet where date = p_date and row_type = 'total') then
    insert into chamunda_sheet (date, row_type, sort_order)
    values (p_date, 'total', 9999);
  end if;

  -- Expense rows for every active expense master
  for exp in select * from expense_master where is_active = true order by sort_order loop
    if not exists (
      select 1 from chamunda_sheet
      where date = p_date and row_type = 'expense' and expense_id = exp.id
    ) then
      insert into chamunda_sheet (date, row_type, sort_order, expense_id, expense_name, expense_amount)
      values (p_date, 'expense', 500 + exp.sort_order, exp.id, exp.expense_name, 0);
    end if;
  end loop;

  perform recalculate_chamunda_totals(p_date);
end;
$$;
