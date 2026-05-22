import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeCheckout } from "@/lib/utils/compute-checkout";
import { assignOrderReferenceCode } from "@/lib/utils/reference-codes";
import type { PaymentConfig } from "@/lib/types";
import { randomUUID } from "crypto";

// POST /api/public/quotes/[token]/submit-payment
// No auth required — used by the public customer-facing quote page (/q/[token]).
//
// Accepts multipart/form-data:
//   method       : string   — wire | ach | zelle | check | card | cash
//   amount       : string   — payment amount (numeric)
//   file?        : File     — payment evidence (screenshot / PDF / photo ID)
//   receiptId?   : string   — for cash-in-person payments (no file required)
//
// Uploads the file to Supabase Storage (payment-evidence bucket),
// records the payment on job_tickets, then runs computeCheckout to determine
// if production can be auto-released (same logic as shadow app maybeAutoStartProduction).

type Params = { params: Promise<{ token: string }> };

// Channels that require evidence file upload from the customer
const EVIDENCE_REQUIRED_CHANNELS = new Set(["wire", "ach", "zelle", "check", "card"]);

export async function POST(request: NextRequest, { params }: Params) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  const admin = createAdminClient();

  // ── Resolve ticket ─────────────────────────────────────────────────────────
  const { data: ticket, error: fetchErr } = await admin
    .from("job_tickets")
    .select(`
      id, ticket_status, quote_final_total,
      client_confirmed, production_released_at,
      payment_amount_received, payment_paid_at,
      deposit_amount, deposit_paid_at, balance_paid_at,
      payment_evidence_url,
      ticket_payment_strategy, ticket_deposit_type, ticket_deposit_value,
      ticket_dep_handling, ticket_partial_channels, ticket_full_channels,
      ticket_require_client_confirm,
      linked_lead_id, customer_id, reference_code
    `)
    .eq("public_token", token)
    .single();

  if (fetchErr || !ticket) {
    return NextResponse.json({ error: "Quote not found." }, { status: 404 });
  }

  if (!["sent", "order", "in_production"].includes(ticket.ticket_status)) {
    return NextResponse.json({ error: "This quote is not open for payment." }, { status: 400 });
  }

  const alreadyPaidBefore = Number(ticket.payment_amount_received ?? 0);
  const isFollowUpPayment = alreadyPaidBefore > 0.01 || ticket.ticket_status === "in_production";

  if (ticket.payment_evidence_url && !isFollowUpPayment) {
    return NextResponse.json({ error: "Payment evidence already submitted." }, { status: 409 });
  }

  // ── Parse multipart form ───────────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const method    = String(formData.get("method") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const receiptId = String(formData.get("receiptId") ?? "").trim() || null;
  const file      = formData.get("file") as File | null;

  if (!method) {
    return NextResponse.json({ error: "Payment method is required." }, { status: 400 });
  }

  const amount = parseFloat(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "A valid payment amount is required." }, { status: 400 });
  }

  if (EVIDENCE_REQUIRED_CHANNELS.has(method) && !file) {
    return NextResponse.json({ error: "Payment evidence file is required for this payment method." }, { status: 400 });
  }

  // ── Upload file to Supabase Storage ───────────────────────────────────────
  let evidenceStoragePath: string | null = null;
  if (file) {
    const ext      = file.name.split(".").pop() ?? "bin";
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${ticket.id}/${randomUUID()}-${safeName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadErr } = await admin.storage
      .from("payment-evidence")
      .upload(storagePath, buffer, {
        contentType: file.type || `application/${ext}`,
        upsert: false,
      });

    if (uploadErr) {
      console.error("[submit-payment] storage upload failed:", uploadErr);
      return NextResponse.json({ error: "Failed to upload payment evidence. Please try again." }, { status: 500 });
    }

    evidenceStoragePath = storagePath;
  }

  const now = new Date().toISOString();

  // ── Build payment patch ────────────────────────────────────────────────────
  const quoteTotal  = Number(ticket.quote_final_total ?? 0);
  const alreadyPaid = Number(ticket.payment_amount_received ?? 0);
  const newTotal    = Math.min(alreadyPaid + amount, quoteTotal);
  const fullyPaid   = newTotal >= quoteTotal - 0.01;

  const needsAccountantReview = EVIDENCE_REQUIRED_CHANNELS.has(method);

  const patch: Record<string, unknown> = {
    updated_at:                   now,
    payment_method_used:          method,
    payment_evidence_submitted_at: now,
    client_confirmed:             true,
  };

  if (evidenceStoragePath) {
    patch.payment_evidence_url = evidenceStoragePath;
  }

  if (receiptId) {
    patch.ticket_receipt_id = receiptId;
  }

  // Wire / ACH / Zelle / check / card — customer uploads proof; accountant confirms
  // before we record payment totals or mark the ticket paid.
  if (needsAccountantReview) {
    patch.payment_evidence_amount = amount;
  } else {
    patch.payment_amount_received = newTotal;

    if (fullyPaid && !ticket.payment_paid_at) {
      patch.payment_paid_at = now;
      patch.payment_status  = "paid";
      patch.balance_paid_at = now;
    } else if (!fullyPaid && newTotal > alreadyPaid) {
      patch.payment_status = "partial";
    }
  }

  // Convert sent → order when customer submits payment
  if (ticket.ticket_status === "sent") {
    try {
      patch.reference_code = await assignOrderReferenceCode(
        admin,
        (ticket.reference_code as string | null) ?? null,
      );
    } catch {
      // proceed without ORD if sequence fails
    }
    patch.ticket_status = "order";
    patch.ticket_kind   = "order";
  }

  // ── Auto-production gate (mirrors maybeAutoStartProduction) ───────────────
  // Build a minimal PaymentConfig from the ticket's per-ticket columns so
  // computeCheckout can evaluate canReleaseProduction.
  const cfg = {
    paymentStrategy:     (ticket.ticket_payment_strategy as "full" | "partial" | "net") ?? "full",
    depositType:         (ticket.ticket_deposit_type as "percent" | "fixed") ?? "percent",
    depositValue:        ticket.ticket_deposit_value ?? 0,
    depHandling:         (ticket.ticket_dep_handling as "cash" | "gateway") ?? "gateway",
    paymentChannels:     ticket.ticket_full_channels ?? ticket.ticket_partial_channels ?? [],
    requireClientConfirm: ticket.ticket_require_client_confirm ?? true,
  } as PaymentConfig;

  // Simulate the ticket state after this patch to evaluate the gate
  const simulatedAmountReceived = needsAccountantReview ? alreadyPaid : newTotal;
  const simulatedPaidAt = needsAccountantReview
    ? (ticket.payment_paid_at ?? null)
    : (fullyPaid ? now : (ticket.payment_paid_at ?? null));
  const simulatedBalancePaidAt = needsAccountantReview
    ? (ticket.balance_paid_at ?? null)
    : (fullyPaid ? now : (ticket.balance_paid_at ?? null));

  const simulatedTicket = {
    quote_final_total:       quoteTotal,
    client_confirmed:        true,
    payment_amount_received: simulatedAmountReceived,
    payment_paid_at:         simulatedPaidAt,
    deposit_amount:          ticket.deposit_amount ?? null,
    deposit_paid_at:         ticket.deposit_paid_at ?? null,
    balance_paid_at:         simulatedBalancePaidAt,
    production_released_at:  null,
    ticket_payment_strategy: ticket.ticket_payment_strategy ?? null,
    ticket_deposit_type:     ticket.ticket_deposit_type ?? null,
    ticket_deposit_value:    ticket.ticket_deposit_value ?? null,
  };

  const checkout = computeCheckout(cfg, simulatedTicket);
  let autoReleased = false;

  // For channels that need accountant review (evidence uploaded), do NOT
  // auto-release — let the Accountant confirm first.
  // For cash / net / partial-cash-deposit channels, auto-release immediately.
  if (!needsAccountantReview && checkout.canReleaseProduction && ticket.ticket_status !== "in_production") {
    patch.production_released_at = now;
    patch.ticket_status          = "in_production";
    autoReleased = true;
  }

  // ── Persist ────────────────────────────────────────────────────────────────
  const { data: updated, error: updateErr } = await admin
    .from("job_tickets")
    .update(patch)
    .eq("id", ticket.id)
    .select()
    .single();

  if (updateErr) {
    console.error("[submit-payment] db update failed:", updateErr);
    return NextResponse.json({ error: "Failed to record payment. Please try again." }, { status: 500 });
  }

  const refCode = (updated?.reference_code as string | null) ?? (patch.reference_code as string | null) ?? ticket.reference_code ?? null;
  const wasSent = ticket.ticket_status === "sent";
  const newlyConfirmed = !ticket.client_confirmed;

  type ActivityInsert = {
    type: string;
    lead_id: string | null;
    customer_id: string | null;
    ticket_id: string;
    by_user_id: null;
    payload: Record<string, unknown>;
    created_at: string;
  };

  const activityRows: ActivityInsert[] = [];

  if (newlyConfirmed) {
    activityRows.push({
      type: "ticket_client_confirmed",
      lead_id: ticket.linked_lead_id ?? null,
      customer_id: ticket.customer_id ?? null,
      ticket_id: ticket.id,
      by_user_id: null,
      payload: { via: "public_payment", reference_code: refCode },
      created_at: now,
    });
  }

  if (wasSent) {
    activityRows.push({
      type: "order_ticket_status_changed",
      lead_id: ticket.linked_lead_id ?? null,
      customer_id: ticket.customer_id ?? null,
      ticket_id: ticket.id,
      by_user_id: null,
      payload: {
        from: "sent",
        to: autoReleased ? "in_production" : "order",
        via: "public_payment",
        reference_code: refCode,
      },
      created_at: now,
    });
  } else if (autoReleased) {
    activityRows.push({
      type: "order_ticket_status_changed",
      lead_id: ticket.linked_lead_id ?? null,
      customer_id: ticket.customer_id ?? null,
      ticket_id: ticket.id,
      by_user_id: null,
      payload: { from: "order", to: "in_production", via: "public_payment", auto: true },
      created_at: now,
    });
  }

  if (needsAccountantReview) {
    activityRows.push({
      type: "ticket_payment_evidence_submitted",
      lead_id: ticket.linked_lead_id ?? null,
      customer_id: ticket.customer_id ?? null,
      ticket_id: ticket.id,
      by_user_id: null,
      payload: {
        method,
        amount,
        has_file: !!evidenceStoragePath,
        receipt_id: receiptId,
        via: "public_payment",
      },
      created_at: now,
    });
  } else {
    activityRows.push({
      type: "ticket_payment_recorded",
      lead_id: ticket.linked_lead_id ?? null,
      customer_id: ticket.customer_id ?? null,
      ticket_id: ticket.id,
      by_user_id: null,
      payload: {
        mode: fullyPaid ? "full" : isFollowUpPayment ? "balance" : "deposit",
        method,
        amount,
        receipt_id: receiptId,
        new_total: newTotal,
        fully_paid: fullyPaid,
        via: "public_payment",
      },
      created_at: now,
    });
  }

  if (autoReleased) {
    activityRows.push({
      type: "ticket_production_released",
      lead_id: ticket.linked_lead_id ?? null,
      customer_id: ticket.customer_id ?? null,
      ticket_id: ticket.id,
      by_user_id: null,
      payload: { released_at: now, auto: true, via: "public_payment" },
      created_at: now,
    });
  }

  if (activityRows.length > 0) {
    await admin.from("activities").insert(activityRows);
  }

  // Mark linked lead Won when customer converts quote → order via payment
  if (wasSent && ticket.linked_lead_id) {
    await admin
      .from("leads")
      .update({ sales_status: "Won", updated_at: now })
      .eq("id", ticket.linked_lead_id);
  }

  return NextResponse.json({
    ok:           true,
    autoReleased,
    referenceCode: updated?.reference_code ?? null,
  });
}
