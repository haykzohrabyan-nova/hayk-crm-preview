-- ─────────────────────────────────────────────────────────────────────────────
-- 042 — Extend job_tickets + order sequence counters
--
-- Adds all columns required by the Quotes & Orders module (Phase 2a).
-- Existing columns (subtotal, discount_percent, discount_amount, total,
-- payment_type, prepay_amount, product_lines, follow_up_at) are preserved
-- as nullable for backwards compatibility.
--
-- Also:
--   • Creates order_sequence_counters (for ORD-YYYY-NNN reference codes)
--   • Replaces the overly-broad job_tickets SELECT policy with scoped policies:
--       - each rep sees only tickets they created (created_by_id = auth.uid())
--       - admin sees all
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. New columns on job_tickets ────────────────────────────────────────────

alter table public.job_tickets

  -- Identity
  add column if not exists title                  text,
  add column if not exists reference_code         text,
  add column if not exists contact_phone          text,

  -- Quote delivery channel
  add column if not exists quote_channel          text,
  add column if not exists quote_destination      text,

  -- Richer pricing (replaces the legacy subtotal / total / discount_* columns)
  add column if not exists quote_subtotal         numeric,
  add column if not exists quote_shipping         numeric        default 0,
  add column if not exists discount_type          text,         -- 'percent' | 'fixed'
  add column if not exists discount_value         text,         -- stored as text; parsed at runtime
  add column if not exists discount_reason        text,
  add column if not exists quote_pre_tax_total    numeric,
  add column if not exists quote_tax_rate_percent numeric,
  add column if not exists quote_tax_amount       numeric,
  add column if not exists quote_final_total      numeric,
  add column if not exists tax_exempt             boolean        not null default false,
  add column if not exists sales_permit_number    text,

  -- Payment (replaces single payment_type text with array + prepayment detail)
  add column if not exists quote_payment_types    text[]         not null default '{}',
  add column if not exists prepayment_type        text,         -- 'percent' | 'fixed'
  add column if not exists prepayment_value       text,         -- stored as text; parsed at runtime

  -- Follow-up scheduling (extends existing follow_up_at)
  add column if not exists quote_reminder_date    date,
  add column if not exists follow_up_cycles       int,
  add column if not exists follow_up_frequency    text,         -- 'Daily' | 'Every 2 days' | 'Weekly'

  -- Order-specific fields
  add column if not exists order_source           text,         -- 'quoted' | 'direct'
  add column if not exists due_date               date,
  add column if not exists priority               text,         -- 'Low' | 'Normal' | 'High'
  add column if not exists special_requirements   text,
  add column if not exists design_required        boolean        not null default false,
  add column if not exists die_cut                boolean        not null default false;


-- ── 2. order_sequence_counters ───────────────────────────────────────────────
-- One row per calendar year; incremented atomically when a new order is created.
-- Used to generate reference codes in the format ORD-{YYYY}-{NNN}.

create table if not exists public.order_sequence_counters (
  year        int  primary key,
  last_number int  not null default 0
);

-- Service role only — this table is touched exclusively by the admin client
-- in the POST /api/tickets route handler.
alter table public.order_sequence_counters enable row level security;

-- No SELECT/INSERT/UPDATE policies for regular users; only service_role bypasses RLS.
-- The API route uses the admin (service-role) client, so no policy is needed here.


-- ── 3. Update job_tickets RLS — scoped visibility ────────────────────────────
-- Owner decision A1/A2 (2026-05-11): each rep sees only tickets they created;
-- admin sees all. Replace the old catch-all "authenticated_read_tickets" policy.

drop policy if exists "authenticated_read_tickets" on public.job_tickets;

-- Reps: own tickets only
create policy "rep_read_own_tickets" on public.job_tickets
  for select
  using (created_by_id = auth.uid());

-- Admin: all tickets
create policy "admin_read_all_tickets" on public.job_tickets
  for select
  using (public.current_user_role() = 'admin');

-- INSERT: any authenticated user can create a ticket
-- (existing "authenticated_insert_tickets" policy is unchanged — keep it)

-- UPDATE: owner or admin (existing "owner_admin_update_tickets" policy is unchanged)


-- ── 4. Index on reference_code ───────────────────────────────────────────────
-- Lookups by order reference number (e.g. "ORD-2026-001") need to be fast.

create unique index if not exists tickets_reference_code_idx
  on public.job_tickets(reference_code)
  where reference_code is not null;

create index if not exists tickets_created_by_idx
  on public.job_tickets(created_by_id);
