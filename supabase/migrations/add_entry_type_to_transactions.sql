-- Add entry_type column to transactions table
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS entry_type text default 'swap';
