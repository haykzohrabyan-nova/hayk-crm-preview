-- =============================================================================
-- BazaarPrinting CRM — Consolidated Schema
-- =============================================================================
-- Single source of truth for database DDL (Jun 2026 production state).
-- supabase/migrations/ removed — all incremental history is consolidated here.
-- Run in the Supabase SQL Editor (or `psql`) on an empty `public` schema.
--
-- Includes: tables (final column set), indexes, RLS, functions, triggers, views,
-- Realtime publication, grants, and seed data (roles, pages, role_permissions,
-- action permissions catalog, lookup values, product catalog, company_settings).
--
-- All patches applied through 2026-06-15:
--   2026-06-04 payment-evidence-otp         → columns in job_tickets
--   2026-06-09 action-permissions           → permissions + role_action_grants tables + seed
--   2026-06-09 atomic-payment-rpc           → record_ticket_payment_atomic function
--   2026-06-12 webhook-deliveries           → webhook_deliveries table
--   2026-06-13 performance-indexes          → 10 composite/partial indexes
--   2026-06-15 create-system-created-customer → data patch only (not schema, run separately)
--
-- Excludes: dev/test seed data, one-time data backfills, Storage file contents.
-- Auth users exist in auth.users (Supabase-managed) — export via Supabase Dashboard.
--
-- Safe to re-run: DDL uses IF NOT EXISTS / OR REPLACE / ON CONFLICT DO NOTHING.
-- Realtime `ADD TABLE` may log "already member" on re-run — harmless.
-- =============================================================================


-- =============================================================================
-- 1. TABLES
-- =============================================================================

-- ── roles ────────────────────────────────────────────────────────────────────

create table if not exists public.roles (
  id            uuid        primary key default gen_random_uuid(),
  name          text        not null unique,
  display_name  text        not null,
  is_system     boolean     not null default false,
  created_at    timestamptz not null default now()
);

-- ── pages ────────────────────────────────────────────────────────────────────

create table if not exists public.pages (
  id            uuid        primary key default gen_random_uuid(),
  route         text        not null unique,
  display_name  text        not null,
  icon          text,
  section       text        not null default 'main',
  sort_order    int         not null default 0,
  created_at    timestamptz not null default now()
);

-- ── role_permissions ─────────────────────────────────────────────────────────

create table if not exists public.role_permissions (
  role_id   uuid  not null references public.roles(id) on delete cascade,
  page_id   uuid  not null references public.pages(id) on delete cascade,
  primary key (role_id, page_id)
);

-- ── permissions ──────────────────────────────────────────────────────────────
-- Action-permission catalog (RBAC Slice 0 — 2026-06-09)

create table if not exists public.permissions (
  id           uuid default gen_random_uuid() primary key,
  key          text unique not null,
  display_name text not null,
  area         text not null,
  description  text,
  sort_order   int  not null default 0,
  created_at   timestamptz default now()
);

-- ── role_action_grants ────────────────────────────────────────────────────────
-- Maps roles to action permissions (many-to-many).

