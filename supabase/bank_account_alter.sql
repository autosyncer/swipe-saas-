-- Run in Supabase SQL Editor — adds new columns to bank_account_master

alter table bank_account_master
  add column if not exists bank_name text default '',
  add column if not exists account_type text default 'Current',
  add column if not exists account_number text default '',
  add column if not exists ifsc_code text default '',
  add column if not exists branch text default '',
  add column if not exists commission_pct numeric(8,3) default 0,
  add column if not exists commission_type text default 'Inclusive',
  add column if not exists notes text default '',
  add column if not exists contact_person text default '',
  add column if not exists contact_phone text default '';
