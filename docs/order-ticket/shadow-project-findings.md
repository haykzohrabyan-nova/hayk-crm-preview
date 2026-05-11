# Shadow Project Findings — `sdr-crm-system`

Source repo: `/Users/nilay/Documents/MyGit/sdr-crm-system`  
Purpose: React + Express POC that proved the Tickets (Quotes & Orders) workflow end-to-end. No persistent DB — all in-memory. The business logic, field model, pricing math, and PDF output are the authoritative reference for the BazarCRM Tickets phase.

---

## 1. Stack

| Layer | Shadow project | BazarCRM production |
|---|---|---|
| Frontend | React 19 + Vite | Next.js 16 App Router |
| Backend | Express 5 (single file `backend/server.js`) | Next.js Route Handlers |
| Database | In-memory arrays (resets on restart) | Supabase Postgres |
| Auth | Role stored in React state (no real auth) | Supabase MFA + RLS |
| Styles | Inline CSS | Tailwind v4 + CSS tokens |

---

## 2. Roles in the shadow project

| Role | Tickets access |
|---|---|
| **SDR** | Sees the **Project** tab (Quoted Requests) and **Orders** tab in LeadDashboard. Creates tickets from inside the VerifyDrawer ("Order / Quote" tab). Also access via CRM toolbar. |
| **Sales** | Sees the **Project** tab and **Orders** tab in SalesDashboard. Creates tickets from SalesDrawer footer ("Order / Quote") or the 📦 shortcut on claimed pipeline leads. Also access via CRM toolbar. |
| **Admin** | Not modelled in the shadow project — only SDR and Sales roles exist. |

**Ticket visibility:** Both roles see **ALL tickets** — there is no user-scoping on `GET /api/tickets`. It is a shared production board.

---

## 3. Ticket creation flows

### SDR flow (from VerifyDrawer)
1. SDR opens a lead from the Pipeline (Pending leads).
2. Navigates to the **Products / Order** tab inside VerifyDrawer.
3. Clicks "Order / Quote" → OrderDrawer opens in create mode, pre-filled with lead contact data.
4. Completes the wizard (Info → Line Items → Quote tabs) and clicks **Send Quote** or **Create Order**.
5. On save:
   - Ticket with quote SKUs → lead `status` becomes `Quoted`; lead drops off the SDR Pipeline
   - Ticket with order only (no quote) → lead `status` becomes `Validated`
   - Lead moves to the **Project** or **Orders** tab as appropriate
6. Activity `order_ticket_created` is logged.

### Sales flow (from SalesDrawer)
1. Sales opens a claimed lead from the pipeline.
2. Clicks **Order** or **Quote** in the SalesDrawer footer **or** clicks the **📦 shortcut** directly in the pipeline row.
3. OrderDrawer opens in create mode, pre-filled with lead contact data.
4. Completes the wizard and saves.
5. On save: same lead status rules as SDR (Quoted / Validated).

### CRM toolbar flow (both roles)
1. From the CRM page, click **+ Add Order** in the toolbar.
2. A **contact search step** is shown first (no manual contact typing — must select existing CRM contact).
3. OrderDrawer opens with selected contact pre-filled.
4. No lead is linked (`linkedLeadId` is null on this path).

---

## 4. Complete ticket data model (shadow project field names → production snake_case)

### Identity & linking
| Shadow field | Production column | Notes |
|---|---|---|
| `id` | `id` | UUID in production |
| `ticketKind` | `ticket_kind` | `'quote'` / `'order'` |
| `ticketStatus` / `orderStatus` / `quoteStatus` | `ticket_status` | Unified status column |
| `title` | `title` | Project name — required |
| `referenceCode` | `reference_code` | `O...` prefix auto-generated for orders |
| `linkedLeadId` | `linked_lead_id` | FK → leads |
| `linkedContactKey` | `customer_id` | FK → customers (CRM path) |
| `contactName` | `contact_name` | Denormalized |
| `contactCompany` | `contact_company` | Denormalized |
| `contactEmail` | `contact_email` | Denormalized |
| `contactPhone` / `linkedContactPhoneDigits` | `contact_phone` | Denormalized, digits-only |
| `createdAt` | `created_at` | |
| `orderSource` | `order_source` | `'quoted'` (from approved quote) / `'direct'` |

### SKU line items (stored as `jsonb[]` in `quote_skus`)
Each SKU object:
| Shadow field | Production key | Notes |
|---|---|---|
| `productType` | `product_type` | e.g. "Labels", "Boxes" |
| `description` | `description` | **Derived** — never manually entered; built from productType + material + lamination |
| `quantity` | `quantity` | |
| `unitPrice` | `unit_price` | |
| (computed) | `line_total` | qty × unitPrice |
| `material` | `material` | |
| `lamination` | `lamination` | |
| `width` | `width` | Inches |
| `height` | `height` | Inches |
| `designRequired` / `designOnFile` | `design_required` | |
| `hasDieCut` / `dieCut` | `die_cut` | |

