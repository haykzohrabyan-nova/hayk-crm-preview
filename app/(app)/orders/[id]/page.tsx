import { Suspense } from "react";
import QuoteDetail from "@/components/quote-detail";

export const metadata = { title: "Order — BazaarPrinting CRM" };

type Props = { params: Promise<{ id: string }> };

export default async function OrderDetailPage({ params }: Props) {
  const { id } = await params;
  return (
    <Suspense>
      <QuoteDetail ticketId={id} />
    </Suspense>
  );
}
