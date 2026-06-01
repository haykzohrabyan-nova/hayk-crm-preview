import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { isPaymentStaffRole } from "@/lib/auth/role-checks";
import { resolveTicketId } from "@/lib/utils/reference-codes";
import { canAccessTicket } from "@/lib/utils/ticket-access";
import { applyTicketRefund } from "@/lib/payments/apply-ticket-refund";
import { processStripeRefund } from "@/lib/stripe/process-refund";
import {
  listRefundablePaymentSlots,
  type RefundableSlotTicket,
} from "@/lib/payments/refundable-payment-slots";
import { fetchTicketRefunds } from "@/lib/payments/apply-ticket-refund";
import { isStripeConfigured } from "@/lib/stripe/client";
import { notifyPublicQuoteUpdatedByTicketId } from "@/lib/integrations/notify-public-quote-updated";
import type { PaymentEvidenceMode } from "@/lib/utils/payment-evidence-type";

type Params = { params: Promise<{ id: string }> };

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const PAYMENT_MODES = new Set(["deposit", "balance", "full"]);

async function parseBody(request: NextRequest): Promise<Record<string, string | File | null>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const out: Record<string, string | File | null> = {};
    for (const [key, value] of form.entries()) {
      if (value instanceof File) {
        out[key] = value.size > 0 ? value : null;
      } else {
        out[key] = String(value);
      }
    }
    return out;
  }
  const json = await request.json().catch(() => null);
  if (!json || typeof json !== "object") return {};
  const out: Record<string, string | File | null> = {};
  for (const [key, value] of Object.entries(json)) {
    if (value == null) out[key] = null;
    else out[key] = String(value);
  }
  return out;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  if (!isPaymentStaffRole(roleName)) {
    return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
  }

  const { id: rawId } = await params;
  const admin = createAdminClient();
  const ticketId = await resolveTicketId(admin, rawId);
  if (!ticketId) {
    return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
  }

  const body = await parseBody(request);
  const paymentModeRaw = String(body.payment_mode ?? "").trim();
  if (!PAYMENT_MODES.has(paymentModeRaw)) {
    return NextResponse.json({ error: "payment_mode must be deposit, balance, or full." }, { status: 400 });
  }
  const paymentMode = paymentModeRaw as PaymentEvidenceMode;

  const refundReason = String(body.refund_reason ?? "").trim();
  const refundNotes = String(body.refund_notes ?? "").trim() || null;
  const amountMode = body.amount_mode === "partial" ? "partial" : "full";

  if (!refundReason) {
    return NextResponse.json({ error: "Refund reason is required." }, { status: 400 });
  }

  const { data: reasonRow } = await admin
    .from("lookup_values")
    .select("id")
    .eq("category", "payment_refund_reason")
    .eq("value", refundReason)
    .eq("is_active", true)
    .maybeSingle();

  if (!reasonRow) {
    return NextResponse.json({ error: "Invalid refund reason." }, { status: 400 });
  }

  const { data: ticket } = await admin
    .from("job_tickets")
    .select(
      `id, created_by_id, ticket_status, routed_by_id,
       quote_final_total, payment_amount_received, deposit_paid_at, deposit_amount, deposit_method,
       balance_paid_at, payment_paid_at, payment_method_used, ticket_payment_strategy,
       stripe_payment_intent_id, stripe_amount_cents, stripe_amount_refunded_cents,
       payment_evidence_reviewed_at`,
    )
    .eq("id", ticketId)
    .single();

  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  if (!canAccessTicket(ticket, userId!, roleName)) {
    return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
  }

  const priorRefunds = await fetchTicketRefunds(admin, ticketId);
  const slots = listRefundablePaymentSlots(ticket as RefundableSlotTicket, priorRefunds);
  const slot = slots.find((s) => s.mode === paymentMode);
  if (!slot) {
    return NextResponse.json({ error: "This payment is not available to refund." }, { status: 400 });
  }

  const amountDollars =
    amountMode === "full"
      ? slot.maxRefundable
      : Number(body.amount);

  const refundMethod =
    slot.refundChannel === "stripe"
      ? "card"
      : String(body.refund_method ?? slot.method).trim() || slot.method;

  let evidencePath: string | null = null;
  const evidenceFile = body.evidence;
  if (evidenceFile instanceof File && evidenceFile.size > 0) {
    if (evidenceFile.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large. Maximum size is 10 MB." }, { status: 413 });
    }
    if (!ALLOWED_MIME.has(evidenceFile.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Accepted: JPEG, PNG, WebP, PDF." },
        { status: 415 },
      );
    }
    const safeName = evidenceFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    evidencePath = `${ticketId}/${randomUUID()}-${safeName}`;
    const buffer = Buffer.from(await evidenceFile.arrayBuffer());
    const { error: uploadErr } = await admin.storage
      .from("refund-evidence")
      .upload(evidencePath, buffer, {
        contentType: evidenceFile.type || "application/octet-stream",
        upsert: false,
      });
    if (uploadErr) {
      console.error("[refund] evidence upload failed:", uploadErr);
      return NextResponse.json({ error: "Failed to upload refund evidence." }, { status: 500 });
    }
  }

  let result;
  if (slot.refundChannel === "stripe") {
    if (!isStripeConfigured()) {
      return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
    }
    result = await processStripeRefund(admin, {
      ticketId,
      refundReason,
      refundNotes,
      paymentMode,
      mode: amountMode,
      amountDollars: amountMode === "partial" ? amountDollars : undefined,
      refundMethod,
      evidencePath,
      byUserId: userId!,
    });
  } else {
    result = await applyTicketRefund(admin, {
      ticketId,
      paymentMode,
      amountDollars,
      refundMethod,
      source: "manual",
      reason: refundReason,
      notes: refundNotes,
      evidencePath,
      byUserId: userId!,
    });
  }

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Refund failed.", refund_id: result.refundId },
      { status: result.refundId ? 500 : 400 },
    );
  }

  notifyPublicQuoteUpdatedByTicketId(admin, ticketId);

  return NextResponse.json({
    ok: true,
    refund_id: result.refundId,
    amount_cents: result.amountCents,
  });
}
