# Shadow Project Analysis — `sdr-crm-system`

Source path: `/Users/nilay/Documents/MyGit/sdr-crm-system`

This document captures everything found in the POC project that is relevant to building the production Tickets module in BazarCRM.

---

## 1. What the shadow project is

A working React 19 + Vite frontend + Express 5 backend POC. It has **no database** — all data lives in in-memory arrays on the Express server (reset on restart). It proves out the full business logic for quotes and orders, including:

- Creating quotes and orders from two roles (SDR and Sales)
- The full SKU line-item builder with pricing calculations
- PDF generation (client-side, jspdf)
- Quote follow-up scheduling
- Quote approval workflow
- Activity timeline for all ticket events
- CRM registry with linked ticket counts

---

## 2. Key source files

| Shadow file | Lines | What it contains |
|-------------|-------|-----------------|
| `backend/server.js` | ~540 | All Express API routes including full tickets logic |
| `frontend/src/components/ContactCRM.jsx` | 3,240 | `OrderDrawer` wizard (the core component), CRM registry, ticket builders |
| `frontend/src/components/VerifyDrawer.jsx` | 1,079 | SDR drawer — includes Order/Quote tab that opens `OrderDrawer` |
| `frontend/src/components/SalesDrawer.jsx` | 796 | Sales drawer — Order/Quote footer button + `OrderDrawer` |
| `frontend/src/components/QuotedRequestsTab.jsx` | 433 | Quotes list page (called "Project" in the UI) |
| `frontend/src/components/OrdersTab.jsx` | 373 | Orders list page |
| `frontend/src/utils/orderTicketPdf.js` | 365 | PDF generation — near-complete port target |
| `frontend/src/utils/statsDateRange.js` | 232 | Date filtering, ticket count helpers |
| `frontend/src/utils/activity.js` | 116 | Activity logging helpers |
| `docs/DOCUMENTATION.md` | 281 | Master reference — includes reimplementation guide §10 |

---

## 3. Ticket data model (from shadow project)

All fields that exist on a ticket object in the shadow project. These are the canonical names from the POC; production will use `snake_case`.

### Identity and linking

| Shadow field | Production column | Type | Notes |
|---|---|---|---|
| `id` | `id` | `uuid` PK | Shadow uses numeric `Date.now()`; production uses UUID |
| `ticketKind` | `ticket_kind` | `text` | `'quote'` or `'order'` |
| `ticketStatus` / `orderStatus` / `quoteStatus` | `ticket_status` | `text` | See status enums below |
| `referenceCode` | `reference_code` | `text` | `'O…'` prefix auto-generated for orders |
| `quoteRequestId` | `quote_request_id` | `text` | `'Q…'` prefix for quote tickets (optional) |
| `title` | `title` | `text` | Project name — **required**, entered in Info tab |
| `linkedLeadId` | `linked_lead_id` | `uuid FK → leads` | Lead this ticket came from |
| `linkedContactKey` | (use `customer_id`) | — | Shadow used a derived key; production uses `customer_id` FK |
| `createdAt` | `created_at` | `timestamptz` | Auto-set on creation |

### Contact (denormalized for display and PDF)

| Shadow field | Production column | Type |
|---|---|---|
| `contactName` | `contact_name` | `text` |
| `contactCompany` | `contact_company` | `text` |
| `contactEmail` | `contact_email` | `text` |
| `contactPhone` / `linkedContactPhoneDigits` | `contact_phone` | `text` (digits-only) |

### SKU / Line items (stored as `jsonb[]`)

Each SKU object in the `quote_skus` array:

| Shadow field | Production key | Type | Notes |
|---|---|---|---|
| `productType` | `product_type` | `string` | e.g. `'Labels'`, `'Boxes'` |
| `description` | `description` | `string` | **Derived** from productType + material + lamination; never entered manually |
| `quantity` | `quantity` | `string` (numeric) | |
| `unitPrice` | `unit_price` | `string` (numeric) | |
| `material` | `material` | `string` | e.g. `'Vinyl'`, `'Paper'` |
| `lamination` | `lamination` | `string` | e.g. `'Matte'`, `'Glossy'` |
| `width` | `width` | `string` (numeric) | Inches |
| `height` | `height` | `string` (numeric) | Inches |
| `designOnFile` / `designRequired` | `design_required` | `boolean` | |
| `hasDieCut` / `dieCut` | `die_cut` | `boolean` | |

> **Important from shadow §10.3:** SKU descriptions are **derived** — `quoteSkuDescription()` builds the description string from `productType + material + lamination`. There is **no free-text description input** for the customer-facing label. Descriptions are auto-generated.

### Pricing fields

