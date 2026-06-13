import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { buildOrderImportTemplate } from "@/lib/utils/bulk-import-orders";

export const runtime = "nodejs";

// GET /api/admin/orders/import/template — sample JSON for order bulk import

export async function GET() {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  try {
    const template = buildOrderImportTemplate();
    return NextResponse.json({ template });
  } catch (err) {
    console.error("[admin/orders/import/template]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to build template." },
      { status: 500 },
    );
  }
}
