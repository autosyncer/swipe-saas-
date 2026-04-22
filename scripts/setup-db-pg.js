const { Client } = require('pg')
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://mydxflaewionbkvbqgbo.supabase.co'
const SERVICE_ROLE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15ZHhmbGFld2lvbmJrdmJxZ2JvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjY4OTU3MywiZXhwIjoyMDkyMjY1NTczfQ.2g4O2aWIOIMg6ExCIUEsZmH5AtRvcyWQ32h4OXkYUtE'

// Supabase direct connection string uses the service role password
// Connection pooler (port 5432 via pgBouncer) or direct (port 5432)
const DB_HOST = 'db.mydxflaewionbkvbqgbo.supabase.co'
const DB_PORT = 5432
const DB_NAME = 'postgres'
const DB_USER = 'postgres'
// The DB password is the service role key JWT
const DB_PASSWORD = SERVICE_ROLE

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const SCHEMA_SQL = `
create extension if not exists "uuid-ossp";

create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  role text check (role in ('super_admin', 'sub_admin')) default 'sub_admin',
  created_at timestamptz default now()
);

create table if not exists customers (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  phone text,
  address text,
  default_charge_pct numeric(5,2) default 3.00,
  outstanding_balance numeric(12,2) default 0,
  created_at timestamptz default now(),
  created_by uuid references profiles(id)
);

create table if not exists cards (
  id uuid default uuid_generate_v4() primary key,
  customer_id uuid references customers(id) on delete cascade,
  card_nickname text,
  last4 text,
  bank_name text,
  due_date date,
  billing_cycle int,
  pin text,
  cvv_expiry text,
  card_type text,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists bank_accounts (
  id uuid default uuid_generate_v4() primary key,
  account_name text not null unique,
  bank_name text,
  account_number_masked text,
  ifsc text,
  current_balance numeric(12,2) default 0,
  created_at timestamptz default now()
);

create table if not exists transactions (
  id uuid default uuid_generate_v4() primary key,
  sr_no serial,
  date date not null default current_date,
  customer_id uuid references customers(id),
  customer_name text,
  bank_card text,
  total_amount numeric(12,2),
  paid_amount numeric(12,2),
  account_name text,
  swap_amount numeric(12,2),
  swap_name text,
  difference numeric(12,2),
  remarks text,
  status text check (status in ('Paid','Unpaid','Pending','Puru')) default 'Pending',
  commission_pct numeric(5,2),
  commission_amount numeric(12,2),
  commission_status text check (commission_status in ('collected','pending')) default 'pending',
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table if not exists ac_sheet (
  id uuid default uuid_generate_v4() primary key,
  date date not null default current_date,
  account_name text not null,
  open_bal numeric(12,2) default 0,
  bal_recd numeric(12,2) default 0,
  trn_bal_recd numeric(12,2) default 0,
  avai_bal numeric(12,2) generated always as (open_bal + bal_recd + trn_bal_recd) stored,
  atm_withd numeric(12,2) default 0,
  withd numeric(12,2) default 0,
  transf numeric(12,2) default 0,
  cc_pay numeric(12,2) default 0,
  cust_trf numeric(12,2) default 0,
  charges numeric(12,2) default 0,
  closing_bal numeric(12,2) generated always as (open_bal + bal_recd + trn_bal_recd - atm_withd - withd - transf - cc_pay - cust_trf - charges) stored,
  created_by uuid references profiles(id)
);

create table if not exists cc_sheet (
  id uuid default uuid_generate_v4() primary key,
  date date not null default current_date,
  tid text,
  firm_name text,
  swipe_amount numeric(12,2),
  charges_deducted numeric(12,2),
  net_received numeric(12,2),
  customer_name text,
  customer_id uuid references customers(id),
  transaction_id uuid references transactions(id),
  created_at timestamptz default now()
);

create table if not exists bl_sheet (
  id uuid default uuid_generate_v4() primary key,
  date date not null default current_date,
  credited_account text,
  credited_amount numeric(12,2) default 0,
  debited_account text,
  debited_amount numeric(12,2) default 0,
  reference text,
  pending numeric(12,2) default 0,
  firm_name text,
  created_at timestamptz default now()
);

create table if not exists expenses (
  id uuid default uuid_generate_v4() primary key,
  date date not null default current_date,
  category text,
  amount numeric(12,2),
  linked_bank_account uuid references bank_accounts(id),
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

alter table if exists profiles enable row level security;
alter table if exists customers enable row level security;
alter table if exists cards enable row level security;
alter table if exists transactions enable row level security;
alter table if exists ac_sheet enable row level security;
alter table if exists cc_sheet enable row level security;
alter table if exists bl_sheet enable row level security;
alter table if exists expenses enable row level security;

do $pol$ begin
  if not exists (select 1 from pg_policies where tablename='profiles' and policyname='Users can view own profile') then
    create policy "Users can view own profile" on profiles for select using (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where tablename='customers' and policyname='Super admin sees all customers') then
    create policy "Super admin sees all customers" on customers for all using (
      exists (select 1 from profiles where id = auth.uid() and role = 'super_admin')
    );
  end if;
  if not exists (select 1 from pg_policies where tablename='customers' and policyname='Sub admin sees all customers') then
    create policy "Sub admin sees all customers" on customers for select using (
      exists (select 1 from profiles where id = auth.uid() and role = 'sub_admin')
    );
  end if;
  if not exists (select 1 from pg_policies where tablename='customers' and policyname='Admins can insert customers') then
    create policy "Admins can insert customers" on customers for insert with check (
      exists (select 1 from profiles where id = auth.uid())
    );
  end if;
  if not exists (select 1 from pg_policies where tablename='transactions' and policyname='All admins see transactions') then
    create policy "All admins see transactions" on transactions for select using (
      exists (select 1 from profiles where id = auth.uid())
    );
  end if;
  if not exists (select 1 from pg_policies where tablename='transactions' and policyname='All admins insert transactions') then
    create policy "All admins insert transactions" on transactions for insert with check (
      exists (select 1 from profiles where id = auth.uid())
    );
  end if;
  if not exists (select 1 from pg_policies where tablename='ac_sheet' and policyname='All admins see ac_sheet') then
    create policy "All admins see ac_sheet" on ac_sheet for all using (
      exists (select 1 from profiles where id = auth.uid())
    );
  end if;
  if not exists (select 1 from pg_policies where tablename='cc_sheet' and policyname='All admins see cc_sheet') then
    create policy "All admins see cc_sheet" on cc_sheet for all using (
      exists (select 1 from profiles where id = auth.uid())
    );
  end if;
  if not exists (select 1 from pg_policies where tablename='bl_sheet' and policyname='All admins see bl_sheet') then
    create policy "All admins see bl_sheet" on bl_sheet for all using (
      exists (select 1 from profiles where id = auth.uid())
    );
  end if;
end $pol$;
`

