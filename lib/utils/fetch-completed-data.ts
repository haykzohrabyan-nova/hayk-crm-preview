import type { createAdminClient } from "@/lib/supabase/admin";
import {
  countExact,
  scopeCompletedTicketsQuery,
  scopedCompletedTicketCount,
  type TicketSelectQuery,
} from "@/lib/utils/db-counts";

type AdminClient = ReturnType<typeof createAdminClient>;

const COMPLETED_ORDER_SELECT = `
  id, reference_code, title,
  ticket_status,
  payment_status,
  quote_final_total,
  payment_amount_received,
  ticket_payment_strategy,
  priority, due_date, rush,
  updated_at, created_at,
  customer:customers(id, first_name, last_name, company)
`.trim();

export async function fetchCompletedOrders(
  admin: AdminClient,
  roleName: string,
  userId: string,
) {
  const query = scopeCompletedTicketsQuery(
    admin.from("job_tickets").select(COMPLETED_ORDER_SELECT) as TicketSelectQuery,
    roleName,
    userId,
  );

  const { data, error } = await query
    .eq("ticket_status", "completed")
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function fetchCompletedTabCounts(
  admin: AdminClient,
  roleName: string,
  userId: string,
) {
  const completed =
    roleName === "admin" || roleName === "accountant"
      ? await countExact(admin, "job_tickets", (q) => q.eq("ticket_status", "completed"))
      : await scopedCompletedTicketCount(admin, roleName, userId, (q) =>
          q.eq("ticket_status", "completed"),
        );
  return { completed };
}
