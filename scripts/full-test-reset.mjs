#!/usr/bin/env node
/**
 * DEV / TESTING ONLY — full operational reset.
 *
 * Clears payment-evidence storage (via Storage API) and wipes DB rows
 * (quotes, orders, production, leads, customers, activities, etc.).
 *
 * Usage (from project root, with .env.local present):
 *   node --env-file=.env.local scripts/full-test-reset.mjs
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in environment.");
  console.error("Run: node --env-file=.env.local scripts/full-test-reset.mjs");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function deleteAll(table, configure) {
  let query = admin.from(table).delete();
  query = configure ? configure(query) : query.neq("id", "00000000-0000-0000-0000-000000000000");
  const { error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
  console.log(`  ✓ ${table}`);
}

async function main() {
  console.log("\nBazaarCRM — full test reset\n");

  console.log("1. Empty payment-evidence bucket (Storage API)…");
  const { error: bucketErr } = await admin.storage.emptyBucket("payment-evidence");
  if (bucketErr) {
    console.warn(`   ⚠ storage: ${bucketErr.message} (continuing with DB wipe)`);
  } else {
    console.log("   ✓ payment-evidence bucket emptied");
  }

  console.log("\n2. Delete database rows…");
  await deleteAll("activities");
  await deleteAll("notifications");
  await deleteAll("job_tickets");
  await deleteAll("order_sequence_counters", (q) => q.gte("year", 2000));
  await deleteAll("quote_sequence_counters", (q) => q.gte("year", 2000));
  await deleteAll("leads");
  await deleteAll("customers");
  await deleteAll("user_sessions");

  console.log("\nDone. Users & settings preserved.");
  console.log("Next quote → QUO-2026-0001 · Next order → ORD-2026-001\n");
}

main().catch((err) => {
  console.error("\nReset failed:", err.message ?? err);
  process.exit(1);
});
