-- ─────────────────────────────────────────────────────────────────────────────
-- Performance indexes — 2026-06-13
--
-- Rationale: every list page sorts by updated_at DESC, and the routed-leads
-- tab filters activities by type on every load. These indexes eliminate full
-- table scans and in-memory sorts on the three highest-traffic tables.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── leads ─────────────────────────────────────────────────────────────────────

-- Most leads list queries are:
--   WHERE is_inbox = false AND status = ? ORDER BY updated_at DESC
-- A single composite index serves all three clauses and eliminates the sort.
-- Covers: all tabs (All, Follow Up, On Hold, Rejected), urgency sort pass 1,
--         routed/won tab base queries.
create index if not exists leads_inbox_status_updated_idx
  on public.leads (is_inbox, status, updated_at desc);

-- For sales tab: is_inbox + status + sales_status are all filtered together.
create index if not exists leads_inbox_status_sales_status_idx
  on public.leads (is_inbox, status, sales_status);

-- Standalone updated_at for ORDER BY when filters don't match the composite.
create index if not exists leads_updated_at_idx
  on public.leads (updated_at desc);

-- ── customers ─────────────────────────────────────────────────────────────────

-- CRM page always ORDER BY updated_at DESC. Without this, Postgres sorts the
-- full filtered result set in memory on every page load.
create index if not exists customers_updated_at_idx
  on public.customers (updated_at desc);

-- CRM heat_tag filter is applied alongside ORDER BY updated_at.
create index if not exists customers_heat_tag_updated_idx
  on public.customers (heat_tag, updated_at desc)
  where heat_tag is not null;

-- ── job_tickets ───────────────────────────────────────────────────────────────

-- Orders, Production, Completed, and Payments pages filter by ticket_status
-- and sort by updated_at / created_at. This composite serves all of them.
create index if not exists tickets_status_updated_idx
  on public.job_tickets (ticket_status, updated_at desc);

-- Standalone updated_at for ORDER BY when filters use partial indexes instead.
create index if not exists tickets_updated_at_idx
  on public.job_tickets (updated_at desc);

-- Tax-exempt payment queue: tax_exempt + sales_permit_reviewed_at IS NULL.
-- The existing payment_evidence_pending partial index covers payment evidence;
-- this one mirrors it for the tax-exempt side.
create index if not exists tickets_tax_exempt_pending_idx
  on public.job_tickets (tax_exempt, sales_permit_reviewed_at)
  where tax_exempt = true and sales_permit_reviewed_at is null;

-- ── activities ────────────────────────────────────────────────────────────────

-- fetchRoutedToSalesLeadIds does WHERE type = 'lead_routed_to_sales' on every
-- routed-tab page load with no index — full activities table scan each time.
create index if not exists activities_type_idx
  on public.activities (type);

-- Composite for the most common activity query pattern: type + lead_id.
create index if not exists activities_type_lead_idx
  on public.activities (type, lead_id)
  where lead_id is not null;
