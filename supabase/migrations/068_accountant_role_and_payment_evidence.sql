-- ─────────────────────────────────────────────────────────────────────────────
-- 068 — Accountant role + payment evidence columns
--
-- 1. Add payment_evidence_url and payment_evidence_submitted_at to job_tickets
--    so customers can submit proof of wire / ACH / Zelle / check / card payment.
--
-- 2. Seed the 'accountant' system role and grant it access to:
--      /dashboard, /payments, /orders, /settings
--
-- 3. Seed the /payments page into the pages table (Accountant's work queue).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Payment evidence columns ───────────────────────────────────────────────

ALTER TABLE public.job_tickets
  ADD COLUMN IF NOT EXISTS payment_evidence_url          TEXT,
  ADD COLUMN IF NOT EXISTS payment_evidence_submitted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.job_tickets.payment_evidence_url
  IS 'Supabase Storage path of the payment evidence file uploaded by the customer (payment-evidence/{ticket_id}/{uuid}-{filename})';

COMMENT ON COLUMN public.job_tickets.payment_evidence_submitted_at
  IS 'Timestamp when the customer submitted payment evidence for review';

-- ── 2. Accountant system role ─────────────────────────────────────────────────

INSERT INTO public.roles (name, display_name, is_system)
VALUES ('accountant', 'Accountant', true)
ON CONFLICT (name) DO NOTHING;

-- ── 3. /payments page ─────────────────────────────────────────────────────────

INSERT INTO public.pages (route, display_name, icon, section, sort_order)
VALUES ('/payments', 'Payments', 'CreditCard', 'main', 5)
ON CONFLICT (route) DO NOTHING;

-- ── 4. Role permissions for accountant ───────────────────────────────────────
-- Grant: /dashboard, /payments, /orders, /settings

INSERT INTO public.role_permissions (role_id, page_id)
SELECT r.id, p.id
FROM   public.roles r, public.pages p
WHERE  r.name = 'accountant'
  AND  p.route IN ('/dashboard', '/payments', '/orders', '/settings')
ON CONFLICT DO NOTHING;
