import { randomUUID } from "crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import { PRODUCT_INTERESTS } from "@/lib/types";
import { normalizeAuthority } from "@/lib/utils/authority";
import { digitsOnly } from "@/lib/utils/phone";
import { normalizeWebsite, validateWebsite } from "@/lib/utils/website";
import { validateLeadInterestsPayload } from "@/lib/utils/validate-lead-product-interests";
import {
  type LookupOption,
  slugToLookupLabel,
  formatLookupOptionsHint,
} from "@/lib/utils/bulk-import-shared";
export type { LookupOption };

type AdminClient = ReturnType<typeof createAdminClient>;

export const BULK_IMPORT_MAX_ROWS = 500;

const PRODUCT_SET = new Set<string>(PRODUCT_INTERESTS);

const CLOSED_LEAD_STATUSES = new Set(["Rejected", "Duplicate"]);

export interface BulkLeadImportRowInput {
  first_name?: unknown;
  last_name?: unknown;
  phone?: unknown;
  email?: unknown;
  company?: unknown;
  industry?: unknown;
  source?: unknown;
  brand?: unknown;
  website?: unknown;
  authority?: unknown;
  urgency?: unknown;
  is_returning_customer?: unknown;
  sdr_comment?: unknown;
  interests?: unknown;
  quantities?: unknown;
  has_design?: unknown;
  external_id?: unknown;
}

export interface BulkLeadImportFileInput {
  version?: unknown;
  imported_by_note?: unknown;
  skip_duplicate_phones?: unknown;
  create_missing_lookups?: unknown;
  leads?: unknown;
  _lookups?: unknown;
  _products?: unknown;
  _urgency?: unknown;
}

export interface BulkLeadImportOptions {
  skipDuplicatePhones: boolean;
  importedByNote: string | null;
  createMissingLookups: boolean;
}

export interface BulkImportLookupsReference {
  source: LookupOption[];
  industry: LookupOption[];
  products: string[];
  urgency: LookupOption[];
}

export interface BulkLeadImportRowPreview {
  first_name: string;
  last_name: string | null;
  phone: string;
  email: string | null;
  company: string | null;
  source: string;
  industry: string;
  external_id: string | null;
}

export type BulkImportRowStatus = "valid" | "error" | "skipped";

export interface BulkImportRowResult {
  row_index: number;
  status: BulkImportRowStatus;
  errors: string[];
  warnings: string[];
  preview: BulkLeadImportRowPreview | null;
  lead_id?: string;
}

export interface BulkImportSummary {
  total_rows: number;
  valid_count: number;
  error_count: number;
  skipped_count: number;
  created_count: number;
  rows: BulkImportRowResult[];
  batch_id?: string;
}

export interface ParsedBulkImportFile {
  options: BulkLeadImportOptions;
  rows: BulkLeadImportRowInput[];
}

export interface BulkImportLookupSets {
  sources: Set<string>;
  industries: Set<string>;
  sourceOptions: LookupOption[];
  industryOptions: LookupOption[];
}

