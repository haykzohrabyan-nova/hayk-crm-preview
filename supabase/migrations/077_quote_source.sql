-- Direct quotes (Quotes page) store source/authority on the ticket, not only on a linked lead.
ALTER TABLE public.job_tickets
  ADD COLUMN IF NOT EXISTS quote_source text,
  ADD COLUMN IF NOT EXISTS quote_authority text;

COMMENT ON COLUMN public.job_tickets.quote_source IS 'Lead source for quotes created from the Quotes page (no linked lead).';
COMMENT ON COLUMN public.job_tickets.quote_authority IS 'Decision-maker flag for quotes created from the Quotes page.';
