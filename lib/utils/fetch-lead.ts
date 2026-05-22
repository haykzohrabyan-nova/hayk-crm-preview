import type { Lead } from "@/lib/types";

/** Load full lead record for Verify / Sales drawers (interests, notes, etc.). */
export async function fetchLeadById(id: string): Promise<Lead | null> {
  const res = await fetch(`/api/leads/${id}`);
  if (!res.ok) return null;
  const data = await res.json();
  return (data.lead as Lead) ?? null;
}
