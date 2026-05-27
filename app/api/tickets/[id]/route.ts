import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { sendQuoteToCustomer, sendPaymentReminder, sendPaymentConfirmed, sendInvoiceLinkToCustomer, sendOrderReadyToCustomer, resolveTicketOutreach } from "@/lib/integrations/send-quote";
import { initializeTicketFollowUpSchedule } from "@/lib/utils/initialize-ticket-follow-up";
import { logTicketPaymentRecorded } from "@/lib/utils/log-ticket-payment-recorded";
import { maybeAutoRecordCashPayment } from "@/lib/utils/maybe-auto-record-cash-payment";
import { maybeAutoReleaseProduction, AUTO_RELEASE_SELECT } from "@/lib/utils/maybe-auto-release-production";
import { maybeConvertQuoteToOrder } from "@/lib/utils/maybe-convert-quote-to-order";
import { markLinkedLeadWonOnProduction } from "@/lib/utils/mark-lead-won-on-production";
import { isTicketPaidInFull } from "@/lib/utils/invoice-payment-summary";
import {
  assignOrderReferenceCode,
  resolveTicketId,
} from "@/lib/utils/reference-codes";
import { fetchManualConvertMeta } from "@/lib/utils/manual-convert-meta";
import { canAccessTicket, canMutateTicket } from "@/lib/utils/ticket-access";
type Params = { params: Promise<{ id: string }> };

// ─── GET /api/tickets/[id] ────────────────────────────────────────────────────

