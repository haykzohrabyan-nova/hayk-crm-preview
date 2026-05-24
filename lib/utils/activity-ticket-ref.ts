function uuidSuffix(id: string): string {
  return id.replace(/-/g, "").slice(-8).toUpperCase();
}

/** QUO/ORD code, ticket UUID suffix, or lead UUID suffix for activity log rows. */
export function activityDisplayRef(
  activity: {
    ticket_id?: string | null;
    lead_id?: string | null;
    payload?: unknown;
  },
  ticket?: { id?: string; reference_code?: string | null } | null,
): string | null {
  const payload =
    activity.payload && typeof activity.payload === "object" && !Array.isArray(activity.payload)
      ? (activity.payload as Record<string, unknown>)
      : null;

  const fromPayload = payload?.reference_code;
  if (typeof fromPayload === "string" && fromPayload.trim()) {
    return fromPayload.trim();
  }

  const ref = ticket?.reference_code?.trim();
  if (ref) return ref;

  const ticketId = activity.ticket_id ?? ticket?.id;
  if (ticketId) return uuidSuffix(ticketId);

  if (activity.lead_id) return uuidSuffix(activity.lead_id);

  return null;
}

/** @deprecated Use activityDisplayRef */
export function activityTicketDisplayRef(
  activity: { ticket_id?: string | null; payload?: unknown },
  ticket?: { id?: string; reference_code?: string | null } | null,
): string | null {
  return activityDisplayRef(activity, ticket);
}
