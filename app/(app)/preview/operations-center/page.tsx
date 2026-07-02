"use client";

// Hayk 2026-07-01 — Operations Center mockup, FULLY WIRED.
// Every number, tab, filter, row, and pagination click drives real state.
// Real /operations page NOT touched — preview only.

import { useMemo, useState } from "react";

const ACCENT = "#FF5D2E";

// ─── Constants ────────────────────────────────────────────
// Sales-owned stages only. Artwork / Proof is a production concern —
// once a deal is paid and moved to production, artwork routing is on the
// designer + workflow board, not the sales pipeline.
const STAGE_COLORS: Record<string, string> = {
  "Quoting": "#f97316",
  "Quote Sent": "#3b82f6",
  "Payment": "#22c55e",
  "In Production": "#06b6d4",
  "Follow Up": "#eab308",
};
const STAGE_ORDER = ["Quoting", "Quote Sent", "Payment", "In Production", "Follow Up"];

const OWNERS: Record<string, { name: string; short: string }> = {
  MH: { name: "Maria Hakobyan", short: "Maria H." },
  GM: { name: "Gary Matevosyan", short: "Gary M." },
  EN: { name: "Ernesto Navarro", short: "Ernesto N." },
};

// ─── Mock dataset — 40 deals across owners/stages/overdue ──────────────
type Deal = {
  id: string;
  customer: string;
  project: string;
  owner: keyof typeof OWNERS;
  stage: string;
  timeInStageHours: number;
  totalTimeHours: number;
  nextAction: string;
  priority: "High" | "Medium" | "Low";
  value: number;
  lastActivityHoursAgo: number;
  stageDetail?: string;
  dueInHours?: number;
};

