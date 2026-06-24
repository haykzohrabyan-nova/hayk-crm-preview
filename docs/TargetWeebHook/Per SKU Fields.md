| Config | Lines | SKUs per line | Cards created |
|---|---|---|---|
| 1 | 1 line | 0 SKUs | ORD-001 |
| 2 | 1 line | 1 SKU | ORD-001 |
| 3 | 1 line | Multiple SKUs | ORD-001 |
| 4 | Multiple lines, all 0 SKUs | — | ORD-001-1, ORD-001-2… |
| 5 | Multiple lines, all 1 SKU | — | ORD-001-1, ORD-001-2… |
| 6 | Multiple lines, multiple SKUs | — | ORD-001-1, ORD-001-2… |
| 7 | Multiple lines, mixed | — | ORD-001-1, ORD-001-2… |
| 8 | Legacy flat (no items[]) | Any | ORD-001 (no suffix) |

---

## Order-Level Fields

| Field | Type | Notes |
|---|---|---|
| customer_name | string | Customer display name |
| customer_contact | string | Customer email — saved on the customer record |
| customer_phone | string | Customer phone — when both are sent, phone is the primary Customer Contact |
| order_number | string | Your reference e.g. "ORD-2026-001" — auto-generated if omitted |
| title | string | Order title — auto-generated if omitted |
| priority | string | normal · high · low · urgent (default: normal) |
| due_date | string | "YYYY-MM-DD" — must be today or a future date |
| description | string | Order-level notes — visible on all cards |
| category | string | Category name (also accepts category_name) |
| owner_email | string | Account manager email — sets Owner on the card |
| owner_id | string | Account manager UUID |
| owner | string | Account manager email, UUID, or display name |
| request_owner_email | string | Alias for owner_email |
| request_owner_id | string | Alias for owner_id |
| request_owner | string | Alias for owner |
| request_owner_name | string | Free-text name (saved on card even if not a system user) |
| request_owner_contact | string | Free-text contact (saved on card) |
| request_owner_phone | string | Free-text phone (saved on card) |
| designer_email | string | Team member email — sets Assigned Designer |
| designer_id | string | Team member UUID — sets Assigned Designer |
| designer | string | Email, UUID, or display name — sets Assigned Designer |
| designer_information | string | Designer notes (also designer_notes, design_task) |
| items | array | Omit for legacy single-item flat format |

---

## Per-Item Fields (inside items[])

Each item object can override any order-level field. Fields not set on the item fall back to the order-level value.

| Field | Type | Notes |
|---|---|---|
| title | string | Item label — card shows suffixed order number |
| category | string | Category for this item (also category_name) |
| product | string | Must match Product dropdown — see values below |
| finished_size | string | Free text e.g. "3.5 x 2 in" |
| materials | string | Must match Materials dropdown — see values below |
| sides | string | 1 Side or 2 Sides |
| color_mode | string | CMYK · CMYK+White · Pantones (also accepts color) |
| roll_direction | string | 1-Top · 2-Bottom · 3-Right · 4-Left (also accepts position) |
| lamination | string | Must match Lamination dropdown — see values below |
| spot_uv | boolean | true / false |
| foil | boolean | true / false |
| die_cut | boolean | true / false |
| application | boolean | true / false |
| need_a_design | boolean | true / false |
| order_qty | number | Auto-calculated from SKU quantities when omitted |
| artwork_url | string | Public URL to the artwork file — stored as an external asset |
| description | string | Item-level notes |
| designer_information | string | Designer notes for this item |
| designer_email | string | Overrides order-level assigned designer |
| designer_id | string | Overrides order-level assigned designer |
| designer | string | Overrides order-level assigned designer |
| request_owner_email | string | Overrides order-level request owner |
| request_owner_name | string | Overrides order-level request owner name |
| request_owner_contact | string | Overrides order-level request owner contact |
| request_owner_phone | string | Overrides order-level request owner phone |
| skus | array | SKU variations — see below |

---

## Per-SKU Fields (inside skus[])