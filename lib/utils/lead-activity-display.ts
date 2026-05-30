import type { Activity } from "@/lib/types";
import { holdReasonLabel } from "@/lib/constants/hold-reasons";
import { followUpReasonLabel } from "@/lib/constants/follow-up-reasons";

/** Human-readable timeline label for lead-scoped activities (SDR + Sales drawers). */
export function leadActivityLabel(a: Activity): string {
  const p = a.payload as Record<string, string | null>;
  switch (a.type) {
    case "lead_verified":
      return "Lead verified by SDR";
    case "lead_manual_created":
      return "Lead created manually";
    case "lead_edited":
      return "Lead info updated";
    case "lead_claimed":
      return "Lead claimed by SDR";
    case "lead_sales_claimed":
      return "Lead claimed by sales rep";
    case "lead_routed_to_sales":
      return "Routed to Sales";
    case "lead_held":
      return `Put on hold${p.reason ? ` — ${holdReasonLabel(p.reason)}` : ""}`;
    case "lead_follow_up_later":
      return `Follow up later${p.reason ? ` — ${followUpReasonLabel(p.reason)}` : ""}`;
    case "lead_resumed": {
      if (p.from === "Follow Up Later") return "Resumed from Follow Up Later";
      if (p.from === "On Hold") return "Resumed from On Hold";
      return "Resumed";
    }
    case "lead_merged":
      return "Customer record merged";
    case "contact_edited":
      return "Contact info updated";
    case "lead_reassigned":
      return "Lead reassigned";
    case "lead_rejected": {
      const from = p.from === "Routed to Sales" ? "Sales pipeline" : "SDR pipeline";
      return `Rejected from ${from}${p.reason ? ` — ${p.reason}` : ""}`;
    }
    case "lead_status_changed":
      return `Status: ${p.from ?? "?"} → ${p.to ?? "?"}`;
    default:
      return a.type.replace(/_/g, " ");
  }
}

export function leadActivityDotColor(type: Activity["type"]): string {
  if (type === "lead_rejected") return "var(--color-danger)";
  if (type === "lead_held" || type === "lead_follow_up_later") return "var(--color-warning)";
  if (type === "lead_routed_to_sales" || type === "lead_sales_claimed" || type === "lead_claimed") {
    return "var(--color-accent)";
  }
  if (type === "lead_verified" || type === "lead_resumed") return "var(--color-success)";
  return "var(--color-text-muted)";
}

/** Extra lines under the activity title (notes, scheduled date, etc.). */
export function leadActivityDetailLines(a: Activity): string[] {
  const p = a.payload as Record<string, string | null>;
  const lines: string[] = [];
  if (p.notes?.trim()) lines.push(p.notes.trim());
  if ((a.type === "lead_held" || a.type === "lead_follow_up_later") && p.until) {
    const label = a.type === "lead_follow_up_later" ? "Follow up on" : "Hold until";
    try {
      lines.push(`${label}: ${new Date(p.until).toLocaleDateString()}`);
    } catch {
      lines.push(`${label}: ${p.until}`);
    }
  }
  return lines;
}
