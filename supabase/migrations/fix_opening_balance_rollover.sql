-- ============================================================
-- FIX: Opening Balance Rollover
-- Run this in Supabase SQL Editor
--
-- Fixes two bugs in initialize_chamunda_sheet:
--   1. Was looking only at p_date-1; now finds the most recent
--      prior day that actually has a total row (handles gaps).
--   2. Was using IF NOT EXISTS so stale opening amounts were
--      never corrected; now uses UPSERT (UPDATE then INSERT).
-- ============================================================

-- 1. Replace initialize_chamunda_sheet
CREATE OR REPLACE FUNCTION initialize_chamunda_sheet(p_date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  prev_closing numeric(12,2) := 0;
  exp          record;
BEGIN
  -- Find closing balance from the most recent previous day that
  -- actually has a total row (skips gaps / missing days).
  SELECT COALESCE(closing_balance, 0) INTO prev_closing
  FROM chamunda_sheet
  WHERE date < p_date
    AND row_type = 'total'
  ORDER BY date DESC
  LIMIT 1;

  -- Opening Cash In Hand — UPSERT so it always mirrors prev closing.
  UPDATE chamunda_sheet
     SET opening_amount = prev_closing
   WHERE date = p_date AND row_type = 'opening_cash';

  IF NOT FOUND THEN
    INSERT INTO chamunda_sheet (date, row_type, sort_order, opening_name, opening_amount)
    VALUES (p_date, 'opening_cash', 10, 'Cash In Hand', prev_closing);
  END IF;

  -- Opening HDFC (insert once, never overwrite — balance managed separately)
  IF NOT EXISTS (SELECT 1 FROM chamunda_sheet WHERE date = p_date AND row_type = 'opening_hdfc') THEN
    INSERT INTO chamunda_sheet (date, row_type, sort_order, opening_name, opening_amount)
    VALUES (p_date, 'opening_hdfc', 20, 'SKT/KT/NSS/RT HDFC', 0);
  END IF;

  -- Opening L-15 (insert once, managed via l15_entries)
  IF NOT EXISTS (SELECT 1 FROM chamunda_sheet WHERE date = p_date AND row_type = 'opening_l15') THEN
    INSERT INTO chamunda_sheet (date, row_type, sort_order, opening_name, opening_amount)
    VALUES (p_date, 'opening_l15', 30, 'L-15', 0);
  END IF;

  -- Total row
  IF NOT EXISTS (SELECT 1 FROM chamunda_sheet WHERE date = p_date AND row_type = 'total') THEN
    INSERT INTO chamunda_sheet (date, row_type, sort_order)
    VALUES (p_date, 'total', 9999);
  END IF;

  -- Expense rows (one per active expense master entry)
  FOR exp IN SELECT * FROM expense_master WHERE is_active = true ORDER BY sort_order LOOP
    IF NOT EXISTS (
      SELECT 1 FROM chamunda_sheet
      WHERE date = p_date AND row_type = 'expense' AND expense_id = exp.id
    ) THEN
      INSERT INTO chamunda_sheet (date, row_type, sort_order, expense_id, expense_name, expense_amount)
      VALUES (p_date, 'expense', 500 + exp.sort_order, exp.id, exp.expense_name, 0);
    END IF;
  END LOOP;

  PERFORM recalculate_chamunda_totals(p_date);
END;
$$;


-- ============================================================
-- 2. One-time backfill: re-roll all opening balances in order
--    so every existing date gets the correct prev-day closing.
--
--    This walks every distinct date in chamunda_sheet ascending
--    and calls initialize_chamunda_sheet for each one.
-- ============================================================
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT date
    FROM chamunda_sheet
    ORDER BY date ASC
  LOOP
    PERFORM initialize_chamunda_sheet(r.date);
  END LOOP;
END;
$$;
