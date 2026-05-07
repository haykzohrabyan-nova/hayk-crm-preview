import type { Metadata } from "next";
import { DashboardPage } from "@/components/dashboard-page";

export const metadata: Metadata = {
  title: "Dashboard — BazaarPrinting CRM",
};

export default function DashboardPageRoute() {
  return <DashboardPage />;
}