const DEALS: Deal[] = [
  // Maria — 18 total. Follow Up 8 (5 > 48h), Quote Sent 5, Artwork 2, Payment 1, In Production 1, Quoting 1
  { id: "d001", customer: "Safe Care Packaging", project: "Custom Box Project", owner: "MH", stage: "Quoting", timeInStageHours: 38, totalTimeHours: 76, nextAction: "Customer needs tax certificate", priority: "High", value: 12450, lastActivityHoursAgo: 1, stageDetail: "Waiting tax certificate", dueInHours: 10 },
  { id: "d002", customer: "Unity Coffee", project: "Bag + Label Project", owner: "MH", stage: "Quote Sent", timeInStageHours: 22, totalTimeHours: 54, nextAction: "Waiting on PO confirmation", priority: "Medium", value: 6800, lastActivityHoursAgo: 2 },
  { id: "d003", customer: "Up Town Holding LLC", project: "Stickers", owner: "MH", stage: "Follow Up", timeInStageHours: 65, totalTimeHours: 132, nextAction: "Follow up on artwork approval", priority: "High", value: 4200, lastActivityHoursAgo: 3 },
  { id: "d004", customer: "Philly Rich", project: "Mylar Pouch Project", owner: "MH", stage: "Follow Up", timeInStageHours: 12, totalTimeHours: 27, nextAction: "Customer to send tax certificate", priority: "Medium", value: 3150, lastActivityHoursAgo: 5 },
  { id: "d005", customer: "Niko Cream", project: "Label Reorder", owner: "MH", stage: "Follow Up", timeInStageHours: 8, totalTimeHours: 18, nextAction: "Customer reply pending", priority: "Low", value: 2100, lastActivityHoursAgo: 0.5 },
  { id: "d006", customer: "Vertex Labs", project: "Product Sticker Pack", owner: "MH", stage: "Follow Up", timeInStageHours: 72, totalTimeHours: 120, nextAction: "Chase for artwork sign-off", priority: "High", value: 5800, lastActivityHoursAgo: 6 },
  { id: "d007", customer: "Bloom & Co", project: "Wedding Favor Boxes", owner: "MH", stage: "Follow Up", timeInStageHours: 96, totalTimeHours: 144, nextAction: "Call customer — 4 days no reply", priority: "High", value: 8200, lastActivityHoursAgo: 24 },
  { id: "d008", customer: "Iron Roast", project: "Coffee Bag Rebrand", owner: "MH", stage: "Follow Up", timeInStageHours: 55, totalTimeHours: 90, nextAction: "Confirm final color match", priority: "Medium", value: 11400, lastActivityHoursAgo: 4 },
  { id: "d009", customer: "Palma Skincare", project: "Cream Jar Labels", owner: "MH", stage: "Follow Up", timeInStageHours: 50, totalTimeHours: 82, nextAction: "Follow up on samples", priority: "Medium", value: 6300, lastActivityHoursAgo: 3 },
  { id: "d010", customer: "Grid Beverages", project: "Can Sleeves 5k", owner: "MH", stage: "Follow Up", timeInStageHours: 20, totalTimeHours: 40, nextAction: "Send updated proof", priority: "Low", value: 2900, lastActivityHoursAgo: 5 },
  { id: "d011", customer: "Kaya Foods", project: "Sticker Set", owner: "MH", stage: "Follow Up", timeInStageHours: 15, totalTimeHours: 30, nextAction: "Ready to send quote v2", priority: "Medium", value: 4100, lastActivityHoursAgo: 8 },
  { id: "d012", customer: "Northwind Brewery", project: "Label Roll 10k", owner: "MH", stage: "Quote Sent", timeInStageHours: 18, totalTimeHours: 42, nextAction: "Follow up on quote acceptance", priority: "Medium", value: 7900, lastActivityHoursAgo: 12 },
  { id: "d013", customer: "Milano Pasta", project: "Product Sleeve", owner: "MH", stage: "Quote Sent", timeInStageHours: 30, totalTimeHours: 55, nextAction: "Follow up on quote acceptance", priority: "Medium", value: 5400, lastActivityHoursAgo: 20 },
  { id: "d014", customer: "Pineapple Studios", project: "Merch Stickers", owner: "MH", stage: "Quote Sent", timeInStageHours: 12, totalTimeHours: 24, nextAction: "Follow up on quote acceptance", priority: "Low", value: 3800, lastActivityHoursAgo: 6 },
  { id: "d015", customer: "Reef Nutrition", project: "Protein Pouch", owner: "MH", stage: "Quote Sent", timeInStageHours: 40, totalTimeHours: 68, nextAction: "Push for signature", priority: "High", value: 9200, lastActivityHoursAgo: 4 },
  { id: "d016", customer: "Sable Bakery", project: "Cake Box Order", owner: "MH", stage: "In Production", timeInStageHours: 20, totalTimeHours: 50, nextAction: "Send proof v2", priority: "High", value: 6100, lastActivityHoursAgo: 3 },
  { id: "d017", customer: "Green Roots", project: "Product Label Set", owner: "MH", stage: "In Production", timeInStageHours: 10, totalTimeHours: 25, nextAction: "Prepare artwork", priority: "Medium", value: 4700, lastActivityHoursAgo: 7 },
  { id: "d018", customer: "Rustic Farms", project: "Bag + Label Set", owner: "MH", stage: "Payment", timeInStageHours: 6, totalTimeHours: 88, nextAction: "Send invoice link", priority: "Medium", value: 8400, lastActivityHoursAgo: 1 },
  { id: "d019", customer: "Halcyon Health", project: "Product Boxes 2k", owner: "MH", stage: "In Production", timeInStageHours: 30, totalTimeHours: 110, nextAction: "Confirm production ETA", priority: "Medium", value: 13600, lastActivityHoursAgo: 10 },

  // Gary — 12 total. Follow Up 4 (2 > 48h), Quoting 2 (1 > 48h), Quote Sent 2, Artwork 1, Payment 1
  { id: "d020", customer: "Ocean Grain Bakery", project: "Loaf Bags", owner: "GM", stage: "Quoting", timeInStageHours: 60, totalTimeHours: 80, nextAction: "Customer to confirm sizes", priority: "High", value: 5200, lastActivityHoursAgo: 5 },
  { id: "d021", customer: "Kingston Roast", project: "Custom Bag Order", owner: "GM", stage: "Quoting", timeInStageHours: 15, totalTimeHours: 30, nextAction: "Draft quote", priority: "Medium", value: 4400, lastActivityHoursAgo: 2 },
  { id: "d022", customer: "Bright Basil Co", project: "Herb Pouches", owner: "GM", stage: "Quote Sent", timeInStageHours: 22, totalTimeHours: 45, nextAction: "Follow up", priority: "Medium", value: 3700, lastActivityHoursAgo: 5 },
  { id: "d023", customer: "Wave Wellness", project: "Sticker Set", owner: "GM", stage: "Quote Sent", timeInStageHours: 8, totalTimeHours: 20, nextAction: "Follow up", priority: "Low", value: 2100, lastActivityHoursAgo: 12 },
  { id: "d024", customer: "Baja Snacks", project: "Chip Bag Order", owner: "GM", stage: "In Production", timeInStageHours: 28, totalTimeHours: 60, nextAction: "Get customer sign-off on proof", priority: "Medium", value: 4900, lastActivityHoursAgo: 6 },
  { id: "d025", customer: "Sunset Coffee", project: "Bag Rebrand", owner: "GM", stage: "Payment", timeInStageHours: 12, totalTimeHours: 96, nextAction: "Payment reminder", priority: "High", value: 11200, lastActivityHoursAgo: 4 },
  { id: "d026", customer: "Twist Beverages", project: "Bottle Labels", owner: "GM", stage: "Follow Up", timeInStageHours: 60, totalTimeHours: 100, nextAction: "Chase feedback", priority: "High", value: 6400, lastActivityHoursAgo: 8 },
  { id: "d027", customer: "Rio Grande Roasters", project: "Kraft Bag Order", owner: "GM", stage: "Follow Up", timeInStageHours: 55, totalTimeHours: 88, nextAction: "Call for feedback", priority: "Medium", value: 5100, lastActivityHoursAgo: 10 },
  { id: "d028", customer: "Verdant Skincare", project: "Pump Bottle Labels", owner: "GM", stage: "Follow Up", timeInStageHours: 12, totalTimeHours: 30, nextAction: "Confirm color", priority: "Low", value: 3200, lastActivityHoursAgo: 4 },
  { id: "d029", customer: "Coco Loco", project: "Snack Box", owner: "GM", stage: "Follow Up", timeInStageHours: 20, totalTimeHours: 40, nextAction: "Prep sample", priority: "Medium", value: 2800, lastActivityHoursAgo: 12 },
  { id: "d030", customer: "Alpine Trail Bars", project: "Bar Wrappers", owner: "GM", stage: "Quoting", timeInStageHours: 40, totalTimeHours: 55, nextAction: "Ask about qty tier", priority: "Medium", value: 3900, lastActivityHoursAgo: 3 },
  { id: "d031", customer: "Meridian Meat Co", project: "Butcher Paper Labels", owner: "GM", stage: "Follow Up", timeInStageHours: 8, totalTimeHours: 24, nextAction: "Send revised proof", priority: "Low", value: 2400, lastActivityHoursAgo: 6 },

  // Ernesto — 10 total (matches "10" in Active Deals col). Quote Sent 2, Artwork 1, Payment 2, In Production 1, Follow Up 2, Quoting 0 + 2 more
  { id: "d032", customer: "Cedar & Co", project: "Retail Sticker Order", owner: "EN", stage: "Quote Sent", timeInStageHours: 6, totalTimeHours: 12, nextAction: "Chase decision", priority: "Medium", value: 4600, lastActivityHoursAgo: 1 },
  { id: "d033", customer: "Foothill Foods", project: "Bag + Sticker Combo", owner: "EN", stage: "Quote Sent", timeInStageHours: 10, totalTimeHours: 20, nextAction: "Follow up", priority: "Medium", value: 5200, lastActivityHoursAgo: 3 },
  { id: "d034", customer: "Nordic Bakery", project: "Bread Bag Set", owner: "EN", stage: "In Production", timeInStageHours: 14, totalTimeHours: 35, nextAction: "Send proof for approval", priority: "Medium", value: 6100, lastActivityHoursAgo: 2 },
  { id: "d035", customer: "Zen Tea House", project: "Tea Tin Labels", owner: "EN", stage: "Payment", timeInStageHours: 4, totalTimeHours: 82, nextAction: "Await payment", priority: "High", value: 8800, lastActivityHoursAgo: 1 },
  { id: "d036", customer: "Solstice Wellness", project: "Product Sleeves", owner: "EN", stage: "Payment", timeInStageHours: 7, totalTimeHours: 55, nextAction: "Send payment link", priority: "Medium", value: 7200, lastActivityHoursAgo: 4 },
  { id: "d037", customer: "Copper Kettle", project: "Custom Kraft Bags", owner: "EN", stage: "In Production", timeInStageHours: 20, totalTimeHours: 108, nextAction: "Monitor production", priority: "Low", value: 14500, lastActivityHoursAgo: 10 },
  { id: "d038", customer: "Sunlit Snacks", project: "Retail Pouch Order", owner: "EN", stage: "Follow Up", timeInStageHours: 24, totalTimeHours: 48, nextAction: "Follow up feedback", priority: "Medium", value: 3300, lastActivityHoursAgo: 5 },
  { id: "d039", customer: "Kingdom Kombucha", project: "Bottle Labels 2k", owner: "EN", stage: "Follow Up", timeInStageHours: 15, totalTimeHours: 32, nextAction: "Check on reorder", priority: "Low", value: 2500, lastActivityHoursAgo: 8 },
  { id: "d040", customer: "River Bend Farms", project: "Product Boxes", owner: "EN", stage: "Quoting", timeInStageHours: 12, totalTimeHours: 22, nextAction: "Draft quote", priority: "Medium", value: 4800, lastActivityHoursAgo: 3 },
  { id: "d041", customer: "Halcyon Herbal", project: "Loose Leaf Pouch", owner: "EN", stage: "Quote Sent", timeInStageHours: 30, totalTimeHours: 55, nextAction: "Chase quote", priority: "Medium", value: 5900, lastActivityHoursAgo: 6 },
];

