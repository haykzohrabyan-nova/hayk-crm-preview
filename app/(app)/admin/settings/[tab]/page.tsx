import { notFound } from "next/navigation";
import { UsersSection } from "@/components/admin/users-section";
import { RolesSection } from "@/components/admin/roles-section";
import { ProductsSection } from "@/components/admin/products-section";
import { DropdownsSection } from "@/components/admin/dropdowns-section";
import { CompanySection } from "@/components/admin/company-section";
import { IntegrationsSection } from "@/components/admin/integrations-section";
import { PaymentSection } from "@/components/admin/payment-section";
import { SmsTemplatesSection } from "@/components/admin/sms-templates-section";
import { EmailTemplatesSection } from "@/components/admin/email-templates-section";
import { LeadsImportSection } from "@/components/admin/leads-import-section";
// ─── Supported tabs ───────────────────────────────────────────────────────────

const SUPPORTED_TABS = [
  "users",
  "roles",
  "dropdowns",
  "company",
  "products",
  "integrations",
  "sms-templates",
  "email-templates",
  "payment",
  "import-export",
] as const;
type AdminTab = (typeof SUPPORTED_TABS)[number];

function isValidTab(tab: string): tab is AdminTab {
  return (SUPPORTED_TABS as readonly string[]).includes(tab);
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
      return <DropdownsSection />;

    case "company":
      return <CompanySection />;

    case "products":
      return <ProductsSection />;

    case "integrations":
      return <IntegrationsSection />;

    case "sms-templates":
      return <SmsTemplatesSection />;

    case "email-templates":
      return <EmailTemplatesSection />;

    case "payment":
      return <PaymentSection />;

    case "import-export":
      return <LeadsImportSection />;
  }
}

// Static params so Next.js pre-renders all known tab routes
export function generateStaticParams() {
  return SUPPORTED_TABS.map((tab) => ({ tab }));
}

