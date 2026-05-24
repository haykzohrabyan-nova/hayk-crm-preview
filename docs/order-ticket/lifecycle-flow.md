# Lead → Quote → Order → In Production — Full Flow

> **As built in BazarCRM (May 2026)** — matches `maybe-convert-quote-to-order.ts`, `maybe-auto-release-production.ts`, and public `/q/{token}` portal.

Use this when explaining the lifecycle to the team. For API details see `docs/feature-specs/tickets.md` and `docs/feature-specs/invoice-payment.md`.

---

## 1. Bird’s-eye view

```mermaid
flowchart TB
  subgraph LEAD["Lead (CRM / Leads workspace)"]
    L1[Lead created / validated]
    L2[Rep creates quote linked to lead]
    L3["Lead status → Quoted<br/>sales_status → Quote Sent"]
  end

  subgraph QUOTE["Quote stage — /quotes · QUO-*"]
    Q1[draft]
    Q2["sent — quote delivered to customer"]
    Q3["client_confirmed on public link<br/>(quote may STAY sent)"]
  end

  subgraph PAY["Payment & validation"]
    P1[Customer pays on /q/token]
    P2{Wire / ACH / Zelle / card?}
    P3["Evidence pending<br/>/payments queue"]
    P4[Accountant confirms payment]
    P5[Cash + receipt → auto-record]
  end

  subgraph ORDER["Order stage — /orders · ORD-*"]
    O1["ticket_status = order<br/>ticket_kind = order"]
    O2["Awaiting payment confirmation<br/>(if evidence pending)"]
  end

  subgraph PROD["Production — /orders In Production tab"]
    PR1["ticket_status = in_production"]
    PR2["Lead sales_status → Won"]
    PR3[Optional: balance due → pay on /q/token]
    PR4["completed + pickup email"]
  end

  L1 --> L2 --> L3 --> Q1 --> Q2
  Q2 --> Q3
  Q2 --> P1
  Q3 --> P1
  P1 --> P2
  P2 -->|Yes| P3 --> P4
  P2 -->|No cash| P5
  P4 --> O1
  P5 --> O1
  O1 --> O2
  O1 --> PR1
  O2 -->|After confirm| PR1
  PR1 --> PR2
  PR1 --> PR3
  PR3 --> PR4
```

---

## 2. Detailed flow (like the whiteboard sketch)

This mirrors the hand-drawn **Quote Sent → confirm → pay → Order → In Production** logic.

```mermaid
flowchart TD
  START([Rep sends quote]) --> SENT["Quote Sent<br/>Status: sent · QUO-*<br/>Page: /quotes"]

  SENT --> CONFREQ{Require client<br/>confirmation?}

  CONFREQ -->|No| PRICEOK["Price gate open<br/>Step 1: Not required"]
  CONFREQ -->|Yes| CONFWAIT["Public /q/token<br/>Step 1: Confirm quote price"]

  CONFWAIT --> CONFCLICK{Customer clicked<br/>Confirm & Accept?}
  CONFCLICK -->|Not yet| CONFWAIT
  CONFCLICK -->|Yes| CONFYES["client_confirmed = true<br/>Tag: Confirmed — awaiting deposit<br/>Still on /quotes until payment"]

  CONFYES --> STRAT
  PRICEOK --> STRAT

  STRAT{Payment strategy?}

  STRAT -->|Full payment| FULL
  STRAT -->|Partial deposit| PART
  STRAT -->|Net terms| NET

  FULL --> PAYFULL["Customer pays full amount<br/>on /q/token"]
  PART --> PAYDEP["Customer pays deposit<br/>on /q/token"]
  NET --> NETGATE{Price gate OK?}

  NETGATE -->|Yes| NETCONV["Convert + may auto-release<br/>no upfront payment"]

  PAYFULL --> PAYMETHOD
  PAYDEP --> PAYMETHOD

  PAYMETHOD{Payment channel?}

  PAYMETHOD -->|Cash + receipt ID| CASH["Payment recorded immediately"]
  PAYMETHOD -->|Wire / ACH / Zelle / card| EVID["Evidence uploaded<br/>NOT paid yet"]

  EVID --> EVIDPEND["Awaiting payment confirmation<br/>/payments + /orders for owner"]
  EVIDPEND --> ACCT{Accountant<br/>confirms?}
  ACCT -->|No| EVIDPEND
  ACCT -->|Yes| PAIDRECORD["Payment recorded<br/>Email: payment confirmed"]

  CASH --> GATES
  PAIDRECORD --> GATES

  GATES{Convert gates met?<br/>payment + confirm if required}

  GATES -->|No| SENT
  GATES -->|Yes| ORDER["ORDER<br/>ticket_status = order · ORD-*<br/>Page: /orders"]

  NETCONV --> PRODCHK

  ORDER --> PRODCHK{Production gates met?<br/>price + deposit/full or net}

  PRODCHK -->|No — partial paid, balance due| ORDERPART["Order stays pending payment<br/>Deposit paid · balance later"]
  PRODCHK -->|Yes| INPROD["IN PRODUCTION<br/>ticket_status = in_production<br/>Page: /orders · In Production"]

  ORDERPART --> INPRODPART["May enter production<br/>after deposit confirmed"]

  INPRODPART --> INPROD
  INPROD --> WON["Linked lead → sales_status Won<br/>(SDR Won tab / dashboard)"]

  INPROD --> BAL{balance<br/>remaining?}
  BAL -->|Yes| BALPAY["Customer pays balance on /q/token<br/>Same evidence → accountant flow"]
  BALPAY --> BALDONE[Paid in full on portal]
  BAL -->|No| BALDONE

  BALDONE --> COMPLETE{Staff marks<br/>completed?}
  COMPLETE -->|Accountant| COMPPAID{Paid in full?}
  COMPPAID -->|No| INPROD
  COMPPAID -->|Yes| DONE["completed<br/>Pickup email · same /q/token"]
  COMPLETE -->|Admin + balance due| ADMODAL["Acknowledge balance modal"]
  ADMODAL --> DONE

  classDef outcome fill:#FEF9C3,stroke:#CA8A04,color:#713F12
  classDef queue fill:#FFFBEB,stroke:#D97706,color:#92400E
  classDef page fill:#EAF0FB,stroke:#1B2B4B,color:#1B2B4B

  class ORDER,INPROD,DONE outcome
  class EVIDPEND,EVID queue
  class SENT,CONFYES page
```

