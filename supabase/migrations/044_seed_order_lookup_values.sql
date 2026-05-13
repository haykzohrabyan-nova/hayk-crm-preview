-- ─────────────────────────────────────────────────────────────────────────────
-- 044 — Seed OrderDrawer lookup_value categories
--
-- Adds all dropdown / selectable options used in the Quotes & Orders
-- (OrderDrawer) flow to the lookup_values table so they are:
--   • Visible and editable from Admin → Dropdown Options panel
--   • Fetched at runtime — never hardcoded in components
--
-- Categories added:
--   lamination         — lamination finish options per SKU line
--   finishing          — add-on finishes (checkboxes) per SKU line
--   quote_channel      — how the quote is delivered to the client
--   follow_up_freq     — follow-up reminder frequency
--   ticket_priority    — ticket urgency / priority level
--   order_source       — how this order originated
--   ticket_payment     — accepted payment methods on a quote/order
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.lookup_values (category, value, label, sort_order) values

  -- ── lamination ─────────────────────────────────────────────────────────────
  -- Applied per SKU row in the Line Items tab of the OrderDrawer.
  -- Source: docs/order-ticket/product-catalog.md Part 4 (LAMINATION_OPTIONS)
  ('lamination', 'none',       'None',       0),
  ('lamination', 'gloss',      'Gloss',      1),
  ('lamination', 'matte',      'Matte',      2),
  ('lamination', 'soft_touch', 'Soft Touch', 3),
  ('lamination', 'holo',       'Holo',       4),
  ('lamination', 'coating',    'Coating',    5),

  -- ── finishing ──────────────────────────────────────────────────────────────
  -- Add-on finishing checkboxes per SKU row.
  -- Source: docs/order-ticket/product-catalog.md Part 4
  ('finishing', 'spot_uv',     'Spot UV',     0),
  ('finishing', 'foil',        'Foil',        1),
  ('finishing', 'perforation', 'Perforation', 2),

  -- ── quote_channel ──────────────────────────────────────────────────────────
  -- How the quote is delivered to the client (Quote tab → Quote Delivery row).
  -- Also used on leads (lead.quote_channel) — same values, shared category.
  ('quote_channel', 'sms',       'SMS',       0),
  ('quote_channel', 'whatsapp',  'WhatsApp',  1),
  ('quote_channel', 'email',     'Email',     2),
  ('quote_channel', 'in_person', 'In-person', 3),

  -- ── follow_up_freq ─────────────────────────────────────────────────────────
  -- How often the follow-up reminder fires (Quote tab → Follow-up Schedule).
  ('follow_up_freq', 'daily',       'Daily',        0),
  ('follow_up_freq', 'every_2days', 'Every 2 days', 1),
  ('follow_up_freq', 'weekly',      'Weekly',        2),

  -- ── ticket_priority ────────────────────────────────────────────────────────
  -- Priority level on the ticket (Info tab).
  ('ticket_priority', 'low',    'Low',    0),
  ('ticket_priority', 'normal', 'Normal', 1),
  ('ticket_priority', 'high',   'High',   2),

  -- ── order_source ───────────────────────────────────────────────────────────
  -- How this order originated (Info tab).
  ('order_source', 'quoted', 'Quoted (from lead)', 0),
  ('order_source', 'direct', 'Direct',             1),

  -- ── ticket_payment ─────────────────────────────────────────────────────────
  -- Accepted payment methods shown as checkboxes in the Quote tab.
  -- Source: docs/order-ticket/open-questions.md C1 (owner confirmed these three)
  ('ticket_payment', 'card_default', 'Card Payment', 0),
  ('ticket_payment', 'zelle',        'Zelle',         1),
  ('ticket_payment', 'offline',      'Offline',       2)

on conflict (category, value) do nothing;
