"use client";

// Hayk 2026-07-01 — CRM preview.
// Master customer database per Bazaar_CRM_Module_Specification.docx.
// List view + 360° profile side panel with KPIs, contact info, relationship,
// activity timeline, quotes/orders/files/notes tabs, and full linked navigation
// Customer → Lead → Quote → Order. Every button wired.

import { useMemo, useState } from "react";

const ACCENT = "#FF5D2E";

// ─── Types ────────────────────────────────────────────
type Tier = "Gold" | "Silver" | "Bronze" | "New";
type Temp = "Hot" | "Warm" | "Cold" | "New Contact" | "Known Customer";

interface Quote {
  ref: string; status: "Viewed" | "Approved" | "Converted" | "Sent" | "Expired";
  value: number; created: string; viewedAt?: string; approvedAt?: string; convertedRef?: string;
  linkedLead?: string;
}
interface Order {
  ref: string; status: "In Production" | "Shipped" | "Delivered" | "Cancelled";
  value: number; created: string; shipped?: string; tracking?: string;
  linkedQuote?: string; linkedLead?: string;
}
interface FileItem { name: string; size: string; kind: "ai" | "pdf" | "image" | "file"; addedBy: string; addedAt: string }
interface ActivityItem { icon: string; tint: string; title: string; sub?: string; at: string; ref?: string }
interface Address { label: string; line1: string; line2?: string; city: string; state: string; zip: string; primary?: boolean }

interface Customer {
  id: string;
  name: string;
  company: string;
  industry: string;
  tier: Tier;
  temperature: Temp;
  status: "Active" | "Dormant" | "Blocked";
  isNewContact?: boolean;
  isKnownCustomer?: boolean;
  isDuplicateOf?: string;
  owner: { code: string; name: string; short: string; color: string };
  customerSince: string;

  totalSpend: number;
  totalOrders: number;
  totalQuotes: number;
  avgOrderValue: number;
  openBalance: number;
  lastOrderDate?: string;
  lastOrderRef?: string;

  activeQuotesCount: number;
  activeOrdersCount: number;

  lastActivity: { icon: string; label: string; kind: "quote_viewed" | "email_opened" | "email_replied" | "called" | "sms_sent" | "no_activity" | "payment"; at: string };

  phone: string;
  email: string;
  website?: string;
  instagram?: string;
  addresses: Address[];

  decisionMaker: string;
  buyer?: string;
  accountingContact?: string;
  currentSupplier?: string;
  referredBy?: string;
  salesRep: string;
  priority: "High" | "Medium" | "Low";
  paymentTerms: string;
  taxCertificate: "Yes" | "No" | "Pending";
  resalePermit: "Yes" | "No" | "Pending";
  accountType: "Business" | "Individual" | "Wholesale";

  quotes: Quote[];
  orders: Order[];
  files: FileItem[];
  activity: ActivityItem[];
  notes: { id: string; author: string; at: string; body: string }[];
}

const REPS = {
  MH: { code: "MH", name: "Maria Hakobyan", short: "Maria H.", color: "#f97316" },
  VA: { code: "VA", name: "Vache Aslanean",  short: "Vache A.",  color: "#8b5cf6" },
  MC: { code: "MC", name: "Manny Carlo",     short: "Manny C.",  color: "#3b82f6" },
  EN: { code: "EN", name: "Ernesto Navarro", short: "Ernesto N.", color: "#22c55e" },
};

