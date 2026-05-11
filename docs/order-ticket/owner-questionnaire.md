# BazaarPrinting CRM — Quotes & Orders: Owner Review

**From:** Development Team  
**To:** Product Owner  
**Re:** Quotes & Orders module — decisions needed before we start building

---

We are ready to build the **Quotes and Orders** section of the CRM. We went through the working prototype system and pre-filled the answers we were able to confirm from the code. The items marked **"Owner decision needed"** are the only ones you need to answer — everything else is already set.

Please review the pre-filled answers to make sure they match how you want the production system to work, and fill in the open items.

---

## Section 1 — Who Can See What

---

### Q1 — Who can see the Quotes page?

> The Quotes page lists all formal quotes sent to clients, plus leads that were quoted verbally or by SMS without a formal ticket.

**✅ Confirmed from prototype:** Everyone sees everything — SDRs, Sales reps, and Admin all see the full list of all quotes in the system. There is no user filtering. It is a shared production board.

**Does this match how you want production to work?**

- [ ] **Yes — keep it as a shared board** *(default — matches prototype)*
- [ ] **No — I want scoped visibility (each person sees only their own)** *(requires additional build work)*

**Your answer:** _______________

---

### Q2 — Who can see the Orders page?

**✅ Confirmed from prototype:** Same as Quotes — all orders are visible to all team members.

**Does this match how you want production to work?**

- [ ] **Yes — shared board for all**
- [ ] **No — I want scoped visibility**

**Your answer:** _______________

---

## Section 2 — Who Can Create Quotes & Orders

---

### Q3 — Can the SDR team create a quote or order?

**✅ Confirmed from prototype:** Yes. The SDR creates a quote or order from inside the lead they are working on (not from the standalone pages). When the SDR saves a ticket:
- If the ticket includes a quote → the lead status becomes **"Quoted"** and it moves to the Project list
- If it is an order only (no quote) → the lead status becomes **"Validated"**
- The lead **stays with the SDR** — it does not automatically go to Sales

**Does this match how you want production to work?**

- [ ] **Yes — SDR can create from inside the lead (same as prototype)**
- [ ] **No — SDR should not create tickets; only Sales creates quotes and orders**
- [ ] **Different — SDR creates the ticket but the lead auto-routes to Sales immediately after** *(requires a business rule change)*

**Your answer:** _______________

---

### Q4 — How does the Quote + Order relationship work?

**✅ Confirmed from prototype:** When a Sales rep or SDR creates a quote and checks **"Requires client confirmation"** (the default), the system creates **both** a quote ticket and an order ticket at the same time. The order is in a "Pending Client Confirmation" holding state and does not appear on the Orders page until the client approves. When the client confirms, the order becomes active.

If the rep does **not** require client confirmation, an order is created directly with no quote attached.

**Does this match how you want production to work?**

- [ ] **Yes — create both at once; order activates on client confirmation** *(matches prototype)*
- [ ] **Different — I want to explain:** _______________

**Your answer:** _______________

---

### Q5 — Can an existing ticket be edited after it is sent or approved?

**⚠️ Owner decision needed — the prototype had no restrictions, but this is a business policy question.**

Pick one:

- [ ] **Always editable** — a rep can edit any ticket at any time, regardless of status *(matches prototype)*
- [ ] **Only draft and sent tickets are editable** — once a ticket is approved, it is read-only unless an admin re-opens it
- [ ] **Only the person who created it can edit** — other team members can view but not change the ticket

**Your answer:** _______________

---

## Section 3 — Pricing & Business Rules

---

### Q6 — Payment methods

**✅ Confirmed from prototype — these three are the default options:**

| Checkbox label | Internal code |
|---|---|
| Card Payment | `card_default` |
| Zelle | `zelle` |
| Offline (cash / check / other) | `offline` |

Card Payment is checked by default on every new quote. At least one must always be selected.

**Are these correct for BazaarPrinting?** Should any be added, removed, or renamed?

**Your answer (add / remove / rename, or write "Correct as-is"):** _______________

---