function trimStr(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeUrgency(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (!v || v === "not_defined" || v === "not defined") return null;
  if (v === "high") return "High";
  if (v === "medium") return "Medium";
  if (v === "low") return "Low";
  return null;
}

export function parseBulkLeadImportFile(raw: unknown): { ok: true; file: ParsedBulkImportFile } | { ok: false; error: string } {
  const root = asRecord(raw);
  if (!root) {
    return { ok: false, error: "JSON must be an object with a leads array." };
  }

  if (!Array.isArray(root.leads)) {
    return { ok: false, error: 'Missing "leads" array.' };
  }

  if (root.leads.length === 0) {
    return { ok: false, error: "leads array is empty — add at least one lead." };
  }

  if (root.leads.length > BULK_IMPORT_MAX_ROWS) {
    return { ok: false, error: `Too many rows (${root.leads.length}). Maximum is ${BULK_IMPORT_MAX_ROWS} per file.` };
  }

  if (root.version != null && typeof root.version !== "number") {
    return { ok: false, error: '"version" must be a number when provided.' };
  }

  const skipDuplicatePhones = root.skip_duplicate_phones !== false;
  const createMissingLookups = root.create_missing_lookups === true;

  return {
    ok: true,
    file: {
      options: {
        skipDuplicatePhones,
        importedByNote: trimStr(root.imported_by_note) || null,
        createMissingLookups,
      },
      rows: root.leads as BulkLeadImportRowInput[],
    },
  };
}

function isValidLookupSlug(slug: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(slug) && slug.length <= 64;
}


export async function loadBulkImportLookupsReference(admin: AdminClient): Promise<BulkImportLookupsReference> {
  const { data, error } = await admin
    .from("lookup_values")
    .select("category, value, label")
    .in("category", ["source", "industry", "urgency"])
    .eq("is_active", true)
    .order("sort_order");

  if (error) throw new Error(error.message);

  const source: LookupOption[] = [];
  const industry: LookupOption[] = [];
  const urgency: LookupOption[] = [];

  for (const row of data ?? []) {
    const opt = { value: String(row.value), label: String(row.label) };
    if (row.category === "source") source.push(opt);
    if (row.category === "industry") industry.push(opt);
    if (row.category === "urgency") urgency.push(opt);
  }

  return {
    source,
    industry,
    products: [...PRODUCT_INTERESTS],
    urgency,
  };
}

export async function loadBulkImportLookupSets(admin: AdminClient): Promise<BulkImportLookupSets> {
  const ref = await loadBulkImportLookupsReference(admin);
  return {
    sources: new Set(ref.source.map((o) => o.value)),
    industries: new Set(ref.industry.map((o) => o.value)),
    sourceOptions: ref.source,
    industryOptions: ref.industry,
  };
}

/** AI-facing instructions embedded in the downloadable import template. */
export function buildBulkImportDocumentation(ref: BulkImportLookupsReference): Record<string, unknown> {
  const exampleSource = ref.source.find((s) => s.value === "email") ?? ref.source[0];
  const exampleIndustry = ref.industry.find((i) => i.value === "cannabis_cbd") ?? ref.industry[0];

  return {
    purpose: "Bulk import leads into BazaarPrinting CRM. Generate a JSON file matching this schema exactly.",
    audience: "AI assistants or scripts converting data from Instantly, spreadsheets, or other CRMs.",
    output_format: "Single JSON object. Root must include a leads array. Keys starting with _ are documentation only — ignored on import.",
    instructions: [
      "Return valid JSON only — no markdown fences, no commentary outside the JSON.",
      "Put one object per person in the leads array (max 500).",
      "Every lead MUST include: first_name, phone, source, industry.",
      "For source and industry: copy the value slug from _lookups (e.g. email, cannabis_cbd) — NEVER use the human label (e.g. Email, Cannabis & CBD).",
      "If the closest source/industry is not in _lookups: either pick the nearest match OR set root create_missing_lookups to true and use a new lowercase slug (letters, numbers, underscores only).",
      "phone: digits only or formatted — at least 10 digits after normalization.",
      "If interests is non-empty: every true product in interests needs quantities[product] > 0; product names must match _lookups.products exactly.",
      "urgency: high | medium | low (maps to High/Medium/Low) or omit.",
      "authority: yes | no or omit.",
      "external_id: optional trace id from the source system — stored in activity log only.",
      "Replace the single example lead in leads with all real rows; remove fictional data.",
    ],
    root_fields: {
      version: "number — use 1",
      imported_by_note: "optional string — batch note for staff",
      skip_duplicate_phones: "boolean — default true; skip when open lead exists for same phone",
      create_missing_lookups: "boolean — default false; if true, auto-create unknown source/industry slugs on import",
      leads: "array — required; list of lead objects (see lead_fields)",
    },
    lead_fields: {
      required: {
        first_name: "string",
        phone: "string — min 10 digits",
        source: `string — MUST be value slug from _lookups.source (example: ${exampleSource?.value ?? "email"})`,
        industry: `string — MUST be value slug from _lookups.industry (example: ${exampleIndustry?.value ?? "other"})`,
      },
      optional: {
        last_name: "string",
        email: "string",
        company: "string",
        brand: "string",
        website: "string — full URL with https://",
        authority: "yes | no",
        urgency: "high | medium | low",
        is_returning_customer: "boolean",
        sdr_comment: "string — internal note for SDR",
        interests: "object — product name → true, e.g. { \"Labels\": true }",
        quantities: "object — product name → numeric string, e.g. { \"Labels\": \"10000\" }",
        has_design: "object — product name → boolean",
        external_id: "string — id from external system",
      },
    },
    example_values: {
      source: {
        use_this_value: exampleSource?.value ?? "email",
        not_this_label: exampleSource?.label ?? "Email",
      },
      industry: {
        use_this_value: exampleIndustry?.value ?? "other",
        not_this_label: exampleIndustry?.label ?? "Other",
      },
    },
    validation: "CRM validates before import. Invalid source/industry rows are rejected unless create_missing_lookups is true.",
  };
}

export async function buildBulkImportTemplate(admin: AdminClient): Promise<Record<string, unknown>> {
  const ref = await loadBulkImportLookupsReference(admin);
  const exampleSource = ref.source.find((s) => s.value === "email")?.value ?? ref.source[0]?.value ?? "email";
  const exampleIndustry =
    ref.industry.find((i) => i.value === "cannabis_cbd")?.value ?? ref.industry[0]?.value ?? "other";

  return {
    version: 1,
    _documentation: buildBulkImportDocumentation(ref),
    _lookups: {
      how_to_use: "Pick source and industry from value column below. Full list for matching — not every value must appear in leads.",
      source: ref.source,
      industry: ref.industry,
      urgency: ref.urgency,
      products: ref.products,
    },
    imported_by_note: "REPLACE — short note about this batch (e.g. Instantly campaign April 2026)",
    skip_duplicate_phones: true,
    create_missing_lookups: false,
    leads: [
      {
        _note: "DELETE this key — example row only. Duplicate this object shape for each real lead.",
        first_name: "Jane",
        last_name: "Rivera",
        phone: "4155551234",
        email: "jane@example.com",
        company: "Acme Print Co",
        industry: exampleIndustry,
        source: exampleSource,
        brand: "BazaarPrinting",
        website: "https://acmeprint.com",
        authority: "yes",
        urgency: "high",
        is_returning_customer: false,
        sdr_comment: "Optional internal note",
        interests: { Labels: true },
        quantities: { Labels: "10000" },
        has_design: { Labels: true },
        external_id: "your-system-lead-id-123",
      },
    ],
  };
}

async function insertLookupIfMissing(
  admin: AdminClient,
  category: "source" | "industry",
  value: string,
): Promise<boolean> {
  const { data: existing } = await admin
    .from("lookup_values")
    .select("id")
    .eq("category", category)
    .eq("value", value)
    .maybeSingle();

  if (existing) return false;

  const { data: sortRow } = await admin
    .from("lookup_values")
    .select("sort_order")
    .eq("category", category)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextSort = ((sortRow?.sort_order as number | undefined) ?? -1) + 1;
  const label = slugToLookupLabel(value);

  const { error } = await admin.from("lookup_values").insert({
    category,
    value,
    label,
    sort_order: nextSort,
    is_active: true,
  });

  if (error) {
    if (error.code === "23505") return false;
    throw new Error(error.message);
  }
  return true;
}

export async function ensureMissingLookupsFromRows(
  admin: AdminClient,
  rows: BulkLeadImportRowInput[],
): Promise<{ sources_created: string[]; industries_created: string[] }> {
  const lookups = await loadBulkImportLookupSets(admin);
  const sources_created: string[] = [];
  const industries_created: string[] = [];

  const sourceSlugs = new Set<string>();
  const industrySlugs = new Set<string>();

  for (const row of rows) {
    const source = trimStr(row.source);
    const industry = trimStr(row.industry);
    if (source && !lookups.sources.has(source) && isValidLookupSlug(source)) sourceSlugs.add(source);
    if (industry && !lookups.industries.has(industry) && isValidLookupSlug(industry)) industrySlugs.add(industry);
  }

  for (const slug of sourceSlugs) {
    if (await insertLookupIfMissing(admin, "source", slug)) sources_created.push(slug);
  }
  for (const slug of industrySlugs) {
    if (await insertLookupIfMissing(admin, "industry", slug)) industries_created.push(slug);
  }

  return { sources_created, industries_created };
}

function normalizeInterestsMaps(row: BulkLeadImportRowInput): {
  interests: Record<string, boolean>;
  quantities: Record<string, string>;
  has_design: Record<string, boolean>;
  errors: string[];
} {
  const errors: string[] = [];
  const interestsRaw = asRecord(row.interests) ?? {};
  const quantitiesRaw = asRecord(row.quantities) ?? {};
  const hasDesignRaw = asRecord(row.has_design) ?? {};

  const interests: Record<string, boolean> = {};
  const quantities: Record<string, string> = {};
  const has_design: Record<string, boolean> = {};

  for (const [key, enabled] of Object.entries(interestsRaw)) {
    const product = key.trim();
    if (!product) continue;
    if (!PRODUCT_SET.has(product)) {
      errors.push(`Unknown product "${product}". Use: ${PRODUCT_INTERESTS.join(", ")}.`);
      continue;
    }
    if (enabled) interests[product] = true;
  }

  for (const [key, rawQty] of Object.entries(quantitiesRaw)) {
    const product = key.trim();
    if (!product) {
      errors.push("quantities contains an empty product key.");
      continue;
    }
    if (!PRODUCT_SET.has(product)) {
      errors.push(`Unknown product in quantities: "${product}".`);
      continue;
    }
    quantities[product] = String(rawQty ?? "").trim();
  }

  for (const [key, rawDesign] of Object.entries(hasDesignRaw)) {
    const product = key.trim();
    if (!product) continue;
    if (!PRODUCT_SET.has(product)) {
      errors.push(`Unknown product in has_design: "${product}".`);
      continue;
    }
    has_design[product] = !!rawDesign;
  }

  const interestsErr = validateLeadInterestsPayload(interests, quantities, has_design);
  if (interestsErr) errors.push(interestsErr);

  return { interests, quantities, has_design, errors };
}

function validateLookupField(
  field: "source" | "industry",
  value: string,
  lookups: BulkImportLookupSets,
  createMissingLookups: boolean,
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const set = field === "source" ? lookups.sources : lookups.industries;
  const options = field === "source" ? lookups.sourceOptions : lookups.industryOptions;
  const label = field === "source" ? "source" : "industry";

  if (set.has(value)) return { errors, warnings };

  if (createMissingLookups) {
    if (!isValidLookupSlug(value)) {
      errors.push(
        `${label} "${value}" must be a lowercase slug (letters, numbers, underscores) to auto-add to Dropdown Options.`,
      );
    } else {
      warnings.push(
        `${label} "${value}" is not in Dropdown Options — will be added on import as "${slugToLookupLabel(value)}".`,
      );
    }
    return { errors, warnings };
  }

  errors.push(
    `${label} "${value}" is not in Dropdown Options. Use value from _lookups in the sample file: ${formatLookupOptionsHint(options)}.`,
  );
  return { errors, warnings };
}

export function validateBulkLeadRow(
  row: BulkLeadImportRowInput,
  rowIndex: number,
  lookups: BulkImportLookupSets,
  createMissingLookups = false,
): BulkImportRowResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return {
      row_index: rowIndex,
      status: "error",
      errors: ["Row must be a JSON object."],
      warnings: [],
      preview: null,
    };
  }

  const first_name = trimStr(row.first_name);
  const last_name = trimStr(row.last_name) || null;
  const phoneRaw = trimStr(row.phone);
  const phoneDigits = digitsOnly(phoneRaw);
  const email = trimStr(row.email) || null;
  const company = trimStr(row.company) || null;
  const source = trimStr(row.source);
  const industry = trimStr(row.industry);
  const website = trimStr(row.website);
  const external_id = trimStr(row.external_id) || null;

  if (!first_name) errors.push("first_name is required.");
  if (!phoneRaw) errors.push("phone is required.");
  else if (!phoneDigits || phoneDigits.length < 10) errors.push("phone must contain at least 10 digits.");

  if (!source) errors.push("source is required.");
  else {
    const sourceCheck = validateLookupField("source", source, lookups, createMissingLookups);
    errors.push(...sourceCheck.errors);
    warnings.push(...sourceCheck.warnings);
  }

  if (!industry) errors.push("industry is required.");
  else {
    const industryCheck = validateLookupField("industry", industry, lookups, createMissingLookups);
    errors.push(...industryCheck.errors);
    warnings.push(...industryCheck.warnings);
  }

  if (website) {
    const websiteErr = validateWebsite(website);
    if (websiteErr) errors.push(websiteErr);
  }

  const urgencyRaw = trimStr(row.urgency);
  let urgency: string | null = null;
  if (urgencyRaw) {
    urgency = normalizeUrgency(urgencyRaw);
    if (!urgency) warnings.push(`urgency "${urgencyRaw}" was ignored — use high, medium, or low.`);
  }

  const { interests, quantities, has_design, errors: interestErrors } = normalizeInterestsMaps(row);
  errors.push(...interestErrors);

  const hasInterestKeys = Object.keys(interests).length > 0;
  if (!hasInterestKeys && (Object.keys(quantities).length > 0 || Object.keys(has_design).length > 0)) {
    errors.push("quantities or has_design provided without interests.");
  }

  const preview: BulkLeadImportRowPreview | null =
    first_name && phoneDigits && source && industry
      ? {
          first_name,
          last_name,
          phone: phoneDigits,
          email,
          company,
          source,
          industry,
          external_id,
        }
      : null;

  return {
    row_index: rowIndex,
    status: errors.length > 0 ? "error" : "valid",
    errors,
    warnings,
    preview,
    ...(errors.length === 0
      ? {}
      : {}),
  };
}

