import type { createAdminClient } from "@/lib/supabase/admin";
import { countExact } from "@/lib/utils/db-counts";

type AdminClient = ReturnType<typeof createAdminClient>;

const PRODUCTION_ORDER_SELECT = `
  id, reference_code, title,
  ticket_status,
  payment_status,
  quote_final_total,
  payment_amount_received,
  ticket_payment_strategy,
  ticket_net_terms_label,
  priority, due_date, rush,
  production_released_at,
  created_at,
  customer:customers(id, first_name, last_name, company)
`.trim();

export async function fetchProductionOrders(admin: AdminClient) {
  const { data, error } = await admin
    .from("job_tickets")
    .select(PRODUCTION_ORDER_SELECT)
    .eq("ticket_status", "in_production")
    .order("production_released_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function fetchProductionTabCounts(admin: AdminClient) {
  const [all, balance_due] = await Promise.all([
    countExact(admin, "job_tickets", (q) => q.eq("ticket_status", "in_production")),
    countExact(admin, "job_tickets", (q) =>
      q
        .eq("ticket_status", "in_production")
        .neq("payment_status", "paid")
        .neq("ticket_payment_strategy", "net"),
    ),
  ]);

  return { all, balance_due };
}
