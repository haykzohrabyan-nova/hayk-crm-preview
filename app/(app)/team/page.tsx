import type { Metadata } from "next";
import { TeamDashboard } from "@/components/team/team-dashboard";

export const metadata: Metadata = {
  title: "Team Dashboard — BazaarPrinting CRM",
};

export default function TeamDashboardPageRoute() {
  return <TeamDashboard />;
}
