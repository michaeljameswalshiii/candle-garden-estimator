# Refill shipping rules (The Candle Garden)

**Status:** Active product rules  
**Last updated:** 2026-09-10  
**Code source of truth:** `lib/upsRates.js` + `lib/shippingConfig.js` + `lib/pricing.js`  
**Checkout source of truth:** `candle-saas-cdk/lambda_functions/payment_processor/refill_shipping.py` (must match the app)

When rates, boxes, packing, or methods change, update **this doc**, **`upsRates.js` / `shippingConfig.js`**, and **`refill_shipping.py`** together.

---

## Mission

The refill estimator must:

1. Estimate **wax volume (oz)** for the customer’s empty vessel(s).
2. Recommend a **carton** large enough for those vessels **with packing material**.
3. Estimate **packed shipment weight** (vessels + box + packing, plus wax on the return).
4. Quote **UPS Ground Saver** from Atlantic Beach, FL (`32233`) using destination ZIP, billed pounds, and one of three shipping methods.

Ground Saver is **zone × weight**, not a flat-rate box. A ZIP is required to quote.

---

## Carrier

| Field | Value |
|-------|--------|
| Carrier | UPS |
| Service | Ground Saver |
| Origin | 363 Atlantic Boulevard, Suite 8, Atlantic Beach, FL **32233** |
| Coverage | 48 contiguous states (no AK/HI in this quote) |
| Rates | Published Ground Saver 1 lb+ table, effective **2026-04-01** |
| Per package | List rate + **$4.65** residential surcharge |
| Billable weight | Greater of scale pounds (ceil oz/16) and dim weight `(L×W×H)/166` |

Checkout and the estimator call **UPS Rating** (Ground Saver service 93) when `candlesaas/ups` credentials exist; otherwise they use this published table so the app still quotes. After payment, methods 2 and 3 call **UPS Shipping** to print prepaid Ground Saver labels (return label for empties). Fuel/residential in the table path: **16%** fuel on the list rate; **$4.65** residential only on packages to the customer.

---

## Three shipping methods (charges = Ground Saver trips Candle Garden pays)

| Key | Customer-facing name | UPS trips in the quote | What happens |
|-----|----------------------|------------------------|--------------|
| `ship_own` | **Ship on your own** | **1** — refills CG → customer | Customer packs and ships empties at **their** cost. We include only the refill return. |
| `kit_roundtrip` | **We send packing** | **3** — kit out + empties in + refills out | We mail a packing kit (folded carton + wrap + labels). Customer sends empties on a prepaid label. We refill and ship back. The kit is **not** glass. |
| `prepaid_labels` | **Prepaid labels** | **2** — empties in + refills out | We email packing instructions and a prepaid label. Customer uses **their own** box matching the recommended size. We receive, refill, and ship back. |

All three need a destination ZIP (zone is the same both directions in this quote).

**Method 3 caps:** billed weight ≤ 20 lb, longest side ≤ 18 in, length + girth ≤ 84 in. Over that, the method is unavailable.

---

## Cartons (not USPS Flat Rate)

| Key | Size (in) | Empty (oz) | Typical use |
|-----|-----------|------------|-------------|
| `ups_small` | 10 × 8 × 6 | ~8 | One typical jar |
| `ups_medium` | 12 × 10 × 8 | ~12 | 1–2 vessels |
| `ups_large` | 14 × 12 × 10 | ~16 | Multi-vessel / large bowls |
| `kit_pack` (method 2 only) | 12 × 10 × 2 | ~14 | Folded carton + wrap, no glass |

Old USPS keys (`frb_small`, `frb_medium_top`, …) still map to these cartons so in-flight carts don’t break.

---

## Packed weight

| Component | Default |
|-----------|---------|
| Empty vessel (glass) | **max(5 oz, fill oz × 1.1)** |
| Wax (outbound only) | **fill oz × 1.0** |
| Box tare | from carton table |
| Wrap per vessel | **1.75 oz** |
| Void fill | **max(1 oz, unused inner in³ × 0.008)** |
| Tape + label | **1 oz** |

- **Empties → CG:** vessels + box + packing  
- **Refills → customer:** same + wax  
- **Kit → customer:** folded carton + wrap (no glass)

---

## Price components

| Line | Included? | Formula |
|------|-----------|---------|
| Wax | Yes | `ounces × $1.50 × quantity` |
| UPS Ground Saver | Yes, for the legs of the chosen method | zone/weight list + residential per package |
| Customer → CG postage on **Ship on your own** | No | Customer pays their own carrier |
| Packing kit materials | In method 2 as a **shipping** leg, not a product SKU | Kit billed as a light Ground Saver package |

Checkout **recomputes** wax + UPS from ounces, ZIP, method, and box. Client `unitPrice` is ignored.

---

## Customer-facing copy (intent)

- Ship on your own: “You pack and ship empties to us. We send refills back via UPS Ground Saver — that one trip is included.”
- We send packing: “We mail you a packing kit and prepaid labels, you send empties in, then we ship refills back. Three Ground Saver trips.”
- Prepaid labels: “We’ll email packing instructions and a prepaid UPS Ground Saver label. After we refill, we ship them back. You provide a sturdy box that matches the size we recommend.”
- Weight always: “Packed weight includes your vessels, the box, and packing supplies. UPS bills the next whole pound, or dimensional weight if that’s higher.”

---

## Future change checklist

1. This markdown  
2. `lib/upsRates.js` (table, origin, residential)  
3. `lib/shippingConfig.js` (boxes, packing, methods)  
4. `refill_shipping.py` (must match)  
5. Estimator / RefillStep4 copy  
6. Payment processor tests  

---

*Policy: UPS Ground Saver only; three methods; ZIP required; packed weight drives billed pounds.*