// ─── Dataset ────────────────────────────────────────────
const CUSTOMERS: Customer[] = [
  {
    id: "c001", name: "Luis Felipe", company: "Trip Sitters", industry: "Cannabis & CBD",
    tier: "Gold", temperature: "Hot", status: "Active", isKnownCustomer: true,
    owner: REPS.MH, customerSince: "Jun 30, 2026",
    totalSpend: 184250, totalOrders: 37, totalQuotes: 52, avgOrderValue: 4980, openBalance: 8450,
    lastOrderDate: "12 days ago", lastOrderRef: "ORD-1802",
    activeQuotesCount: 2, activeOrdersCount: 1,
    lastActivity: { icon: "👁", label: "12 min ago · Quote viewed", kind: "quote_viewed", at: "12 min ago" },
    phone: "(951) 476-9509", email: "kitkat41414@gmail.com", website: undefined, instagram: "@tripsitters",
    addresses: [{ label: "Shipping", line1: "1245 W Beverly Blvd", city: "Los Angeles", state: "CA", zip: "90026", primary: true }],
    decisionMaker: "Yes", currentSupplier: "ABC Printing", accountType: "Business",
    referredBy: "Instagram", salesRep: "Maria Hakobyan", priority: "High",
    paymentTerms: "Net 15", taxCertificate: "Yes", resalePermit: "Yes",
    quotes: [
      { ref: "QO-01842", status: "Viewed", value: 8200, created: "Jun 28, 2026", viewedAt: "12 min ago" },
      { ref: "QO-01797", status: "Approved", value: 4500, created: "Jun 12, 2026", viewedAt: "2d ago", approvedAt: "Jun 14, 2026", convertedRef: "ORD-1791" },
    ],
    orders: [
      { ref: "ORD-1802", status: "In Production", value: 8850, created: "Jun 30, 2026", linkedQuote: "QO-01842" },
      { ref: "ORD-1791", status: "Shipped", value: 8200, created: "Jun 25, 2026", shipped: "Jun 27, 2026", tracking: "1Z999AA10123456785", linkedQuote: "QO-01797" },
      { ref: "ORD-1764", status: "Delivered", value: 5980, created: "Jun 10, 2026", shipped: "Jun 14, 2026", tracking: "1Z999AA10123456785" },
    ],
    files: [
      { name: "Blueberry.ai", size: "3.4 MB", kind: "ai", addedBy: "Maria H.", addedAt: "Jun 28" },
      { name: "Logo_TripSitters.pdf", size: "890 KB", kind: "pdf", addedBy: "Maria H.", addedAt: "Jun 12" },
      { name: "Tax Certificate.pdf", size: "412 KB", kind: "pdf", addedBy: "Luis F.", addedAt: "Jun 30" },
      { name: "Resale Permit.pdf", size: "298 KB", kind: "pdf", addedBy: "Luis F.", addedAt: "Jun 30" },
      { name: "Previous Box.ai", size: "12.4 MB", kind: "ai", addedBy: "Maria H.", addedAt: "May 4" },
      { name: "Product-photos.zip", size: "24.1 MB", kind: "file", addedBy: "Luis F.", addedAt: "Apr 22" },
    ],
    activity: [
      { icon: "👁", tint: "#22c55e", title: "Quote viewed", sub: "Customer viewed quote QO-01842", at: "12 min ago", ref: "QO-01842" },
      { icon: "✉", tint: "#f59e0b", title: "Email opened", sub: "You: New quote for Trip Sitters", at: "2h ago" },
      { icon: "✉", tint: "#8b5cf6", title: "Email replied", sub: "Luis: Please adjust the quantity to 10,000", at: "1d ago" },
      { icon: "💵", tint: "#22c55e", title: "Payment received", sub: "Payment received for Order ORD-1802 · $8,450.00", at: "2d ago" },
      { icon: "📦", tint: "#06b6d4", title: "Order shipped", sub: "Order ORD-1791 has been shipped · Tracking", at: "5d ago", ref: "ORD-1791" },
      { icon: "✓", tint: "#16a34a", title: "Quote approved", sub: "Quote QO-01797 approved by Luis", at: "7d ago", ref: "QO-01797" },
      { icon: "🧾", tint: "#a78bfa", title: "Order created", sub: "Order ORD-1802 created", at: "12d ago", ref: "ORD-1802" },
    ],
    notes: [
      { id: "n1", author: "Maria Hakobyan", at: "2d ago", body: "Luis wants us to also quote sleeves for the same product line. Sending quote today." },
      { id: "n2", author: "Vahan", at: "1w ago", body: "Reliable customer, always pays on time. Prefers net 15 terms." },
    ],
  },
  {
    id: "c002", name: "Safe Care Packaging", company: "Safe Care LLC", industry: "Healthcare",
    tier: "Silver", temperature: "Warm", status: "Active", isKnownCustomer: true,
    owner: REPS.MH, customerSince: "Feb 4, 2026",
    totalSpend: 97540, totalOrders: 22, totalQuotes: 31, avgOrderValue: 4433, openBalance: 12450,
    lastOrderDate: "5 days ago", lastOrderRef: "ORD-1791",
    activeQuotesCount: 1, activeOrdersCount: 1,
    lastActivity: { icon: "✉", label: "2h ago · Email opened", kind: "email_opened", at: "2h ago" },
    phone: "(213) 555-2210", email: "orders@safecare.co", instagram: undefined,
    addresses: [{ label: "Main", line1: "890 Wilshire Blvd", city: "Los Angeles", state: "CA", zip: "90014" }],
    decisionMaker: "Yes", accountType: "Business", salesRep: "Maria Hakobyan", priority: "Medium",
    paymentTerms: "Net 30", taxCertificate: "Yes", resalePermit: "Yes",
    quotes: [{ ref: "QO-01840", status: "Sent", value: 12450, created: "Jun 26, 2026" }],
    orders: [{ ref: "ORD-1791", status: "Shipped", value: 8200, created: "Jun 25, 2026", shipped: "Jun 27, 2026", tracking: "1Z999AA10099823410" }],
    files: [{ name: "SafeCare_logo.ai", size: "2.1 MB", kind: "ai", addedBy: "Maria H.", addedAt: "Feb 4" }],
    activity: [
      { icon: "✉", tint: "#f59e0b", title: "Email opened", sub: "You: Custom folding cartons quote", at: "2h ago" },
      { icon: "📦", tint: "#06b6d4", title: "Order shipped", sub: "ORD-1791", at: "5d ago" },
    ],
    notes: [],
  },
  {
    id: "c003", name: "J Wynwood", company: "Up Town Holding LLC", industry: "Real Estate",
    tier: "Bronze", temperature: "Cold", status: "Active", isKnownCustomer: true,
    owner: REPS.VA, customerSince: "Nov 12, 2025",
    totalSpend: 65420, totalOrders: 14, totalQuotes: 22, avgOrderValue: 4673, openBalance: 0,
    lastOrderDate: "45 days ago",
    activeQuotesCount: 0, activeOrdersCount: 0,
    lastActivity: { icon: "⚪", label: "3d ago · No activity", kind: "no_activity", at: "3d ago" },
    phone: "(661) 555-9821", email: "j@uptownholding.com",
    addresses: [{ label: "Office", line1: "1500 Hollywood Blvd", city: "Los Angeles", state: "CA", zip: "90028" }],
    decisionMaker: "Yes", accountType: "Business", salesRep: "Vache Aslanean", priority: "Low",
    paymentTerms: "Net 30", taxCertificate: "No", resalePermit: "No",
    quotes: [], orders: [], files: [], activity: [], notes: [],
  },
  {
    id: "c004", name: "ulisess Sillero", company: "The Holding Company", industry: "Fashion",
    tier: "Silver", temperature: "Warm", status: "Active", isKnownCustomer: true,
    owner: REPS.MH, customerSince: "Aug 22, 2025",
    totalSpend: 54310, totalOrders: 11, totalQuotes: 18, avgOrderValue: 4937, openBalance: 0,
    lastOrderDate: "18 days ago", lastOrderRef: "ORD-1764",
    activeQuotesCount: 2, activeOrdersCount: 0,
    lastActivity: { icon: "📞", label: "1h ago · Called", kind: "called", at: "1h ago" },
    phone: "(818) 555-1102", email: "u@holdingco.com",
    addresses: [{ label: "Main", line1: "1200 Melrose Ave", city: "Los Angeles", state: "CA", zip: "90038" }],
    decisionMaker: "Yes", accountType: "Business", salesRep: "Maria Hakobyan", priority: "Medium",
    paymentTerms: "Net 15", taxCertificate: "Yes", resalePermit: "Yes",
    quotes: [], orders: [], files: [], activity: [], notes: [],
  },
  {
    id: "c005", name: "Niko Cream", company: "Smooking Aces", industry: "Beauty",
    tier: "Silver", temperature: "Warm", status: "Active", isKnownCustomer: true,
    owner: REPS.VA, customerSince: "Jan 15, 2026",
    totalSpend: 28640, totalOrders: 8, totalQuotes: 11, avgOrderValue: 3580, openBalance: 2100,
    lastOrderDate: "25 days ago", lastOrderRef: "ORD-1748",
    activeQuotesCount: 1, activeOrdersCount: 0,
    lastActivity: { icon: "💬", label: "4h ago · SMS sent", kind: "sms_sent", at: "4h ago" },
    phone: "(818) 555-9020", email: "niko@smookingaces.com",
    addresses: [{ label: "Main", line1: "3400 Cahuenga Blvd", city: "Los Angeles", state: "CA", zip: "90068" }],
    decisionMaker: "Yes", accountType: "Business", salesRep: "Vache Aslanean", priority: "Medium",
    paymentTerms: "Net 15", taxCertificate: "Pending", resalePermit: "Yes",
    quotes: [], orders: [], files: [], activity: [], notes: [],
  },
  {
    id: "c006", name: "Joseph", company: "Frenzy Organics", industry: "Food & Beverage",
    tier: "Silver", temperature: "Hot", status: "Active", isKnownCustomer: true,
    owner: REPS.MH, customerSince: "Mar 3, 2026",
    totalSpend: 22180, totalOrders: 6, totalQuotes: 9, avgOrderValue: 3697, openBalance: 0,
    lastOrderDate: "17 days ago", lastOrderRef: "ORD-1759",
    activeQuotesCount: 1, activeOrdersCount: 1,
    lastActivity: { icon: "✉", label: "1d ago · Email replied", kind: "email_replied", at: "1d ago" },
    phone: "(213) 555-4402", email: "joseph@frenzyorganics.com",
    addresses: [{ label: "Main", line1: "5600 Sunset Blvd", city: "Los Angeles", state: "CA", zip: "90028" }],
    decisionMaker: "Yes", accountType: "Business", salesRep: "Maria Hakobyan", priority: "High",
    paymentTerms: "Net 15", taxCertificate: "Yes", resalePermit: "Yes",
    quotes: [], orders: [], files: [], activity: [], notes: [],
  },
  {
    id: "c007", name: "Grim Lawd", company: "Grimelyfe Records", industry: "Music",
    tier: "New", temperature: "New Contact", status: "Active", isNewContact: true,
    owner: REPS.MH, customerSince: "Jul 1, 2026",
    totalSpend: 18450, totalOrders: 0, totalQuotes: 1, avgOrderValue: 0, openBalance: 0,
    activeQuotesCount: 1, activeOrdersCount: 0,
    lastActivity: { icon: "👁", label: "18m ago · Quote viewed", kind: "quote_viewed", at: "18m ago" },
    phone: "(864) 982-2186", email: "grimlawd@grimeylyfe.com", instagram: "@grimlawd",
    addresses: [],
    decisionMaker: "Yes", accountType: "Business", salesRep: "Maria Hakobyan", priority: "High",
    paymentTerms: "Pre-pay", taxCertificate: "No", resalePermit: "No",
    quotes: [{ ref: "QO-01842", status: "Viewed", value: 18450, created: "Jul 1, 2026", viewedAt: "18m ago" }],
    orders: [], files: [], activity: [], notes: [],
  },
  {
    id: "c008", name: "Global 448", company: "Global 448", industry: "Retail",
    tier: "Bronze", temperature: "Warm", status: "Active", isKnownCustomer: true,
    owner: REPS.VA, customerSince: "May 8, 2026",
    totalSpend: 16930, totalOrders: 5, totalQuotes: 7, avgOrderValue: 3386, openBalance: 5430,
    lastOrderDate: "3 days ago", lastOrderRef: "ORD-1762",
    activeQuotesCount: 0, activeOrdersCount: 1,
    lastActivity: { icon: "💵", label: "2h ago · Payment received", kind: "payment", at: "2h ago" },
    phone: "(562) 505-8381", email: "hello@global448.com",
    addresses: [{ label: "Main", line1: "12000 Firestone Blvd", city: "Norwalk", state: "CA", zip: "90650" }],
    decisionMaker: "Yes", accountType: "Business", salesRep: "Vache Aslanean", priority: "Medium",
    paymentTerms: "Net 15", taxCertificate: "Yes", resalePermit: "Yes",
    quotes: [], orders: [], files: [], activity: [], notes: [],
  },
  {
    id: "c009", name: "Boris Boris", company: "—", industry: "Unknown",
    tier: "New", temperature: "Cold", status: "Active",
    owner: REPS.MH, customerSince: "Jun 25, 2026",
    totalSpend: 12000, totalOrders: 3, totalQuotes: 4, avgOrderValue: 4000, openBalance: 0,
    lastOrderDate: "12 days ago",
    activeQuotesCount: 0, activeOrdersCount: 0,
    lastActivity: { icon: "⚪", label: "15h ago · No activity", kind: "no_activity", at: "15h ago" },
    phone: "(213) 555-7710", email: "boris@example.com",
    addresses: [],
    decisionMaker: "Unknown", accountType: "Individual", salesRep: "Maria Hakobyan", priority: "Low",
    paymentTerms: "Pre-pay", taxCertificate: "No", resalePermit: "No",
    quotes: [], orders: [], files: [], activity: [], notes: [],
  },
  {
    id: "c010", name: "nicole Han", company: "—", industry: "Retail",
    tier: "New", temperature: "New Contact", status: "Active", isNewContact: true,
    owner: REPS.VA, customerSince: "Jun 30, 2026",
    totalSpend: 11280, totalOrders: 2, totalQuotes: 3, avgOrderValue: 5640, openBalance: 0,
    lastOrderDate: "32 days ago", lastOrderRef: "ORD-1712",
    activeQuotesCount: 1, activeOrdersCount: 0,
    lastActivity: { icon: "✉", label: "6h ago · Email opened", kind: "email_opened", at: "6h ago" },
    phone: "(408) 555-1234", email: "nicole.han@example.com",
    addresses: [],
    decisionMaker: "Yes", accountType: "Business", salesRep: "Vache Aslanean", priority: "Medium",
    paymentTerms: "Net 15", taxCertificate: "Pending", resalePermit: "Pending",
    quotes: [], orders: [], files: [], activity: [], notes: [],
  },
];

