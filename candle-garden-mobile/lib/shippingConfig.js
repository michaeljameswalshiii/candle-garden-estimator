/**
 * Refill shipping configuration — single place for USPS boxes, rates, packing.
 * Product rules: docs/REFILL_SHIPPING_RULES.md
 *
 * Policy:
 * - Quote includes ONE shipping leg: Candle Garden → customer (return of refills).
 * - Customer ships empties → CG at their own cost.
 * - We recommend a box size for safe packing both ways (same size class).
 */

/** ISO date of the postage table (update when USPS changes rates). */
export const RATES_AS_OF = '2026-04-01';

/**
 * Shipping charge model.
 * @type {'one_leg_return_included'}
 */
export const SHIPPING_CHARGE_MODEL = 'one_leg_return_included';

export const SHIPPING_POLICY = {
  /** Customer pays postage for empties to Candle Garden */
  customerOutboundToCg: 'customer_pays',
  /** CG → customer return postage is in the app estimate */
  cgReturnToCustomer: 'included_in_quote',
  /** Same box size recommendation used both ways */
  sameBoxBothDirections: true,
  summary:
    'Estimate includes return shipping of refilled vessels to you. ' +
    'You pack and ship empties to The Candle Garden (postage on you). ' +
    'Use the recommended USPS box size for safe packing both ways.',
};

/**
 * Packing material assumptions (tunable).
 * Packed volume ≈ vessel volume × packingFactor, limited by usable box %.
 */
export const PACKING = {
  /** Multiply estimated vessel cubic inches for wrap + void fill */
  volumeFactor: 1.65,
  /** Usable fraction of inner box volume after real-world packing */
  usableBoxFraction: 0.65,
  /** Extra inches of cushion per side when L×W×H known */
  minCushionInches: 0.5,
  /** Soft cap: more vessels often need a larger box even if volume fits */
  softMaxVessels: {
    frb_small: 1,
    frb_medium_top: 3,
    frb_medium_side: 3,
    frb_large: 5,
  },
};

/**
 * Rough cubic inches for a vessel from wax/fill ounces (heuristic).
 * 1 fl oz ≈ 1.8 in³; vessel exterior is larger than fill volume.
 */
export const OZ_TO_VESSEL_CU_IN = 2.4;

/**
 * USPS Priority Mail Flat Rate boxes (inside dimensions where available).
 * postageOneLegUsd = charged once on the estimate (CG → customer).
 */
export const USPS_FLAT_RATE_BOXES = {
  frb_small: {
    key: 'frb_small',
    name: 'USPS Small Flat Rate Box',
    shortName: 'Small Flat Rate',
    // inside inches
    lengthIn: 8.625,
    widthIn: 5.375,
    heightIn: 1.625,
    postageOneLegUsd: 13.65,
    /** Legacy alias for wax-oz heuristic */
    maxWaxOzHint: 6,
    notes: 'Very shallow — usually only small items, not glass jars with wrap',
  },
  frb_medium_top: {
    key: 'frb_medium_top',
    name: 'USPS Medium Flat Rate Box (top-loading)',
    shortName: 'Medium Flat Rate',
    lengthIn: 11,
    widthIn: 8.5,
    heightIn: 5.5,
    postageOneLegUsd: 24.8,
    maxWaxOzHint: 20,
    notes: 'Best default for 1–2 typical candle vessels with packing',
  },
  frb_medium_side: {
    key: 'frb_medium_side',
    name: 'USPS Medium Flat Rate Box (side-loading)',
    shortName: 'Medium Flat Rate (wide)',
    lengthIn: 13.625,
    widthIn: 11.875,
    heightIn: 3.375,
    postageOneLegUsd: 24.8,
    maxWaxOzHint: 18,
    notes: 'Wider/flatter — good for shallow bowls if height allows',
  },
  frb_large: {
    key: 'frb_large',
    name: 'USPS Large Flat Rate Box',
    shortName: 'Large Flat Rate',
    lengthIn: 12,
    widthIn: 11.75,
    heightIn: 5.5,
    postageOneLegUsd: 34.0,
    maxWaxOzHint: 40,
    notes: 'Multi-vessel or large containers with full packing',
  },
};

