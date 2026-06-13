import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  commitBulkOrderImport,
  parseBulkOrderImportFile,
  validateBulkOrderImport,
} from "@/lib/utils/bulk-import-orders";

export const runtime = "nodejs";

// POST /api/admin/orders/import?dry_run=true — validate only (no DB writes)
// POST /api/admin/orders/import — import valid rows

export async function POST(request: NextRequest) {
  const { userId, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const dryRun = request.nextUrl.searchParams.get("dry_run") === "true";

  let raw: unknown;
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData().catch(() => null);
    const file = formData?.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "file is required.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    try {
      raw = JSON.parse(await file.text());
    } catch {
      return NextResponse.json({ error: "Invalid JSON file.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
  } else {
    raw = await request.json().catch(() => null);
    if (raw == null) {
      return NextResponse.json({ error: "Request body must be JSON.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
  }

  const parsed = parseBulkOrderImportFile(raw);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error, code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    if (dryRun) {
      const summary = await validateBulkOrderImport(admin, parsed.file);
      return NextResponse.json({ dry_run: true, ...summary });
    }

    const summary = await commitBulkOrderImport(admin, parsed.file, userId!);
    return NextResponse.json({ dry_run: false, ...summary });
  } catch (err) {
    console.error("[admin/orders/import]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed.", code: "SERVER_ERROR" },
      { status: 500 },
    );
  }
}