### Q7 — Default tax rate

**✅ Confirmed from prototype:** The default tax rate is **8.25%**. The rep can change it per quote. A "Tax Exempt" toggle is also available (requires a sales permit number when enabled).

**Is 8.25% correct for your jurisdiction?**

**Your answer (confirm or provide correct rate):** _______________

---

### Q8 — High-value order warning

**✅ Confirmed from prototype:** When a quote total reaches **$5,000 or more**, a yellow warning banner appears and the SDR/Sales rep must acknowledge it before sending. They can still send — it is just a double-check prompt.

Note from prototype: this warning currently shows **for SDR only** when the total hits $5,000. Sales reps see the warning but are not blocked.

**Does this match what you want?**

- [ ] **Yes — warn at $5,000** *(matches prototype)*
- [ ] **Yes — but use a different amount:** $_______________
- [ ] **Yes — and show the warning to both SDR and Sales equally**
- [ ] **No — remove the high-value warning entirely**

**Your answer:** _______________

---

### Q9 — Shipping charge

**✅ Confirmed from prototype:** Shipping is a manual entry field on each quote. The rep types in whatever amount applies. It defaults to blank (no charge). There is no automatic calculation.

**Is this correct?**

- [ ] **Yes — manual entry per quote** *(matches prototype)*
- [ ] **No — we have a fixed shipping rate:** $_______________
- [ ] **No — we never charge shipping; remove this field**

**Your answer:** _______________

---

### Q10 — Product types, materials, and finishes

**Updated from production system (more accurate than prototype).**

We reviewed the actual production setup and found the accurate product and material lists. Below is what we found — please review and confirm.

**Product types and their compatible materials:**

| Product Type | Compatible Materials |
|---|---|
| Labels (Roll) | Clear BOPP, White BOPP, Silver BOPP, Holo BOPP, Gloss Label Sheet, Matte Label Sheet, Semi Gloss |
| Labels (Sheet) | Gloss Label Sheet, Matte Label Sheet, Semi Gloss |
| Diecut Stickers | Clear BOPP, White BOPP, Silver BOPP, Holo BOPP, Gloss Label Sheet, Matte Label Sheet, Semi Gloss |
| Pouches | Clear Cosmetic Web, White Cosmetic Web, Silver Cosmetic Web |
| Folding Cartons / Boxes | 14pt C1S, 14pt C2S, 16pt C1S, 16pt C2S, 18pt C1S, 18pt C2S, 18pt Silver, 24pt C1S, 24pt C2S |
| Business Cards | Cardstock (above) + 80lb Cover, 100lb Cover, 110lb Cover |
| Flyers / Postcards | 80lb Cover, 100lb Cover, 110lb Cover, 80lb Text, 100lb Text + Cardstock |
| Booklets | 80lb Cover, 100lb Cover, 110lb Cover, 80lb Text, 100lb Text |
| Vinyl Labels / 54'' Rolls | White Vinyl, White Vinyl - Aggressive Glue, Holographic Vinyl |
| Vinyl Signage | White Vinyl, White Vinyl - Aggressive Glue, Holographic Vinyl |
| Banners / Large Format | Banner Material |
| Window Decals | Window Decal |
| Wallpaper | Self-Adhesive (Peel-and-Stick), Traditional / Unpasted |
| Sheet Products (Boyd) | 18pt (Boyd), 20pt (Boyd), 24pt (Boyd) |
| Other | All materials |

**Laminations:** None, Gloss, Matte, Soft Touch, Holo, Coating

**Add-on finishes (checkboxes):** Spot UV, Foil, Perforation

**Color mode:** CMYK, CMYK + White

**Q10a — Are the product names in the table above correct?**

The prototype used simpler names. The production system uses more specific ones. Please confirm which you prefer:

| Old name (prototype) | New name (production) | Use which? |
|---|---|---|
| Stickers | Diecut Stickers | |
| Flyer | Flyers / Postcards | |
| Vinyl Banners | Banners / Large Format | |

**Q10b — What about Canvas Prints, Jars, and Tubes?**

