# Email Template Guide — BazaarPrinting CRM

Reference for building additional HTML email templates that render correctly in Gmail, Apple Mail, Outlook, and all major clients.

---

## The Golden Rules

1. **Table-based layout only** — no flexbox, no grid, no floats for structure
2. **All styles inline** — no `<style>` blocks (Gmail strips them)
3. **Use `<div>` for text, never `<p>`** — `<p>` tags get unpredictable default margins in Outlook's Word renderer
4. **Spacers via explicit height divs** — don't rely on `margin` for section gaps
5. **No CSS positioning** — `position:absolute/relative/fixed` is unreliable in all email clients
6. **No flexbox sub-properties** — `justify-content`, `align-items`, `flex-direction` are stripped by Gmail
7. **No animations or transforms** — stripped everywhere
8. **`bgcolor` attribute AND `background-color` style** — Outlook needs the attribute, modern clients need the style

---

## CSS Properties: What Works

### ✅ Safe everywhere (Gmail, Apple Mail, Outlook Windows, Outlook.com)

```
background-color      border               border-collapse
border-spacing        color                display (block/table)
font-family           font-size            font-weight
font-style            height               letter-spacing
line-height           margin *             max-width
padding               table-layout         text-align
text-decoration       text-transform       vertical-align
white-space           width                word-break
```

> `*` margin works in Gmail and Apple Mail. In Outlook Windows it is **unreliable on `<p>` tags** — always use `<div>` and control spacing via padding or spacer divs instead.

### ⚠️ Works in Gmail + Apple Mail, broken or partial in Outlook Windows desktop

```
border-radius         — squared corners in Outlook Windows, rounded everywhere else
overflow:hidden       — unreliable in Gmail (all versions); do NOT use to clip rounded table corners
display:inline-block  — unreliable on <span> in Outlook; use a <td> in a nested table instead
```

### ❌ Never use

```
position (absolute / relative / fixed / sticky)
z-index
flexbox sub-properties (justify-content, align-items, flex-direction, flex-wrap, gap)
CSS Grid
transform / animation / transition
box-shadow
filter / backdrop-filter / clip-path
@font-face (only Roboto/Google Sans work in Gmail)
External stylesheets / @import
<style> blocks           — Gmail strips them
CSS variables            — stripped by most clients
CSS shorthand for border — prefer border-top/right/bottom/left separately in Outlook
```

---

## HTML Elements: What Works

| Element | Notes |
|---|---|
| `<table>` | ✅ Primary layout tool. Always set `cellpadding="0" cellspacing="0" border="0"` |
| `<tr>`, `<td>`, `<th>` | ✅ Core elements. Style on `<td>`, not `<tr>` where possible |
| `<div>` | ✅ Use for all text blocks instead of `<p>` |
| `<a>` | ✅ Always set `href` and `style` inline. Use `target="_blank"` |
| `<img>` | ✅ Always set `width`, `height`, `alt`, `display:block` |
| `<strong>`, `<em>` | ✅ Safe for inline emphasis |
| `<br>` | ✅ Safe for line breaks within a text block |
| `<p>` | ⚠️ Avoid — use `<div>` instead |
| `<span>` | ⚠️ Safe for inline text styling but do NOT use `display:inline-block` for layout |
| `<h1>`–`<h6>` | ⚠️ Have default browser margins — use `<div>` with explicit font-size/weight instead |
| `<ul>`, `<li>` | ⚠️ Outlook renders list indentation inconsistently — use `<div>` with bullet characters |
| `<button>` | ❌ Use `<a>` styled as a button instead |
| `<form>`, `<input>` | ❌ Stripped by Gmail and most clients |
| `<video>`, `<audio>` | ❌ Not supported |
| `<script>` | ❌ Stripped everywhere |
| `<style>` | ❌ Stripped by Gmail |

---

## Template Skeleton

Copy this as the starting point for any new email:

