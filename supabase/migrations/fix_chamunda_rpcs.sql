-- ============================================================
-- FIX: Run this in Supabase SQL Editor
-- Fixes 400 errors on initialize_chamunda_sheet and recalculate_chamunda_totals
-- ============================================================

-- 1. Add missing columns if they don't exist
ALTER TABLE chamunda_sheet ADD COLUMN IF NOT EXISTS paid_in_cash  numeric(12,2) DEFAULT 0;
ALTER TABLE chamunda_sheet ADD COLUMN IF NOT EXISTS name          text;
ALTER TABLE chamunda_sheet ADD COLUMN IF NOT EXISTS opening_name  text;
ALTER TABLE chamunda_sheet ADD COLUMN IF NOT EXISTS opening_amount numeric(12,2) DEFAULT 0;

-- 2. Fix recalculate_chamunda_totals
--    Formula: Closing = Opening Cash In - Paid In Cash + Cash/GP Received - Expenses
CREATE OR REPLACE FUNCTION recalculate_chamunda_totals(p_date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_cash_in       numeric(12,2) := 0;
  v_paid_in_cash  numeric(12,2) := 0;
  v_cash_gp_recd  numeric(12,2) := 0;
  v_expenses      numeric(12,2) := 0;
  v_closing       numeric(12,2) := 0;
BEGIN
  -- Cash in = all opening rows
  SELECT COALESCE(SUM(opening_amount), 0) INTO v_cash_in
  FROM chamunda_sheet
  WHERE date = p_date
    AND row_type IN ('opening_cash','opening_hdfc','opening_l15','opening_person');

  -- Cash paid OUT to customers (Paid in Cash column)
  SELECT COALESCE(SUM(paid_in_cash), 0) INTO v_paid_in_cash
  FROM chamunda_sheet
  WHERE date = p_date AND row_type = 'transaction';

  -- Cash/GP received
  SELECT COALESCE(SUM(cash_gp_recd), 0) INTO v_cash_gp_recd
  FROM chamunda_sheet
  WHERE date = p_date AND row_type = 'transaction';

  -- Expenses
  SELECT COALESCE(SUM(expense_amount), 0) INTO v_expenses
  FROM chamunda_sheet
  WHERE date = p_date AND row_type = 'expense';

  v_closing := v_cash_in - v_paid_in_cash + v_cash_gp_recd - v_expenses;

  UPDATE chamunda_sheet
     SET total_cash_in   = v_cash_in,
         total_paid_out  = v_paid_in_cash,
         closing_balance = v_closing
   WHERE date = p_date AND row_type = 'total';

  IF NOT FOUND THEN
    INSERT INTO chamunda_sheet (date, row_type, sort_order, total_cash_in, total_paid_out, closing_balance)
    VALUES (p_date, 'total', 9999, v_cash_in, v_paid_in_cash, v_closing);
  END IF;
END;
$$;

-- 3. Fix initialize_chamunda_sheet
CREATE OR REPLACE FUNCTION initialize_chamunda_sheet(p_date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  prev_closing numeric(12,2) := 0;
  exp          record;
BEGIN
  -- Find closing balance from the most recent prior day that has a total row.
  -- Using < p_date (not = p_date-1) so gap days don't reset the balance to 0.
  SELECT COALESCE(closing_balance, 0) INTO prev_closing
  FROM chamunda_sheet
  WHERE date < p_date AND row_type = 'total'
  ORDER BY date DESC
  LIMIT 1;

  -- Opening Cash In Hand — UPDATE first so stale values are always corrected,
  -- INSERT only if the row doesn't exist yet.
  UPDATE chamunda_sheet
     SET opening_amount = prev_closing
   WHERE date = p_date AND row_type = 'opening_cash';

  IF NOT FOUND THEN
    INSERT INTO chamunda_sheet (date, row_type, sort_order, opening_name, opening_amount)
    VALUES (p_date, 'opening_cash', 10, 'Cash In Hand', prev_closing);
  END IF;

  -- Opening HDFC
  IF NOT EXISTS (SELECT 1 FROM chamunda_sheet WHERE date = p_date AND row_type = 'opening_hdfc') THEN
    INSERT INTO chamunda_sheet (date, row_type, sort_order, opening_name, opening_amount)
    VALUES (p_date, 'opening_hdfc', 20, 'SKT/KT/NSS/RT HDFC', 0);
  END IF;

  -- Opening L-15
  IF NOT EXISTS (SELECT 1 FROM chamunda_sheet WHERE date = p_date AND row_type = 'opening_l15') THEN
    INSERT INTO chamunda_sheet (date, row_type, sort_order, opening_name, opening_amount)
    VALUES (p_date, 'opening_l15', 30, 'L-15', 0);
  END IF;

  -- Total row
  IF NOT EXISTS (SELECT 1 FROM chamunda_sheet WHERE date = p_date AND row_type = 'total') THEN
    INSERT INTO chamunda_sheet (date, row_type, sort_order)
    VALUES (p_date, 'total', 9999);
  END IF;

  -- Expense rows for every active expense master (IF NOT EXISTS per expense)
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

-- 4. Re-run recalculate for today and yesterday to fix any stale totals
SELECT recalculate_chamunda_totals(CURRENT_DATE);
SELECT recalculate_chamunda_totals(CURRENT_DATE - 1);
