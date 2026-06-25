# BazaarPrinting CRM — Lead Webhook Integration Guide

Use this endpoint to automatically submit a new lead into BazaarPrinting CRM from any external system —
a website contact form, a landing page, Zapier, Make.com, a custom script, or any other source.

Submitted leads land directly in the **SDR Workspace** (Leads → Workspace → All tab) with status `Pending`,
exactly like a manually created lead.

---

## Connection Details

| | |
|---|---|
| **Endpoint** | `POST https://bazar-crm-eta.vercel.app/api/webhook/leads` |
| **Auth header** | `x-webhook-secret: <your-secret-key>` |
| **Content-Type** | `application/json` |

> Your secret key is set in the Vercel environment variable `LEAD_WEBHOOK_SECRET`.
> Generate one with: `openssl rand -hex 32`

---

## Quick Start — Minimal Payload

Send the four required fields and the lead is created:

```json
{
  "phone": "6265551234",
  "first_name": "Jane",
  "source": "website_form",
  "industry": "food_beverage"
}
```

---

## Full Example Payload

```json
{
  "first_name": "Jane",
  "last_name": "Doe",
  "phone": "6265551234",
  "email": "jane@acmecorp.com",
  "company": "Acme Corp",
  "industry": "food_beverage",
  "website": "https://acmecorp.com",
  "authority": "Owner",
  "source": "website_form",
  "brand": "Acme",
  "urgency": "High",
  "interests": {
    "Labels": true,
    "Boxes": true
  },
  "quantities": {
    "Labels": "5000",
    "Boxes": "200"
  },
  "notes": "Submitted via homepage contact form"
}
```

---

## All Supported Fields

| Field | Type | Required | Validation |
|---|---|---|---|
| `phone` | string or number | **yes** | Plain digits preferred (e.g. `"6265551234"`). Formatted strings like `"(626) 555-1234"` are also accepted — formatting is stripped automatically. Must resolve to ≥ 10 digits. |
| `first_name` | string | **yes** | Non-empty string. |
| `source` | string | **yes** | Non-empty string. Must be a slug from the accepted source values below. e.g. `"website_form"`, `"instagram"`. |
| `industry` | string | **yes** | Non-empty string. Must be a slug from the accepted industry values below. e.g. `"food_beverage"`, `"retail_apparel"`. |
| `last_name` | string | — | Must be a string if provided. |
| `email` | string | — | Must match `x@x.x` format if provided. |
| `company` | string | — | Must be a string if provided. |
| `website` | string | — | Must be a string starting with `https://` if provided. |
| `authority` | string | — | Must be a string if provided. e.g. `"Owner"`, `"Manager"`. |
| `brand` | string | — | Must be a string if provided. |
| `urgency` | string | — | Must be exactly `"High"`, `"Medium"`, or `"Low"` (case-insensitive) if provided. Any other value → `400` error. |
| `interests` | object | — | Must be a plain JSON object (not an array). Keys must be valid product names (see below). Values must be `true` or `false` (boolean). |
| `quantities` | object | — | Must be a plain JSON object. Keys must match the keys in `interests`. Values must be a positive number or numeric string (e.g. `"5000"` or `5000`). |
| `has_design` | object | — | Must be a plain JSON object. Keys must match the keys in `interests`. Values must be `true` or `false` (boolean). |
| `notes` | string | — | Must be a string if provided. Stored as the SDR comment on the lead. |

> **Type errors are always rejected with `400`.** The webhook never silently converts or ignores a wrong type — it returns an error telling the external system exactly which field has the wrong type.

### Accepted `source` values

These are the current options. New ones can be added in **Admin → Settings → Dropdown Options → Source**.

| Value to send | Displayed as in CRM |
|---|---|
| `"website_form"` | Website Form |
| `"email"` | Email |
| `"phone_call"` | Phone Call |
| `"walk_in"` | Walk-in |
| `"referral"` | Referral |
| `"facebook"` | Facebook |
| `"instagram"` | Instagram |
| `"google"` | Google |
| `"yelp"` | Yelp |
| `"linkedin"` | LinkedIn |
| `"trade_show"` | Trade Show |
| `"direct_mail"` | Direct Mail |
| `"manual"` | Manual |

> **Send the slug, not the display label.**
> The CRM stores slug values internally (e.g. `"website_form"`) — sending the display label (e.g. `"Website Form"`) will be rejected with a `400 VALIDATION_ERROR`. Sending an unknown slug is also rejected; the error response lists all accepted values.
> New options can be added in **Admin → Settings → Dropdown Options → Source** and are accepted automatically.

### Accepted `industry` values

