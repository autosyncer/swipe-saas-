-- Run this in Supabase SQL Editor BEFORE using Restore

create or replace function truncate_for_restore()
returns void
language plpgsql
security definer
as $$
begin
  -- Disable triggers temporarily to avoid FK cascade issues
  set session_replication_role = replica;

  truncate table audit_logs        restart identity cascade;
  truncate table risk_alerts       restart identity cascade;
  truncate table reminders         restart identity cascade;
  truncate table customer_sheet    restart identity cascade;
  truncate table bl_sheet          restart identity cascade;
  truncate table cc_sheet          restart identity cascade;
  truncate table ac_sheet          restart identity cascade;
  truncate table transactions      restart identity cascade;
  truncate table bank_account_master restart identity cascade;
  truncate table swipe_machines    restart identity cascade;
  truncate table customer_bank_accounts restart identity cascade;
  truncate table cards             restart identity cascade;
  truncate table customers         restart identity cascade;

  -- Re-enable triggers
  set session_replication_role = default;
end;
$$;

-- Grant execute to authenticated users
grant execute on function truncate_for_restore() to authenticated;
