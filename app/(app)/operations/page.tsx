import type { Metadata } from "next";
import OperationsPage from "@/components/admin/operations-page";

export const metadata: Metadata = {
  title: "Operations — BazaarPrinting CRM",
};

export default function Page() {
  return <OperationsPage />;
}
