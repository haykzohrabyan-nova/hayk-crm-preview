#!/usr/bin/env python3
"""
Auto-merge duplicate customers (same phone number).

Keeper selection rules (per duplicate group):
  1. Keep the customer with the OLDEST created_at (original record).
  2. Tie-break: keep the one with the most non-empty profile fields.
  3. Second tie-break: keep the one with the lowest UUID (stable, arbitrary).

Merge operation per victim:
  - Re-parents leads, job_tickets, activities to the keeper.
  - Deletes the victim row.

Usage:
  pip install requests python-dotenv
  python scripts/auto-merge-duplicates.py

Required env vars (.env.local or shell):
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SECRET_KEY      (service role key)

Run with --dry-run to preview without making any changes.
"""

import os
import sys
import json
import time
import argparse
from datetime import datetime, timezone

try:
    from dotenv import load_dotenv
    load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))
except ImportError:
    pass

try:
    import requests
except ImportError:
    print("ERROR: 'requests' is not installed. Run: pip install requests")
    sys.exit(1)

# ── Config ────────────────────────────────────────────────────────────────────

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SECRET_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY env vars.")
    sys.exit(1)

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

# Fields used to score how "complete" a customer record is
PROFILE_FIELDS = ["first_name", "last_name", "company", "email", "industry", "heat_tag", "website"]

PAGE_SIZE = 1000


# ── Supabase REST helpers ─────────────────────────────────────────────────────

def rest_get(path, params=None):
    r = requests.get(f"{SUPABASE_URL}/rest/v1/{path}", headers=HEADERS, params=params)
    r.raise_for_status()
    return r.json()


def rest_patch(path, params, payload):
    r = requests.patch(
        f"{SUPABASE_URL}/rest/v1/{path}",
        headers=HEADERS,
        params=params,
        json=payload,
    )
    r.raise_for_status()


def rest_delete(path, params):
    r = requests.delete(f"{SUPABASE_URL}/rest/v1/{path}", headers=HEADERS, params=params)
    r.raise_for_status()


def rest_post(path, payload):
    r = requests.post(f"{SUPABASE_URL}/rest/v1/{path}", headers=HEADERS, json=payload)
    r.raise_for_status()


# ── Fetch all customers ───────────────────────────────────────────────────────

def fetch_all_customers():
    fields = "id,first_name,last_name,phone,email,company,industry,heat_tag,website,created_at"
    all_rows = []
    offset = 0
    print("Fetching customers from DB…")
    while True:
        rows = rest_get(
            "customers",
            params={
                "select": fields,
                "order": "created_at.asc",
                "limit": PAGE_SIZE,
                "offset": offset,
            },
        )
        all_rows.extend(rows)
        print(f"  fetched {len(all_rows)} so far…")
        if len(rows) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    print(f"  total: {len(all_rows)} customers\n")
    return all_rows


# ── Keeper selection ──────────────────────────────────────────────────────────

def parse_dt(iso_str):
    if not iso_str:
        return datetime.max.replace(tzinfo=timezone.utc)
    try:
        s = iso_str.replace("Z", "+00:00")
        return datetime.fromisoformat(s)
    except ValueError:
        return datetime.max.replace(tzinfo=timezone.utc)


def completeness_score(c):
    return sum(1 for f in PROFILE_FIELDS if c.get(f) and str(c[f]).strip())


def pick_keeper(group):
    """
    From a list of customers with the same phone, return the one to keep.
    Rule 1: oldest created_at  (ascending → first wins)
    Rule 2: most non-empty profile fields
    Rule 3: lowest UUID string (stable tie-break)
    """
    return min(
        group,
        key=lambda c: (
            parse_dt(c.get("created_at")),   # older = smaller = better
            -completeness_score(c),           # more fields = smaller (negated)
            c["id"],
        ),
    )


# ── Merge one victim into keeper ──────────────────────────────────────────────

def merge(victim, keeper, dry_run):
    vid = victim["id"]
    kid = keeper["id"]
    vname = " ".join(filter(None, [victim.get("first_name"), victim.get("last_name")])) or vid
    kname = " ".join(filter(None, [keeper.get("first_name"), keeper.get("last_name")])) or kid

    print(f"    {'[DRY RUN] ' if dry_run else ''}merge  '{vname}'  →  '{kname}'")

    if dry_run:
        return

    # Re-parent child rows
    for table in ("leads", "job_tickets", "activities"):
        rest_patch(table, {"customer_id": f"eq.{vid}"}, {"customer_id": kid})

    # Log activity
    rest_post("activities", {
        "customer_id": kid,
        "type": "contact_edited",
        "payload": {
            "action": "auto_merge",
            "merged_from": vid,
            "merged_from_name": vname,
            "script": "auto-merge-duplicates.py",
        },
    })

    # Delete victim
    rest_delete("customers", {"id": f"eq.{vid}"})

    time.sleep(0.1)  # be gentle on the API


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Auto-merge duplicate customers by phone.")
    parser.add_argument("--dry-run", action="store_true", help="Preview only — no DB changes.")
    args = parser.parse_args()

    customers = fetch_all_customers()

    # Group by normalised phone (digits only, strip leading country code)
    groups = {}
    no_phone = 0
    for c in customers:
        raw = c.get("phone") or ""
        digits = "".join(ch for ch in raw if ch.isdigit())
        if not digits:
            no_phone += 1
            continue
        groups.setdefault(digits, []).append(c)

    duplicates = {phone: grp for phone, grp in groups.items() if len(grp) > 1}

    print(f"Customers with no phone:        {no_phone}")
    print(f"Unique phone groups:            {len(groups)}")
    print(f"Groups with duplicates:         {len(duplicates)}")
    print(f"Total records to be deleted:    {sum(len(g) - 1 for g in duplicates.values())}")
    print()

    if not duplicates:
        print("No duplicates found. Nothing to do.")
        return

    if args.dry_run:
        print("=== DRY RUN — no changes will be made ===\n")

    total_merged = 0
    for phone, group in sorted(duplicates.items()):
        keeper = pick_keeper(group)
        victims = [c for c in group if c["id"] != keeper["id"]]
        kname = " ".join(filter(None, [keeper.get("first_name"), keeper.get("last_name")])) or keeper["id"]
        kdate = (keeper.get("created_at") or "")[:10]
        print(f"  Phone {phone}  →  keeper: '{kname}' (since {kdate}, {completeness_score(keeper)} fields)  |  deleting {len(victims)}")
        for victim in victims:
            merge(victim, keeper, args.dry_run)
            total_merged += 1

    print()
    if args.dry_run:
        print(f"DRY RUN complete. Would have merged {total_merged} record(s).")
    else:
        print(f"Done. Merged {total_merged} duplicate record(s).")


if __name__ == "__main__":
    main()