create table if not exists public.role_action_grants (
  role_id       uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

-- ── user_profiles ─────────────────────────────────────────────────────────────

create table if not exists public.user_profiles (
  id                    uuid        primary key references auth.users(id) on delete cascade,
  role_id               uuid        not null references public.roles(id),
  full_name             text,
  avatar_url            text,
  is_active             boolean     not null default true,
  must_change_password  boolean     not null default false,
  mfa_required          boolean     not null default true,
  dashboard_values_hidden boolean   not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ── customers ─────────────────────────────────────────────────────────────────
-- No unique constraints on phone/email intentionally:
-- Multiple customer profiles may share the same phone or email.
-- The SDR decides which profile to link to a lead during the dedup flow.

create table if not exists public.customers (
  id          uuid        primary key default gen_random_uuid(),
  first_name  text,
  last_name   text,
  email       text,
  phone       text,
  company     text,
  industry    text,
  website     text,
  authority   text,
  heat_tag    text        check (heat_tag in ('hot', 'warm', 'cold')),
  -- tax_exempt_last_* columns: added in §1b after job_tickets exists (migration 105)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── leads ─────────────────────────────────────────────────────────────────────
-- FKs reflect final state after migrations 029 (sales_owner_id) and
-- 032 (locked_by_id) re-pointed those columns to user_profiles.
-- Columns sales_notes (034) are included.

create table if not exists public.leads (
  id                    uuid        primary key default gen_random_uuid(),
  customer_id           uuid        references public.customers(id),
  source                text,
  brand                 text,
  authority             text,
  status                text        not null default 'Pending',
  sales_status          text,
  is_inbox              boolean     not null default true,
  sdr_id                uuid        references auth.users(id),
  assigned_sdr_id       uuid        references auth.users(id),
  sales_owner_id        uuid        references public.user_profiles(id) on delete set null,
  held_by_id            uuid        references auth.users(id),
  interests             jsonb       not null default '{}',
  quantities            jsonb       not null default '{}',
  quote_total           numeric,
  quote_channel         text,
  quote_destination     text,
  hold_reason           text,
  hold_notes            text,
  hold_until            timestamptz,
  held_at               timestamptz,
  follow_up_reason      text,
  follow_up_notes       text,
  follow_up_until       timestamptz,
  follow_up_at          timestamptz,
  follow_up_by_id       uuid        references auth.users(id),
  prev_status           text,
  prev_sales_status     text,
  urgency               text        check (urgency in ('High', 'Medium', 'Low')),
  is_returning_customer boolean     not null default false,
  sdr_comment           text,
  rejection_reason      text,
  rejection_notes       text,
  locked_by_id          uuid        references public.user_profiles(id) on delete set null,
  locked_at             timestamptz,
  sales_notes           text,
  has_design            jsonb       not null default '{}',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ── job_tickets ───────────────────────────────────────────────────────────────
-- Final column set includes all extensions from migration 042.
-- Legacy columns (subtotal, discount_percent, discount_amount, total,
-- payment_type, prepay_amount) kept nullable for backward compatibility.

create table if not exists public.job_tickets (
  id                                 uuid        primary key default gen_random_uuid(),
  ticket_kind                        text        not null check (ticket_kind in ('quote', 'order')),
  ticket_status                      text        not null default 'draft',
  customer_id                        uuid        references public.customers(id),
  linked_lead_id                     uuid        references public.leads(id),
  created_by_id                      uuid        references auth.users(id),

  -- Contact
  contact_email                      text,
  contact_name                       text,
  contact_company                    text,
  contact_phone                      text,

  -- Identity
  title                              text,
  reference_code                     text,

  -- Quote delivery
  quote_channel                      text,
  quote_destination                  text,

  -- Legacy pricing (kept for backward compat)
  subtotal                           numeric,
  discount_percent                   numeric,
  discount_amount                    numeric,
  total                              numeric,
  payment_type                       text,
  prepay_amount                      numeric,

  -- Rich pricing (phase 2)
  quote_subtotal                     numeric,
  quote_shipping                     numeric        default 0,
  requires_shipping                  boolean        not null default false,
  ship_to_line1                      text,
  ship_to_line2                      text,
  ship_to_city                       text,
  ship_to_state                      text,
  ship_to_zip                        text,
  discount_type                      text,           -- 'percent' | 'fixed'
  discount_value                     text,           -- stored as text; parsed at runtime
  discount_reason                    text,
  quote_pre_tax_total                numeric,
  quote_tax_rate_percent             numeric,
  quote_tax_amount                   numeric,
  quote_final_total                  numeric,
  tax_exempt                         boolean        not null default false,
  sales_permit_number                text,
  sales_permit_storage_path          text,
  sales_permit_file_name             text,
  sales_permit_mime_type             text,
  sales_permit_submitted_at          timestamptz,
  sales_permit_reviewed_at           timestamptz,
  sales_permit_reviewed_by_id        uuid           references public.user_profiles(id),
  sales_permit_denial_notes          text,
  sales_permit_reused_from_customer  boolean        not null default false,

  -- Payment
  quote_payment_types                text[]         not null default '{}',
  prepayment_type                    text,           -- 'percent' | 'fixed'
  prepayment_value                   text,           -- stored as text; parsed at runtime

  -- Line items (relational — see ticket_line_items)
  product_lines                      jsonb          not null default '[]',

  -- Flags
  rush                               boolean        not null default false,

  -- Follow-up
  follow_up_at                       timestamptz,
  follow_up_completed                boolean        not null default false,
  quote_reminder_date                date,
  follow_up_cycles                   int,
  follow_up_frequency                text,           -- 'Daily' | 'Every 2 days' | 'Weekly'

  -- Client confirmation
  client_confirmed                   boolean        not null default false,
  quote_approval_last_requested_at   timestamptz,

  -- Order-specific
  order_source                       text,           -- 'quoted' | 'direct'
  due_date                           date,
  priority                           text,           -- 'Low' | 'Normal' | 'High'
  special_requirements               text,
  design_required                    boolean        not null default false,
  die_cut                            boolean        not null default false,

  -- Public customer portal
  public_token                       uuid           not null default gen_random_uuid(),

  -- Payment lifecycle
  payment_status                     text           not null default 'unpaid'
                                                    check (payment_status in ('unpaid', 'partial', 'paid')),
  prepayment_status                  text           not null default 'pending'
                                                    check (prepayment_status in ('pending', 'paid')),

  -- Routing / quote metadata
  routed_by_id                       uuid           references auth.users(id),
  routed_reason                      text,
  routed_notes                       text,
  quote_source                       text,

  -- Per-ticket payment strategy (checkout / portal)
  ticket_payment_strategy            text           check (ticket_payment_strategy in ('partial', 'full', 'net')),
  ticket_deposit_type                text           check (ticket_deposit_type in ('percent', 'fixed')),
  ticket_deposit_value               numeric,
  ticket_dep_handling                text           check (ticket_dep_handling in ('cash', 'gateway')),
  ticket_receipt_id                  text,
  ticket_partial_channels            text[],
  ticket_full_channels               text[],
  ticket_require_client_confirm      boolean,
  ticket_net_terms_label             text,
  ticket_quote_channel               text           check (ticket_quote_channel in ('sms', 'email', 'both')),
  ticket_dest_phone                  text,
  ticket_dest_email                  text,
  ticket_follow_up_enabled           boolean,
  ticket_follow_up_count             integer,
  ticket_follow_up_freq              text           check (ticket_follow_up_freq in ('daily', 'every-3-days', 'weekly')),

  -- Payment recording
  payment_amount_received            numeric,
  payment_paid_at                    timestamptz,
  payment_method_used                text,
  deposit_amount                     numeric,
  deposit_paid_at                    timestamptz,
  deposit_receipt_id                 text,
  deposit_method                     text,
  balance_paid_at                    timestamptz,
  production_released_at             timestamptz,

  -- Customer-submitted payment evidence (accountant review queue)
  payment_evidence_url               text,
  payment_evidence_submitted_at      timestamptz,
  payment_evidence_amount            numeric,
  payment_evidence_reviewed_at       timestamptz,
  payment_evidence_resubmit_requested_at     timestamptz,
  payment_evidence_resubmit_requested_by_id  uuid           references public.user_profiles(id),
  payment_evidence_resubmit_reason           text,
  payment_evidence_resubmit_received_at      timestamptz,
  payment_evidence_resubmit_token            text,
  payment_evidence_otp_hash                  text,
  payment_evidence_otp_expires_at            timestamptz,
  sales_permit_resubmit_token                text,
  sales_permit_otp_hash                      text,
  sales_permit_otp_expires_at                timestamptz,
  sales_permit_resubmit_requested_at         timestamptz,
  sales_permit_resubmit_requested_by_id      uuid           references public.user_profiles(id),
  sales_permit_resubmit_reason               text,
  sales_permit_resubmit_received_at          timestamptz,

  -- Cancellation audit (migration 088)
  cancel_reason                      text,
  cancel_reason_label                text,
  cancel_notes                       text,
  cancelled_at                       timestamptz,

  -- Stripe Checkout (097)
  stripe_checkout_session_id         text,
  stripe_payment_intent_id           text,
  stripe_charge_id                   text,
  stripe_payment_status              text,
  stripe_amount_cents                integer,
  stripe_card_brand                  text,
  stripe_card_last4                  text,
  stripe_receipt_url                 text,
  stripe_customer_email              text,

  -- Stripe refund tracking (098)
  stripe_amount_refunded_cents       integer        not null default 0,
  stripe_last_refund_reason          text,
  stripe_last_refund_notes           text,
  stripe_last_refunded_at            timestamptz,

  -- Unified payment refunds (100)
  refund_status                      text           not null default 'none'
                                       check (refund_status in ('none', 'partial', 'full')),
  total_refunded_amount              numeric        not null default 0,
  last_refunded_at                   timestamptz,
  last_refunded_by_id                uuid           references auth.users(id),

  notes                              text,
  created_at                         timestamptz    not null default now(),
  updated_at                         timestamptz    not null default now()
);

-- ── ticket_line_items (migration 089) ────────────────────────────────────────

create table if not exists public.ticket_line_items (
  id               uuid        primary key default gen_random_uuid(),
  ticket_id        uuid        not null references public.job_tickets(id) on delete cascade,
  sort_order       int         not null default 0,
  product_type     text        not null default '',
  description      text,
  material         text,
  lamination       text,
  color_mode       text,
  sides            text,
  roll_direction   text,
  width            numeric,
  height           numeric,
  quantity         numeric,
  unit_price       numeric,
  line_total       numeric,
  design_required  boolean     not null default false,
  die_cut          boolean     not null default false,
  spot_uv          boolean     not null default false,
  foil             boolean     not null default false,
  perforation      boolean     not null default false,
  comment          text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.ticket_line_variants (
  id            uuid        primary key default gen_random_uuid(),
  line_item_id  uuid        not null references public.ticket_line_items(id) on delete cascade,
  ticket_id     uuid        not null references public.job_tickets(id) on delete cascade,
  sort_order    int         not null default 0,
  name          text        not null,
  quantity      numeric     not null check (quantity > 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.ticket_files (
  id              uuid        primary key default gen_random_uuid(),
  ticket_id       uuid        not null references public.job_tickets(id) on delete cascade,
  line_item_id    uuid        not null references public.ticket_line_items(id) on delete cascade,
  variant_id      uuid        references public.ticket_line_variants(id) on delete cascade,
  storage_path    text        not null,
  file_name       text        not null,
  mime_type       text        not null,
  byte_size       bigint,
  uploaded_by_id  uuid        references auth.users(id),
  created_at      timestamptz not null default now(),
  constraint ticket_files_variant_id_key unique (variant_id)
);

-- ── ticket_shipping_destinations (migration 093) ───────────────────────────

create table if not exists public.ticket_shipping_destinations (
  id              uuid        primary key default gen_random_uuid(),
  ticket_id       uuid        not null references public.job_tickets(id) on delete cascade,
  sort_order      int         not null default 0,
  shipping_amount numeric     not null default 0,
  ship_to_line1   text,
  ship_to_line2   text,
  ship_to_city    text,
  ship_to_state   text,
  ship_to_zip     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── ticket_payment_refunds (migration 100) ────────────────────────────────────

create table if not exists public.ticket_payment_refunds (
  id               uuid        primary key default gen_random_uuid(),
  ticket_id        uuid        not null references public.job_tickets(id) on delete cascade,
  amount           numeric     not null check (amount > 0),
  payment_mode     text        not null check (payment_mode in ('deposit', 'balance', 'full')),
  method           text        not null,
  source           text        not null check (source in ('stripe', 'manual')),
  stripe_refund_id text,
  reason           text        not null,
  notes            text,
  evidence_path    text,
  refunded_by_id   uuid        references auth.users(id),
  created_at       timestamptz not null default now()
);

-- ── activities ────────────────────────────────────────────────────────────────
-- by_user_id FK points to user_profiles (migration 040), not auth.users,
-- so PostgREST can auto-join profile data in embedded selects.

create table if not exists public.activities (
  id          uuid        primary key default gen_random_uuid(),
  customer_id uuid        references public.customers(id),
  lead_id     uuid        references public.leads(id),
  ticket_id   uuid        references public.job_tickets(id),
  type        text        not null,
  channel     text,
  by_user_id  uuid        references public.user_profiles(id) on delete set null,
  payload     jsonb       not null default '{}',
  created_at  timestamptz not null default now()
);

-- ── notifications ─────────────────────────────────────────────────────────────

create table if not exists public.notifications (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  type        text        not null,
  title       text        not null,
  body        text,
  read        boolean     not null default false,
  payload     jsonb       not null default '{}',
  created_at  timestamptz not null default now()
);

-- ── lookup_values ─────────────────────────────────────────────────────────────

create table if not exists public.lookup_values (
  id          uuid        primary key default gen_random_uuid(),
  category    text        not null,
  value       text        not null,
  label       text        not null,
  sort_order  int         not null default 0,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  unique (category, value)
);

-- ── product_types ─────────────────────────────────────────────────────────────

create table if not exists public.product_types (
  id                 text        primary key,
  name               text        not null unique,
  default_print_type text        not null default 'Sheet'
                                 check (default_print_type in ('Roll', 'Sheet')),
  facility           text        not null default 'all',
  sort_order         int         not null default 0,
  is_active          boolean     not null default true,
  notes              text,
  created_at         timestamptz not null default now()
);

-- ── material_groups ───────────────────────────────────────────────────────────

create table if not exists public.material_groups (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null unique,
  facility   text,
  sort_order int         not null default 0,
  is_active  boolean     not null default true
);

-- ── materials ─────────────────────────────────────────────────────────────────

create table if not exists public.materials (
  id           text        primary key,
  name         text        not null,
  group_id     uuid        references public.material_groups(id) on delete set null,
  category     text,
  facility     text        not null default 'all',
  sort_order   int         not null default 0,
  is_active    boolean     not null default true,
  default_unit text        not null default 'sheets',
  created_at   timestamptz not null default now()
);

-- ── product_material_links ────────────────────────────────────────────────────

create table if not exists public.product_material_links (
  product_type_id text references public.product_types(id) on delete cascade,
  material_id     text references public.materials(id)     on delete cascade,
  primary key (product_type_id, material_id)
);

-- ── order_sequence_counters ───────────────────────────────────────────────────
-- One row per calendar year; atomically incremented when a new order is created.
-- Used to generate ORD-{YYYY}-{NNN} reference codes.

create table if not exists public.order_sequence_counters (
  year        int  primary key,
  last_number int  not null default 0
);

-- ── company_settings ──────────────────────────────────────────────────────────
-- Single-row config table enforced by check (id = 1).

create table if not exists public.company_settings (
  id                      int         primary key default 1
                                      check (id = 1),
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
  default_tax_rate                 numeric     not null default 8.25,
  high_value_threshold             numeric     not null default 5000,
  rush_surcharge_percent           numeric,
  session_idle_timeout_minutes     integer     not null default 20
                                   check (session_idle_timeout_minutes >= 5 and session_idle_timeout_minutes <= 480),
  bank_name                        text,
  bank_account_name                text,
  bank_account_number              text,
  bank_routing_number              text,
  zelle_phone                      text,
  zelle_email                      text,
  updated_at                       timestamptz not null default now()
);

-- ── sms_templates ─────────────────────────────────────────────────────────────
-- Admin-editable SMS / WhatsApp bodies (Twilio). Keys match lib/integrations/sms-template-catalog.ts.

create table if not exists public.sms_templates (
  template_key text        primary key,
  body         text        not null,
  updated_at   timestamptz not null default now()
);

-- ── email_templates ───────────────────────────────────────────────────────────
-- Admin-editable customer email bodies (Instantly). Keys match email-template-catalog.ts.

create table if not exists public.email_templates (
  template_key text        primary key,
  subject      text        not null,
  body         text        not null,
  cta_label    text        not null default '',
  updated_at   timestamptz not null default now()
);

-- ── user_sessions ─────────────────────────────────────────────────────────────
-- One row per login session; populated by POST /api/auth/session.

create table if not exists public.user_sessions (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users(id) on delete cascade,
  signed_in_at      timestamptz not null default now(),
  signed_out_at     timestamptz,
  sign_out_reason   text        check (sign_out_reason in ('manual', 'auto', 'deactivated', 'unknown')),
  created_at        timestamptz not null default now()
);

-- ── mfa_trusted_devices ───────────────────────────────────────────────────────
-- Trusted-device tokens (service role only — no RLS policies).

create table if not exists public.mfa_trusted_devices (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  token_hash   text        not null,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

-- ── quote_sequence_counters ───────────────────────────────────────────────────
-- One row per calendar year; atomically incremented for QUO-YYYY-NNNN codes.

create table if not exists public.quote_sequence_counters (
  year        int  primary key,
  last_number int  not null default 0
);


-- ── webhook_deliveries ────────────────────────────────────────────────────────
-- Tracks every outbound POST to ORDER_WEBHOOK_URL (2026-06-12)

create table if not exists public.webhook_deliveries (
  id             uuid        primary key default gen_random_uuid(),
  ticket_id      uuid        not null references public.job_tickets(id) on delete cascade,
  reference_code text,
  attempt        int         not null default 1,
  status         text        not null check (status in ('success', 'failed')),
  http_status    int,
  response_body  text,
  error_message  text,
  via            text,
  sent_at        timestamptz not null default now()
);

create index if not exists webhook_deliveries_ticket_id_idx on public.webhook_deliveries (ticket_id);
create index if not exists webhook_deliveries_sent_at_idx   on public.webhook_deliveries (sent_at desc);
create index if not exists webhook_deliveries_status_idx    on public.webhook_deliveries (status);


-- =============================================================================
-- 1b. DEFERRED COLUMNS — FKs that require job_tickets to exist first (105, 103–108)
-- =============================================================================

alter table public.job_tickets
  add column if not exists sales_permit_storage_path text,
  add column if not exists sales_permit_file_name text,
  add column if not exists sales_permit_mime_type text,
  add column if not exists sales_permit_submitted_at timestamptz,
  add column if not exists sales_permit_reviewed_at timestamptz,
  add column if not exists sales_permit_reviewed_by_id uuid references public.user_profiles(id),
  add column if not exists sales_permit_denial_notes text,
  add column if not exists sales_permit_reused_from_customer boolean not null default false;

alter table public.customers
  add column if not exists tax_exempt_last_permit_number text,
  add column if not exists tax_exempt_last_storage_path text,
  add column if not exists tax_exempt_last_file_name text,
  add column if not exists tax_exempt_last_mime_type text,
  add column if not exists tax_exempt_last_reviewed_at timestamptz,
  add column if not exists tax_exempt_last_reviewed_by_id uuid references public.user_profiles(id),
  add column if not exists tax_exempt_last_source_ticket_id uuid references public.job_tickets(id);

alter table public.job_tickets
  add column if not exists payment_evidence_resubmit_requested_at timestamptz,
  add column if not exists payment_evidence_resubmit_requested_by_id uuid references public.user_profiles(id),
  add column if not exists payment_evidence_resubmit_reason text,
  add column if not exists payment_evidence_resubmit_received_at timestamptz,
  add column if not exists payment_evidence_resubmit_token text,
  add column if not exists payment_evidence_otp_hash text,
  add column if not exists payment_evidence_otp_expires_at timestamptz,
  add column if not exists sales_permit_resubmit_token text,
  add column if not exists sales_permit_otp_hash text,
  add column if not exists sales_permit_otp_expires_at timestamptz,
  add column if not exists sales_permit_resubmit_requested_at timestamptz,
  add column if not exists sales_permit_resubmit_requested_by_id uuid references public.user_profiles(id),
  add column if not exists sales_permit_resubmit_reason text,
  add column if not exists sales_permit_resubmit_received_at timestamptz;


-- =============================================================================
-- 2. INDEXES
-- =============================================================================

-- leads
create index if not exists leads_customer_id_idx      on public.leads(customer_id);
create index if not exists leads_status_idx           on public.leads(status);
create index if not exists leads_sales_status_idx     on public.leads(sales_status);
create index if not exists leads_is_inbox_idx         on public.leads(is_inbox);
create index if not exists leads_sdr_id_idx           on public.leads(sdr_id);
create index if not exists leads_assigned_sdr_id_idx  on public.leads(assigned_sdr_id);
create index if not exists leads_sales_owner_id_idx   on public.leads(sales_owner_id);
create index if not exists leads_locked_by_id_idx     on public.leads(locked_by_id);
create index if not exists leads_created_at_idx       on public.leads(created_at desc);
create index if not exists leads_prev_status_idx      on public.leads(prev_status) where prev_status is not null;

-- customers
create index if not exists customers_phone_idx   on public.customers(phone);
create index if not exists customers_email_idx   on public.customers(email);
create index if not exists customers_company_idx on public.customers(company);

-- job_tickets
create index if not exists tickets_customer_id_idx    on public.job_tickets(customer_id);
create index if not exists tickets_lead_id_idx        on public.job_tickets(linked_lead_id);
create index if not exists tickets_kind_idx           on public.job_tickets(ticket_kind);
create index if not exists tickets_status_idx         on public.job_tickets(ticket_status);
create index if not exists tickets_created_at_idx     on public.job_tickets(created_at desc);
create index if not exists tickets_created_by_idx     on public.job_tickets(created_by_id);
create unique index if not exists tickets_reference_code_idx
  on public.job_tickets(reference_code)
  where reference_code is not null;
create unique index if not exists job_tickets_public_token_idx
  on public.job_tickets(public_token);

create index if not exists job_tickets_payment_evidence_pending_idx
  on public.job_tickets(ticket_status)
  where payment_evidence_url is not null and payment_evidence_reviewed_at is null;
create index if not exists job_tickets_in_production_released_idx
  on public.job_tickets(production_released_at desc)
  where ticket_status = 'in_production';
create index if not exists job_tickets_order_status_idx
  on public.job_tickets(created_at desc)
  where ticket_status in ('order', 'cancelled');

create unique index if not exists job_tickets_stripe_checkout_session_id_key
  on public.job_tickets (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create index if not exists job_tickets_stripe_payment_intent_id_idx
  on public.job_tickets (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create index if not exists job_tickets_refund_status_idx
  on public.job_tickets (refund_status)
  where refund_status <> 'none';

create unique index if not exists job_tickets_payment_evidence_resubmit_token_key
  on public.job_tickets (payment_evidence_resubmit_token)
  where payment_evidence_resubmit_token is not null;

create unique index if not exists job_tickets_sales_permit_resubmit_token_key
  on public.job_tickets (sales_permit_resubmit_token)
  where sales_permit_resubmit_token is not null;

create index if not exists idx_ticket_shipping_destinations_ticket
  on public.ticket_shipping_destinations (ticket_id, sort_order);

create index if not exists ticket_payment_refunds_ticket_id_idx
  on public.ticket_payment_refunds (ticket_id);

create index if not exists ticket_payment_refunds_refunded_by_id_idx
  on public.ticket_payment_refunds (refunded_by_id);

-- activities
create index if not exists activities_customer_id_idx on public.activities(customer_id);
create index if not exists activities_lead_id_idx     on public.activities(lead_id);
create index if not exists activities_ticket_id_idx   on public.activities(ticket_id);
create index if not exists activities_created_at_idx  on public.activities(created_at desc);

-- notifications
create index if not exists notifications_user_id_idx  on public.notifications(user_id);
create index if not exists notifications_read_idx     on public.notifications(user_id, read);

-- lookup_values
create index if not exists lookup_values_category_idx on public.lookup_values(category, is_active, sort_order);

-- role_permissions
create index if not exists role_permissions_role_id_idx on public.role_permissions(role_id);

-- product catalog
create index if not exists product_types_sort_idx on public.product_types(sort_order);
create index if not exists materials_group_idx    on public.materials(group_id);
create index if not exists pml_prod_idx           on public.product_material_links(product_type_id);
create index if not exists pml_mat_idx            on public.product_material_links(material_id);

-- user_sessions
create index if not exists user_sessions_user_id_idx      on public.user_sessions(user_id);
create index if not exists user_sessions_signed_in_at_idx on public.user_sessions(signed_in_at desc);

-- mfa_trusted_devices
create index if not exists mfa_trusted_devices_user_id_idx    on public.mfa_trusted_devices(user_id);
create index if not exists mfa_trusted_devices_expires_at_idx on public.mfa_trusted_devices(expires_at);

-- permissions / role_action_grants
create index if not exists permissions_area_idx           on public.permissions(area, sort_order);
create index if not exists role_action_grants_role_id_idx on public.role_action_grants(role_id);

-- performance indexes (2026-06-13)
create index if not exists leads_inbox_status_updated_idx
  on public.leads (is_inbox, status, updated_at desc);
create index if not exists leads_inbox_status_sales_status_idx
  on public.leads (is_inbox, status, sales_status);
create index if not exists leads_updated_at_idx
  on public.leads (updated_at desc);
create index if not exists customers_updated_at_idx
  on public.customers (updated_at desc);
create index if not exists customers_heat_tag_updated_idx
  on public.customers (heat_tag, updated_at desc)
  where heat_tag is not null;
create index if not exists tickets_status_updated_idx
  on public.job_tickets (ticket_status, updated_at desc);
create index if not exists tickets_updated_at_idx
  on public.job_tickets (updated_at desc);
create index if not exists tickets_tax_exempt_pending_idx
  on public.job_tickets (tax_exempt, sales_permit_reviewed_at)
  where tax_exempt = true and sales_permit_reviewed_at is null;
create index if not exists activities_type_idx
  on public.activities (type);
create index if not exists activities_type_lead_idx
  on public.activities (type, lead_id)
  where lead_id is not null;


-- =============================================================================
-- 3. ENABLE ROW LEVEL SECURITY
-- =============================================================================

alter table public.roles                   enable row level security;
alter table public.pages                   enable row level security;
alter table public.role_permissions        enable row level security;
alter table public.user_profiles           enable row level security;
alter table public.customers               enable row level security;
alter table public.leads                   enable row level security;
alter table public.job_tickets             enable row level security;
alter table public.activities              enable row level security;
alter table public.notifications           enable row level security;
alter table public.lookup_values           enable row level security;
alter table public.product_types           enable row level security;
alter table public.material_groups         enable row level security;
alter table public.materials               enable row level security;
alter table public.product_material_links  enable row level security;
alter table public.order_sequence_counters enable row level security;
alter table public.quote_sequence_counters enable row level security;
alter table public.company_settings        enable row level security;
alter table public.sms_templates           enable row level security;
alter table public.email_templates         enable row level security;
alter table public.ticket_shipping_destinations enable row level security;
alter table public.user_sessions           enable row level security;
alter table public.mfa_trusted_devices     enable row level security;
alter table public.permissions             enable row level security;
alter table public.role_action_grants      enable row level security;
alter table public.webhook_deliveries      enable row level security;


-- =============================================================================
-- 4. HELPER FUNCTIONS (used by RLS policies — must be created before policies)
-- =============================================================================

create or replace function public.current_user_role()
returns text
language sql stable security definer
as $$
  select r.name
  from public.user_profiles up
  join public.roles r on r.id = up.role_id
  where up.id = auth.uid()
$$;

create or replace function public.user_can_access_route(route_path text)
returns boolean
language sql stable security definer
as $$
  select exists (
    select 1
    from public.user_profiles up
    join public.role_permissions rp on rp.role_id = up.role_id
    join public.pages p on p.id = rp.page_id
    where up.id = auth.uid()
      and p.route = route_path
  )
$$;


-- =============================================================================
-- 5. RLS POLICIES
-- =============================================================================

-- ── roles ─────────────────────────────────────────────────────────────────────

do $$ begin
  create policy "authenticated_read_roles" on public.roles
    for select using (auth.uid() is not null);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "admin_write_roles" on public.roles
    for all using (public.current_user_role() = 'admin');
exception when duplicate_object then null; end $$;

-- ── pages ─────────────────────────────────────────────────────────────────────

do $$ begin
  create policy "authenticated_read_pages" on public.pages
    for select using (auth.uid() is not null);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "admin_write_pages" on public.pages
    for all using (public.current_user_role() = 'admin');
exception when duplicate_object then null; end $$;

-- ── role_permissions ──────────────────────────────────────────────────────────

do $$ begin
  create policy "authenticated_read_role_permissions" on public.role_permissions
    for select using (auth.uid() is not null);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "admin_write_role_permissions" on public.role_permissions
    for all using (public.current_user_role() = 'admin');
exception when duplicate_object then null; end $$;

-- ── permissions ───────────────────────────────────────────────────────────────

do $$ begin
  create policy "authenticated_read_permissions" on public.permissions
    for select using (auth.uid() is not null);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "admin_write_permissions" on public.permissions
    for all using (public.current_user_role() = 'admin');
exception when duplicate_object then null; end $$;

-- ── role_action_grants ────────────────────────────────────────────────────────

do $$ begin
  create policy "authenticated_read_role_action_grants" on public.role_action_grants
    for select using (auth.uid() is not null);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "admin_write_role_action_grants" on public.role_action_grants
    for all using (public.current_user_role() = 'admin');
exception when duplicate_object then null; end $$;

-- ── webhook_deliveries ────────────────────────────────────────────────────────
-- Server-side admin client only — no row-level user access.

do $$ begin
  create policy "admin_only_webhook_deliveries" on public.webhook_deliveries
    using (false)
    with check (false);
exception when duplicate_object then null; end $$;

-- ── user_profiles ─────────────────────────────────────────────────────────────

do $$ begin
  create policy "users_read_own_profile" on public.user_profiles
    for select using (id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "admin_read_all_profiles" on public.user_profiles
    for select using (public.current_user_role() = 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "admin_update_profiles" on public.user_profiles
    for update using (public.current_user_role() = 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "admin_insert_profiles" on public.user_profiles
    for insert with check (public.current_user_role() = 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "admin_delete_profiles" on public.user_profiles
    for delete using (public.current_user_role() = 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "users_update_own_profile" on public.user_profiles
    for update using (id = auth.uid());
exception when duplicate_object then null; end $$;

-- ── customers — CRM roles only (096); service role used by API routes ─────

do $$ begin
  create policy "crm_roles_read_customers" on public.customers
    for select
    to authenticated
    using (
      exists (
        select 1
        from public.user_profiles up
        join public.roles r on r.id = up.role_id
        where up.id = auth.uid() and r.name in ('sdr', 'sales', 'admin')
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "crm_roles_write_customers" on public.customers
    for all
    to authenticated
    using (
      exists (
        select 1
        from public.user_profiles up
        join public.roles r on r.id = up.role_id
        where up.id = auth.uid() and r.name in ('sdr', 'sales', 'admin')
      )
    )
    with check (
      exists (
        select 1
        from public.user_profiles up
        join public.roles r on r.id = up.role_id
        where up.id = auth.uid() and r.name in ('sdr', 'sales', 'admin')
      )
    );
exception when duplicate_object then null; end $$;

-- ── leads ─────────────────────────────────────────────────────────────────────
-- Policies use inline EXISTS (not current_user_role()) so Supabase Realtime
-- evaluates them correctly in the subscriber's security context (migration 038).
-- Leads are permanent business records — no DELETE policy exists (migration 043).

do $$ begin
  create policy "admin_read_all_leads" on public.leads
    for select using (
      exists (
        select 1
        from public.user_profiles up
        join public.roles r on r.id = up.role_id
        where up.id = auth.uid() and r.name = 'admin'
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "sdr_read_all_leads" on public.leads
    for select using (
      exists (
        select 1
        from public.user_profiles up
        join public.roles r on r.id = up.role_id
        where up.id = auth.uid() and r.name = 'sdr'
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "sales_read_routed_leads" on public.leads
    for select using (
      exists (
        select 1
        from public.user_profiles up
        join public.roles r on r.id = up.role_id
        where up.id = auth.uid() and r.name = 'sales'
      )
      and (status = 'Routed to Sales' or sales_owner_id = auth.uid())
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "sdr_admin_insert_leads" on public.leads
    for insert with check (public.current_user_role() in ('sdr', 'admin'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "admin_update_all_leads" on public.leads
    for update
    to authenticated
    using (
      exists (
        select 1
        from public.user_profiles up
        join public.roles r on r.id = up.role_id
        where up.id = auth.uid() and r.name = 'admin'
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "sdr_update_leads" on public.leads
    for update
    to authenticated
    using (
      exists (
        select 1
        from public.user_profiles up
        join public.roles r on r.id = up.role_id
        where up.id = auth.uid() and r.name = 'sdr'
      )
      and (
        sdr_id = auth.uid()
        or locked_by_id = auth.uid()
        or locked_by_id is null
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "sales_update_leads" on public.leads
    for update
    to authenticated
    using (
      exists (
        select 1
        from public.user_profiles up
        join public.roles r on r.id = up.role_id
        where up.id = auth.uid() and r.name = 'sales'
      )
      and (
        sales_owner_id = auth.uid()
        or (status = 'Routed to Sales' and sales_owner_id is null)
      )
    );
exception when duplicate_object then null; end $$;

-- ── job_tickets ───────────────────────────────────────────────────────────────
-- Reps see own tickets; sales also see ticket_status = routed (HVT hand-off queue).
-- Admin uses inline EXISTS (not current_user_role()) for Supabase Realtime (086).
-- Quotes and orders are permanent financial records — no DELETE policy.

do $$ begin
  create policy "rep_read_own_tickets" on public.job_tickets
    for select using (created_by_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "sales_read_routed_tickets" on public.job_tickets
    for select using (
      ticket_status = 'routed'
      and exists (
        select 1
        from public.user_profiles up
        join public.roles r on r.id = up.role_id
        where up.id = auth.uid() and r.name = 'sales'
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "admin_read_all_tickets" on public.job_tickets
    for select using (
      exists (
        select 1
        from public.user_profiles up
        join public.roles r on r.id = up.role_id
        where up.id = auth.uid() and r.name = 'admin'
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "authenticated_insert_tickets" on public.job_tickets
    for insert with check (auth.uid() is not null);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "owner_admin_update_tickets" on public.job_tickets
    for update using (
      created_by_id = auth.uid()
      or public.current_user_role() = 'admin'
    );
exception when duplicate_object then null; end $$;

-- ── activities ────────────────────────────────────────────────────────────────
-- Activities are an append-only audit trail — no DELETE policy (migration 043).

do $$ begin
  create policy "staff_read_activities" on public.activities
    for select
    to authenticated
    using (
      exists (
        select 1
        from public.user_profiles up
        join public.roles r on r.id = up.role_id
        where up.id = auth.uid()
          and r.name in ('sdr', 'sales', 'admin', 'accountant')
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "authenticated_insert_activities" on public.activities
    for insert with check (auth.uid() is not null);
exception when duplicate_object then null; end $$;

-- ── notifications ─────────────────────────────────────────────────────────────

do $$ begin
  create policy "users_read_own_notifications" on public.notifications
    for select using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "users_update_own_notifications" on public.notifications
    for update using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "admin_all_notifications" on public.notifications
    for all using (public.current_user_role() = 'admin')
    with check (public.current_user_role() = 'admin');
exception when duplicate_object then null; end $$;

-- ── lookup_values ─────────────────────────────────────────────────────────────

do $$ begin
  create policy "authenticated_read_lookup_values" on public.lookup_values
    for select using (auth.uid() is not null);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "admin_write_lookup_values" on public.lookup_values
    for all using (public.current_user_role() = 'admin');
exception when duplicate_object then null; end $$;

-- ── product_types ─────────────────────────────────────────────────────────────
-- Admin-only write (migration 043 tightened this from any-authenticated).

do $$ begin
  create policy "product_types_select_all" on public.product_types
    for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "admin_all_product_types" on public.product_types
    for all
    using (public.current_user_role() = 'admin')
    with check (public.current_user_role() = 'admin');
exception when duplicate_object then null; end $$;

-- ── material_groups ───────────────────────────────────────────────────────────

do $$ begin
  create policy "material_groups_select_all" on public.material_groups
    for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "admin_all_material_groups" on public.material_groups
    for all
    using (public.current_user_role() = 'admin')
    with check (public.current_user_role() = 'admin');
exception when duplicate_object then null; end $$;

-- ── materials ─────────────────────────────────────────────────────────────────

do $$ begin
  create policy "materials_select_all" on public.materials
    for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "admin_all_materials" on public.materials
    for all
    using (public.current_user_role() = 'admin')
    with check (public.current_user_role() = 'admin');
exception when duplicate_object then null; end $$;

-- ── product_material_links ────────────────────────────────────────────────────

do $$ begin
  create policy "product_material_links_select_all" on public.product_material_links
    for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "admin_all_product_material_links" on public.product_material_links
    for all
    using (public.current_user_role() = 'admin')
    with check (public.current_user_role() = 'admin');
exception when duplicate_object then null; end $$;

-- ── order_sequence_counters ───────────────────────────────────────────────────
-- No SELECT/INSERT/UPDATE for regular users — service_role bypasses RLS.
-- Admin can inspect and correct the sequence state.

do $$ begin
  create policy "admin_all_sequence_counters" on public.order_sequence_counters
    for all
    using (public.current_user_role() = 'admin')
    with check (public.current_user_role() = 'admin');
exception when duplicate_object then null; end $$;

-- ── company_settings — admin SELECT only; app reads via service role (080, 096) ─

do $$ begin
  create policy "admin_read_company_settings" on public.company_settings
    for select
    to authenticated
    using (
      exists (
        select 1
        from public.user_profiles up
        join public.roles r on r.id = up.role_id
        where up.id = auth.uid() and r.name = 'admin'
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "admin_update_company_settings" on public.company_settings
    for update
    using (public.current_user_role() = 'admin')
    with check (public.current_user_role() = 'admin');
exception when duplicate_object then null; end $$;

-- ── user_sessions ─────────────────────────────────────────────────────────────

do $$ begin
  create policy "users_read_own_sessions" on public.user_sessions
    for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "users_insert_own_sessions" on public.user_sessions
    for insert with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "users_update_own_sessions" on public.user_sessions
    for update using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- ── quote_sequence_counters ───────────────────────────────────────────────────

do $$ begin
  create policy "admin_all_quote_sequence_counters" on public.quote_sequence_counters
    for all
    using (public.current_user_role() = 'admin')
    with check (public.current_user_role() = 'admin');
exception when duplicate_object then null; end $$;

-- mfa_trusted_devices: RLS enabled, no policies — service role only


-- =============================================================================
-- 6. TRIGGERS
-- =============================================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Drop before recreate so the file is fully idempotent
drop trigger if exists set_customers_updated_at      on public.customers;
drop trigger if exists set_leads_updated_at          on public.leads;
drop trigger if exists set_tickets_updated_at        on public.job_tickets;
drop trigger if exists set_user_profiles_updated_at  on public.user_profiles;
drop trigger if exists set_company_settings_updated_at on public.company_settings;

create trigger set_customers_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

create trigger set_leads_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

create trigger set_tickets_updated_at
  before update on public.job_tickets
  for each row execute function public.set_updated_at();

create trigger set_user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

create trigger set_company_settings_updated_at
  before update on public.company_settings
  for each row execute function public.set_updated_at();

drop trigger if exists set_sms_templates_updated_at on public.sms_templates;
create trigger set_sms_templates_updated_at
  before update on public.sms_templates
  for each row execute function public.set_updated_at();

drop trigger if exists set_email_templates_updated_at on public.email_templates;
create trigger set_email_templates_updated_at
  before update on public.email_templates
  for each row execute function public.set_updated_at();

drop trigger if exists set_ticket_shipping_destinations_updated_at on public.ticket_shipping_destinations;
create trigger set_ticket_shipping_destinations_updated_at
  before update on public.ticket_shipping_destinations
  for each row execute function public.set_updated_at();


-- =============================================================================
-- 7. VIEWS
-- =============================================================================

create or replace view public.user_profiles_with_role
with (security_invoker = true) as
  select
    up.id,
    up.role_id,
    up.full_name,
    up.avatar_url,
    up.is_active,
    up.must_change_password,
    up.mfa_required,
    up.dashboard_values_hidden,
    up.created_at,
    up.updated_at,
    r.name          as role_name,
    r.display_name  as role_display_name,
    r.is_system     as role_is_system
  from public.user_profiles up
  join public.roles r on r.id = up.role_id;


-- =============================================================================
-- 8. ADDITIONAL FUNCTIONS
-- =============================================================================

-- Atomically increments the order sequence counter for a given year and
-- returns the new sequence number. Used by POST /api/tickets to generate
-- ORD-YYYY-NNN reference codes. Called via service-role client.
create or replace function public.increment_order_sequence(p_year int)
returns int
language plpgsql
security definer
as $$
declare
  v_next int;
begin
  insert into public.order_sequence_counters (year, last_number)
  values (p_year, 1)
  on conflict (year)
  do update set last_number = order_sequence_counters.last_number + 1
  returning last_number into v_next;

  return v_next;
end;
$$;

create or replace function public.increment_quote_sequence(p_year int)
returns int
language plpgsql
security definer
as $$
declare
  v_next int;
begin
  insert into public.quote_sequence_counters (year, last_number)
  values (p_year, 1)
  on conflict (year)
  do update set last_number = quote_sequence_counters.last_number + 1
  returning last_number into v_next;

  return v_next;
end;
$$;

-- Remittance fields — service role only (080); not exposed via permissive RLS SELECT.
create or replace function public.get_company_remittance_settings()
returns json
language sql
security definer
stable
as $$
  select json_build_object(
    'bank_name', bank_name,
    'bank_account_name', bank_account_name,
    'bank_account_number', bank_account_number,
    'bank_routing_number', bank_routing_number,
    'zelle_phone', zelle_phone,
    'zelle_email', zelle_email
  )
  from public.company_settings
  where id = 1;
$$;

revoke execute on function public.get_company_remittance_settings() from public;
grant execute on function public.get_company_remittance_settings() to service_role;

revoke all on function public.increment_order_sequence(int) from public, anon, authenticated;
revoke all on function public.increment_quote_sequence(int) from public, anon, authenticated;
grant execute on function public.increment_order_sequence(int) to service_role;
grant execute on function public.increment_quote_sequence(int) to service_role;

-- Atomic payment recording — prevents double-payment race conditions (2026-06-09)
create or replace function record_ticket_payment_atomic(
  p_ticket_id   uuid,
  p_amount      numeric,
  p_mode        text,
  p_method      text,
  p_now         timestamptz,
  p_receipt_id  text default null
)
returns table (
  payment_amount_received   numeric,
  quote_final_total         numeric,
  ticket_status             text,
  deposit_paid_at           timestamptz,
  balance_paid_at           timestamptz,
  payment_paid_at           timestamptz,
  payment_status            text
)
language plpgsql security definer
as $$
declare
  v_already_paid  numeric;
  v_total         numeric;
  v_new_total     numeric;
  v_fully_paid    boolean;
begin
  select
    coalesce(t.payment_amount_received, 0),
    coalesce(t.quote_final_total, 0)
  into v_already_paid, v_total
  from job_tickets t
  where t.id = p_ticket_id
  for update;

  if not found then
    raise exception 'ticket_not_found' using errcode = 'P0002';
  end if;

  v_new_total  := least(v_already_paid + p_amount, v_total);
  v_fully_paid := v_new_total >= v_total - 0.01;

  return query
  update job_tickets t set
    payment_amount_received = v_new_total,
    updated_at              = p_now,
    deposit_amount     = case when p_mode = 'deposit' and t.deposit_paid_at is null then p_amount     else t.deposit_amount     end,
    deposit_paid_at    = case when p_mode = 'deposit' and t.deposit_paid_at is null then p_now        else t.deposit_paid_at    end,
    deposit_receipt_id = case when p_mode = 'deposit' and t.deposit_paid_at is null then p_receipt_id else t.deposit_receipt_id end,
    deposit_method     = case when p_mode = 'deposit' and t.deposit_paid_at is null then p_method     else t.deposit_method     end,
    balance_paid_at     = case when p_mode in ('balance', 'full') then p_now    else t.balance_paid_at     end,
    payment_method_used = case when p_mode in ('balance', 'full') then p_method else t.payment_method_used end,
    payment_paid_at = case when v_fully_paid and t.payment_paid_at is null then p_now else t.payment_paid_at end,
    payment_status  = case
                        when v_fully_paid       then 'paid'
                        when v_new_total > 0.01 then 'partial'
                        else t.payment_status
                      end,
    payment_evidence_reviewed_at = case
      when (t.payment_evidence_url is not null or t.stripe_payment_intent_id is not null)
           and t.payment_evidence_reviewed_at is null
      then p_now
      else t.payment_evidence_reviewed_at
    end,
    payment_evidence_resubmit_requested_at    = null,
    payment_evidence_resubmit_requested_by_id = null,
    payment_evidence_resubmit_reason          = null,
    payment_evidence_resubmit_received_at     = null,
    payment_evidence_resubmit_token           = null,
    payment_evidence_otp_hash                 = null,
    payment_evidence_otp_expires_at           = null
  where t.id = p_ticket_id
  returning
    t.payment_amount_received,
    t.quote_final_total,
    t.ticket_status,
    t.deposit_paid_at,
    t.balance_paid_at,
    t.payment_paid_at,
    t.payment_status;
end;
$$;

grant execute on function record_ticket_payment_atomic(uuid, numeric, text, text, timestamptz, text)
  to service_role;


-- =============================================================================
-- 9. GRANTS
-- =============================================================================

grant usage  on schema public                   to anon, authenticated;
grant select on public.leads                    to authenticated;
grant select on public.activities               to authenticated;
grant select on public.job_tickets              to authenticated;
grant select on public.product_types            to anon, authenticated, service_role;
grant select on public.materials                to anon, authenticated, service_role;
grant select on public.material_groups          to anon, authenticated, service_role;
grant select on public.product_material_links   to anon, authenticated, service_role;


-- =============================================================================
-- 10. REALTIME
-- =============================================================================

-- leads
alter table public.leads        replica identity full;
alter publication supabase_realtime add table public.leads;

-- activities
alter table public.activities   replica identity full;
alter publication supabase_realtime add table public.activities;

-- job_tickets
alter table public.job_tickets  replica identity full;
alter publication supabase_realtime add table public.job_tickets;

-- customers (CRM list live updates)
alter table public.customers    replica identity full;
alter publication supabase_realtime add table public.customers;


-- =============================================================================
-- 11. SEED — ROLES
-- =============================================================================

insert into public.roles (name, display_name, is_system) values
  ('sdr',        'SDR',           true),
  ('sales',      'Sales Rep',     true),
  ('admin',      'Administrator', true),
  ('accountant', 'Accountant',    true)
on conflict (name) do nothing;


-- =============================================================================
-- 12. SEED — PAGES (final nav state after all add/remove migrations)
-- =============================================================================
-- Removed: /tickets (028), /statistics (049), /settings (025), /overview (031), /production (079)
-- Sections: 'main' = sidebar nav, 'admin' = admin sidebar, 'admin-sub' = admin tabs

insert into public.pages (route, display_name, icon, section, sort_order) values
  -- Main nav
  ('/dashboard',                    'Dashboard',            'LayoutDashboard',   'main',      0),
  ('/leads',                        'Leads',                'Inbox',             'main',      1),
  ('/sales',                        'Sales Pipeline',       'Briefcase',         'main',      2),
  ('/crm',                          'CRM',                  'BookUser',          'main',      3),
  ('/payments',                     'Payments',             'CreditCard',        'main',      4),
  ('/quotes',                       'Quoted Requests',      'MessageSquareQuote','main',      5),
  ('/orders',                       'Orders',               'ClipboardList',     'main',      6),
  ('/completed',                    'Completed',            'PackageCheck',      'main',      7),
  ('/activity-log',                 'Activity Log',         'ClipboardList',     'main',      8),
  ('/reports',                      'Reports',              'BarChart3',         'main',      9),
  -- Admin sidebar entry
  ('/admin',                        'Admin Panel',          'ShieldCheck',       'admin',     0),
  -- Admin legacy sub-pages (section changed from 'admin' → 'admin-sub' in 022)
  ('/admin/users',                  'Users',                'Users',             'admin-sub', 1),
  ('/admin/roles',                  'Roles & Permissions',  'KeyRound',          'admin-sub', 2),
  ('/admin/dropdowns',              'Dropdown Options',     'ListFilter',        'admin-sub', 3),
  ('/admin/notifications',          'Notifications',        'Megaphone',         'admin-sub', 4),
  ('/admin/audit',                  'Audit Log',            'ClipboardList',     'admin-sub', 5),
  -- Admin settings routes (added in 023 + 024)
  ('/admin/settings/users',         'Users',                'Users',             'admin-sub', 10),
  ('/admin/settings/roles',         'Roles & Permissions',  'KeyRound',          'admin-sub', 20),
  ('/admin/settings/dropdowns',     'Dropdown Options',     'ListFilter',        'admin-sub', 30),
  ('/admin/settings/notifications', 'Notifications',        'Megaphone',         'admin-sub', 40),
  ('/admin/settings/audit-log',     'Audit Log',            'ClipboardList',     'admin-sub', 50),
  ('/admin/settings/company',       'Company Info',         'Building2',         'admin-sub', 60),
  ('/admin/settings/products',      'Products',             'Package',           'admin-sub', 70),
  ('/admin/settings/import-export', 'Import / Export',      'Upload',            'admin-sub', 80)
on conflict (route) do nothing;


-- =============================================================================
-- 13. SEED — ROLE PERMISSIONS
-- =============================================================================
-- Note: /quotes, /orders, /activity-log were added to nav after initial
-- permissions seeding and were never explicitly granted to SDR/Sales.
-- Admin gets all pages automatically.

-- SDR pages
insert into public.role_permissions (role_id, page_id)
select r.id, p.id
from public.roles r
cross join public.pages p
where r.name = 'sdr'
  and p.route in ('/dashboard', '/leads', '/crm', '/quotes', '/orders', '/completed')
on conflict do nothing;

-- Sales pages
insert into public.role_permissions (role_id, page_id)
select r.id, p.id
from public.roles r
cross join public.pages p
where r.name = 'sales'
  and p.route in ('/dashboard', '/sales', '/crm', '/quotes', '/orders')
on conflict do nothing;

-- Admin gets all pages
insert into public.role_permissions (role_id, page_id)
select r.id, p.id
from public.roles r
cross join public.pages p
where r.name = 'admin'
on conflict do nothing;

-- Accountant pages (payment review queue + order visibility)
insert into public.role_permissions (role_id, page_id)
select r.id, p.id
from public.roles r
cross join public.pages p
where r.name = 'accountant'
  and p.route in ('/dashboard', '/payments', '/orders', '/completed')
on conflict do nothing;


-- =============================================================================
-- 14. SEED — ACTION PERMISSIONS CATALOG (RBAC Slice 0 — 2026-06-09)
-- =============================================================================
-- Seeds the permissions catalog and grants that exactly match current hardcoded
-- behavior. NO behavior changes — existing roleName checks are untouched.

insert into public.permissions (key, display_name, area, description, sort_order) values
-- LEADS — data scope
('leads.scope.inbox_pool',  'View unclaimed inbox pool',           'leads', 'See leads not yet claimed by any SDR',                        10),
('leads.scope.own',         'View own / assigned leads',           'leads', 'See leads where you are the SDR or sales owner',              20),
('leads.scope.all',         'View all leads',                      'leads', 'See every lead regardless of ownership',                      30),
('leads.scope.routed',      'View routed-to-sales pipeline',       'leads', 'See leads routed to the sales pipeline',                      40),
-- LEADS — actions
('leads.create',            'Manually add a lead',                 'leads', 'POST /api/leads/manual',                                      50),
('leads.edit',              'Edit lead fields',                    'leads', 'PATCH /api/leads/[id]',                                       60),
('leads.lock',              'Lock / claim lead (SDR ownership)',   'leads', 'POST /api/leads/[id]/lock',                                   70),
('leads.unlock_own',        'Release own lock',                    'leads', 'POST /api/leads/[id]/unlock',                                 80),
('leads.unlock_any',        'Force-release any lock',              'leads', 'Admin-only override',                                         90),
('leads.route_to_sales',    'Route lead to Sales',                 'leads', 'Set status = Routed to Sales',                               100),
('leads.reject',            'Reject a lead',                       'leads', 'Set status = Rejected',                                      110),
('leads.hold',              'Put lead on hold',                    'leads', 'POST /api/leads/[id]/hold',                                  120),
('leads.resume',            'Resume from hold / follow-up',        'leads', 'POST /api/leads/[id]/resume',                                130),
('leads.follow_up',         'Mark follow-up later',                'leads', 'POST /api/leads/[id]/follow-up',                             140),
('leads.claim',             'Claim a routed lead (Sales)',         'leads', 'POST /api/leads/[id]/claim',                                 150),
('leads.reassign',          'Reassign lead to another SDR',        'leads', 'POST /api/leads/[id]/reassign — admin reassign',             160),
('leads.override_terminal', 'Edit rejected leads',                 'leads', 'Modify a lead in Rejected status (admin only)',               170),
-- SALES
('sales.view_pipeline',     'View the Sales pipeline',             'sales', 'Access /sales',                                               10),
('sales.hold',              'Put sales lead on hold',              'sales', 'POST /api/leads/[id]/hold with role=sales',                   20),
('sales.resume',            'Resume a sales lead',                 'sales', 'POST /api/leads/[id]/resume with role=sales',                 30),
('sales.follow_up',         'Follow up on a sales lead',           'sales', 'POST /api/leads/[id]/follow-up with role=sales',              40),
-- QUOTES
('quotes.create',              'Create a quote',                         'quotes', 'POST /api/tickets',                                    10),
('quotes.edit',                'Edit quote fields',                      'quotes', 'PATCH /api/tickets/[id]',                              20),
('quotes.send',                'Send quote to customer',                 'quotes', 'PATCH /api/tickets/[id] with send_quote=true',         30),
('quotes.claim',               'Claim a routed quote',                   'quotes', 'Sales claim of a ticket',                             40),
('quotes.cancel',              'Cancel a quote',                         'quotes', 'ticket_status=cancelled',                             50),
('quotes.upload_sales_permit', 'Upload / replace tax-exempt permit',     'quotes', 'POST /api/tickets/[id]/sales-permit',                 60),
-- ORDERS
('orders.view_own',          'View own orders',                    'orders', 'See orders where you are the creator',                        10),
('orders.view_all',          'View all orders',                    'orders', 'See every order regardless of creator',                      20),
('orders.release_production','Release order to production',        'orders', 'PATCH release_production=true',                             30),
('orders.mark_complete',     'Mark order as completed',            'orders', 'PATCH mark_completed=true',                                 40),
('orders.convert_manual',    'Manually convert quote to order',   'orders', 'Admin only',                                                 50),
('orders.cancel',            'Cancel an order',                    'orders', 'Admin + accountant',                                        60),
-- PAYMENTS
('payments.record_payment',            'Confirm / record a payment',             'payments', 'PATCH record_payment=true',                   10),
('payments.approve_tax_exempt',        'Approve tax-exempt documentation',       'payments', 'PATCH approve_tax_exempt=true',              20),
('payments.deny_tax_exempt',           'Deny tax-exempt documentation',          'payments', 'PATCH deny_tax_exempt=true',                 30),
('payments.request_resubmit',          'Request evidence / permit resubmission', 'payments', 'PATCH request_payment_evidence_resubmit=true', 40),
('payments.resend_invoice',            'Resend invoice link to customer',        'payments', 'PATCH resend_invoice=true',                  50),
('payments.send_reminder',             'Send payment reminder to customer',      'payments', 'PATCH send_payment_reminder=true',           60),
('payments.view_evidence',             'View payment & refund evidence files',   'payments', 'GET /api/tickets/[id]/evidence',             70),
('payments.view_sales_permit',         'View / download tax-exempt permit file', 'payments', 'GET /api/tickets/[id]/sales-permit',         80),
('payments.refund',                    'Issue a refund',                         'payments', 'POST /api/tickets/[id]/refund',              90),
-- CRM
('crm.view',   'View customer profiles',    'crm', 'Read customer details and history',        10),
('crm.edit',   'Edit customer information', 'crm', 'PATCH /api/customers/[id]',               20),
('crm.merge',  'Merge duplicate customers', 'crm', 'POST /api/customers/[id]/merge',          30),
('crm.create', 'Create a new customer',     'crm', 'POST /api/customers during lead creation', 40),
-- ADMIN
('admin.manage_users',        'Manage users',                  'admin', 'Create, edit, deactivate users',  10),
('admin.manage_roles',        'Manage roles & permissions',    'admin', 'Edit role grants',                20),
('admin.manage_dropdowns',    'Manage dropdown options',       'admin', 'Lookup values CRUD',              30),
('admin.manage_products',     'Manage product catalog',        'admin', 'Product types, materials',        40),
('admin.manage_company',      'Edit company info',             'admin', 'Company settings',                50),
('admin.import_export',       'Bulk import / export data',     'admin', 'Lead, customer, order import',   60),
('admin.view_audit_log',      'View audit / activity log',     'admin', 'Activity log full access',        70),
('admin.manage_webhooks',     'Manage outbound webhooks',      'admin', 'Webhook delivery panel + resend', 80),
('admin.view_dashboard',      'View admin dashboard metrics',  'admin', 'Team sessions, counters',         90),
('admin.view_reports',        'View reports',                  'admin', 'Reports page',                   100)
on conflict (key) do nothing;

-- ── Role grants (mirrors current hardcoded behavior) ──────────────────────────

-- SDR grants
insert into public.role_action_grants (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.name = 'sdr' and p.key in (
  'leads.scope.inbox_pool','leads.scope.own',
  'leads.create','leads.edit','leads.lock','leads.unlock_own',
  'leads.route_to_sales','leads.reject','leads.hold','leads.resume','leads.follow_up',
  'leads.reassign',
  'quotes.create','quotes.edit','quotes.send','quotes.cancel','quotes.upload_sales_permit',
  'orders.view_own',
  'crm.view','crm.create'
) on conflict do nothing;

-- Sales grants
insert into public.role_action_grants (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.name = 'sales' and p.key in (
  'leads.scope.own','leads.scope.routed',
  'leads.edit','leads.hold','leads.resume','leads.follow_up','leads.claim',
  'sales.view_pipeline','sales.hold','sales.resume','sales.follow_up',
  'quotes.create','quotes.edit','quotes.send','quotes.claim','quotes.cancel','quotes.upload_sales_permit',
  'orders.view_own',
  'payments.resend_invoice','payments.send_reminder',
  'crm.view','crm.create','crm.edit'
) on conflict do nothing;

-- Accountant grants
insert into public.role_action_grants (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.name = 'accountant' and p.key in (
  'orders.view_all','orders.mark_complete','orders.cancel',
  'payments.record_payment','payments.approve_tax_exempt','payments.deny_tax_exempt',
  'payments.request_resubmit','payments.resend_invoice','payments.send_reminder',
  'payments.view_evidence','payments.view_sales_permit','payments.refund',
  'crm.view','crm.edit'
) on conflict do nothing;

-- Admin gets all permissions
insert into public.role_action_grants (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.name = 'admin'
on conflict do nothing;


-- =============================================================================
-- 15. SEED — LOOKUP VALUES (020 + 044 + 048)
-- =============================================================================

insert into public.lookup_values (category, value, label, sort_order) values

  -- ── source ─────────────────────────────────────────────────────────────────
  ('source', 'website_form',         'Website Form',            0),
  ('source', 'email',                'Email',                   1),
  ('source', 'phone_call',           'Phone Call',              2),
  ('source', 'walk_in',              'Walk-in',                 3),
  ('source', 'referral',             'Referral',                4),
  ('source', 'facebook',             'Facebook',                5),
  ('source', 'instagram',            'Instagram',               6),
  ('source', 'google',               'Google',                  7),
  ('source', 'yelp',                 'Yelp',                    8),
  ('source', 'linkedin',             'LinkedIn',                9),
  ('source', 'trade_show',           'Trade Show',              10),
  ('source', 'direct_mail',          'Direct Mail',             11),
  ('source', 'manual',               'Manual',                  12),
  ('source', 'manual_crm',           'Manual (CRM)',            13),
  ('source', 'manual_sales_sourced', 'Manual (Sales Sourced)',  14),

  -- ── industry ───────────────────────────────────────────────────────────────
  ('industry', 'cosmetics_beauty',        'Cosmetics & Beauty',          0),
  ('industry', 'food_beverage',           'Food & Beverage',             1),
  ('industry', 'healthcare_medical',      'Healthcare & Medical',        2),
  ('industry', 'cannabis_cbd',            'Cannabis & CBD',              3),
  ('industry', 'retail_apparel',          'Retail & Apparel',            4),
  ('industry', 'e_commerce',              'E-Commerce',                  5),
  ('industry', 'hospitality_events',      'Hospitality & Events',        6),
  ('industry', 'agencies_marketing',      'Agencies & Marketing',        7),
  ('industry', 'education',               'Education',                   8),
  ('industry', 'real_estate',             'Real Estate',                 9),
  ('industry', 'manufacturing_industrial','Manufacturing & Industrial',  10),
  ('industry', 'tech_electronics',        'Tech & Electronics',          11),
  ('industry', 'non_profit',              'Non-Profit',                  12),
  ('industry', 'other',                   'Other',                       13),

  -- ── urgency ────────────────────────────────────────────────────────────────
  ('urgency', 'high',   'High',   0),
  ('urgency', 'medium', 'Medium', 1),
  ('urgency', 'low',    'Low',    2),

  -- ── hold reasons ───────────────────────────────────────────────────────────
  ('hold_reason', 'awaiting_customer_response', 'Awaiting customer response',    0),
  ('hold_reason', 'awaiting_artwork_files',     'Awaiting artwork / files',      1),
  ('hold_reason', 'awaiting_payment',           'Awaiting payment confirmation', 2),
  ('hold_reason', 'pricing_review',             'Pricing review needed',         3),
  ('hold_reason', 'vacation_unavailable',       'Vacation / customer unavailable',4),
  ('hold_reason', 'other',                      'Other',                         5),

  -- ── follow up later reasons (SDR leads) ────────────────────────────────────
  ('follow_up_reason', 'callback_requested',  'Customer asked to call back later', 0),
  ('follow_up_reason', 'awaiting_decision',   'Awaiting decision / budget',        1),
  ('follow_up_reason', 'wrong_time_to_reach', 'Wrong time — try again later',      2),
  ('follow_up_reason', 'left_voicemail',      'Left voicemail — follow up',        3),
  ('follow_up_reason', 'other',               'Other',                             4),

  -- ── reject reasons ─────────────────────────────────────────────────────────
  ('reject_reason', 'wrong_number_fake', 'Wrong Number / Fake', 0),
  ('reject_reason', 'spam_bot',          'Spam / Bot',          1),
  ('reject_reason', 'budget_too_low',    'Budget Too Low',      2),
  ('reject_reason', 'existing_customer', 'Existing Customer',   3),
  ('reject_reason', 'timing_not_right',  'Timing Not Right',    4),
  ('reject_reason', 'not_a_fit',         'Not a Fit / Other',   5),

  -- ── route to sales reasons ─────────────────────────────────────────────────
  ('route_reason', 'large_volume',       'Unusually Large Volume',    0),
  ('route_reason', 'complex_dimensions', 'Complex Custom Dimensions', 1),
  ('route_reason', 'vip_client',         'High-Value VIP Client',     2),
  ('route_reason', 'technical_support',  'Requires Technical Support',3),
  ('route_reason', 'out_of_box',         'Out of Box request',        4),
  ('route_reason', 'pricing_negotiation','Pricing negotiation expected',5),
  ('route_reason', 'customer_wants_sales','Customer requested Sales rep',6),
  ('route_reason', 'needs_custom_quote', 'Needs custom quote from Sales',7),
  ('route_reason', 'other',              'Other',                     8),

  -- ── sales drop reasons ─────────────────────────────────────────────────────
  ('sales_drop_reason', 'price',      'Price',      0),
  ('sales_drop_reason', 'ghosted',    'Ghosted',    1),
  ('sales_drop_reason', 'competitor', 'Competitor', 2),
  ('sales_drop_reason', 'timeline',   'Timeline',   3),
  ('sales_drop_reason', 'other',      'Other',      4),

  -- ── quote cancellation reasons ─────────────────────────────────────────────
  ('quote_cancel_reason', 'quote_customer_requested', 'Customer requested cancellation', 0),
  ('quote_cancel_reason', 'quote_duplicate',          'Duplicate quote',                 1),
  ('quote_cancel_reason', 'quote_pricing_issue',      'Pricing did not work',            2),
  ('quote_cancel_reason', 'quote_timeline_issue',     'Timeline / lead time issue',      3),
  ('quote_cancel_reason', 'quote_other',              'Other',                           4),

  -- ── order cancellation reasons ─────────────────────────────────────────────
  ('order_cancel_reason', 'order_customer_requested', 'Customer requested cancellation', 0),
  ('order_cancel_reason', 'order_no_payment',         'No payment received',             1),
  ('order_cancel_reason', 'order_created_in_error',   'Order created in error',          2),
  ('order_cancel_reason', 'order_scope_change',       'Timeline / scope change',         3),
  ('order_cancel_reason', 'order_other',              'Other',                           4),

  -- ── lamination (per-SKU line) ──────────────────────────────────────────────
  ('lamination', 'none',       'None',       0),
  ('lamination', 'gloss',      'Gloss',      1),
  ('lamination', 'matte',      'Matte',      2),
  ('lamination', 'soft_touch', 'Soft Touch', 3),
  ('lamination', 'holo',       'Holo',       4),
  ('lamination', 'coating',    'Coating',    5),

  -- ── finishing (add-on checkboxes per SKU) ─────────────────────────────────
  ('finishing', 'spot_uv',     'Spot UV',     0),
  ('finishing', 'foil',        'Foil',        1),
  ('finishing', 'perforation', 'Perforation', 2),

  -- ── quote channel ──────────────────────────────────────────────────────────
  ('quote_channel', 'sms',       'SMS',       0),
  ('quote_channel', 'whatsapp',  'WhatsApp',  1),
  ('quote_channel', 'email',     'Email',     2),
  ('quote_channel', 'in_person', 'In-person', 3),

  -- ── follow-up frequency ────────────────────────────────────────────────────
  ('follow_up_freq', 'daily',       'Daily',        0),
  ('follow_up_freq', 'every_2days', 'Every 2 days', 1),
  ('follow_up_freq', 'weekly',      'Weekly',       2),

  -- ── ticket priority ────────────────────────────────────────────────────────
  ('ticket_priority', 'low',    'Low',    0),
  ('ticket_priority', 'normal', 'Normal', 1),
  ('ticket_priority', 'high',   'High',   2),
  ('ticket_priority', 'urgent', 'Urgent', 3),

  -- ── order source ───────────────────────────────────────────────────────────
  ('order_source', 'quoted', 'Quoted (from lead)', 0),
  ('order_source', 'direct', 'Direct',             1),

  -- ── ticket payment methods ─────────────────────────────────────────────────
  ('ticket_payment', 'card_default', 'Card Payment', 0),
  ('ticket_payment', 'zelle',        'Zelle',        1),
  ('ticket_payment', 'offline',      'Offline',      2),

  -- ── color mode ─────────────────────────────────────────────────────────────
  ('color_mode', 'cmyk',             'CMYK',              1),
  ('color_mode', 'pantone',          'Pantone',           2),
  ('color_mode', 'black_only',       'Black Only',        3),
  ('color_mode', 'full_color_white', 'Full Color + White',4),

  -- ── sides ──────────────────────────────────────────────────────────────────
  ('sides', 'single_sided', 'Single-sided', 1),
  ('sides', 'double_sided', 'Double-sided', 2),

  -- ── roll direction ─────────────────────────────────────────────────────────
  ('roll_direction', 'top_off_first',    '1-Top',    1),
  ('roll_direction', 'bottom_off_first', '2-Bottom', 2),
  ('roll_direction', 'right_off_first',  '3-Right',  3),
  ('roll_direction', 'left_off_first',   '4-Left',   4),

  -- ── Stripe refund reasons (099) ────────────────────────────────────────────
  ('stripe_refund_reason', 'refund_order_issue',        'Order / production issue', 0),
  ('stripe_refund_reason', 'refund_customer_request', 'Customer requested refund',  1),
  ('stripe_refund_reason', 'refund_duplicate',          'Duplicate payment',          2),
  ('stripe_refund_reason', 'refund_pricing_error',      'Pricing / quote error',      3),
  ('stripe_refund_reason', 'refund_other',              'Other',                      4),

  -- ── payment refund reasons (100) ───────────────────────────────────────────
  ('payment_refund_reason', 'refund_order_issue',        'Order / production issue', 0),
  ('payment_refund_reason', 'refund_customer_request', 'Customer requested refund',  1),
  ('payment_refund_reason', 'refund_duplicate',          'Duplicate payment',          2),
  ('payment_refund_reason', 'refund_pricing_error',      'Pricing / quote error',      3),
  ('payment_refund_reason', 'refund_other',              'Other',                      4)

on conflict (category, value) do nothing;


-- =============================================================================
-- 16. SEED — PRODUCT CATALOG (migration 041)
-- =============================================================================

-- ── product_types ─────────────────────────────────────────────────────────────

insert into public.product_types (id, name, default_print_type, facility, sort_order) values
  ('labels-roll',        'Labels (Roll)',                'Roll',  '16th-street', 10),
  ('labels-sheet',       'Labels (Sheet)',               'Sheet', '16th-street', 20),
  ('pouches',            'Pouches',                      'Roll',  '16th-street', 30),
  ('boxes',              'Folding Cartons / Boxes',      'Sheet', 'all',         40),
  ('business-cards',     'Business Cards',               'Sheet', '16th-street', 50),
  ('flyers',             'Flyers / Postcards',           'Sheet', '16th-street', 60),
  ('booklets',           'Booklets',                     'Sheet', '16th-street', 70),
  ('stickers-die',       'Diecut Stickers',              'Sheet', 'all',         80),
  ('vinyl-labels-rolls', E'Vinyl Labels / 54\'\' Rolls', 'Roll',  'boyd-street', 90),
  ('vinyl-signage',      'Vinyl Signage',                'Roll',  'boyd-street', 100),
  ('banners',            'Banners / Large Format',       'Roll',  'boyd-street', 110),
  ('window-decals',      'Window Decals',                'Roll',  'boyd-street', 120),
  ('wallpaper',          'Wallpaper',                    'Roll',  'boyd-street', 130),
  ('sheet-boyd',         'Sheet Products (Boyd)',        'Sheet', 'boyd-street', 140),
  ('other',              'Other',                        'Sheet', 'all',         150)
on conflict (id) do nothing;

-- ── material_groups ───────────────────────────────────────────────────────────

insert into public.material_groups (name, facility, sort_order) values
  ('BOPP',             '16th-street', 10),
  ('Cosmetic Web',     '16th-street', 20),
  ('Label Sheets',     '16th-street', 30),
  ('Cardstock',        '16th-street', 40),
  ('Cardstock (Boyd)', 'boyd-street', 45),
  ('Cover/Text',       '16th-street', 50),
  ('Vinyl',            'boyd-street', 60),
  ('Specialty',        'boyd-street', 70),
  ('Sheet (Boyd)',     'boyd-street', 80)
on conflict (name) do nothing;

-- ── materials ─────────────────────────────────────────────────────────────────

-- BOPP
insert into public.materials (id, name, category, facility, sort_order, default_unit, group_id)
select m.id, m.name, m.category, m.facility, m.sort_order::int, m.default_unit, mg.id
from (values
  ('bopp-clear',  'Clear BOPP',  'BOPP', '16th-street', '10', 'rolls'),
  ('bopp-white',  'White BOPP',  'BOPP', '16th-street', '20', 'rolls'),
  ('bopp-silver', 'Silver BOPP', 'BOPP', '16th-street', '30', 'rolls'),
  ('bopp-holo',   'Holo BOPP',   'BOPP', '16th-street', '40', 'rolls')
) as m(id, name, category, facility, sort_order, default_unit)
join public.material_groups mg on mg.name = m.category
on conflict (id) do nothing;

-- Cosmetic Web
insert into public.materials (id, name, category, facility, sort_order, default_unit, group_id)
select m.id, m.name, m.category, m.facility, m.sort_order::int, m.default_unit, mg.id
from (values
  ('cosm-clear',  'Clear Cosmetic Web',  'Cosmetic Web', '16th-street', '10', 'rolls'),
  ('cosm-white',  'White Cosmetic Web',  'Cosmetic Web', '16th-street', '20', 'rolls'),
  ('cosm-silver', 'Silver Cosmetic Web', 'Cosmetic Web', '16th-street', '30', 'rolls')
) as m(id, name, category, facility, sort_order, default_unit)
join public.material_groups mg on mg.name = m.category
on conflict (id) do nothing;

-- Label Sheets
insert into public.materials (id, name, category, facility, sort_order, default_unit, group_id)
select m.id, m.name, m.category, m.facility, m.sort_order::int, m.default_unit, mg.id
from (values
  ('ls-gloss',     'Gloss Label Sheet', 'Label Sheets', '16th-street', '10', 'sheets'),
  ('ls-matte',     'Matte Label Sheet', 'Label Sheets', '16th-street', '20', 'sheets'),
  ('ls-semigloss', 'Semi Gloss',        'Label Sheets', '16th-street', '30', 'sheets')
) as m(id, name, category, facility, sort_order, default_unit)
join public.material_groups mg on mg.name = m.category
on conflict (id) do nothing;

-- Cardstock (16th Street)
insert into public.materials (id, name, category, facility, sort_order, default_unit, group_id)
select m.id, m.name, m.category, m.facility, m.sort_order::int, m.default_unit, mg.id
from (values
  ('cs-14c1s',    '14pt C1S',    'Cardstock', '16th-street', '10', 'sheets'),
  ('cs-14c2s',    '14pt C2S',    'Cardstock', '16th-street', '20', 'sheets'),
  ('cs-16c1s',    '16pt C1S',    'Cardstock', '16th-street', '30', 'sheets'),
  ('cs-16c2s',    '16pt C2S',    'Cardstock', '16th-street', '40', 'sheets'),
  ('cs-18c1s',    '18pt C1S',    'Cardstock', '16th-street', '50', 'sheets'),
  ('cs-18c2s',    '18pt C2S',    'Cardstock', '16th-street', '60', 'sheets'),
  ('cs-18silver', '18pt Silver', 'Cardstock', '16th-street', '70', 'sheets'),
  ('cs-24c1s',    '24pt C1S',    'Cardstock', '16th-street', '80', 'sheets'),
  ('cs-24c2s',    '24pt C2S',    'Cardstock', '16th-street', '90', 'sheets')
) as m(id, name, category, facility, sort_order, default_unit)
join public.material_groups mg on mg.name = m.category
on conflict (id) do nothing;

-- Cardstock (Boyd Street)
insert into public.materials (id, name, category, facility, sort_order, default_unit, group_id)
select m.id, m.name, m.category, m.facility, m.sort_order::int, m.default_unit, mg.id
from (values
  ('cs-boyd-16pt', '16pt (Boyd)', 'Cardstock (Boyd)', 'boyd-street', '10', 'sheets'),
  ('cs-boyd-18pt', '18pt (Boyd)', 'Cardstock (Boyd)', 'boyd-street', '20', 'sheets'),
  ('cs-boyd-20pt', '20pt (Boyd)', 'Cardstock (Boyd)', 'boyd-street', '30', 'sheets'),
  ('cs-boyd-24pt', '24pt (Boyd)', 'Cardstock (Boyd)', 'boyd-street', '40', 'sheets')
) as m(id, name, category, facility, sort_order, default_unit)
join public.material_groups mg on mg.name = m.category
on conflict (id) do nothing;

-- Cover/Text Stock
insert into public.materials (id, name, category, facility, sort_order, default_unit, group_id)
select m.id, m.name, m.category, m.facility, m.sort_order::int, m.default_unit, mg.id
from (values
  ('ct-80-cover',  '80lb Cover',  'Cover/Text', '16th-street', '10', 'sheets'),
  ('ct-100-cover', '100lb Cover', 'Cover/Text', '16th-street', '20', 'sheets'),
  ('ct-110-cover', '110lb Cover', 'Cover/Text', '16th-street', '30', 'sheets'),
  ('ct-80-text',   '80lb Text',   'Cover/Text', '16th-street', '40', 'sheets'),
  ('ct-100-text',  '100lb Text',  'Cover/Text', '16th-street', '50', 'sheets')
) as m(id, name, category, facility, sort_order, default_unit)
join public.material_groups mg on mg.name = m.category
on conflict (id) do nothing;

-- Vinyl (Boyd Street)
insert into public.materials (id, name, category, facility, sort_order, default_unit, group_id)
select m.id, m.name, m.category, m.facility, m.sort_order::int, m.default_unit, mg.id
from (values
  ('vinyl-white',     'White Vinyl',                   'Vinyl', 'boyd-street', '10', 'rolls'),
  ('vinyl-white-agg', 'White Vinyl - Aggressive Glue', 'Vinyl', 'boyd-street', '20', 'rolls'),
  ('vinyl-holo',      'Holographic Vinyl',             'Vinyl', 'boyd-street', '30', 'rolls')
) as m(id, name, category, facility, sort_order, default_unit)
join public.material_groups mg on mg.name = m.category
on conflict (id) do nothing;

-- Specialty (Boyd Street)
insert into public.materials (id, name, category, facility, sort_order, default_unit, group_id)
select m.id, m.name, m.category, m.facility, m.sort_order::int, m.default_unit, mg.id
from (values
  ('spec-banner',         'Banner Material',                 'Specialty', 'boyd-street', '10', 'sqft'),
  ('spec-window',         'Window Decal',                   'Specialty', 'boyd-street', '20', 'sqft'),
  ('spec-wallpaper-ps',   'Self-Adhesive (Peel-and-Stick)', 'Specialty', 'boyd-street', '30', 'sqft'),
  ('spec-wallpaper-trad', 'Traditional / Unpasted',         'Specialty', 'boyd-street', '40', 'sqft')
) as m(id, name, category, facility, sort_order, default_unit)
join public.material_groups mg on mg.name = m.category
on conflict (id) do nothing;

-- Sheet (Boyd Street)
insert into public.materials (id, name, category, facility, sort_order, default_unit, group_id)
select m.id, m.name, m.category, m.facility, m.sort_order::int, m.default_unit, mg.id
from (values
  ('sheet-boyd-18pt', '18pt (Boyd)', 'Sheet (Boyd)', 'boyd-street', '10', 'sheets'),
  ('sheet-boyd-20pt', '20pt (Boyd)', 'Sheet (Boyd)', 'boyd-street', '20', 'sheets'),
  ('sheet-boyd-24pt', '24pt (Boyd)', 'Sheet (Boyd)', 'boyd-street', '30', 'sheets')
) as m(id, name, category, facility, sort_order, default_unit)
join public.material_groups mg on mg.name = m.category
on conflict (id) do nothing;

-- ── product_material_links ────────────────────────────────────────────────────

-- Labels (Roll): BOPP + Label Sheets
insert into public.product_material_links values
  ('labels-roll','bopp-clear'),  ('labels-roll','bopp-white'),
  ('labels-roll','bopp-silver'), ('labels-roll','bopp-holo'),
  ('labels-roll','ls-gloss'),    ('labels-roll','ls-matte'), ('labels-roll','ls-semigloss')
on conflict do nothing;

-- Labels (Sheet): Label Sheets only
insert into public.product_material_links values
  ('labels-sheet','ls-gloss'), ('labels-sheet','ls-matte'), ('labels-sheet','ls-semigloss')
on conflict do nothing;

-- Pouches: Cosmetic Web
insert into public.product_material_links values
  ('pouches','cosm-clear'), ('pouches','cosm-white'), ('pouches','cosm-silver')
on conflict do nothing;

-- Folding Cartons / Boxes: Cardstock (16th) + Cardstock (Boyd)
insert into public.product_material_links values
  ('boxes','cs-14c1s'), ('boxes','cs-14c2s'), ('boxes','cs-16c1s'), ('boxes','cs-16c2s'),
  ('boxes','cs-18c1s'), ('boxes','cs-18c2s'), ('boxes','cs-18silver'),
  ('boxes','cs-24c1s'), ('boxes','cs-24c2s'),
  ('boxes','cs-boyd-16pt'), ('boxes','cs-boyd-18pt'),
  ('boxes','cs-boyd-20pt'), ('boxes','cs-boyd-24pt')
on conflict do nothing;

-- Business Cards: Cardstock (16th) + Cover/Text covers
insert into public.product_material_links values
  ('business-cards','cs-14c1s'),    ('business-cards','cs-14c2s'),
  ('business-cards','cs-16c1s'),    ('business-cards','cs-16c2s'),
  ('business-cards','cs-18c1s'),    ('business-cards','cs-18c2s'),
  ('business-cards','cs-18silver'),
  ('business-cards','cs-24c1s'),    ('business-cards','cs-24c2s'),
  ('business-cards','ct-80-cover'), ('business-cards','ct-100-cover'), ('business-cards','ct-110-cover')
on conflict do nothing;

-- Flyers / Postcards: Cover/Text (all) + Cardstock (16th)
insert into public.product_material_links values
  ('flyers','ct-80-cover'), ('flyers','ct-100-cover'), ('flyers','ct-110-cover'),
  ('flyers','ct-80-text'),  ('flyers','ct-100-text'),
  ('flyers','cs-14c1s'), ('flyers','cs-14c2s'), ('flyers','cs-16c1s'), ('flyers','cs-16c2s'),
  ('flyers','cs-18c1s'), ('flyers','cs-18c2s'), ('flyers','cs-18silver'),
  ('flyers','cs-24c1s'), ('flyers','cs-24c2s')
on conflict do nothing;

-- Booklets: Cover/Text (all)
insert into public.product_material_links values
  ('booklets','ct-80-cover'), ('booklets','ct-100-cover'), ('booklets','ct-110-cover'),
  ('booklets','ct-80-text'),  ('booklets','ct-100-text')
on conflict do nothing;

-- Diecut Stickers: BOPP + Label Sheets (16th) + Vinyl (Boyd)
insert into public.product_material_links values
  ('stickers-die','bopp-clear'), ('stickers-die','bopp-white'),
  ('stickers-die','bopp-silver'), ('stickers-die','bopp-holo'),
  ('stickers-die','ls-gloss'), ('stickers-die','ls-matte'), ('stickers-die','ls-semigloss'),
  ('stickers-die','vinyl-white'), ('stickers-die','vinyl-white-agg'), ('stickers-die','vinyl-holo')
on conflict do nothing;

-- Vinyl Labels / 54'' Rolls: Vinyl (Boyd)
insert into public.product_material_links values
  ('vinyl-labels-rolls','vinyl-white'),
  ('vinyl-labels-rolls','vinyl-white-agg'),
  ('vinyl-labels-rolls','vinyl-holo')
on conflict do nothing;

-- Vinyl Signage: Vinyl (Boyd)
insert into public.product_material_links values
  ('vinyl-signage','vinyl-white'),
  ('vinyl-signage','vinyl-white-agg'),
  ('vinyl-signage','vinyl-holo')
on conflict do nothing;

-- Banners / Large Format: all Specialty
insert into public.product_material_links values
  ('banners','spec-banner'), ('banners','spec-window'),
  ('banners','spec-wallpaper-ps'), ('banners','spec-wallpaper-trad')
on conflict do nothing;

-- Window Decals
insert into public.product_material_links values
  ('window-decals','spec-window')
on conflict do nothing;

-- Wallpaper
insert into public.product_material_links values
  ('wallpaper','spec-wallpaper-ps'), ('wallpaper','spec-wallpaper-trad')
on conflict do nothing;

-- Sheet Products (Boyd)
insert into public.product_material_links values
  ('sheet-boyd','sheet-boyd-18pt'),
  ('sheet-boyd','sheet-boyd-20pt'),
  ('sheet-boyd','sheet-boyd-24pt')
on conflict do nothing;

-- Other: all materials (catch-all)
insert into public.product_material_links
select 'other', id from public.materials
on conflict do nothing;


-- =============================================================================
-- 17. SEED — STORAGE BUCKETS (101)
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'refund-evidence',
  'refund-evidence',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;


-- =============================================================================
-- 18. SEED — SMS & EMAIL TEMPLATES (migrations 084, 109, 110)
-- =============================================================================

insert into public.sms_templates (template_key, body) values
  ('quote_sent', 'Hi {firstName}, your quote from {companyName} is ready. Total: {total}. View & confirm: {link}'),
  ('order_sent', 'Hi {firstName}, your order from {companyName} is ready! Total: {total}. View details & payment: {link}'),
  ('payment_reminder', 'Hi {firstName}, your order {ref} from {companyName} is confirmed. Please pay {total} here: {link}'),
  ('invoice_link', 'Hi {firstName}, here is your order link for {ref} from {companyName}. View invoice & details: {link}'),
  ('invoice_link_in_production_paid', 'Hi {firstName}, your order {ref} from {companyName} is in production. View your invoice & status: {link}'),
  ('invoice_link_in_production_unpaid', 'Hi {firstName}, your order {ref} from {companyName} is in production. View invoice & pay online: {link}'),
  ('order_ready_pickup', 'Hi {firstName}, your order {ref} from {companyName} is ready for pickup!{pickupBlock}{phoneBlock} Details: {link}'),
  ('payment_confirmed_full_in_production', 'Hi {firstName}, your payment of {amount} for order {ref} from {companyName} is confirmed — your order is paid in full. Track it here: {link}'),
  ('payment_confirmed_in_production', 'Hi {firstName}, your payment of {amount} for order {ref} from {companyName} is confirmed — your order is now in production. Track it here: {link}'),
  ('payment_confirmed_full', 'Hi {firstName}, your payment of {amount} for order {ref} from {companyName} is confirmed — paid in full. View your order: {link}'),
  ('payment_confirmed', 'Hi {firstName}, your payment of {amount} for order {ref} from {companyName} is confirmed. View your order: {link}'),
  ('tax_exempt_approved', 'Hi {firstName}, tax-exempt documentation for order {ref} from {companyName} is verified. Your updated total is {amount}. View your order: {link}'),
  ('tax_exempt_approved_total_unchanged', 'Hi {firstName}, tax-exempt documentation for order {ref} from {companyName} is verified. Your order total is {amount}. View your order: {link}'),
  ('payment_evidence_resubmit_requested', 'Hi {firstName}, we need updated payment proof for order {ref} from {companyName}. Code: {amount} Upload: {link}'),
  ('tax_exempt_resubmit_requested', 'Hi {firstName}, we need an updated tax-exempt permit for order {ref} from {companyName}. Code: {amount} Upload: {link}'),
  ('quote_follow_up', 'Hi {firstName}, friendly reminder about your quote {ref} from {companyName} ({total}). View & confirm: {link}'),
  ('quote_follow_up_no_total', 'Hi {firstName}, friendly reminder about your quote {ref} from {companyName}. View & confirm: {link}')
on conflict (template_key) do nothing;

insert into public.email_templates (template_key, subject, body, cta_label) values
  (
    'payment_evidence_resubmit_requested',
    'Action needed — upload payment proof for {ref} · {companyName}',
    'We need an updated payment proof for order {ref} from {companyName}.' || E'\n\n' ||
    'Your verification code is {otpCode}. Open the link below, enter the code, and upload your payment confirmation.' || E'\n\n' ||
    'If you have questions, reply to this message.',
    'Upload payment proof'
  ),
  (
    'tax_exempt_resubmit_requested',
    'Action needed — upload tax-exempt permit for {ref} · {companyName}',
    'We need an updated tax-exempt permit for order {ref} from {companyName}.' || E'\n\n' ||
    'Your verification code is {otpCode}. Open the link below, enter the code, and upload the new document.' || E'\n\n' ||
    'If you have questions, reply to this message.',
    'Upload permit'
  ),
  ('quote_sent', 'Your Quote from {companyName} is Ready',
   'Your quote from {companyName} is ready. Please review the details below and confirm when you are ready to proceed.',
   'View & Confirm Quote'),
  ('order_sent', 'Your Order from {companyName} — Payment Details',
   'Your order from {companyName} has been confirmed. Here are your order details.',
   'View Order & Payment Details'),
  ('quote_sent_revision', 'Updated quote from {companyName} — {ref}',
   'Please open the link below to view the current version of your quote.',
   'View & Confirm Quote'),
  ('order_sent_revision', 'Updated order from {companyName} — {ref}',
   'Please open the link below to view the current version of your order.',
   'View Order & Payment Details'),
  ('payment_reminder', 'Payment Required — {ref} · {companyName}',
   'Your order with {companyName} has been confirmed. Please complete your payment of {total} to start production.',
   'Pay Now'),
  ('invoice_link', 'Your Order {ref} — View Online · {companyName}', '{statusLine}', 'View Order & Invoice'),
  ('invoice_link_in_production_paid', 'Your Order {ref} — View Online · {companyName}', '{statusLine}', 'View Order & Invoice'),
  ('invoice_link_in_production_unpaid', 'Your Order {ref} — View Online · {companyName}', '{statusLine}', 'View Order & Invoice'),
  ('invoice_link_revision', 'Updated order {ref} — please review · {companyName}',
   'Your order was updated. Please review the latest information on your customer portal.',
   'View Order & Invoice'),
  ('order_ready_pickup', 'Your Order {ref} Is Ready for Pickup · {companyName}',
   'Great news — your order {ref} is complete and ready for pickup at our print shop.',
   'View Order Details'),
  ('order_ready_shipped', 'Your Order {ref} Has Shipped · {companyName}',
   'Great news — your order {ref} is complete and is ready to ship.',
   'View Order Details'),
  ('payment_confirmed_full_in_production', 'Payment Confirmed — {ref} paid in full · {companyName}',
   'We have verified your payment of {amount} for order {ref}. Your order is paid in full and remains in production — we will notify you when it is ready.',
   'View Your Order'),
  ('payment_confirmed_in_production', 'Payment Confirmed — {ref} is now in production · {companyName}',
   'We have verified your payment of {amount} for order {ref}. Your order is now in production.',
   'View Your Order'),
  ('payment_confirmed_full', 'Payment Confirmed — {ref} · {companyName}',
   'We have verified your payment of {amount} for order {ref}. Your order is paid in full.',
   'View Your Order'),
  ('payment_confirmed', 'Payment Confirmed — {ref} · {companyName}',
   'We have verified your payment of {amount} for order {ref}. We will notify you when production begins.',
   'View Your Order'),
  ('tax_exempt_approved', 'Tax-Exempt Verified — {ref} total updated · {companyName}',
   'We have verified the tax-exempt permit for order {ref}. Your updated order total is {amount} (previously {previousTotal}). If you already paid, your balance may be adjusted.',
   'View your order'),
  ('tax_exempt_approved_total_unchanged', 'Tax-Exempt Verified — {ref} · {companyName}',
   'We have verified the tax-exempt permit for order {ref}. Your order total remains {amount}.',
   'View your order'),
  ('quote_follow_up', 'Reminder: your quote {ref} from {companyName}',
   E'We wanted to follow up on quote {ref} from {companyName}. Total: {total}.\n\nYou can review the details and confirm online anytime using the button below.',
   'View quote'),
  ('quote_follow_up_no_total', 'Reminder: your quote {ref} from {companyName}',
   E'We wanted to follow up on quote {ref} from {companyName}.\n\nYou can review the details and confirm online anytime using the button below.',
   'View quote')
on conflict (template_key) do nothing;


-- =============================================================================
-- 19. SEED — COMPANY SETTINGS
-- =============================================================================

insert into public.company_settings (id) values (1)
on conflict (id) do nothing;
