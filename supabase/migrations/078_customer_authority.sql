-- Decision maker (authority) is a customer/company attribute, not per-lead or per-quote.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS authority text;

COMMENT ON COLUMN public.customers.authority IS 'Decision maker for this customer (yes/no).';

-- Backfill from each customer's most recent lead that had authority set.
UPDATE public.customers c
SET authority = sub.authority
FROM (
  SELECT DISTINCT ON (customer_id) customer_id, authority
  FROM public.leads
  WHERE customer_id IS NOT NULL
    AND authority IS NOT NULL
    AND btrim(authority) <> ''
  ORDER BY customer_id, created_at DESC
) sub
WHERE c.id = sub.customer_id
  AND (c.authority IS NULL OR btrim(c.authority) = '');

-- quote_authority on tickets was never used in production UI.
ALTER TABLE public.job_tickets DROP COLUMN IF EXISTS quote_authority;
