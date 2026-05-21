import { Suspense } from "react";
import NewQuoteForm from "@/components/quotes/new-quote-form";

export const metadata = { title: "New Quote — BazaarPrinting CRM" };

export default function NewQuotePage() {
  return (
    <Suspense>
      <NewQuoteForm />
    </Suspense>
  );
}