```html
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"
  "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Email Subject Here</title>
</head>
<body style="margin:0; padding:0; background-color:#f0f4fa;
             -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">

<!-- Outer wrapper -->
<table width="100%" cellpadding="0" cellspacing="0" border="0"
       bgcolor="#f0f4fa" style="background-color:#f0f4fa;">
  <tr>
    <td align="center" style="padding:32px 16px;">

      <!-- Email card — max 600px wide -->
      <table width="600" cellpadding="0" cellspacing="0" border="0"
             style="max-width:600px; width:100%;">

        <!-- HEADER -->
        <tr>
          <td bgcolor="#1b2b4b"
              style="background-color:#1b2b4b; border-radius:12px 12px 0 0;
                     padding:28px 40px; text-align:center;">
            <div style="font-family:Arial,sans-serif; font-size:22px;
                        font-weight:bold; color:#e8c97a; letter-spacing:3px;">
              COMPANY NAME
            </div>
            <!-- spacer -->
            <div style="height:6px; line-height:6px; font-size:6px;">&nbsp;</div>
            <div style="font-family:Arial,sans-serif; font-size:11px;
                        color:rgba(255,255,255,0.5); letter-spacing:2px;
                        text-transform:uppercase;">
              Tagline here
            </div>
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td bgcolor="#ffffff"
              style="background-color:#ffffff; padding:32px 40px;">

            <!-- Content goes here -->
            <div style="font-family:Arial,sans-serif; font-size:22px;
                        font-weight:bold; color:#1f2937; line-height:1.3;">
              Hi Name,
            </div>

            <!-- 8px spacer -->
            <div style="height:8px; line-height:8px; font-size:8px;">&nbsp;</div>

            <div style="font-family:Arial,sans-serif; font-size:15px;
                        color:#6b7280; line-height:1.6;">
              Body text goes here.
            </div>

            <!-- 24px spacer between sections -->
            <div style="height:24px; line-height:24px; font-size:24px;">&nbsp;</div>

            <!-- CTA Button -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center">
                  <a href="https://example.com" target="_blank"
                     style="display:inline-block; background-color:#e8c97a;
                            color:#1b2b4b; font-family:Arial,sans-serif;
                            font-size:16px; font-weight:bold;
                            text-decoration:none; padding:14px 36px;
                            border-radius:8px; letter-spacing:0.5px;">
                    Button Label
                  </a>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td bgcolor="#1b2b4b"
              style="background-color:#1b2b4b; border-radius:0 0 12px 12px;
                     padding:24px 40px; text-align:center;">
            <div style="font-family:Arial,sans-serif; font-size:14px;
                        font-weight:bold; color:#e8c97a;">
              Company Name
            </div>
            <!-- spacer -->
            <div style="height:8px; line-height:8px; font-size:8px;">&nbsp;</div>
            <div style="font-family:Arial,sans-serif; font-size:12px;
                        color:rgba(255,255,255,0.55); line-height:1.9;">
              123 Street, City, State ZIP
            </div>
            <!-- spacer -->
            <div style="height:14px; line-height:14px; font-size:14px;">&nbsp;</div>
            <div style="font-family:Arial,sans-serif; font-size:11px;
                        color:rgba(255,255,255,0.3);">
              This email was sent by Company Name via BazaarPrinting CRM.
            </div>
          </td>
        </tr>

      </table><!-- end card -->

    </td>
  </tr>
</table>

</body>
</html>
```

---

## Common Patterns

### Spacer between sections
```html
<div style="height:24px; line-height:24px; font-size:24px;">&nbsp;</div>
```
The triple `height` / `line-height` / `font-size` ensures the spacer renders at the correct height in Outlook (which uses line-height for block height).

### Horizontal divider line
```html
<div style="height:1px; line-height:1px; font-size:1px;
            background-color:#e5e7eb;">&nbsp;</div>
```

### Info card (grey background box)
```html
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td bgcolor="#f0f4fa"
        style="background-color:#f0f4fa; border:1px solid #e5e7eb;
               border-radius:8px; padding:16px 20px;">
      <div style="font-family:Arial,sans-serif; font-size:14px; color:#1f2937;">
        Content inside card
      </div>
    </td>
  </tr>
</table>
```

### Badge / pill (top-right corner of a card)
Use a nested `<table>` + `<td>`, NOT `display:inline-block` on a `<span>`:
```html
<table cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td bgcolor="#1b2b4b"
        style="background-color:#1b2b4b; padding:8px 14px;
               border-radius:0 7px 0 8px; font-family:Arial,sans-serif;
               font-size:10px; font-weight:bold; color:#e8c97a;
               text-transform:uppercase; letter-spacing:1px; white-space:nowrap;">
      Badge Label
    </td>
  </tr>
</table>
```

### Two-column layout (label + value, e.g. pricing rows)
```html
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="padding:5px 0; font-family:Arial,sans-serif;
               font-size:14px; color:#6b7280;">Label</td>
    <td align="right"
        style="padding:5px 0; font-family:Arial,sans-serif;
               font-size:14px; color:#1f2937;">Value</td>
  </tr>
</table>
```

### Data table with header row
```html
<!-- Single table — border-collapse for clean dividers, plain border (no border-radius).
     Do NOT try to use overflow:hidden to clip rounded corners — Gmail ignores it. -->
<table width="100%" cellpadding="0" cellspacing="0" border="0"
       style="border-collapse:collapse; border:1px solid #e5e7eb;">
  <tr bgcolor="#1b2b4b" style="background-color:#1b2b4b;">
    <th align="left"
        style="padding:10px 16px; font-family:Arial,sans-serif;
               font-size:11px; font-weight:bold; text-transform:uppercase;
               letter-spacing:1px; color:rgba(255,255,255,0.7);">
      Column A
    </th>
    <th align="right"
        style="padding:10px 16px; font-family:Arial,sans-serif;
               font-size:11px; font-weight:bold; text-transform:uppercase;
               letter-spacing:1px; color:rgba(255,255,255,0.7);">
      Column B
    </th>
  </tr>
  <tr>
    <td style="padding:12px 16px; border-bottom:1px solid #e5e7eb;
               font-family:Arial,sans-serif; font-size:14px; color:#1f2937;">
      Row 1 A
    </td>
    <td align="right"
        style="padding:12px 16px; border-bottom:1px solid #e5e7eb;
               font-family:Arial,sans-serif; font-size:14px; color:#1f2937;">
      Row 1 B
    </td>
  </tr>
</table>
```
> **Why no border-radius?** `overflow:hidden` — needed to clip a table's corners — is unreliable in Gmail (all versions). Without it, `border-radius` on the wrapper has no visual effect on the header row. Plain square borders are the safe, universal choice for data tables in email.

