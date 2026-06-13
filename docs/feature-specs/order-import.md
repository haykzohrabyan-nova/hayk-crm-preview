# Feature Spec — Bulk Order Import (JSON)

**Route:** `/admin/settings/import-export` → Orders tab (admin only)

---

## Overview

Admins upload a JSON file to import historical or external orders in bulk. Orders are linked to existing customers via phone number match. Optionally, missing customers can be created on the fly.

**Safety:** validate-first — nothing written until admin confirms after reviewing the preview.

```
Upload JSON → Validate (resolve customers by phone) → Preview table → Import with progress modal → Results + download JSON
```

---

## API

### `GET /api/admin/orders/import/template`

Returns an AI-friendly JSON template with `_documentation` and one example order row. Admins hand this to an AI to produce the import file.

### `POST /api/admin/orders/import?dry_run=true`

- **Auth:** `requireAdmin`
- **Body:** JSON object with `orders` array
- **Dry run:** validates every row, resolves customer IDs by phone, checks line items; no inserts
- **Response:** `{ results: BulkOrderImportResult[] }` — one entry per row with `status`, `errors`, `warnings`, `preview` (includes resolved `customer_name`)

### `POST /api/admin/orders/import`

- **Auth:** `requireAdmin`
- Re-validates server-side, inserts **valid** rows only
- Creates customer if `customer_action === "create"` and `create_missing_customers: true`
- Inserts `job_tickets` row + `line_items` child rows

**Limits:** max **500** orders per file.

---

## JSON format

```json
{
  "version": 1,
  "_documentation": { "…" },
  "create_missing_customers": false,
  "orders": [
    {
      "customer_phone": "4155551234",
      "customer_first_name": "Jane",
      "customer_last_name": "Rivera",
      "customer_company": "Acme Print Co",
      "ticket_status": "completed",
      "payment_status": "paid",
      "payment_method": "zelle",
      "total": 450.00,
      "order_date": "2025-11-15",
      "line_items": [
        {
          "product_name": "Labels",
          "quantity": 1000,
          "unit_price": 450.00
        }
      ]
    }
  ]
}
```

---

## Field reference

### Required per order

| Field | Notes |
|-------|--------|
| `customer_phone` | Min 10 digits after normalization. Used to look up an existing customer. |
| `ticket_status` | `order` / `in_production` / `completed` / `cancelled` |
| `line_items` | Array with at least 1 item |

### Optional per order

| Field | Default | Notes |
|-------|---------|-------|
| `customer_first_name` | `null` | Required when `create_missing_customers: true` and no matching customer found |
| `customer_last_name` | `null` | |
| `customer_company` | `null` | |
| `payment_status` | `"unpaid"` | `unpaid` / `partial` / `paid` |
| `payment_method` | `null` | `cash` / `check` / `card` / `zelle` / `wire` / `offline` |
| `total` | Derived | Numeric total. If omitted, derived from line item `unit_price × quantity` sums. |
| `order_date` | Today | ISO date string (e.g. `"2025-11-15"`) — stored as `created_at` on the ticket. |
| `due_date` | `null` | ISO date — deadline shown on order detail. |

### Required per line item

| Field | Notes |
|-------|--------|
| `product_name` | Matched against `product_types` by name. Valid values: Labels, Boxes, Flyers, Stickers, Jars, Bags, Tubes, Banners, Business Cards, Other. |

### Optional per line item

| Field | Default | Notes |
|-------|---------|-------|
| `quantity` | `null` | |
| `unit_price` | `null` | |
| `description` | `null` | |

---

## Customer resolution

For each order row:

1. Normalise `customer_phone` to digits only, strip leading `1` if 11 digits
2. Lookup `customers` table: `phone = normalised_phone`
3. **Found:** `customer_action = "found"`, preview shows customer's name
4. **Not found + `create_missing_customers: true`:** `customer_action = "create"`, preview shows "(New customer)"
5. **Not found + `create_missing_customers: false`:** row error — "Customer not found for phone …"

---

## Validation rules

| Check | Behaviour |
|-------|---------|
| Missing `customer_phone` | Row error |
| `customer_phone` < 10 digits | Row error |
| Customer not found (no create flag) | Row error |
| Missing `ticket_status` | Row error |
| Invalid `ticket_status` | Row error |
| No `line_items` | Row error |
| `line_items` not an array | Row error |
| Invalid `payment_status` | Row warning; defaults to `"unpaid"` |
| Invalid `payment_method` | Row warning; field set to `null` |

---

## UI

**Component:** `components/admin/orders-import-section.tsx`

1. Download AI-ready sample JSON
2. Upload JSON file → **Validate**
3. Preview table: row #, customer (resolved name + phone), status, payment, line items count, total, errors/warnings
4. **Import N orders** (valid rows only)
5. **Real-time progress modal** — shows "Processing X / N…" during commit; client sends rows in batches of 25. Closes on completion.
6. Results summary + download results JSON + link to `/orders`

---

## Shared code

| File | Purpose |
|------|---------|
| `lib/utils/bulk-import-orders.ts` | Parse, validate, commit per-row; template generation |
| `app/api/admin/orders/import/route.ts` | Route handler (validate + commit) |
| `app/api/admin/orders/import/template/route.ts` | AI template download |

---

## Related

- Customer import: `docs/feature-specs/customer-import.md`
- Lead import: `docs/feature-specs/lead-import.md`
- Customer lookup: `GET /api/customers/lookup` (phone dedup)
