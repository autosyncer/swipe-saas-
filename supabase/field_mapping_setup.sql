-- ── Field mapping rules ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS field_mapping_rules (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  form_field_id   TEXT NOT NULL,
  form_field_label TEXT NOT NULL,
  sheet_id      TEXT NOT NULL,
  sheet_label   TEXT NOT NULL,
  column_id     TEXT NOT NULL,
  column_label  TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, form_field_id, sheet_id)
);

ALTER TABLE field_mapping_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own mappings"
  ON field_mapping_rules FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_fmr_user ON field_mapping_rules(user_id);

-- ── Sheets ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sheets (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  sheet_key    TEXT NOT NULL,
  label        TEXT NOT NULL,
  theme_color  TEXT DEFAULT '#7F77DD',
  is_custom    BOOLEAN DEFAULT FALSE,
  column_order INT DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, sheet_key)
);

ALTER TABLE sheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own sheets"
  ON sheets FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Sheet columns ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sheet_columns (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  sheet_key    TEXT NOT NULL,
  column_key   TEXT NOT NULL,
  label        TEXT NOT NULL,
  is_custom    BOOLEAN DEFAULT FALSE,
  column_order INT DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, sheet_key, column_key)
);

ALTER TABLE sheet_columns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own sheet columns"
  ON sheet_columns FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_sc_sheet ON sheet_columns(user_id, sheet_key);