### CTA button
```html
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td align="center">
      <a href="URL_HERE" target="_blank"
         style="display:inline-block; background-color:#e8c97a;
                color:#1b2b4b; font-family:Arial,sans-serif;
                font-size:16px; font-weight:bold; text-decoration:none;
                padding:14px 36px; border-radius:8px; letter-spacing:0.5px;">
        Button Label
      </a>
    </td>
  </tr>
</table>
```

### Success/info banner (green)
```html
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td bgcolor="#f0fdf4"
        style="background-color:#f0fdf4; border:1px solid #bbf7d0;
               border-radius:8px; padding:14px 18px;">
      <div style="font-family:Arial,sans-serif; font-size:11px; font-weight:bold;
                  text-transform:uppercase; letter-spacing:1px; color:#15803d;">
        Section Title
      </div>
      <div style="height:6px; line-height:6px; font-size:6px;">&nbsp;</div>
      <div style="font-family:Arial,sans-serif; font-size:14px; color:#1f2937;">
        Content here
      </div>
    </td>
  </tr>
</table>
```

---

## BazaarPrinting Color Reference

| Use | Color |
|---|---|
| Navy (header, footer, badge bg) | `#1b2b4b` |
| Gold (accent, CTA, links in footer) | `#e8c97a` |
| Gold hover / total amount | `#c9a84c` |
| Page / card background | `#f0f4fa` |
| White card body | `#ffffff` |
| Body text | `#1f2937` |
| Muted text | `#6b7280` |
| Border / divider | `#e5e7eb` |
| Alternating row (even) | `#f9fafb` |
| Success green bg | `#f0fdf4` |
| Success green border | `#bbf7d0` |
| Success green text | `#15803d` |

---

## Existing Templates

| File | Purpose | Preview route |
|---|---|---|
| `lib/integrations/quote-email-template.ts` | Customer quote / order confirmation | `GET /api/dev/quote-email-preview` |
| `lib/integrations/welcome-email-template.ts` | New-user welcome + admin password reset | `GET /api/dev/quote-email-preview?template=welcome` or `?template=password-reset` (dev only) |
| `lib/integrations/payment-reminder-template.ts` | Payment reminder for confirmed unpaid orders | — |
| `lib/integrations/payment-confirmed-template.ts` | Payment confirmed after accountant reviews evidence | — |
| `lib/integrations/invoice-link-template.ts` | Resend customer portal link (`/q/{token}`) | — |
| `lib/integrations/order-ready-template.ts` | Order ready for pickup (mark completed) | — |

All outbound customer messages are routed through `lib/integrations/send-quote.ts` (`sendQuoteToCustomer`, `sendPaymentReminder`, `sendInvoiceLinkToCustomer`, `sendOrderReadyToCustomer`, payment confirmed helper).

---

## SMS / WhatsApp templates (editable)

Unlike HTML emails, SMS and WhatsApp bodies are **plain text** stored in `sms_templates` (migration `084`) and edited at **Admin → Settings → SMS Templates**.

| Source | Purpose |
|--------|---------|
| `lib/integrations/sms-template-catalog.ts` | Template keys, labels, default bodies, allowed placeholders |
| `lib/integrations/load-sms-templates.ts` | Loads DB rows; falls back to catalog defaults |
| `lib/integrations/render-sms-template.ts` | Replaces `{placeholder}` at send time |
| `GET` / `PATCH` `/api/admin/sms-templates` | Admin CRUD |

**Template keys (examples):** `quote_sent`, `order_sent`, `payment_reminder`, `payment_confirmed`, `order_ready_pickup`, `quote_follow_up`, `tax_exempt_approved`, `tax_exempt_approved_total_unchanged`, …

**Tax-exempt approved email:** `lib/integrations/tax-exempt-approved-template.ts` — sent from `sendTaxExemptApproved()` after accountant `approve_tax_exempt` (SMS uses the keys above).

**Do not** edit SMS copy in `send-quote.ts` for production changes — use the admin UI so ops can tune wording without deploys.

---

## Testing Checklist Before Sending

- [ ] Preview at `localhost:3000/api/dev/quote-email-preview` (add `?template=welcome` or `?template=password-reset` for auth emails)
- [ ] Send a real test via the CRM to your own Gmail account
- [ ] Check on mobile (Gmail iOS / Apple Mail iOS)
- [ ] Verify all links work and point to the production URL (not localhost)
- [ ] Confirm the `NEXT_PUBLIC_APP_URL` env var is set to the production domain before deploying