async function findOpenLeadIdByPhone(admin: AdminClient, phoneDigits: string): Promise<string | null> {
  const { data: customers } = await admin.from("customers").select("id").eq("phone", phoneDigits);
  if (!customers?.length) return null;

  const customerIds = customers.map((c) => c.id);
  const { data: lead } = await admin
    .from("leads")
    .select("id, status")
    .in("customer_id", customerIds)
    .order("created_at", { ascending: false })
    .limit(20);

  const open = (lead ?? []).find((l) => !CLOSED_LEAD_STATUSES.has(String(l.status)));
  return open?.id ?? null;
}

export async function validateBulkLeadImport(
  admin: AdminClient,
  parsed: ParsedBulkImportFile,
): Promise<BulkImportSummary> {
  const lookups = await loadBulkImportLookupSets(admin);
  const rows: BulkImportRowResult[] = [];

  for (let i = 0; i < parsed.rows.length; i++) {
    const rowIndex = i + 1;
    const result = validateBulkLeadRow(
      parsed.rows[i],
      rowIndex,
      lookups,
      parsed.options.createMissingLookups,
    );

    if (result.status === "valid" && result.preview && parsed.options.skipDuplicatePhones) {
      const existingLeadId = await findOpenLeadIdByPhone(admin, result.preview.phone);
      if (existingLeadId) {
        result.status = "skipped";
        result.warnings.push(`Skipped — open lead already exists for this phone (lead ${existingLeadId.slice(0, 8)}…).`);
      }
    }

    rows.push(result);
  }

  return summarizeBulkImportRows(rows);
}

