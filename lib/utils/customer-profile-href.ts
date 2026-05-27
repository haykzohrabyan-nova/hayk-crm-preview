import { safeReturnPath } from "@/lib/auth/safe-return-path";
import { appendReturnPath } from "@/lib/utils/ticket-detail-href";

export function customerProfileHref(
  customerId: string,
  returnPath: string | null | undefined,
): string {
  return appendReturnPath(`/crm/customers/${customerId}`, returnPath);
}

export function resolveCustomerProfileBack(from: string | null | undefined): {
  href: string;
  label: string;
} {
  const safe = safeReturnPath(from);
  if (safe?.startsWith("/leads")) {
    return { href: safe, label: "Back to Leads" };
  }
  if (safe === "/reports" || safe?.startsWith("/reports?")) {
    return { href: safe, label: "Back to Reports" };
  }
  return { href: "/crm", label: "Back to CRM" };
}
