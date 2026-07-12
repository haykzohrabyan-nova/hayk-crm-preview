"use server";

// Hayk 2026-07-12 — Orders preview SERVER ACTIONS.
// The "internal" order buttons that only change OUR OWN records (status,
// priority, per-item assignment, notes, payment, complete/cancel). Each writes
// to the SHARED local Postgres via the service-role admin client and logs an
// activity_log row. LOCAL ONLY. Additive / in-place updates on the sandbox —
// never a destructive delete. Transferable: same shape moves into the unified
// system later. External sends (email/SMS/charge) are NOT here — those need
// JustCall / email / a payment processor.

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

type Result = { ok: boolean; error?: string };

async function tenantOf(admin: ReturnType<typeof createAdminClient>, orderId: string): Promise<string | null> {
  const { data } = await admin.from("orders").select("tenant_id").eq("id", orderId).single();
  return (data as { tenant_id: string } | null)?.tenant_id ?? null;
}

async function logActivity(admin: ReturnType<typeof createAdminClient>, tenantId: string, orderId: string, action: string, metadata: Record<string, unknown>) {
  await admin.from("activity_log").insert({ tenant_id: tenantId, order_id: orderId, action, metadata });
}

// ── Status → move the board card to the named column ─────────────────────────
export async function setOrderStatus(orderId: string, stageName: string): Promise<Result> {
  const admin = createAdminClient();
  const tenant = await tenantOf(admin, orderId);
  if (!tenant) return { ok: false, error: "order not found" };
  // Read current column to log a from→to move.
  const { data: cur } = await admin.from("orders").select("column_id").eq("id", orderId).single();
  const { data: fromCol } = cur?.column_id
    ? await admin.from("board_columns").select("name").eq("id", (cur as { column_id: string }).column_id).single()
    : { data: null };
  const { data: col } = await admin.from("board_columns").select("id, name").eq("tenant_id", tenant).eq("name", stageName).single();
  if (!col) return { ok: false, error: "stage not found" };
  const { error } = await admin.from("orders").update({ column_id: (col as { id: string }).id }).eq("id", orderId);
  if (error) return { ok: false, error: error.message };
  await logActivity(admin, tenant, orderId, "moved", { from: (fromCol as { name?: string } | null)?.name ?? null, to: stageName });
  revalidatePath("/preview/orders");
  return { ok: true };
}

// ── Priority ─────────────────────────────────────────────────────────────────
const PRIORITY_DB: Record<string, string> = { Normal: "normal", High: "high", Rush: "urgent", Low: "low" };
export async function setOrderPriority(orderId: string, ticketRef: string | null, priorityLabel: string): Promise<Result> {
  const admin = createAdminClient();
  const tenant = await tenantOf(admin, orderId);
  if (!tenant) return { ok: false, error: "order not found" };
  const dbVal = PRIORITY_DB[priorityLabel] ?? "normal";
  const { error } = await admin.from("orders").update({ priority: dbVal }).eq("id", orderId);
  if (error) return { ok: false, error: error.message };
  if (ticketRef) await admin.from("job_tickets").update({ priority: dbVal }).eq("reference_code", ticketRef);
  await logActivity(admin, tenant, orderId, "priority", { to: priorityLabel });
  revalidatePath("/preview/orders");
  return { ok: true };
}

// ── Per-item people assignment (writes into the ticket's product_lines) ──────
export async function assignLineItem(orderId: string, ticketRef: string, lineIndex: number, field: "accountManager" | "productionOwner", value: string): Promise<Result> {
  const admin = createAdminClient();
  const tenant = await tenantOf(admin, orderId);
  if (!tenant) return { ok: false, error: "order not found" };
  const { data: t } = await admin.from("job_tickets").select("product_lines").eq("reference_code", ticketRef).single();
  const lines = Array.isArray((t as { product_lines?: unknown } | null)?.product_lines) ? [...((t as { product_lines: unknown[] }).product_lines)] : [];
  if (!lines[lineIndex]) return { ok: false, error: "line not found" };
  lines[lineIndex] = { ...(lines[lineIndex] as Record<string, unknown>), [field]: value || undefined };
  const { error } = await admin.from("job_tickets").update({ product_lines: lines }).eq("reference_code", ticketRef);
  if (error) return { ok: false, error: error.message };
  await logActivity(admin, tenant, orderId, "assigned", { line: lineIndex + 1, [field]: value || "unassigned" });
  revalidatePath("/preview/orders");
  return { ok: true };
}

// ── Production notes (stored on the order's specs jsonb) ──────────────────────
export async function setProductionNotes(orderId: string, notes: string): Promise<Result> {
  const admin = createAdminClient();
  const tenant = await tenantOf(admin, orderId);
  if (!tenant) return { ok: false, error: "order not found" };
  const { data: o } = await admin.from("orders").select("specs").eq("id", orderId).single();
  const specs = { ...(((o as { specs?: Record<string, unknown> } | null)?.specs) ?? {}), production_notes: notes };
  const { error } = await admin.from("orders").update({ specs }).eq("id", orderId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/preview/orders");
  return { ok: true };
}

// ── Record a payment (updates the ticket's payment fields) ────────────────────
export async function recordPayment(orderId: string, ticketRef: string, amount: number, method: string): Promise<Result> {
  const admin = createAdminClient();
  const tenant = await tenantOf(admin, orderId);
  if (!tenant) return { ok: false, error: "order not found" };
  const { data: t } = await admin
    .from("job_tickets")
    .select("payment_amount_received, quote_final_total, total")
    .eq("reference_code", ticketRef)
    .single();
  const row = t as { payment_amount_received: number | null; quote_final_total: number | null; total: number | null } | null;
  const prev = Number(row?.payment_amount_received ?? 0);
  const orderTotal = Number(row?.quote_final_total ?? 0) || Number(row?.total ?? 0);
  const received = Math.round((prev + amount) * 100) / 100;
  const status = orderTotal > 0 && received >= orderTotal ? "paid" : received > 0 ? "partial" : "unpaid";
  const { error } = await admin
    .from("job_tickets")
    .update({ payment_amount_received: received, payment_status: status, payment_method_used: method, payment_paid_at: new Date().toISOString() })
    .eq("reference_code", ticketRef);
  if (error) return { ok: false, error: error.message };
  await logActivity(admin, tenant, orderId, "payment", { amount, method, received });
  revalidatePath("/preview/orders");
  return { ok: true };
}

// ── Mark completed → move to Archive column ──────────────────────────────────
export async function markCompleted(orderId: string): Promise<Result> {
  const admin = createAdminClient();
  const tenant = await tenantOf(admin, orderId);
  if (!tenant) return { ok: false, error: "order not found" };
  const { data: col } = await admin.from("board_columns").select("id, name").eq("tenant_id", tenant).eq("name", "Archive").single();
  if (col) await admin.from("orders").update({ column_id: (col as { id: string }).id }).eq("id", orderId);
  await logActivity(admin, tenant, orderId, "completed", {});
  revalidatePath("/preview/orders");
  return { ok: true };
}

// ── Cancel order (marks the ticket cancelled) ────────────────────────────────
export async function cancelOrder(orderId: string, ticketRef: string | null): Promise<Result> {
  const admin = createAdminClient();
  const tenant = await tenantOf(admin, orderId);
  if (!tenant) return { ok: false, error: "order not found" };
  if (ticketRef) await admin.from("job_tickets").update({ ticket_status: "cancelled" }).eq("reference_code", ticketRef);
  await logActivity(admin, tenant, orderId, "cancelled", {});
  revalidatePath("/preview/orders");
  return { ok: true };
}
