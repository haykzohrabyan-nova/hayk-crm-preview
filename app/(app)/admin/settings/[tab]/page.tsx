import { notFound, redirect } from "next/navigation";
import { UsersSection } from "@/components/admin/users-section";
import { RolesSection } from "@/components/admin/roles-section";
import {
  SpecSection,
  SpecCard,
  SpecNote,
  SpecBadge,
} from "@/components/ui/spec-preview";

// ─── Supported tabs ───────────────────────────────────────────────────────────

const SUPPORTED_TABS = [
  "users",
  "roles",
  "dropdowns",
  "notifications",
  "audit-log",
  "company",
  "products",
] as const;
type AdminTab = (typeof SUPPORTED_TABS)[number];

function isValidTab(tab: string): tab is AdminTab {
  return (SUPPORTED_TABS as readonly string[]).includes(tab);
}

// ─── Spec section wrapper (reused for unbuilt tabs) ───────────────────────────

function TabSpecWrapper({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-8 max-w-3xl">
      <div className="flex items-center gap-2.5">
        <h2 className="text-[18px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
          {title}
        </h2>
        <SpecBadge label="Planned — not yet built" />
      </div>
      <div className="border-t" style={{ borderColor: "var(--color-border)" }} />
      {children}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function AdminSettingsTabPage({
  params,
}: {
  params: Promise<{ tab: string }>;
}) {
  const { tab } = await params;

  if (!isValidTab(tab)) notFound();

  switch (tab) {
    case "users":
      return <UsersSection />;

    case "roles":
      return <RolesSection />;

    case "dropdowns":
      return (
        <TabSpecWrapper title="Dropdown Options">
          <SpecSection title="What this will do">
            <SpecNote>
              Admin-managed lists for every dropdown field used in lead forms.
              Reads from and writes to the <strong>lookup_values</strong> table.
              Changes take effect immediately — no code deploy needed.
            </SpecNote>
          </SpecSection>
          <SpecSection title="Categories">
            <SpecCard
              items={[
                { label: "Lead Sources", value: "Manual · Website · Google · Walk-in · Referral · etc. — used in Add Lead, Verify Drawer, Sales Drawer" },
                { label: "Industries", value: "Printing, Signage, Apparel, etc. — used in Add Lead, Verify Drawer, CRM" },
                { label: "Urgency Levels", value: "Not Defined · High · Medium · Low — used in Add Lead, Verify Drawer" },
                { label: "Hold Reasons (SDR)", value: "Awaiting customer response · Awaiting artwork / files · etc." },
                { label: "Hold Reasons (Sales)", value: "Waiting for client decision · Budget not confirmed · Seasonal / timing · Other" },
                { label: "Reject Reasons", value: "Not a fit · No budget · Competitor · Spam/Bot · Other" },
                { label: "Route Reasons", value: "Reason shown when SDR routes to Sales" },
                { label: "Drop Reasons", value: "Reason shown when Sales drops a deal" },
              ]}
            />
          </SpecSection>
          <SpecSection title="Options table (right panel)">
            <SpecCard
              items={[
                { label: "Label", value: "Editable inline — what the user sees in dropdowns" },
                { label: "Value (slug)", value: "Auto-generated from label on creation (e.g. 'TikTok Ads' → tiktok_ads) — cannot be changed after creation since historical leads store the value" },
                { label: "Sort Order", value: "Drag-to-reorder or numeric input — reflected immediately in all dropdowns" },
                { label: "Active toggle", value: "Inactive options are hidden from new lead forms; existing leads keep their saved value" },
                { label: "Delete", value: "Only allowed if no leads use this value — otherwise deactivate only" },
              ]}
            />
          </SpecSection>
          <SpecSection title="API">
            <SpecCard
              items={[
                { label: "Load", value: "GET /api/admin/lookups" },
                { label: "Add", value: "POST /api/admin/lookups" },
                { label: "Edit label / sort / active", value: "PATCH /api/admin/lookups/[id]" },
              ]}
            />
          </SpecSection>
        </TabSpecWrapper>
      );

    case "notifications":
      redirect("/notifications");

    case "audit-log":
      return (
        <TabSpecWrapper title="Audit Log">
          <SpecSection title="What this will do">
            <SpecNote>
              Full history of every action taken in the system — lead changes, user management, settings edits.
              Read-only for all users including Admin.
            </SpecNote>
          </SpecSection>
          <SpecSection title="Audit table">
            <SpecCard
              items={[
                { label: "Actor", value: "User full name + role badge" },
                { label: "Action", value: "Human-readable description derived from activity type" },
                { label: "Entity", value: "Customer name / Lead ID (from payload)" },
                { label: "Timestamp", value: "Full datetime" },
                { label: "Details", value: "Expandable payload preview (JSON diff of changed fields)" },
              ]}
            />
          </SpecSection>
          <SpecSection title="Filters">
            <SpecCard
              items={[
                { label: "Search", value: "By actor name" },
                { label: "Type filter", value: "By activity type (lead_verified, contact_edited, etc.)" },
                { label: "Date range", value: "From / To date picker" },
              ]}
            />
          </SpecSection>
          <SpecSection title="Pagination">
            <SpecCard
              items={[
                { label: "Page size", value: "50 rows per page" },
                { label: "Load more", value: "'Load more' button fetches next 50 — total count shown in header" },
                { label: "API", value: "GET /api/admin/audit" },
              ]}
            />
          </SpecSection>
        </TabSpecWrapper>
      );

    case "company":
      return (
        <TabSpecWrapper title="Company Info">
          <SpecSection title="What this will do">
            <SpecNote>
              Company details used in PDF headers for order tickets and quotes.
              Stored in a single config row — not tied to individual users.
            </SpecNote>
          </SpecSection>
          <SpecSection title="Fields">
            <SpecCard
              items={[
                { label: "Company Name", value: "Shown at the top of every PDF — e.g. BAZAARPRINTING" },
                { label: "Address", value: "Street, city, state, zip — shown on PDF and quotes" },
                { label: "Phone", value: "Contact number shown on PDF" },
                { label: "Email", value: "Reply-to address for outreach emails" },
                { label: "Logo", value: "Image upload — displayed in PDF header and potentially the topbar" },
                { label: "Website", value: "Optional URL shown on quotes" },
              ]}
            />
          </SpecSection>
          <SpecSection title="Notes">
            <SpecNote>
              Needed before the PDF export in the Tickets phase can be built.
              Build this tab alongside or just before the Tickets phase.
            </SpecNote>
          </SpecSection>
        </TabSpecWrapper>
      );

    case "products":
      return (
        <TabSpecWrapper title="Products">
          <SpecSection title="What this will do">
            <SpecNote>
              Admin-managed product catalog used in the Ticket Builder (Order Drawer).
              Defines the materials and finishes available when Sales reps create order line items.
            </SpecNote>
          </SpecSection>
          <SpecSection title="Product types">
            <SpecCard
              items={[
                { label: "Examples", value: "Labels · Boxes · Flyers · Stickers · Banners · Business Cards" },
                { label: "Fields", value: "Name · Active toggle · Sort order" },
              ]}
            />
          </SpecSection>
          <SpecSection title="Materials">
            <SpecCard
              items={[
                { label: "Examples", value: "Vinyl · Paper · Cardstock · Fabric · Foamboard" },
                { label: "Fields", value: "Name · Active toggle · Sort order" },
              ]}
            />
          </SpecSection>
          <SpecSection title="Finishes">
            <SpecCard
              items={[
                { label: "Examples", value: "Matte · Glossy · Uncoated · Satin" },
                { label: "Fields", value: "Name · Active toggle · Sort order" },
              ]}
            />
          </SpecSection>
          <SpecSection title="Notes">
            <SpecNote>
              Required before the Tickets phase Order Drawer line items can be built.
              Products, Materials, and Finishes each have their own lookup_values category
              (or a dedicated products table — to be decided during Tickets phase planning).
            </SpecNote>
          </SpecSection>
        </TabSpecWrapper>
      );
  }
}

// Static params so Next.js pre-renders all known tab routes
export function generateStaticParams() {
  return SUPPORTED_TABS.map((tab) => ({ tab }));
}
