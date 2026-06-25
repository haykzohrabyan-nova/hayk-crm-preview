-- ── webhook_lead_log ─────────────────────────────────────────────────────────
-- Tracks every inbound POST to /api/webhook/leads so the admin panel can show
-- delivery status, errors, and the original JSON payload for troubleshooting.
-- raw_payload can be cleared at any time (set to null) via the admin "Clear Payloads" action.

create table if not exists public.webhook_lead_log (
  id          uuid        primary key default gen_random_uuid(),
  -- 'accepted' = lead created successfully; 'failed' = validation or DB error
  status      text        not null check (status in ('accepted', 'failed')),
  http_status int         not null,           -- HTTP status code returned to caller
  error_message text,                         -- validation or DB error message
  raw_payload jsonb,                          -- original JSON body (nullable — can be cleared)
  lead_id     uuid        references public.leads(id) on delete set null,
  customer_id uuid        references public.customers(id) on delete set null,
  received_at timestamptz not null default now()
);

create index if not exists webhook_lead_log_received_at_idx on public.webhook_lead_log (received_at desc);
create index if not exists webhook_lead_log_status_idx      on public.webhook_lead_log (status);
create index if not exists webhook_lead_log_lead_id_idx     on public.webhook_lead_log (lead_id);

-- Admin-only: only service-role (server) reads/writes this table.
alter table public.webhook_lead_log enable row level security;

create policy "admin only" on public.webhook_lead_log
  using (false)
  with check (false);
