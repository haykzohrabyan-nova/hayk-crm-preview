-- Migration 103: Sales permit file attachment on job_tickets
-- Adds three columns to store the uploaded sales permit document
-- when a ticket is marked tax-exempt.

alter table public.job_tickets
  add column if not exists sales_permit_storage_path text,
  add column if not exists sales_permit_file_name     text,
  add column if not exists sales_permit_mime_type     text;
