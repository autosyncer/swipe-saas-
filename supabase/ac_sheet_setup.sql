-- Run this in Supabase SQL Editor

-- 1. bank_account_master
create table if not exists bank_account_master (
  id uuid primary key default gen_random_uuid(),
  account_name text not null unique,
  current_balance numeric default 0,
  opening_balance numeric default 0,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- 2. ac_sheet
create table if not exists ac_sheet (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  account_name text not null,
  open_bal numeric default 0,
  bal_recd numeric default 0,
  trn_bal_recd numeric default 0,
  avai_bal numeric default 0,
  atm_withd numeric default 0,
  withd numeric default 0,
  transf numeric default 0,
  cc_pay numeric default 0,
  cust_trf numeric default 0,
  charges numeric default 0,
  closing_bal numeric default 0,
  created_at timestamptz default now(),
  unique(date, account_name)
);

-- 3. Seed accounts
insert into bank_account_master (account_name) values
  ('KTC INDUS'),('MAP IND'),('RT IND'),('BGM IND'),('SKT INDUS'),('MAP INDUS'),
  ('RT INDUS'),('BGM INDUS'),('NTC INDUS'),('SKT FDRL'),('NGM INDUS'),
  ('MGs FDRL'),('SST FDRL'),('NTC FDRL'),('KTC FDRL'),
  ('MAP FDRL'),('TAPI FDRL'),('BGM FDRL'),('TAPI BOB'),('KTC BOB'),
  ('MNS BOB'),('NGM BOB'),('SKT FINK'),('NTC BOB'),('RT BOB'),
  ('MAP BOB'),('SKT BOB'),('NSS FDRL'),('BGM BOB')
on conflict (account_name) do nothing;