---

## 3. CRM pages at each stage

| Stage | Ticket status | Reference | Primary CRM page | Customer public page |
|-------|---------------|-----------|------------------|----------------------|
| Quote draft | `draft` | QUO-* | `/quotes` | — |
| Quote sent | `sent` | QUO-* | `/quotes` | `/q/{token}` — confirm + pay |
| Confirmed, awaiting pay | `sent` + `client_confirmed` | QUO-* | `/quotes` (badge: Confirmed — awaiting deposit) | `/q/{token}` |
| Payment under review | `sent` or `order` + evidence | QUO-* or ORD-* | `/payments` (accountant) + `/orders` (owner: Awaiting payment confirmation) | `/q/{token}` — under review |
| Order | `order` | ORD-* | `/orders` · Pending Payment | `/q/{token}` |
| In production | `in_production` | ORD-* | `/orders` · In Production | `/q/{token}` — pay balance if partial |
| Completed | `completed` | ORD-* | `/completed` | `/q/{token}` — ready for pickup |

---

## 4. What does **not** convert to order

| Action alone | Converts to order? |
|--------------|-------------------|
| Customer confirms on public link | **No** (sets `client_confirmed` only; quote stays on `/quotes`) |
| Customer uploads wire evidence | **No** (queues for accountant; stays quote until confirmed payment) |
| SDR/Sales **Convert to Order** button | **No** — hidden; **admin only** |
| Net terms + customer confirm (if gates pass) | **Yes** — exception: may convert + auto-release on confirm |
| Accountant **record_payment** / cash auto-record | **Yes** — when payment + confirm gates pass |
| Admin manual convert | **Yes** — override (may show Admin converted banner) |

---

## 5. Lead **Won** timing

```mermaid
flowchart LR
  A[Order conversion] --> B{Production released?}
  B -->|No| C["Lead NOT Won yet<br/>still Quote Sent / Ongoing"]
  B -->|Yes in_production| D["Lead sales_status = Won"]
```

Won is **not** set when the ticket becomes `order`. Won is set only when `production_released_at` is set (`markLeadWonOnProduction`).

---

## 6. Admin exceptions (dashed paths)

```mermaid
flowchart LR
  AD1[Admin: Convert to Order] --> AD2[order without customer confirm / payment]
  AD3[Admin: Mark completed with balance due] --> AD4[completed + pickup email<br/>balance still collectible on /q/token]
```

Owner policy for complete-with-balance: **TODO-009** / open-questions **B7**.

---

## 7. ASCII quick reference (print-friendly)

```
LEAD ──create quote──► QUO sent (/quotes)
                          │
              ┌───────────┴───────────┐
              │ Require confirm?    │
              └───────────┬───────────┘
                    yes │ no
                        ▼
              client_confirmed (may stay QUO sent)
                        │
                        ▼
              Customer pays /q/{token}
                        │
         ┌──────────────┼──────────────┐
         │ cash+receipt │ wire/ach/…   │
         └──────┬───────┴──────┬───────┘
                │              │
           auto-record    evidence pending
                │              │
                │         /payments queue
                │              │
                └──────┬───────┘
                       ▼
              accountant confirm (if evidence)
                       │
                       ▼
              ORD order (/orders)  ◄── quote-until-payment ends here
                       │
                       ▼
              in_production (/orders tab)
                       │
                       ▼
              lead → Won
                       │
              optional balance → /q/{token} again
                       │
                       ▼
              completed (+ pickup email)
```
