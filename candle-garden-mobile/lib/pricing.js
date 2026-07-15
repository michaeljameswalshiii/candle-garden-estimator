/**
 * Shared refill pricing — single source of truth for Estimator + checkout steps.
 * Keep rates in one place so screens cannot drift.
 */

export const WAX_PRICE_PER_OZ = 0.5;

/**
 * Minimum vision confidence to accept an auto-estimate (0–1).
 * Below this, the client should force manual entry.
 */
export const MIN_CONFIDENCE = 0.5;

export const BOX_PRICING = {
  small: { cost: 8.99, maxOz: 8, name: 'Small Box' },
  medium: { cost: 12.99, maxOz: 16, name: 'Medium Box' },
  large: { cost: 15.99, maxOz: 32, name: 'Large Box' },
};

/**
 * Recommend a shipping box key from total wax ounces.
 * @param {number} ounces
 * @returns {'small'|'medium'|'large'}
 */
export function recommendBox(ounces) {
  const oz = Number(ounces) || 0;
  if (oz <= BOX_PRICING.small.maxOz) return 'small';
  if (oz <= BOX_PRICING.medium.maxOz) return 'medium';
  return 'large';
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
 * Calculate refill material + shipping cost.
 * Shipping is charged once per shipment (not multiplied by candle quantity).
 * Wax scales with quantity.
 *
 * @param {number} ounces - wax needed per candle
 * @param {object} [options]
 * @param {number} [options.quantity=1]
 * @param {string} [options.boxKey] - force a box; defaults to recommended
 * @returns {{
 *   wax_cost: string,
 *   shipping_cost: string,
 *   box_type: string,
 *   box_key: string,
 *   total_cost: string,
 *   wax_cost_num: number,
 *   shipping_cost_num: number,
 *   total_cost_num: number,
 * }}
 */
export function calculateCost(ounces, options = {}) {
  const quantity = Math.max(1, Number(options.quantity) || 1);
  const boxKey = options.boxKey || recommendBox(ounces);
  const box = BOX_PRICING[boxKey] || BOX_PRICING.medium;

  const waxCost = Number(ounces) * WAX_PRICE_PER_OZ * quantity;
  // One shipment per order (quantity is extra wax in the same box for MVP)
  const shippingCost = box.cost;
  const total = waxCost + shippingCost;

  return {
    wax_cost: waxCost.toFixed(2),
    shipping_cost: shippingCost.toFixed(2),
    box_type: box.name,
    box_key: boxKey,
    total_cost: total.toFixed(2),
    wax_cost_num: waxCost,
    shipping_cost_num: shippingCost,
    total_cost_num: total,
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
  };
}
