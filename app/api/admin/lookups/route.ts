import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

// Human-readable display names for each category, in the order they appear in the UI
export const CATEGORY_META: Record<string, { label: string; section: "leads" | "order" }> = {
  // Lead-form categories
  source:           { label: "Lead Sources",        section: "leads" },
  industry:         { label: "Industries",           section: "leads" },
  urgency:          { label: "Urgency Levels",       section: "leads" },
  hold_reason:      { label: "Hold Reasons",         section: "leads" },
  reject_reason:    { label: "Reject Reasons",       section: "leads" },
  route_reason:     { label: "Route to Sales Reasons", section: "leads" },
  sales_drop_reason:{ label: "Drop Reasons",         section: "leads" },
  // Order / quote categories
  lamination:       { label: "Lamination Options",   section: "order" },
  finishing:        { label: "Add-on Finishings",    section: "order" },
  quote_channel:    { label: "Quote Channels",       section: "order" },
  follow_up_freq:   { label: "Follow-up Frequency",  section: "order" },
  ticket_priority:  { label: "Ticket Priority",      section: "order" },
  order_source:     { label: "Order Source",         section: "order" },
  ticket_payment:   { label: "Payment Methods",      section: "order" },
  color_mode:       { label: "Color Mode",            section: "order" },
  sides:            { label: "Sides",                  section: "order" },
  roll_direction:   { label: "Roll Direction",         section: "order" },
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

  // Group by category and attach meta
  const grouped: Record<string, {
    category: string;
    label: string;
    section: "leads" | "order";
    items: typeof data;
  }> = {};

  for (const row of data ?? []) {
    if (!grouped[row.category]) {
      const meta = CATEGORY_META[row.category];
      grouped[row.category] = {
        category: row.category,
        label: meta?.label ?? row.category,
        section: meta?.section ?? "leads",
        items: [],
      };
    }
    grouped[row.category]!.items.push(row);
  }

  return NextResponse.json({ categories: Object.values(grouped) });
}

// POST /api/admin/lookups — create a new option in an existing category
export async function POST(request: Request) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();
  const body = await request.json();
  const { category, label } = body;

  if (!category?.trim() || !label?.trim()) {
    return NextResponse.json({ error: "category and label are required" }, { status: 400 });
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

  return NextResponse.json({ item: data }, { status: 201 });
}