/** Prefer this order when picking the smallest fit */
export const BOX_FIT_ORDER = [
  'frb_small',
  'frb_medium_top',
  'frb_medium_side',
  'frb_large',
];

export function boxInnerVolumeCuIn(box) {
  return box.lengthIn * box.widthIn * box.heightIn;
}

export function boxUsableVolumeCuIn(box) {
  return boxInnerVolumeCuIn(box) * PACKING.usableBoxFraction;
}

/**
 * Estimate packed cubic inches for a shipment of vessels.
 * @param {object} opts
 * @param {number} opts.totalWaxOz - total wax/fill oz for all vessels (proxy for size)
 * @param {number} [opts.vesselCount=1]
 * @param {number[]} [opts.perVesselOz] - optional breakdown
 */
export function estimatePackedVolumeCuIn({
  totalWaxOz,
  vesselCount = 1,
  perVesselOz,
} = {}) {
  const count = Math.max(1, Number(vesselCount) || 1);
  let volumes;

  if (Array.isArray(perVesselOz) && perVesselOz.length > 0) {
    volumes = perVesselOz.map((oz) => Math.max(0, Number(oz) || 0) * OZ_TO_VESSEL_CU_IN);
  } else {
    const each = (Math.max(0, Number(totalWaxOz) || 0) / count) * OZ_TO_VESSEL_CU_IN;
    volumes = Array.from({ length: count }, () => each);
  }

  const raw = volumes.reduce((s, v) => s + v, 0);
  return {
    rawVesselCuIn: raw,
    packedCuIn: raw * PACKING.volumeFactor,
    vesselCount: count,
  };
}

/**
 * Whether packed volume + vessel count can fit this box (MVP heuristic).
 */
export function boxFitsShipment(boxKey, packedCuIn, vesselCount = 1) {
  const box = USPS_FLAT_RATE_BOXES[boxKey];
  if (!box) return false;

  const usable = boxUsableVolumeCuIn(box);
  if (packedCuIn > usable) return false;

  const softMax = PACKING.softMaxVessels[boxKey];
  if (softMax != null && vesselCount > softMax) return false;

  // Small FRB height is too low for almost any candle jar with wrap
  if (boxKey === 'frb_small' && packedCuIn > 40) return false;

  return true;
}

/**
 * Recommend smallest USPS FRB that fits; include evaluation for UI.
 * @returns {{
 *   boxKey: string,
 *   box: object,
 *   packedCuIn: number,
 *   vesselCount: number,
 *   fits: Record<string, boolean>,
 *   postageOneLegUsd: number,
 * }}
 */
export function recommendShippingBox({
  totalWaxOz,
  vesselCount = 1,
  perVesselOz,
} = {}) {
  const { packedCuIn, vesselCount: count } = estimatePackedVolumeCuIn({
    totalWaxOz,
    vesselCount,
    perVesselOz,
  });

  const fits = {};
  for (const key of BOX_FIT_ORDER) {
    fits[key] = boxFitsShipment(key, packedCuIn, count);
  }

  let boxKey = BOX_FIT_ORDER.find((k) => fits[k]) || 'frb_large';
  // Prefer medium top over side when both fit and wax is moderate (simpler default)
  if (fits.frb_medium_top && fits.frb_medium_side) {
    boxKey = 'frb_medium_top';
  }

  const box = USPS_FLAT_RATE_BOXES[boxKey];
  return {
    boxKey,
    box,
    packedCuIn,
    vesselCount: count,
    fits,
    postageOneLegUsd: box.postageOneLegUsd,
  };
}

/** Human-readable shipping line for quotes */
export function shippingLineLabel(box) {
  return `${box.shortName || box.name} · return shipping included`;
}
