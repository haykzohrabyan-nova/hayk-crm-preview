-- Add sales_notes column to leads for Sales reps to record their own notes
-- on a lead (separate from the SDR's sdr_comment field).
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sales_notes text;
