-- Run this in Supabase SQL Editor

create table if not exists backup_logs (
  id              uuid primary key default gen_random_uuid(),
  backup_name     text not null,
  backup_size     text,
  tables_included text[] default '{}',
  created_by      uuid references auth.users(id),
  created_at      timestamptz default now()
);

-- Enable RLS
alter table backup_logs enable row level security;

-- Allow authenticated users to read/insert
create policy "backup_logs_read"   on backup_logs for select using (auth.role() = 'authenticated');
create policy "backup_logs_insert" on backup_logs for insert with check (auth.role() = 'authenticated');
