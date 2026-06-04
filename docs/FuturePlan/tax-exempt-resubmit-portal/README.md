# Future plans — tax-exempt resubmit portal

Planned enhancements and **remaining** work for tax-exempt / payment evidence resubmit. Core resubmit flow is **shipped** (Jun 2026) — update `docs/CHANGELOG.md` when adding more.

| Plan | Status | Summary |
|------|--------|---------|
| [tax-exempt-resubmit-portal.md](./tax-exempt-resubmit-portal.md) | **Partially shipped** | See checklist in linked doc |

## Shipped (Jun 2026)

- Migration **108** — resubmit columns on `job_tickets`
- Accountant **Request** on `/payments` (payment evidence + tax-exempt) — `request_payment_evidence_resubmit` / `request_tax_exempt_resubmit`
- Customer: payment proof on `/evidence/{token}` + `app/api/public/evidence/[token]/*`; tax-exempt OTP portal `/permit/{token}` + `app/api/public/permit/[token]/*`
- Admin **Email Templates** + **SMS Templates** for resubmit copy (no staff-typed message in modal)
- `lib/integrations/resubmit-requested-outreach.ts`, `request-evidence-resubmit-flow.tsx`, resubmit list status column

**Docs:** [`docs/feature-specs/invoice-payment.md`](../../feature-specs/invoice-payment.md), [`docs/api-contract.md`](../../api-contract.md), [`docs/email-template-guide.md`](../../email-template-guide.md).

## Not shipped (still in plan doc)

- Staff **replace permit** from payments tab without full deny/approve cycle
- Customer **declare documents unavailable**
- **Internal denial notes** (separate from customer-safe resubmit reason)
- Optional `/q` banner when tax-exempt resubmit pending (permit flow uses `/permit` only today)

**Prerequisites already in repo:** migrations `103`–`106`, tax-exempt approval on `/payments`, `approve_tax_exempt` / `deny_tax_exempt`, [`approve-tax-exempt-modal.tsx`](../../../components/orders/approve-tax-exempt-modal.tsx).

**Cursor plan source (archive):** `.cursor/plans/tax-exempt_resubmit_portal_e860babd.plan.md` — keep in sync with this doc when scope changes.
