import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { maybeAutoReleaseProduction, AUTO_RELEASE_SELECT, type AutoReleaseTicket } from "@/lib/utils/maybe-auto-release-production";
import { maybeConvertQuoteToOrder } from "@/lib/utils/maybe-convert-quote-to-order";
import { computePublicPaymentDueAmount } from "@/lib/utils/invoice-payment-summary";
import { notifyPublicQuoteUpdated } from "@/lib/integrations/notify-public-quote-updated";
import { randomUUID } from "crypto";
import { enforcePublicQuoteRateLimit } from "@/lib/security/enforce-route-rate-limit";
import { publicQuotePaymentBlockedResponse } from "@/lib/utils/public-quote-payment-blocked";

// POST /api/public/quotes/[token]/submit-payment
// Quote stays quote until payment is recorded (cash) or accountant confirms (evidence).

type Params = { params: Promise<{ token: string }> };

const EVIDENCE_REQUIRED_CHANNELS = new Set(["wire", "ach", "zelle", "check"]);

export async function POST(request: NextRequest, { params }: Params) {
  const rateLimited = enforcePublicQuoteRateLimit(request, "submit-payment");
  if (rateLimited) return rateLimited;

  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: ticket, error: fetchErr } = await admin
    .from("job_tickets")
    .select(
      AUTO_RELEASE_SELECT.replace(/\s+/g, " ") +
        ", payment_evidence_url, payment_evidence_submitted_at, payment_evidence_amount, ticket_receipt_id, refund_status, payment_evidence_resubmit_requested_at, payment_evidence_resubmit_received_at, payment_method_used",
    )
    .eq("public_token", token)
    .single();

  if (fetchErr || !ticket) {
    return NextResponse.json({ error: "Quote not found." }, { status: 404 });
  }

  const row = ticket as unknown as AutoReleaseTicket & {
    payment_evidence_url: string | null;
    payment_evidence_submitted_at: string | null;
    ticket_receipt_id: string | null;
    payment_evidence_resubmit_requested_at: string | null;
    payment_evidence_resubmit_received_at: string | null;
    payment_method_used: string | null;
  };

  const blocked = publicQuotePaymentBlockedResponse(
    row as AutoReleaseTicket & { refund_status?: string | null },
  );
  if (blocked) {
    return NextResponse.json(blocked.body, { status: blocked.status });
  }

  const quoteTotal  = Number(row.quote_final_total ?? 0);
  const alreadyPaidBefore = Number(row.payment_amount_received ?? 0);
  if (row.ticket_status === "completed" && alreadyPaidBefore >= quoteTotal - 0.01) {
    return NextResponse.json({ error: "This order is already paid in full." }, { status: 400 });
  }

  const isFollowUpPayment =
    row.ticket_status === "in_production" ||
    row.ticket_status === "order" ||
    row.ticket_status === "completed" ||
    !!row.deposit_paid_at ||
    alreadyPaidBefore > 0.01;

  const resubmitRequested = !!row.payment_evidence_resubmit_requested_at;
  const resubmitReceived =
    !!row.payment_evidence_resubmit_received_at && !resubmitRequested;

  if (resubmitRequested && !resubmitReceived) {
    // Replacement proof only — skip quote confirmation gate on dedicated /evidence page.
  } else {
    const requireConfirm = row.ticket_require_client_confirm ?? true;
    if (requireConfirm && !row.client_confirmed) {
      return NextResponse.json(
        { error: "Please confirm the quote before submitting payment.", code: "CONFIRM_REQUIRED" },
        { status: 409 },
      );
    }
  }

  if (row.payment_evidence_url && !isFollowUpPayment && !resubmitRequested) {
    return NextResponse.json({ error: "Payment evidence already submitted." }, { status: 409 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const method              = String(formData.get("method") ?? "").trim();
  const receiptId           = String(formData.get("receiptId") ?? "").trim() || null;
  const file                = formData.get("file") as File | null;
  const claimedAmountRaw    = formData.get("claimedAmount");
  const claimedAmountParsed = claimedAmountRaw != null ? Number(claimedAmountRaw) : null;

  if (resubmitReceived) {
    return NextResponse.json(
      {
        error: "Updated payment proof was already submitted. Contact us if you need to send another file.",
        code: "ALREADY_SUBMITTED",
      },
      { status: 409 },
    );
  }

  if (!method) {
    return NextResponse.json({ error: "Payment method is required." }, { status: 400 });
  }

  const amount = computePublicPaymentDueAmount(row);
  if (amount <= 0.01) {
    return NextResponse.json({ error: "No payment is due at this time." }, { status: 400 });
  }

  if (EVIDENCE_REQUIRED_CHANNELS.has(method) && !file) {
    return NextResponse.json({ error: "Payment evidence file is required for this payment method." }, { status: 400 });
  }

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
  const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

  if (file) {
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large. Maximum size is 10 MB." }, { status: 413 });
    }
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Accepted: JPEG, PNG, WebP, PDF." },
        { status: 415 },
      );
    }
  }

  const isEvidenceResubmit = resubmitRequested && !!file;

  let evidenceStoragePath: string | null = null;
  if (file) {
    if (isEvidenceResubmit && row.payment_evidence_url) {
      await admin.storage.from("payment-evidence").remove([row.payment_evidence_url]);
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${row.id}/${randomUUID()}-${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadErr } = await admin.storage
      .from("payment-evidence")
      .upload(storagePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadErr) {
      console.error("[submit-payment] storage upload failed:", uploadErr);
      return NextResponse.json({ error: "Failed to upload payment evidence. Please try again." }, { status: 500 });
    }
    evidenceStoragePath = storagePath;
  }

  const alreadyPaid = alreadyPaidBefore;
  const newTotal    = Math.min(alreadyPaid + amount, quoteTotal);
  const fullyPaid   = newTotal >= quoteTotal - 0.01;
  const needsAccountantReview = EVIDENCE_REQUIRED_CHANNELS.has(method);
  const strategy = row.ticket_payment_strategy ?? "full";
  const depositAlreadyRecorded =
    !!row.deposit_paid_at &&
    strategy === "partial" &&
    amount <= Number(row.deposit_amount ?? row.payment_amount_received ?? 0) + 0.02;

  if (needsAccountantReview && depositAlreadyRecorded) {
    return NextResponse.json({
      ok: true,
      message: "Deposit already recorded — no additional review needed.",
      duplicate_deposit_proof: true,
    });
  }

  const now = new Date().toISOString();

  const patch: Record<string, unknown> = {
    updated_at:                    now,
    payment_method_used:           method,
    payment_evidence_submitted_at: now,
  };

  if (evidenceStoragePath) {
    patch.payment_evidence_url = evidenceStoragePath;
    patch.payment_evidence_reviewed_at = null;
    if (isEvidenceResubmit) {
      patch.payment_evidence_resubmit_requested_at = null;
      patch.payment_evidence_resubmit_requested_by_id = null;
      patch.payment_evidence_resubmit_reason = null;
      patch.payment_evidence_resubmit_received_at = now;
    }
  }
  if (receiptId) patch.ticket_receipt_id = receiptId;

  if (needsAccountantReview) {
    // Use the customer's self-reported amount if provided and valid; otherwise
    // fall back to the system-computed due amount. The accountant verifies the
    // actual amount against the uploaded evidence before confirming.
    const evidenceAmount =
      claimedAmountParsed != null && claimedAmountParsed > 0 && claimedAmountParsed <= amount
        ? claimedAmountParsed
        : amount;
    patch.payment_evidence_amount = evidenceAmount;
  } else {
    patch.payment_amount_received = newTotal;

    const isInitialDeposit =
      strategy === "partial" && !row.deposit_paid_at && !isFollowUpPayment;

    if (isInitialDeposit) {
      patch.deposit_amount     = amount;
      patch.deposit_paid_at    = now;
      patch.deposit_receipt_id = receiptId;
      patch.deposit_method     = method;
      patch.payment_status     = "partial";
    }

    if (fullyPaid && !row.payment_paid_at) {
      patch.payment_paid_at = now;
      patch.payment_status  = "paid";
      patch.balance_paid_at = now;
    } else if (isFollowUpPayment && !fullyPaid) {
      patch.payment_status = "partial";
    } else if (!fullyPaid && newTotal > alreadyPaid && strategy !== "partial") {
      patch.payment_status = "partial";
    }
  }

  const { error: updateErr } = await admin
    .from("job_tickets")
    .update(patch)
    .eq("id", row.id);

  if (updateErr) {
    console.error("[submit-payment] db update failed:", updateErr);
    return NextResponse.json({ error: "Failed to record payment. Please try again." }, { status: 500 });
  }

  const activityRows: Record<string, unknown>[] = [];

  if (needsAccountantReview) {
    activityRows.push({
      type: isEvidenceResubmit ? "ticket_payment_evidence_resubmitted" : "ticket_payment_evidence_submitted",
      lead_id: row.linked_lead_id ?? null,
      customer_id: row.customer_id ?? null,
      ticket_id: row.id,
      by_user_id: null,
      payload: { method, amount, has_file: !!evidenceStoragePath, receipt_id: receiptId, via: "public_payment" },
      created_at: now,
    });
  } else {
    activityRows.push({
      type: "ticket_payment_recorded",
      lead_id: row.linked_lead_id ?? null,
      customer_id: row.customer_id ?? null,
      ticket_id: row.id,
      by_user_id: null,
      payload: {
        mode: fullyPaid ? "full" : isFollowUpPayment ? "balance" : "deposit",
        method, amount, receipt_id: receiptId, new_total: newTotal, fully_paid: fullyPaid, via: "public_payment",
      },
      created_at: now,
    });
  }

  if (activityRows.length > 0) {
    await admin.from("activities").insert(activityRows);
  }

  let autoReleased = false;
  let referenceCode = row.reference_code;

  if (!needsAccountantReview) {
    const { data: fresh } = await admin
      .from("job_tickets")
      .select(AUTO_RELEASE_SELECT.replace(/\s+/g, " "))
      .eq("id", row.id)
      .single();

    if (fresh) {
      const freshRow = fresh as unknown as AutoReleaseTicket;
      const convertResult = await maybeConvertQuoteToOrder(admin, freshRow, now, { via: "public_payment" });
      if (convertResult.converted) referenceCode = convertResult.reference_code ?? referenceCode;

      const postConvert = convertResult.converted
        ? { ...freshRow, ticket_status: "order", reference_code: referenceCode }
        : freshRow;

      const releaseResult = await maybeAutoReleaseProduction(admin, postConvert, now, { via: "public_payment" });
      autoReleased = releaseResult.released;
      if (releaseResult.reference_code) referenceCode = releaseResult.reference_code;
    }
  }

  notifyPublicQuoteUpdated(token);

  return NextResponse.json({
    ok: true,
    autoReleased,
    referenceCode,
    evidencePending: needsAccountantReview,
  });
}
