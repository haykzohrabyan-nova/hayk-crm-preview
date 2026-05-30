-- Multiple ship-to destinations per ticket (each with optional charge + address).

CREATE TABLE IF NOT EXISTS ticket_shipping_destinations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id     uuid NOT NULL REFERENCES job_tickets(id) ON DELETE CASCADE,
  sort_order    integer NOT NULL DEFAULT 0,
  shipping_amount numeric NOT NULL DEFAULT 0,
  ship_to_line1 text,
  ship_to_line2 text,
  ship_to_city  text,
  ship_to_state text,
  ship_to_zip   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_shipping_destinations_ticket
  ON ticket_shipping_destinations(ticket_id, sort_order);

-- Backfill one row per ticket that already has shipping or an address.
INSERT INTO ticket_shipping_destinations (
  ticket_id,
  sort_order,
  shipping_amount,
  ship_to_line1,
  ship_to_line2,
  ship_to_city,
  ship_to_state,
  ship_to_zip
)
SELECT
  id,
  0,
  COALESCE(quote_shipping, 0),
  ship_to_line1,
  ship_to_line2,
  ship_to_city,
  ship_to_state,
  ship_to_zip
FROM job_tickets
WHERE requires_shipping = true
   OR COALESCE(quote_shipping, 0) > 0
   OR NULLIF(trim(ship_to_line1), '') IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM ticket_shipping_destinations d WHERE d.ticket_id = job_tickets.id
);
