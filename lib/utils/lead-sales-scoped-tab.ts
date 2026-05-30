/** Sales pipeline scoped tabs (On Hold, Follow Up Later) — visibility by `sales_owner_id`. */

export type LeadSalesScopeRow = {
  sales_owner_id: string | null;
};

/** Error when a Sales rep may not act on this lead; null if allowed (admin always allowed). */
export function salesScopedLeadActionError(
  lead: LeadSalesScopeRow,
  userId: string,
  roleName: string,
): string | null {
  if (roleName === "admin") return null;
  if (roleName !== "sales") return null;

  if (!lead.sales_owner_id || lead.sales_owner_id !== userId) {
    return "Only the sales rep who owns this lead can perform this action.";
  }
  return null;
}
