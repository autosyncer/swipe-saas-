-- Run this in Supabase SQL Editor

create or replace function reset_all_data()
returns void
language plpgsql
security definer
as $$
begin
  set session_replication_role = replica;

  truncate table audit_logs          restart identity cascade;
  truncate table risk_alerts         restart identity cascade;
  truncate table reminders           restart identity cascade;
  truncate table customer_sheet      restart identity cascade;
  truncate table bl_sheet            restart identity cascade;
  truncate table cc_sheet            restart identity cascade;
  truncate table ac_sheet            restart identity cascade;
  truncate table transactions        restart identity cascade;
  truncate table bank_account_master restart identity cascade;
  truncate table swipe_machines      restart identity cascade;
  truncate table customer_bank_accounts restart identity cascade;
  truncate table cards               restart identity cascade;
  truncate table customers           restart identity cascade;

  set session_replication_role = default;
end;
$$;

-- Only authenticated users can call it (role check done in app layer)
grant execute on function reset_all_data() to authenticated;
