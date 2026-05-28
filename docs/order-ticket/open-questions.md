# Open Questions — Tickets (Quotes & Orders) Module

Technical reference for the dev team. For the owner-facing version see [`owner-questionnaire.md`](./owner-questionnaire.md).

**Status key:**
- ✅ **ANSWERED** — confirmed from shadow project code or owner session (2026-05-11)
- ⚠️ **DESIGN CHANGE** — owner chose a different approach from the shadow project prototype
- 🔄 **OWNER REVIEW** — pre-filled from shadow; owner should confirm it matches production intent
- ❌ **DEFERRED** — explicitly deferred to a future phase

**All questions resolved — 2026-05-11 owner review session.**

---

## Section A — Access Control & Visibility

---

**A1. Who can see the Quotes page (`/quotes`)?**

✅ **ANSWERED — 2026-05-11 owner session.**

**Answer: Scoped — each rep sees only tickets they created.** Admin sees all.

> Owner note: "Only in the CRM when we have all the customers with the list, any user can click on the customer and in the customer's page we will show all the quotes and all the orders for that customer. We also will show which order and quote belongs to which user. And admin user can see all the quotes."

**Implementation:**
- `/quotes` page: filter by `created_by = auth.uid()` for non-admin users
- Customer/contact detail page: show all quotes/orders for that customer regardless of creator (with `created_by` visible in the row)
- Admin: no filter — sees all

RLS policy in migration 041: SELECT requires `created_by = auth.uid() OR user_role = 'admin'`.

Blocks: RLS policy in migration 041, `app/api/tickets/route.ts` GET filter.

---

**A2. Who can see the Orders page (`/orders`)?**

✅ **ANSWERED — 2026-05-11 owner session.**

**Answer: Scoped — same as A1.** Each rep sees only their own orders. Admin sees all.

> Owner note: "Only the Admin can see everything."

Blocks: Same as A1.

---

**A3. Can Admin see and edit ALL tickets?**

✅ **ANSWERED** — Admin has `bypass_rls` or is handled via role check in all other routes. Will follow the same pattern: Admin reads and edits all tickets.

No owner question needed — consistent with rest of app.

---

## Section B — Creation Rights & Workflow

---

**B1. Can an SDR create a quote or order?**

✅ **ANSWERED from shadow project code (`VerifyDrawer.jsx` lines 74, 288, 397–450).**

**Answer: Yes — from VerifyDrawer only.** The SDR creates tickets from inside the lead they are working. The standalone `/quotes` and `/orders` pages do not show a "Create" button for SDR.

Evidence:
```javascript
// VerifyDrawer.jsx line 288
const isLockedStatus = formData.status === 'Rejected' || formData.status === 'Routed to Sales' || formData.status === 'Quoted';
// Order/Quote tab is available when lead is NOT in a locked status
```

---

**B2. When SDR creates a ticket, does the lead auto-route to Sales?**

✅ **ANSWERED from shadow project code (`VerifyDrawer.jsx` lines 394–450) — confirmed by owner.**

**Answer: Lead stays with SDR. Status changes, no auto-route.**

> Owner note: "As in the docs it does not go to the sales pipeline but becomes part of the CRM."

Exact behavior:
- Ticket has quote SKUs → `lead.status = 'Quoted'`, `lead.salesStatus = 'Quote Sent'`
- Order only (no quote) → `lead.status = 'Validated'`
- Lead does **not** get routed to Sales automatically

---

**B3. Can Sales create a ticket for any contact, or only claimed leads?**

✅ **ANSWERED from shadow project (`SalesDashboard.jsx`, `ContactCRM.jsx`).**

**Answer: Both paths exist:**
1. From SalesDrawer on a claimed lead → linked to that lead
2. From CRM toolbar "+ Add Order" → contact search step first, no lead linked

No restriction to "claimed leads only."

---

**B4. Can a quote be "converted" to an order?**

⚠️ **DESIGN CHANGE — owner chose a different model from the shadow project.**

**Shadow project answer:** Both tickets (quote + order shell) are created simultaneously at save time. The order shell was hidden until client confirmed.

**Production answer:** The quote ticket *itself* becomes the order based on user/client input. No separate order record is created simultaneously. Re-examine the shadow project code for the exact transition mechanics and adapt accordingly.

> Owner note: "We do not make an additional order. The quote itself becomes an order depending on the user input. We can get more information from the shadow project on how it is done there."

