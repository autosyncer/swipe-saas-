-- Reminders table — run this in Supabase SQL Editor if not already created

CREATE TABLE IF NOT EXISTS reminders (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title          text NOT NULL DEFAULT '',
  description    text DEFAULT '',
  reminder_date  date NOT NULL,
  reminder_time  time DEFAULT '10:00:00',
  type           text NOT NULL DEFAULT 'commission', -- commission | general
  customer_name  text DEFAULT '',
  amount         decimal(10,2) DEFAULT 0,
  status         text NOT NULL DEFAULT 'pending',    -- pending | completed
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON reminders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS reminders_type_idx   ON reminders (type);
CREATE INDEX IF NOT EXISTS reminders_status_idx ON reminders (status);
CREATE INDEX IF NOT EXISTS reminders_date_idx   ON reminders (reminder_date);
