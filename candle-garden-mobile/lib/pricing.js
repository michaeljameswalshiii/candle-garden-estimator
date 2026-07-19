/**
 * Shared refill pricing — wax + one-leg return shipping.
 * Shipping boxes / packing rules: lib/shippingConfig.js
 * Product rules: docs/REFILL_SHIPPING_RULES.md
 */

import {
  SHIPPING_POLICY,
  USPS_FLAT_RATE_BOXES,
  recommendShippingBox,
  shippingLineLabel,
} from './shippingConfig';

export const WAX_PRICE_PER_OZ = 1.5;

/**
 * Minimum vision confidence to accept an auto-estimate (0–1).
 * Below this, the client should force manual entry.
 */
export const MIN_CONFIDENCE = 0.5;

/**
 * @deprecated Use USPS_FLAT_RATE_BOXES from shippingConfig — kept for screens mid-migration.
 * Maps to Flat Rate boxes used in the quote (one-leg return postage).
 */
export const BOX_PRICING = {
  frb_small: {
    cost: USPS_FLAT_RATE_BOXES.frb_small.postageOneLegUsd,
    maxOz: USPS_FLAT_RATE_BOXES.frb_small.maxWaxOzHint,
    name: USPS_FLAT_RATE_BOXES.frb_small.shortName,
  },
  frb_medium_top: {
    cost: USPS_FLAT_RATE_BOXES.frb_medium_top.postageOneLegUsd,
    maxOz: USPS_FLAT_RATE_BOXES.frb_medium_top.maxWaxOzHint,
    name: USPS_FLAT_RATE_BOXES.frb_medium_top.shortName,
  },
  frb_medium_side: {
    cost: USPS_FLAT_RATE_BOXES.frb_medium_side.postageOneLegUsd,
    maxOz: USPS_FLAT_RATE_BOXES.frb_medium_side.maxWaxOzHint,
    name: USPS_FLAT_RATE_BOXES.frb_medium_side.shortName,
  },
  frb_large: {
    cost: USPS_FLAT_RATE_BOXES.frb_large.postageOneLegUsd,
    maxOz: USPS_FLAT_RATE_BOXES.frb_large.maxWaxOzHint,
    name: USPS_FLAT_RATE_BOXES.frb_large.shortName,
  },
  // Aliases used by older UI keys
  small: {
    cost: USPS_FLAT_RATE_BOXES.frb_small.postageOneLegUsd,
    maxOz: USPS_FLAT_RATE_BOXES.frb_small.maxWaxOzHint,
    name: USPS_FLAT_RATE_BOXES.frb_small.shortName,
  },
  medium: {
    cost: USPS_FLAT_RATE_BOXES.frb_medium_top.postageOneLegUsd,
    maxOz: USPS_FLAT_RATE_BOXES.frb_medium_top.maxWaxOzHint,
    name: USPS_FLAT_RATE_BOXES.frb_medium_top.shortName,
  },
  large: {
    cost: USPS_FLAT_RATE_BOXES.frb_large.postageOneLegUsd,
    maxOz: USPS_FLAT_RATE_BOXES.frb_large.maxWaxOzHint,
    name: USPS_FLAT_RATE_BOXES.frb_large.shortName,
  },
};

/**
 * Recommend a shipping box key from wax oz + optional vessel count.
 * Uses packing volume heuristics (see shippingConfig).
 *
 * @param {number} ounces - total wax oz for the shipment (all vessels)
 * @param {object} [opts]
 * @param {number} [opts.vesselCount]
 * @param {number[]} [opts.perVesselOz]
 * @returns {string} box key
 */
export function recommendBox(ounces, opts = {}) {
  const result = recommendShippingBox({
    totalWaxOz: ounces,
    vesselCount: opts.vesselCount,
    perVesselOz: opts.perVesselOz,
  });
  return result.boxKey;
}

/**
 * Validate ounces for quote / manual entry.
 * Any positive finite volume is allowed (no min/max cap).
 * @param {number} ounces
 * @returns {boolean}
 */
export function isValidOunces(ounces) {
  const oz = Number(ounces);
  return Number.isFinite(oz) && oz > 0;
}

/**
 * Calculate refill material + one-leg return shipping cost.
 *
 * Shipping line = Candle Garden → customer only (included).
 * Customer → CG postage is NOT included (customer responsibility).
 *
 * @param {number} ounces - wax needed (per candle if quantity multiplies wax)
 * @param {object} [options]
 * @param {number} [options.quantity=1]
 * @param {string} [options.boxKey] - force a box; defaults to recommended
 * @param {number} [options.vesselCount]
 * @param {number[]} [options.perVesselOz]
 */
export function calculateCost(ounces, options = {}) {
  const quantity = Math.max(1, Number(options.quantity) || 1);
  const totalWaxOz = Number(ounces) * quantity;

  const recommendation = recommendShippingBox({
    totalWaxOz,
    vesselCount: options.vesselCount || quantity,
    perVesselOz: options.perVesselOz,
  });

  const boxKey = options.boxKey || recommendation.boxKey;
  const box =
    USPS_FLAT_RATE_BOXES[boxKey] ||
    USPS_FLAT_RATE_BOXES[recommendation.boxKey] ||
    USPS_FLAT_RATE_BOXES.frb_medium_top;

  const waxCost = Number(ounces) * WAX_PRICE_PER_OZ * quantity;
  // One leg only: CG ships refilled vessels back (return shipping included)
  const shippingCost = box.postageOneLegUsd;
  const total = waxCost + shippingCost;

  return {
    wax_cost: waxCost.toFixed(2),
    shipping_cost: shippingCost.toFixed(2),
    box_type: box.shortName || box.name,
    box_key: box.key,
    box_full_name: box.name,
    shipping_label: shippingLineLabel(box),
    shipping_policy: SHIPPING_POLICY.summary,
    total_cost: total.toFixed(2),
    wax_cost_num: waxCost,
    shipping_cost_num: shippingCost,
    total_cost_num: total,
    recommendation,
  };
}

/**
 * Whether a detector API response is safe to turn into a customer quote.
 * Fail closed: require success, detection, positive ounces, and confidence.
 *
 * @param {object} detectData
 * @returns {{ ok: boolean, reason?: string, ounces?: number, confidence?: number }}
 */
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

export { SHIPPING_POLICY, USPS_FLAT_RATE_BOXES, recommendShippingBox };
