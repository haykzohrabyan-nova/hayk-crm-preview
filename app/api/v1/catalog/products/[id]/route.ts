// GET /api/v1/catalog/products/:id — single product detail for UI.

import { NextRequest, NextResponse } from "next/server";
import { getProduct } from "@/lib/catalog/catalog";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  const p = getProduct(numId);
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(p);
}