| Value to send | Displayed as in CRM |
|---|---|
| `"cosmetics_beauty"` | Cosmetics & Beauty |
| `"food_beverage"` | Food & Beverage |
| `"healthcare_medical"` | Healthcare & Medical |
| `"cannabis_cbd"` | Cannabis & CBD |
| `"retail_apparel"` | Retail & Apparel |
| `"e_commerce"` | E-Commerce |
| `"hospitality_events"` | Hospitality & Events |
| `"agencies_marketing"` | Agencies & Marketing |
| `"education"` | Education |
| `"real_estate"` | Real Estate |
| `"manufacturing_industrial"` | Manufacturing & Industrial |
| `"tech_electronics"` | Tech & Electronics |
| `"non_profit"` | Non-Profit |
| `"other"` | Other |

> **Send the slug, not the display label.**
> The CRM stores slug values internally (e.g. `"food_beverage"`) — sending the display label (e.g. `"Food & Beverage"`) will be rejected with a `400 VALIDATION_ERROR`. Sending an unknown slug is also rejected; the error response lists all accepted values.
> New options can be added in **Admin → Settings → Dropdown Options → Industry** and are accepted automatically.

### Accepted `interests` / `quantities` / `has_design` keys

Product names are **case-sensitive** and must match exactly. Unknown names are rejected with a `400` error.

| `interests` key | Product |
|---|---|
| `"Labels"` | Labels (roll, sheet, custom shape) |
| `"Boxes"` | Boxes (folding cartons, rigid, mailer) |
| `"Flyers"` | Flyers & leaflets |
| `"Stickers"` | Stickers (die-cut, sheet, kiss-cut) |
| `"Jars"` | Jars & containers |
| `"Bags"` | Bags (poly, paper, stand-up pouches) |
| `"Tubes"` | Tubes (cosmetic, deodorant, squeeze) |
| `"Banners"` | Banners & large-format prints |
| `"Business Cards"` | Business cards |
| `"Other"` | Any other product — SDR will follow up |

**Rules:**
- Every key in `interests` set to `true` **must** have a matching key in `quantities` with a positive number
- Keys in `quantities` or `has_design` **must** also exist in `interests` — no orphan keys
- `has_design` is optional — omit it entirely if the customer has no existing artwork

**Complete example — all 10 products selected:**

```json
{
  "phone": "6265551234",
  "first_name": "Jane",
  "source": "website_form",
  "industry": "food_beverage",
  "interests": {
    "Labels":         true,
    "Boxes":          true,
    "Flyers":         true,
    "Stickers":       true,
    "Jars":           true,
    "Bags":           true,
    "Tubes":          true,
    "Banners":        true,
    "Business Cards": true,
    "Other":          true
  },
  "quantities": {
    "Labels":         "5000",
    "Boxes":          "500",
    "Flyers":         "1000",
    "Stickers":       "2000",
    "Jars":           "300",
    "Bags":           "1000",
    "Tubes":          "500",
    "Banners":        "10",
    "Business Cards": "250",
    "Other":          "100"
  },
  "has_design": {
    "Labels":         true,
    "Boxes":          false,
    "Flyers":         true,
    "Stickers":       false,
    "Jars":           false,
    "Bags":           false,
    "Tubes":          false,
    "Banners":        false,
    "Business Cards": true,
    "Other":          false
  }
}
```

**Partial example — only Labels and Boxes, no existing artwork:**

```json
{
  "interests":  { "Labels": true, "Boxes": true },
  "quantities": { "Labels": "5000", "Boxes": "200" }
}
```

**Valid — interest set to false means not interested (quantity not required):**

```json
{
  "interests":  { "Labels": true, "Boxes": false },
  "quantities": { "Labels": "5000" }
}
```

---

## Deduplication

The endpoint checks for an existing customer by **phone first, then email**.

- If a match is found → the new lead is linked to the existing customer and `is_returning_customer` is set to `true`.
- If no match → a new customer record is created.

A new `leads` row is **always** created regardless of whether the customer exists.

---

## Responses

### Success — `201 Created`

```json
{
  "ok": true,
  "lead_id": "a1b2c3d4-...",
  "customer_id": "e5f6g7h8-...",
  "status": "created"
}
```

`status` is `"deduplicated"` when an existing customer was matched:

```json
{
  "ok": true,
  "lead_id": "a1b2c3d4-...",
  "customer_id": "e5f6g7h8-...",
  "status": "deduplicated"
}
```

### Error responses

| HTTP | `code` | Meaning |
|---|---|---|
| `401` | `UNAUTHORIZED` | Missing or invalid `x-webhook-secret` header |
| `400` | `INVALID_JSON` | Request body is not valid JSON, or is an array instead of an object |
| `400` | `TYPE_ERROR` | A field was sent with the wrong type (e.g. a number where a string is expected, or an array instead of an object) |
| `400` | `VALIDATION_ERROR` | Missing required field, phone < 10 digits, invalid email/website/urgency, unknown product name, unknown source or industry slug, missing quantity for a selected product |
| `409` | `DUPLICATE_CUSTOMER` | Two or more customers in the CRM share the submitted phone number — merge them first, then resubmit |
| `500` | `DB_ERROR` | Database error — contact support |
| `503` | `NOT_CONFIGURED` | `LEAD_WEBHOOK_SECRET` is not set in Vercel environment variables |

