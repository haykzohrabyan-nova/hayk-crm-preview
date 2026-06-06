import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  buildBulkImportTemplate,
  loadBulkImportLookupsReference,
} from "@/lib/utils/bulk-import-leads";

export const runtime = "nodejs";

// GET /api/admin/leads/import/template — sample JSON with live _lookups reference

export async function GET() {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();

  try {
    const [template, lookups] = await Promise.all([
      buildBulkImportTemplate(admin),
      loadBulkImportLookupsReference(admin),
    ]);

    return NextResponse.json({ template, lookups });
  } catch (err) {
    console.error("[admin/leads/import/template]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to build template." },
      { status: 500 },
    );
  }
}
