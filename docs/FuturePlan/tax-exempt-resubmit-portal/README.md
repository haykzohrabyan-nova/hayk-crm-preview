# Future plans

Planned features and flows that are **not yet implemented**. Use these documents when prioritizing work; implementation should update `docs/CHANGELOG.md` and `docs/TECHNICAL_REFERENCE.md` when shipped.

| Plan | Status | Summary |
|------|--------|---------|
| [tax-exempt-resubmit-portal.md](./tax-exempt-resubmit-portal.md) | Not started | Staff replace permit, deny/request-new with OTP customer upload, missing-documents opt-out, internal denial notes, email templates |

**Prerequisites already in repo (shipped):** migrations `103`–`106`, tax-exempt approval on `/payments`, `deny_tax_exempt` / `approve_tax_exempt` APIs, [`approve-tax-exempt-modal.tsx`](../../../components/orders/approve-tax-exempt-modal.tsx), **legacy queue** for pre-103 tickets (permit # without file — staff upload on order, then accountant confirm). See `docs/TECHNICAL_REFERENCE.md` (tax-exempt accountant approval) and `docs/CHANGELOG.md` (2026-06-02 entries).

**Cursor plan source (archive):** `.cursor/plans/tax-exempt_resubmit_portal_e860babd.plan.md` — keep in sync with this doc when the plan changes.