Error body format — every error includes `error`, `code`, `field` (which field caused it), and `fix` (exactly how to correct it):

```json
{
  "error": "interests[\"Shirts\"] contains unknown product name(s): \"Shirts\".",
  "code": "VALIDATION_ERROR",
  "field": "interests",
  "fix": "Product names are case-sensitive. Accepted values: Labels, Boxes, Flyers, Stickers, Jars, Bags, Tubes, Banners, Business Cards, Other."
}
```

```json
{
  "error": "\"phone\" must contain at least 10 digits but \"626555\" has only 6.",
  "code": "VALIDATION_ERROR",
  "field": "phone",
  "fix": "Provide a 10-digit US phone number. Example: \"6265551234\". Formatted strings like \"(626) 555-1234\" are also accepted — digits are extracted automatically."
}
```

```json
{
  "error": "quantities[\"Labels\"] must be a number or numeric string but received a boolean.",
  "code": "TYPE_ERROR",
  "field": "quantities.Labels",
  "fix": "Use a positive number or string. Example: \"quantities\": { \"Labels\": \"5000\" }"
}
```

```json
{
  "error": "Duplicate phone number — 2 customers in the CRM share the phone number \"6265551234\".",
  "code": "DUPLICATE_CUSTOMER",
  "field": "phone",
  "fix": "Merge the duplicate customer records in the CRM (CRM → customer profile → Merge), then resubmit this lead."
}
```

---

## Code Examples

### curl

```bash
curl -X POST https://bazar-crm-eta.vercel.app/api/webhook/leads \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: YOUR_SECRET_HERE" \
  -d '{
    "first_name": "Jane",
    "last_name": "Doe",
    "phone": "6265551234",
    "email": "jane@acmecorp.com",
    "source": "website_form",
    "industry": "food_beverage",
    "company": "Acme Corp",
    "interests": { "Labels": true },
    "quantities": { "Labels": "5000" }
  }'
```

### JavaScript / TypeScript

```javascript
const response = await fetch("https://bazar-crm-eta.vercel.app/api/webhook/leads", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-webhook-secret": process.env.BAZAAR_LEAD_WEBHOOK_SECRET,
  },
  body: JSON.stringify({
    first_name: "Jane",
    last_name: "Doe",
    phone: "6265551234",
    email: "jane@acmecorp.com",
    source: "website_form",
    industry: "food_beverage",
    company: "Acme Corp",
    interests: { Labels: true },
    quantities: { Labels: "5000" },
    notes: "Submitted via homepage contact form",
  }),
});

const data = await response.json();

if (response.ok) {
  console.log("Lead created:", data.lead_id, "| Status:", data.status);
} else {
  console.error("Error:", data.error, "| Code:", data.code);
}
```

### Python

```python
import httpx  # or requests

payload = {
    "first_name": "Jane",
    "last_name": "Doe",
    "phone": "6265551234",
    "email": "jane@acmecorp.com",
    "source": "website_form",
    "industry": "food_beverage",
    "company": "Acme Corp",
    "interests": {"Labels": True},
    "quantities": {"Labels": "5000"},
    "notes": "Submitted via homepage contact form",
}

response = httpx.post(
    "https://bazar-crm-eta.vercel.app/api/webhook/leads",
    json=payload,
    headers={"x-webhook-secret": "YOUR_SECRET_HERE"},
)

data = response.json()

if response.status_code == 201:
    print(f"Lead created: {data['lead_id']} | Status: {data['status']}")
else:
    print(f"Error: {data['error']} | Code: {data['code']}")
```

---

## Zapier / Make.com

1. Add an **HTTP action** step.
2. Set **Method** to `POST`.
3. Set **URL** to `https://bazar-crm-eta.vercel.app/api/webhook/leads`.
4. Add header: `x-webhook-secret` → your secret key (store in Zapier Secrets or Make.com Environment Variables).
5. Set **Body type** to `JSON` and map your fields to the payload.
6. The following four fields are **required** — map them from your trigger:
   - `phone` — 10-digit US phone number
   - `first_name` — contact first name
   - `source` — slug from the accepted source list (e.g. `"website_form"`, `"instagram"`)
   - `industry` — slug from the accepted industry list (e.g. `"food_beverage"`, `"retail_apparel"`)

---

## Admin Monitoring

All inbound webhook calls are logged in the CRM admin panel:

**Admin → Settings → Lead Webhook**

The panel shows:
- Every received call with Accepted / Failed status
- The original JSON payload (for troubleshooting)
- Error messages for failed calls
- A "Clear Payloads" button to wipe stored JSONs when no longer needed (status history is kept)

---

*Last updated: June 2026*
