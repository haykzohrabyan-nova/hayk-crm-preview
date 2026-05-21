-- ─────────────────────────────────────────────────────────────────────────────
-- 065 — Payment remittance fields on company_settings
--
-- Adds bank details (Wire / ACH) and Zelle contact info.
-- Configured in Admin → Settings → Payment.
-- Returned by the public quotes API and shown to customers on their quote page.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS bank_name           TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_name   TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_number TEXT,
  ADD COLUMN IF NOT EXISTS bank_routing_number TEXT,
  ADD COLUMN IF NOT EXISTS zelle_phone         TEXT,
  ADD COLUMN IF NOT EXISTS zelle_email         TEXT;

COMMENT ON COLUMN public.company_settings.bank_name
  IS 'Bank name shown on Wire/ACH payment instructions (e.g. Chase Bank)';
COMMENT ON COLUMN public.company_settings.bank_account_name
  IS 'Account holder name for Wire/ACH (e.g. Bazaar Printing Inc)';
COMMENT ON COLUMN public.company_settings.bank_account_number
  IS 'Bank account number for Wire/ACH';
COMMENT ON COLUMN public.company_settings.bank_routing_number
  IS 'Routing number for Wire/ACH';
COMMENT ON COLUMN public.company_settings.zelle_phone
  IS 'Zelle phone number — shown to customers if filled';
COMMENT ON COLUMN public.company_settings.zelle_email
  IS 'Zelle email address — shown to customers if filled';
