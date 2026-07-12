// Hayk 2026-07-12 — Orders preview ROUTE (server component).
// Page #1 of the "kill the bullshit, show only real data" pass. This page now
// reads the SHARED local Postgres via _data.ts and renders the connected,
// seeded orders (passports 301–308) — no hardcoded array. READ-ONLY. Additive.
// The legacy mock lives on in _shared.ts solely for the two not-yet-migrated
// preview pages (payments, new-quote) that still import it.

import { loadOrders, loadBoardStages } from "./_data";
import OrdersClient from "./_client";

export const dynamic = "force-dynamic";

export default async function OrdersPreviewPage() {
  const [orders, boardStages] = await Promise.all([loadOrders(), loadBoardStages()]);
  return <OrdersClient orders={orders} boardStages={boardStages} />;
}
