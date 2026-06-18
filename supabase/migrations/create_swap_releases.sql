-- Dedicated table to track card swap releases (avoids schema cache issues with transactions table)
CREATE TABLE IF NOT EXISTS swap_releases (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  released_at timestamptz default now(),
  released_by text,
  UNIQUE(transaction_id)
);

ALTER TABLE swap_releases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON swap_releases FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Backfill: mark all existing swap transactions as released
INSERT INTO swap_releases (transaction_id)
SELECT id FROM transactions
WHERE entry_type = 'swap'
  AND (release_status = 'released' OR release_status IS NULL)
ON CONFLICT DO NOTHING;
