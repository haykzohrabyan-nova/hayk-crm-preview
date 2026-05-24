import { Suspense } from "react";
import OrdersPage from "@/components/orders/orders-page";

export const metadata = { title: "Orders — BazaarPrinting CRM" };

export default function Page() {
  return (
    <Suspense>
      <OrdersPage />
    </Suspense>
  );
}
