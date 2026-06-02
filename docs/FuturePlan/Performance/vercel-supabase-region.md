# Align Vercel with Supabase region

## Your setup (checklist)

| Service | Region | Code |
|---------|--------|------|
| **Supabase** (Primary Database) | West US (Oregon) | `us-west-2` |
| **Vercel** (Functions) | Set to match Oregon / California | See below |

If Vercel runs in **US East** (`iad1`, default for many projects) while Supabase is in **Oregon**, every API call crosses the country (~60–120ms extra **per hop**). That alone can explain `line-preview` at **500ms–1.4s**.

## How to check Vercel region

1. Open [vercel.com](https://vercel.com) → your **BazarCRM** project.
2. **Settings** (top) → **Functions** (left sidebar).
3. Find **Serverless Function Region** (or **Function region**).
4. Note the selected region(s). Default is often **Washington, D.C. (`iad1`)**.

Alternative path (team settings):

- **Settings** → **General** → scroll to deployment / compute region if shown on your plan.

To see where a **specific deployment** ran:

- **Deployments** → click the deployment → **Functions** tab → open a route (e.g. `api/orders/page-data`) → check **Region** in the invocation details (after a request).

## What to set on Vercel

Pick the **closest** region to `us-west-2` (Oregon):

| Vercel region | Location | Good for Oregon DB |
|---------------|----------|-------------------|
| **`sfo1`** | San Francisco | Best |
| **`pdx1`** | Portland | Best (same metro area) |
| `iad1` | Virginia | Poor (far) |

1. **Settings** → **Functions** → **Serverless Function Region**.
2. Select **`sfo1`** or **`pdx1`** (prefer **Portland** if offered).
3. **Save**.
4. **Redeploy** production (new deployments pick up the setting).

## Supabase compute note

Your project shows **`t4g.nano`** — very small instance. CPU is low (3%) but **RAM at ~59%** can slow queries under load. Region alignment helps latency; upgrading compute helps heavy queries. Security is unchanged.

## Security

Moving Vercel region does **not** change auth, RLS, or API checks — only network distance.

## After aligning

- `page-data` and `line-preview` should drop **~80–150ms** on warm invocations.
- Expand uses **`line_preview` on page-data** (Jun 2026) — often **no** extra `line-preview` request when the list row is on the current page.