// ─── Tabs ────────────────────────────────────────────
type TabKey = "all" | "new" | "known" | "hot" | "warm" | "cold" | "dupes";
const TABS: { key: TabKey; label: string; predicate: (c: Customer) => boolean }[] = [
  { key: "all", label: "All", predicate: () => true },
  { key: "new", label: "New Contact", predicate: c => !!c.isNewContact },
  { key: "known", label: "Known Customer", predicate: c => !!c.isKnownCustomer },
  { key: "hot", label: "Hot", predicate: c => c.temperature === "Hot" },
  { key: "warm", label: "Warm", predicate: c => c.temperature === "Warm" },
  { key: "cold", label: "Cold", predicate: c => c.temperature === "Cold" },
  { key: "dupes", label: "Duplicates", predicate: c => !!c.isDuplicateOf },
];

// ─── Format helpers ────────────────────────────────────────
const fmtMoney = (n: number) => `$${n.toLocaleString()}`;
const tierColor = (t: Tier) => t === "Gold" ? { bg: "#fef3c7", fg: "#a16207", pill: "#d97706" } : t === "Silver" ? { bg: "#f1f5f9", fg: "#475569", pill: "#64748b" } : t === "Bronze" ? { bg: "#fee2e2", fg: "#b45309", pill: "#c2410c" } : { bg: "#dbeafe", fg: "#1e40af", pill: "#3b82f6" };

