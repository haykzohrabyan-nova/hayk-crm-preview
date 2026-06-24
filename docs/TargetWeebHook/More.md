- All fields are optional. Send only what you have.
- order_number is auto-generated (WH-YYYYMMDDHHMMSS-xxxxxxxx) if omitted.
- color is an alias for color_mode. position is an alias for roll_direction.
- The legacy finishing field ("Spot UV", "Foil Gold", etc.) is still accepted and maps to the Finishing custom field. Prefer explicit boolean fields for new integrations.
- When both customer_contact (email) and customer_phone are sent, the order's Customer Contact field stores the phone. The linked customer record stores both. Existing customers are re-used — no duplicates.
- artwork_url must be a publicly accessible URL. The file is linked as an external asset (not downloaded). Accepted formats: PDF, PNG, JPG, AI, EPS, etc.
- Per-SKU artwork_url is stored against that specific SKU. Order-level artwork_url is stored as a general attachment.
- designer_information / designer_notes / design_task are all aliases for the same designer notes field.
- Owner fields (owner_* / request_owner_*) set the card Owner dropdown only when the user is an account manager on your team. Free-text request_owner_name, request_owner_contact, and request_owner_phone are always saved on the card.
- New cards always land in the first board column.
- Not set via webhook: Artwork GDrive link — staff enter this in the app.
- ⚠️ Rotate your webhook secret before going to production. Settings → Integrations → Webhook → Regenerate.

---

## Code Examples

### curl
curl -X POST https://workflow-rho-one.vercel.app/api/webhook/orders \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: YOUR_SECRET_KEY" \
  -d '{
    "customer_name": "Acme Corp",
    "customer_contact": "hello@acme.com",
    "order_number": "ORD-2026-001",
    "product": "Labels (Roll)",
    "materials": "White BOPP",
    "order_qty": 3000,
    "due_date": "2026-07-24"
  }'
### JavaScript / Node.js
const res = await fetch('https://workflow-rho-one.vercel.app/api/webhook/orders', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-webhook-secret': process.env.WORKFLOW_WEBHOOK_SECRET,
  },
  body: JSON.stringify({
    customer_name: 'Acme Corp',
    customer_contact: 'hello@acme.com',
    order_number: 'ORD-2026-001',
    product: 'Labels (Roll)',
    materials: 'White BOPP',
    order_qty: 3000,
    due_date: '2026-07-24',
    artwork_url: 'https://yourdomain.com/files/artwork.pdf',
  }),
});

const data = await res.json();
if (!res.ok) throw new Error(data.error);
console.log('Created order:', data.order_number, data.order_id);
### Python
import requests, os

res = requests.post(
    'https://workflow-rho-one.vercel.app/api/webhook/orders',
    headers={
        'Content-Type': 'application/json',
        'x-webhook-secret': os.environ['WORKFLOW_WEBHOOK_SECRET'],
    },
    json={
        'customer_name': 'Acme Corp',
        'customer_contact': 'hello@acme.com',
        'order_number': 'ORD-2026-001',
        'product': 'Labels (Roll)',
        'materials': 'White BOPP',
        'order_qty': 3000,
        'due_date': '2026-07-24',
        'artwork_url': 'https://yourdomain.com/files/artwork.pdf',
    }
)
res.raise_for_status()
data = res.json()
print('Created:', data['order_number'], data.get('order_id'))
---

*Last updated: June 2026*