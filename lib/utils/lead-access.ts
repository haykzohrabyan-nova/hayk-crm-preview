/** Whether the session user may read a lead via GET /api/leads/[id]. */
export function canReadLead(
  lead: {
    status: string;
    sales_status: string | null;
    sdr_id: string | null;
    sales_owner_id: string | null;
    locked_by_id: string | null;
    prev_status: string | null;
  },
  userId: string | null,
  roleName: string | null,
): boolean {
  if (roleName === "admin") return true;
  if (!userId) return false;
  if (lead.sdr_id === userId) return true;
  if (lead.sales_owner_id === userId) return true;
  if (lead.locked_by_id === userId) return true;
  if (roleName === "sales") {
    if (lead.status === "Routed to Sales") return true;
    if (lead.status === "Rejected" && lead.prev_status === "Routed to Sales") return true;
  }
  if (roleName === "sdr" && !lead.locked_by_id) return true;
  return false;
}
