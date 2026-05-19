-- Add has_design JSONB column to leads to store per-product design flag
-- Shape: { "Labels": true, "Boxes": false } — keyed by product type name

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS has_design jsonb NOT NULL DEFAULT '{}';
