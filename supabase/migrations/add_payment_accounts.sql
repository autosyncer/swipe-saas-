-- Payment accounts for NEFT, RTGS, UPI, GPAY, PHONEPAY
CREATE TABLE IF NOT EXISTS payment_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null CHECK (type IN ('NEFT','RTGS','UPI','GPAY','PHONEPAY')),
  detail text,
  status text default 'Active',
  created_at timestamptz default now()
);
ALTER TABLE payment_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all" ON payment_accounts;
CREATE POLICY "auth_all" ON payment_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Store multiple payment modes as JSON on transaction
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_modes jsonb;
