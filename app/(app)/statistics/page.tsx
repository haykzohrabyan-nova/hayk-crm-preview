import { BarChart3 } from "lucide-react";
import {
  SpecPreviewPage,
  SpecSection,
  SpecCard,
  SpecNote,
} from "@/components/ui/spec-preview";

export default function StatisticsPage() {
  return (
    <SpecPreviewPage
      icon={BarChart3}
      title="Statistics"
      subtitle="Role-scoped KPI cards and charts — each role sees their own performance data."
    >
      {/* Overview */}
      <SpecSection title="What this page will do">
        <SpecNote>
          Statistics gives SDRs, Sales reps, and Admins a data-driven view of their activity.
          All charts and KPI tables are scoped to the selected period and the logged-in user's role.
          The period selector is shared with the Tickets page via PeriodFilterContext.
        </SpecNote>
      </SpecSection>

      {/* Period filter */}
      <SpecSection title="Period filter (shared with Tickets)">
        <SpecCard
          items={[
            { label: "Options", value: "Today · This Week · This Month · This Quarter · All Time · Custom Range" },
            { label: "Applied to leads", value: "leads.created_at" },
            { label: "Applied to tickets", value: "job_tickets.created_at" },
          ]}
        />
      </SpecSection>

      {/* SDR view */}
      <SpecSection title="SDR view — KPI cards">
        <SpecCard
          items={[
            { label: "Leads Handled", value: "Count of workspace leads created/verified by this SDR in the period" },
            { label: "Leads Verified", value: "Count with status IN ('Validated', 'Quoted', 'Routed to Sales')" },
            { label: "Leads Routed", value: "Count with status = 'Routed to Sales'" },
            { label: "Leads Rejected", value: "Count with status = 'Rejected'" },
            { label: "Total Quote Value", value: "Sum of quote_total for all quoted/routed leads" },
            { label: "My Handled Share %", value: "This SDR's verified leads ÷ all SDRs' verified leads × 100" },
          ]}
        />
        <SpecCard
          title="SDR charts"
          items={[
            { label: "Leads Over Time", value: "Line chart — count of new leads per day/week in the period" },
            { label: "Status Mix", value: "Donut chart — breakdown of leads by status" },
            { label: "Sources", value: "Horizontal bar chart — leads by source (Manual / Website / Walk-in / etc.)" },
            { label: "Quote Value Over Time", value: "Bar chart — sum of quote_total per period bucket" },
          ]}
        />
      </SpecSection>

      {/* Sales view */}
      <SpecSection title="Sales view — KPI cards">
        <SpecCard
          items={[
            { label: "Leads in Pipeline", value: "Count with sales_status IN ('Ongoing', 'Quote Sent') owned by this user" },
            { label: "Leads Won", value: "Count with sales_status = 'Won' in the period" },
            { label: "Leads Dropped", value: "Count with sales_status = 'Dropped' in the period" },
            { label: "Pipeline Value", value: "Sum of quote_total for active pipeline leads" },
            { label: "Won Value", value: "Sum of total on job_tickets where ticket_status = 'approved' in the period" },
            { label: "Orders Created", value: "Count of job_tickets with ticket_kind = 'order' in the period" },
          ]}
        />
        <SpecCard
          title="Sales charts"
          items={[
            { label: "Pipeline Over Time", value: "Leads entering 'Routed to Sales' per period bucket" },
            { label: "Won vs Dropped", value: "Grouped bar chart per period bucket" },
            { label: "Revenue Over Time", value: "Bar chart — sum of ticket total per bucket" },
            { label: "Sales Status Mix", value: "Donut — breakdown of current leads by sales_status" },
          ]}
        />
      </SpecSection>

      {/* Admin view */}
      <SpecSection title="Admin view — KPI cards">
        <SpecCard
          items={[
            { label: "Total Leads", value: "Count of all leads in the period" },
            { label: "Inbox Leads", value: "Count of is_inbox = true leads" },
            { label: "Routed to Sales", value: "Count with status = 'Routed to Sales'" },
            { label: "Leads Won", value: "Count with sales_status = 'Won'" },
            { label: "Total Revenue", value: "Sum of ticket total where ticket_status IN ('approved', 'completed')" },
            { label: "Pipeline Value", value: "Sum of quote_total for active leads" },
            { label: "Active SDRs", value: "Count of SDR users with at least 1 lead in the period" },
            { label: "Active Sales", value: "Count of Sales users with at least 1 owned lead in the period" },
          ]}
        />
        <SpecCard
          title="Admin-only extras"
          items={[
            { label: "All SDR + Sales charts", value: "Aggregated across all users (same charts as above but team-wide)" },
            { label: "SDR Performance Table", value: "Per-SDR row: name · leads handled · routed · rejected · quote value · handled share %" },
            { label: "Rejection Reasons", value: "Pie chart — breakdown of rejection_reason values" },
          ]}
        />
      </SpecSection>

      {/* Chart library */}
      <SpecSection title="Technical notes">
        <SpecCard
          items={[
            { label: "Chart library", value: "Recharts (recharts package)" },
            { label: "Colors", value: "Primary: var(--color-accent) · Secondary: var(--color-tab-active) · Grid: var(--color-border)" },
            { label: "Loading state", value: "Skeleton placeholders for each KPI card and chart — no stale data shown during refetch" },
            { label: "Empty state", value: '"No data for this period." shown per chart when no records exist' },
          ]}
        />
      </SpecSection>
    </SpecPreviewPage>
  );
}
