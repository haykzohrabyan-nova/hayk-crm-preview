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

/** Whether the session user may mutate a lead (PATCH and similar). Same scope as read. */
export function canMutateLead(
  lead: Parameters<typeof canReadLead>[0],
  userId: string | null,
  roleName: string | null,
): boolean {
  return canReadLead(lead, userId, roleName);
}

/** Sales (or admin) may claim an unowned lead in the sales pipeline. */
export function canClaimLead(
  lead: {
    status: string;
    sales_owner_id: string | null;
    sales_status: string | null;
  },
  roleName: string,
): boolean {
  if (lead.sales_owner_id) return false;
  if (roleName === "admin") {
    return lead.status === "Routed to Sales" || lead.sales_status != null;
  }
  if (roleName !== "sales") return false;
  return lead.status === "Routed to Sales";
}

/** SDR / Sales / Admin may acquire a lock; scope matches each role's pipeline. */
export function canAcquireLeadLock(
  lead: Parameters<typeof canReadLead>[0],
  userId: string,
  roleName: string,
): boolean {
  if (roleName === "admin") return true;
  if (roleName === "sdr") return canReadLead(lead, userId, roleName);
  if (roleName === "sales") {
    if (lead.sales_owner_id === userId) return true;
    if (!lead.sales_owner_id && lead.status === "Routed to Sales") return true;
    return false;
  }
  return false;
}
