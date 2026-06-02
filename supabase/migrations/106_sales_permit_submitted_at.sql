-- Migration 106: When tax-exempt permit file was submitted (mirrors payment_evidence_submitted_at)

alter table public.job_tickets
  add column if not exists sales_permit_submitted_at timestamptz;

update public.job_tickets
set sales_permit_submitted_at = updated_at
where sales_permit_storage_path is not null
  and sales_permit_submitted_at is null;
