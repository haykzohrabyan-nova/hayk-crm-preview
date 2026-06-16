-- ─────────────────────────────────────────────────────────────────────────────
-- Create "System Created" placeholder customer — 2026-06-15
--
-- Rationale: the no-phone order import batch (orders-no-phone-import.json)
-- assigns all 103 no-phone orders to phone 1111111111.  The bulk import script
-- validates ALL rows before any inserts; if the customer does not exist yet,
-- every row gets customer_action="create" and orders #2-103 fail with a unique
-- phone constraint violation.  Pre-creating the customer here ensures every row
-- finds it during validation (customer_action="found") and links cleanly.
--
-- Run this patch BEFORE uploading orders-no-phone-import.json.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO customers (
  first_name,
  last_name,
  phone,
  company,
  created_at,
  updated_at
)
SELECT
  'System',
  'Created',
  '1111111111',
  'System Created',
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM customers WHERE phone = '1111111111'
);
