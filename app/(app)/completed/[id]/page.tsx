import { Suspense } from "react";
import QuoteDetail from "@/components/quotes/quote-detail";

export const metadata = { title: "Completed Order — BazaarPrinting CRM" };

type Props = { params: Promise<{ id: string }> };

export default async function CompletedDetailPage({ params }: Props) {
  const { id } = await params;
  return (
    <Suspense>
      <QuoteDetail ticketId={id} context="completed" />
    </Suspense>
  );
}
