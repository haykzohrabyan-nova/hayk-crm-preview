import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { getDashboardValuesHidden } from "@/lib/utils/dashboard-privacy";

// GET /api/payments/counts
// Returns KPI counts for the Accountant dashboard.
// Restricted to accountant and admin roles.

export async function GET() {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  if (roleName !== "accountant" && roleName !== "admin") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const admin = createAdminClient();
  const valuesHidden = await getDashboardValuesHidden(admin, userId!);

  if (valuesHidden) {
    return NextResponse.json({ values_hidden: true, counts: null });
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [
    { count: pending_evidence },
    { count: orders_in_production },
    { count: completed_this_month },
  ] = await Promise.all([
    // Orders with evidence submitted but not yet reviewed by accountant
    admin
      .from("job_tickets")
      .select("id", { count: "exact", head: true })
      .not("payment_evidence_submitted_at", "is", null)
      .is("payment_evidence_reviewed_at", null)
      .or("payment_evidence_url.not.is.null,stripe_payment_intent_id.not.is.null")
      .in("ticket_status", ["sent", "order", "in_production", "completed"]),

    // Orders currently in production
    admin
      .from("job_tickets")
      .select("id", { count: "exact", head: true })
      .eq("ticket_status", "in_production"),

    // Orders completed this calendar month
    admin
      .from("job_tickets")
      .select("id", { count: "exact", head: true })
      .eq("ticket_status", "completed")
      .gte("updated_at", monthStart),
  ]);

  return NextResponse.json({
    values_hidden: false,
    counts: {
      pending_evidence:      pending_evidence ?? 0,
      orders_in_production:  orders_in_production ?? 0,
      completed_this_month:  completed_this_month ?? 0,
    },
  });
}