function summarizeBulkImportRows(rows: BulkImportRowResult[]): BulkImportSummary {
  const valid_count = rows.filter((r) => r.status === "valid").length;
  const error_count = rows.filter((r) => r.status === "error").length;
  const skipped_count = rows.filter((r) => r.status === "skipped").length;
  return {
    total_rows: rows.length,
    valid_count,
    error_count,
    skipped_count,
    created_count: 0,
    rows,
  };
}

export async function commitBulkLeadImport(
  admin: AdminClient,
  parsed: ParsedBulkImportFile,
  staffUserId: string,
): Promise<BulkImportSummary> {
  if (parsed.options.createMissingLookups) {
    await ensureMissingLookupsFromRows(admin, parsed.rows);
  }
  const validation = await validateBulkLeadImport(admin, parsed);
  const batchId = randomUUID();
  const now = new Date().toISOString();
  let created_count = 0;

  for (const rowResult of validation.rows) {
    if (rowResult.status !== "valid" || !rowResult.preview) continue;

    const input = parsed.rows[rowResult.row_index - 1];
    const preview = rowResult.preview;
    const phoneDigits = preview.phone;

    const { interests, quantities, has_design } = normalizeInterestsMaps(input);
    const urgency = normalizeUrgency(trimStr(input.urgency));

    const { data: customer, error: cErr } = await admin
      .from("customers")
      .insert({
        first_name: preview.first_name,
        last_name: preview.last_name,
        email: preview.email,
        phone: phoneDigits,
        company: preview.company,
        industry: preview.industry,
        website: trimStr(input.website) ? normalizeWebsite(String(input.website)) : null,
        authority: normalizeAuthority(trimStr(input.authority)),
      })
      .select("id")
      .single();

    if (cErr || !customer) {
      rowResult.status = "error";
      rowResult.errors.push(cErr?.message ?? "Failed to create customer.");
      continue;
    }

    const { data: lead, error: lErr } = await admin
      .from("leads")
      .insert({
        customer_id: customer.id,
        source: preview.source,
        brand: trimStr(input.brand) || null,
        urgency,
        is_inbox: false,
        status: "Pending",
        sdr_id: staffUserId,
        is_returning_customer: input.is_returning_customer === true,
        sdr_comment: trimStr(input.sdr_comment) || null,
        interests,
        quantities,
        has_design,
      })
      .select("id")
      .single();

    if (lErr || !lead) {
      rowResult.status = "error";
      rowResult.errors.push(lErr?.message ?? "Failed to create lead.");
      continue;
    }

    rowResult.lead_id = lead.id;
    created_count += 1;

    await admin.from("activities").insert({
      lead_id: lead.id,
      customer_id: customer.id,
      type: "lead_manual_created",
      by_user_id: staffUserId,
      payload: {
        source: preview.source,
        via: "bulk_import",
        batch_id: batchId,
        external_id: preview.external_id,
        imported_by_note: parsed.options.importedByNote,
      },
      created_at: now,
    });
  }

  if (created_count > 0) {
    await admin.from("activities").insert({
      type: "leads_bulk_imported",
      by_user_id: staffUserId,
      payload: {
        batch_id: batchId,
        created_count,
        total_rows: validation.total_rows,
        error_count: validation.rows.filter((r) => r.status === "error").length,
        skipped_count: validation.rows.filter((r) => r.status === "skipped").length,
        imported_by_note: parsed.options.importedByNote,
      },
      created_at: now,
    });
  }

  const summary = summarizeBulkImportRows(validation.rows);
  summary.created_count = created_count;
  summary.batch_id = batchId;
  return summary;
}
