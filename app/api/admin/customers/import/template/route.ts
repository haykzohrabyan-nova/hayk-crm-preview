import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  buildCustomerImportTemplate,
  loadCustomerImportLookupsReference,
} from "@/lib/utils/bulk-import-customers";

export const runtime = "nodejs";

// GET /api/admin/customers/import/template — sample JSON with live _lookups reference

export async function GET() {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();

  try {
    const [template, lookups] = await Promise.all([
      buildCustomerImportTemplate(admin),
      loadCustomerImportLookupsReference(admin),
    ]);

    return NextResponse.json({ template, lookups });
  } catch (err) {
    console.error("[admin/customers/import/template]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to build template." },
      { status: 500 },
    );
  }
}
