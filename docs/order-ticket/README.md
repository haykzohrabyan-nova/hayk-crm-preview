# Order Ticket Module — Documentation Index

This folder contains all research, analysis, and planning documents for the **Tickets phase** of BazarCRM (Quotes & Orders). Before any development begins, the open questions in [`open-questions.md`](./open-questions.md) must be answered by the product owner.

---

## Documents in this folder

| File | Purpose |
|------|---------|
| [`shadow-project-analysis.md`](./shadow-project-analysis.md) | Complete analysis of the `sdr-crm-system` POC — what it built, how it works, what to port |
| [`data-model.md`](./data-model.md) | Field-by-field comparison: current `job_tickets` schema vs shadow project's richer model; what needs to be added |
| [`workflows.md`](./workflows.md) | Every role's order/quote creation flow from the shadow project; entry points, state transitions, status rules |
| [`open-questions.md`](./open-questions.md) | All unanswered questions that must be confirmed by the owner before development starts |
| [`integration-plan.md`](./integration-plan.md) | Phase-by-phase build plan with file paths, dependencies, and build order |

---

## Status

| Phase | Status |
|-------|--------|
| Shadow project analysis | Done |
| Data model gap analysis | Done |
| Workflow documentation | Done |
| Owner questions | Awaiting answers |
| Development | Not started — blocked on owner questions |

---

## Key decisions needed

The following decisions are **blocking development**. Full detail in [`open-questions.md`](./open-questions.md).

1. **Ticket visibility** — shared board (all users see all tickets) vs. scoped by owner
2. **SDR ticket creation** — can SDR create a quote/order, or only route to Sales?
3. **High-value threshold** — is the $5,000 quote warning rule in effect?
4. **Payment options** — are Card / Zelle / Offline the right options for this business?
5. **Navigation** — separate `/quotes` and `/orders` pages, or tabs under `/tickets`?
6. **PDF branding** — where is company info stored; does a logo appear on the PDF?
