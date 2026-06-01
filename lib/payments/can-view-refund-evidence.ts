import { isPaymentStaffRole } from "@/lib/auth/role-checks";

export function canViewRefundEvidence(roleName: string | null | undefined): boolean {
  return isPaymentStaffRole(roleName);
}
