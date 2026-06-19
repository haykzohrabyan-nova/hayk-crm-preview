import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { requireTicketDetailPageAccess } from "@/lib/auth/require-page-access";
import {
  sendQuoteToCustomer,
  sendPaymentReminder,
  sendPaymentConfirmed,
  sendTaxExemptApproved,
  sendInvoiceLinkToCustomer,
  sendOrderReadyToCustomer,
  resolveTicketOutreach,
  type OutreachRevisionNotice,
  type TicketForSend,
} from "@/lib/integrations/send-quote";
import { sendQuoteSentStaffNotification } from "@/lib/integrations/send-quote-sent-notification";
import { initializeTicketFollowUpSchedule } from "@/lib/utils/initialize-ticket-follow-up";
import { logTicketPaymentRecorded } from "@/lib/utils/log-ticket-payment-recorded";
import { inferPaymentEvidenceMode } from "@/lib/utils/payment-evidence-type";
import { maybeAutoRecordCashPayment } from "@/lib/utils/maybe-auto-record-cash-payment";
import { maybeAutoReleaseProduction, AUTO_RELEASE_SELECT } from "@/lib/utils/maybe-auto-release-production";
import { maybeConvertQuoteToOrder } from "@/lib/utils/maybe-convert-quote-to-order";
import { markLinkedLeadWonOnProduction } from "@/lib/utils/mark-lead-won-on-production";
import { canAdminCancelTicket } from "@/lib/utils/can-admin-cancel-ticket";
import { cancelReasonCategoryForStatus, isOtherCancelReason } from "@/lib/utils/cancel-reason-category";
import {
  canMarkTicketCompleted,
  isTaxExemptApprovalPending,
  isTicketPaidInFull,
} from "@/lib/utils/invoice-payment-summary";
import {
  computeTotalsIfTaxExemptDenied,
  requiresTaxExemptAccountantReview,
  TAX_EXEMPT_APPROVAL_INVALIDATING_FIELDS,
} from "@/lib/utils/tax-exempt-approval";
import { syncCustomerTaxExemptFromApprovedTicket } from "@/lib/utils/customer-tax-exempt";
import {
  assignOrderReferenceCode,
  resolveTicketId,
  ticketKindForReference,
} from "@/lib/utils/reference-codes";
import { notifyPublicQuoteUpdatedByTicketId } from "@/lib/integrations/notify-public-quote-updated";
import { validateDueDateAgainstCreated } from "@/lib/utils/due-date";
import {
  fetchTicketShippingDestinations,
  resolveShippingFromRequest,
  syncTicketShippingDestinations,
} from "@/lib/utils/ticket-shipping-destinations";
import { fetchManualConvertMeta } from "@/lib/utils/manual-convert-meta";
import { sendOrderWebhook } from "@/lib/utils/send-order-webhook";
import { isPaymentStaffRole } from "@/lib/auth/role-checks";
import { canAccessTicket, canPatchTicket, canAccountantMutateTicket, canResendTicketNotifications } from "@/lib/utils/ticket-access";
import { isPaymentEvidencePending } from "@/lib/utils/payment-evidence-pending";
import { parseResubmitOutreachBody } from "@/lib/utils/parse-resubmit-outreach-body";
import {
  renderTaxExemptResubmitCustomerMessage,
  sendPaymentEvidenceResubmitRequested,
  sendTaxExemptResubmitRequested,
} from "@/lib/integrations/resubmit-requested-outreach";
import { generateResubmitOtp } from "@/lib/utils/public-resubmit-otp";
import { randomUUID } from "crypto";
import { fetchTicketPaymentRefunds } from "@/lib/payments/fetch-ticket-refunds";
import { resolveTicketCancelledAt } from "@/lib/utils/fetch-ticket-cancelled-at";
import {
  aggregateLineFlags,
  fetchTicketLinesBundle,
  parseLineItemsFromBody,
  syncTicketLines,
} from "@/lib/utils/ticket-line-items";
import { fetchTicketDetailPayload } from "@/lib/utils/fetch-ticket-detail";
type Params = { params: Promise<{ id: string }> };

function parseNotifyRevision(raw: unknown, roleName: string | null): OutreachRevisionNotice | undefined {
  if (raw === "admin" || raw === true) return "admin";
  if (raw === "standard") return roleName === "admin" ? "admin" : "standard";
  return undefined;
}

// ─── GET /api/tickets/[id] ────────────────────────────────────────────────────

export async function GET(_request: NextRequest, { params }: Params) {
  const { id: rawId } = await params;
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;
  const pageDeny = await requireTicketDetailPageAccess(userId, roleName);
  if (pageDeny) return pageDeny;

  const admin = createAdminClient();
  const detail = await fetchTicketDetailPayload(admin, rawId, userId!, roleName);

  if (!detail.ok) {
    const status = detail.code === "FORBIDDEN" ? 403 : 404;
    return NextResponse.json(
      { error: detail.code === "FORBIDDEN" ? "Forbidden." : "Ticket not found.", code: detail.code },
      { status },
    );
  }

  return NextResponse.json({ ticket: detail.ticket });
}

