-- Track the original SDR who routed a high-value quote to Sales.
-- When Sales claims the ticket, created_by_id changes to the Sales rep,
-- so this column preserves the SDR's identity for visibility / read-only access.

alter table public.job_tickets
  add column if not exists routed_by_id uuid references auth.users(id);

comment on column public.job_tickets.routed_by_id is
  'Set to the creating SDR''s user ID when ticket_status is routed. '
  'Preserved after Sales claims the ticket (created_by_id changes).';