> **Important:** The description shown in the UI and PDF is derived programmatically by `quoteSkuDescription(sku)` from productType + material + lamination. The user never types a description — they select product type, material, and lamination and the description assembles itself.

### Pricing (all computed and stored)
| Shadow field | Production column | Formula |
|---|---|---|
| (from SKU loop) | `quote_subtotal` | `SUM(qty × unit_price)` across all SKUs |
| `quoteShipping` | `quote_shipping` | Manual entry |
| `applyDiscount` | — | Boolean form state, not stored |
| `discountType` | `discount_type` | `'percent'` / `'fixed'` |
| `discountValue` | `discount_value` | Raw string value entered |
| `discountAmount` | `discount_amount` | Computed: percent → `(subtotal × value/100)`; fixed → `min(value, subtotal)` |
| `discountReason` | `discount_reason` | Optional note |
| `quotePreTaxTotal` | `quote_pre_tax_total` | `subtotal - discount_amount + shipping` |
| `quoteTaxRatePercent` | `quote_tax_rate_percent` | e.g. `8.25` |
| `quoteTaxAmount` | `quote_tax_amount` | `pre_tax_total × (tax_rate / 100)` |
| `quoteFinalTotal` | `quote_final_total` | `pre_tax_total + tax_amount` |
| `taxExempt` | `tax_exempt` | Boolean |
| `salesPermitNumber` | `sales_permit_number` | Required when tax_exempt = true |

### Payment
| Shadow field | Production column | Notes |
|---|---|---|
| `quotePaymentTypes[]` | `quote_payment_types` | `text[]` array — **not** a single value |
| `prepaymentType` | `prepayment_type` | `'percent'` / `'fixed'` / `'none'` |
| `prepaymentValue` | `prepayment_value` | Raw string |

**Payment types in shadow:** `'card_default'` (Card Payment), `'zelle'` (Zelle), `'offline'` (Offline). At least one must be selected. Card is checked by default.

**Prepayment split formula:**
```
dueNow = prepaymentType === 'percent'
  ? round(finalTotal × prepaymentValue / 100, 2)
  : round(min(prepaymentValue, finalTotal), 2)
balance = max(finalTotal - dueNow, 0)
```

**Rule: In edit mode there is no "None" prepayment option.** Legacy tickets stored with `none` get coerced to `percent / 25` when opened for editing. Read-only view keeps `none` as-is.

### Quote delivery
| Shadow field | Production column | Notes |
|---|---|---|
| `quoteChannel` | `quote_channel` | `'SMS'` / `'WhatsApp'` / `'Email'` / `'In-person'` |
| `quoteDestination` | `quote_destination` | Email address or digits-only phone |

Quote destination field uses `type="email"` when channel is Email, `type="tel"` when SMS/WhatsApp.

### Follow-up
| Shadow field | Production column | Notes |
|---|---|---|
| `quoteReminderDate` | `quote_reminder_date` | Start date of follow-up schedule |
| `followUpCycles` | `follow_up_cycles` | Number of reminders (e.g. 3) |
| `followUpFrequency` | `follow_up_frequency` | `'Daily'` / `'Every 2 days'` / `'Weekly'` |
| `quoteFollowUpCompleted` | `follow_up_completed` | Already in current schema |
| `quoteApprovalLastRequestedAt` | `quote_approval_last_requested_at` | Already in current schema |
| `clientConfirmed` | `client_confirmed` | Already in current schema |

### Order-specific flags
| Shadow field | Production column | Notes |
|---|---|---|
| `rush` | `rush` | Already in schema |
| `priority` | `priority` | Low / Normal / High |
| `dueDate` | `due_date` | |
| `specialRequirements` | `special_requirements` | |
| `designRequired` | `design_required` | Aggregated from SKUs |
| `dieCut` | `die_cut` | Aggregated from SKUs |

---

## 5. Ticket status values

The shadow project uses these status strings across `ticketStatus`, `orderStatus`, `quoteStatus`:

| Status | Meaning |
|---|---|
| `Open` | Default on create |
| `Pending Client Confirmation` | Quote sent, awaiting client |
| `Approved` | Client confirmed |
| `Cancelled` | Cancelled |

Production BazarCRM adds richer statuses (`draft`, `sent`, `in_production`, `completed`) — these need to be mapped.