export async function GET(_request: NextRequest, { params }: Params) {
  const { id: rawId } = await params;
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();
  const ticketId = await resolveTicketId(admin, rawId);
  if (!ticketId) {
    return NextResponse.json({ error: "Ticket not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  const { data: ticket, error } = await admin
    .from("job_tickets")
    .select(
      `*,
       customer:customers(id, first_name, last_name, company, phone, email, industry, website),
       lead:leads(
         id, status, sales_status, urgency, source,
         sdr_comment, hold_reason, rejection_reason, is_returning_customer, interests, quantities,
         customer:customers(id, first_name, last_name, company, phone, email, industry)
       )`
    )
    .eq("id", ticketId)
    .single();

  if (error || !ticket) {
    return NextResponse.json({ error: "Ticket not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  // Scope check: reps can only view their own tickets.
  // Exception: sales/admin can view 'routed' tickets (SDR hand-offs awaiting claim).
  // Exception: accountant can view any ticket (matches scopeJobTicketsQuery on list routes).
  if (!canAccessTicket(ticket, userId, roleName)) {
    return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
  }

  // Fetch creator name separately (created_by_id → auth.users, not user_profiles FK)
  let created_by: { id: string; full_name: string } | null = null;
  if (ticket.created_by_id) {
    const { data: profile } = await admin
      .from("user_profiles")
      .select("id, full_name")
      .eq("id", ticket.created_by_id)
      .single();
    created_by = profile ?? null;
  }

  const convert_meta = await fetchManualConvertMeta(admin, ticketId, ticket);

  return NextResponse.json({ ticket: { ...ticket, created_by, convert_meta } });
}

// ─── PATCH /api/tickets/[id] ──────────────────────────────────────────────────

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id: rawId } = await params;
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body.", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const admin = createAdminClient();
  const ticketId = await resolveTicketId(admin, rawId);
  if (!ticketId) {
    return NextResponse.json({ error: "Ticket not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  // Load existing ticket to check ownership and current status
  const { data: existing, error: fetchErr } = await admin
    .from("job_tickets")
    .select("id, created_by_id, ticket_status, ticket_kind, linked_lead_id, customer_id, quote_channel, quote_destination, contact_name, contact_email, client_confirmed, ticket_require_client_confirm, ticket_full_channels, ticket_partial_channels, ticket_dep_handling, payment_status, quote_final_total, payment_amount_received, payment_paid_at, deposit_amount, deposit_paid_at, payment_evidence_url, payment_evidence_submitted_at, payment_evidence_amount, ticket_payment_strategy, ticket_deposit_type, ticket_deposit_value, reference_code, production_released_at, balance_paid_at")
    .eq("id", ticketId)
    .single();

  if (fetchErr || !existing) {
    return NextResponse.json({ error: "Ticket not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  // ── Payment reminder: send payment link via selected channel ───────────────
  if (body.send_payment_reminder === true) {
    const now = new Date().toISOString();
    const reminderChannel     = (body.reminder_channel as string | undefined) ?? existing.quote_channel ?? "email";
    const reminderDestination = (body.reminder_destination as string | undefined) ?? existing.quote_destination ?? null;

    try {
      const [{ data: fullTicket }, { data: companyRow }] = await Promise.all([
        admin
          .from("job_tickets")
          .select("*, customer:customers(first_name, last_name, email, phone)")
          .eq("id", ticketId)
          .single(),
        admin.from("company_settings").select("*").eq("id", 1).single(),
      ]);
      if (fullTicket && companyRow && fullTicket.reference_code) {
        sendPaymentReminder(
          fullTicket as typeof fullTicket & { reference_code: string },
          companyRow,
          { channel: reminderChannel, destination: reminderDestination ?? undefined }
        ).then((result) => {
          if (!result.ok) {
            console.error("[payment-reminder] delivery failed:", result.error, { ticketId: ticketId, channel: result.channel, destination: reminderDestination });
          } else {
            console.log("[payment-reminder] delivered ok:", { ticketId: ticketId, channel: result.channel, destination: reminderDestination });
          }
        });
      } else {
        console.warn("[payment-reminder] skipped — missing ticket, company, or reference_code", {
          ticketId: ticketId,
          hasTicket: !!fullTicket,
          hasCompany: !!companyRow,
          referenceCode: fullTicket?.reference_code ?? null,
        });
      }
    } catch (err) {
      console.error("[payment-reminder] unexpected error:", err);
    }

    await admin.from("activities").insert({
      type: "ticket_payment_reminder_sent",
      lead_id: existing.linked_lead_id ?? null,
      customer_id: existing.customer_id ?? null,
      ticket_id: ticketId,
      by_user_id: userId,
      payload: { channel: reminderChannel, destination: reminderDestination },
      created_at: now,
    });

    return NextResponse.json({ ok: true });
  }

  // ── Resend invoice: customer portal link (works paid / unpaid / in production) ─
  if (body.resend_invoice === true) {
    const now = new Date().toISOString();

    const [{ data: fullTicket }, { data: companyRow }] = await Promise.all([
      admin
        .from("job_tickets")
        .select("*, customer:customers(first_name, last_name, email, phone)")
        .eq("id", ticketId)
        .single(),
      admin.from("company_settings").select("*").eq("id", 1).single(),
    ]);

    if (!fullTicket?.public_token) {
      return NextResponse.json({ error: "This ticket has no public link.", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    const refCode = fullTicket.reference_code ?? `ORD-${fullTicket.id.slice(0, 8).toUpperCase()}`;
    const result = await sendInvoiceLinkToCustomer(
      { ...fullTicket, reference_code: refCode } as typeof fullTicket & { reference_code: string },
      companyRow ?? {},
      {
        channel: body.invoice_channel as string | undefined,
        destination: body.invoice_destination as string | undefined,
      },
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? "Failed to send invoice link.", code: "SEND_FAILED" },
        { status: 502 },
      );
    }

    await admin.from("activities").insert({
      type: "ticket_invoice_resent",
      lead_id: existing.linked_lead_id ?? null,
      customer_id: existing.customer_id ?? null,
      ticket_id: ticketId,
      by_user_id: userId,
      payload: { channel: result.channel, destination: body.invoice_destination ?? fullTicket.quote_destination ?? null },
      created_at: now,
    });

    return NextResponse.json({ ok: true, channel: result.channel });
  }

  // ── Claim action: sales/admin can claim a routed ticket ────────────────────
  // Body: { ticket_status: "draft", claim_ownership: true }
  if (body.claim_ownership === true) {
    if (roleName !== "sales" && roleName !== "admin") {
      return NextResponse.json({ error: "Only Sales or Admin users can claim routed quotes.", code: "FORBIDDEN" }, { status: 403 });
    }
    if (existing.ticket_status !== "routed") {
      return NextResponse.json({ error: "Only routed quotes can be claimed.", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const { data: claimed, error: claimErr } = await admin
      .from("job_tickets")
      .update({ ticket_status: "draft", created_by_id: userId, updated_at: now })
      .eq("id", ticketId)
      .select()
      .single();

    if (claimErr) {
      return NextResponse.json({ error: claimErr.message, code: "DB_ERROR" }, { status: 500 });
    }

    await admin.from("activities").insert({
      type: "order_ticket_status_changed",
      lead_id: existing.linked_lead_id ?? null,
      customer_id: existing.customer_id ?? null,
      ticket_id: ticketId,
      by_user_id: userId,
      payload: { from: "routed", to: "draft", action: "claimed" },
      created_at: now,
    });

    return NextResponse.json({ ticket: claimed });
  }

  // Normal update — enforce ownership (non-admins can only update their own tickets).
  // Accountants are allowed to record payment on any ticket (they have no created tickets).
  if (!canMutateTicket(existing, userId, roleName)) {
    return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
  }

  // Once a ticket is in 'order' status, non-admins may only update payment
  // fields and the production release flag — everything else is locked.
  const PAYMENT_ALLOWED_IN_ORDER = new Set([
    "payment_status",
    "payment_amount_received",
    "payment_paid_at",
    "payment_method_used",
    "deposit_amount",
    "deposit_paid_at",
    "deposit_receipt_id",
    "deposit_method",
    "balance_paid_at",
    "production_released_at",
    "payment_evidence_url",
    "payment_evidence_submitted_at",
  ]);
  if (existing.ticket_status === "order" && roleName !== "admin") {
    const locked = Object.keys(body).filter((k) => !PAYMENT_ALLOWED_IN_ORDER.has(k));
    if (locked.length > 0) {
      return NextResponse.json(
        { error: "Ticket is locked in order status. Contact an admin.", code: "LOCKED" },
        { status: 403 }
      );
    }
  }

  // Accountants may mark in-production orders complete only when paid in full.
  // Admins may complete with outstanding balance only after explicit acknowledgment.
  if ("ticket_status" in body && body.ticket_status === "completed" && existing.ticket_status === "in_production") {
    if (roleName === "accountant") {
      if (!isTicketPaidInFull(existing)) {
        return NextResponse.json(
          { error: "Order must be paid in full before marking completed.", code: "VALIDATION_ERROR" },
          { status: 400 },
        );
      }
    } else if (roleName === "admin" && !isTicketPaidInFull(existing) && body.acknowledge_outstanding_balance !== true) {
      const total = Number(existing.quote_final_total ?? 0);
      const paid = Number(existing.payment_amount_received ?? existing.deposit_amount ?? 0);
      const balanceDue = Math.max(0, Math.round((total - paid) * 100) / 100);
      return NextResponse.json(
        {
          error: `This order has ${balanceDue.toFixed(2)} outstanding. Confirm completion with outstanding balance before proceeding.`,
          code: "BALANCE_DUE",
          balance_due: balanceDue,
        },
        { status: 400 },
      );
    }
  }

  if (roleName === "accountant" && "ticket_status" in body && body.ticket_status !== existing.ticket_status) {
    if (body.ticket_status === "completed") {
      if (existing.ticket_status !== "in_production") {
        return NextResponse.json(
          { error: "Only in-production orders can be marked completed.", code: "VALIDATION_ERROR" },
          { status: 400 },
        );
      }
    } else {
      return NextResponse.json(
        { error: "Accountants cannot change ticket status.", code: "FORBIDDEN" },
        { status: 403 },
      );
    }
  }

  // ── record_payment action ────────────────────────────────────────────────
  // Body: { record_payment: true, payment_mode: "deposit"|"balance"|"full",
  //         payment_method: string, payment_amount: number, receipt_id?: string }
  if (body.record_payment === true) {
    if (roleName !== "admin" && roleName !== "accountant") {
      return NextResponse.json(
        { error: "Only accountants can confirm submitted payments.", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    const mode   = body.payment_mode   as "deposit" | "balance" | "full" | undefined;
    const method = body.payment_method as string | undefined;
    const amount = Number(body.payment_amount);

    if (!mode || !method || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "record_payment requires payment_mode, payment_method, and a positive payment_amount.", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const receiptId = String(body.receipt_id ?? "").trim() || null;

    // Fetch current ticket amounts + payment config for auto-production gate
    const { data: cur } = await admin
      .from("job_tickets")
      .select(`id, ticket_status, quote_final_total, payment_amount_received, deposit_amount, deposit_paid_at,
               balance_paid_at, payment_paid_at, client_confirmed, production_released_at,
               payment_evidence_url, payment_evidence_submitted_at,
               public_token, reference_code, quote_channel, quote_destination, title,
               ticket_payment_strategy, ticket_deposit_type, ticket_deposit_value,
               ticket_dep_handling, ticket_full_channels, ticket_partial_channels,
               ticket_require_client_confirm, linked_lead_id, customer_id,
               customer:customers(first_name, last_name, email, phone)`)
      .eq("id", ticketId)
      .single();

    const quoteTotal    = Number(cur?.quote_final_total ?? 0);
    const alreadyPaid   = Number(cur?.payment_amount_received ?? 0);
    const newTotal      = Math.min(alreadyPaid + amount, quoteTotal);
    const fullyPaid     = newTotal >= quoteTotal - 0.01;

    const payPatch: Record<string, unknown> = {
      updated_at: now,
      payment_amount_received: newTotal,
      payment_evidence_amount: null,
    };

    if (mode === "deposit" && !cur?.deposit_paid_at) {
      payPatch.deposit_amount    = amount;
      payPatch.deposit_paid_at   = now;
      payPatch.deposit_receipt_id = receiptId;
      payPatch.deposit_method    = method;
    } else if (mode === "balance" || mode === "full") {
      payPatch.balance_paid_at   = now;
      payPatch.payment_method_used = method;
    }

    if (fullyPaid && !cur?.payment_paid_at) {
      payPatch.payment_paid_at = now;
      payPatch.payment_status  = "paid";
    } else if (mode === "deposit") {
      payPatch.payment_status = "partial";
    }

    // Clear evidence queue fields once accountant confirms
    if (cur?.payment_evidence_url) {
      payPatch.payment_evidence_url = null;
      payPatch.payment_evidence_submitted_at = null;
    }

    const { data: payUpdated, error: payErr } = await admin
      .from("job_tickets")
      .update(payPatch)
      .eq("id", ticketId)
      .select()
      .single();

    if (payErr) {
      return NextResponse.json({ error: payErr.message, code: "DB_ERROR" }, { status: 500 });
    }

    const hadPendingEvidence = !!cur?.payment_evidence_submitted_at && !!cur?.payment_evidence_url;

    const { data: freshRow } = await admin
      .from("job_tickets")
      .select(AUTO_RELEASE_SELECT.replace(/\s+/g, " "))
      .eq("id", ticketId)
      .single();

    let productionReleased = false;
    if (freshRow) {
      const convertResult = await maybeConvertQuoteToOrder(
        admin,
        freshRow as unknown as import("@/lib/utils/maybe-auto-release-production").AutoReleaseTicket,
        now,
        { byUserId: userId, via: "accountant_confirm" },
      );

      const { data: afterConvert } = await admin
        .from("job_tickets")
        .select(AUTO_RELEASE_SELECT.replace(/\s+/g, " "))
        .eq("id", ticketId)
        .single();

      if (afterConvert) {
        const releaseResult = await maybeAutoReleaseProduction(
          admin,
          afterConvert as unknown as import("@/lib/utils/maybe-auto-release-production").AutoReleaseTicket,
          now,
          { byUserId: userId, via: "accountant_confirm" },
        );
        productionReleased = releaseResult.released;
      }
    }

    if (productionReleased) {
      await markLinkedLeadWonOnProduction(admin, existing.linked_lead_id, now);
    }

    await logTicketPaymentRecorded(admin, {
      ticketId,
      leadId: existing.linked_lead_id,
      customerId: existing.customer_id,
      byUserId: userId,
      mode,
      method,
      amount,
      receiptId,
      newTotal,
      fullyPaid,
      via: hadPendingEvidence ? "accountant_evidence_confirm" : "staff_record",
      createdAt: now,
    });

    // Notify customer when accountant confirms a submitted payment proof
    if (hadPendingEvidence && cur?.reference_code && cur?.public_token) {
      const { data: companyRow } = await admin.from("company_settings").select("*").eq("id", 1).single();
      if (companyRow) {
        sendPaymentConfirmed(
          {
            reference_code: cur.reference_code,
            public_token: cur.public_token,
            quote_channel: cur.quote_channel,
            quote_destination: cur.quote_destination,
            customer: Array.isArray(cur.customer) ? cur.customer[0] : cur.customer,
          },
          companyRow,
          {
            amountConfirmed: amount,
            inProduction:
              productionReleased ||
              payUpdated?.ticket_status === "in_production" ||
              existing.ticket_status === "in_production" ||
              !!cur?.production_released_at,
            fullyPaid,
          },
        ).then((result) => {
          if (!result.ok) {
            console.error("[payment-confirmed] delivery failed:", result.error, { ticketId: ticketId });
          }
        });

        await admin.from("activities").insert({
          type: "ticket_payment_confirmed_sent",
          lead_id: existing.linked_lead_id ?? null,
          customer_id: existing.customer_id ?? null,
          ticket_id: ticketId,
          by_user_id: userId,
          payload: {
            amount,
            in_production:
              productionReleased ||
              payUpdated?.ticket_status === "in_production" ||
              existing.ticket_status === "in_production" ||
              !!cur?.production_released_at,
            fully_paid: fullyPaid,
          },
          created_at: now,
        });
      }
    }

    return NextResponse.json({ ticket: payUpdated });
  }

  // ── release_production action ─────────────────────────────────────────────
  // Body: { release_production: true }
  if (body.release_production === true) {
    const now = new Date().toISOString();
    const { data: released, error: relErr } = await admin
      .from("job_tickets")
      .update({ production_released_at: now, updated_at: now })
      .eq("id", ticketId)
      .select()
      .single();

    if (relErr) {
      return NextResponse.json({ error: relErr.message, code: "DB_ERROR" }, { status: 500 });
    }

    await admin.from("activities").insert({
      type: "ticket_production_released",
      lead_id: existing.linked_lead_id ?? null,
      customer_id: existing.customer_id ?? null,
      ticket_id: ticketId,
      by_user_id: userId,
      payload: { released_at: now },
      created_at: now,
    });

    return NextResponse.json({ ticket: released });
  }

  const ALLOWED_FIELDS = [
    "title",
    "ticket_status",
    "ticket_kind",
    "customer_id",
    "contact_name",
    "contact_email",
    "contact_company",
    "contact_phone",
    "quote_skus",
    "notes",
    "order_source",
    "priority",
    "due_date",
    "rush",
    "design_required",
    "die_cut",
    "special_requirements",
    "quote_channel",
    "quote_destination",
    "quote_subtotal",
    "quote_shipping",
    "discount_type",
    "discount_value",
    "discount_reason",
    "quote_pre_tax_total",
    "quote_tax_rate_percent",
    "quote_tax_amount",
    "quote_final_total",
    "tax_exempt",
    "sales_permit_number",
    "quote_payment_types",
    "prepayment_type",
    "prepayment_value",
    "prepayment_status",
    "quote_reminder_date",
    "follow_up_cycles",
    "follow_up_frequency",
    "client_confirmed",
    "follow_up_at",
    "follow_up_completed",
    "quote_approval_last_requested_at",
    "payment_status",
    // Per-ticket payment configuration (migration 066)
    "ticket_payment_strategy",
    "ticket_deposit_type",
    "ticket_deposit_value",
    "ticket_dep_handling",
    "ticket_receipt_id",
    "ticket_partial_channels",
    "ticket_full_channels",
    "ticket_require_client_confirm",
    "ticket_net_terms_label",
    "ticket_quote_channel",
    "ticket_dest_phone",
    "ticket_dest_email",
    "ticket_follow_up_enabled",
    "ticket_follow_up_count",
    "ticket_follow_up_freq",
    // Payment recording (migration 066)
    "payment_amount_received",
    "payment_paid_at",
    "payment_method_used",
    "deposit_amount",
    "deposit_paid_at",
    "deposit_receipt_id",
    "deposit_method",
    "balance_paid_at",
    "production_released_at",
    // Payment evidence (migration 068)
    "payment_evidence_url",
    "payment_evidence_submitted_at",
  ];

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updated_at: now };
  for (const key of ALLOWED_FIELDS) {
    if (key in body) patch[key] = body[key];
  }

  // When manually converting a quote to an order (not via customer public link),
  // auto-generate the ORD-YYYY-NNN reference code and flip ticket_kind to "order".
  const isManualConvertToOrder =
    body.ticket_status === "order" && existing.ticket_status !== "order";

  if (isManualConvertToOrder && roleName !== "admin") {
    return NextResponse.json(
      { error: "Only administrators can convert quotes to orders.", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  if (isManualConvertToOrder) {
    patch.ticket_kind = "order";
    if (!("reference_code" in body)) {
      try {
        patch.reference_code = await assignOrderReferenceCode(
          admin,
          (existing as { reference_code?: string | null }).reference_code ?? null,
        );
      } catch {
        // leave reference_code unchanged if sequence fails
      }
    }
  }

  const { data: updated, error: updateErr } = await admin
    .from("job_tickets")
    .update(patch)
    .eq("id", ticketId)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message, code: "DB_ERROR" }, { status: 500 });
  }

  // Auto-record cash payment if applicable (partial cash deposit or full cash in person).
  // Uses the merged final state of the ticket so edits that add a receipt ID trigger correctly.
  if (updated) {
    await maybeAutoRecordCashPayment(admin, updated, now, { byUserId: userId });

    const { data: releaseRow } = await admin
      .from("job_tickets")
      .select(AUTO_RELEASE_SELECT.replace(/\s+/g, " "))
      .eq("id", ticketId)
      .single();
    if (releaseRow) {
      await maybeAutoReleaseProduction(admin, releaseRow as unknown as import("@/lib/utils/maybe-auto-release-production").AutoReleaseTicket, now, {
        byUserId: userId,
        via: body.ticket_status === "sent" ? "quote_sent" : "ticket_update",
      });
    }
  }

  const { data: responseTicket } = await admin
    .from("job_tickets")
    .select()
    .eq("id", ticketId)
    .single();

  if (
    responseTicket?.ticket_status === "in_production" &&
    existing.ticket_status !== "in_production"
  ) {
    await markLinkedLeadWonOnProduction(admin, existing.linked_lead_id, now);
  }

  // Log activity for every meaningful action
  if ("ticket_status" in body) {
    const isResend = body.ticket_status === "sent" && existing.ticket_status === "sent";

    if (body.ticket_status === "sent") {
      // Log every send/resend — not just the first one.
      await admin.from("activities").insert({
        type: "ticket_sent",
        lead_id: existing.linked_lead_id ?? null,
        customer_id: existing.customer_id ?? null,
        ticket_id: ticketId,
        by_user_id: userId,
        payload: {
          channel: (body.quote_channel as string | undefined) ?? existing.quote_channel ?? "unknown",
          destination: (body.quote_destination as string | undefined) ?? existing.quote_destination ?? null,
          recipient: (body.contact_name as string | undefined) ?? existing.contact_name ?? existing.contact_email ?? null,
          resend: isResend,
        },
        created_at: now,
      });
    } else if (isManualConvertToOrder) {
      // Dedicated activity for manual conversion — distinct from customer confirmation
      await admin.from("activities").insert({
        type: "ticket_converted",
        lead_id: existing.linked_lead_id ?? null,
        customer_id: existing.customer_id ?? null,
        ticket_id: ticketId,
        by_user_id: userId,
        payload: {
          reference_code: patch.reference_code ?? null,
          require_client_confirm: existing.ticket_require_client_confirm ?? true,
          client_confirmed: !!existing.client_confirmed,
          converted_by_role: roleName,
          payment_received: Number(existing.payment_amount_received ?? existing.deposit_amount ?? 0) > 0.01
            || !!existing.deposit_paid_at
            || !!existing.payment_paid_at,
        },
        created_at: now,
      });
    } else if (body.ticket_status !== existing.ticket_status) {
      await admin.from("activities").insert({
        type: "order_ticket_status_changed",
        lead_id: existing.linked_lead_id ?? null,
        customer_id: existing.customer_id ?? null,
        ticket_id: ticketId,
        by_user_id: userId,
        payload: { from: existing.ticket_status, to: body.ticket_status },
        created_at: now,
      });
    }
  }

  // Trigger outreach when ticket status is "sent" — covers both first send and resend.
  // Fire-and-forget, never blocks the response.
  if (body.ticket_status === "sent") {
    try {
      const [{ data: fullTicket }, { data: companyRow }] = await Promise.all([
        admin
          .from("job_tickets")
          .select("*, customer:customers(first_name, last_name, email, phone)")
          .eq("id", ticketId)
          .single(),
        admin.from("company_settings").select("*").eq("id", 1).single(),
      ]);
      if (fullTicket && companyRow) {
        if (fullTicket.ticket_follow_up_enabled) {
          await initializeTicketFollowUpSchedule(admin, ticketId, fullTicket);
        }
        // Non-blocking: log the result but don't surface errors to the rep
        sendQuoteToCustomer(fullTicket, companyRow).then((result) => {
          if (!result.ok) {
            console.error("[send-quote] delivery failed:", result.error, { ticketId: ticketId, channel: result.channel });
          }
        });
      }
    } catch (err) {
      console.error("[send-quote] unexpected error:", err);
    }
  }

  // Notify customer when order is marked completed (ready for pickup).
  let notification: { ok: boolean; channel?: string; error?: string } | undefined;
  const markedCompleted =
    body.ticket_status === "completed" &&
    existing.ticket_status === "in_production" &&
    (responseTicket ?? updated)?.ticket_status === "completed";

  if (markedCompleted) {
    const total = Number((responseTicket ?? updated)?.quote_final_total ?? existing.quote_final_total ?? 0);
    const paid = Number((responseTicket ?? updated)?.payment_amount_received ?? existing.payment_amount_received ?? existing.deposit_amount ?? 0);
    const balanceDue = Math.max(0, Math.round((total - paid) * 100) / 100);
    const completedWithBalance = balanceDue > 0.01;

    if (completedWithBalance) {
      await admin.from("activities").insert({
        type:        "order_ticket_status_changed",
        lead_id:     existing.linked_lead_id ?? null,
        customer_id: existing.customer_id ?? null,
        ticket_id:   ticketId,
        by_user_id:  userId,
        payload:     {
          from: "in_production",
          to: "completed",
          via: "admin_complete_with_balance",
          balance_due: balanceDue,
          acknowledge_outstanding_balance: true,
        },
        created_at: new Date().toISOString(),
      });
    }

    try {
      const [{ data: fullTicket }, { data: companyRow }] = await Promise.all([
        admin
          .from("job_tickets")
          .select("*, customer:customers(first_name, last_name, email, phone)")
          .eq("id", ticketId)
          .single(),
        admin.from("company_settings").select("*").eq("id", 1).single(),
      ]);

      if (fullTicket?.public_token && fullTicket.reference_code && companyRow) {
        const refCode = fullTicket.reference_code ?? `ORD-${fullTicket.id.slice(0, 8).toUpperCase()}`;
        const { channel, destination } = resolveTicketOutreach(
          fullTicket as Parameters<typeof resolveTicketOutreach>[0],
        );
        const result = await sendOrderReadyToCustomer(
          { ...fullTicket, reference_code: refCode } as typeof fullTicket & { reference_code: string },
          companyRow,
        );
        notification = { ok: result.ok, channel: result.channel, error: result.error };

        await admin.from("activities").insert({
          type: result.ok ? "ticket_order_ready_sent" : "ticket_order_ready_failed",
          lead_id: existing.linked_lead_id ?? null,
          customer_id: existing.customer_id ?? null,
          ticket_id: ticketId,
          by_user_id: userId,
          payload: {
            channel: result.channel,
            destination,
            error: result.error ?? null,
          },
          created_at: now,
        });
      }
    } catch (err) {
      console.error("[send-order-ready] unexpected error:", err);
      notification = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return NextResponse.json({
    ticket: responseTicket ?? updated,
    ...(notification ? { notification } : {}),
  });
}
