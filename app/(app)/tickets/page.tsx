import { FileText } from "lucide-react";
import {
  SpecPreviewPage,
  SpecSection,
  SpecCard,
  SpecNote,
} from "@/components/ui/spec-preview";

export default function TicketsPage() {
  return (
    <SpecPreviewPage
      icon={FileText}
      title="Tickets"
      subtitle="Quotes sent to clients and confirmed production orders — all in one place."
    >
      {/* Overview */}
      <SpecSection title="What this page will do">
        <SpecNote>
          The Tickets module tracks every quote and order from creation to completion.
          When a Sales rep finalises a quote it appears here. Once the client confirms,
          it converts to an Order and can be printed as a PDF for production.
        </SpecNote>
      </SpecSection>

      {/* Tabs */}
      <SpecSection title="Two tabs">
        <SpecCard
          title="Tab 1 — Quoted Requests"
          items={[
            { label: "Data source", value: "Formal quote tickets (ticket_kind = 'quote') + leads quoted verbally/by SMS with no ticket yet" },
            { label: "Columns", value: "Contact · Type pill (Ticket vs Lead Quote) · Channel (SMS / WhatsApp / Email / In-person) · Quote Total · Status · Follow-up date · Created" },
            { label: "Actions", value: "View button — opens the Order Drawer in read mode" },
            { label: "Filters", value: "Search by name / company / email · Period filter (Today / This Week / This Month / This Quarter / All Time / Custom)" },
          ]}
        />
        <SpecCard
          title="Tab 2 — Orders"
          items={[
            { label: "Data source", value: "Confirmed production orders (ticket_kind = 'order')" },
            { label: "Columns", value: "Order # (last 8 chars of UUID) · Contact · Total · Status · Rush badge · Created By · Created" },
            { label: "Actions", value: "View button + Print PDF button" },
            { label: "PDF", value: "One-page client-side PDF via jspdf — includes company header, order #, contact info, line items table, pricing summary, rush flag, notes" },
          ]}
        />
      </SpecSection>

      {/* Order Drawer */}
      <SpecSection title="Order Drawer (Ticket Builder)">
        <SpecNote>
          A slide-in drawer used for both creating and editing quotes/orders.
          It can be opened from the Tickets page, from a lead drawer, or from a CRM customer profile.
        </SpecNote>
        <SpecCard
          title="Details tab — per line item"
          items={[
            { label: "Description", value: "What is being printed" },
            { label: "Quantity", value: "Number" },
            { label: "Size", value: 'e.g. "4×6 inches"' },
            { label: "Material", value: "Dropdown from Admin-managed product catalog" },
            { label: "Finish", value: "Matte / Glossy / Uncoated" },
            { label: "Unit Price", value: "Currency input" },
            { label: "Line Total", value: "Auto-computed: qty × unit price" },
          ]}
        />
        <SpecCard
          title="Details tab — pricing summary"
          items={[
            { label: "Subtotal", value: "Sum of all line totals" },
            { label: "Discount", value: "% or fixed amount (whichever is entered last wins)" },
            { label: "Total", value: "Subtotal − discount" },
            { label: "Payment Type", value: "Cash / Check / Card / Transfer" },
            { label: "Prepay Amount", value: "Deposit collected upfront" },
            { label: "Rush", value: "Toggle — adds Rush badge to the order" },
            { label: "Notes", value: "Internal notes" },
          ]}
        />
        <SpecCard
          title="Follow-up tab"
          items={[
            { label: "Follow-up Date", value: "Date picker" },
            { label: "Completed", value: "Toggle to mark follow-up done" },
            { label: "Nudge client", value: 'Logs a "quote_approval_last_requested" activity and records the timestamp' },
            { label: "Client Confirmed", value: "Toggle — converts quote to confirmed/order state" },
          ]}
        />
        <SpecCard
          title="History tab"
          items={[
            { label: "Content", value: "Full activity timeline for this specific ticket" },
          ]}
        />
      </SpecSection>

      {/* Period filter */}
      <SpecSection title="Period filter (shared with Statistics)">
        <SpecCard
          items={[
            { label: "Options", value: "Today · This Week · This Month · This Quarter · All Time · Custom Range" },
            { label: "Shared state", value: "PeriodFilterContext — both Tickets and Statistics read the same context so the date range stays in sync across pages" },
            { label: "Applied to", value: "leads.created_at for leads, job_tickets.created_at for tickets" },
          ]}
        />
      </SpecSection>

      {/* DB */}
      <SpecSection title="Database">
        <SpecNote>
          The <strong>job_tickets</strong> table already exists in the schema (migration 007). No database changes are needed — only the UI needs to be built.
        </SpecNote>
      </SpecSection>
    </SpecPreviewPage>
  );
}
