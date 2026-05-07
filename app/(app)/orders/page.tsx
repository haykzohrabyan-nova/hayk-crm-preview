import { ClipboardList } from "lucide-react";
import {
  SpecPreviewPage,
  SpecSection,
  SpecCard,
  SpecNote,
} from "@/components/ui/spec-preview";

export default function OrdersPage() {
  return (
    <SpecPreviewPage
      icon={ClipboardList}
      title="Orders"
      subtitle="Confirmed production orders — from client approval to print-ready PDF."
    >
      <SpecSection title="What this page will do">
        <SpecNote>
          The Orders page shows all confirmed production orders. An order is created when
          a quote is approved by the client (or directly by Sales). From here, the team
          can view order details, track status, and print the order ticket PDF for production.
        </SpecNote>
      </SpecSection>

      <SpecSection title="Table columns">
        <SpecCard
          items={[
            { label: "Order #", value: "Short ID — last 8 characters of the UUID, e.g. #a3f9b12c" },
            { label: "Contact", value: "Name + company" },
            { label: "Total", value: "Formatted currency" },
            { label: "Status", value: "Status pill — Draft · Sent · Approved · In Production · Completed · Cancelled" },
            { label: "Rush", value: "Rush badge shown if rush = true" },
            { label: "Created By", value: "Sales rep name" },
            { label: "Created", value: "Relative time" },
            { label: "Actions", value: "View button + Print PDF button" },
          ]}
        />
      </SpecSection>

      <SpecSection title="Filters">
        <SpecCard
          items={[
            { label: "Search", value: "Filter by contact name, order #, or company" },
            { label: "Period filter", value: "Today · This Week · This Month · This Quarter · All Time · Custom — shared with Quotes and Statistics" },
          ]}
        />
      </SpecSection>

      <SpecSection title="Order Drawer">
        <SpecNote>
          Opens when clicking View. Shows the full order in read-only mode with an Edit button.
          Same drawer as the Quote Builder but in order mode.
        </SpecNote>
        <SpecCard
          title="Details tab — line items"
          items={[
            { label: "Description", value: "What is being printed" },
            { label: "Quantity", value: "Number of units" },
            { label: "Size", value: 'e.g. "4×6 inches"' },
            { label: "Material", value: "From Admin-managed product catalog (vinyl, paper, cardstock, etc.)" },
            { label: "Finish", value: "Matte · Glossy · Uncoated · Satin" },
            { label: "Unit Price", value: "Currency" },
            { label: "Line Total", value: "Auto-computed: qty × unit price" },
          ]}
        />
        <SpecCard
          title="Details tab — pricing summary"
          items={[
            { label: "Subtotal", value: "Sum of all line totals" },
            { label: "Discount", value: "% or fixed amount" },
            { label: "Total", value: "Subtotal − discount" },
            { label: "Payment Type", value: "Cash · Check · Card · Transfer" },
            { label: "Prepay Amount", value: "Deposit collected upfront" },
            { label: "Rush", value: "Toggle — adds Rush badge and flags for production priority" },
            { label: "Notes", value: "Internal production notes" },
          ]}
        />
        <SpecCard
          title="History tab"
          items={[
            { label: "Content", value: "Full activity timeline for this order — creation, edits, status changes" },
          ]}
        />
        <SpecCard
          title="Footer actions"
          items={[
            { label: "Edit", value: "Enables editing of the order" },
            { label: "Save Changes", value: "PATCH /api/tickets/[id]" },
            { label: "Print PDF", value: "Generates one-page order ticket PDF client-side via jspdf — opens in new tab or downloads" },
            { label: "Mark Won", value: "Sets ticket_status = 'approved'" },
            { label: "Cancel Ticket", value: "Sets ticket_status = 'cancelled'" },
          ]}
        />
      </SpecSection>

      <SpecSection title="PDF export">
        <SpecCard
          items={[
            { label: "Library", value: "jspdf — client-side, no server needed" },
            { label: "Content", value: "Company header (BAZAARPRINTING) · Order # and date · Contact info · Line items table · Pricing summary · Rush flag · Notes" },
            { label: "Trigger", value: "Print PDF button in table row or Order Drawer footer" },
            { label: "Output", value: "Opens in new browser tab or triggers download" },
            { label: "Dependency", value: "Company Info admin tab must be filled in first (name, address, logo)" },
          ]}
        />
      </SpecSection>

      <SpecSection title="API">
        <SpecCard
          items={[
            { label: "List orders", value: "GET /api/tickets?kind=order" },
            { label: "Create order", value: "POST /api/tickets with ticket_kind = 'order'" },
            { label: "Update order", value: "PATCH /api/tickets/[id]" },
          ]}
        />
      </SpecSection>
    </SpecPreviewPage>
  );
}
