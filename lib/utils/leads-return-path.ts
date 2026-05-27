/** Leads workspace tab ids (matches `components/leads/leads-page.tsx`). */
export type LeadsTabParam = "all" | "hold" | "routed" | "rejected" | "won";

const TAB_ALIASES: Record<string, LeadsTabParam> = {
  all: "all",
  hold: "hold",
  "on-hold": "hold",
  routed: "routed",
  directed: "routed",
  rejected: "rejected",
  won: "won",
};

export function parseLeadsTabParam(param: string | null | undefined): LeadsTabParam | null {
  if (!param) return null;
  return TAB_ALIASES[param] ?? null;
}

/** Return path for customer profile Back navigation from the Leads page. */
export function leadsReturnPath(tab: LeadsTabParam): string {
  if (tab === "all") return "/leads";
  return `/leads?tab=${encodeURIComponent(tab)}`;
}
