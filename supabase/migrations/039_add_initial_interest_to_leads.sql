-- Add initial_interest text field to leads table
-- Free-text field capturing what the customer initially expressed interest in.
-- Nullable, no constraints — filled optionally during manual lead creation.

alter table public.leads
  add column if not exists initial_interest text;
