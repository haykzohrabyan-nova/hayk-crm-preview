/** Sales pipeline scoped tabs — visibility by `sales_owner_id`. */

/** Tabs where sales reps see only their own leads (`sales_owner_id = me`). */
export const SALES_OWNED_TABS = [
  "claimed",
  "in_progress",
  "follow_up",
  "hold",
] as const;

export type SalesOwnedTab = (typeof SALES_OWNED_TABS)[number];

/** Admin-only search + team member filter on these tabs. */
export const SALES_ADMIN_FILTER_TABS = ["claimed", "in_progress"] as const;

export type SalesAdminFilterTab = (typeof SALES_ADMIN_FILTER_TABS)[number];

export function isSalesAdminFilterTab(tab: string): tab is SalesAdminFilterTab {
  return (SALES_ADMIN_FILTER_TABS as readonly string[]).includes(tab);
}

export function isSalesOwnedTab(tab: string): tab is SalesOwnedTab {
  return (SALES_OWNED_TABS as readonly string[]).includes(tab);
}

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
