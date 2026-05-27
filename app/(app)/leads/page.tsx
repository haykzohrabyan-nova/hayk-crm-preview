import { Suspense } from "react";
import { LeadsPage } from "@/components/leads/leads-page";

export default function LeadsPageRoute() {
  return (
    <Suspense>
      <LeadsPage />
    </Suspense>
  );
}