**Impact:** The `requires_client_confirmation` toggle and the simultaneous order shell creation from shadow's `ContactCRM.jsx` lines 1400–1435 should NOT be ported as-is. The ticket status transitions from quote → order in place.

---

**B5. Can an existing ticket be edited after it is sent/approved?**

✅ **ANSWERED — 2026-05-11 owner session.**

**Answer: Locked once the ticket is an order — no editing by reps. Owner/Admin can cancel (only if no payment has been made). Cancelling triggers a "duplicate & adjust" flow.**

> Owner note: "The ticket is a quote so if the ticket is already an order and the client wants to make a change we do not edit the order. The owner and the admin can cancel the order if there was no payment made. And if the user is trying to cancel the ticket we will ask if the user wants to duplicate the ticket with same items and make a new ticket and make the adjustments."

**Implementation in OrderDrawer:**
- Edit button: hidden once `ticket_status` is in an order state
- Cancel button: visible to admin/owner only; disabled if payment has been recorded
- On cancel confirmation: show dialog — "Would you like to duplicate this ticket with the same items and make adjustments?" → Yes creates a new draft ticket pre-filled with the same line items

Blocks: Edit button visibility logic, Cancel action, duplicate ticket API endpoint.

---

**B6. Sent-quote email shows old total after rep edits — how should we handle it?**

✅ **Implemented 2026-05-28** — Option **B / D hybrid:** post-save modal prompts resend; `notify_revision` on PATCH adds revision copy to email/SMS. Portal always current after save. See `resend-after-save-modal.tsx`, [TODO-008](../TODO.md).

---

**B7. Admin marks order completed while balance is still due — intended flow?**

⚠️ **OWNER DECISION NEEDED — 2026-05-23**

**Problem:** In-production orders with partial deposit may still owe balance. Accountants are blocked from marking completed until paid in full. **Admins** can complete with balance due after acknowledging a modal; customer receives ready-for-pickup email with the same `/q/{token}` link where balance can still be paid.

**Pick one:**

- [ ] **A — Block all roles** — Completion requires paid in full for everyone (remove admin override).
- [ ] **B — Admin override (current build)** — Admin may complete with balance due; pickup email sent; balance collected via public link afterward.
- [ ] **C — Complete with balance-aware email** — Admin override allowed; pickup email explicitly states balance due before pickup.
- [ ] **D — No pickup email until paid** — Admin may complete internally but customer notification waits until balance clears.

