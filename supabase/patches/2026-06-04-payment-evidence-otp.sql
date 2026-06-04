-- Payment proof resubmit OTP portal (apply on existing DBs only)
-- See supabase/migrations/README.md and docs/api-contract.md (Public Evidence Routes)

alter table public.job_tickets
  add column if not exists payment_evidence_resubmit_token text,
  add column if not exists payment_evidence_otp_hash text,
  add column if not exists payment_evidence_otp_expires_at timestamptz;

create unique index if not exists job_tickets_payment_evidence_resubmit_token_key
  on public.job_tickets (payment_evidence_resubmit_token)
  where payment_evidence_resubmit_token is not null;
