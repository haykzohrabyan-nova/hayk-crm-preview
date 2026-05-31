export function canViewRefundEvidence(roleName: string | null | undefined): boolean {
  return roleName === "accountant" || roleName === "admin";
}