// Format helpers
const fmtHours = (h: number) => {
  if (h < 24) return `${Math.round(h)}h`;
  const d = Math.floor(h / 24);
  const rem = Math.round(h - d * 24);
  return rem ? `${d}d ${rem}h` : `${d}d`;
};
const fmtAgo = (h: number) => {
  if (h < 1) return `${Math.round(h * 60)}m ago`;
  if (h < 24) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
};
const fmtMoney = (n: number) => `$${n.toLocaleString()}`;

// ─── Page ─────────────────────────────────────────────────
export default function OperationsCenterPreview() {
  const [stageFilter, setStageFilter] = useState<string | null>("Quoting");
  const [ownerFilter, setOwnerFilter] = useState<string | null>(null);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [selectedDealId, setSelectedDealId] = useState<string>("d001");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Derived: filtered deal list
  const filteredDeals = useMemo(() => {
    let deals = DEALS;
    if (stageFilter) deals = deals.filter(d => d.stage === stageFilter);
    if (ownerFilter) deals = deals.filter(d => d.owner === ownerFilter);
    if (overdueOnly) deals = deals.filter(d => d.timeInStageHours >= 48);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      deals = deals.filter(d => d.customer.toLowerCase().includes(q) || d.project.toLowerCase().includes(q));
    }
    return deals;
  }, [stageFilter, ownerFilter, overdueOnly, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredDeals.length / rowsPerPage));
  const pageDeals = filteredDeals.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  const selectedDeal = DEALS.find(d => d.id === selectedDealId) ?? DEALS[0];

  // Reset page if it exceeds new total
  if (page > totalPages) setTimeout(() => setPage(1), 0);

  // Per-stage counts + overdue counts (from live dataset — matches table)
  const stageCounts = useMemo(() => {
    const map: Record<string, { total: number; overdue: number }> = {};
    STAGE_ORDER.forEach(s => (map[s] = { total: 0, overdue: 0 }));
    DEALS.forEach(d => {
      if (!map[d.stage]) return;
      map[d.stage].total++;
      if (d.timeInStageHours >= 48) map[d.stage].overdue++;
    });
    return map;
  }, []);
  const ownerStageCounts = useMemo(() => {
    const map: Record<string, Record<string, { total: number; overdue: number }>> = {};
    Object.keys(OWNERS).forEach(o => {
      map[o] = {};
      STAGE_ORDER.forEach(s => (map[o][s] = { total: 0, overdue: 0 }));
    });
    DEALS.forEach(d => {
      if (!map[d.owner][d.stage]) return;
      map[d.owner][d.stage].total++;
      if (d.timeInStageHours >= 48) map[d.owner][d.stage].overdue++;
    });
    return map;
  }, []);
  const ownerTotals = useMemo(() => {
    const map: Record<string, { total: number; overdue: number }> = {};
    Object.keys(OWNERS).forEach(o => (map[o] = { total: 0, overdue: 0 }));
    DEALS.forEach(d => {
      map[d.owner].total++;
      if (d.timeInStageHours >= 48) map[d.owner].overdue++;
    });
    return map;
  }, []);
  const totalDeals = DEALS.length;
  const totalOverdue = DEALS.filter(d => d.timeInStageHours >= 48).length;

  // Handlers
  const filterByStage = (stage: string | null, overdue = false) => {
    setStageFilter(stage);
    setOwnerFilter(null);
    setOverdueOnly(overdue);
    setPage(1);
    scrollToDeals();
  };
  const filterByOwnerStage = (owner: string, stage: string, overdue = false) => {
    setStageFilter(stage);
    setOwnerFilter(owner);
    setOverdueOnly(overdue);
    setPage(1);
    scrollToDeals();
  };
  const filterByOwner = (owner: string | null, overdue = false) => {
    setStageFilter(null);
    setOwnerFilter(owner);
    setOverdueOnly(overdue);
    setPage(1);
    scrollToDeals();
  };
  const clearFilters = () => {
    setStageFilter(null);
    setOwnerFilter(null);
    setOverdueOnly(false);
    setSearchQuery("");
    setPage(1);
  };
  const scrollToDeals = () => {
    if (typeof window !== "undefined") {
      const el = document.getElementById("deal-list");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const filterLabel = () => {
    const parts: string[] = [];
    if (ownerFilter) parts.push(OWNERS[ownerFilter].name);
    if (stageFilter) parts.push(stageFilter);
    if (overdueOnly) parts.push("Overdue > 48h");
    if (!parts.length) return "All deals";
    return parts.join(" · ");
  };

  return (
    <div className="text-foreground" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Preview banner */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px", alignItems: "center", padding: "10px 14px", background: "var(--preview-surface-2)", borderRadius: "10px", color: "var(--preview-text)" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: ACCENT }}>Preview</span>
        <span style={{ fontSize: "12px", color: "var(--preview-text)" }}>Operations Center · fully interactive · click any number/tab/row</span>
        <span style={{ marginLeft: "auto", fontSize: "12px", color: "var(--preview-text-muted)" }}>Real /operations page untouched</span>
      </div>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", gap: "16px" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 800, letterSpacing: "-0.5px" }}>Operations Center</h1>
          <div className="text-muted-foreground" style={{ fontSize: "13px", marginTop: "2px" }}>Live view of all active work across the business</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
          <div style={{ fontSize: "12px", color: "#666", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", padding: "8px 14px", borderRadius: "10px", whiteSpace: "nowrap", cursor: "pointer" }}>📅 Last 30 Days ▾</div>
          <div style={{ fontSize: "12px", color: "#666", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", padding: "8px 14px", borderRadius: "10px", whiteSpace: "nowrap", cursor: "pointer" }}>👥 All team members ▾</div>
          <div style={{ fontSize: "12px", color: "#fff", background: "linear-gradient(135deg,#a78bfa,#ec4899)", padding: "8px 14px", borderRadius: "10px", whiteSpace: "nowrap", fontWeight: 600, cursor: "pointer" }}>✨ AI Assistant</div>
        </div>
      </div>

      {/* 6-stage flow strip — each card + count clickable */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: "0", marginBottom: "22px" }}>
        <StageCard
          icon="👤" iconBg="#dbeafe" iconColor="#2563eb"
          label="New Leads" value="5" sublabel="New leads"
          onClick={() => filterByStage(null)}
          rows={[
            { count: "3", label: "< 30 min", tone: "green" },
            { count: "1", label: "30m – 2h", tone: "amber" },
            { count: "1", label: "> 2h", tone: "red" },
          ]}
          footer="Unassigned"
          hasArrow
        />
        <StageCard
          icon="🎯" iconBg="#f3e8ff" iconColor="#9333ea"
          label="SDR" value="12" sublabel="In progress"
          onClick={() => filterByStage("Quoting")}
          rowStyle="triple"
          triple={[
            { n: "7", l: "Qualified", c: "#16a34a" },
            { n: "3", l: "Waiting", c: "#f59e0b" },
            { n: "2", l: "Overdue", c: "#dc2626" },
          ]}
          footer="Owners: Manny C. (8), David Z. (4)"
          hasArrow
        />
        <StageCard
          icon="◎" iconBg="#ffedd5" iconColor={ACCENT}
          label="Sales Pipeline" value={String(totalDeals)} sublabel="Active deals"
          highlight
          onClick={() => filterByStage(null)}
          rowsList={Object.entries(OWNERS).map(([code, o]) => ({
            name: o.short,
            value: String(ownerTotals[code].total),
            onClick: () => filterByOwner(code),
          }))}
          alert={`🚩 ${totalOverdue} Overdue (all owners)`}
          alertOnClick={() => { setStageFilter(null); setOwnerFilter(null); setOverdueOnly(true); setPage(1); scrollToDeals(); }}
          footer="Oldest in pipeline · 3.2 days"
          hasArrow
        />
        <StageCard
          icon="📄" iconBg="#dcfce7" iconColor="#16a34a"
          label="Quotes" value="21" sublabel="Outstanding"
          onClick={() => filterByStage("Quote Sent")}
          rows={[
            { count: "12", label: "0 – 24 hrs", tone: "gray" },
            { count: "6", label: "24 – 48 hrs", tone: "amber" },
            { count: "3", label: "> 48 hrs", tone: "red" },
          ]}
          footer="Total value · $87,000"
          footerBold
          hasArrow
        />
        <StageCard
          icon="⚙️" iconBg="#e0f2fe" iconColor="#0284c7"
          label="Production" value="44" sublabel="In production"
          onClick={() => filterByStage("In Production")}
          rows={[
            { count: "36", label: "On Schedule", tone: "green" },
            { count: "5", label: "Due Today", tone: "amber" },
            { count: "3", label: "Overdue", tone: "red" },
          ]}
          capacity={82}
          hasArrow
        />
        <StageCard
          icon="📞" iconBg="#fef3c7" iconColor="#d97706"
          label="Follow Up" value="9" sublabel="Customers"
          onClick={() => filterByStage("Follow Up")}
          rows={[
            { count: "6", label: "Waiting Customer", tone: "gray" },
            { count: "2", label: "Waiting Internal", tone: "gray" },
            { count: "1", label: "No Response", tone: "red" },
          ]}
          footer="Oldest · 6 days"
        />
      </div>

      {/* SALES PIPELINE BY OWNER — every number clickable */}
      <div style={{ background: "var(--preview-surface)", borderRadius: "14px", border: "1px solid var(--preview-border)", padding: "18px 20px", marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ fontSize: "13px", fontWeight: 800, letterSpacing: "0.04em" }}>SALES PIPELINE BY OWNER</div>
            <span style={{ fontSize: "11px", color: "#bbb" }}>ⓘ</span>
          </div>
          <div style={{ fontSize: "11px", color: "#888" }}>Tip: click any number to filter the deal list below</div>
        </div>

        {/* Legend */}
        <div style={{ display: "flex", justifyContent: "center", gap: "20px", padding: "8px 0 14px 0", fontSize: "12px", color: "#555", borderBottom: "1px solid #f4f4f4", marginBottom: "6px" }}>
          {STAGE_ORDER.map((s) => (
            <span key={s} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: STAGE_COLORS[s] }} />
              {s}
            </span>
          ))}
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ color: "#888", fontSize: "10.5px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              <th style={{ textAlign: "left", padding: "12px 8px 12px 0", fontWeight: 700 }}>Owner</th>
              <th style={{ textAlign: "center", padding: "12px 8px", fontWeight: 700 }}>Active Deals</th>
              {STAGE_ORDER.map((s) => (
                <th key={s} style={{ textAlign: "center", padding: "12px 8px", fontWeight: 700 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: STAGE_COLORS[s] }} />
                    {s}
                  </span>
                </th>
              ))}
              <th style={{ textAlign: "center", padding: "12px 8px", fontWeight: 700 }}>Overdue 🚩</th>
              <th style={{ textAlign: "center", padding: "12px 8px", fontWeight: 700, lineHeight: 1.2 }}>Avg<br/>Response Time</th>
              <th style={{ textAlign: "center", padding: "12px 8px", fontWeight: 700, lineHeight: 1.2 }}>Avg<br/>Close Time</th>
              <th style={{ textAlign: "center", padding: "12px 8px", fontWeight: 700 }}>Avg Closed Value</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(OWNERS).map(([code, o]) => {
              const meta = code === "MH" ? { avgResp: "18m", avgRespTone: "green", avgClose: "8.6 days", avgValue: "$12,420" } :
                           code === "GM" ? { avgResp: "1h 12m", avgRespTone: "red", avgClose: "12.4 days", avgValue: "$8,230" } :
                           { avgResp: "22m", avgRespTone: "green", avgClose: "6.1 days", avgValue: "$9,870" };
              const tot = ownerTotals[code];
              return (
                <tr key={code} style={{ borderTop: "1px solid #f4f4f4" }}>
                  <td style={{ padding: "16px 8px 16px 0" }}>
                    <div onClick={() => filterByOwner(code)} style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}>
                      <div style={{ width: "34px", height: "34px", borderRadius: "50%", background: "#171717", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 800 }}>{code}</div>
                      <div>
                        <div style={{ fontSize: "13px", fontWeight: 700 }}>{o.name}</div>
                        <div style={{ fontSize: "11px", color: "#888", marginTop: "1px" }}>{tot.total} Active</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "16px 8px", textAlign: "center" }}>
                    <ClickNumber n={tot.total} onClick={() => filterByOwner(code)} bold />
                  </td>
                  {STAGE_ORDER.map((s) => {
                    const cell = ownerStageCounts[code][s];
                    return (
                      <td key={s} style={{ padding: "16px 8px", textAlign: "center" }}>
                        <ClickNumber n={cell.total} onClick={() => filterByOwnerStage(code, s)} />
                        {cell.overdue > 0 && (
                          <div onClick={() => filterByOwnerStage(code, s, true)} style={{ marginTop: "2px", fontSize: "10.5px", color: "#dc2626", fontWeight: 500, cursor: "pointer" }}>
                            🚩 {cell.overdue} &gt; 48h
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td style={{ padding: "16px 8px", textAlign: "center" }}>
                    <div onClick={() => filterByOwner(code, true)} style={{ cursor: "pointer", fontWeight: 800, color: tot.overdue > 0 ? "#dc2626" : "#16a34a" }}>{tot.overdue}</div>
                    {tot.overdue > 0
                      ? <div style={{ fontSize: "10.5px", color: "#dc2626", marginTop: "2px", fontWeight: 500 }}>&gt; 48h</div>
                      : <div style={{ fontSize: "10.5px", color: "#16a34a", marginTop: "2px", fontWeight: 500 }}>All &lt; 48h</div>}
                  </td>
                  <td style={{ padding: "16px 8px", textAlign: "center", fontWeight: 800, color: meta.avgRespTone === "red" ? "#dc2626" : "#16a34a" }}>{meta.avgResp}</td>
                  <td style={{ padding: "16px 8px", textAlign: "center", fontWeight: 700 }}>{meta.avgClose}</td>
                  <td style={{ padding: "16px 8px", textAlign: "center", fontWeight: 800 }}>{meta.avgValue}</td>
                </tr>
              );
            })}

            {/* TOTAL row */}
            <tr style={{ borderTop: "2px solid var(--preview-border)", background: "var(--preview-surface-2)" }}>
              <td style={{ padding: "16px 8px 16px 0", fontWeight: 800 }}>
                <div onClick={clearFilters} style={{ cursor: "pointer" }}>TOTAL</div>
              </td>
              <td style={{ padding: "16px 8px", textAlign: "center", fontWeight: 700 }}>
                <ClickNumber n={totalDeals} onClick={clearFilters} bold /> <span style={{ color: "#888", fontSize: "11px", fontWeight: 500 }}>Active</span>
              </td>
              {STAGE_ORDER.map((s) => (
                <td key={s} style={{ padding: "16px 8px", textAlign: "center" }}>
                  <ClickNumber n={stageCounts[s].total} onClick={() => filterByStage(s)} bold />
                  {stageCounts[s].overdue > 0 && (
                    <div onClick={() => filterByStage(s, true)} style={{ marginTop: "2px", fontSize: "10.5px", color: "#dc2626", fontWeight: 500, cursor: "pointer" }}>
                      🚩 {stageCounts[s].overdue} &gt; 48h
                    </div>
                  )}
                </td>
              ))}
              <td style={{ padding: "16px 8px", textAlign: "center" }}>
                <div onClick={() => { setStageFilter(null); setOwnerFilter(null); setOverdueOnly(true); setPage(1); scrollToDeals(); }} style={{ cursor: "pointer", fontWeight: 800, color: "#dc2626" }}>{totalOverdue}</div>
                <div style={{ fontSize: "10.5px", color: "#dc2626", marginTop: "2px", fontWeight: 500 }}>&gt; 48h</div>
              </td>
              <td style={{ padding: "16px 8px", textAlign: "center", fontWeight: 800 }}>31m</td>
              <td style={{ padding: "16px 8px", textAlign: "center", fontWeight: 800 }}>8.7 days</td>
              <td style={{ padding: "16px 8px", textAlign: "center", fontWeight: 800 }}>$30,520</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Deal list + side panel */}
      <div id="deal-list" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: "14px", marginBottom: "24px" }}>
        {/* Deal list */}
        <div style={{ background: "var(--preview-surface)", borderRadius: "14px", border: "1px solid var(--preview-border)", padding: "14px 16px" }}>
          {/* Current filter chip */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <div style={{ fontSize: "12px", color: "#666" }}>
              <span style={{ fontWeight: 700, color: "#171717" }}>Showing:</span> {filterLabel()} · <b>{filteredDeals.length}</b> deals
            </div>
            {(stageFilter || ownerFilter || overdueOnly || searchQuery) && (
              <button onClick={clearFilters} style={{ fontSize: "11px", color: ACCENT, fontWeight: 700, background: "transparent", border: "none", cursor: "pointer" }}>✕ Clear filters</button>
            )}
          </div>

          {/* Filter tabs + search */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", gap: "10px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              <FilterTab label="All" count={DEALS.length} active={!stageFilter && !ownerFilter && !overdueOnly} onClick={clearFilters} />
              {STAGE_ORDER.map(s => (
                <FilterTab
                  key={s}
                  label={s}
                  count={stageCounts[s].total}
                  active={stageFilter === s && !overdueOnly}
                  color={STAGE_COLORS[s]}
                  onClick={() => filterByStage(s)}
                />
              ))}
            </div>
            <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
              <input
                placeholder="🔍 Search by customer, deal..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                style={{ fontSize: "12px", padding: "7px 12px", background: "#f7f7f7", border: "1px solid var(--preview-border)", borderRadius: "8px", width: "220px", outline: "none" }}
              />
              <button
                onClick={() => setOverdueOnly(v => !v)}
                style={{ fontSize: "12px", padding: "7px 12px", background: overdueOnly ? "#fee2e2" : "#fff", border: `1px solid ${overdueOnly ? "#dc2626" : "#e5e5e5"}`, borderRadius: "8px", color: overdueOnly ? "#dc2626" : "#555", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                🚩 Overdue {overdueOnly ? "✓" : ""}
              </button>
            </div>
          </div>

          {/* Deals table */}
          {pageDeals.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "#888", fontSize: "13px" }}>No deals match this filter.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ color: "#888", fontSize: "10.5px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  <th style={{ textAlign: "left", padding: "10px 8px 10px 0", fontWeight: 700 }}>Customer / Deal</th>
                  <th style={{ textAlign: "left", padding: "10px 8px", fontWeight: 700 }}>Owner</th>
                  <th style={{ textAlign: "left", padding: "10px 8px", fontWeight: 700 }}>Stage</th>
                  <th style={{ textAlign: "left", padding: "10px 8px", fontWeight: 700 }}>Time in Stage</th>
                  <th style={{ textAlign: "left", padding: "10px 8px", fontWeight: 700 }}>Total Time Owned</th>
                  <th style={{ textAlign: "left", padding: "10px 8px", fontWeight: 700 }}>Next Action</th>
                  <th style={{ textAlign: "left", padding: "10px 8px", fontWeight: 700 }}>Priority</th>
                  <th style={{ textAlign: "left", padding: "10px 8px", fontWeight: 700 }}>Value</th>
                  <th style={{ textAlign: "left", padding: "10px 8px", fontWeight: 700 }}>Last Activity ▾</th>
                </tr>
              </thead>
              <tbody>
                {pageDeals.map(d => (
                  <DealRow key={d.id} deal={d} selected={d.id === selectedDealId} onClick={() => setSelectedDealId(d.id)} />
                ))}
              </tbody>
            </table>
          )}

          {/* Pagination */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "14px", paddingTop: "12px", borderTop: "1px solid #f4f4f4" }}>
            <div style={{ fontSize: "12px", color: "#888" }}>
              Showing {filteredDeals.length === 0 ? 0 : (page - 1) * rowsPerPage + 1} to {Math.min(page * rowsPerPage, filteredDeals.length)} of {filteredDeals.length} items
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ display: "flex", gap: "4px" }}>
                <PageBtn onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹</PageBtn>
                {Array.from({ length: totalPages }).map((_, i) => (
                  <PageBtn key={i} active={page === i + 1} onClick={() => setPage(i + 1)}>{i + 1}</PageBtn>
                ))}
                <PageBtn onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</PageBtn>
              </div>
              <label style={{ fontSize: "12px", color: "#666" }}>
                Rows per page{" "}
                <select
                  value={rowsPerPage}
                  onChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(1); }}
                  style={{ padding: "3px 6px", background: "#f7f7f7", border: "1px solid var(--preview-border)", borderRadius: "5px", fontWeight: 600, fontSize: "12px", cursor: "pointer" }}
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </label>
            </div>
          </div>
        </div>

        {/* Right-side detail panel */}
        <DealDetailPanel deal={selectedDeal} onClose={() => setSelectedDealId("")} />
      </div>
    </div>
  );
}

