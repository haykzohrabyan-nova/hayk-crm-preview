# Deploy Handoff — Sales CRM buildout (for David)
**Date:** 2026-08-07  **Repo:** `bazar-crm`  **Branch:** `hayk-preview`
**Remotes:** `origin` = NYeghyan/BazarCRM · `hayk` = haykzohrabyan-nova/hayk-crm-preview

---

## ⚠️ READ FIRST — the one thing that matters
Everything below runs on a **merged local database**: all of Azat's CRM data lives in an **`azat` schema** inside this project's Supabase DB, and every new page reads that schema. **This is NOT a pure `git push`.** For the new pages to show anything in an environment, that environment's database must have:
1. the **`azat` schema** (Azat's tables + data + the `crm_ingest_lead` function), and
2. the **`azat` schema exposed to PostgREST**, and
3. the **two SQL patches** below applied.

Two safe ways to go live in the morning:
- **A) Preview/staging pointed at this merged DB** (fastest — nothing to migrate; just deploy the code with envs pointing here).
- **B) Real prod cutover** — the `azat` schema + data must first be loaded into the prod Supabase (a DB migration), then the patches applied. This is a DB task, not just a deploy.

Pick A for a same-morning demo. B is a follow-up.

---

## 1. What's new (all additive — no existing pages changed except nav + a few contact-name links)
New sidebar pages (routes registered in `public.pages`):
- **/pipeline** — unified lifecycle board: New Lead → Claimed → Deal → Quoted → Approved → Paid → Won → Lost.
- **/my-day** — per-rep morning view (tasks / deals / emails / missed calls / messages).
- **/tasks** — functional Kanban (Call back · Send quote · Create deal · Follow-up · Done) + rich "New task" modal (assign to rep, quick due presets, link to person + their deal).
- **/inbox** — unassigned hot intake (Assign / Deal / Task per row, "Log a lead" tester).
- **/missed-calls** — returned vs not-returned, <30m amber / >30m red, day filters, voicemail→task.
- **/communications** — every comm by channel + inbound/outbound, "what it is / what to do / processed-or-slipped", noise filter, Rep filter, Task/Deal actions.
- **/team** — manager scoreboard (per rep: open/done tasks, open/won deals, calls answered/missed, unanswered msgs).
- **/contact/[id]** — Customer 360: identity + owner, AI brief, **lifecycle stage strip**, **New vs Returning + lifetime spend + order/quote history**, deals, comms timeline, "follow this lead" + assign actions.

The **promise engine** (`lib/ai/extract-actions.ts`) turns any call/email/SMS/ad-lead into `{intent, next_step, tasks, deal signal, is_noise}` and can auto-create tasks/deals. Azat's **intake router** (`azat.crm_ingest_lead`, already in the DB) is wired at `POST /api/leads/ingest` and combined with auto-task/deal.

## 2. Code to ship
There are **~42 new/changed files** (all under `app/(app)/*`, `app/api/*`, `components/*`, `lib/azat/*`, `lib/ai/*`, plus `components/layout/sidebar.tsx`, `lib/supabase/*`, `proxy.ts`, `supabase/schema.sql`). They are **uncommitted** on `hayk-preview`. Review, commit, and push. `./node_modules/.bin/tsc --noEmit -p tsconfig.json` is clean except one **pre-existing** error in `app/api/dev/send-preview-order/route.ts` (not ours).

## 3. Database — apply in this order (on the target DB)
Prereq: the `azat` schema + data must already exist in the target DB (see "READ FIRST").
```
# a) the two new patches from this work
psql "$DB_URL" -f supabase/patches/2026-08-07-comm-ai.sql
psql "$DB_URL" -f supabase/patches/2026-08-07-warm-lead-autotask-trigger.sql

# b) provenance table (idempotency + reset) — if not already present
create table if not exists azat.engine_provenance (
  entity_type text, entity_id uuid, comm_id uuid, kind text,
  created_at timestamptz default now(), primary key (entity_type, entity_id));
grant select,insert,update,delete on azat.engine_provenance to service_role, authenticated, anon;

# c) expose the azat schema + grant it (so the app can read/write it)
grant usage on schema azat to anon, authenticated, service_role;
grant select,insert,update,delete on all tables in schema azat to authenticated, service_role;
grant usage,select on all sequences in schema azat to authenticated, service_role;
grant execute on all functions in schema azat to authenticated, service_role;
```
**PostgREST must expose `azat`.** On this local stack it's `PGRST_DB_SCHEMAS=public,graphql_public,azat`. In Supabase config that's `[api] schemas = ["public","graphql_public","azat"]`, then restart the API. (The new pages use a service-role client hard-scoped to `azat` — see `lib/azat/server.ts` / `app/api/dev/promote-actions/route.ts`.)

The `/pipeline` (and `/inbox`,`/leads`,`/deals`) nav rows are in `supabase/schema.sql` and were inserted into the live `public.pages` with `on conflict do nothing` + sdr/sales `role_permissions`. Re-run those inserts on the target if the pages don't appear in the sidebar.

## 4. Environment
- **`NEXT_PUBLIC_DISABLE_AUTH` MUST be unset (or `0`) in any shared/prod env.** It is a **local-only login bypass** (`proxy.ts` + `lib/auth/require-session.ts` return a synthetic admin when it's `1`). Leaving it on = no auth. It is only `1` on Hayk's local machine.
- Standard Supabase envs (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) point at the DB that has the `azat` schema.
- `OPENAI_API_KEY` (used by the promise engine / AI briefs).

## 5. Optional — populate demo data for the morning (skip for a truly clean start)
```
POST /api/dev/promote-actions?mode=write&channel=call     # calls → tasks/deals
POST /api/dev/process-comms?mode=write                     # email/sms/ad-lead → summaries + tasks/deals
```

## 6. Clean slate for the team (run right before they start)
This wipes ONLY engine-created rows (tracked in `engine_provenance`), leaving Azat's real data intact:
```
POST /api/dev/promote-actions?mode=reset     # deletes engine-created tasks + deals (currently 233 tasks / 76 deals)
```
Also delete the one live test lead I created while verifying intake: contact/lead **"Verify Buyer" / Unity Coffee** (`buyer@unity.coffee`).

## 7. Verify after deploy (open each, logged in)
`/pipeline` · `/my-day` · `/tasks` · `/inbox` · `/missed-calls` · `/communications` · `/team` · open any contact → `/contact/{id}`. All should load with data and no console errors.

---
*Questions on any of this: it was built and verified locally against the merged `azat` schema on 2026-08-07. The riskiest step is #3 (schema/exposure); everything renders once that's right.*
