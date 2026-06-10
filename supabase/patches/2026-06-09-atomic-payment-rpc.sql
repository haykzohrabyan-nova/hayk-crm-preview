-- Atomic payment recording function
-- Prevents the read→compute→write race condition in record_payment where two
-- concurrent calls (e.g. accountant + Stripe webhook) both read the same
-- payment_amount_received, compute the same newTotal, and one payment is lost.
--
-- The SELECT ... FOR UPDATE acquires a row-level lock so concurrent calls
-- serialize: the second caller waits for the first to commit, then reads the
-- already-updated total and adds its amount on top of the correct value.

create or replace function record_ticket_payment_atomic(
  p_ticket_id   uuid,
  p_amount      numeric,
  p_mode        text,        -- 'deposit' | 'balance' | 'full'
  p_method      text,
  p_now         timestamptz,
  p_receipt_id  text default null
)
returns table (
  payment_amount_received   numeric,
  quote_final_total         numeric,
  ticket_status             text,
  deposit_paid_at           timestamptz,
  balance_paid_at           timestamptz,
  payment_paid_at           timestamptz,
  payment_status            text
)
language plpgsql security definer
as $$
declare
  v_already_paid  numeric;
  v_total         numeric;
  v_new_total     numeric;
  v_fully_paid    boolean;
begin
  -- Lock the row for the duration of this transaction to block concurrent payment writes
  select
    coalesce(t.payment_amount_received, 0),
    coalesce(t.quote_final_total, 0)
  into v_already_paid, v_total
  from job_tickets t
  where t.id = p_ticket_id
  for update;

  if not found then
    raise exception 'ticket_not_found' using errcode = 'P0002';
  end if;

  v_new_total  := least(v_already_paid + p_amount, v_total);
  v_fully_paid := v_new_total >= v_total - 0.01;

  return query
  update job_tickets t set
    payment_amount_received = v_new_total,
    updated_at              = p_now,

    -- Deposit fields: only stamp on the first deposit
    deposit_amount     = case when p_mode = 'deposit' and t.deposit_paid_at is null then p_amount     else t.deposit_amount     end,
    deposit_paid_at    = case when p_mode = 'deposit' and t.deposit_paid_at is null then p_now        else t.deposit_paid_at    end,
    deposit_receipt_id = case when p_mode = 'deposit' and t.deposit_paid_at is null then p_receipt_id else t.deposit_receipt_id end,
    deposit_method     = case when p_mode = 'deposit' and t.deposit_paid_at is null then p_method     else t.deposit_method     end,

    -- Balance / full-payment fields
    balance_paid_at     = case when p_mode in ('balance', 'full') then p_now    else t.balance_paid_at     end,
    payment_method_used = case when p_mode in ('balance', 'full') then p_method else t.payment_method_used end,

    -- Mark fully-paid only once
    payment_paid_at = case when v_fully_paid and t.payment_paid_at is null then p_now else t.payment_paid_at end,
    payment_status  = case
                        when v_fully_paid       then 'paid'
                        when v_new_total > 0.01 then 'partial'
                        else t.payment_status
                      end,

    -- Mark evidence reviewed if it was pending
    payment_evidence_reviewed_at = case
      when (t.payment_evidence_url is not null or t.stripe_payment_intent_id is not null)
           and t.payment_evidence_reviewed_at is null
      then p_now
      else t.payment_evidence_reviewed_at
    end,

    -- Clear resubmit / OTP fields
    payment_evidence_resubmit_requested_at    = null,
    payment_evidence_resubmit_requested_by_id = null,
    payment_evidence_resubmit_reason          = null,
    payment_evidence_resubmit_received_at     = null,
    payment_evidence_resubmit_token           = null,
    payment_evidence_otp_hash                 = null,
    payment_evidence_otp_expires_at           = null

  where t.id = p_ticket_id
  returning
    t.payment_amount_received,
    t.quote_final_total,
    t.ticket_status,
    t.deposit_paid_at,
    t.balance_paid_at,
    t.payment_paid_at,
    t.payment_status;
end;
$$;

-- Grant execute to the service role used by the admin client
grant execute on function record_ticket_payment_atomic(uuid, numeric, text, text, timestamptz, text)
  to service_role;
