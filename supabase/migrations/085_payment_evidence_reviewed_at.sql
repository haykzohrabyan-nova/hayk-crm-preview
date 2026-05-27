-- Keep payment evidence after accountant approval; track review state for Payments tabs.

alter table public.job_tickets
  add column if not exists payment_evidence_reviewed_at timestamptz;

-- Best-effort backfill for rows that still have evidence + paid timestamp
update public.job_tickets
set payment_evidence_reviewed_at = payment_paid_at
where payment_evidence_url is not null
  and payment_paid_at is not null
  and payment_evidence_reviewed_at is null;

drop index if exists public.job_tickets_payment_evidence_pending_idx;
create index if not exists job_tickets_payment_evidence_pending_idx
  on public.job_tickets(ticket_status)
  where payment_evidence_url is not null and payment_evidence_reviewed_at is null;
