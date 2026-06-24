| Field | Type | Notes |
|---|---|---|
| sku_name | string | Variant display name e.g. "Flavor A" |
| quantity | number | Number of pieces for this variant |
| artwork_url | string | Per-SKU artwork URL (overrides item-level artwork_url for this SKU) |

---

## Accepted Field Values

> ⚠️ Dropdown values are fuzzy-matched (case and spacing insensitive) against your tenant's Settings → Fields options. Exact matches are safest. If a value can't be matched, the field is left blank and a warning is returned.

### priority
normal
high
low
urgent
### product
Pouches Combo
Jar Combo
Tube Combo
Labels (Roll)
Labels (Sheet)
Folding Cartons / Boxes
Business Cards
Flyers / Postcards
Booklets
Diecut Stickers
Vinyl Labels / 54'' Rolls
Vinyl Signage
Banners / Large Format
Window Decals
Wallpaper
Sheet Products (Boyd)
Apparel
Pouches Only
Tube Only
Jar Only
Other
### materials

Pouches / Cosmetic Web
Pouch Double sided
Pouche One sided
Clear Cosmetic Web
White Cosmetic Web
Silver Cosmetic Web
Jar / Tube combos
Plastic & Side & Top
Plastic & Side
Plastic & Top
Plastic
Glass & Side & Top
Glass & Side
Glass
BOPP
Clear BOPP
White BOPP
Silver BOPP
Holo BOPP
Label Sheets
Gloss Label Sheet
Matte Label Sheet
Semi Gloss
Cardstock (16th Street)
14pt C1S
14pt C2S
16pt C1S
16pt C2S
18pt C1S
18pt C2S
18pt Silver
24pt C1S
24pt C2S
Cardstock / Sheet (Boyd Street)
16pt (Boyd)
18pt (Boyd)
20pt (Boyd)
24pt (Boyd)
Cover / Text
80lb Cover
100lb Cover
110lb Cover
80lb Text
100lb Text
Vinyl
White Vinyl
White Vinyl - Aggressive Glue
Holographic Vinyl
Specialty / Large Format
Banner Material
Window Decal
Self-Adhesive (Peel-and-Stick)
Traditional / Unpasted
Apparel
Sweatshirt
Hoodie
Polo
Tee
Activewear
Hat
Bikini
Short
Jogger
### sides
1 Side
2 Sides
### color_mode (also accepts color)
CMYK
CMYK+White
Pantones
### roll_direction (also accepts position)
1-Top
2-Bottom
3-Right
4-Left
### lamination
None
Gloss
Matte
Soft Touch
Holo
Coating
### Boolean fields
spot_uv, foil, die_cut, application, need_a_design — send true or false. Omitting is treated as false.

---

## Response

### Single item (or legacy flat format)
{
  "success": true,
  "order_id": "uuid",
  "order_number": "ORD-2026-001",
  "owner_id": "uuid-or-null",
  "owner_name": "Sarah Kim"
}
### Multi-item (items[] present)
{
  "success": true,
  "order_number": "ORD-2026-001",
  "owner_id": "uuid-or-null",
  "owner_name": "Sarah Kim",
  "jobs": [
    { "order_id": "uuid-1", "item_index": 0, "title": "Roll Labels" },
    { "order_id": "uuid-2", "item_index": 1, "title": "Business Cards" }
  ]
}
An optional warning string is included when:
- Dropdown values were auto-corrected via fuzzy matching
- Owner or designer lookup failed (field left blank, order still created)
- Artwork URL could not be saved

---

## Error Responses

| Status | error | Cause |
|---|---|---|
| 401 | Unauthorized | Missing or wrong x-webhook-secret |
| 403 | Webhook is disabled | Webhook toggled off in Settings |
| 400 | Invalid JSON | Malformed request body |
| 422 | Due date cannot be in the past. | Past due_date provided |
| 422 | items[N] is invalid | Malformed entry in items[] |
| 500 | Server error | Server-side failure |

> Invalid or unknown optional values (owner, designer, dropdowns) do not fail the request — the order is created and the field is left blank. Always check the warning field.

---

## Notes