These were in the prototype but are not in the production system as product types:
- **Canvas Prints** — Are these still quoted through this CRM?
- **Jars / Tubes** — In the production system these are listed as "application containers" (a label is applied to the jar/tube). Should they remain as product types, or should reps quote the label (e.g. Labels Roll) and note "for jars" in the description?

**Your answer:** _______________

**Q10c — Does the material dropdown need to filter by facility?**

The production facility (16th Street vs Boyd Street) determines which materials are available. For example, stickers at 16th Street use BOPP material, but stickers at Boyd use Vinyl.

- [ ] **Yes — ask for facility first, then filter materials accordingly** *(most accurate)*
- [ ] **No — show all materials; the rep knows which to pick** *(simpler)*

**Your answer:** _______________

**Q10d — How much detail on materials?**

Cardstock comes in many weights and finishes (14pt, 16pt, 18pt, 24pt, C1S, C2S, Silver, etc.). Should Sales reps pick the specific weight when quoting, or is "Cardstock" enough?

- [ ] **Full detail** — rep picks exact weight (14pt C1S, 18pt C2S, etc.) — accurate for pricing
- [ ] **Group level** — rep picks "Cardstock", production selects the weight *(simpler for reps)*

**Your answer:** _______________

---

### Q11 — Rush orders

**✅ Confirmed from prototype:** "Rush" is a toggle on each order. It adds a visible Rush badge but does **not** affect pricing — it is informational only (used to flag priority for production).

**Is this correct, or should Rush add a surcharge?**

- [ ] **Informational only — no price impact** *(matches prototype)*
- [ ] **Rush adds a surcharge:** _______________% or $_______________

**Your answer:** _______________

---

### Q17 — Pricing calculator in the quote builder

**Context:** There is a separate pricing calculator tool (currently in the pulse system) that helps reps figure out what to charge a customer. It works by taking the item size and quantity, calculating how many pieces fit on a press frame, and looking up the cost per frame from a tier price table. The output is a suggested price per piece.

Right now the rep opens this calculator separately, gets the price, then types it into the quote manually.

**Should this calculator be built into the quote builder itself?**

- [ ] **Yes — embedded in the quote builder** — when the rep enters item size and quantity, a suggested unit price appears automatically. Rep can accept or override. *(most useful, more build time)*
- [ ] **No — keep as a separate tool** — rep calculates separately and types the price manually *(same as today, faster to build)*

**Your answer:** _______________

---

### Q18 — When adding a new product, should the admin also configure its pricing?

**Context:** Each product type (Labels, Boxes, Pouches, etc.) has a specific press machine and a pricing tier table that determines how the production cost is calculated. Right now those rules are fixed.

If admin can add new product types from the Products panel, they would need to also configure the pricing rules for that product — otherwise the system cannot calculate a suggested price for it.

**Two questions:**

**Q18a — When admin adds a new product type, should they configure which machine/press it uses and which pricing tier table applies?**

- [ ] **Yes — full pricing config per product** — admin picks the machine (6K / 15K / Boyd), selects the tier table, and sets finishing surcharges (e.g. "Soft Touch = +10%"). New products are fully calculator-ready.
- [ ] **No — new products default to "Manual"** — rep always types the price manually for any new product; only the existing products have wired calculators.

**Q18b — Should the pricing tier rates themselves be editable from the admin panel?**

Example: if the cost per frame for Labels increases from $3.40 to $3.80, should the owner be able to update that number from the admin panel without involving a developer?

- [ ] **Yes — admin can edit the tier rate tables** (full control, no developer needed for price changes)
- [ ] **No — rates are fixed; a developer updates them when needed** (simpler to build)

**Your answer:** _______________

---

## Section 4 — App Navigation & Display

---

### Q12 — Where should Quotes and Orders appear in the sidebar?

**The current CRM setup has them as two separate sidebar items ("Quoted Requests" and "Orders"). The prototype used a single tabbed page.**

Pick one:

