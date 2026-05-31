-- ============================================================
-- Commodities + Invoice system
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Commodities master table
create table if not exists commodities (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  unit        text not null default 'pcs',      -- pcs, kg, litre, etc.
  current_price numeric(12,2) not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table commodities enable row level security;
create policy "authenticated read commodities"  on commodities for select using (auth.role() = 'authenticated');
create policy "authenticated write commodities" on commodities for all    using (auth.role() = 'authenticated');

-- 2. Commodity price history
create table if not exists commodity_price_history (
  id            uuid primary key default gen_random_uuid(),
  commodity_id  uuid not null references commodities(id) on delete cascade,
  price         numeric(12,2) not null,
  changed_by    uuid references auth.users(id),
  note          text,
  created_at    timestamptz not null default now()
);

alter table commodity_price_history enable row level security;
create policy "authenticated read cph"  on commodity_price_history for select using (auth.role() = 'authenticated');
create policy "authenticated write cph" on commodity_price_history for all    using (auth.role() = 'authenticated');

-- trigger: auto-insert price history when current_price changes
create or replace function log_commodity_price_change()
returns trigger language plpgsql security definer as $$
begin
  if old.current_price is distinct from new.current_price then
    insert into commodity_price_history(commodity_id, price, changed_by)
    values (new.id, new.current_price, auth.uid());
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_commodity_price on commodities;
create trigger trg_commodity_price
  before update on commodities
  for each row execute function log_commodity_price_change();

-- 3. Invoices
create table if not exists invoices (
  id              uuid primary key default gen_random_uuid(),
  invoice_number  text not null unique,
  transaction_id  uuid references transactions(id) on delete set null,
  customer_id     uuid references customers(id) on delete set null,
  customer_name   text not null,
  items           jsonb not null default '[]',   -- [{commodity_id, name, unit, qty, price, subtotal}]
  subtotal        numeric(12,2) not null default 0,
  tax_percent     numeric(5,2)  not null default 0,
  tax_amount      numeric(12,2) not null default 0,
  total_amount    numeric(12,2) not null default 0,
  notes           text,
  status          text not null default 'draft' check (status in ('draft','sent','paid','cancelled')),
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table invoices enable row level security;
create policy "authenticated read invoices"  on invoices for select using (auth.role() = 'authenticated');
create policy "authenticated write invoices" on invoices for all    using (auth.role() = 'authenticated');

-- 4. generate_invoice_number() RPC
create or replace function generate_invoice_number()
returns text language plpgsql security definer as $$
declare
  prefix text;
  seq    int;
  result text;
begin
  prefix := 'INV-' || to_char(now(), 'YYYYMM') || '-';
  select count(*) + 1
  into   seq
  from   invoices
  where  invoice_number like prefix || '%';
  result := prefix || lpad(seq::text, 4, '0');
  return result;
end;
$$;

grant execute on function generate_invoice_number() to authenticated;

-- 5. Add commodity_items + invoice_id columns to transactions (optional link)
alter table transactions add column if not exists commodity_items jsonb default '[]';
alter table transactions add column if not exists invoice_id uuid references invoices(id) on delete set null;

-- 6. Add customer_address to invoices
alter table invoices add column if not exists customer_address text default '';

-- Reload schema cache
notify pgrst, 'reload schema';
