-- Add release_status to transactions
-- Card Swap entries are 'pending' until confirmed; Card Refill and others are auto 'released'
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS release_status text default 'released';

-- Mark any existing swap entries as released (they were already processed)
UPDATE transactions SET release_status = 'released' WHERE release_status IS NULL;