| Shadow field | Production column | Type | Notes |
|---|---|---|---|
| `quoteSubtotal` | `quote_subtotal` | `numeric` | Sum of all SKU (qty × unitPrice) |
| `quoteShipping` | `quote_shipping` | `numeric` | Manual charge when `requires_shipping` |
| `requiresShipping` | `requires_shipping` | `boolean` | Pickup vs ship (migration 091) |
| `shipTo*` | `ship_to_*` | `text` | Optional delivery address |
| `applyDiscount` | (form state only) | `boolean` | Not stored — presence of discountValue implies it |
| `discountType` | `discount_type` | `text` | `'percent'` or `'fixed'` |
| `discountValue` | `discount_value` | `text` | Raw entered value |
| `discountAmount` | `discount_amount` | `numeric` | Computed dollar amount |
| `discountReason` | `discount_reason` | `text` | Optional note |
| `quotePreTaxTotal` | `quote_pre_tax_total` | `numeric` | `subtotal − discount + shipping` |
| `quoteTaxRatePercent` | `quote_tax_rate_percent` | `numeric` | e.g. `8.25` |
| `taxExempt` | `tax_exempt` | `boolean` | Tax-exempt client |
| `salesPermitNumber` | `sales_permit_number` | `text` | Required when `tax_exempt = true` |
| `quoteTaxAmount` | `quote_tax_amount` | `numeric` | Computed |
| `quoteFinalTotal` | `quote_final_total` | `numeric` | `pre_tax_total + tax_amount` |

**Pricing calculation formula (from `ContactCRM.jsx`):**

```
subtotal        = sum(sku.quantity × sku.unitPrice for each SKU)
discountAmount  = discountType === 'fixed'
                  ? min(discountValue, subtotal)
                  : min((subtotal × discountValue / 100), subtotal)
preTaxTotal     = max(subtotal − discountAmount + shipping, 0)
taxAmount       = taxExempt ? 0 : round(preTaxTotal × (taxRate / 100) × 100) / 100
finalTotal      = round((preTaxTotal + taxAmount) × 100) / 100
```

### Payment

| Shadow field | Production column | Type | Notes |
|---|---|---|---|
| `quotePaymentTypes` | `quote_payment_types` | `text[]` | Array, at least one required |
| `prepaymentType` | `prepayment_type` | `text` | `'percent'` / `'fixed'` / `'none'` |
| `prepaymentValue` | `prepayment_value` | `text` | Raw string |

**Payment type keys used in shadow:**

| Key | Display label |
|-----|--------------|
| `card_default` | Card Payment |
| `zelle` | Zelle |
| `offline` | Offline |

**Prepayment defaults (new quote):** `prepaymentType: 'percent'`, `prepaymentValue: '25'`

**Prepayment split formula:**

```
dueNow  = prepaymentType === 'percent'
          ? round((finalTotal × prepaymentValue / 100) × 100) / 100
          : round(min(prepaymentValue, finalTotal) × 100) / 100
balance = max(round((finalTotal − dueNow) × 100) / 100, 0)
```

> **Important from shadow §10.3:** In **edit mode**, there is **no "None" prepayment option**. Legacy tickets stored with `none` are coerced to `percent / 25` when opened for editing.

### Quote delivery

| Shadow field | Production column | Type | Notes |
|---|---|---|---|
| `quoteChannel` | `quote_channel` | `text` | `'Email'` / `'SMS'` / `'WhatsApp'` / `'In-person'` |
| `quoteDestination` | `quote_destination` | `text` | Email address or digits-only phone |

> When channel = `'Email'`: destination input uses `type="email"`. When `'SMS'` or `'WhatsApp'`: input uses `type="tel"` + digits-only stripping.

### Follow-up scheduling

| Shadow field | Production column | Type | Notes |
|---|---|---|---|
| `quoteReminderDate` | `quote_reminder_date` | `date` | Start date for follow-ups |
| `followUpCycles` | `follow_up_cycles` | `int` | Number of reminders |
| `followUpFrequency` | `follow_up_frequency` | `text` | `'Daily'` / `'Every 2 days'` / `'Weekly'` |
| `quoteFollowUpCompleted` | `follow_up_completed` | `boolean` | Mark schedule done |
| `quoteApprovalLastRequestedAt` | `quote_approval_last_requested_at` | `timestamptz` | |

### Order-specific fields

| Shadow field | Production column | Type |
|---|---|---|
| `orderSource` | `order_source` | `text` (`'quoted'` / `'direct'`) |
| `rush` | `rush` | `boolean` |
| `priority` | `priority` | `text` |
| `dueDate` | `due_date` | `date` |
| `specialRequirements` | `special_requirements` | `text` |
| `designRequired` | `design_required` | `boolean` |
| `dieCut` | `die_cut` | `boolean` |
| `clientConfirmed` | `client_confirmed` | `boolean` |
| `notes` | `notes` | `text` |