**Tracked in:** [TODO-009](../TODO.md#open--owner-question-mark-completed-with-balance-still-due-todo-009) · Owner HTML: [owner-decisions-pending.html](./owner-decisions-pending.html#question-2)

---

## Section C — Pricing & Business Rules

---

**C1. What payment methods?**

✅ **ANSWERED from shadow project code — confirmed by owner.**

```javascript
const QUOTE_PAYMENT_TYPE_OPTIONS = [
  { value: 'card_default', label: 'Card Payment' },
  { value: 'zelle',        label: 'Zelle' },
  { value: 'offline',      label: 'Offline' },
];
// Default: ['card_default']
```

> Owner answer: "Correct as-is."

Blocks: `quote_payment_types` enum values, checkbox list in OrderDrawer.

---

**C2. Default tax rate?**

✅ **ANSWERED — 2026-05-11 owner session.**

**Answer: Admin-configurable from Admin → Company tab.** No hardcoded default.

> Owner note: "This should be manageable from the Admin panel. We can put this in the company tab."

**Implementation:** Remove `DEFAULT_QUOTE_TAX_RATE_PERCENT = 8.25` constant from `ticket-math.ts`. The tax rate shown in OrderDrawer is read from the company settings record. Rep can still override per quote.

Blocks: `DEFAULT_TAX_RATE` constant removed from `lib/utils/ticket-math.ts`; add `default_tax_rate` field to company settings schema.

---

**C3. High-value order warning threshold?**

✅ **ANSWERED — 2026-05-11 owner session. Significant behavior change from shadow project.**

**Shadow project:** $5,000 warning banner — SDR must acknowledge but can still send.

**Production answer:** Threshold is configurable from Admin → Company Info tab. When the total exceeds this threshold, the SDR's **only available action is to route the lead to the Sales Pipeline** — they cannot send the quote themselves. This is a hard block, not a soft warning.

> Owner note: "We will set this value from the admin panel under the company information. If the order total is more than that number then the only action the SDR can take is to send to the Sales Pipeline."

**Implementation:**
- Remove `HIGH_VALUE_THRESHOLD = 5000` constant; read threshold from company settings
- When `quoteFinalTotal >= threshold` AND `user_role = 'SDR'`: hide Send Quote button; show "Route to Sales" button only
- Admin/Sales reps are not blocked

Blocks: `HIGH_VALUE_THRESHOLD` constant removed, warning banner replaced with hard block in OrderDrawer, company settings schema needs `high_value_threshold` field.

---

**C4. Are product types, materials, and finishes admin-managed or hardcoded?**

✅ **ANSWERED — owner confirmed admin-managed from Admin → Products tab.**

**C4a — Product name alignment (pulse vs shadow names):**

✅ **ANSWERED — 2026-05-11 owner session.**

**Answer: Use the updated production names from the pulse/shadow project.**

> Owner note: "We will use these names from the pulse shadow project."

| Old name (prototype) | Production name (use this) |
|---|---|
| Stickers | Diecut Stickers |
| Flyer | Flyers / Postcards |
| Vinyl Banners | Banners / Large Format |

**C4b — Canvas Prints, Jars, Tubes:**

✅ **ANSWERED — 2026-05-11 owner session.**

**Answer: Not included in the initial build.** Will be added manually via Admin → Products panel in a future phase.

> Owner note: "We will add this manually from the admin panel in the future."

**C4c — Material dropdown filter by facility:**

✅ **ANSWERED — 2026-05-11 owner session.**

**Answer: No facility filter.** Show all materials for the selected product type. Reps pick the correct one.

> Owner answer: radio selected "No — show all materials; the rep picks the right one."

---

**C5. Does "Rush" affect pricing?**

✅ **ANSWERED — 2026-05-11 owner session. Behavior is admin-configurable.**

**Answer: Rush surcharge (if any) is configurable from Admin → Company Info tab.** If no surcharge is configured, Rush is informational only (badge only, no price impact — same as shadow project).

> Owner note: "We will set this value also from the admin panel company information."

**Implementation:** Add `rush_surcharge_percent` or `rush_surcharge_flat` to company settings. If set, OrderDrawer applies surcharge to total when rush toggle is on. If null, Rush is badge-only.

---

**C6. Is shipping manual or fixed?**

✅ **ANSWERED from shadow project code — confirmed by owner. Extended May 2026.**

**Answer: Manual entry per quote when shipping is selected.** Default fulfillment is **Pickup** (no shipping charge). When rep selects **Ship to customer**, **Shipping ($)** is required (> 0). Delivery address is **optional** (ZIP validated if entered). Past ship-to addresses for a customer are offered from prior tickets (`GET /api/customers/[id]/shipping-addresses`).

> Owner answer: radio selected "Manual entry per quote."

---

## Section C7 — Production Cost Calculator

---

**C7. Should the pricing/cost calculator be embedded in the OrderDrawer?**

✅ **ANSWERED — 2026-05-11 owner session.**

**Answer: Keep as a separate tool.** Rep enters unit price manually. The pricing engine is not being built in this phase.

> Owner answer: radio selected "Keep as a separate tool."
> Owner note (Q18a): "The user that makes the quote will add the price manually."
> Owner note (Q18b): "The admin will do this but this is a future thing. We are not building the pricing engine now."

**No impact on current build:** OrderDrawer SKU rows have a simple `unit_price` number input only. No "Calculate price" button needed.

---

**C8. Facility field on tickets (16th Street vs Boyd Street)?**

✅ **ANSWERED — 2026-05-11 owner session (answered via C4c).**

**Answer: No facility field on tickets.** No facility selector in OrderDrawer. Materials are shown without facility filtering.

---

**C9. Full material sub-options or group-level only?**

✅ **ANSWERED — 2026-05-11 owner session.**

**Answer: Admin-managed.** The owner adds products and materials manually via the Admin → Products panel. Whatever detail level is entered in the admin panel is what reps see. No constraint is hardcoded either way.

> Owner note: "We will add this from the admin panel manually."

Blocks: Admin seed data determines the dropdown content; SKU row material dropdown renders whatever is in the database.

---

## Section D — App Navigation

---

**D1. `/tickets` hub vs separate `/quotes` and `/orders` pages?**

✅ **ANSWERED — 2026-05-11 owner session.**

**Answer: Keep as two separate pages.** "Quoted Requests" and "Orders" remain as two distinct sidebar links.

> Owner answer: radio selected "Keep as two separate pages."

No navigation changes needed.

---

**D2. "Create" button on the standalone pages?**

✅ **ANSWERED from shadow project** — no standalone create button on the list pages. Creation always happens from a lead drawer (VerifyDrawer / SalesDrawer) or from CRM toolbar "+ Add Order".

---

## Section E — PDF Export

---

**E1. Company info for PDF header?**

✅ **ANSWERED** — Company information (name, address, phone, email, logo, website) will be stored in and read from the **Admin → Company Info tab** (`/admin/settings/company`). The PDF generation will fetch these details from the database at render time.

---

**E2. Logo on PDF?**

✅ **ANSWERED — 2026-05-11 owner session.**

**Answer: Yes — include the logo.** Logo is stored in Admin → Company Info tab.

> Owner note: "We already have this. This information should be in the admin panel in the company tab."

**Implementation:** `order-ticket-pdf.ts` reads `company_logo_url` from the company settings record and includes it in the PDF header.

---

## Section F — Statistics & KPIs

---

**F1. Revenue in Statistics and Dashboard?**

✅ **ANSWERED — 2026-05-11 owner session.**

**Answer: Yes — show on Dashboard.** Each rep sees their own revenue totals (tickets they created). Admin sees everyone's totals. Data comes from approved/active ticket `quote_final_total` values.

> Owner note: "We will show it in the dashboard. Each user will see their numbers and admin will see everything. In the shadow project it calls statistics. We will use the dashboard to show that information."

**Note:** The shadow project had a separate "Statistics" tab. In production, this data surfaces on the Dashboard page instead.

---

**F2. How to count "Won" deals for Sales KPIs?**

✅ **ANSWERED** — will use `ticket_status = 'approved'` on job tickets (consistent with shadow's `clientConfirmed / Approved` state). `sales_status = 'Won'` on leads remains as a parallel signal.

---

## Section G — Notifications & Follow-up

---

**G1/G2 — Follow-up notifications and cross-rep alerts**

❌ **DEFERRED** — Notifications module is not yet built. These questions are noted for when notifications are built. No impact on Tickets phase build.

---

## Section H — Misc / Edge Cases

---

**H1. Order reference number format?**

✅ **ANSWERED — 2026-05-11 owner session.**

**Answer: Year + sequential — `ORD-2026-001`, `ORD-2026-002` ...** Counter resets at the start of each year.

> Owner answer: radio selected "Year + sequential."

**Implementation:** Add a `order_sequence_counters` table (year → last_number) or use a database sequence that resets annually. Generate `reference_code` as `'ORD-' || year || '-' || lpad(next_val::text, 3, '0')` in `POST /api/tickets`.

Blocks: `reference_code` generation in `POST /api/tickets`.

---

**H2. Tickets on lead merge?**

✅ **ANSWERED** — existing customer merge API (`app/api/customers/[id]/merge/route.ts`) already updates `leads`. We will add `job_tickets.customer_id` to the same merge logic. `linked_lead_id` updates naturally since lead IDs are preserved in the surviving record.

---

**H3. Max SKU lines per ticket?**

✅ **ANSWERED from shadow** — no limit. Will use no limit in production unless owner requests one.

---

**H4. Locking on tickets (concurrent editing)?**

✅ **ANSWERED from shadow** — no locking. Any authorized user can edit at any time (subject to the B5 edit guard). Will use the same model in production (no ticket lock, unlike leads).

---

## Summary — Final Status

### ✅ Answered (all resolved as of 2026-05-11)

**From shadow project code (no owner input needed):**
A3, B1, B3, C1, C6, D2, F2, H2, H3, H4

**Confirmed / decided by owner (2026-05-11 review session):**
A1, A2, B2, B5, C2, C3, C4a, C4b, C4c/C8, C5, C7/C9, E1, E2, F1, H1

**Navigation confirmed (no change):**
D1

### ⚠️ Design Change (differs from shadow project — read carefully before building)

| ID | Change |
|---|---|
| A1/A2 | Scoped visibility — each rep sees own tickets only (shadow had no filter) |
| B4 | Quote becomes the order in place — no simultaneous order shell (shadow created both at once) |
| C3 | High-value threshold forces Sales routing for SDR (shadow was just a warning banner); threshold is admin-configurable |

### ❌ Deferred (no impact on current build)

G1, G2 — notifications module not yet built  
C7/Q17, Q18a, Q18b — pricing engine deferred to future phase
