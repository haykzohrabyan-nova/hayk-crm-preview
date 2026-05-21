-- ─────────────────────────────────────────────────────────────────────────────
-- 066 — Per-ticket payment configuration on job_tickets
--
-- Each quote/order can have its own payment settings configured by the rep.
-- These columns mirror the payment.html UI (strategy, deposit, channels,
-- delivery channel, follow-up schedule).
--
-- Also adds payment recording columns used by the checkout stepper
-- (deposit paid, balance paid, production released).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Per-ticket payment strategy ───────────────────────────────────────────────

ALTER TABLE public.job_tickets
  ADD COLUMN IF NOT EXISTS ticket_payment_strategy     TEXT
    CHECK (ticket_payment_strategy IN ('partial', 'full', 'net')),
  ADD COLUMN IF NOT EXISTS ticket_deposit_type         TEXT
    CHECK (ticket_deposit_type IN ('percent', 'fixed')),
  ADD COLUMN IF NOT EXISTS ticket_deposit_value        NUMERIC,
  ADD COLUMN IF NOT EXISTS ticket_dep_handling         TEXT
    CHECK (ticket_dep_handling IN ('cash', 'gateway')),
  ADD COLUMN IF NOT EXISTS ticket_receipt_id           TEXT,
  ADD COLUMN IF NOT EXISTS ticket_partial_channels     TEXT[],
  ADD COLUMN IF NOT EXISTS ticket_full_channels        TEXT[],
  ADD COLUMN IF NOT EXISTS ticket_require_client_confirm BOOLEAN,
  ADD COLUMN IF NOT EXISTS ticket_net_terms_label      TEXT;

-- ── Quote delivery & follow-up ────────────────────────────────────────────────

ALTER TABLE public.job_tickets
  ADD COLUMN IF NOT EXISTS ticket_quote_channel        TEXT
    CHECK (ticket_quote_channel IN ('sms', 'email', 'both')),
  ADD COLUMN IF NOT EXISTS ticket_dest_phone           TEXT,
  ADD COLUMN IF NOT EXISTS ticket_dest_email           TEXT,
  ADD COLUMN IF NOT EXISTS ticket_follow_up_enabled    BOOLEAN,
  ADD COLUMN IF NOT EXISTS ticket_follow_up_count      INTEGER,
  ADD COLUMN IF NOT EXISTS ticket_follow_up_freq       TEXT
    CHECK (ticket_follow_up_freq IN ('daily', 'every-3-days', 'weekly'));

-- ── Payment recording ─────────────────────────────────────────────────────────

ALTER TABLE public.job_tickets
  ADD COLUMN IF NOT EXISTS payment_amount_received     NUMERIC,
  ADD COLUMN IF NOT EXISTS payment_paid_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_method_used         TEXT,
  ADD COLUMN IF NOT EXISTS deposit_amount              NUMERIC,
  ADD COLUMN IF NOT EXISTS deposit_paid_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deposit_receipt_id          TEXT,
  ADD COLUMN IF NOT EXISTS deposit_method              TEXT,
  ADD COLUMN IF NOT EXISTS balance_paid_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS production_released_at      TIMESTAMPTZ;

-- ── Comments ──────────────────────────────────────────────────────────────────

COMMENT ON COLUMN public.job_tickets.ticket_payment_strategy
  IS 'Payment strategy for this quote: partial | full | net';
COMMENT ON COLUMN public.job_tickets.ticket_deposit_type
  IS 'How the deposit is calculated: percent | fixed';
COMMENT ON COLUMN public.job_tickets.ticket_deposit_value
  IS 'Deposit percentage (0-100) or fixed dollar amount';
COMMENT ON COLUMN public.job_tickets.ticket_dep_handling
  IS 'How the deposit is collected: cash (offline) | gateway (online)';
COMMENT ON COLUMN public.job_tickets.ticket_receipt_id
  IS 'Receipt / reference ID for cash deposit or full cash payment';
COMMENT ON COLUMN public.job_tickets.ticket_partial_channels
  IS 'Accepted channels for balance payment when strategy is partial';
COMMENT ON COLUMN public.job_tickets.ticket_full_channels
  IS 'Accepted channels for full payment';
COMMENT ON COLUMN public.job_tickets.ticket_require_client_confirm
  IS 'If true, customer must confirm the quote before production gate opens';
COMMENT ON COLUMN public.job_tickets.ticket_net_terms_label
  IS 'Net terms period: net-10 | net-15 | net-20 | net-30 | net-45 | net-60';
COMMENT ON COLUMN public.job_tickets.ticket_quote_channel
  IS 'Channel used to send the quote: sms | email | both';
COMMENT ON COLUMN public.job_tickets.ticket_dest_phone
  IS 'Phone number the quote was sent to (SMS)';
COMMENT ON COLUMN public.job_tickets.ticket_dest_email
  IS 'Email address the quote was sent to';
COMMENT ON COLUMN public.job_tickets.ticket_follow_up_enabled
  IS 'Whether automated follow-up reminders are enabled for this quote';
COMMENT ON COLUMN public.job_tickets.ticket_follow_up_count
  IS 'Number of follow-up reminders to send';
COMMENT ON COLUMN public.job_tickets.ticket_follow_up_freq
  IS 'Frequency of follow-up reminders: daily | every-3-days | weekly';
COMMENT ON COLUMN public.job_tickets.payment_amount_received
  IS 'Total amount collected (deposit + balance, or full payment)';
COMMENT ON COLUMN public.job_tickets.payment_paid_at
  IS 'Timestamp when the ticket was fully paid';
COMMENT ON COLUMN public.job_tickets.payment_method_used
  IS 'Method used for the final/full payment: cash | wire | ach | zelle | check | card';
COMMENT ON COLUMN public.job_tickets.deposit_amount
  IS 'Deposit amount actually collected (partial strategy)';
COMMENT ON COLUMN public.job_tickets.deposit_paid_at
  IS 'Timestamp when the deposit was recorded';
COMMENT ON COLUMN public.job_tickets.deposit_receipt_id
  IS 'Receipt / reference ID for the deposit payment';
COMMENT ON COLUMN public.job_tickets.deposit_method
  IS 'Method used for the deposit: cash | wire | ach | zelle | check | card';
COMMENT ON COLUMN public.job_tickets.balance_paid_at
  IS 'Timestamp when the remaining balance was collected (partial strategy)';
COMMENT ON COLUMN public.job_tickets.production_released_at
  IS 'Timestamp when the rep released the order to production';