---

## 4. Ticket status values (from shadow)

The shadow project uses different status field names per ticket kind. For production, we consolidate into `ticket_status`:

| Shadow value | Meaning |
|---|---|
| `'Open'` | Active / in progress |
| `'draft'` | Created but not sent |
| `'sent'` | Quote sent to client |
| `'Pending Client Confirmation'` | Quote sent, awaiting response |
| `'approved'` | Client confirmed / won |
| `'in_production'` | Order in production |
| `'completed'` | Fulfilled |
| `'cancelled'` | Cancelled |
| `'rejected'` | Client declined quote |

---

## 5. Activity types logged by tickets

All activity types from the shadow project's ticket operations:

| Type | Trigger | Key payload fields |
|---|---|---|
| `order_ticket_created` | Client-side after `POST /api/tickets` | `ticketId`, `ticketKind`, `title`, `status`, `amount`, `savedCount` |
| `order_ticket_updated` | Server-side on `PATCH /api/tickets/:id` | `ticketId`, `fields: string[]` |
| `quote_approval_requested` | Server on PATCH when `quoteApprovalLastRequestedAt` set | `ticketId`, `title`, `amount`, `at` |
| `quote_follow_up_completed` | Server on PATCH when `quoteFollowUpCompleted: true` | `ticketId` |
| `quote_follow_up_reset` | Server on PATCH when follow-up fields cleared | `ticketId`, `fields: string[]` |
| `ticket_client_confirmed` | (to be wired in production) | — |

---

## 6. Production utilities to port

### `lib/utils/ticket-math.ts` — from `ContactCRM.jsx`

Functions to port:
- `normalizeQuoteSkus(skus)` — derives `description` from `product_type + material + lamination`; validates and cleans each SKU row
- `calcQuoteTotals(formState)` — returns `{ quote_subtotal, discount_amount, quote_shipping, quote_pre_tax_total, quote_tax_amount, quote_final_total }`
- `calcPrepaySplit(finalTotal, prepaymentType, prepaymentValue)` — returns `{ dueNow, balance }`
- `HIGH_VALUE_THRESHOLD = 5000` — yellow banner shown on Line Items and Quote tabs when `quote_final_total >= 5000`

### `lib/utils/order-ticket-pdf.ts` — from `orderTicketPdf.js`

Near 1:1 port. Key sections the PDF renders:
1. Header: `Order / Job ticket` + title
2. Ticket: reference code, ticket ID, created date, status, priority, due date, order source
3. Client: name, company, email, phone
4. Delivery / channel: send via + destination
5. Verify / notes (if present)
6. Special requirements (if present)
7. Line items: description, qty, unit price, line total (4-column table)
8. Pricing: subtotal, shipping, discount type + value + amount, pre-tax, tax rate + amount, total due
9. Payment summary: order total, amount paid (deposit), balance due, accepted payment methods
10. Quote follow-up (if schedule is saved on the ticket)

### `lib/utils/ticket-filters.ts` — from `statsDateRange.js`

- `quotedRequestsRowCount(tickets, leads)` — count of quote tickets + quoted leads not already linked to a quote ticket (for the Quotes tab badge)
- `orderTicketsForTab(tickets)` — filters out `'Pending Client Confirmation'` order shell tickets from the Orders list
- `ticketAmount(ticket)` — `quote_final_total ?? quote_subtotal ?? 0`

---

## 7. OrderDrawer — critical rules from shadow §10.3

These are easy to miss and must be implemented correctly:

1. **Tabs (create/edit):** Info → Line Items → Quote. Navigation via Back/Next buttons OR clicking tab headers.
2. **Tabs (read-only):** Info | Line Items | Quote | History. Default active tab = Quote (if `ticket_kind = 'quote'`), else Line Items.
3. **SKU descriptions are derived** — no manual description input. Auto-built from `productType + material + lamination`.
4. **High-value warning:** When `quote_final_total >= $5,000` — amber banner on Line Items and Quote tabs. The "Next →" button on Line Items is hidden (replaced by direct navigation). Alert shown if user tries to proceed via tab click.
5. **Payment types:** Checkbox list (not a single select). At least one required. `card_default` is checked by default and re-applied when Quote tab opens with none selected. Minimum two columns on desktop.
6. **No "None" prepayment in edit mode** — legacy `none` prepayments are coerced to `percent / 25` when opening for editing. New quotes default to `percent / 25`.
7. **Success modal:** After successful create (Send Quote / Create Order), show a success dialog. `VerifyDrawer` / `SalesDrawer` can close on OK.
8. **Contact section locked** when opened from a lead — contact fields pre-filled and read-only.
9. **`requireContactSelection`** when opened from CRM toolbar "+ Add Order" — user must search and pick a contact before the Line Items tab is available.
