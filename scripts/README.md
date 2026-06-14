# BazaarPrinting CRM — Scripts

Utility scripts for one-time data operations, migrations, and maintenance tasks. All scripts are intended to be run **locally** from the project root, not in CI or on the server.

---

## Setup

```bash
# Install Python dependencies (required for all .py scripts)
python3 -m pip install requests python-dotenv openpyxl
```

Scripts read env vars from `.env.local` automatically via `python-dotenv`. Alternatively, set them in your shell.

**Required env vars:**

| Variable | Notes |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SECRET_KEY` | Service role key (admin access) — **never commit** |

---

## Scripts

### `auto-merge-duplicates.py`

**Purpose:** Automatically merge all duplicate customers (same phone number) using a deterministic keeper-selection algorithm.

**Keeper selection per group:**
1. Customer with the oldest `created_at` (original record wins)
2. Most non-empty profile fields (first_name, last_name, company, email, industry, heat_tag, website) — tie-break
3. Lowest UUID string — stable final tie-break

**What it does:**
- Fetches all customers in pages of 1000
- Groups by normalised phone (digits only)
- For each group with 2+ records: moves leads, job_tickets, and activities to the keeper → deletes victims
- Logs `auto_merge` activity on each surviving record

**Usage:**
```bash
# Dry run — preview without any DB changes
python3 scripts/auto-merge-duplicates.py --dry-run

# Execute the merge
python3 scripts/auto-merge-duplicates.py
```

**When to run:** After bulk customer imports that may introduce duplicates; or periodically to clean up organic duplicates that accumulate over time.

---

### `backfill-customer-since.py`

**Purpose:** One-time backfill of `created_at` / `updated_at` for existing customers using `customer_since` dates from the InkCloud Excel export.

**What it does:**
- Reads the `InkCloud-Customers-Full.xlsx` file
- For each row with a valid `customer_since` date: looks up the customer in the DB by normalised phone, updates `created_at` and `updated_at`

**Usage:**
```bash
python3 scripts/backfill-customer-since.py
```

> **Note:** This script was run once in Jun 2026 to correct `created_at` for ~1,500 imported customers. It is kept here for reference; running it again is safe but a no-op if the data is already correct.

---

## Import JSON files

The `scripts/` directory also contains JSON files used for bulk imports via the Admin Import UI:

| File | Contents |
|------|---------|
| `customers-batch-4.json` | Customers batch 4 (rows 751–1250 from InkCloud export) |
| `customers-batch-5.json` | Customers batch 5 (rows 1251–1500 from InkCloud export) |

These files include a `customer_since` field that the import process maps to `created_at`.

To import: go to **Admin → Settings → Customer import**, upload, validate, commit.

---

## Order import — InkCloud legacy orders

### `convert-inkcloud-orders.py`

**Purpose:** Converts `InkCloud-Legacy-Orders-Full.xlsx` into BazaarPrinting CRM bulk-import JSON batches.

**Source file:** `/Users/nilay/Library/Messages/Attachments/…/InkCloud-Legacy-Orders-Full.xlsx`

**What it does:**
- Reads 17,460 line-item rows and groups them into 8,485 unique orders
- Separates 103 orders with no phone into a review file
- For each importable order:
  - Splits `customer_name` → first / last name
  - Sets `ticket_status: "completed"` and `payment_status: "paid"` for all historical orders
  - Stores `tax_amount` as its own field (→ `quote_tax_amount` / `quote_pre_tax_total` / `quote_final_total` in DB)
  - Auto-computes `discount_amount` when `subtotal > (total − tax)` by more than 2 cents
  - Detects `payment_method` from order notes using keyword patterns (Zelle, Cash, Card, Wire, Check)
  - Uses order year for reference code (2025 order → `ORD-2025-NNN`, not `ORD-2026-NNN`)
- Outputs 42 JSON batch files of ≤200 orders each

**Usage:**
```bash
python3 scripts/convert-inkcloud-orders.py
```

> No DB access or env vars needed — this script only reads the Excel and writes local JSON files.

---

### `order-import-batches/` — output files

| File | Contents | Status |
|------|----------|--------|
| `orders-batch-001.json` … `orders-batch-042.json` | 8,382 importable orders (200 per file, 182 in last) | **Ready — waiting for owner answers** |
| `orders-no-phone.json` | 103 no-phone orders — review only, NOT for import | Reference |
| `no-phone-orders-review.csv` | Categorized breakdown of the 103 no-phone orders with recommended action per row | Reference |
| `OWNER-QUESTIONNAIRE.html` | Questions for the owner before running the import | **Pending owner response** |
| `OWNER-QUESTIONNAIRE.md` | Same questionnaire in Markdown | Reference |

---

### Current import status — ⏳ Waiting for owner answers

The batch files are fully prepared and validated. Before running the import we are waiting for the owner to answer:

1. **Payment method** — what was the most common way customers paid? (727 orders already auto-detected from notes; need a default for the remaining 7,655)
2. **Were all orders paid in full?** — confirm `payment_status: "paid"` is correct for all
3. **Were any orders cancelled?** — confirm all can be imported as `"completed"`
4. **Phone for "holo roll"** — 19 orders · $8,643 · placeholder phone `8888888888` in old system
5. **Phone for Esther Farag / Execuprint** — 39 orders · $54,095 · no phone on file

Send the owner `order-import-batches/OWNER-QUESTIONNAIRE.html` and wait for replies.

---

### How to run the import (once owner answers)

1. If owner provides a default payment method: update the `payment_method` default in `convert-inkcloud-orders.py` and re-run the script to regenerate batches.
2. If owner provides phone numbers for holo roll / Execuprint: add them to the script's override map and regenerate their orders into a separate batch.
3. Go to **Admin → Settings → Order import** in the CRM.
4. Upload `orders-batch-001.json` first — validate (dry run), check the preview, then commit.
5. Repeat for batches 002 through 042 (~15–20 minutes total).

> **Known limitation:** Imported orders display product names correctly in read-only view. If a staff member edits a historical line item, the product type dropdown will appear blank (InkCloud's 585 product configurations don't match the CRM's product catalog). This is acceptable for historical completed orders.
