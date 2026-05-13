-- ─────────────────────────────────────────────────────────────────────────────
-- 045 — Company settings table
--
-- Single-row config table for values that are admin-configurable but global
-- to the whole system. Seeded with one row (id = 1) — never INSERT again.
--
-- Used by:
--   • OrderDrawer    — default_tax_rate, high_value_threshold, rush_surcharge
--   • PDF export     — company_name, address, phone, email, logo_url, website
--   • Sidebar / UI   — company_name, logo_url (optional branding use)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.company_settings (
  id                      int         primary key default 1
                                      check (id = 1),          -- enforce single row
  company_name            text        not null default '',
  address_line1           text,
  address_line2           text,
  city                    text,
  state                   text,
  zip                     text,
  phone                   text,
  email                   text,
  website                 text,
  logo_url                text,

  -- OrderDrawer defaults (admin-configurable, rep can override per quote)
  default_tax_rate        numeric     not null default 8.25,   -- percent, e.g. 8.25 = 8.25%
  high_value_threshold    numeric     not null default 5000,   -- SDR hard-block amount in $
  rush_surcharge_percent  numeric,                             -- null = rush is badge-only, no price impact

  updated_at              timestamptz not null default now()
);

-- Seed the single config row
insert into public.company_settings (id) values (1)
  on conflict (id) do nothing;

-- Trigger to keep updated_at current
create trigger set_company_settings_updated_at
  before update on public.company_settings
  for each row execute function public.set_updated_at();

-- RLS
alter table public.company_settings enable row level security;

-- All authenticated users can read (needed for OrderDrawer tax rate + threshold)
create policy "authenticated_read_company_settings" on public.company_settings
  for select using (auth.uid() is not null);

-- Admin only can update
create policy "admin_update_company_settings" on public.company_settings
  for update using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- No INSERT / DELETE policies — the single row is seeded here and never changed