// ─── PATCH /api/tickets/[id] ──────────────────────────────────────────────────

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id: rawId } = await params;
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;
  const pageDeny = await requireTicketDetailPageAccess(userId, roleName);
  if (pageDeny) return pageDeny;

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
    .select("id, created_at, created_by_id, ticket_status, ticket_kind, routed_by_id, linked_lead_id, customer_id, public_token, quote_channel, quote_destination, contact_name, contact_email, client_confirmed, ticket_require_client_confirm, ticket_full_channels, ticket_partial_channels, ticket_dep_handling, payment_status, quote_subtotal, quote_final_total, quote_pre_tax_total, quote_tax_rate_percent, quote_tax_amount, discount_type, discount_value, payment_amount_received, payment_paid_at, deposit_amount, deposit_paid_at, payment_evidence_url, payment_evidence_submitted_at, payment_evidence_reviewed_at, payment_evidence_amount, stripe_payment_intent_id, ticket_payment_strategy, ticket_deposit_type, ticket_deposit_value, reference_code, production_released_at, balance_paid_at, requires_shipping, ship_to_line1, ship_to_line2, ship_to_city, ship_to_state, ship_to_zip, quote_shipping, tax_exempt, sales_permit_number, sales_permit_storage_path, sales_permit_file_name, sales_permit_mime_type, sales_permit_reviewed_at, sales_permit_reviewed_by_id")
    .eq("id", ticketId)
    .single();

  if (fetchErr || !existing) {
    return NextResponse.json({ error: "Ticket not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  // ── Payment reminder: send payment link via selected channel ───────────────
  if (body.send_payment_reminder === true) {
    if (!canResendTicketNotifications(existing, userId, roleName)) {
      return NextResponse.json(
        { error: "You can only send payment reminders for your own quotes and orders.", code: "FORBIDDEN" },
        { status: 403 },
      );
    }
    const now = new Date().toISOString();
    const reminderChannel     = (body.reminder_channel as string | undefined) ?? existing.quote_channel ?? "email";
    const reminderDestination = (body.reminder_destination as string | undefined) ?? existing.quote_destination ?? null;

    try {
      const [{ data: fullTicket }, { data: companyRow }] = await Promise.all([
        admin
          .from("job_tickets")
          .select("*, customer:customers!job_tickets_customer_id_fkey(first_name, last_name, email, phone)")
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
    if (!canResendTicketNotifications(existing, userId, roleName)) {
      return NextResponse.json(
        { error: "You can only resend invoices for your own quotes and orders.", code: "FORBIDDEN" },
        { status: 403 },
      );
    }
    const now = new Date().toISOString();

    const [{ data: fullTicket }, { data: companyRow }] = await Promise.all([
      admin
        .from("job_tickets")
        .select("*, customer:customers!job_tickets_customer_id_fkey(first_name, last_name, email, phone)")
        .eq("id", ticketId)
        .single(),
      admin.from("company_settings").select("*").eq("id", 1).single(),
    ]);

    if (!fullTicket?.public_token) {
      return NextResponse.json({ error: "This ticket has no public link.", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    const refCode = fullTicket.reference_code ?? `ORD-${fullTicket.id.slice(0, 8).toUpperCase()}`;
    const revisionNotice = parseNotifyRevision(body.notify_revision, roleName);
    const result = await sendInvoiceLinkToCustomer(
      { ...fullTicket, reference_code: refCode } as typeof fullTicket & { reference_code: string },
      companyRow ?? {},
      {
        channel: body.invoice_channel as string | undefined,
        destination: body.invoice_destination as string | undefined,
      },
      revisionNotice ? { revisionNotice } : undefined,
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
      .eq("ticket_status", "routed")
      .select()
      .maybeSingle();

    if (claimErr) {
      return NextResponse.json({ error: claimErr.message, code: "DB_ERROR" }, { status: 500 });
    }

    if (!claimed) {
      return NextResponse.json(
        { error: "This quote was already claimed or is no longer routed.", code: "ALREADY_CLAIMED" },
        { status: 409 },
      );
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

  // Normal update — read access + ownership / accountant payment lifecycle only.
  const accountantPrivileged =
    roleName === "accountant" && canAccountantMutateTicket(body, existing);

  if (!canAccessTicket(existing, userId, roleName) && !accountantPrivileged) {
    return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
  }

  if (!canPatchTicket(body, existing, userId, roleName)) {
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
  // TODO RBAC Slice 3: replace `roleName !== "admin" && roleName !== "sales"`
  //      with `!hasPermission(session, "quotes.edit")` once wired.
  if (existing.ticket_status === "order" && roleName !== "admin" && roleName !== "sales") {
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
    const taxPending = isTaxExemptApprovalPending(existing);
    const acknowledgeTax = body.acknowledge_tax_exempt_unapproved === true;

    if (roleName === "accountant") {
      if (!isTicketPaidInFull(existing)) {
        return NextResponse.json(
          { error: "Order must be paid in full before marking completed.", code: "VALIDATION_ERROR" },
          { status: 400 },
        );
      }
      if (!canMarkTicketCompleted(existing, { acknowledgeTaxExemptUnapproved: false })) {
        return NextResponse.json(
          {
            error: taxPending
              ? "Approve tax-exempt documentation before marking this order completed."
              : "Resolve pending payment review before marking completed.",
            code: taxPending ? "TAX_EXEMPT_APPROVAL_REQUIRED" : "PAYMENT_REVIEW_REQUIRED",
          },
          { status: 400 },
        );
      }
    } else if (taxPending && !acknowledgeTax) {
      return NextResponse.json(
        {
          error: "Tax-exempt documentation must be approved before marking completed, or confirm override.",
          code: "TAX_EXEMPT_APPROVAL_REQUIRED",
        },
        { status: 400 },
      );
    // TODO RBAC Slice 4: replace `(roleName === "admin" || roleName === "sales")`
    //      with `hasPermission(session, "orders.mark_complete")` once wired.
    } else if ((roleName === "admin" || roleName === "sales") && !isTicketPaidInFull(existing) && body.acknowledge_outstanding_balance !== true) {
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

  // ── approve_tax_exempt action ─────────────────────────────────────────────
  if (body.approve_tax_exempt === true) {
    if (!isPaymentStaffRole(roleName)) {
      return NextResponse.json(
        { error: "Only accountants can approve tax-exempt documentation.", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    if (!requiresTaxExemptAccountantReview(existing)) {
      return NextResponse.json(
        { error: "This ticket does not require tax-exempt approval.", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    const finalTotal = Number(body.quote_final_total);
    if (!Number.isFinite(finalTotal) || finalTotal <= 0) {
      return NextResponse.json(
        { error: "quote_final_total must be a positive number.", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const previousFinalTotal = Number(existing.quote_final_total ?? 0);

    const approvePatch: Record<string, unknown> = {
      updated_at: now,
      sales_permit_reviewed_at: now,
      sales_permit_reviewed_by_id: userId,
      quote_pre_tax_total: body.quote_pre_tax_total ?? existing.quote_pre_tax_total,
      quote_tax_rate_percent: body.quote_tax_rate_percent ?? existing.quote_tax_rate_percent,
      quote_tax_amount: body.quote_tax_amount ?? existing.quote_tax_amount,
      quote_final_total: finalTotal,
    };
    if ("quote_subtotal" in body) approvePatch.quote_subtotal = body.quote_subtotal;
    if ("quote_shipping" in body) approvePatch.quote_shipping = body.quote_shipping;
    if ("discount_type" in body) approvePatch.discount_type = body.discount_type;
    if ("discount_value" in body) approvePatch.discount_value = body.discount_value;

    const { data: approved, error: approveErr } = await admin
      .from("job_tickets")
      .update(approvePatch)
      .eq("id", ticketId)
      .select(
        `*, customer:customers!job_tickets_customer_id_fkey(first_name, last_name, email, phone)`,
      )
      .single();

    if (approveErr || !approved) {
      return NextResponse.json({ error: approveErr?.message ?? "Update failed.", code: "DB_ERROR" }, { status: 500 });
    }

    const { data: reviewerProfile } = await admin
      .from("user_profiles")
      .select("full_name")
      .eq("id", userId)
      .single();

    await admin.from("activities").insert({
      type: "ticket_tax_exempt_approved",
      lead_id: existing.linked_lead_id ?? null,
      customer_id: existing.customer_id ?? null,
      ticket_id: ticketId,
      by_user_id: userId,
      payload: {
        quote_final_total: finalTotal,
        previous_final_total: previousFinalTotal,
        reviewed_by_name: reviewerProfile?.full_name ?? null,
      },
      created_at: now,
    });

    if (existing.customer_id && approved.sales_permit_storage_path) {
      await syncCustomerTaxExemptFromApprovedTicket(admin, existing.customer_id, {
        id: ticketId,
        sales_permit_storage_path: approved.sales_permit_storage_path as string,
        sales_permit_file_name: approved.sales_permit_file_name as string | null,
        sales_permit_mime_type: approved.sales_permit_mime_type as string | null,
        sales_permit_number: approved.sales_permit_number as string | null,
        sales_permit_reviewed_at: now,
        sales_permit_reviewed_by_id: userId,
      });
    }

    if (approved.reference_code && approved.public_token) {
      const { data: companyRow } = await admin.from("company_settings").select("*").eq("id", 1).single();
      if (companyRow) {
        sendTaxExemptApproved(
          {
            reference_code: approved.reference_code as string,
            public_token: approved.public_token as string,
            quote_channel: approved.quote_channel as string | null,
            quote_destination: approved.quote_destination as string | null,
            customer: Array.isArray(approved.customer) ? approved.customer[0] : approved.customer,
          },
          companyRow,
          { previousFinalTotal, newFinalTotal: finalTotal },
        ).then((result) => {
          if (!result.ok) {
            console.error("[tax-exempt-approved] delivery failed:", result.error, { ticketId });
          }
        });

        await admin.from("activities").insert({
          type: "ticket_tax_exempt_confirmed_sent",
          lead_id: existing.linked_lead_id ?? null,
          customer_id: existing.customer_id ?? null,
          ticket_id: ticketId,
          by_user_id: userId,
          payload: {
            new_final_total: finalTotal,
            previous_final_total: previousFinalTotal,
          },
          created_at: now,
        });
      }
    }

    notifyPublicQuoteUpdatedByTicketId(admin, ticketId);

    return NextResponse.json({ ticket: approved });
  }

  // ── deny_tax_exempt action ────────────────────────────────────────────────
  if (body.deny_tax_exempt === true) {
    if (!isPaymentStaffRole(roleName)) {
      return NextResponse.json(
        { error: "Only accountants can deny tax-exempt documentation.", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    if (!requiresTaxExemptAccountantReview(existing)) {
      return NextResponse.json(
        { error: "This ticket does not require tax-exempt review.", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    const denialNotes =
      typeof body.sales_permit_denial_notes === "string" ? body.sales_permit_denial_notes.trim() : "";
    if (!denialNotes) {
      return NextResponse.json(
        { error: "An internal denial note is required.", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    const preTax = Number(existing.quote_pre_tax_total ?? 0);
    const taxRate = Number(existing.quote_tax_rate_percent ?? 0);
    const { tax_amount: taxAmount, final_total: finalTotal } = computeTotalsIfTaxExemptDenied(
      preTax,
      taxRate,
    );
    const previousFinalTotal = Number(existing.quote_final_total ?? 0);
    const now = new Date().toISOString();

    const { data: denied, error: denyErr } = await admin
      .from("job_tickets")
      .update({
        updated_at: now,
        tax_exempt: false,
        quote_tax_amount: taxAmount,
        quote_final_total: finalTotal,
        sales_permit_reviewed_at: now,
        sales_permit_reviewed_by_id: userId,
        sales_permit_denial_notes: denialNotes,
      })
      .eq("id", ticketId)
      .select()
      .single();

    if (denyErr || !denied) {
      return NextResponse.json({ error: denyErr?.message ?? "Update failed.", code: "DB_ERROR" }, { status: 500 });
    }

    const { data: reviewerProfile } = await admin
      .from("user_profiles")
      .select("full_name")
      .eq("id", userId)
      .single();

    await admin.from("activities").insert({
      type: "ticket_tax_exempt_denied",
      lead_id: existing.linked_lead_id ?? null,
      customer_id: existing.customer_id ?? null,
      ticket_id: ticketId,
      by_user_id: userId,
      payload: {
        quote_final_total: finalTotal,
        previous_final_total: previousFinalTotal,
        quote_tax_rate_percent: taxRate,
        reviewed_by_name: reviewerProfile?.full_name ?? null,
        denial_notes: denialNotes,
      },
      created_at: now,
    });

    notifyPublicQuoteUpdatedByTicketId(admin, ticketId);

    return NextResponse.json({ ticket: denied });
  }

  // ── request_payment_evidence_resubmit ─────────────────────────────────────
  if (body.request_payment_evidence_resubmit === true) {
    if (!isPaymentStaffRole(roleName)) {
      return NextResponse.json(
        { error: "Only accountants can request updated payment evidence.", code: "FORBIDDEN" },
        { status: 403 },
      );
    }
    if (!isPaymentEvidencePending(existing)) {
      return NextResponse.json(
        { error: "No pending payment evidence to resubmit.", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }
    const outreach = parseResubmitOutreachBody(body);
    if (!outreach) {
      return NextResponse.json(
        { error: "Valid outreach channel and destination are required.", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    const { code: otpCode, hash, expiresAt } = generateResubmitOtp("payment_evidence");
    const resubmitToken = randomUUID();
    const { data: companyRow } = await admin.from("company_settings").select("*").eq("id", 1).single();

    const now = new Date().toISOString();
    const { data: updated, error: updErr } = await admin
      .from("job_tickets")
      .update({
        updated_at: now,
        payment_evidence_resubmit_token: resubmitToken,
        payment_evidence_otp_hash: hash,
        payment_evidence_otp_expires_at: expiresAt,
        payment_evidence_resubmit_requested_at: now,
        payment_evidence_resubmit_requested_by_id: userId,
        payment_evidence_resubmit_reason: null,
        payment_evidence_resubmit_received_at: null,
      })
      .eq("id", ticketId)
      .select(
        `*, customer:customers!job_tickets_customer_id_fkey(first_name, last_name, email, phone)`,
      )
      .single();

    if (updErr || !updated) {
      return NextResponse.json({ error: updErr?.message ?? "Update failed.", code: "DB_ERROR" }, { status: 500 });
    }

    let outreachOk = true;
    let outreachError: string | null = null;
    if (companyRow && updated.reference_code) {
      const sendResult = await sendPaymentEvidenceResubmitRequested(
        admin,
        updated as typeof updated & { reference_code: string },
        companyRow,
        outreach,
        { evidenceToken: resubmitToken, otpCode },
      );
      outreachOk = sendResult.ok;
      outreachError = sendResult.error ?? null;
      if (!sendResult.ok) {
        console.error("[payment-evidence-resubmit] delivery failed:", sendResult.error, {
          ticketId,
          email: outreach.email,
          channel: outreach.channel,
        });
      }
    } else {
      outreachOk = false;
      outreachError = !companyRow
        ? "Company settings unavailable — email/SMS was not sent."
        : !updated.reference_code
          ? "Order reference missing — email/SMS was not sent."
          : "Email/SMS was not sent.";
    }

    await admin.from("activities").insert({
      type: "ticket_payment_evidence_resubmit_requested",
      lead_id: existing.linked_lead_id ?? null,
      customer_id: existing.customer_id ?? null,
      ticket_id: ticketId,
      by_user_id: userId,
      payload: {
        channel: outreach.channel,
        email: outreach.email || null,
        phone: outreach.phone || null,
        message_excerpt: existing.reference_code
          ? `Updated payment proof requested for ${existing.reference_code} (email/SMS).`
          : "Updated payment proof requested (email/SMS).",
      },
      created_at: now,
    });

    notifyPublicQuoteUpdatedByTicketId(admin, ticketId);
    return NextResponse.json({ ticket: updated, outreach_ok: outreachOk, outreach_error: outreachError });
  }

  // ── request_tax_exempt_resubmit ─────────────────────────────────────────
  if (body.request_tax_exempt_resubmit === true) {
    if (!isPaymentStaffRole(roleName)) {
      return NextResponse.json(
        { error: "Only accountants can request updated tax-exempt documentation.", code: "FORBIDDEN" },
        { status: 403 },
      );
    }
    if (!requiresTaxExemptAccountantReview(existing)) {
      return NextResponse.json(
        { error: "This ticket does not require tax-exempt resubmit.", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }
    const outreach = parseResubmitOutreachBody(body);
    if (!outreach) {
      return NextResponse.json(
        { error: "Valid outreach channel and destination are required.", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    const { code: otpCode, hash, expiresAt } = generateResubmitOtp();
    const resubmitToken = randomUUID();
    const { data: companyRow } = await admin.from("company_settings").select("*").eq("id", 1).single();
    let customerMessage = "We need an updated tax-exempt permit for this order.";
    if (companyRow && existing.reference_code) {
      customerMessage = await renderTaxExemptResubmitCustomerMessage(
        admin,
        existing as unknown as TicketForSend & { reference_code: string },
        companyRow,
        resubmitToken,
        otpCode,
      );
    }

    const now = new Date().toISOString();

    const { data: updated, error: updErr } = await admin
      .from("job_tickets")
      .update({
        updated_at: now,
        sales_permit_resubmit_token: resubmitToken,
        sales_permit_otp_hash: hash,
        sales_permit_otp_expires_at: expiresAt,
        sales_permit_resubmit_requested_at: now,
        sales_permit_resubmit_requested_by_id: userId,
        sales_permit_resubmit_reason: customerMessage,
        sales_permit_resubmit_received_at: null,
      })
      .eq("id", ticketId)
      .select(
        `*, customer:customers!job_tickets_customer_id_fkey(first_name, last_name, email, phone)`,
      )
      .single();

    if (updErr || !updated) {
      return NextResponse.json({ error: updErr?.message ?? "Update failed.", code: "DB_ERROR" }, { status: 500 });
    }

    let outreachOk = true;
    let outreachError: string | null = null;
    if (companyRow && updated.reference_code) {
      const sendResult = await sendTaxExemptResubmitRequested(
        admin,
        updated as typeof updated & { reference_code: string },
        companyRow,
        outreach,
        { permitToken: resubmitToken, otpCode },
      );
      outreachOk = sendResult.ok;
      outreachError = sendResult.error ?? null;
      if (!sendResult.ok) {
        console.error("[tax-exempt-resubmit] delivery failed:", sendResult.error, {
          ticketId,
          email: outreach.email,
          channel: outreach.channel,
        });
      }
    } else {
      outreachOk = false;
      outreachError = !companyRow
        ? "Company settings unavailable — email/SMS was not sent."
        : !updated.reference_code
          ? "Order reference missing — email/SMS was not sent."
          : "Email/SMS was not sent.";
    }

    await admin.from("activities").insert({
      type: "ticket_tax_exempt_resubmit_requested",
      lead_id: existing.linked_lead_id ?? null,
      customer_id: existing.customer_id ?? null,
      ticket_id: ticketId,
      by_user_id: userId,
      payload: {
        channel: outreach.channel,
        email: outreach.email || null,
        phone: outreach.phone || null,
        message_excerpt: customerMessage.slice(0, 200),
      },
      created_at: now,
    });

    notifyPublicQuoteUpdatedByTicketId(admin, ticketId);
    return NextResponse.json({ ticket: updated, outreach_ok: outreachOk, outreach_error: outreachError });
  }

  // ── record_payment action ────────────────────────────────────────────────
  // Body: { record_payment: true, payment_mode: "deposit"|"balance"|"full",
  //         payment_method: string, payment_amount: number, receipt_id?: string }
  if (body.record_payment === true) {
    if (!isPaymentStaffRole(roleName)) {
      return NextResponse.json(
        { error: "Only accountants can confirm submitted payments.", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    const modeFromClient = body.payment_mode as "deposit" | "balance" | "full" | undefined;
    const method = body.payment_method as string | undefined;
    const amount = Number(body.payment_amount);

    if (!modeFromClient || !method || !Number.isFinite(amount) || amount <= 0) {
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
               payment_evidence_url, payment_evidence_submitted_at, payment_evidence_reviewed_at,
               payment_evidence_amount, stripe_payment_intent_id,
               tax_exempt, sales_permit_storage_path, sales_permit_reviewed_at,
               public_token, reference_code, quote_channel, quote_destination, title,
               ticket_payment_strategy, ticket_deposit_type, ticket_deposit_value,
               ticket_dep_handling, ticket_full_channels, ticket_partial_channels,
               ticket_require_client_confirm, linked_lead_id, customer_id,
               customer:customers!job_tickets_customer_id_fkey(first_name, last_name, email, phone)`)
      .eq("id", ticketId)
      .single();

    if (cur && isTaxExemptApprovalPending(cur)) {
      return NextResponse.json(
        {
          error: "Approve tax-exempt documentation before confirming payment.",
          code: "TAX_EXEMPT_APPROVAL_REQUIRED",
        },
        { status: 400 },
      );
    }

    // Prefer server-side inference from ticket config — list APIs may omit deposit fields.
    const mode = inferPaymentEvidenceMode({
      quote_final_total: cur?.quote_final_total,
      ticket_payment_strategy: cur?.ticket_payment_strategy,
      ticket_deposit_type: cur?.ticket_deposit_type,
      ticket_deposit_value: cur?.ticket_deposit_value,
      payment_amount_received: Number(cur?.payment_amount_received ?? 0),
      deposit_paid_at: cur?.deposit_paid_at,
      payment_evidence_amount: cur?.payment_evidence_amount ?? amount,
    });

    // Atomic payment: SELECT FOR UPDATE inside the RPC serialises concurrent calls
    // (e.g. accountant confirm + Stripe webhook) so each sees the other's committed
    // total before adding its own amount — no payment can be silently overwritten.
    type AtomicPayResult = {
      payment_amount_received: number;
      quote_final_total: number | null;
      ticket_status: string;
      deposit_paid_at: string | null;
      balance_paid_at: string | null;
      payment_paid_at: string | null;
      payment_status: string;
    };
    const { data: payRaw, error: payErr } = await admin
      .rpc("record_ticket_payment_atomic", {
        p_ticket_id:  ticketId,
        p_amount:     amount,
        p_mode:       mode,
        p_method:     method,
        p_now:        now,
        p_receipt_id: receiptId,
      })
      .maybeSingle();

    if (payErr) {
      return NextResponse.json({ error: payErr.message, code: "DB_ERROR" }, { status: 500 });
    }
    if (!payRaw) {
      return NextResponse.json({ error: "Ticket not found.", code: "NOT_FOUND" }, { status: 404 });
    }

    const payUpdated = payRaw as unknown as AtomicPayResult;
    const newTotal  = Number(payUpdated.payment_amount_received);
    const quoteTotal = Number(payUpdated.quote_final_total ?? 0);
    const fullyPaid  = newTotal >= quoteTotal - 0.01;

    const hadPendingEvidence =
      !!cur?.payment_evidence_submitted_at &&
      !!(cur?.payment_evidence_url || cur?.stripe_payment_intent_id);

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

    notifyPublicQuoteUpdatedByTicketId(admin, ticketId);

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

    notifyPublicQuoteUpdatedByTicketId(admin, ticketId);

    return NextResponse.json({ ticket: released });
  }

  if ("line_items" in body) {
    const lineItems = parseLineItemsFromBody(body.line_items);
    const syncResult = await syncTicketLines(admin, ticketId, lineItems);
    if (!syncResult.ok) {
      return NextResponse.json({ error: syncResult.error, code: "VALIDATION_ERROR" }, { status: 400 });
    }
    const lineFlags = aggregateLineFlags(lineItems);
    body.design_required = lineFlags.design_required;
    body.die_cut = lineFlags.die_cut;
  }

  // ── Collect cash on mark-complete ────────────────────────────────────────
  // When staff check "Collect cash now" in the mark-complete modal, the body
  // carries collect_cash: { amount, receipt_id }. Record the payment first so
  // that isTicketPaidInFull() reflects the new state for the completion log.
  if (
    body.ticket_status === "completed" &&
    body.collect_cash &&
    typeof body.collect_cash === "object"
  ) {
    const cc = body.collect_cash as { amount?: unknown; receipt_id?: unknown };
    const ccAmount = Number(cc.amount);
    const ccReceiptId = String(cc.receipt_id ?? "").trim();
    if (!Number.isFinite(ccAmount) || ccAmount <= 0 || !ccReceiptId) {
      return NextResponse.json(
        { error: "collect_cash requires a positive amount and a receipt ID.", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }
    const ccNow = new Date().toISOString();
    const { data: ccPay, error: ccErr } = await admin
      .rpc("record_ticket_payment_atomic", {
        p_ticket_id:  ticketId,
        p_amount:     ccAmount,
        p_mode:       "balance",
        p_method:     "cash",
        p_now:        ccNow,
        p_receipt_id: ccReceiptId,
      })
      .maybeSingle();
    if (ccErr) {
      return NextResponse.json({ error: ccErr.message, code: "DB_ERROR" }, { status: 500 });
    }

    // Log the balance collection so it appears in the order's activity history
    const ccResult = ccPay as { payment_amount_received?: number; quote_final_total?: number } | null;
    const ccNewTotal  = Number(ccResult?.payment_amount_received ?? 0);
    const ccQuoteTotal = Number(ccResult?.quote_final_total ?? existing.quote_final_total ?? 0);
    await logTicketPaymentRecorded(admin, {
      ticketId,
      leadId:     existing.linked_lead_id ?? null,
      customerId: existing.customer_id    ?? null,
      byUserId:   userId,
      mode:       "balance",
      method:     "cash",
      amount:     ccAmount,
      receiptId:  ccReceiptId,
      newTotal:   ccNewTotal,
      fullyPaid:  ccNewTotal >= ccQuoteTotal - 0.01,
      via:        "staff_cash_collect_on_complete",
      createdAt:  ccNow,
    });
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
    "requires_shipping",
    "ship_to_line1",
    "ship_to_line2",
    "ship_to_city",
    "ship_to_state",
    "ship_to_zip",
    "discount_type",
    "discount_value",
    "discount_reason",
    "quote_pre_tax_total",
    "quote_tax_rate_percent",
    "quote_tax_amount",
    "quote_final_total",
    "tax_exempt",
    "sales_permit_number",
    "sales_permit_storage_path",
    "sales_permit_file_name",
    "sales_permit_mime_type",
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
    // Cancellation audit (migration 088) — label set server-side on cancel
    "cancel_reason",
    "cancel_notes",
  ];

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updated_at: now };
  for (const key of ALLOWED_FIELDS) {
    if (key in body) patch[key] = body[key];
  }

  const shippingFieldsTouched =
    "requires_shipping" in body ||
    "ship_to_line1" in body ||
    "ship_to_line2" in body ||
    "ship_to_city" in body ||
    "ship_to_state" in body ||
    "ship_to_zip" in body ||
    "quote_shipping" in body ||
    "shipping_destinations" in body;

  let shippingDestinationsToSync: ReturnType<typeof resolveShippingFromRequest>["destinations"] | null = null;

  if (shippingFieldsTouched) {
    const shippingResolved = resolveShippingFromRequest({
      requires_shipping: "requires_shipping" in body ? body.requires_shipping : existing.requires_shipping,
      quote_shipping: "quote_shipping" in body ? body.quote_shipping : existing.quote_shipping,
      ship_to_line1: "ship_to_line1" in body ? body.ship_to_line1 : existing.ship_to_line1,
      ship_to_line2: "ship_to_line2" in body ? body.ship_to_line2 : existing.ship_to_line2,
      ship_to_city: "ship_to_city" in body ? body.ship_to_city : existing.ship_to_city,
      ship_to_state: "ship_to_state" in body ? body.ship_to_state : existing.ship_to_state,
      ship_to_zip: "ship_to_zip" in body ? body.ship_to_zip : existing.ship_to_zip,
      shipping_destinations: body.shipping_destinations,
    });
    if (shippingResolved.zipError) {
      return NextResponse.json({ error: shippingResolved.zipError, code: "VALIDATION_ERROR" }, { status: 400 });
    }
    Object.assign(patch, shippingResolved.legacy);
    shippingDestinationsToSync = shippingResolved.destinations;
  }

  if ("due_date" in body && body.due_date) {
    const dueErr = validateDueDateAgainstCreated(String(body.due_date), existing.created_at);
    if (dueErr) {
      return NextResponse.json({ error: dueErr, code: "VALIDATION_ERROR" }, { status: 400 });
    }
  }

  if (
    body.ticket_status === "cancelled" &&
    existing.ticket_status !== "cancelled"
  ) {
    // TODO RBAC Slice 3/4: replace `!isPaymentStaffRole(roleName) && roleName !== "sales"`
    //      with `!hasPermission(session, "quotes.cancel")` (quote stage) or
    //      `!hasPermission(session, "orders.cancel")` (order stage) once wired.
    if (!isPaymentStaffRole(roleName) && roleName !== "sales") {
      return NextResponse.json(
        { error: "Only administrators, accountants, and sales users can cancel quotes and orders.", code: "FORBIDDEN" },
        { status: 403 },
      );
    }
    if (!canAdminCancelTicket(existing)) {
      return NextResponse.json(
        { error: "This ticket is already cancelled.", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    const reasonCategory = cancelReasonCategoryForStatus(existing.ticket_status);
    const cancelReason = typeof body.cancel_reason === "string" ? body.cancel_reason.trim() : "";
    if (!cancelReason) {
      return NextResponse.json(
        { error: "Cancellation reason is required.", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    const { data: reasonRow, error: reasonErr } = await admin
      .from("lookup_values")
      .select("label")
      .eq("category", reasonCategory)
      .eq("value", cancelReason)
      .eq("is_active", true)
      .maybeSingle();

    if (reasonErr || !reasonRow) {
      return NextResponse.json(
        { error: "Invalid or inactive cancellation reason.", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    patch.cancel_reason = cancelReason;
    patch.cancel_reason_label = reasonRow.label;

    const notesRaw = typeof body.cancel_notes === "string" ? body.cancel_notes.trim() : "";
    if (isOtherCancelReason(cancelReason) && !notesRaw) {
      return NextResponse.json(
        { error: "Please specify a reason when selecting Other.", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }
    patch.cancel_notes = notesRaw || null;
    patch.cancelled_at = now;
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

  const mergedRef =
    typeof patch.reference_code === "string"
      ? patch.reference_code
      : (existing as { reference_code?: string | null }).reference_code ?? null;
  const mergedKind =
    typeof patch.ticket_kind === "string"
      ? patch.ticket_kind
      : (existing as { ticket_kind?: string | null }).ticket_kind ?? null;
  const syncedKind = ticketKindForReference(mergedRef, mergedKind);
  if (syncedKind) patch.ticket_kind = syncedKind;

  if (
    !body.approve_tax_exempt &&
    !body.deny_tax_exempt &&
    (existing as { sales_permit_reviewed_at?: string | null }).sales_permit_reviewed_at
  ) {
    const invalidates = TAX_EXEMPT_APPROVAL_INVALIDATING_FIELDS.some((key) => {
      if (!(key in body)) return false;
      const next = body[key];
      const prev = (existing as Record<string, unknown>)[key];
      return String(next ?? "") !== String(prev ?? "");
    });
    if (invalidates) {
      patch.sales_permit_reviewed_at = null;
      patch.sales_permit_reviewed_by_id = null;
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

  // Sync changed contact fields back to the customer record (only fields that actually differ).
  const contactFieldsInBody =
    "contact_name" in body ||
    "contact_email" in body ||
    "contact_company" in body ||
    "contact_phone" in body ||
    "industry" in body ||
    "website" in body;

  if (contactFieldsInBody && existing.customer_id) {
    const { data: existingCustomer } = await admin
      .from("customers")
      .select("first_name, last_name, company, phone, email, industry, website")
      .eq("id", existing.customer_id)
      .single();

    if (existingCustomer) {
      const { digitsOnly: dOnly } = await import("@/lib/utils/phone").catch(() => ({ digitsOnly: (s: string) => s }));
      const rawName = (body.contact_name as string | undefined) ?? "";
      const nameParts = rawName.trim().split(" ");
      const incomingFirst = nameParts[0] ?? null;
      const incomingLast = nameParts.slice(1).join(" ") || null;
      const incomingPhone = body.contact_phone ? dOnly(String(body.contact_phone)) : null;
      const incomingEmail = body.contact_email ? String(body.contact_email).trim() : null;
      const incomingCompany = body.contact_company ? String(body.contact_company).trim() : null;
      const incomingIndustry = body.industry ? String(body.industry).trim() : null;
      const incomingWebsite = body.website ? String(body.website).trim() : null;

      const customerPatch: Record<string, unknown> = {};
      if (incomingFirst && incomingFirst !== existingCustomer.first_name) customerPatch.first_name = incomingFirst;
      if (incomingLast && incomingLast !== existingCustomer.last_name) customerPatch.last_name = incomingLast;
      if (incomingCompany && incomingCompany !== (existingCustomer.company ?? "")) customerPatch.company = incomingCompany;
      if (incomingEmail && incomingEmail !== (existingCustomer.email ?? "")) customerPatch.email = incomingEmail;
      if (incomingPhone && incomingPhone !== (existingCustomer.phone ?? "")) customerPatch.phone = incomingPhone;
      if (incomingIndustry && incomingIndustry !== (existingCustomer.industry ?? "")) customerPatch.industry = incomingIndustry;
      if (incomingWebsite && incomingWebsite !== (existingCustomer.website ?? "")) customerPatch.website = incomingWebsite;

      if (Object.keys(customerPatch).length > 0) {
        customerPatch.updated_at = now;
        await admin.from("customers").update(customerPatch).eq("id", existing.customer_id);
      }
    }
  }

  if (shippingDestinationsToSync != null) {
    try {
      await syncTicketShippingDestinations(
        admin,
        ticketId,
        Boolean(patch.requires_shipping ?? existing.requires_shipping),
        shippingDestinationsToSync,
      );
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to save shipping destinations.", code: "DB_ERROR" },
        { status: 500 },
      );
    }
  }

  // Auto-record cash payment if applicable (partial cash deposit or full cash in person).
  // Uses the merged final state of the ticket so edits that add a receipt ID trigger correctly.
  if (updated) {
    await maybeAutoRecordCashPayment(admin, updated, now, { byUserId: userId });

    // ── Payment config recalculation ──────────────────────────────────────────
    // When the user edits ticket_payment_strategy, ticket_deposit_type, or
    // ticket_deposit_value on a ticket that ALREADY had a deposit recorded before
    // this save, recalculate the deposit amount and payment totals to match the new
    // settings. This corrects cases where the wrong strategy was saved initially
    // (e.g. "full" instead of "partial 31%"), causing an incorrect deposit amount
    // to be auto-recorded.
    const paymentConfigChanged = existing.deposit_paid_at && (
      ("ticket_payment_strategy" in body && body.ticket_payment_strategy !== existing.ticket_payment_strategy) ||
      ("ticket_deposit_type"     in body && body.ticket_deposit_type     !== existing.ticket_deposit_type) ||
      ("ticket_deposit_value"    in body && Number(body.ticket_deposit_value) !== Number(existing.ticket_deposit_value))
    );

    if (paymentConfigChanged) {
      const newStrategy  = (patch.ticket_payment_strategy ?? existing.ticket_payment_strategy) as string;
      const newDepType   = (patch.ticket_deposit_type    ?? existing.ticket_deposit_type   ?? "percent") as "percent" | "fixed";
      const newDepValue  = Number(patch.ticket_deposit_value ?? existing.ticket_deposit_value ?? 0);
      const total        = Number(patch.quote_final_total  ?? existing.quote_final_total  ?? 0);
      const currentDepositAmt = Number(existing.deposit_amount ?? 0);
      const currentAmountReceived = Number(existing.payment_amount_received ?? existing.deposit_amount ?? 0);

      let newDepositAmt: number;
      const recalcPatch: Record<string, unknown> = { updated_at: now };

      if (newStrategy === "partial" && total > 0) {
        newDepositAmt = newDepType === "percent"
          ? Math.round(total * (newDepValue / 100) * 100) / 100
          : Math.min(newDepValue, total);

        if (Math.abs(newDepositAmt - currentDepositAmt) > 0.01) {
          recalcPatch.deposit_amount         = newDepositAmt;
          recalcPatch.payment_amount_received = newDepositAmt;
          recalcPatch.payment_status         = "partial";
          // Clear full-payment markers — balance is now outstanding
          recalcPatch.balance_paid_at  = null;
          recalcPatch.payment_paid_at  = null;
          recalcPatch.payment_method_used = null;

          await admin.from("job_tickets").update(recalcPatch).eq("id", ticketId);

          await admin.from("activities").insert({
            type:        "ticket_payment_recalculated",
            lead_id:     existing.linked_lead_id ?? null,
            customer_id: existing.customer_id    ?? null,
            ticket_id:   ticketId,
            by_user_id:  userId,
            payload: {
              reason:               "payment_config_changed",
              previous_deposit_amt: currentDepositAmt,
              new_deposit_amt:      newDepositAmt,
              new_strategy:         newStrategy,
              new_dep_type:         newDepType,
              new_dep_value:        newDepValue,
            },
            created_at: now,
          });
        }
      } else if (newStrategy === "full" && total > 0) {
        // Changing to full — full amount now due immediately; if deposit < total, leave
        // payment_status as-is (partial) until the full payment is actually collected.
        // Only update deposit_amount to reflect total if it was auto-recorded correctly.
        newDepositAmt = total;
        if (Math.abs(newDepositAmt - currentDepositAmt) > 0.01) {
          recalcPatch.deposit_amount          = newDepositAmt;
          recalcPatch.payment_amount_received = newDepositAmt;
          recalcPatch.payment_status          = "paid";
          recalcPatch.balance_paid_at         = now;
          recalcPatch.payment_paid_at         = now;
          await admin.from("job_tickets").update(recalcPatch).eq("id", ticketId);
        }
      } else if (newStrategy === "net") {
        // Changing to net terms (0 upfront) — no upfront deposit required.
        // Always clear deposit-related fields. Only keep payment_amount_received
        // if a full balance payment was already recorded (payment_paid_at set);
        // a deposit-only payment was for the partial strategy and should be wiped.
        const hadFullPayment = !!existing.payment_paid_at;
        recalcPatch.deposit_amount     = null;
        recalcPatch.deposit_paid_at    = null;
        recalcPatch.deposit_method     = null;
        recalcPatch.deposit_receipt_id = null;
        recalcPatch.balance_paid_at    = null;
        recalcPatch.payment_paid_at    = null;
        recalcPatch.payment_method_used = null;
        if (!hadFullPayment) {
          // Deposit-only → wipe the received amount so the order shows $0 received
          recalcPatch.payment_amount_received = null;
          recalcPatch.payment_status = "unpaid";
        } else {
          // Full balance was already paid → preserve the amount, mark as paid
          recalcPatch.payment_status = currentAmountReceived >= total - 0.01 ? "paid" : "partial";
        }

        await admin.from("job_tickets").update(recalcPatch).eq("id", ticketId);

        await admin.from("activities").insert({
          type:        "ticket_payment_recalculated",
          lead_id:     existing.linked_lead_id ?? null,
          customer_id: existing.customer_id    ?? null,
          ticket_id:   ticketId,
          by_user_id:  userId,
          payload: {
            reason:               "payment_config_changed_to_net",
            previous_deposit_amt: currentDepositAmt,
            cleared_deposit:      !hadFullPayment,
            new_strategy:         newStrategy,
          },
          created_at: now,
        });
      }
    }

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

      // Fire webhook for every convert-to-order path — regardless of who triggered it.
      const webhookRef = typeof patch.reference_code === "string"
        ? patch.reference_code
        : typeof (existing as { reference_code?: unknown }).reference_code === "string"
          ? (existing as { reference_code: string }).reference_code
          : null;
      sendOrderWebhook(admin, ticketId, webhookRef, "manual_convert", now).catch((err: unknown) => {
        console.error("[order-webhook] manual-convert fire failed:", err);
      });
    } else if (body.ticket_status === "cancelled" && existing.ticket_status !== "cancelled") {
      await admin.from("activities").insert({
        type: "ticket_cancelled",
        lead_id: existing.linked_lead_id ?? null,
        customer_id: existing.customer_id ?? null,
        ticket_id: ticketId,
        by_user_id: userId,
        payload: {
          from: existing.ticket_status,
          reason: patch.cancel_reason ?? body.cancel_reason ?? null,
          reason_label: patch.cancel_reason_label ?? null,
          notes: patch.cancel_notes ?? null,
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
          .select("*, customer:customers!job_tickets_customer_id_fkey(first_name, last_name, email, phone)")
          .eq("id", ticketId)
          .single(),
        admin.from("company_settings").select("*").eq("id", 1).single(),
      ]);
      if (fullTicket && companyRow) {
        if (fullTicket.ticket_follow_up_enabled) {
          await initializeTicketFollowUpSchedule(admin, ticketId, fullTicket);
        }
        // Non-blocking: log the result but don't surface errors to the rep
        // Skip delivery when channel is "none" — public page stays active, no SMS/email sent.
        const suppressNotification = (fullTicket.ticket_quote_channel as string | null) === "none";
        if (!suppressNotification) {
          const revisionNotice = parseNotifyRevision(body.notify_revision, roleName);
          sendQuoteToCustomer(fullTicket, companyRow, revisionNotice ? { revisionNotice } : undefined).then((result) => {
            if (!result.ok) {
              console.error("[send-quote] delivery failed:", result.error, { ticketId: ticketId, channel: result.channel });
            }
          });
        }

        // Internal notification — email the quote creator when their quote is delivered.
        const creatorId = fullTicket.created_by_id as string | null;
        if (creatorId) {
          Promise.all([
            admin.from("user_profiles").select("full_name").eq("user_id", creatorId).single(),
            admin.auth.admin.getUserById(creatorId),
          ]).then(([profileResult, authResult]) => {
            const staffEmail   = authResult.data.user?.email;
            const staffName    = (profileResult.data?.full_name as string | null) ?? "";
            const clientName   =
              fullTicket.customer?.first_name || fullTicket.customer?.last_name
                ? [fullTicket.customer?.first_name, fullTicket.customer?.last_name].filter(Boolean).join(" ")
                : (fullTicket.contact_name as string | null) ?? "Valued Customer";
            const ref = (fullTicket.reference_code as string | null) ?? ticketId.slice(0, 8);
            if (staffEmail) {
              sendQuoteSentStaffNotification({
                admin,
                staffEmail,
                staffFullName: staffName,
                clientName,
                ref,
                ticketId,
                companyName: (companyRow.company_name as string | null) ?? "BazaarPrinting",
              });
            }
          }).catch((err: unknown) => {
            console.error("[quote-sent-notification] profile lookup error:", err);
          });
        }
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
          .select("*, customer:customers!job_tickets_customer_id_fkey(first_name, last_name, email, phone)")
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

  const line_items = await fetchTicketLinesBundle(admin, ticketId);
  const shipping_destinations = await fetchTicketShippingDestinations(admin, ticketId);

  notifyPublicQuoteUpdatedByTicketId(admin, ticketId);

  return NextResponse.json({
    ticket: { ...(responseTicket ?? updated), line_items, shipping_destinations },
    ...(notification ? { notification } : {}),
  });
}
