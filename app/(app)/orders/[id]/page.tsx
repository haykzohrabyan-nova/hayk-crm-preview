import { Suspense } from "react";
import QuoteDetail from "@/components/quotes/quote-detail";

export const metadata = { title: "Order — BazaarPrinting CRM" };

type Props = { params: Promise<{ id: string }> };

export default async function OrderDetailPage({ params }: Props) {
  const { id } = await params;
  return (
    <Suspense>
      <QuoteDetail ticketId={id} context="order" />
    </Suspense>
  );
}
