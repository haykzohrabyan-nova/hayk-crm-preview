-- Default Stripe refund reasons (Admin → Dropdown Options → Stripe Refund Reasons)

INSERT INTO public.lookup_values (category, value, label, sort_order) VALUES
  ('stripe_refund_reason', 'refund_order_issue',        'Order / production issue', 0),
  ('stripe_refund_reason', 'refund_customer_request', 'Customer requested refund',  1),
  ('stripe_refund_reason', 'refund_duplicate',          'Duplicate payment',          2),
  ('stripe_refund_reason', 'refund_pricing_error',      'Pricing / quote error',      3),
  ('stripe_refund_reason', 'refund_other',              'Other',                      4)
ON CONFLICT (category, value) DO NOTHING;
