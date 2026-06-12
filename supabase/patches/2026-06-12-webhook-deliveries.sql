-- ── webhook_deliveries ────────────────────────────────────────────────────────
-- Tracks every outbound POST to ORDER_WEBHOOK_URL so the admin panel can show
-- delivery status and allow resends. One row per attempt.

create table if not exists public.webhook_deliveries (
  id             uuid        primary key default gen_random_uuid(),
  ticket_id      uuid        not null references public.job_tickets(id) on delete cascade,
  reference_code text,
  attempt        int         not null default 1,
  -- 'success' = HTTP 2xx; 'failed' = non-2xx or network error
  status         text        not null check (status in ('success', 'failed')),
  http_status    int,        -- response status code (null = network/timeout error)
  response_body  text,       -- first 1000 chars of response body
  error_message  text,       -- network/timeout error message
  via            text,       -- how the order was created (admin_override, payment, stripe, …)
  sent_at        timestamptz not null default now()
);

create index if not exists webhook_deliveries_ticket_id_idx on public.webhook_deliveries (ticket_id);
create index if not exists webhook_deliveries_sent_at_idx   on public.webhook_deliveries (sent_at desc);
create index if not exists webhook_deliveries_status_idx    on public.webhook_deliveries (status);

-- Admin-only: only service-role (server) reads/writes this table.
alter table public.webhook_deliveries enable row level security;

-- Allow server-side admin client (service role) full access — no anon/user access.
create policy "admin only" on public.webhook_deliveries
  using (false)
  with check (false);
