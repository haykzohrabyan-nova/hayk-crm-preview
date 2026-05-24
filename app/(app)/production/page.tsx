import { redirect } from "next/navigation";

export const metadata = { title: "Orders — BazaarPrinting CRM" };

export default function ProductionRedirectPage() {
  redirect("/orders?tab=in_production");
}
