-- Align Won status with production release (not order conversion).
-- Leads marked Won before production are reverted; leads in production without Won are credited.

UPDATE public.leads l
SET
  sales_status = CASE
    WHEN l.status = 'Routed to Sales' THEN 'Ongoing'
    WHEN l.status = 'Quoted' THEN 'Quote Sent'
    ELSE COALESCE(l.prev_sales_status, 'Quote Sent')
  END,
  updated_at = now()
WHERE l.sales_status = 'Won'
  AND NOT EXISTS (
    SELECT 1
    FROM public.job_tickets t
    WHERE t.linked_lead_id = l.id
      AND t.ticket_status IN ('in_production', 'completed')
  );

UPDATE public.leads l
SET sales_status = 'Won', updated_at = now()
WHERE l.sales_status IS DISTINCT FROM 'Won'
  AND EXISTS (
    SELECT 1
    FROM public.job_tickets t
    WHERE t.linked_lead_id = l.id
      AND t.ticket_status IN ('in_production', 'completed')
  );
