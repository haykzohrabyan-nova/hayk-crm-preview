-- Migration 052: Add public_token to job_tickets
-- Each ticket gets a unique, unguessable UUID used for the public customer-facing quote URL (/q/[token]).
-- Existing rows get gen_random_uuid() automatically via the DEFAULT.

ALTER TABLE public.job_tickets
  ADD COLUMN IF NOT EXISTS public_token uuid DEFAULT gen_random_uuid() NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS job_tickets_public_token_idx
  ON public.job_tickets (public_token);
