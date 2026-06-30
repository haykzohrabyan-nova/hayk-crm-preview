import type { SupabaseClient } from "@supabase/supabase-js";

export type KeyAccountSalesRep = {
  id: string;
  full_name: string | null;
};

/** Active sales user assigned as the customer's Key Account rep, or null. */
export async function resolveActiveKeyAccountSalesRep(
  admin: SupabaseClient,
  customerId: string,
): Promise<KeyAccountSalesRep | null> {
  const { data: customer, error: customerErr } = await admin
    .from("customers")
    .select("key_account_sales_rep_id")
    .eq("id", customerId)
    .maybeSingle();

  if (customerErr || !customer?.key_account_sales_rep_id) return null;

  const { data: rep, error: repErr } = await admin
    .from("user_profiles_with_role")
    .select("id, full_name")
    .eq("id", customer.key_account_sales_rep_id)
    .eq("role_name", "sales")
    .eq("is_active", true)
    .maybeSingle();

  if (repErr || !rep) return null;

  return { id: rep.id, full_name: rep.full_name };
}

/** Key Account rep on file (may be inactive) — for customer profile display. */
export async function fetchKeyAccountRepForDisplay(
  admin: SupabaseClient,
  keyAccountSalesRepId: string | null | undefined,
): Promise<(KeyAccountSalesRep & { is_active: boolean }) | null> {
  if (!keyAccountSalesRepId) return null;

  const { data: rep, error } = await admin
    .from("user_profiles_with_role")
    .select("id, full_name, is_active, role_name")
    .eq("id", keyAccountSalesRepId)
    .maybeSingle();

  if (error || !rep || rep.role_name !== "sales") return null;

  return {
    id: rep.id,
    full_name: rep.full_name,
    is_active: rep.is_active === true,
  };
}
