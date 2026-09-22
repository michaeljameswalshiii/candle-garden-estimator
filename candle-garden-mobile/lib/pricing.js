/**
 * Shared refill pricing — wax + UPS Ground Saver (1 / 2 / 3 trips).
 * Shipping: lib/shippingConfig.js + lib/upsRates.js
 * Product rules: docs/REFILL_SHIPPING_RULES.md
 */

import {
  SHIPPING_POLICY,
  UPS_BOXES,
  USPS_FLAT_RATE_BOXES,
  SHIPPING_METHODS,
  METHOD_ORDER,
  recommendShippingBox,
  quoteShippingMethod,
  shippingLineLabel,
  estimatePackedWeight,
  formatLbOz,
  isValidDestZip,
} from './shippingConfig';

export const WAX_PRICE_PER_OZ = 1.75;
export const MIN_CONFIDENCE = 0.5;
export const DEFAULT_SHIPPING_METHOD = 'ship_own';

/**
 * @deprecated Postage is no longer flat by box. Kept so older screens don't crash.
 */
export const BOX_PRICING = Object.fromEntries(
  Object.entries(UPS_BOXES).map(([key, box]) => [
    key,
    { cost: 0, maxOz: box.maxWaxOzHint, name: box.shortName },
  ])
);

export function recommendBox(ounces, opts = {}) {
  const result = recommendShippingBox({
    totalWaxOz: ounces,
    vesselCount: opts.vesselCount,
    perVesselOz: opts.perVesselOz,
  });
  return result.boxKey;
}

export function isValidOunces(ounces) {
  const oz = Number(ounces);
  return Number.isFinite(oz) && oz > 0;
}

/**
 * Calculate refill wax + UPS Ground Saver for a shipping method.
 *
 * @param {number} ounces
 * @param {object} [options]
 * @param {number} [options.quantity=1]
 * @param {string} [options.boxKey]
 * @param {number} [options.vesselCount]
 * @param {number[]} [options.perVesselOz]
 * @param {string} [options.destZip]
 * @param {string} [options.shippingMethod]
 */
export function calculateCost(ounces, options = {}) {
  const quantity = Math.max(1, Number(options.quantity) || 1);
  const totalWaxOz = Number(ounces) * quantity;
  const vesselCount = options.vesselCount || quantity;
  const methodKey = options.shippingMethod || DEFAULT_SHIPPING_METHOD;

  const recommendation = recommendShippingBox({
    totalWaxOz,
    vesselCount,
    perVesselOz: options.perVesselOz,
  });

  const quote = quoteShippingMethod({
    destZip: options.destZip,
    methodKey,
    totalWaxOz,
    vesselCount,
    perVesselOz: options.perVesselOz,
    boxKey: options.boxKey || recommendation.boxKey,
  });

  const box = quote.box || UPS_BOXES.ups_medium;
  const waxCost = Number(ounces) * WAX_PRICE_PER_OZ * quantity;
  const shippingCost = quote.ok ? quote.shippingCostUsd : 0;
  const total = waxCost + shippingCost;
  const packedWeight = quote.packedWeight;

  return {
    wax_cost: waxCost.toFixed(2),
    shipping_cost: shippingCost.toFixed(2),
    box_type: box.shortName || box.name,
    box_key: box.key,
    box_full_name: box.name,
    shipping_label: quote.ok ? quote.shippingLabel : shippingLineLabel(box),
    shipping_policy: quote.method?.summary || SHIPPING_POLICY.summary,
    shipping_method: quote.method?.key || methodKey,
    shipping_method_title: quote.method?.title,
    dest_zip: quote.destZip || '',
    zone: quote.zone,
    quote_ok: !!quote.ok,
    needs_zip: !!quote.needsZip,
    quote_reason: quote.reason || '',
    legs: quote.legs || [],
    customer_note: quote.customerNote || '',
    total_cost: total.toFixed(2),
    wax_cost_num: waxCost,
    shipping_cost_num: shippingCost,
    total_cost_num: total,
    packed_weight: packedWeight,
    packed_weight_outbound: packedWeight?.refillsOutboundLabel,
    packed_weight_inbound: packedWeight?.emptiesInboundLabel,
    packed_weight_summary: packedWeight?.summary,
    recommendation,
  };
}

export function quoteAllMethods(ounces, options = {}) {
  return METHOD_ORDER.map((key) => ({
    methodKey: key,
    method: SHIPPING_METHODS[key],
    cost: calculateCost(ounces, { ...options, shippingMethod: key }),
  }));
}

export function isAcceptableDetection(detectData) {
  if (!detectData || typeof detectData !== 'object') {
    return { ok: false, reason: 'empty_response' };
  }

  if (detectData.success === false || detectData.container_detected === false) {
    return { ok: false, reason: 'not_detected', tips: detectData.tips };
  }

  const ounces = Number(detectData.estimated_ounces);
  if (!isValidOunces(ounces)) {
    return { ok: false, reason: 'invalid_ounces', tips: detectData.tips };
  }

  const confidence = Number(detectData.confidence);
  if (!Number.isFinite(confidence) || confidence < MIN_CONFIDENCE) {
    return {
      ok: false,
      reason: 'low_confidence',
      confidence: Number.isFinite(confidence) ? confidence : 0,
      tips: detectData.tips,
    };
  }

  return {
    ok: true,
    ounces,
    confidence,
    container_type: detectData.container_type || 'Candle vessel(s)',
    vessels: Array.isArray(detectData.vessels) ? detectData.vessels : undefined,
  };
}

export {
  SHIPPING_POLICY,
  UPS_BOXES,
  USPS_FLAT_RATE_BOXES,
  SHIPPING_METHODS,
  METHOD_ORDER,
  recommendShippingBox,
  quoteShippingMethod,
  estimatePackedWeight,
  formatLbOz,
  isValidDestZip,
};
