// GET /api/v1/catalog/products — full catalog list for UI consumption.

import { NextResponse } from "next/server";
import { catalogState, getAllProducts, getCategoriesWithCounts } from "@/lib/catalog/catalog";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    schemaVersion: catalogState.schemaVersion,
    lastSyncedAt: catalogState.lastSyncedAt,
    productCount: catalogState.byId.size,
    categories: getCategoriesWithCounts(),
    products: getAllProducts(),
  });
}
