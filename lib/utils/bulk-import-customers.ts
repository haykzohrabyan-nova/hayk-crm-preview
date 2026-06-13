import { randomUUID } from "crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import { normalizeAuthority } from "@/lib/utils/authority";
import { digitsOnly as _digitsOnly } from "@/lib/utils/phone";

/** Strip non-digits and remove leading US country code (1) from 11-digit numbers. */
function digitsOnly(value: string): string {
  const d = _digitsOnly(value);
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
}
import { normalizeWebsite, validateWebsite } from "@/lib/utils/website";

type AdminClient = ReturnType<typeof createAdminClient>;

export const BULK_CUSTOMER_IMPORT_MAX_ROWS = 500;

const VALID_HEAT_TAGS = new Set(["hot", "warm", "cold"]);

export interface BulkCustomerImportRowInput {
  first_name?: unknown;
  last_name?: unknown;
  phone?: unknown;
  email?: unknown;
  company?: unknown;
  industry?: unknown;
  website?: unknown;
  authority?: unknown;
  heat_tag?: unknown;
  external_id?: unknown;
  /** When the customer was first created in the source system — stored as created_at. */
  customer_since?: unknown;
}

export interface LookupOption {
  value: string;
  label: string;
}

export interface BulkCustomerImportOptions {
  skipDuplicatePhones: boolean;
  importedByNote: string | null;
  createMissingLookups: boolean;
}

export interface BulkCustomerLookupsReference {
  industry: LookupOption[];
}

export interface BulkCustomerImportRowPreview {
  first_name: string;
  last_name: string | null;
  phone: string;
  email: string | null;
  company: string | null;
  industry: string;    // always set — defaults to "other" when absent in import row
  external_id: string | null;
  /** ISO 8601 timestamp parsed from customer_since — used as created_at on insert. */
  customer_since: string | null;
}

export type BulkCustomerImportRowStatus = "valid" | "error" | "skipped";

export interface BulkCustomerImportRowResult {
  row_index: number;
  status: BulkCustomerImportRowStatus;
  errors: string[];
  warnings: string[];
  preview: BulkCustomerImportRowPreview | null;
  customer_id?: string;
}

export interface BulkCustomerImportSummary {
  total_rows: number;
  valid_count: number;
  error_count: number;
  skipped_count: number;
  created_count: number;
  rows: BulkCustomerImportRowResult[];
  batch_id?: string;
}

export interface ParsedBulkCustomerImportFile {
  options: BulkCustomerImportOptions;
  rows: BulkCustomerImportRowInput[];
}