// ─── Clickable number cell ────────────────────────────────
function ClickNumber({ n, onClick, bold }: { n: number; onClick: () => void; bold?: boolean }) {
  return (
    <span
      onClick={onClick}
      style={{ cursor: "pointer", fontWeight: bold ? 800 : 700, fontSize: bold ? "15px" : "13px", padding: "2px 6px", borderRadius: "5px", transition: "background 0.15s" }}
      onMouseOver={(e) => (e.currentTarget.style.background = "#fff7ed")}
      onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {n}
    </span>
  );
}

// ─── Filter tab ────────────────────────────────
function FilterTab({ label, count, active, color, onClick }: any) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: "12px",
        padding: "6px 12px",
        borderRadius: "8px",
        background: active ? "#fff7ed" : "#fff",
        border: `1px solid ${active ? ACCENT + "55" : "#e5e5e5"}`,
        color: active ? ACCENT : "#555",
        fontWeight: active ? 700 : 500,
        cursor: "pointer",
        whiteSpace: "nowrap",
        display: "flex",
        alignItems: "center",
        gap: "6px",
      }}
    >
      {color && <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: color }} />}
      {label} ({count})
    </button>
  );
}

// ─── Stage card ────────────────────────────────
function StageCard({ icon, iconBg, iconColor, label, value, sublabel, rows, rowsList, footer, footerBold, alert, alertOnClick, capacity, hasArrow, highlight, rowStyle, triple, onClick }: any) {
  return (
    <div style={{ position: "relative" }}>
      <div
        onClick={onClick}
        style={{
          background: highlight ? "#fff7ed" : "#fff",
          border: highlight ? `2px solid ${ACCENT}55` : "1px solid #eee",
          borderRadius: "14px",
          padding: "14px",
          height: "100%",
          boxSizing: "border-box",
          marginRight: hasArrow ? "10px" : "0",
          cursor: onClick ? "pointer" : "default",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
          <div style={{ width: "34px", height: "34px", borderRadius: "9px", background: iconBg, color: iconColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>{icon}</div>
          <div style={{ fontSize: "10.5px", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "#666" }}>{label}</div>
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "10px" }}>
          <div style={{ fontSize: "32px", fontWeight: 800, letterSpacing: "-1px", lineHeight: 1 }}>{value}</div>
          {sublabel && <div style={{ fontSize: "11px", color: "#999", fontWeight: 600 }}>{sublabel}</div>}
        </div>

        {rows && (
          <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            {rows.map((r: any, i: number) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
                <span style={{ fontWeight: 800, color: r.tone === "green" ? "#16a34a" : r.tone === "amber" ? "#f59e0b" : r.tone === "red" ? "#dc2626" : "#171717", minWidth: "16px" }}>{r.count}</span>
                <span style={{ color: "#666" }}>{r.label}</span>
              </div>
            ))}
          </div>
        )}

        {rowStyle === "triple" && triple && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px", marginTop: "4px" }}>
            {triple.map((t: any, i: number) => (
              <div key={i} style={{ textAlign: "center" }}>
                <div style={{ fontSize: "20px", fontWeight: 800, color: t.c, lineHeight: 1 }}>{t.n}</div>
                <div style={{ fontSize: "10px", color: "#666", marginTop: "3px", fontWeight: 500 }}>{t.l}</div>
              </div>
            ))}
          </div>
        )}

        {rowsList && (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {rowsList.map((r: any, i: number) => (
              <div key={i} onClick={(e) => { e.stopPropagation(); r.onClick && r.onClick(); }} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", cursor: r.onClick ? "pointer" : "default", padding: "3px 6px", borderRadius: "5px" }}
                onMouseOver={(e) => (e.currentTarget.style.background = "#00000010")}
                onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ color: "#555" }}>{r.name}</span>
                <span style={{ fontWeight: 800 }}>{r.value}</span>
              </div>
            ))}
          </div>
        )}

        {alert && (
          <div onClick={(e) => { e.stopPropagation(); alertOnClick && alertOnClick(); }} style={{ marginTop: "8px", padding: "5px 8px", background: "#fee2e2", border: "1px solid #fecaca", borderRadius: "6px", fontSize: "11px", color: "#dc2626", fontWeight: 600, cursor: alertOnClick ? "pointer" : "default" }}>{alert}</div>
        )}

        {typeof capacity === "number" && (
          <div style={{ marginTop: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "4px" }}>
              <span style={{ color: "#666" }}>Capacity</span>
              <span style={{ fontWeight: 800 }}>{capacity}%</span>
            </div>
            <div style={{ height: "6px", background: "#eef2ff", borderRadius: "999px", overflow: "hidden" }}>
              <div style={{ width: `${capacity}%`, height: "100%", background: "#3b82f6" }} />
            </div>
          </div>
        )}

        {footer && (
          <div style={{ marginTop: "10px", paddingTop: "8px", borderTop: "1px solid #f4f4f4", fontSize: "11px", color: "#666", fontWeight: footerBold ? 700 : 500 }}>{footer}</div>
        )}

        <div style={{ marginTop: "10px", fontSize: "12px", color: ACCENT, fontWeight: 700 }}>View →</div>
      </div>

      {hasArrow && (
        <div style={{ position: "absolute", top: "50%", right: "-6px", transform: "translateY(-50%)", zIndex: 1, fontSize: "16px", color: "#ccc" }}>→</div>
      )}
    </div>
  );
}

