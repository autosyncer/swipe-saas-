-- Run in Supabase SQL Editor to verify invoice setup is complete
-- -------------------------------------------------------

-- 1. Check tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('commodities', 'commodity_price_history', 'invoices')
ORDER BY table_name;
-- Expected: 3 rows

-- 2. Check generate_invoice_number function exists
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'generate_invoice_number';
-- Expected: 1 row

-- 3. Check invoices columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'invoices'
ORDER BY ordinal_position;
-- Expected: id, invoice_number, transaction_id, customer_id, customer_name, items, subtotal, tax_percent, tax_amount, total_amount, notes, status, created_by, created_at, updated_at

-- 4. Check transactions has invoice_id column
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'invoice_id';
-- Expected: 1 row — if 0 rows, re-run commodities_invoices.sql

-- 5. Quick test of invoice number generation
SELECT generate_invoice_number();
-- Expected: INV-YYYYMM-0001 (or next number)
