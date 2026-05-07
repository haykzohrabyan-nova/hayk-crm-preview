insert into public.lookup_values (category, value, label, sort_order) values
  -- sources (from POC VerifyDrawer.jsx)
  ('source', 'website_form',          'Website Form',             0),
  ('source', 'email',                 'Email',                    1),
  ('source', 'phone_call',            'Phone Call',               2),
  ('source', 'walk_in',               'Walk-in',                  3),
  ('source', 'referral',              'Referral',                 4),
  ('source', 'facebook',              'Facebook',                 5),
  ('source', 'instagram',             'Instagram',                6),
  ('source', 'google',                'Google',                   7),
  ('source', 'yelp',                  'Yelp',                     8),
  ('source', 'linkedin',              'LinkedIn',                 9),
  ('source', 'trade_show',            'Trade Show',               10),
  ('source', 'direct_mail',           'Direct Mail',              11),
  ('source', 'manual',                'Manual',                   12),
  ('source', 'manual_crm',            'Manual (CRM)',             13),
  ('source', 'manual_sales_sourced',  'Manual (Sales Sourced)',   14),

  -- industries (from POC)
  ('industry', 'cosmetics_beauty',        'Cosmetics & Beauty',           0),
  ('industry', 'food_beverage',           'Food & Beverage',              1),
  ('industry', 'healthcare_medical',      'Healthcare & Medical',         2),
  ('industry', 'cannabis_cbd',            'Cannabis & CBD',               3),
  ('industry', 'retail_apparel',          'Retail & Apparel',             4),
  ('industry', 'e_commerce',              'E-Commerce',                   5),
  ('industry', 'hospitality_events',      'Hospitality & Events',         6),
  ('industry', 'agencies_marketing',      'Agencies & Marketing',         7),
  ('industry', 'education',               'Education',                    8),
  ('industry', 'real_estate',             'Real Estate',                  9),
  ('industry', 'manufacturing_industrial','Manufacturing & Industrial',   10),
  ('industry', 'tech_electronics',        'Tech & Electronics',           11),
  ('industry', 'non_profit',              'Non-Profit',                   12),
  ('industry', 'other',                   'Other',                        13),

  -- urgency
  ('urgency', 'high',   'High',   0),
  ('urgency', 'medium', 'Medium', 1),
  ('urgency', 'low',    'Low',    2),

  -- hold reasons (from POC)
  ('hold_reason', 'awaiting_customer_response',  'Awaiting customer response',       0),
  ('hold_reason', 'awaiting_artwork_files',       'Awaiting artwork / files',         1),
  ('hold_reason', 'awaiting_payment',             'Awaiting payment confirmation',    2),
  ('hold_reason', 'pricing_review',               'Pricing review needed',            3),
  ('hold_reason', 'vacation_unavailable',         'Vacation / customer unavailable',  4),
  ('hold_reason', 'other',                        'Other',                            5),

  -- reject reasons (from POC)
  ('reject_reason', 'wrong_number_fake',  'Wrong Number / Fake',    0),
  ('reject_reason', 'spam_bot',           'Spam / Bot',             1),
  ('reject_reason', 'budget_too_low',     'Budget Too Low',         2),
  ('reject_reason', 'existing_customer',  'Existing Customer',      3),
  ('reject_reason', 'timing_not_right',   'Timing Not Right',       4),
  ('reject_reason', 'not_a_fit',          'Not a Fit / Other',      5),

  -- route to sales reasons (from POC)
  ('route_reason', 'large_volume',         'Unusually Large Volume',       0),
  ('route_reason', 'complex_dimensions',   'Complex Custom Dimensions',    1),
  ('route_reason', 'vip_client',           'High-Value VIP Client',        2),
  ('route_reason', 'technical_support',    'Requires Technical Support',   3),
  ('route_reason', 'out_of_box',           'Out of Box request',           4),
  ('route_reason', 'other',                'Other',                        5),

  -- sales drop reasons (from POC)
  ('sales_drop_reason', 'price',      'Price',      0),
  ('sales_drop_reason', 'ghosted',    'Ghosted',    1),
  ('sales_drop_reason', 'competitor', 'Competitor', 2),
  ('sales_drop_reason', 'timeline',   'Timeline',   3),
  ('sales_drop_reason', 'other',      'Other',      4)

on conflict (category, value) do nothing;
