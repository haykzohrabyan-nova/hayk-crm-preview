-- Fulfillment: pickup vs ship-to customer (optional address, required shipping charge when ship)

ALTER TABLE job_tickets
  ADD COLUMN IF NOT EXISTS requires_shipping boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ship_to_line1 text,
  ADD COLUMN IF NOT EXISTS ship_to_line2 text,
  ADD COLUMN IF NOT EXISTS ship_to_city text,
  ADD COLUMN IF NOT EXISTS ship_to_state text,
  ADD COLUMN IF NOT EXISTS ship_to_zip text;

COMMENT ON COLUMN job_tickets.requires_shipping IS 'When true, quote_shipping charge applies and optional ship-to address may be stored.';
COMMENT ON COLUMN job_tickets.ship_to_line1 IS 'Optional delivery street address when requires_shipping is true.';
