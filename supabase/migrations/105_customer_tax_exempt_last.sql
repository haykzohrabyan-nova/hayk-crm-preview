-- Migration 105: Customer-level last tax-exempt permit (reuse hints on new quotes)

alter table public.customers
  add column if not exists tax_exempt_last_permit_number text,
  add column if not exists tax_exempt_last_storage_path text,
  add column if not exists tax_exempt_last_file_name text,
  add column if not exists tax_exempt_last_mime_type text,
  add column if not exists tax_exempt_last_reviewed_at timestamptz,
  add column if not exists tax_exempt_last_reviewed_by_id uuid references public.user_profiles(id),
  add column if not exists tax_exempt_last_source_ticket_id uuid references public.job_tickets(id);