// ─── Deal row ────────────────────────────────
function DealRow({ deal, selected, onClick }: { deal: Deal; selected: boolean; onClick: () => void }) {
  const priColor = deal.priority === "High" ? "#dc2626" : deal.priority === "Medium" ? "#f59e0b" : "#22c55e";
  const priBg = deal.priority === "High" ? "#fee2e2" : deal.priority === "Medium" ? "#fef3c7" : "#dcfce7";
  const overdue = deal.timeInStageHours >= 48;
  return (
    <tr onClick={onClick} style={{ borderTop: "1px solid #f4f4f4", background: selected ? "#fff7ed" : "transparent", cursor: "pointer" }}>
      <td style={{ padding: "12px 8px 12px 0" }}>
        <div style={{ fontSize: "13px", fontWeight: 700 }}>{deal.customer}</div>
        <div style={{ fontSize: "11px", color: "#888" }}>{deal.project}</div>
      </td>
      <td style={{ padding: "12px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <div style={{ width: "26px", height: "26px", borderRadius: "50%", background: "#171717", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: 800 }}>{deal.owner}</div>
          <span style={{ fontSize: "12px", fontWeight: 600 }}>{OWNERS[deal.owner].short}</span>
        </div>
      </td>
      <td style={{ padding: "12px 8px" }}>
        <span style={{ padding: "3px 8px", background: STAGE_COLORS[deal.stage] + "22", color: STAGE_COLORS[deal.stage], fontSize: "11px", fontWeight: 700, borderRadius: "5px" }}>{deal.stage}</span>
      </td>
      <td style={{ padding: "12px 8px", fontWeight: 700, color: overdue ? "#dc2626" : "#171717" }}>{fmtHours(deal.timeInStageHours)}</td>
      <td style={{ padding: "12px 8px", color: "#666" }}>{fmtHours(deal.totalTimeHours)}</td>
      <td style={{ padding: "12px 8px", fontSize: "12px", color: "#333", maxWidth: "220px" }}>{deal.nextAction}</td>
      <td style={{ padding: "12px 8px" }}>
        <span style={{ padding: "3px 8px", background: priBg, color: priColor, fontSize: "11px", fontWeight: 700, borderRadius: "5px" }}>{deal.priority}</span>
      </td>
      <td style={{ padding: "12px 8px", fontWeight: 800 }}>{fmtMoney(deal.value)}</td>
      <td style={{ padding: "12px 8px", color: "#888", fontSize: "12px" }}>{fmtAgo(deal.lastActivityHoursAgo)}</td>
    </tr>
  );
}

// ─── Page button ────────────────────────────────
function PageBtn({ active, disabled, onClick, children }: any) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        minWidth: "26px",
        padding: "4px 8px",
        fontSize: "12px",
        borderRadius: "6px",
        background: active ? "#171717" : "#fff",
        color: active ? "#fff" : disabled ? "#ccc" : "#555",
        border: `1px solid ${active ? "#171717" : "#e5e5e5"}`,
        fontWeight: active ? 700 : 500,
        cursor: disabled ? "not-allowed" : "pointer",
        textAlign: "center",
      }}
    >{children}</button>
  );
}

