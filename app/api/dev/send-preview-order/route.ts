// LOCAL DEV — POSTs the preview new-quote wizard's data to Workflow's
// /api/webhook/orders endpoint so a real card appears on the board.
//
// This route lives under /api/dev because it's tied to the preview wizard
// at /preview/new-quote, not the production quote-→-order flow.
//
// Env:
//   ORDER_WEBHOOK_URL     — e.g. http://localhost:3004/api/webhook/orders
//   ORDER_WEBHOOK_SECRET  — must match a row in workflow.webhook_configs.secret_key

import { NextResponse } from "next/server";

interface PreviewLineItem {
  productName?: string;
  materialName?: string;
  widthIn?: number;
  heightIn?: number;
  sides?: string;
  colorMode?: string;
  quantity?: number;
  comment?: string;
  finishingIds?: number[];
  specialEffectIds?: number[];
  unitPrice?: number;
  extended?: number;
}

interface PreviewOrderBody {
  quoteRefId: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  companyName?: string;
  priority?: string;
  dueDate?: string;
  notes?: string;
  lineItems: PreviewLineItem[];
  quoteType?: "firm" | "comparison";
  total?: number;
}

function sizeLabel(w?: number, h?: number): string | undefined {
  if (w && h) return `${w}×${h} in`;
  return undefined;
}

export async function POST(request: Request) {
  const url = process.env.ORDER_WEBHOOK_URL;
  const secret = process.env.ORDER_WEBHOOK_SECRET;
  if (!url || !secret) {
    return NextResponse.json(
      { ok: false, error: "ORDER_WEBHOOK_URL or ORDER_WEBHOOK_SECRET not set on CRM" },
      { status: 500 },
    );
  }

  let body: PreviewOrderBody;
  try {
    body = (await request.json()) as PreviewOrderBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.lineItems) || body.lineItems.length === 0) {
    return NextResponse.json(
      { ok: false, error: "At least one line item required" },
      { status: 400 },
    );
  }

  // Workflow's Sides custom field accepts "Single-sided" / "Double-sided"
  // (verified against custom_fields.options in the workflow DB). The CRM's
  // internal S1/S2 codes get auto-corrected to blank if sent raw.
  const sidesLabel = (s?: string) =>
    s === "S1" ? "Single-sided" : s === "S2" ? "Double-sided" : s;

  // Transform CRM preview shape → workflow WebhookOrderPayload
  // (workflow expects flat snake_case fields; multi-line uses `items[]`)
  const items = body.lineItems.map((l) => ({
    title: l.productName || "Untitled line",
    product: l.productName,
    finished_size: sizeLabel(l.widthIn, l.heightIn),
    materials: l.materialName,
    sides: sidesLabel(l.sides),
    color_mode: l.colorMode,
    order_qty: l.quantity,
    description: [
      l.comment,
      l.finishingIds?.length ? `Finishing: ${l.finishingIds.join(", ")}` : null,
      l.specialEffectIds?.length ? `Effects: ${l.specialEffectIds.join(", ")}` : null,
      l.unitPrice != null ? `Unit: $${l.unitPrice.toFixed(4)}` : null,
      l.extended != null ? `Extended: $${l.extended.toFixed(2)}` : null,
    ].filter(Boolean).join(" · ") || undefined,
  }));

  const payload = {
    order_number: body.quoteRefId,
    title: body.lineItems[0]?.productName
      ? `${body.lineItems[0]?.productName}${body.lineItems.length > 1 ? ` +${body.lineItems.length - 1}` : ""}`
      : `Preview quote ${body.quoteRefId}`,
    priority: body.priority,
    due_date: body.dueDate,
    customer_name: body.customerName || "Unknown customer",
    customer_contact: body.customerEmail,
    customer_phone: body.customerPhone,
    description: body.notes,
    items,
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": secret,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: (data as { error?: string })?.error || `HTTP ${res.status}`,
          workflowResponse: data,
        },
        { status: res.status },
      );
    }
    // Hayk 2026-07-02 — Passport-number linkage. The quote's numeric core
    // rides straight through to the order ref, so downstream artifacts
    // (INV-XXX, PS-XXX, workflow card #XXX) all match Q-XXX.
    // QO before Q — alternation is first-match, so /Q|QO/ strips only the
    // "Q" of "QO-777" and leaves "O-777".
    const core = body.quoteRefId
      .replace(/^(QO|ORD|INV|PS|Q)-?/i, "")
      .replace(/^\d{4}-/, "")
      .padStart(3, "0");
    return NextResponse.json({
      ok: true,
      orderRefId: `ORD-${core}`,
      passportCore: core,
      workflowResponse: data,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
