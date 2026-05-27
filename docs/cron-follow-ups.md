# Quote follow-up cron (Vercel)

Automated reminders for **sent quotes** where the customer has not confirmed yet.

**Status:** Built (TODO-006)

---

## What it does

1. Runs on a schedule (default: **daily at 2:00 PM UTC** — ~9 AM US Eastern).
2. Finds quotes with:
   - `ticket_status = 'sent'`
   - `ticket_follow_up_enabled = true`
   - `follow_up_completed = false`
   - `client_confirmed = false`
   - `follow_up_at <= now` (or initializes schedule from `quote_reminder_date` on first run)
3. Sends a short reminder via **email (Instantly)** or **SMS (Twilio)** — same channel as the quote delivery settings on the ticket.
4. Decrements remaining cycles, advances `follow_up_at` by frequency (`daily` / `every-3-days` / `weekly`), logs `quote_approval_requested` activity.
5. Marks `follow_up_completed = true` when all reminders are sent.

When a rep **sends a quote** (`ticket_status → sent`), the app seeds `follow_up_at` and `follow_up_cycles` from the Quote tab follow-up settings.

---

## Setup on Vercel (one-time)

### 1. Generate a secret

In your terminal:

```bash
openssl rand -base64 32
```

Copy the output.

### 2. Add environment variable

In **Vercel → your project → Settings → Environment Variables**:

| Name | Value | Environments |
|------|--------|--------------|
| `CRON_SECRET` | *(paste the random string)* | Production (and Preview if you want to test cron there) |

Redeploy after adding the variable.

### 3. Cron schedule

Already configured in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/follow-ups",
      "schedule": "0 14 * * *"
    }
  ]
}
```

Vercel automatically calls `GET /api/cron/follow-ups` with:

`Authorization: Bearer <CRON_SECRET>`

**Note:** Cron jobs require a **Vercel Pro** plan (or higher) on the production deployment. On Hobby, use manual curl (below) or an external scheduler.

### 4. Messaging credentials

Same as quote send — must be set in Vercel env:

- **Email:** `INSTANTLY_API_KEY`, `INSTANTLY_SENDING_ACCOUNT`
- **SMS:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`

---

## Local testing

Add to `.env.local`:

```
CRON_SECRET=your-local-test-secret
```

Run the dev server, then:

```bash
curl -s -H "Authorization: Bearer your-local-test-secret" http://localhost:3000/api/cron/follow-ups | jq
```

Example response:

```json
{
  "ok": true,
  "scanned": 2,
  "sent": 1,
  "failed": 0,
  "completed": 0,
  "initialized": 1,
  "errors": [],
  "ran_at": "2026-05-26T14:00:00.000Z"
}
```

---

## Code map

| File | Role |
|------|------|
| `app/api/cron/follow-ups/route.ts` | Cron HTTP handler (auth + JSON summary) |
| `lib/utils/process-due-follow-ups.ts` | Query due tickets, send, advance schedule |
| `lib/utils/follow-up-schedule.ts` | Date math + remaining cycle logic |
| `lib/utils/initialize-ticket-follow-up.ts` | Seed schedule when quote is sent |
| `lib/integrations/send-quote.ts` | `sendQuoteFollowUpReminder()` |
| `lib/integrations/quote-follow-up-template.ts` | Follow-up email HTML |
| `vercel.json` | Cron schedule |

---

## Rep-facing settings (Quote tab)

On each quote, **Quote follow-up schedule** (when enabled):

- **Start date** → `quote_reminder_date`
- **Number of follow-ups** → `ticket_follow_up_count` / `follow_up_cycles`
- **Frequency** → `ticket_follow_up_freq` (`daily`, `every-3-days`, `weekly`)

Disabled automatically for **Full payment upfront** strategy (no reminders needed).

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Cron never runs | Vercel plan supports crons; `vercel.json` deployed; Production deployment |
| `401 Unauthorized` | `CRON_SECRET` matches in Vercel env |
| `500 CRON_SECRET is not configured` | Env var missing on that deployment |
| `sent: 0`, tickets expected | Quote must be `sent`, follow-up enabled, not confirmed; `follow_up_at` due or `quote_reminder_date` set |
| Email/SMS fails | Instantly/Twilio env vars; destination on ticket (`ticket_dest_email` / phone) |
| Old sent quotes not reminding | First cron run **initializes** missing `follow_up_at` from saved `quote_reminder_date` |

Logs: Vercel → Deployments → Functions → `/api/cron/follow-ups`
