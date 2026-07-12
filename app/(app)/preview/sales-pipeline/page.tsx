// Hayk 2026-07-12 — Sales Pipeline = the UNIFIED leads + deals board.
// Merged per Hayk: one board, first touch → paid. Reads the SAME real data as
// the Leads page and renders the same client. The old mock lives in
// _legacy-mock.tsx.bak. READ-ONLY server component.

import { loadLeads } from "../leads/_data";
import LeadsClient from "../leads/_client";

export const dynamic = "force-dynamic";

export default async function SalesPipelinePage() {
  const leads = await loadLeads();
  return <LeadsClient leads={leads} />;
}
