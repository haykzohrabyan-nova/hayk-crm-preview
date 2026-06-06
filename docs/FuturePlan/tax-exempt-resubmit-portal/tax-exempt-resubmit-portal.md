# Tax-exempt document workflow (future plan)

**Status:** **Mostly shipped** (Jun 2026) — resubmit, staff replace, and internal denial notes done; **Phase 1b won't build**.  
**Last updated:** 2026-06-06  
**Depends on:** Migrations `103`–`106`, **108** (resubmit), **109**–**110** (email templates); existing tax-exempt approval on Payments.

## Overview

1. **Phase 0** — Staff **Replace document** when accountant already has the correct file. **[x] Shipped**  
2. **Phase 1** — **Request resubmit** → customer email/SMS (admin templates) → OTP upload on `/permit/{token}`. **[x] Shipped** (migration **108**, not 107)  
3. **Phase 1b** — **“I don’t have it” / “Missing documents”**. **[ ] Won't build** — staff use **Deny tax-exempt** (owner decision 2026-06-06)

Payment evidence resubmit (`/evidence/{token}`, OTP portal) shipped alongside Phase 1.

### Implementation checklist

- [x] Phase 0 — Replace API auth + Replace button (payments + `replace-ticket-document-modal.tsx`)
- [x] Phase 1 — Migration **108**, resubmit outreach, `/permit` upload, Request on `/payments`, admin email/SMS templates
- [x] Phase 1 — Deny flow **internal notes** (`sales_permit_denial_notes` on ticket + activity)
- [ ] Phase 1b — Missing documents opt-out + accountant badge — **won't build**
- [x] Email templates + SMS catalog keys (`109`, `110`, admin UI)
- [x] Docs: CHANGELOG, TECHNICAL_REFERENCE, feature-specs, api-contract (Jun 2026 sync)

---

## Review tax-exempt documentation modal — staff actions

Primary UI: `components/orders/approve-tax-exempt-modal.tsx`

| Button | Meaning | On confirm |
|--------|---------|------------|
| **Approve tax-exempt** | Permit valid | Lock exempt totals (existing) |
| **Deny tax-exempt** | Apply sales tax | Dedicated **deny step** in modal → `deny_tax_exempt` + internal notes |
| **Deny and request new** | Customer must upload replacement | Resubmit email + OTP link |
| **Replace document** | Staff has file now | Phase 0 `POST sales-permit` |

### Deny tax-exempt — modal “deny mode” (internal notes only)

When accountant clicks **Deny tax-exempt** (apply tax):

1. **Hide** the rest of the modal (comparison, approve, Deny and request new, Replace).
2. Show a focused panel:
   - **Title:** Deny tax-exempt documentation
   - **Copy:** Sales tax will apply; quote total updates on customer invoice link. Note is **internal only** (not shown to customer).
   - **Reason / notes** (textarea, **required**): company audit — CRM See more + quote/order History only.
   - **Preview taxed total** (read-only, `computeTotalsIfTaxExemptDenied`).
   - **Back** | **Confirm deny**
3. `PATCH { deny_tax_exempt: true, sales_permit_denial_notes: "..." }`

**Persistence (shipped in `schema.sql`):**

| Column | Purpose |
|--------|---------|
| `sales_permit_reviewed_at` / `sales_permit_reviewed_by_id` | Set on deny (same as approve path) |
| `sales_permit_denial_notes` | Required internal note — **not** on public `/q` |

Activity `ticket_tax_exempt_denied` payload: `denial_notes`, totals, `reviewed_by_name`.

**Where internal denial reason appears:**

| Surface | Requirement |
|---------|-------------|
| **Quote / order History** | Full note in timeline (`history-section.tsx`) |
| **CRM → See more** | Denied row + Reason column (`customer-tax-exempt-modal.tsx`, extend `tax-exempt-history` API for denied tickets) |
| **Public `/q`** | Taxed total only — **never** return `sales_permit_denial_notes` from public API |

**Deny and request new** — confirm step: recipient, email preview (OTP + `/permit/{token}`), staff resubmit reason (separate from internal denial notes).

Modal footer:

```
[Cancel]  [Replace document]  [Deny and request new]  [Deny tax-exempt]  [Approve tax-exempt]
```

When **Documents missing** (customer opt-out), prompt accountant to **Deny tax-exempt**.

---

## Customer-facing — “Missing documents” opt-out

| Surface | When visible |
|---------|----------------|
| `/permit/[resubmitToken]` | After OTP verify, below upload form |
| `/q/[public_token]` (optional) | When resubmit or pending banner shown |

Label: **I don’t have this document** / **Missing / can’t provide documents**.

Confirm popup: total will change; sales tax applies; preview **taxedTotal**.

**API:** `POST /api/public/permit/[token]/declare-unavailable` (or quote-token variant).

| Effect | Value |
|--------|-------|
| `sales_permit_customer_unavailable_at` | now |
| Clear OTP / resubmit state | |
| `tax_exempt` | Stays true until accountant denies |
| Banners on `/q` | Hidden |
| Accountant queue | Badge **Documents missing — customer confirmed** |

