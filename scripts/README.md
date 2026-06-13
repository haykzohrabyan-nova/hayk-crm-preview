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

The `scripts/` directory also contains JSON files used for bulk customer imports via the Admin Import UI:

| File | Contents |
|------|---------|
| `customers-batch-4.json` | Customers batch 4 (rows 751–1250 from InkCloud export) |
| `customers-batch-5.json` | Customers batch 5 (rows 1251–1500 from InkCloud export) |

These files include a `customer_since` field that the import process maps to `created_at`.

To import these files: go to **Admin → Import / Export → Customers** tab, upload the file, validate, then commit.
