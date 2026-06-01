/** System admin role — unrestricted page and ticket access. */
export function isAdminRole(roleName: string | null | undefined): boolean {
  return roleName === "admin";
}

/** Admin or accountant — payment review, refunds, evidence. */
export function isPaymentStaffRole(roleName: string | null | undefined): boolean {
  return roleName === "admin" || roleName === "accountant";
}
