# Feature Spec — Bulk lead import (JSON)

**Route:** `/admin/settings/import-export` (admin only)

---

## Overview

Admins upload a JSON file to create many leads at once. No live integration with Instantly or other tools yet — export JSON from the external system and upload here.

**Safety:** validate-first flow — nothing is written until the admin confirms after reviewing the preview.

```
Upload JSON → Validate (dry run) → Preview table → Import valid rows only → Results + download JSON
```

---

## API

### `POST /api/admin/leads/import?dry_run=true`

- **Auth:** `requireAdmin`
- **Body:** JSON object or `multipart/form-data` with `file` (.json)
- **No lead inserts** — validates every row and checks duplicate phones

### `POST /api/admin/leads/import`

- **Auth:** `requireAdmin`
- Re-validates server-side, then inserts **valid** rows only
- Creates customer + lead per row (same rules as `POST /api/leads/manual`)
- Logs `lead_manual_created` per row (`via: bulk_import`) and one `leads_bulk_imported` batch activity

**Limits:** max **500** leads per file.

---

## JSON format

```json
{
  "version": 1,
  "_documentation": { "purpose": "…", "instructions": ["…"], "lead_fields": { "required": { … } } },
  "_lookups": { "source": [{ "value": "email", "label": "Email" }], "industry": […] },
  "leads": [{ "first_name": "…", "phone": "…", "source": "email", "industry": "cannabis_cbd" }]
}
```

**AI template:** `GET /api/admin/leads/import/template` — includes `_documentation` (rules for AI), live `_lookups`, and **one** example lead.

Keys starting with `_` are ignored on import. Use **`value`** slugs for `source` and `industry` — not labels.

### Required per lead

| Field | Notes |
|-------|--------|
| `first_name` | |
| `phone` | Min 10 digits after normalization |
| `source` | Active **value** slug from `_lookups.source` or Allowed dropdown values table on import page |
| `industry` | Active **value** slug from `_lookups.industry` |

### Dropdown validation

- **Default:** invalid `source` / `industry` → row **error** (nothing written for that row).
- **`create_missing_lookups: true`** (UI checkbox): missing slugs are **added to Dropdown Options** on commit, then import proceeds. Slug must be lowercase `a-z`, `0-9`, `_` (e.g. `instantly`).

### Optional per lead

`last_name`, `email`, `company`, `brand`, `website`, `authority`, `urgency` (`high`/`medium`/`low`), `is_returning_customer`, `sdr_comment`, `interests`, `quantities`, `has_design`, `external_id` (trace only — stored in activity payload).

Product names must match: Labels, Boxes, Flyers, Stickers, Jars, Bags, Tubes, Banners, Business Cards, Other.

### Duplicate policy

When `skip_duplicate_phones` is `true` (default), rows are **skipped** if any customer with the same phone already has an open lead (status not Rejected / Duplicate).

---

## UI

`components/admin/leads-import-section.tsx`

1. Download sample JSON
2. Toggle skip-duplicate-phones
3. Upload file → **Validate file**
4. Preview table: row #, name, phone, source, status, errors/warnings
5. **Import N leads** (only valid rows)
6. Results + download results JSON + link to `/leads`

---

## Shared code

| File | Purpose |
|------|---------|
| `lib/utils/bulk-import-leads.ts` | Parse, validate, commit |
| `app/api/admin/leads/import/route.ts` | Route handler |

---

## Related

- Manual single lead: `POST /api/leads/manual`, `/leads` Add Lead modal
- Dropdown slugs: Admin → Dropdown Options
