// Hayk 2026-07-12 — Leads preview ROUTE (server component).
// Page #2 of the "kill the mock, show real data" pass. Reads the SHARED local
// Postgres via _data.ts and renders real leads (the top of the funnel that feeds
// the connected orders). READ-ONLY. The big client UI lives in _client.tsx.

import { loadLeads } from "./_data";
import LeadsClient from "./_client";

export const dynamic = "force-dynamic";

export default async function LeadsPreviewPage() {
  const leads = await loadLeads();
  return <LeadsClient leads={leads} />;
}