// ─── Page ────────────────────────────────────────────
export default function CRMPreview() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [detailTab, setDetailTab] = useState<"activity" | "quotes" | "orders" | "files" | "notes" | "addresses" | "financial">("activity");
  const [addCustOpen, setAddCustOpen] = useState(false);
  const [addQuoteOpen, setAddQuoteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const filtered = useMemo(() => {
    const tabDef = TABS.find(t => t.key === tab)!;
    let out = CUSTOMERS.filter(tabDef.predicate);
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(c => c.name.toLowerCase().includes(q) || c.company.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.phone.includes(q));
    }
    return out;
  }, [tab, search]);

  const counts: Record<TabKey, number> = useMemo(() => {
    const c: any = {};
    TABS.forEach(t => (c[t.key] = CUSTOMERS.filter(t.predicate).length));
    return c;
  }, []);

  const selected = selectedId ? CUSTOMERS.find(c => c.id === selectedId) : null;

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: "var(--preview-bg)", color: "var(--preview-text)", margin: "-20px", padding: "20px", minHeight: "100vh" }}>
      {/* Preview banner */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "18px", alignItems: "center", padding: "10px 14px", background: "var(--preview-surface-2)", borderRadius: "10px", color: "var(--preview-text)" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: ACCENT }}>Preview</span>
        <span style={{ fontSize: "12px", color: "var(--preview-text)" }}>CRM · 360° customer database · click any row to open the profile</span>
        <span style={{ marginLeft: "auto", fontSize: "12px", color: "var(--preview-text-muted)" }}>Real /crm page untouched</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: selected ? "minmax(0, 1fr) 560px" : "1fr", gap: "16px" }}>
        {/* LEFT — list */}
        <div>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
            <h1 style={{ fontSize: "22px", fontWeight: 800, margin: 0 }}>CRM</h1>
            <button onClick={() => setAddCustOpen(true)} style={{ padding: "9px 16px", background: ACCENT, color: "#fff", border: "none", borderRadius: "10px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>＋ Add Customer</button>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: "6px", marginBottom: "12px", flexWrap: "wrap" }}>
            {TABS.map(t => {
              const active = tab === t.key;
              return (
                <button key={t.key} onClick={() => setTab(t.key)} style={{
                  padding: "7px 14px",
                  background: active ? "#0a0a0a" : "#fff",
                  color: active ? "#fff" : "#333",
                  border: `1px solid ${active ? "#0a0a0a" : "#e5e5e5"}`,
                  borderRadius: "9px",
                  fontSize: "12.5px",
                  fontWeight: active ? 700 : 500,
                  cursor: "pointer",
                }}>
                  {t.label} {counts[t.key] > 0 && <span style={{ marginLeft: "4px", padding: "1px 6px", background: active ? "var(--preview-text-faint)" : "#f5f5f5", borderRadius: "999px", fontSize: "10.5px", fontWeight: 700 }}>{counts[t.key]}</span>}
                </button>
              );
            })}
            <div style={{ marginLeft: "auto", position: "relative", minWidth: "280px" }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search name, email, phone, company..." style={{ width: "100%", padding: "8px 12px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "9px", fontSize: "12.5px", outline: "none" }} />
            </div>
          </div>

          {/* Table */}
          <div style={{ background: "var(--preview-surface)", borderRadius: "12px", border: "1px solid var(--preview-border)", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ color: "#888", fontSize: "10.5px", textTransform: "uppercase", letterSpacing: "0.06em", background: "var(--preview-surface-2)" }}>
                  <th style={th}>Customer</th>
                  <th style={th}>Owner</th>
                  <th style={th}>Total Spend</th>
                  <th style={th}>Last Order</th>
                  <th style={th}>Active Quotes</th>
                  <th style={th}>Active Orders</th>
                  <th style={th}>Last Activity</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: "36px", textAlign: "center", color: "#aaa", fontSize: "13px" }}>No customers match this filter.</td></tr>
                )}
                {filtered.map(c => (
                  <CustomerRow key={c.id} customer={c} selected={selectedId === c.id} onSelect={() => setSelectedId(c.id)} />
                ))}
              </tbody>
            </table>
            {/* Pagination */}
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "6px", padding: "14px 16px", borderTop: "1px solid #f4f4f4" }}>
              <PageBtn>‹</PageBtn>
              <PageBtn active>1</PageBtn>
              <PageBtn>2</PageBtn>
              <PageBtn>3</PageBtn>
              <span style={{ padding: "0 4px", color: "#aaa" }}>…</span>
              <PageBtn>100</PageBtn>
              <PageBtn>›</PageBtn>
            </div>
          </div>
        </div>

        {/* RIGHT — customer profile */}
        {selected && (
          <CustomerProfile
            customer={selected}
            detailTab={detailTab}
            setDetailTab={setDetailTab}
            onClose={() => setSelectedId(null)}
            onAddQuote={() => setAddQuoteOpen(true)}
            onEdit={() => setEditOpen(true)}
          />
        )}
      </div>

      {addCustOpen && <AddCustomerModal onClose={() => setAddCustOpen(false)} />}
      {addQuoteOpen && selected && <AddQuoteModal customer={selected} onClose={() => setAddQuoteOpen(false)} />}
      {editOpen && selected && <EditCustomerModal customer={selected} onClose={() => setEditOpen(false)} />}
    </div>
  );
}

// ─── Table row ────────────────────────────────────────────
function CustomerRow({ customer, selected, onSelect }: { customer: Customer; selected: boolean; onSelect: () => void }) {
  return (
    <tr onClick={onSelect} style={{ borderTop: "1px solid #f4f4f4", background: selected ? "#fff7ed" : "transparent", cursor: "pointer" }}>
      <td style={td}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Avatar customer={customer} />
          <div>
            <div style={{ fontSize: "13px", fontWeight: 700 }}>{customer.name}</div>
            <div style={{ fontSize: "11px", color: "#888" }}>{customer.company}</div>
          </div>
        </div>
      </td>
      <td style={td}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ width: "24px", height: "24px", borderRadius: "50%", background: customer.owner.color + "22", color: customer.owner.color, fontSize: "10px", fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{customer.owner.code}</span>
          <span style={{ fontSize: "12px", fontWeight: 600 }}>{customer.owner.short}</span>
        </div>
      </td>
      <td style={{ ...td, fontWeight: 700 }}>{fmtMoney(customer.totalSpend)}</td>
      <td style={td}>
        {customer.lastOrderRef ? (
          <>
            <div style={{ fontSize: "12px", color: "#333" }}>{customer.lastOrderDate}</div>
            <div style={{ fontSize: "11px", color: ACCENT, fontWeight: 600, fontFamily: "monospace" }}>{customer.lastOrderRef}</div>
          </>
        ) : <span style={{ color: "#bbb" }}>—</span>}
      </td>
      <td style={td}>
        {customer.activeQuotesCount > 0
          ? <span style={{ fontWeight: 700, color: "#171717" }}>{customer.activeQuotesCount}</span>
          : <span style={{ color: "#bbb" }}>0</span>}
      </td>
      <td style={td}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontWeight: 700, color: customer.activeOrdersCount > 0 ? "#171717" : "#bbb" }}>{customer.activeOrdersCount}</span>
          {customer.activeOrdersCount > 0 && <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#22c55e" }} />}
        </div>
      </td>
      <td style={td}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "14px" }}>{customer.lastActivity.icon}</span>
          <div>
            <div style={{ fontSize: "12px", color: "#333" }}>{customer.lastActivity.at}</div>
            <div style={{ fontSize: "10.5px", color: "#888" }}>{customer.lastActivity.label.split("· ")[1] || ""}</div>
          </div>
        </div>
      </td>
    </tr>
  );
}

