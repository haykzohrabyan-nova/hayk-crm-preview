import { Suspense } from "react";
import QuoteDetail from "@/components/quotes/quote-detail";

export const metadata = { title: "In Production — BazaarPrinting CRM" };

type Props = { params: Promise<{ id: string }> };

export default async function ProductionDetailPage({ params }: Props) {
  const { id } = await params;
  return (
    <Suspense>
      <QuoteDetail ticketId={id} context="production" />
    </Suspense>
  );
}
