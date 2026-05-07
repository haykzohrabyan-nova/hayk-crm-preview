-- ─────────────────────────────────────────────────────────────────────────────
-- TEST DATA SEED — for manual testing only. DO NOT run in production.
-- All records are tagged with company '[TEST]' for easy identification.
--
-- TO DELETE ALL TEST DATA after testing, run:
--   delete from public.leads    where customer_id in (select id from public.customers where company like '[TEST]%');
--   delete from public.customers where company like '[TEST]%';
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Test Customers ────────────────────────────────────────────────────────────

insert into public.customers (id, first_name, last_name, email, phone, company, industry, heat_tag)
values
  ('00000001-0000-0000-0000-000000000001', 'Alice',   'Martin',   'alice@acme.com',      '3101234001', '[TEST] Acme Printing',      'Retail',         'hot'),
  ('00000001-0000-0000-0000-000000000002', 'Bob',     'Chen',     'bob@bravo.com',       '3101234002', '[TEST] Bravo Signs',        'Signage',        'warm'),
  ('00000001-0000-0000-0000-000000000003', 'Carlos',  'Rivera',   'carlos@charlie.com',  '3101234003', '[TEST] Charlie Labels',     'Manufacturing',  null),
  ('00000001-0000-0000-0000-000000000004', 'Diana',   'Lee',      'diana@delta.com',     '3101234004', '[TEST] Delta Apparel',      'Apparel',        'warm'),
  ('00000001-0000-0000-0000-000000000005', 'Evan',    'Gomez',    'evan@echo.com',       '3101234005', '[TEST] Echo Events',        'Events',         null),
  ('00000001-0000-0000-0000-000000000006', 'Fatima',  'Hassan',   'fatima@foxtrot.com',  '3101234006', '[TEST] Foxtrot Corp',       'Corporate',      'hot'),
  ('00000001-0000-0000-0000-000000000007', 'George',  'Tanaka',   'george@golf.com',     '3101234007', '[TEST] Golf Promos',        'Promotions',     null),
  ('00000001-0000-0000-0000-000000000008', 'Hannah',  'Wright',   'hannah@hotel.com',    '3101234008', '[TEST] Hotel Supplies',     'Hospitality',    'warm')
on conflict (id) do nothing;


-- ── Test Leads — All Leads tab (Pending + Validated, is_inbox = false) ────────

insert into public.leads (id, customer_id, source, urgency, status, is_inbox, interests, sdr_comment)
values
  -- Pending
  ('00000002-0000-0000-0000-000000000001', '00000001-0000-0000-0000-000000000001',
   'Walk-in', 'High', 'Pending', false,
   '{"Stickers": true, "Labels": true}',
   'Customer walked in asking about bulk sticker orders. Very keen.'),

  ('00000002-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000002',
   'Website', 'Medium', 'Pending', false,
   '{"Banners": true, "Flyers": true}',
   'Came through the website inquiry form.'),

  ('00000002-0000-0000-0000-000000000003', '00000001-0000-0000-0000-000000000003',
   'Referral', 'Low', 'Pending', false,
   '{"Boxes": true}',
   null),

  -- Validated (SDR is actively working)
  ('00000002-0000-0000-0000-000000000004', '00000001-0000-0000-0000-000000000004',
   'Google', 'High', 'Validated', false,
   '{"Labels": true, "Stickers": true, "Flyers": true}',
   'Validated — waiting to confirm quantities before routing.')

on conflict (id) do nothing;


-- ── Test Leads — On Hold tab (SDR hold) ───────────────────────────────────────

insert into public.leads (id, customer_id, source, urgency, status, is_inbox, hold_reason, hold_notes, hold_until, held_at, prev_status)
values
  ('00000002-0000-0000-0000-000000000005', '00000001-0000-0000-0000-000000000005',
   'Walk-in', 'Medium', 'On Hold', false,
   'awaiting_artwork',
   'Customer needs to send final artwork file. Following up next week.',
   now() + interval '7 days',
   now() - interval '2 days',
   'Validated'),

  ('00000002-0000-0000-0000-000000000006', '00000001-0000-0000-0000-000000000006',
   'Referral', 'Low', 'On Hold', false,
   'awaiting_customer_response',
   'Left a voicemail. Will retry tomorrow.',
   null,
   now() - interval '1 day',
   'Pending')

on conflict (id) do nothing;


-- ── Test Leads — Directed to Sales tab (Routed to Sales) ──────────────────────

insert into public.leads (id, customer_id, source, urgency, status, sales_status, is_inbox, quote_total, quote_channel, sdr_comment)
values
  ('00000002-0000-0000-0000-000000000007', '00000001-0000-0000-0000-000000000007',
   'Manual', 'High', 'Routed to Sales', 'Ongoing', false,
   1250.00, 'Email',
   'Verbally quoted $1250 for 500 branded tote bags. Ready for Sales to follow up.'),

  ('00000002-0000-0000-0000-000000000008', '00000001-0000-0000-0000-000000000008',
   'Website', 'Medium', 'Routed to Sales', 'Ongoing', false,
   null, null,
   'Hotel chain interested in custom packaging. No quote yet — Sales to qualify.')

on conflict (id) do nothing;


-- ── Test Leads — Rejected tab ─────────────────────────────────────────────────

insert into public.leads (id, customer_id, source, urgency, status, is_inbox, rejection_reason, rejection_notes)
values
  ('00000002-0000-0000-0000-000000000009', '00000001-0000-0000-0000-000000000003',
   'Walk-in', 'Low', 'Rejected', false,
   'not_a_fit',
   'Looking for personal use quantities only, not a business account.')

on conflict (id) do nothing;
