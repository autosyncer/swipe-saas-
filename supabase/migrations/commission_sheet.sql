-- Commission Sheet tables migration
-- Run this in Supabase SQL Editor

-- 1. commission_sheet — tracks all commission entries (Inclusive / Exclusive / Deferred)
CREATE TABLE IF NOT EXISTS commission_sheet (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id       uuid REFERENCES transactions(id) ON DELETE SET NULL,
  date                 date NOT NULL,
  sr_no                integer,
  customer_name        text NOT NULL DEFAULT '',
  swap_machine         text NOT NULL DEFAULT '',
  commission_pct       decimal(6,3) NOT NULL DEFAULT 0,
  commission_amount    decimal(10,2) NOT NULL DEFAULT 0,
  commission_type      text NOT NULL DEFAULT 'Inclusive', -- Inclusive | Exclusive | Deferred
  payment_mode         text,                              -- UPI | Cash | Net Banking | null for Inclusive
  payment_mode_detail  text,                              -- UPI display name or bank display name
  status               text NOT NULL DEFAULT 'Pending',  -- Pending | Paid
  paid_date            date,
  paid_amount          decimal(10,2) DEFAULT 0,
  notes                text DEFAULT '',
  created_at           timestamptz DEFAULT now()
);

-- 2. upi_accounts — UPI accounts used for commission collection
CREATE TABLE IF NOT EXISTS upi_accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name  text NOT NULL,
  upi_id        text NOT NULL,
  status        text NOT NULL DEFAULT 'Active', -- Active | Inactive
  created_at    timestamptz DEFAULT now()
);

-- 3. net_banking_accounts — bank accounts used for commission collection
CREATE TABLE IF NOT EXISTS net_banking_accounts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name   text NOT NULL,
  bank_name      text NOT NULL,
  account_number text DEFAULT '',
  ifsc           text DEFAULT '',
  status         text NOT NULL DEFAULT 'Active', -- Active | Inactive
  created_at     timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE commission_sheet         ENABLE ROW LEVEL SECURITY;
ALTER TABLE upi_accounts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE net_banking_accounts     ENABLE ROW LEVEL SECURITY;

-- Policies — allow all authenticated users (tighten per-role if needed)
CREATE POLICY "auth_all" ON commission_sheet
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_all" ON upi_accounts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_all" ON net_banking_accounts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Index for fast date/type lookups
CREATE INDEX IF NOT EXISTS commission_sheet_date_idx  ON commission_sheet (date);
CREATE INDEX IF NOT EXISTS commission_sheet_type_idx  ON commission_sheet (commission_type);
CREATE INDEX IF NOT EXISTS commission_sheet_status_idx ON commission_sheet (status);
