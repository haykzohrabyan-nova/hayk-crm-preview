-- Allow 'none' as a quote channel — customer will not receive any notification
-- but the public quote page (/q/[token]) remains accessible.
-- Drops and recreates the CHECK constraint on job_tickets.ticket_quote_channel.

alter table public.job_tickets
  drop constraint if exists job_tickets_ticket_quote_channel_check;

alter table public.job_tickets
  add constraint job_tickets_ticket_quote_channel_check
  check (ticket_quote_channel in ('sms', 'email', 'both', 'none'));