> **Note:** The shadow project's `'Pending Client Confirmation'` order shell is a special case — it's a placeholder order created alongside a quote, not yet a real order. The `orderTicketsForWorkspaceTab()` function in `statsDateRange.js` explicitly filters these out of the Orders tab. Production must replicate this filter.

---

## 6. Activity types (tickets)

All ticket-related activity types already exist in `lib/types/index.ts`:

| Type | Trigger | Payload |
|---|---|---|
| `order_ticket_created` | Client-side after `POST /api/tickets` | `{ ticketId, ticketKind, title, status, amount, savedCount }` |
| `order_ticket_updated` | Server-side on `PATCH /api/tickets/:id` | `{ ticketId, ticketKind, fields: string[] }` |
| `quote_approval_requested` | Server-side when `quoteApprovalLastRequestedAt` is patched | `{ ticketId, title, amount, at }` |
| `quote_follow_up_completed` | Server-side when `quoteFollowUpCompleted = true` | `{ ticketId, ticketKind }` |
| `quote_follow_up_reset` | Server-side when follow-up fields cleared | `{ ticketId, ticketKind, fields: string[] }` |
| `ticket_client_confirmed` | When `clientConfirmed` toggled to true | `{ ticketId }` |

---

## 7. PDF export — field parity

File to port: `frontend/src/utils/orderTicketPdf.js` → `lib/utils/order-ticket-pdf.ts`

Sections in the generated PDF:
1. **Header**: "Order / Job ticket" + `title`
2. **Ticket section**: `reference_code`, `id` (short), `created_at`, `ticket_status`, `priority`, `due_date`, order source, linked quote reference
3. **Client section**: `contact_name`, `contact_company`, `contact_email`, `contact_phone`
4. **Delivery/channel section**: `quote_channel` + `quote_destination`
5. **Verify/notes section**: `sdr_comment` / `notes`
6. **Special requirements section**: `special_requirements`
7. **Line items table**: Description, Qty, Unit price, Line total (4 columns)
8. **Pricing & discount section**: Subtotal, shipping, discount type/value/amount, pre-tax, tax rate, tax amount, total due, tax-exempt + permit number
9. **Payment summary section**: Order total, amount paid (prepayment), balance due, accepted payment methods
10. **Follow-up section** (if applicable): Start date, cycles, frequency

Key implementation note from shadow: uses `doc.splitTextToSize()` for long text, `ensureSpace()` to add pages when content overflows.

---

## 8. High-value order warning rule

**From shadow project §10.3:**
> When the Quote tab's `Total due` reaches **$5,000 or more**:
> - Show a **yellow warning banner** on both the Line Items tab and the Quote tab
> - The **Next →** button on Line Items is hidden (blocks forward navigation)
> - Clicking the Quote tab directly also shows an `alert()` with the warning message
> - **Send Quote / Create Order** buttons still appear — the SDR/Sales can still submit but must acknowledge

This threshold (`$5,000`) needs owner confirmation — it may need to be configurable.

---

## 9. Key UI rules from shadow (§10)

- **SKU descriptions are derived, never typed.** `quoteSkuDescription(sku)` assembles from productType + material + lamination.
- **Payment types are checkboxes (multi-select), not a single radio/select.** At least one must be checked. Card is default.
- **No "None" prepayment in edit mode.** Coerce legacy `none` → `percent / 25` on edit open.
- **Default quote values on new ticket:** `prepaymentType: 'percent'`, `prepaymentValue: '25'`, `quotePaymentTypes: ['card_default']`.
- **Quote destination field type adapts:** `type="email"` for Email channel, `type="tel"` + digit-strip for SMS/WhatsApp.
- **Read-only OrderDrawer default tab:** Quote tab if `ticketKind === 'quote'`, else Line Items tab.
- **History tab only in read-only mode** — not shown during create/edit wizard.
- **VerifyDrawer read-only on quoted leads:** When a lead's status is `Quoted`, the Contact tab fields are locked (`pointer-events: none` on field wrapper only, NOT on tab buttons — so History tab is still clickable).

---

## 10. Utilities to port

| Shadow file | Production file | Status |
|---|---|---|
| `frontend/src/utils/orderTicketPdf.js` | `lib/utils/order-ticket-pdf.ts` | To build |
| `ContactCRM.jsx` — `normalizeQuoteSkus`, `buildQuoteTicketPayload`, pricing math | `lib/utils/ticket-math.ts` | To build |
| `statsDateRange.js` — `quotedRequestsRowCount`, `orderTicketsForWorkspaceTab`, `ticketAmount` | `lib/utils/ticket-filters.ts` | To build |
| `frontend/src/utils/activity.js` — `buildTicketCreatedActivityBody`, `logTicketsSavedActivity` | Already in `lib/` pattern — inline in API route | Covered |
