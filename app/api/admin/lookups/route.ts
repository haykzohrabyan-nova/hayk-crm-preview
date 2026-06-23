import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { clearTicketFormBootstrapServerCache } from "@/lib/utils/ticket-form-bootstrap-server-cache";

// Human-readable display names for each category, in the order they appear in the UI
export const CATEGORY_META: Record<string, { label: string; section: "leads" | "order" }> = {
  // Lead-form categories
  source:           { label: "Lead Sources",        section: "leads" },
  industry:         { label: "Industries",           section: "leads" },
  urgency:          { label: "Urgency Levels",       section: "leads" },
  hold_reason:      { label: "Hold Reasons",         section: "leads" },
  follow_up_reason: { label: "Follow Up Later Reasons", section: "leads" },
  reject_reason:    { label: "Reject Reasons",       section: "leads" },
  route_reason:     { label: "Route to Sales Reasons (Leads & Quotes)", section: "leads" },
  sales_drop_reason:{ label: "Drop Reasons",         section: "leads" },
  // Order / quote categories
  lamination:       { label: "Lamination Options",   section: "order" },
  finishing:        { label: "Add-on Finishings",    section: "order" },
  quote_channel:    { label: "Quote Channels",       section: "order" },
  follow_up_freq:   { label: "Follow-up Frequency",  section: "order" },
  ticket_priority:  { label: "Ticket Priority",      section: "order" },
  order_source:     { label: "Order Source",         section: "order" },
  ticket_payment:   { label: "Payment Methods",      section: "order" },
  quote_cancel_reason: { label: "Quote Cancellation Reasons", section: "order" },
  order_cancel_reason: { label: "Order Cancellation Reasons", section: "order" },
  stripe_refund_reason: { label: "Stripe Refund Reasons", section: "order" },
  payment_refund_reason: { label: "Payment Refund Reasons", section: "order" },
  color_mode:       { label: "Color Mode",            section: "order" },
  sides:            { label: "Sides",                  section: "order" },
  roll_direction:   { label: "Roll Direction",         section: "order" },
  designer:         { label: "Designers",              section: "order" },
};

// GET /api/admin/lookups — all categories with their values
export async function GET() {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("lookup_values")
    .select("id, category, value, label, sort_order, is_active")
    .order("category")
    .order("sort_order");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type LookupRow = NonNullable<typeof data>[number];
  type CategoryGroup = {
    category: string;
    label: string;
    section: "leads" | "order";
    items: LookupRow[];
  };

  // Seed every admin-managed category so Dropdown Options lists them under Lead Forms / Order · Quote
  const grouped: Record<string, CategoryGroup> = {};
  for (const [key, meta] of Object.entries(CATEGORY_META)) {
    grouped[key] = {
      category: key,
      label: meta.label,
      section: meta.section,
      items: [],
    };
  }

  for (const row of data ?? []) {
    if (!grouped[row.category]) {
      grouped[row.category] = {
        category: row.category,
        label: row.category,
        section: "leads",
        items: [],
      };
    }
    grouped[row.category]!.items.push(row);
  }

  const categories: CategoryGroup[] = [
    ...Object.keys(CATEGORY_META).map((key) => grouped[key]!),
    ...Object.keys(grouped)
      .filter((key) => !(key in CATEGORY_META))
      .map((key) => grouped[key]!),
  ];

  return NextResponse.json({ categories });
}

// POST /api/admin/lookups — create a new option in an existing category
export async function POST(request: Request) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();
  const body = await request.json().catch(() => ({}));
  const { category, label } = body;

  if (!category?.trim() || !label?.trim()) {
    return NextResponse.json({ error: "category and label are required" }, { status: 400 });
  }

  if (!CATEGORY_META[category.trim()]) {
    return NextResponse.json(
      { error: "Unknown category — manage options from Admin → Dropdown Options." },
      { status: 400 },
    );
  }

  // Auto-generate value slug from label
  const value = label.trim().toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "_");

  if (!value) {
    return NextResponse.json({ error: "Could not derive a valid slug from label" }, { status: 400 });
  }

  // Get highest sort_order in this category
  const { data: existing } = await admin
    .from("lookup_values")
    .select("sort_order")
    .eq("category", category)
    .order("sort_order", { ascending: false })
    .limit(1);

  const nextSort = ((existing?.[0]?.sort_order ?? -1) as number) + 1;

  const { data, error } = await admin
    .from("lookup_values")
    .insert({ category, value, label: label.trim(), sort_order: nextSort })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "An option with this value already exists in this category" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  clearTicketFormBootstrapServerCache();
  return NextResponse.json({ item: data }, { status: 201 });
}
