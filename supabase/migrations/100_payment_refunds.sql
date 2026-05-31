-- Unified payment refunds (ledger + ticket summary)

CREATE TABLE IF NOT EXISTS public.ticket_payment_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.job_tickets(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  payment_mode text NOT NULL CHECK (payment_mode IN ('deposit', 'balance', 'full')),
  method text NOT NULL,
  source text NOT NULL CHECK (source IN ('stripe', 'manual')),
  stripe_refund_id text,
  reason text NOT NULL,
  notes text,
  evidence_path text,
  refunded_by_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticket_payment_refunds_ticket_id_idx
  ON public.ticket_payment_refunds (ticket_id);

CREATE INDEX IF NOT EXISTS ticket_payment_refunds_refunded_by_id_idx
  ON public.ticket_payment_refunds (refunded_by_id);

ALTER TABLE public.job_tickets
  ADD COLUMN IF NOT EXISTS refund_status text NOT NULL DEFAULT 'none'
    CHECK (refund_status IN ('none', 'partial', 'full')),
  ADD COLUMN IF NOT EXISTS total_refunded_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_refunded_by_id uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS job_tickets_refund_status_idx
  ON public.job_tickets (refund_status)
  WHERE refund_status <> 'none';

INSERT INTO public.lookup_values (category, value, label, sort_order) VALUES
  ('payment_refund_reason', 'refund_order_issue',        'Order / production issue', 0),
  ('payment_refund_reason', 'refund_customer_request', 'Customer requested refund',  1),
  ('payment_refund_reason', 'refund_duplicate',          'Duplicate payment',          2),
  ('payment_refund_reason', 'refund_pricing_error',      'Pricing / quote error',      3),
  ('payment_refund_reason', 'refund_other',              'Other',                      4)
ON CONFLICT (category, value) DO NOTHING;