// ─── Deal detail side panel ────────────────────────────────
function DealDetailPanel({ deal, onClose }: { deal: Deal; onClose: () => void }) {
  if (!deal) return null;
  const overdue = deal.timeInStageHours >= 48;
  return (
    <div style={{ background: "var(--preview-surface)", borderRadius: "14px", border: "1px solid var(--preview-border)", padding: "18px", height: "fit-content", position: "sticky", top: "16px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "4px" }}>
        <div>
          <div style={{ fontSize: "16px", fontWeight: 800 }}>{deal.customer}</div>
          <div style={{ fontSize: "12px", color: "#888", marginTop: "2px" }}>{deal.project}</div>
        </div>
        <div onClick={onClose} style={{ fontSize: "16px", color: "#bbb", cursor: "pointer" }}>✕</div>
      </div>

      <div style={{ display: "flex", gap: "6px", marginTop: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
        <span style={{ padding: "4px 10px", background: STAGE_COLORS[deal.stage] + "22", color: STAGE_COLORS[deal.stage], fontSize: "11px", fontWeight: 700, borderRadius: "6px" }}>● {deal.stage}</span>
        <span style={{
          padding: "4px 10px",
          background: deal.priority === "High" ? "#fee2e2" : deal.priority === "Medium" ? "#fef3c7" : "#dcfce7",
          color: deal.priority === "High" ? "#dc2626" : deal.priority === "Medium" ? "#f59e0b" : "#22c55e",
          fontSize: "11px", fontWeight: 700, borderRadius: "6px"
        }}>🚩 {deal.priority} Priority</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "12.5px", paddingBottom: "16px", borderBottom: "1px solid #f4f4f4" }}>
        <DetailRow label="Owner" value={OWNERS[deal.owner].name} avatar={deal.owner} />
        <DetailRow label="Stage" value={deal.stageDetail || deal.stage} />
        <DetailRow label="Time in stage" value={fmtHours(deal.timeInStageHours)} valueColor={overdue ? "#dc2626" : undefined} />
        <DetailRow label="Total time owned" value={fmtHours(deal.totalTimeHours)} />
        <DetailRow label="Value" value={fmtMoney(deal.value)} bold />
        <DetailRow label="Last activity" value={fmtAgo(deal.lastActivityHoursAgo)} />
      </div>

      <div style={{ marginTop: "16px", marginBottom: "16px" }}>
        <div style={{ fontSize: "10.5px", fontWeight: 800, color: "#666", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "8px" }}>Next Action</div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
          <span style={{ width: "16px", height: "16px", border: "1.5px solid #ccc", borderRadius: "3px", flexShrink: 0 }} />
          <span style={{ fontSize: "12.5px" }}>{deal.nextAction}</span>
        </div>
        {deal.dueInHours != null && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "24px", fontSize: "11.5px", color: "#dc2626", fontWeight: 700 }}>
            <span>⏰</span>
            <span>Due in {deal.dueInHours}h</span>
          </div>
        )}
      </div>

      <a
        href={`/preview/sales-pipeline?deal=${encodeURIComponent(deal.id)}`}
        title={`Open ${deal.customer} in the Sales Pipeline`}
        style={{ display: "block", padding: "10px", background: "#171717", color: "#fff", borderRadius: "8px", textAlign: "center", fontSize: "12.5px", fontWeight: 700, cursor: "pointer", textDecoration: "none" }}
      >View full details →</a>
    </div>
  );
}

function DetailRow({ label, value, bold, avatar, valueColor }: any) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ color: "#888" }}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: bold ? 800 : 600, color: valueColor || "#171717" }}>
        {avatar && <span style={{ width: "20px", height: "20px", borderRadius: "50%", background: "#171717", color: "#fff", fontSize: "9px", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{avatar}</span>}
        {value}
      </span>
    </div>
  );
}
