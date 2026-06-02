-- Migration 104: Per-ticket tax-exempt document approval (accountant)

alter table public.job_tickets
  add column if not exists sales_permit_reviewed_at timestamptz,
  add column if not exists sales_permit_reviewed_by_id uuid references public.user_profiles(id),
  add column if not exists sales_permit_reused_from_customer boolean not null default false;