function trimStr(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isValidLookupSlug(slug: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(slug) && slug.length <= 64;
}

function slugToLookupLabel(slug: string): string {
  return slug
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function formatLookupOptionsHint(options: LookupOption[], max = 12): string {
  const slice = options.slice(0, max);
  const formatted = slice.map((o) => `${o.value} (${o.label})`).join(", ");
  const more = options.length > max ? `, … +${options.length - max} more` : "";
  return formatted + more;
}

export function parseBulkCustomerImportFile(
  raw: unknown,
): { ok: true; file: ParsedBulkCustomerImportFile } | { ok: false; error: string } {
  const root = asRecord(raw);
  if (!root) return { ok: false, error: "JSON must be an object with a customers array." };
  if (!Array.isArray(root.customers)) return { ok: false, error: 'Missing "customers" array.' };
  if (root.customers.length === 0) return { ok: false, error: "customers array is empty — add at least one customer." };
  if (root.customers.length > BULK_CUSTOMER_IMPORT_MAX_ROWS) {
    return {
      ok: false,
      error: `Too many rows (${root.customers.length}). Maximum is ${BULK_CUSTOMER_IMPORT_MAX_ROWS} per file.`,
    };
  }
  if (root.version != null && typeof root.version !== "number") {
    return { ok: false, error: '"version" must be a number when provided.' };
  }

  return {
    ok: true,
    file: {
      options: {
        skipDuplicatePhones: root.skip_duplicate_phones !== false,
        importedByNote: trimStr(root.imported_by_note) || null,
        createMissingLookups: root.create_missing_lookups === true,
      },
      rows: root.customers as BulkCustomerImportRowInput[],
    },
  };
}

export async function loadCustomerImportLookupsReference(
  admin: AdminClient,
): Promise<BulkCustomerLookupsReference> {
  const { data, error } = await admin
    .from("lookup_values")
    .select("category, value, label")
    .eq("category", "industry")
    .eq("is_active", true)
    .order("sort_order");

  if (error) throw new Error(error.message);

  const industry: LookupOption[] = (data ?? []).map((row) => ({
    value: String(row.value),
    label: String(row.label),
  }));

  return { industry };
}

async function loadIndustrySet(
  admin: AdminClient,
): Promise<{ industries: Set<string>; industryOptions: LookupOption[] }> {
  const ref = await loadCustomerImportLookupsReference(admin);
  return {
    industries: new Set(ref.industry.map((o) => o.value)),
    industryOptions: ref.industry,
  };
}

async function insertLookupIfMissing(
  admin: AdminClient,
  category: "industry",
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

  const { error } = await admin.from("lookup_values").insert({
    category,
    value,
    label: slugToLookupLabel(value),
    sort_order: nextSort,
    is_active: true,
  });

  if (error) {
    if (error.code === "23505") return false;
    throw new Error(error.message);
  }
  return true;
}

export async function buildCustomerImportTemplate(admin: AdminClient): Promise<Record<string, unknown>> {
  const ref = await loadCustomerImportLookupsReference(admin);
  const exampleIndustry =
    ref.industry.find((i) => i.value === "cannabis_cbd")?.value ?? ref.industry[0]?.value ?? "other";

  return {
    version: 1,
    _documentation: {
      purpose: "Bulk import customers into BazaarPrinting CRM.",
      audience: "AI assistants or scripts converting data from spreadsheets or other CRMs.",
      output_format:
        "Single JSON object with a customers array. Keys starting with _ are documentation only — ignored on import.",
      instructions: [
        "Return valid JSON only — no markdown fences, no commentary outside the JSON.",
        "Put one object per customer in the customers array (max 500).",
        "Every customer MUST include: first_name, phone.",
        "For industry: copy the value slug from _lookups (e.g. cannabis_cbd) — NEVER use the human label. If omitted, defaults to 'other'.",
        "phone: digits only or formatted — at least 10 digits after normalization.",
        "heat_tag: hot | warm | cold (or omit).",
        "authority: yes | no (or omit — defaults to 'yes').",
        "external_id: optional trace id from the source system — stored in activity log only.",
        "Replace the single example customer with all real rows; remove fictional data.",
      ],
      customer_fields: {
        required: {
          first_name: "string",
          phone: "string — min 10 digits",
        },
        optional: {
          last_name: "string",
          email: "string",
          company: "string",
          industry: `string — value slug from _lookups.industry (example: ${exampleIndustry})`,
          website: "string — full URL with https://",
          authority: "yes | no",
          heat_tag: "hot | warm | cold",
          external_id: "string — id from external system",
          customer_since: "ISO 8601 date or datetime string — used as created_at (preserves original history). Example: '2021-03-15' or '2021-03-15T10:30:00Z'",
        },
      },
    },
    _lookups: {
      how_to_use:
        "Pick industry from value column. Download on Admin page for your live database list.",
      industry: ref.industry,
    },
    imported_by_note: "REPLACE — short note about this batch (e.g. Migrated from old CRM May 2026)",
    skip_duplicate_phones: true,
    create_missing_lookups: false,
    customers: [
      {
        _note: "DELETE this key — example row only. Duplicate this object shape for each real customer.",
        first_name: "Jane",
        last_name: "Rivera",
        phone: "4155551234",
        email: "jane@example.com",
        company: "Acme Print Co",
        industry: exampleIndustry,
        website: "https://acmeprint.com",
        authority: "yes",
        heat_tag: "warm",
        external_id: "your-system-id-123",
        customer_since: "2021-03-15",
      },
    ],
  };
}

export function validateBulkCustomerRow(
  row: BulkCustomerImportRowInput,
  rowIndex: number,
  industries: Set<string>,
  industryOptions: LookupOption[],
  createMissingLookups: boolean,
): BulkCustomerImportRowResult {
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
  // Default to "other" when industry is absent — keeps the edit form tidy
  const industryRaw = trimStr(row.industry) || "other";
  // Default authority to "yes" when absent — can be corrected per customer
  const authorityRaw = trimStr(row.authority) || "yes";
  const website = trimStr(row.website);
  const heat_tag_raw = trimStr(row.heat_tag).toLowerCase();
  const external_id = trimStr(row.external_id) || null;

  // customer_since maps to created_at — parse and validate if provided
  let customer_since: string | null = null;
  const customerSinceRaw = trimStr(row.customer_since);
  if (customerSinceRaw) {
    const parsed = new Date(customerSinceRaw);
    if (isNaN(parsed.getTime())) {
      warnings.push(`customer_since "${customerSinceRaw}" is not a valid date — will use import time as created_at.`);
    } else if (parsed > new Date()) {
      warnings.push(`customer_since "${customerSinceRaw}" is in the future — will use import time as created_at.`);
    } else {
      customer_since = parsed.toISOString();
    }
  }

  if (!first_name) errors.push("first_name is required.");
  if (!phoneRaw) errors.push("phone is required.");
  else if (!phoneDigits || phoneDigits.length < 10) errors.push("phone must contain at least 10 digits.");

  if (!industries.has(industryRaw)) {
    if (createMissingLookups) {
      if (!isValidLookupSlug(industryRaw)) {
        errors.push(
          `industry "${industryRaw}" must be a lowercase slug (letters, numbers, underscores) to auto-add to Dropdown Options.`,
        );
      } else {
        warnings.push(
          `industry "${industryRaw}" is not in Dropdown Options — will be added on import as "${slugToLookupLabel(industryRaw)}".`,
        );
      }
    } else if (industryRaw !== "other") {
      // Only error on explicit bad values — missing industry was silently defaulted to "other" above
      errors.push(
        `industry "${industryRaw}" is not in Dropdown Options. Use value from _lookups: ${formatLookupOptionsHint(industryOptions)}.`,
      );
    }
    // If industryRaw === "other" and it's not in DB yet, it will fail at commit time —
    // but "other" is always seeded so this branch is never reached in practice.
  }

  if (website) {
    const websiteErr = validateWebsite(website);
    if (websiteErr) errors.push(websiteErr);
  }

  if (heat_tag_raw && !VALID_HEAT_TAGS.has(heat_tag_raw)) {
    warnings.push(`heat_tag "${heat_tag_raw}" ignored — use hot, warm, or cold.`);
  }

  const preview: BulkCustomerImportRowPreview | null =
    first_name && phoneDigits
      ? { first_name, last_name, phone: phoneDigits, email, company, industry: industryRaw, external_id, customer_since }
      : null;

  return {
    row_index: rowIndex,
    status: errors.length > 0 ? "error" : "valid",
    errors,
    warnings,
    preview,
  };
}

function summarizeCustomerImportRows(rows: BulkCustomerImportRowResult[]): BulkCustomerImportSummary {
  return {
    total_rows: rows.length,
    valid_count: rows.filter((r) => r.status === "valid").length,
    error_count: rows.filter((r) => r.status === "error").length,
    skipped_count: rows.filter((r) => r.status === "skipped").length,
    created_count: 0,
    rows,
  };
}

async function findExistingCustomerByPhone(admin: AdminClient, phoneDigits: string): Promise<string | null> {
  const { data } = await admin
    .from("customers")
    .select("id")
    .eq("phone", phoneDigits)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export async function validateBulkCustomerImport(
  admin: AdminClient,
  parsed: ParsedBulkCustomerImportFile,
): Promise<BulkCustomerImportSummary> {
  const { industries, industryOptions } = await loadIndustrySet(admin);
  const rows: BulkCustomerImportRowResult[] = [];

  for (let i = 0; i < parsed.rows.length; i++) {
    const result = validateBulkCustomerRow(
      parsed.rows[i],
      i + 1,
      industries,
      industryOptions,
      parsed.options.createMissingLookups,
    );

    if (result.status === "valid" && result.preview && parsed.options.skipDuplicatePhones) {
      const existingId = await findExistingCustomerByPhone(admin, result.preview.phone);
      if (existingId) {
        result.status = "skipped";
        result.warnings.push(`Skipped — customer already exists for this phone (${existingId.slice(0, 8)}…).`);
      }
    }

    rows.push(result);
  }

  return summarizeCustomerImportRows(rows);
}

export async function commitBulkCustomerImport(
  admin: AdminClient,
  parsed: ParsedBulkCustomerImportFile,
  staffUserId: string,
): Promise<BulkCustomerImportSummary> {
  if (parsed.options.createMissingLookups) {
    const { industries } = await loadIndustrySet(admin);
    const slugs = new Set<string>();
    for (const row of parsed.rows) {
      const v = trimStr(row.industry);
      if (v && !industries.has(v) && isValidLookupSlug(v)) slugs.add(v);
    }
    for (const slug of slugs) {
      await insertLookupIfMissing(admin, "industry", slug);
    }
  }

  const validation = await validateBulkCustomerImport(admin, parsed);
  const batchId = randomUUID();
  const now = new Date().toISOString();
  let created_count = 0;

  for (const rowResult of validation.rows) {
    if (rowResult.status !== "valid" || !rowResult.preview) continue;

    const input = parsed.rows[rowResult.row_index - 1];
    const preview = rowResult.preview;
    const heat_tag_raw = trimStr(input.heat_tag).toLowerCase();
    const heat_tag = VALID_HEAT_TAGS.has(heat_tag_raw) ? heat_tag_raw : null;

    const insertPayload: Record<string, unknown> = {
      first_name: preview.first_name,
      last_name: preview.last_name,
      email: preview.email,
      phone: preview.phone,
      company: preview.company,
      industry: preview.industry,
      website: trimStr(input.website) ? normalizeWebsite(String(input.website)) : null,
      authority: normalizeAuthority(trimStr(input.authority) || "yes"),
      heat_tag,
    };

    // Preserve original creation date when customer_since is provided
    if (preview.customer_since) {
      insertPayload.created_at = preview.customer_since;
      insertPayload.updated_at = preview.customer_since;
    }

    const { data: customer, error: cErr } = await admin
      .from("customers")
      .insert(insertPayload)
      .select("id")
      .single();

    if (cErr || !customer) {
      rowResult.status = "error";
      rowResult.errors.push(cErr?.message ?? "Failed to create customer.");
      continue;
    }

    rowResult.customer_id = customer.id;
    created_count += 1;

    await admin.from("activities").insert({
      customer_id: customer.id,
      type: "customer_created",
      by_user_id: staffUserId,
      payload: {
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
      type: "customers_bulk_imported",
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

  const summary = summarizeCustomerImportRows(validation.rows);
  summary.created_count = created_count;
  summary.batch_id = batchId;
  return summary;
}
