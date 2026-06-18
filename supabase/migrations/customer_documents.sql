-- ============================================================
-- Customer Documents & Notes
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add notes column to customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes text;

-- 2. Create customer_documents table
CREATE TABLE IF NOT EXISTS customer_documents (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references customers(id) on delete cascade,
  doc_type     text not null check (doc_type in ('aadhaar', 'pan', 'other')),
  file_name    text not null,
  file_url     text not null,
  storage_path text not null,
  note         text,
  created_at   timestamptz default now()
);

CREATE INDEX IF NOT EXISTS idx_customer_documents_customer_id ON customer_documents(customer_id);

-- 3. RLS policies
ALTER TABLE customer_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read" ON customer_documents
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert" ON customer_documents
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated delete" ON customer_documents
  FOR DELETE TO authenticated USING (true);

-- ============================================================
-- 4. Storage bucket
--    Run this separately in Supabase Dashboard:
--    Storage → New Bucket → Name: customer-docs → Public: ON
--
--    Or run via SQL:
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('customer-docs', 'customer-docs', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload/read/delete
CREATE POLICY "Allow authenticated upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'customer-docs');

CREATE POLICY "Allow public read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'customer-docs');

CREATE POLICY "Allow authenticated delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'customer-docs');
