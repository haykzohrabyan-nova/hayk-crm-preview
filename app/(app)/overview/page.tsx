import type { Metadata } from "next";
import { DashboardPage } from "@/components/dashboard-page";

export const metadata: Metadata = {
  title: "Overview — BazaarPrinting CRM",
};

// Admin-dedicated overview page.
// Currently renders the shared DashboardPage (which already serves admin KPIs).
// Will be replaced with a custom admin dashboard in a future iteration.
export default function OverviewPageRoute() {
  return <DashboardPage />;
}
