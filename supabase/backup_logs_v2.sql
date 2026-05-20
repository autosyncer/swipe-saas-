-- Run this in Supabase SQL Editor

-- 1. Update backup_logs table with new columns
alter table backup_logs
  add column if not exists storage_path      text default '',
  add column if not exists google_drive_id   text default '',
  add column if not exists google_drive_url  text default '',
  add column if not exists backup_type       text default 'manual',
  add column if not exists status            text default 'completed';

-- 2. Create 'backups' storage bucket (run in Supabase Dashboard → Storage, or via SQL)
-- Go to Supabase Dashboard → Storage → New Bucket → name: "backups", private: true

-- Or via SQL (if storage schema is accessible):
-- insert into storage.buckets (id, name, public) values ('backups', 'backups', false) on conflict do nothing;

-- 3. Storage RLS policies for the backups bucket
-- Run in Supabase Dashboard → Storage → backups bucket → Policies:
--   Allow authenticated users to upload:   (auth.role() = 'authenticated')
--   Allow authenticated users to download: (auth.role() = 'authenticated')