- [ ] **Keep as two separate pages** — "Quoted Requests" and "Orders" as two distinct sidebar links *(current CRM setup — no changes to navigation needed)*
- [ ] **Combine into one "Tickets" page** — a single sidebar link that opens a tabbed view *(requires navigation change)*

**Your answer:** _______________

---

### Q13 — Order reference number format

**⚠️ Owner decision needed.** The prototype used an auto-generated code that was not user-friendly (e.g. `O1715432_ab3x9`). Pick a format:

- [ ] **Short code** — last 8 characters of the system ID, e.g. `#a3f9b12c` *(simple, no counter needed)*
- [ ] **Sequential number** — `ORD-0001`, `ORD-0002`, `ORD-0003` ... *(clean, requires a counter in the database)*
- [ ] **Year + sequential** — `ORD-2026-001`, `ORD-2026-002` ... *(most professional, requires a counter)*

**Your answer:** _______________

---

## Section 5 — PDF Export

---

### Q14 — Company information for the PDF header

**✅ Answered — no input needed here.** Company details (name, address, phone, email, website, logo) will be stored in the **Admin → Company Info** settings tab. The PDF generator will read directly from there. The owner fills this in once from the admin panel — no developer or code change required.

**Action needed:** After the admin panel is built, go to Admin → Company Info and fill in the company details before generating the first PDF.

---

### Q15 — Company logo on the PDF

- [ ] **No logo — company name as text only** *(ready to build immediately)*
- [ ] **Yes — include the logo** *(provide the logo file; adds build time)*

**Your answer:** _______________

---

## Section 6 — Statistics & Reporting

---

### Q16 — Should revenue from quotes and orders appear on dashboards and statistics?

**✅ The prototype included ticket revenue in the Statistics tab.** Production can do the same.

- [ ] **Yes — show revenue totals from quotes/orders on the dashboard and statistics page** *(matches prototype)*
- [ ] **Not yet — build the quotes/orders module first; add revenue stats later*

**Your answer:** _______________

---

## Summary — Only These Items Need Your Answer

| # | Question | Status |
|---|---|---|
| Q1 | Confirm shared ticket visibility | Review pre-filled answer |
| Q2 | Confirm shared ticket visibility | Review pre-filled answer |
| Q3 | Confirm SDR can create from lead | Review pre-filled answer |
| Q4 | Confirm quote + order created together | Review pre-filled answer |
| **Q5** | **Editing policy after ticket is sent/approved** | **Needs your answer** |
| Q6 | Confirm payment methods | Review pre-filled answer |
| Q7 | Confirm 8.25% tax rate | Review pre-filled answer |
| Q8 | Confirm $5,000 high-value warning | Review pre-filled answer |
| Q9 | Confirm manual shipping | Review pre-filled answer |
| **Q10a** | **Product names: use pulse names or prototype names?** | **Needs your answer** |
| **Q10b** | **Canvas Prints / Jars / Tubes — keep or remove?** | **Needs your answer** |
| **Q10c** | **Material filtering by facility?** | **Needs your answer** |
| **Q10d** | **Full cardstock weight detail or group-level only?** | **Needs your answer** |
| Q11 | Confirm rush = informational only | Review pre-filled answer |
| Q12 | Confirm two separate sidebar pages | Review pre-filled answer |
| **Q13** | **Order reference number format** | **Needs your answer** |
| Q14 | Company info → handled by Admin → Company Info tab | Answered |
| Q15 | Logo on PDF | Review / confirm |
| Q16 | Revenue in statistics | Review pre-filled answer |
| **Q17** | **Pricing calculator: embedded or separate tool?** | **Needs your answer** |
| **Q18a** | **New product types: configure pricing when adding?** | **Needs your answer** |
| **Q18b** | **Tier rates: admin-editable or developer-only?** | **Needs your answer** |

**Minimum required to start building: Q5, Q10a–d, Q13, Q17, Q18a, Q18b.**

---

*Document prepared by: BazaarPrinting CRM development team*  
*Technical reference: `docs/order-ticket/open-questions.md`*  
*Shadow project analysis: `docs/order-ticket/shadow-project-findings.md`*
