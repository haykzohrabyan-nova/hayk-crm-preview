/** SDR scoped tabs (On Hold, Follow Up Later, Rejected, …) — visibility by `sdr_id`. */

export type LeadSdrScopeRow = {
  sdr_id: string | null;
  locked_by_id: string | null;
};

/** Error message when an SDR may not act on this lead; null if allowed (admin always allowed). */
export function sdrScopedLeadActionError(
  lead: LeadSdrScopeRow,
  userId: string,
  roleName: string,
): string | null {
  if (roleName === "admin") return null;
  if (roleName !== "sdr") return null;

  if (lead.locked_by_id && lead.locked_by_id !== userId) {
    return "This lead is assigned to another SDR.";
  }
  if (lead.sdr_id && lead.sdr_id !== userId) {
    return "You can only work leads assigned to you.";
  }
  return null;
}

/** Fields to set when an SDR defers a lead (hold / follow-up) so it appears on their scoped tabs. */
export function sdrScopedLeadAttribution(
  roleName: string,
  userId: string,
): { sdr_id?: string } {
  return roleName === "sdr" ? { sdr_id: userId } : {};
}
