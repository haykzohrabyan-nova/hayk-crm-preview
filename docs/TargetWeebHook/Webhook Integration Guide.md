# Webhook Integration Guide — BazaarPrinting Workflow

Use this endpoint to automatically create job cards on the production board from any external application (order management system, e-commerce platform, Zapier, Make, custom script, etc.).

---

## Connection Details

| | |
|---|---|
| Endpoint | POST https://workflow-rho-one.vercel.app/api/webhook/orders |
| Auth header | x-webhook-secret: <your-secret-key> |
| Content-Type | application/json |

> Find your secret key: Settings → Integrations → Webhook  
> Rotate it before going to production: Settings → Integrations → Webhook → Regenerate

---

## Quick Start — Minimal Payload

{
  "customer_name": "Acme Corp",
  "customer_contact": "hello@acme.com",
  "order_number": "ORD-2026-001",
  "product": "Labels (Roll)",
  "materials": "White BOPP",
  "order_qty": 3000
}
That's it. Every field is optional — the card is created with whatever you send.

---

## Full Example — Single Order (all parameters)

{
  "customer_name": "Acme Corp",
  "customer_contact": "hello@acme.com",
  "customer_phone": "+1 310 555 0100",
  "order_number": "ORD-2026-013-3",
  "title": "Acme Corp — Roll Labels Order",
  "priority": "normal",
  "due_date": "2026-07-24",
  "description": "Rush if possible — ship to LA warehouse.",
  "category": "Labels",
  "request_owner_email": "am@yourcompany.com",
  "request_owner_name": "Sarah Kim",
  "request_owner_phone": "+1 310 555 0199",
  "designer_email": "artist@yourcompany.com",
  "designer_information": "Use brand colors from style guide. Leave 0.125 in bleed.",
  "product": "Labels (Roll)",
  "finished_size": "4 x 3 in",
  "materials": "White BOPP",
  "sides": "1 Side",
  "color_mode": "CMYK",
  "roll_direction": "1-Top",
  "lamination": "Matte",
  "spot_uv": false,
  "foil": false,
  "die_cut": false,
  "application": false,
  "need_a_design": false,
  "order_qty": 3000,
  "artwork_url": "https://yourdomain.com/files/order-proof.pdf",
  "skus": [
    { "sku_name": "Flavor A", "quantity": 1000, "artwork_url": "https://yourdomain.com/files/flavor-a.png" },
    { "sku_name": "Flavor B", "quantity": 1000, "artwork_url": "https://yourdomain.com/files/flavor-b.png" },
    { "sku_name": "Flavor C", "quantity": 1000, "artwork_url": "https://yourdomain.com/files/flavor-c.png" }
  ]
}
---

## Multi-Item Order (creates one card per item)

When you pass items[], each item becomes a separate board card numbered ORD-001-1, ORD-001-2, etc.

{
  "customer_name": "Acme Corp",
  "customer_contact": "hello@acme.com",
  "order_number": "ORD-2026-013-3",
  "title": "Acme Corp — Mixed Print Order",
  "priority": "high",
  "due_date": "2026-07-24",
  "description": "Order-level notes visible on all cards.",
  "request_owner_email": "am@yourcompany.com",
  "designer_email": "artist@yourcompany.com",
  "items": [
    {
      "title": "Roll Labels",
      "category": "Labels",
      "product": "Labels (Roll)",
      "finished_size": "4 x 3 in",
      "materials": "White BOPP",
      "sides": "1 Side",
      "color_mode": "CMYK",
      "roll_direction": "1-Top",
      "lamination": "Matte",
      "order_qty": 3000,
      "artwork_url": "https://yourdomain.com/files/labels-master.pdf",
      "skus": [
        { "sku_name": "Flavor A", "quantity": 1000 },
        { "sku_name": "Flavor B", "quantity": 2000 }
      ]
    },
    {
      "title": "Business Cards",
      "category": "Cards",
      "product": "Business Cards",
      "finished_size": "3.5 x 2 in",
      "materials": "16pt C2S",
      "sides": "2 Sides",
      "color_mode": "CMYK",
      "lamination": "Gloss",
      "spot_uv": true,
      "order_qty": 500,
      "artwork_url": "https://yourdomain.com/files/biz-cards.pdf"
    }
  ]
}
---

## All Supported Configurations