function Avatar({ customer }: { customer: Customer }) {
  const initials = customer.name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const t = tierColor(customer.tier);
  return (
    <div style={{ position: "relative", width: "34px", height: "34px" }}>
      <div style={{ width: "34px", height: "34px", borderRadius: "8px", background: customer.owner.color + "22", color: customer.owner.color, fontWeight: 800, fontSize: "11px", display: "flex", alignItems: "center", justifyContent: "center" }}>{initials}</div>
      {customer.tier !== "New" && <span title={`${customer.tier} tier`} style={{ position: "absolute", top: "-4px", right: "-4px", width: "14px", height: "14px", borderRadius: "50%", background: t.pill, color: "#fff", fontSize: "9px", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}>{customer.tier[0]}</span>}
    </div>
  );
}

// ─── Customer Profile (right panel) ────────────────────────────────
function CustomerProfile({ customer, detailTab, setDetailTab, onClose, onAddQuote, onEdit }: any) {
  const c: Customer = customer;
  const t = tierColor(c.tier);
  return (
    <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "14px", padding: "20px", height: "fit-content", position: "sticky", top: "16px", maxHeight: "calc(100vh - 40px)", overflowY: "auto" }}>
      {/* Top bar: Back + close */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#666", fontSize: "12.5px", cursor: "pointer", fontWeight: 600 }}>← Back to CRM</button>
        <div style={{ display: "flex", gap: "6px" }}>
          <button onClick={onAddQuote} style={{ padding: "7px 12px", background: "#fbbf24", border: "none", borderRadius: "8px", color: "#171717", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>＋ Add Quote</button>
          <button style={{ padding: "7px 12px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "8px", color: "var(--preview-text)", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>📄 Create Order</button>
          <button onClick={onEdit} style={{ padding: "7px 12px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "8px", color: "var(--preview-text)", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>✎ Edit</button>
          <button onClick={onClose} style={{ padding: "5px 10px", background: "transparent", border: "none", color: "#aaa", fontSize: "13px", cursor: "pointer" }}>✕</button>
        </div>
      </div>

      {/* Name + tier */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
        <h2 style={{ fontSize: "22px", fontWeight: 800, margin: 0 }}>{c.name}</h2>
        {c.tier !== "New" && (
          <span style={{ padding: "3px 10px", background: t.bg, color: t.fg, fontSize: "11px", fontWeight: 800, borderRadius: "6px" }}>{c.tier} Customer</span>
        )}
      </div>
      <div style={{ fontSize: "13px", color: "#666", marginBottom: "14px" }}>{c.company}</div>

      {/* Contact quick-actions */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "8px", marginBottom: "16px" }}>
        <ActionBtn icon="📞" label="Call" onClick={() => alert(`Call ${c.phone}`)} />
        <ActionBtn icon="✉" label="Email" onClick={() => alert(`Email ${c.email}`)} />
        <ActionBtn icon="💬" label="SMS" onClick={() => alert(`SMS ${c.phone}`)} />
        <ActionBtn icon="📷" label="Instagram" onClick={() => c.instagram ? window.open(`https://instagram.com/${c.instagram.replace("@", "")}`, "_blank") : alert("No Instagram on file")} />
        <ActionBtn icon="⋯" label="More" />
      </div>

      {/* Header info grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px", padding: "12px 14px", background: "var(--preview-surface-2)", borderRadius: "10px", marginBottom: "14px" }}>
        <div>
          <div style={{ fontSize: "10px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Owner</div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
            <span style={{ width: "22px", height: "22px", borderRadius: "50%", background: c.owner.color + "22", color: c.owner.color, fontSize: "9px", fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{c.owner.code}</span>
            <span style={{ fontSize: "12.5px", fontWeight: 700 }}>{c.owner.name}</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: "10px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Status</div>
          <div style={{ marginTop: "4px", display: "flex", alignItems: "center", gap: "5px" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#22c55e" }} />
            <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#16a34a" }}>{c.status}</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: "10px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Customer Since</div>
          <div style={{ marginTop: "4px", fontSize: "12.5px", fontWeight: 700 }}>{c.customerSince}</div>
        </div>
        <div>
          <div style={{ fontSize: "10px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Industry</div>
          <div style={{ marginTop: "4px", fontSize: "12.5px", fontWeight: 700 }}>{c.industry}</div>
        </div>
        <div>
          <div style={{ fontSize: "10px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Priority</div>
          <div style={{ marginTop: "4px" }}>
            <span style={{ padding: "2px 8px", background: c.priority === "High" ? "#fee2e2" : c.priority === "Medium" ? "#fef3c7" : "#dcfce7", color: c.priority === "High" ? "#dc2626" : c.priority === "Medium" ? "#f59e0b" : "#22c55e", fontSize: "11px", fontWeight: 700, borderRadius: "5px" }}>{c.priority}</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: "10px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Sales Rep</div>
          <div style={{ marginTop: "4px", fontSize: "12.5px", fontWeight: 700 }}>{c.salesRep}</div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "6px", marginBottom: "14px" }}>
        <KPI label="Lifetime Rev" value={fmtMoney(c.totalSpend)} />
        <KPI label="Total Orders" value={String(c.totalOrders)} />
        <KPI label="Total Quotes" value={String(c.totalQuotes)} />
        <KPI label="Avg Order" value={fmtMoney(c.avgOrderValue)} />
        <KPI label="Open Balance" value={fmtMoney(c.openBalance)} highlight={c.openBalance > 0} />
        <KPI label="Last Order" value={c.lastOrderDate || "—"} small />
      </div>

      {/* Two-column: Contact info | Relationship */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "14px" }}>
        <div style={{ background: "var(--preview-surface-2)", borderRadius: "10px", padding: "12px 14px" }}>
          <div style={{ fontSize: "11px", fontWeight: 800, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px" }}>Contact Information</div>
          <MiniRow label="Phone" value={c.phone} />
          <MiniRow label="Email" value={c.email} />
          {c.website && <MiniRow label="Website" value={c.website} />}
          {c.instagram && <MiniRow label="Instagram" value={c.instagram} />}
          {c.addresses[0] && <MiniRow label="Address" value={`${c.addresses[0].line1}, ${c.addresses[0].city} ${c.addresses[0].state}`} />}
        </div>
        <div style={{ background: "var(--preview-surface-2)", borderRadius: "10px", padding: "12px 14px" }}>
          <div style={{ fontSize: "11px", fontWeight: 800, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px" }}>Relationship</div>
          <MiniRow label="Decision Maker" value={c.decisionMaker} />
          {c.currentSupplier && <MiniRow label="Current Supplier" value={c.currentSupplier} />}
          <MiniRow label="Account Type" value={c.accountType} />
          <MiniRow label="Priority" value={c.priority} valueColor={c.priority === "High" ? "#dc2626" : c.priority === "Medium" ? "#f59e0b" : "#22c55e"} />
          <MiniRow label="Payment Terms" value={c.paymentTerms} />
          <MiniRow label="Tax Certificate" value={c.taxCertificate} valueColor={c.taxCertificate === "Yes" ? "#22c55e" : c.taxCertificate === "Pending" ? "#f59e0b" : "#dc2626"} />
          <MiniRow label="Resale Permit" value={c.resalePermit} valueColor={c.resalePermit === "Yes" ? "#22c55e" : c.resalePermit === "Pending" ? "#f59e0b" : "#dc2626"} />
          {c.referredBy && <MiniRow label="Referred By" value={c.referredBy} />}
        </div>
      </div>

      {/* Detail Tabs */}
      <div style={{ display: "flex", gap: "16px", borderBottom: "1px solid #eee", marginBottom: "14px" }}>
        {(["activity", "quotes", "orders", "files", "notes", "addresses", "financial"] as const).map(t => {
          const active = detailTab === t;
          const count = t === "quotes" ? c.quotes.length : t === "orders" ? c.orders.length : t === "files" ? c.files.length : t === "notes" ? c.notes.length : t === "addresses" ? c.addresses.length : undefined;
          return (
            <button key={t} onClick={() => setDetailTab(t)} style={{ background: "transparent", border: "none", padding: "8px 2px", marginBottom: "-1px", borderBottom: active ? `2px solid ${ACCENT}` : "2px solid transparent", color: active ? "#171717" : "#888", fontSize: "12.5px", fontWeight: active ? 700 : 500, cursor: "pointer", textTransform: "capitalize" }}>
              {t}{count !== undefined && ` (${count})`}
            </button>
          );
        })}
      </div>

      {/* Detail content */}
      {detailTab === "activity" && <ActivityView items={c.activity} />}
      {detailTab === "quotes" && <QuotesView quotes={c.quotes} customer={c} />}
      {detailTab === "orders" && <OrdersView orders={c.orders} customer={c} />}
      {detailTab === "files" && <FilesView files={c.files} />}
      {detailTab === "notes" && <NotesView notes={c.notes} customer={c} />}
      {detailTab === "addresses" && <AddressesView addresses={c.addresses} />}
      {detailTab === "financial" && <FinancialView customer={c} />}
    </div>
  );
}

// ─── Detail tab views ────────────────────────────────
function ActivityView({ items }: { items: ActivityItem[] }) {
  if (!items.length) return <EmptyState label="No activity logged yet" />;
  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <div style={{ fontSize: "13px", fontWeight: 700 }}>Activity Timeline</div>
        <span style={{ fontSize: "11.5px", color: ACCENT, fontWeight: 700, cursor: "pointer" }}>View all</span>
      </div>
      <div style={{ position: "relative", paddingLeft: "4px" }}>
        <div style={{ position: "absolute", left: "18px", top: "8px", bottom: "8px", width: "2px", background: "#f0f0f0" }} />
        {items.map((a, i) => (
          <div key={i} style={{ display: "flex", gap: "12px", padding: "8px 0", position: "relative", zIndex: 1 }}>
            <div style={{ width: "30px", height: "30px", borderRadius: "50%", background: a.tint + "22", color: a.tint, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", flexShrink: 0, border: "2px solid #fff" }}>{a.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "6px" }}>
                <span style={{ fontSize: "12.5px", fontWeight: 700 }}>{a.title}</span>
                <span style={{ fontSize: "10.5px", color: "#888", whiteSpace: "nowrap" }}>{a.at}</span>
              </div>
              {a.sub && <div style={{ fontSize: "11.5px", color: "#666", marginTop: "1px" }}>
                {a.ref ? <>{a.sub.split(a.ref)[0]}<span style={{ color: ACCENT, fontWeight: 700, cursor: "pointer" }}>{a.ref}</span>{a.sub.split(a.ref)[1] || ""}</> : a.sub}
              </div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
function QuotesView({ quotes, customer }: { quotes: Quote[]; customer: Customer }) {
  if (!quotes.length) return <EmptyState label="No quotes yet" cta={{ label: "＋ Add Quote", onClick: () => alert("Open quote builder") }} />;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <div style={{ fontSize: "13px", fontWeight: 700 }}>Quotes ({quotes.length})</div>
        <span style={{ fontSize: "11.5px", color: ACCENT, fontWeight: 700, cursor: "pointer" }}>＋ Add Quote</span>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
        <thead>
          <tr style={{ color: "#888", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            <th style={{ ...th, padding: "6px 0" }}>Quote #</th>
            <th style={{ ...th, padding: "6px 0" }}>Status</th>
            <th style={{ ...th, padding: "6px 0" }}>Value</th>
            <th style={{ ...th, padding: "6px 0" }}>Created</th>
            <th style={{ ...th, padding: "6px 0" }}>Viewed</th>
            <th style={{ ...th, padding: "6px 0" }}>Approved</th>
            <th style={{ ...th, padding: "6px 0" }}>Converted</th>
          </tr>
        </thead>
        <tbody>
          {quotes.map(q => (
            <tr key={q.ref} style={{ borderTop: "1px solid #f4f4f4" }}>
              <td style={{ ...td, padding: "8px 6px 8px 0", color: ACCENT, fontWeight: 700, cursor: "pointer", fontFamily: "monospace" }}>{q.ref}</td>
              <td style={{ ...td, padding: "8px 6px" }}><StatusPill status={q.status} /></td>
              <td style={{ ...td, padding: "8px 6px", fontWeight: 700 }}>{fmtMoney(q.value)}</td>
              <td style={{ ...td, padding: "8px 6px", color: "#666" }}>{q.created}</td>
              <td style={{ ...td, padding: "8px 6px", color: "#666" }}>{q.viewedAt || "—"}</td>
              <td style={{ ...td, padding: "8px 6px", color: "#666" }}>{q.approvedAt || "—"}</td>
              <td style={{ ...td, padding: "8px 6px" }}>{q.convertedRef ? <span style={{ color: ACCENT, fontWeight: 700, cursor: "pointer", fontFamily: "monospace" }}>{q.convertedRef}</span> : <span style={{ color: "#bbb" }}>—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function OrdersView({ orders, customer }: { orders: Order[]; customer: Customer }) {
  if (!orders.length) return <EmptyState label="No orders yet" />;
  return (
    <div>
      <div style={{ fontSize: "13px", fontWeight: 700, marginBottom: "10px" }}>Orders ({orders.length})</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
        <thead>
          <tr style={{ color: "#888", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            <th style={{ ...th, padding: "6px 0" }}>Order #</th>
            <th style={{ ...th, padding: "6px 0" }}>Status</th>
            <th style={{ ...th, padding: "6px 0" }}>Value</th>
            <th style={{ ...th, padding: "6px 0" }}>Created</th>
            <th style={{ ...th, padding: "6px 0" }}>Shipped</th>
            <th style={{ ...th, padding: "6px 0" }}>Tracking</th>
          </tr>
        </thead>
        <tbody>
          {orders.map(o => (
            <tr key={o.ref} style={{ borderTop: "1px solid #f4f4f4" }}>
              <td style={{ ...td, padding: "8px 6px 8px 0", color: ACCENT, fontWeight: 700, cursor: "pointer", fontFamily: "monospace" }}>{o.ref}</td>
              <td style={{ ...td, padding: "8px 6px" }}><StatusPill status={o.status} /></td>
              <td style={{ ...td, padding: "8px 6px", fontWeight: 700 }}>{fmtMoney(o.value)}</td>
              <td style={{ ...td, padding: "8px 6px", color: "#666" }}>{o.created}</td>
              <td style={{ ...td, padding: "8px 6px", color: "#666" }}>{o.shipped || "—"}</td>
              <td style={{ ...td, padding: "8px 6px" }}>{o.tracking ? <span style={{ fontFamily: "monospace", fontSize: "10.5px", color: ACCENT, cursor: "pointer" }}>{o.tracking}</span> : <span style={{ color: "#bbb" }}>—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function FilesView({ files }: { files: FileItem[] }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <div style={{ fontSize: "13px", fontWeight: 700 }}>Files ({files.length})</div>
        <label style={{ padding: "5px 10px", background: ACCENT, color: "#fff", border: "none", borderRadius: "6px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>
          + Upload
          <input type="file" multiple style={{ display: "none" }} />
        </label>
      </div>
      {files.length === 0 ? <EmptyState label="No files uploaded" /> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
          {files.map((f, i) => (
            <div key={i} style={{ background: "var(--preview-surface-2)", border: "1px solid var(--preview-border)", borderRadius: "8px", overflow: "hidden", cursor: "pointer" }}>
              <div style={{ aspectRatio: "16/10", background: f.kind === "ai" ? "linear-gradient(135deg,#f97316,#ef4444)" : f.kind === "pdf" ? "linear-gradient(135deg,#dc2626,#f59e0b)" : f.kind === "image" ? "linear-gradient(135deg,#3b82f6,#8b5cf6)" : "linear-gradient(135deg,#525252,#171717)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "16px", fontWeight: 800 }}>
                {f.kind === "ai" ? "AI" : f.kind === "pdf" ? "PDF" : f.kind === "image" ? "IMG" : "📎"}
              </div>
              <div style={{ padding: "6px 8px" }}>
                <div style={{ fontSize: "11.5px", fontWeight: 700, color: "#171717", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                <div style={{ fontSize: "9.5px", color: "#888" }}>{f.size} · {f.addedBy} · {f.addedAt}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
function NotesView({ notes, customer }: { notes: Customer["notes"]; customer: Customer }) {
  const [list, setList] = useState(notes);
  const [text, setText] = useState("");
  const save = () => {
    if (!text.trim()) return;
    setList([{ id: `n${Date.now()}`, author: "Hayk Zohrabyan", at: "just now", body: text.trim() }, ...list]);
    setText("");
  };
  return (
    <div>
      <div style={{ fontSize: "13px", fontWeight: 700, marginBottom: "10px" }}>Team Notes</div>
      <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Note (visible to team only)..." style={{ width: "100%", minHeight: "60px", background: "var(--preview-surface-2)", border: "1px solid var(--preview-border)", borderRadius: "8px", padding: "10px", fontSize: "12.5px", outline: "none", boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" }} />
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "6px", marginBottom: "10px" }}>
        <button onClick={save} disabled={!text.trim()} style={{ padding: "6px 14px", background: text.trim() ? ACCENT : "#e5e5e5", border: "none", borderRadius: "6px", color: "var(--preview-text)", fontSize: "12px", fontWeight: 700, cursor: text.trim() ? "pointer" : "not-allowed" }}>Save Note</button>
      </div>
      {list.length === 0 ? <EmptyState label="No notes yet" /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {list.map(n => (
            <div key={n.id} style={{ padding: "10px 12px", background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                <span style={{ fontSize: "11.5px", fontWeight: 700, color: "#7c3aed" }}>{n.author}</span>
                <span style={{ fontSize: "10.5px", color: "#888" }}>{n.at}</span>
              </div>
              <div style={{ fontSize: "12.5px", color: "#333", lineHeight: 1.5 }}>{n.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
function AddressesView({ addresses }: { addresses: Address[] }) {
  if (!addresses.length) return <EmptyState label="No addresses on file" cta={{ label: "＋ Add Address", onClick: () => alert("Add address") }} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
        <div style={{ fontSize: "13px", fontWeight: 700 }}>Addresses ({addresses.length})</div>
        <button style={{ padding: "5px 10px", background: ACCENT, color: "#fff", border: "none", borderRadius: "6px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>＋ Add</button>
      </div>
      {addresses.map((a, i) => (
        <div key={i} style={{ padding: "10px 12px", background: "var(--preview-surface-2)", border: "1px solid var(--preview-border)", borderRadius: "8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "3px" }}>
            <span style={{ fontSize: "11.5px", fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: "0.05em" }}>{a.label} {a.primary && <span style={{ marginLeft: "5px", padding: "1px 6px", background: ACCENT, color: "#fff", fontSize: "9px", fontWeight: 700, borderRadius: "3px" }}>PRIMARY</span>}</span>
            <span style={{ fontSize: "11px", color: ACCENT, fontWeight: 600, cursor: "pointer" }}>Edit</span>
          </div>
          <div style={{ fontSize: "12.5px", color: "#333" }}>{a.line1}</div>
          <div style={{ fontSize: "12.5px", color: "#333" }}>{a.city}, {a.state} {a.zip}</div>
        </div>
      ))}
    </div>
  );
}
function FinancialView({ customer }: { customer: Customer }) {
  const c = customer;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ fontSize: "13px", fontWeight: 700, marginBottom: "4px" }}>Financial Snapshot</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px" }}>
        <KPI label="Lifetime Revenue" value={fmtMoney(c.totalSpend)} />
        <KPI label="Open Balance" value={fmtMoney(c.openBalance)} highlight={c.openBalance > 0} />
        <KPI label="Average Order Value" value={fmtMoney(c.avgOrderValue)} />
        <KPI label="Payment Terms" value={c.paymentTerms} />
      </div>
      <div style={{ padding: "10px 12px", background: "var(--preview-surface-2)", borderRadius: "8px" }}>
        <div style={{ fontSize: "11.5px", fontWeight: 700, color: "#666", marginBottom: "4px" }}>DOCUMENTS</div>
        <MiniRow label="Tax Certificate" value={c.taxCertificate} valueColor={c.taxCertificate === "Yes" ? "#22c55e" : c.taxCertificate === "Pending" ? "#f59e0b" : "#dc2626"} />
        <MiniRow label="Resale Permit" value={c.resalePermit} valueColor={c.resalePermit === "Yes" ? "#22c55e" : c.resalePermit === "Pending" ? "#f59e0b" : "#dc2626"} />
      </div>
    </div>
  );
}

// ─── Small helpers ────────────────────────────────
const th: React.CSSProperties = { textAlign: "left", padding: "12px 12px", fontWeight: 700 };
const td: React.CSSProperties = { padding: "14px 12px" };

function PageBtn({ active, children }: any) {
  return <div style={{ minWidth: "28px", padding: "5px 10px", fontSize: "12px", borderRadius: "6px", background: active ? "#0a0a0a" : "#fff", color: active ? "#fff" : "#555", border: `1px solid ${active ? "#0a0a0a" : "#e5e5e5"}`, fontWeight: active ? 700 : 500, cursor: "pointer", textAlign: "center" }}>{children}</div>;
}
function ActionBtn({ icon, label, onClick }: any) {
  return (
    <button onClick={onClick} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", padding: "10px 4px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "9px", color: "var(--preview-text)", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>
      <span style={{ fontSize: "16px" }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
function KPI({ label, value, highlight, small }: { label: string; value: string; highlight?: boolean; small?: boolean }) {
  return (
    <div style={{ background: highlight ? "#fef2f2" : "var(--preview-surface-2)", padding: "8px 10px", borderRadius: "8px", border: highlight ? "1px solid #fecaca" : "1px solid transparent" }}>
      <div style={{ fontSize: "9.5px", color: highlight ? "#dc2626" : "#888", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: small ? "12.5px" : "15px", fontWeight: 800, color: highlight ? "#dc2626" : "#171717", marginTop: "2px" }}>{value}</div>
    </div>
  );
}
function MiniRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "12px" }}>
      <span style={{ color: "#666" }}>{label}</span>
      <span style={{ fontWeight: 700, color: valueColor || "#171717", textAlign: "right", maxWidth: "60%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}
function StatusPill({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; fg: string }> = {
    "Viewed": { bg: "#dbeafe", fg: "#1e40af" },
    "Sent": { bg: "#f3f4f6", fg: "#4b5563" },
    "Approved": { bg: "#dcfce7", fg: "#166534" },
    "Converted": { bg: "#fef3c7", fg: "#a16207" },
    "Expired": { bg: "#fee2e2", fg: "#dc2626" },
    "In Production": { bg: "#fef3c7", fg: "#a16207" },
    "Shipped": { bg: "#dbeafe", fg: "#1e40af" },
    "Delivered": { bg: "#dcfce7", fg: "#166534" },
    "Cancelled": { bg: "#fee2e2", fg: "#dc2626" },
  };
  const c = cfg[status] || { bg: "#f3f4f6", fg: "#4b5563" };
  return <span style={{ padding: "2px 8px", background: c.bg, color: c.fg, fontSize: "10.5px", fontWeight: 700, borderRadius: "5px" }}>{status}</span>;
}
function EmptyState({ label, cta }: { label: string; cta?: { label: string; onClick: () => void } }) {
  return (
    <div style={{ padding: "36px 20px", textAlign: "center", color: "#aaa", fontSize: "13px" }}>
      {label}
      {cta && <div style={{ marginTop: "8px" }}><button onClick={cta.onClick} style={{ padding: "6px 14px", background: ACCENT, color: "#fff", border: "none", borderRadius: "8px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>{cta.label}</button></div>}
    </div>
  );
}

// ─── Modals ────────────────────────────────
function AddCustomerModal({ onClose }: any) {
  const [d, setD] = useState({ name: "", company: "", phone: "", email: "", industry: "", instagram: "" });
  return (
    <ModalShell title="＋ Add Customer" onClose={onClose}>
      <FormField label="Full Name *"><input value={d.name} onChange={e => setD({...d, name: e.target.value})} style={inp} /></FormField>
      <FormField label="Company"><input value={d.company} onChange={e => setD({...d, company: e.target.value})} style={inp} /></FormField>
      <FormField label="Phone *"><input value={d.phone} onChange={e => setD({...d, phone: e.target.value})} style={inp} /></FormField>
      <FormField label="Email"><input value={d.email} onChange={e => setD({...d, email: e.target.value})} style={inp} /></FormField>
      <FormField label="Industry"><input value={d.industry} onChange={e => setD({...d, industry: e.target.value})} style={inp} /></FormField>
      <FormField label="Instagram"><input value={d.instagram} onChange={e => setD({...d, instagram: e.target.value})} placeholder="@handle" style={inp} /></FormField>
      <ModalFooter onCancel={onClose} onSave={() => { alert(`Customer "${d.name || "Untitled"}" added`); onClose(); }} saveLabel="Add Customer" />
    </ModalShell>
  );
}
function AddQuoteModal({ customer, onClose }: any) {
  const [product, setProduct] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("");
  const total = (Number(qty) || 0) * (Number(unit) || 0);
  return (
    <ModalShell title={`＋ Add Quote for ${customer.name}`} onClose={onClose}>
      <FormField label="Product *"><input value={product} onChange={e => setProduct(e.target.value)} placeholder="e.g. Folding Cartons" style={inp} /></FormField>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        <FormField label="Quantity *"><input value={qty} onChange={e => setQty(e.target.value.replace(/[^0-9]/g, ""))} placeholder="5000" style={inp} /></FormField>
        <FormField label="Unit Price *"><input value={unit} onChange={e => setUnit(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="3.50" style={inp} /></FormField>
      </div>
      <div style={{ padding: "10px 14px", background: "var(--preview-surface-2)", borderRadius: "8px", display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: "12px", color: "#666" }}>Estimated total</span>
        <span style={{ fontSize: "16px", fontWeight: 800 }}>{fmtMoney(total)}</span>
      </div>
      <ModalFooter onCancel={onClose} onSave={() => { alert(`Quote drafted · ${fmtMoney(total)}`); onClose(); }} saveLabel="Create Quote" />
    </ModalShell>
  );
}
function EditCustomerModal({ customer, onClose }: any) {
  const [d, setD] = useState({ name: customer.name, company: customer.company, phone: customer.phone, email: customer.email });
  return (
    <ModalShell title={`✎ Edit ${customer.name}`} onClose={onClose}>
      <FormField label="Full Name"><input value={d.name} onChange={e => setD({...d, name: e.target.value})} style={inp} /></FormField>
      <FormField label="Company"><input value={d.company} onChange={e => setD({...d, company: e.target.value})} style={inp} /></FormField>
      <FormField label="Phone"><input value={d.phone} onChange={e => setD({...d, phone: e.target.value})} style={inp} /></FormField>
      <FormField label="Email"><input value={d.email} onChange={e => setD({...d, email: e.target.value})} style={inp} /></FormField>
      <ModalFooter onCancel={onClose} onSave={onClose} saveLabel="Save Changes" />
    </ModalShell>
  );
}
function ModalShell({ title, children, onClose }: any) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: "14px", width: "min(480px, 95vw)", padding: "22px 26px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "#f5f5f5", border: "none", borderRadius: "50%", width: "28px", height: "28px", cursor: "pointer" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
function FormField({ label, children }: any) {
  return <div style={{ marginBottom: "12px" }}><label style={{ display: "block", fontSize: "11.5px", fontWeight: 700, color: "#555", marginBottom: "5px" }}>{label}</label>{children}</div>;
}
function ModalFooter({ onCancel, onSave, saveLabel }: any) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px", paddingTop: "14px", borderTop: "1px solid #eee" }}>
      <button onClick={onCancel} style={{ padding: "8px 14px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "8px", fontSize: "12.5px", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
      <button onClick={onSave} style={{ padding: "8px 16px", background: ACCENT, color: "#fff", border: "none", borderRadius: "8px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>{saveLabel}</button>
    </div>
  );
}
const inp: React.CSSProperties = { width: "100%", padding: "9px 12px", border: "1px solid var(--preview-border)", borderRadius: "8px", fontSize: "13px", outline: "none", boxSizing: "border-box" };