Accountant still runs **Deny tax-exempt** to apply tax (customer confirm does not auto-tax).

---

## Phase 0 — Staff replace document

`POST /api/tickets/[id]/sales-permit`:

- Allow `isPaymentStaffRole` **or** `canMutateTicket` on POST.
- Optional `sales_permit_number` in formData.
- On replace: delete old file, new file, `sales_permit_submitted_at`, clear `sales_permit_reviewed_at`, activity `ticket_tax_exempt_permit_replaced`, `notifyPublicQuoteUpdated`.

**UI:** `components/orders/replace-sales-permit-button.tsx` on tax-exempt review, payments tax-exempt tab, review modal.

---

## Phase 1 — Customer upload (after “Deny and request new”)

### `/permit/[token]` page

1. OTP from email  
2. Upload permit # + file **or** missing-documents opt-out  
3. Upload replaces file → back to pending queue  

### Email and SMS templates

#### 1. Request updated permit (required)

`lib/integrations/tax-exempt-resubmit-requested-template.ts` + `sendTaxExemptResubmitRequested`

- Customer name, ref, company branding
- Why new document (resubmit_reason/notes — customer-safe, not internal denial notes)
- 6-digit OTP, link `{APP_URL}/permit/{resubmit_token}`, 15 min expiry
- Subject: `Action needed — upload tax-exempt permit for {REF} · {Company}`
- SMS key: `tax_exempt_resubmit_requested`

#### 2. Tax-exempt removed — apply tax (optional)

`tax-exempt-denied-customer-template.ts` — new total + `/q` link only; no internal notes.

#### 3. No email for

Staff replace, missing-documents opt-out, approve (has existing approved template).

### Public quote banner rules

| State | Banner |
|-------|--------|
| Pending review | Under review (existing) |
| Resubmit requested | Upload link to `/permit/{token}` |
| Customer unavailable | None |
| After deny | None; taxed total |

Public API flags: `tax_exempt_review_pending` *(shipped: true only when permit **file** on ticket and not reviewed)*, `tax_exempt_resubmit_required`, `tax_exempt_documents_missing`, optional `tax_exempt_taxed_total_preview` *(future)*.

---

## Data model (migration 107)

| Column | Purpose |
|--------|---------|
| `sales_permit_customer_unavailable_at` | Customer can’t provide docs |
| `sales_permit_resubmit_token` | Upload page token |
| `sales_permit_otp_hash` / `sales_permit_otp_expires_at` | OTP |
| `sales_permit_resubmit_requested_at/by/reason/notes` | Staff requested new doc |
| `sales_permit_denied_at` / `sales_permit_denied_by_id` | Apply-tax deny |
| `sales_permit_denial_notes` | Required internal note |

---

## Outcomes summary

| Action | Who | Tax exempt | Totals | Public banner |
|--------|-----|------------|--------|---------------|
| Approve | Accountant | Yes | Exempt | Off |
| Deny (apply tax) | Accountant | No | Taxed | Off; taxed total only |
| Deny and request new | Accountant | Yes (pending) | Exempt until resolved | Resubmit CTA |
| Replace document | Staff | Yes (pending) | Unchanged | Review pending |
| Missing documents | Customer | Yes until deny | Exempt until deny | Off |
| Customer uploads | Customer | Yes (pending) | Exempt | Review pending |

---

## History activities

| Type | When |
|------|------|
| `ticket_tax_exempt_resubmit_requested` | Resubmit email sent |
| `ticket_tax_exempt_resubmit_received` | Customer uploaded |
| `ticket_tax_exempt_permit_replaced` | Staff replaced |
| `ticket_tax_exempt_customer_unavailable` | Customer missing docs |
| `ticket_tax_exempt_denied` | Apply tax (with internal notes in payload) |

---

## Implementation order

1. Phase 0 — Replace API + UI  
2. Phase 1 — Migration 107, resubmit, modal, deny notes, emails, `/permit`  
3. Phase 1b — Missing documents + accountant badge + banners  

## Key files

**Phase 0:** `app/api/tickets/[id]/sales-permit/route.ts`, `replace-sales-permit-button.tsx`, `tax-exempt-review-section.tsx`, `payments-page.tsx`

**Phase 1:** `supabase/migrations/107_tax_exempt_resubmit.sql`, `app/api/tickets/[id]/route.ts`, `approve-tax-exempt-modal.tsx`, `lib/integrations/tax-exempt-resubmit-requested-template.ts`, `send-quote.ts`, `app/api/public/permit/`, `app/(public)/permit/[token]/`, CRM/history components, `proxy.ts`, `public-quote-document.tsx`

**Phase 1b:** `declare-unavailable` route, `tax-exempt-missing-documents-dialog.tsx`, payments badges

## Risks

- Customer opt-out does not auto-tax; accountant must deny.
- Stale resubmit email after declare-unavailable — invalidate OTP/link.
- Confirm popup must show preview taxed total for informed consent.
