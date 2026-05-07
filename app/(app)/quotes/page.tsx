import { MessageSquareQuote } from "lucide-react";
import {
  SpecPreviewPage,
  SpecSection,
  SpecCard,
  SpecNote,
} from "@/components/ui/spec-preview";

export default function QuotesPage() {
  return (
    <SpecPreviewPage
      icon={MessageSquareQuote}
      title="Quoted Requests"
      subtitle="All active quotes sent to clients — formal tickets and verbal/SMS quotes in one list."
    >
      <SpecSection title="What this page will do">
        <SpecNote>
          The Quoted Requests page shows every quote that has been sent or discussed with a client.
          It combines two sources: formal quote tickets created in the system, and leads that were
          quoted verbally or by SMS/WhatsApp but don't have a formal ticket yet.
          From here, Sales reps follow up, request approval, and convert quotes to orders.
        </SpecNote>
      </SpecSection>

      <SpecSection title="Data sources">
        <SpecCard
          items={[
            { label: "Formal quotes", value: "Tickets where ticket_kind = 'quote' — created via the Quote Builder" },
            { label: "Informal quotes", value: "Leads where status = 'Quoted' but no ticket exists yet (quoted by SMS, WhatsApp, or phone)" },
            { label: "Combined", value: "Both appear in the same list, distinguished by a Type pill (Ticket vs Lead Quote)" },
          ]}
        />
      </SpecSection>

      <SpecSection title="Table columns">
        <SpecCard
          items={[
            { label: "Contact", value: "Name + company" },
            { label: "Type", value: "Pill — Ticket (formal) or Lead Quote (informal)" },
            { label: "Channel", value: "SMS · WhatsApp · Email · In-person" },
            { label: "Quote Total", value: "Formatted currency or —" },
            { label: "Status", value: "Ticket status pill or lead status pill" },
            { label: "Follow-up", value: "Date or — (highlighted red if overdue)" },
            { label: "Created", value: "Relative time" },
            { label: "Action", value: "View button — opens Quote Drawer" },
          ]}
        />
      </SpecSection>

      <SpecSection title="Filters">
        <SpecCard
          items={[
            { label: "Search", value: "Filter by contact name, company, or email" },
            { label: "Period filter", value: "Today · This Week · This Month · This Quarter · All Time · Custom — shared with Orders and Statistics" },
            { label: "Sort", value: "By date, amount, or status" },
          ]}
        />
      </SpecSection>

      <SpecSection title="Quote Drawer">
        <SpecNote>
          Opens when clicking View on any row. Two modes: Create (new quote) and View/Edit (existing quote).
        </SpecNote>
        <SpecCard
          title="Details tab"
          items={[
            { label: "Contact", value: "Pre-filled from lead or CRM — locked if opened from a lead" },
            { label: "SKUs / Line items", value: "Description · Quantity · Size · Material · Finish · Unit Price · Line Total (auto)" },
            { label: "Pricing", value: "Subtotal · Discount % or fixed · Total · Payment Type · Prepay amount · Rush toggle · Notes" },
          ]}
        />
        <SpecCard
          title="Follow-up tab"
          items={[
            { label: "Follow-up Date", value: "Date picker — triggers a follow_up_due notification when reached" },
            { label: "Completed", value: "Toggle to mark follow-up done" },
            { label: "Nudge client", value: "Logs a quote_approval_requested activity + sets last-requested timestamp" },
            { label: "Client Confirmed", value: "Toggle — marks the quote as confirmed, ready to convert to order" },
          ]}
        />
        <SpecCard
          title="History tab"
          items={[
            { label: "Content", value: "Full activity timeline for this quote — status changes, follow-ups, approvals" },
          ]}
        />
        <SpecCard
          title="Footer actions"
          items={[
            { label: "Save Draft", value: "POST /api/tickets — ticket_status = 'draft'" },
            { label: "Save & Send", value: "POST /api/tickets — ticket_status = 'sent' + logs quote_sent activity" },
            { label: "Mark Won", value: "ticket_status = 'approved', client_confirmed = true" },
            { label: "Cancel Ticket", value: "ticket_status = 'cancelled'" },
            { label: "Convert to Order", value: "Opens the Order Builder pre-filled with this quote's data" },
          ]}
        />
      </SpecSection>
    </SpecPreviewPage>
  );
}
