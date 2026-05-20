-- Run in Supabase SQL Editor
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS commission_type text DEFAULT 'Inclusive';
