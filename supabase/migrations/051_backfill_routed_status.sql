-- Migration 051: Backfill routed status for SDR-created high-value draft quotes
--
-- Before migration 051 was deployed, the high-value threshold modal saved quotes
-- as 'draft' instead of 'routed'. This migration finds those quotes and corrects
-- their status so Sales users can see and claim them.
--
-- Logic:
--   - ticket_status = 'draft'
--   - created by an SDR user (role name = 'sdr')
--   - quote_final_total > the high_value_threshold column in company_settings

update public.job_tickets jt
set
  ticket_status = 'routed',
  updated_at    = now()
where
  jt.ticket_status = 'draft'
  and jt.ticket_kind = 'quote'
  -- created by an SDR
  and exists (
    select 1
    from public.user_profiles up
    join public.roles r on r.id = up.role_id
    where up.id = jt.created_by_id
      and r.name = 'sdr'
  )
  -- total exceeds the high-value threshold stored in company_settings
  and jt.quote_final_total is not null
  and jt.quote_final_total > coalesce(
    (select high_value_threshold from public.company_settings limit 1),
    0
  );
