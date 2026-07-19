# Refill shipping rules (The Candle Garden)

**Status:** Active product rules  
**Last updated:** 2026-07-18  
**Code source of truth:** `lib/shippingConfig.js` + `lib/pricing.js`

When rates, boxes, or packing assumptions change, update **this doc** and **`shippingConfig.js`** together.

---

## Mission

The refill estimator must:

1. Estimate **wax volume (oz)** for the customer’s empty vessel(s).
2. Recommend a **box size** large enough for those vessels **with packing material**.
3. Quote a price that includes:
   - Wax refill at the configured $/oz
   - **One leg of USPS shipping: Candle Garden → customer** (return of refilled vessels)

The customer is responsible for shipping **empties → Candle Garden** on their own. We tell them **which box to use** so both legs use the same size class and packing assumptions.

---

## Shipping charge policy (confirmed)

| Direction | Who pays | In app quote? |
|-----------|----------|----------------|
| Empties **customer → Candle Garden** | **Customer** (their own postage) | **No** — we only recommend the box size |
| Refills **Candle Garden → customer** | **Included** in order total | **Yes** — one-way postage for recommended box |

**Assumption:** Cost to ship the packed box back to the customer is represented by the single shipping line item on the estimate. We do **not** charge two legs.

**Implication:** The recommended box is both:

- The box they should use (or match) when shipping empties to us  
- The box size we use for the **included** return shipment  

---

## Box catalog (USPS Priority Mail Flat Rate)

Dimensions are **inside** where available (usable packing volume).  
Postage values are **retail/post-office style** placeholders for quotes; update when USPS Notice 123 changes. Prefer commercial rates later if CG ships online.

| Key | Name | Inside (approx. in) | L×W×H (in³) | Quote postage (one leg) | Source notes |
|-----|------|---------------------|-------------|-------------------------|--------------|
| `frb_small` | USPS Small Flat Rate Box | 8.625 × 5.375 × 1.625 | ~75 | ~$13.65 | Thin — rarely fits glass vessels with wrap |
| `frb_medium_top` | USPS Medium Flat Rate Box (top-load) | 11 × 8.5 × 5.5 | ~515 | ~$24.80 | Default for 1–2 typical jars/mugs |
| `frb_medium_side` | USPS Medium Flat Rate Box (side-load) | 13.625 × 11.875 × 3.375 | ~546 | ~$24.80 | Wide/flat vessels |
| `frb_large` | USPS Large Flat Rate Box | 12 × 11.75 × 5.5 | ~776 | ~$34.00 | Multi-vessel / large bowls |

**Authoritative size reference:** [USPS Priority Mail Flat Rate](https://www.usps.com/ship/priority-mail.htm) / Postal Explorer Notice 123.  
**Rates as-of:** document in `shippingConfig.js` (`ratesAsOf`).

Optional later: customer’s own box (weight/zone rates via API) — not in MVP quote.

---

## Packing material rules

Glass vessels must be packed well. Packing **consumes volume**.

| Rule | Default | Notes |
|------|---------|--------|
| Volume packing factor | **1.65×** vessel volume | Wrap + void fill; conservative |
| Min cushion per side | **0.5 in** | Used when we have L×W×H |
| Usable box volume | **65%** of inner cubic inches | Efficiency after packing reality |
| Stack glass without divider | **No** (MVP) | Prefer side-by-side or larger box |
| Max vessels per box (soft) | **4** typical jars | Over → prefer large or split (future) |

If both **wax oz** and **vessel count/size** exist, **physical fit wins** over wax-oz heuristics for box choice. Wax oz still drives material charge.

---

## Fit determination (MVP algorithm)

1. Estimate each vessel’s volume (from vision oz as proxy, or size class defaults).  
2. `packedVolume = sum(vesselVolume × packingFactor)`.  
3. For each box (smallest first):  
   `fits = packedVolume <= innerVolume × usableFraction`  
   and (if dimensions known) max vessel footprint fits with cushion.  
4. Recommend **smallest fitting box**.  
5. If none fit → recommend large + flag “may need custom / contact us”.  

**Round-trip consistency:** Same recommended box key for customer outbound empties and CG return shipment.

---

## Price components (estimate)

| Line | Included? | Formula |
|------|-----------|---------|
| Wax | Yes | `ounces × WAX_PRICE_PER_OZ × quantity` |
| Shipping (CG → customer) | Yes | Flat rate for recommended box (one leg) |
| Customer → CG postage | No | Customer pays; we only show box guidance |
| Packing materials kit | Optional later | Config flag; $0 for now |

---

## Customer-facing copy (intent)

- “We’ll ship your refilled vessels back in a **[box name]** — **return shipping is included** in this estimate.”  
- “Please pack empties carefully and ship them **to us** in a box of this size (or the same USPS Flat Rate box). **Outbound shipping to The Candle Garden is your responsibility.**”  
- “Packing materials (bubble wrap / paper) take space — this size accounts for safe packing.”

---

## Future change checklist

When something changes, update:

1. This markdown  
2. `lib/shippingConfig.js` (boxes, rates, packing factors, `ratesAsOf`)  
3. Any unit tests around fit/recommend  
4. Estimator / RefillStep4 copy if policy changes  

---

## Open product decisions (not blocking MVP)

- [ ] Do we **mail them** an empty FRB, or only **recommend** they buy/use that size?  
- [ ] Insurance / tracking included in quote messaging?  
- [ ] Multi-box orders when vessels don’t fit one FRB  
- [ ] Live USPS rates API vs static table  

---

*Policy confirmed with product: one-leg shipping charge = CG → customer only; customer ships empties at their cost; box recommendation serves both directions.*