async function main() {
  console.log('Connecting to Supabase PostgreSQL...')

  const client = new Client({
    host: DB_HOST,
    port: DB_PORT,
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  })

  try {
    await client.connect()
    console.log('Connected!\n')

    console.log('Creating schema...')
    await client.query(SCHEMA_SQL)
    console.log('✓ Schema created\n')

    // Seed bank accounts
    console.log('Seeding bank accounts...')
    const accounts = ['NSS', 'SKT', 'RT', 'KTC', 'TAP', 'BGM', 'NTC', 'MAHA', 'MAL', 'MAP', 'HASTI']
    for (const name of accounts) {
      await client.query(`INSERT INTO bank_accounts (account_name, current_balance) VALUES ($1, 0) ON CONFLICT (account_name) DO NOTHING`, [name])
      console.log(`  ✓ ${name}`)
    }

    await client.end()
  } catch (err) {
    console.error('PostgreSQL connection failed:', err.message)
    console.log('\nFalling back to Supabase service role for seed data...')
    await seedWithSupabase()
    return
  }

  await seedWithSupabase()
}

async function seedWithSupabase() {
  // Create super admin user
  console.log('\nCreating super admin user...')
  const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
    email: 'admin@swipesaas.com',
    password: 'Admin@123',
    email_confirm: true,
  })

  let userId
  if (authErr) {
    if (authErr.message?.includes('already') || authErr.message?.includes('duplicate')) {
      console.log('  Super admin already exists')
      const { data: users } = await supabase.auth.admin.listUsers()
      const existing = users?.users?.find(u => u.email === 'admin@swipesaas.com')
      userId = existing?.id
    } else {
      console.log('  Auth error:', authErr.message)
    }
  } else {
    userId = authUser.user.id
    console.log('  ✓ User created:', authUser.user.email)
  }

  if (userId) {
    const { error } = await supabase.from('profiles').upsert({
      id: userId, full_name: 'Super Admin', role: 'super_admin'
    })
    if (error) console.log('  Profile error:', error.message)
    else console.log('  ✓ Profile upserted')
  }

  // Create RAJ DARBAR customer
  console.log('\nCreating sample customer RAJ DARBAR...')
  const { data: existingCust } = await supabase.from('customers').select('id').eq('name', 'RAJ DARBAR').single()
  let custId = existingCust?.id

  if (!custId) {
    const { data: newCust, error } = await supabase.from('customers').insert({
      name: 'RAJ DARBAR', phone: '9909926170', default_charge_pct: 2.2, outstanding_balance: 0,
    }).select().single()
    if (error) console.log('  Customer error:', error.message)
    else { custId = newCust.id; console.log('  ✓ Customer created') }
  } else {
    console.log('  Customer already exists')
  }

  if (custId) {
    const cards = [
      { bank_name: 'AXIS', last4: '9785' },
      { bank_name: 'INDUS', last4: '2422' },
      { bank_name: 'YES', last4: '7937' },
      { bank_name: 'KOTAK', last4: '0691' },
      { bank_name: 'RBL', last4: '3667' },
      { bank_name: 'TATA', last4: '6942' },
    ]
    const { data: existingCards } = await supabase.from('cards').select('last4').eq('customer_id', custId)
    const existing4 = new Set((existingCards || []).map(c => c.last4))
    for (const card of cards) {
      if (existing4.has(card.last4)) { console.log(`  ${card.bank_name} already exists`); continue }
      const { error } = await supabase.from('cards').insert({
        customer_id: custId, bank_name: card.bank_name, last4: card.last4,
        card_type: 'Credit', card_nickname: `${card.bank_name} ${card.last4}`, is_active: true,
      })
      if (error) console.log(`  ${card.bank_name}: ${error.message}`)
      else console.log(`  ✓ ${card.bank_name} ...${card.last4}`)
    }
  }

  console.log('\n✅ Seed data complete!')
}

main().catch(console.error)
