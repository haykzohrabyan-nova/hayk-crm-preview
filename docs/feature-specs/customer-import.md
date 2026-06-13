# Feature Spec — Bulk Customer Import (JSON)

**Route:** `/admin/settings/import-export` → Customers tab (admin only)

---

## Overview

Admins upload a JSON file to create many customers at once. The flow mirrors the lead import: validate first (nothing written until confirmed), preview the results, then commit.

**Safety:** validate-first — no DB writes until the admin confirms after reviewing.

```
Upload JSON → Validate (dry run) → Preview table → Import with progress modal → Results + download JSON
```

---

## API

### `GET /api/admin/customers/import/template`

Returns an AI-friendly JSON template with `_documentation`, live `_lookups` (industry slugs from the DB), and one example customer row. Admins hand this to an AI to produce the import file.

### `POST /api/admin/customers/import?dry_run=true`

- **Auth:** `requireAdmin`
- **Body:** JSON object with `customers` array
- **Dry run:** validates every row, checks for duplicate phones in the file and against the DB; no inserts
- **Response:** `{ results: BulkCustomerImportResult[] }` — one entry per row with `status`, `errors`, `warnings`, `preview`

### `POST /api/admin/customers/import`

- **Auth:** `requireAdmin`
- Re-validates server-side, then inserts **valid** rows only
- Skips rows with `status: "skip"` (duplicate phone per `skip_duplicate_phones` policy)
- Logs one `customers_bulk_imported` batch activity

**Limits:** max **500** customers per file (enforced in UI and API).

---

## JSON format

```json
{
  "version": 1,
  "_documentation": { "…" },
  "_lookups": { "industry": [{ "value": "cannabis_cbd", "label": "Cannabis / CBD" }] },
  "skip_duplicate_phones": true,
  "customers": [
    {
      "first_name": "Jane",
      "last_name": "Rivera",
      "phone": "4155551234",
      "email": "jane@acmeprint.com",
      "company": "Acme Print Co",
      "industry": "cannabis_cbd",
      "website": "https://acmeprint.com",
      "authority": "yes",
      "heat_tag": "warm",
      "customer_since": "2021-03-15"
    }
  ]
}
```

Keys starting with `_` are ignored during import.

---

## Field reference

### Required

| Field | Notes |
|-------|--------|
| `first_name` | |
| `phone` | Min 10 digits after normalization. Leading `1` stripped if the result would be 11 digits (US numbers). Formatted input (`(415) 555-1234`) accepted. |

### Optional

| Field | Default | Notes |
|-------|---------|-------|
| `last_name` | `null` | |
| `email` | `null` | |
| `company` | `null` | |
| `industry` | `"other"` | **Value slug** from `_lookups.industry`. If omitted or unrecognised, defaults to `"other"` (never an error). |
| `website` | `null` | Full URL with `https://`. Normalized to add scheme if omitted. |
| `authority` | `"yes"` | `yes` or `no`. Defaults to `"yes"` (Decision Maker). |
| `heat_tag` | `null` | `hot` / `warm` / `cold`. |
| `customer_since` | `null` | ISO 8601 date or datetime (e.g. `"2021-03-15"`). Written to both `created_at` and `updated_at` on insert — preserves original customer relationship history. Omit to use the current timestamp. |

---

## Validation rules

| Check | Behaviour |
|-------|---------|
| Missing `first_name` | Row error |
| `phone` < 10 digits after normalization | Row error |
| `phone` already exists in import file | Row error (second occurrence) |
| `phone` already exists in DB | Row skipped (`status: "skip"`) when `skip_duplicate_phones: true` (default); row error when `false` |
| `email` format invalid | Row warning (not error) |
| `website` format invalid | Row warning (not error) |
| `heat_tag` not hot/warm/cold | Row warning; field set to `null` |
| `authority` unrecognised | Defaults to `"yes"`; row warning |

---

## UI

**Component:** `components/admin/customers-import-section.tsx`

1. Download AI-ready sample JSON (`GET /api/admin/customers/import/template`)
2. Upload JSON file → **Validate**
3. Preview table: row #, name, phone, industry, heat tag, authority, customer since, status (`valid` / `skip` / `error`), errors/warnings
4. **Import N customers** (valid rows only)
5. **Real-time progress modal** — shows "Processing X / N…" during commit; client sends rows in batches of 25 to avoid browser timeout. Closes on completion.
6. Results summary + download results JSON + link to `/crm`

---

## Shared code

| File | Purpose |
|------|---------|
| `lib/utils/bulk-import-customers.ts` | Parse, validate, commit per-row; template generation |
| `app/api/admin/customers/import/route.ts` | Route handler (validate + commit) |
| `app/api/admin/customers/import/template/route.ts` | AI template download |
| `public/samples/bazaar-customers-import-sample.json` | Downloadable example with `_documentation` |

---

## Related

- Duplicate management: CRM → Duplicates filter + Merge flow (`docs/feature-specs/crm.md`)
- Automated bulk merge: `scripts/auto-merge-duplicates.py`
- Lead import: `docs/feature-specs/lead-import.md`
- Order import: `docs/feature-specs/order-import.md`
