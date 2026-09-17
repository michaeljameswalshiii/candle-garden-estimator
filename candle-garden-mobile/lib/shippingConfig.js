/**
 * Refill shipping — UPS Ground Saver, packed weight, three charge methods.
 * Product rules: docs/REFILL_SHIPPING_RULES.md
 * Rates: lib/upsRates.js
 */

import {
  RATES_AS_OF,
  ORIGIN_ZIP,
  ORIGIN_CITY,
  SERVICE_NAME,
  quoteGroundSaverLeg,
  isValidDestZip,
  normalizeZip,
  formatUsd,
} from './upsRates';

export { RATES_AS_OF, ORIGIN_ZIP, ORIGIN_CITY, SERVICE_NAME, isValidDestZip, normalizeZip };

export const SHIPPING_CHARGE_MODEL = 'ups_ground_saver_methods';
export const CARRIER = 'UPS';

export const SHIPPING_METHODS = {
  ship_own: {
    key: 'ship_own',
    title: 'Ship on your own',
    shortTitle: 'You ship empties',
    chargeCount: 1,
    legs: ['refills_out'],
    summary:
      'You pack and ship empties to The Candle Garden (postage on you). ' +
      'We ship refills back using the lowest-cost available UPS service — that one trip is included.',
  },
  kit_roundtrip: {
    key: 'kit_roundtrip',
    title: 'We send packing',
    shortTitle: 'Kit + labels',
    chargeCount: 3,
    legs: ['kit_out', 'empties_in', 'refills_out'],
    summary:
      'We mail you a packing kit (box + wrap) and prepaid UPS labels. ' +
      'You send empties in; we refill and ship them back. Three UPS trips.',
  },
  prepaid_labels: {
    key: 'prepaid_labels',
    title: 'Prepaid labels',
    shortTitle: 'You pack, we label',
    chargeCount: 2,
    legs: ['empties_in', 'refills_out'],
    summary:
      'We’ll provide packing instructions and a prepaid UPS label for empties. ' +
      'After we refill, we ship them back. Two UPS trips. You provide a sturdy box that matches the size below.',
  },
};

export const METHOD_ORDER = ['ship_own', 'kit_roundtrip', 'prepaid_labels'];

export const SHIPPING_POLICY = {
  carrier: CARRIER,
  service: SERVICE_NAME,
  originZip: ORIGIN_ZIP,
  originCity: ORIGIN_CITY,
  customerOutboundToCg: 'depends_on_method',
  cgReturnToCustomer: 'included_in_quote',
  sameBoxBothDirections: true,
  summary:
    'Shipping uses the lowest-cost available UPS service from Atlantic Beach, FL. ' +
    'Price depends on your ZIP, packed weight (vessels + box + packing), and how you send empties. ' +
    'Pick one of three methods below.',
};

export const PACKING = {
  volumeFactor: 1.65,
  usableBoxFraction: 0.65,
  minCushionInches: 0.5,
  softMaxVessels: {
    ups_small: 1,
    ups_medium: 3,
    ups_large: 6,
  },
};

export const WEIGHT = {
  glassOzPerFillOz: 1.1,
  minEmptyVesselOz: 5,
  waxOzPerFillOz: 1.0,
  wrapOzPerVessel: 1.75,
  tapeAndLabelOz: 1.0,
  voidFillOzPerCuIn: 0.008,
  minVoidFillOz: 1.0,
  upsDimDivisor: 166,
};

export const OZ_TO_VESSEL_CU_IN = 2.4;

/** Method 3: customer’s own box must stay in Ground Saver-friendly size. */
export const METHOD3_LIMITS = {
  maxBilledLb: 20,
  maxLengthIn: 18,
  maxGirthPlusLengthIn: 84,
};

/**
 * Cartons we pack glass in (not USPS Flat Rate).
 * Kit outbound uses kit_pack (folded carton + wrap, no glass).
 */
export const UPS_BOXES = {
  ups_small: {
    key: 'ups_small',
    name: 'Small carton (10×8×6 in)',
    shortName: 'Small carton',
    lengthIn: 10,
    widthIn: 8,
    heightIn: 6,
    emptyBoxOz: 8,
    maxWaxOzHint: 12,
    notes: 'One typical jar with wrap',
  },
  ups_medium: {
    key: 'ups_medium',
    name: 'Medium carton (12×10×8 in)',
    shortName: 'Medium carton',
    lengthIn: 12,
    widthIn: 10,
    heightIn: 8,
    emptyBoxOz: 12,
    maxWaxOzHint: 24,
    notes: 'Best default for 1–2 vessels with packing',
  },
  ups_large: {
    key: 'ups_large',
    name: 'Large carton (14×12×10 in)',
    shortName: 'Large carton',
    lengthIn: 14,
    widthIn: 12,
    heightIn: 10,
    emptyBoxOz: 16,
    maxWaxOzHint: 48,
    notes: 'Multi-vessel or large bowls',
  },
};

/** Compact outbound for packing kit (folded carton + wrap, no glass). */
export const KIT_PACK = {
  key: 'kit_pack',
  name: 'Packing kit',
  shortName: 'Packing kit',
  lengthIn: 12,
  widthIn: 10,
  heightIn: 2,
  emptyBoxOz: 14,
  notes: 'Folded carton, bubble wrap, paper, tape, labels',
};

export const BOX_FIT_ORDER = ['ups_small', 'ups_medium', 'ups_large'];

const BOX_ALIASES = {
  frb_small: 'ups_small',
  small: 'ups_small',
  frb_medium_top: 'ups_medium',
  frb_medium_side: 'ups_medium',
  medium: 'ups_medium',
  frb_large: 'ups_large',
  large: 'ups_large',
};

export function resolveBoxKey(key) {
  if (!key) return null;
  if (UPS_BOXES[key]) return key;
  return BOX_ALIASES[key] || null;
}

/** @deprecated Use UPS_BOXES — aliases keep old cart keys working. */
export const USPS_FLAT_RATE_BOXES = UPS_BOXES;

export const PACKING_INSTRUCTIONS = [
  'Use a sturdy cardboard carton close to the size we recommend — not a bag or flimsy gift box.',
  'Wrap each glass vessel on its own (bubble wrap or several layers of kraft).',
  'Fill every gap so nothing can rattle. Glass should not touch glass or the carton wall.',
  'Do not stack jars without a cardboard divider.',
  'Tape all seams. Put the prepaid UPS label on the largest face.',
  'Drop off at a UPS location or schedule a pickup. Keep the tracking number.',
];

export function boxInnerVolumeCuIn(box) {
  return box.lengthIn * box.widthIn * box.heightIn;
}

export function boxUsableVolumeCuIn(box) {
  return boxInnerVolumeCuIn(box) * PACKING.usableBoxFraction;
}

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

export function ozToBilledPounds(oz) {
  return Math.max(1, Math.ceil(Math.max(0, Number(oz) || 0) / 16));
}

export function formatLbOz(oz) {
  const rounded = Math.max(0, Math.round(Number(oz) || 0));
  const lb = Math.floor(rounded / 16);
  const rem = rounded % 16;
  if (lb === 0) return `${rem} oz`;
  if (rem === 0) return `${lb} lb`;
  return `${lb} lb ${rem} oz`;
}

export function emptyVesselOz(fillOz) {
  const oz = Math.max(0, Number(fillOz) || 0);
  return Math.max(WEIGHT.minEmptyVesselOz, oz * WEIGHT.glassOzPerFillOz);
}

export function dimensionalWeightLb(box, divisor = WEIGHT.upsDimDivisor) {
  if (!box) return 1;
  const cu = boxInnerVolumeCuIn(box);
  return Math.max(1, Math.ceil(cu / divisor));
}

function fillOuncesList({ totalWaxOz, vesselCount = 1, perVesselOz } = {}) {
  if (Array.isArray(perVesselOz) && perVesselOz.length > 0) {
    return perVesselOz.map((oz) => Math.max(0, Number(oz) || 0));
  }
  const count = Math.max(1, Number(vesselCount) || 1);
  const each = Math.max(0, Number(totalWaxOz) || 0) / count;
  return Array.from({ length: count }, () => each);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

export function estimatePackedWeight({
  totalWaxOz,
  vesselCount = 1,
  perVesselOz,
  boxKey = 'ups_medium',
} = {}) {
  const resolved = resolveBoxKey(boxKey) || 'ups_medium';
  const box = UPS_BOXES[resolved] || UPS_BOXES.ups_medium;
  const fills = fillOuncesList({ totalWaxOz, vesselCount, perVesselOz });
  const count = fills.length;

  const emptyVesselsOz = fills.reduce((s, oz) => s + emptyVesselOz(oz), 0);
  const waxOz = fills.reduce((s, oz) => s + oz * WEIGHT.waxOzPerFillOz, 0);
  const boxTareOz = Number(box.emptyBoxOz) || 12;
  const wrapOz = count * WEIGHT.wrapOzPerVessel;

  const { packedCuIn } = estimatePackedVolumeCuIn({
    totalWaxOz,
    vesselCount: count,
    perVesselOz: fills,
  });
  const unusedCuIn = Math.max(0, boxInnerVolumeCuIn(box) - packedCuIn);
  const voidFillOz = Math.max(
    WEIGHT.minVoidFillOz,
    unusedCuIn * WEIGHT.voidFillOzPerCuIn
  );
  const tapeAndLabelOz = WEIGHT.tapeAndLabelOz;
  const packingOz = wrapOz + voidFillOz + tapeAndLabelOz;

  const emptiesInboundOz = emptyVesselsOz + boxTareOz + packingOz;
  const refillsOutboundOz = emptiesInboundOz + waxOz;

  const emptiesInboundActualLb = ozToBilledPounds(emptiesInboundOz);
  const refillsOutboundActualLb = ozToBilledPounds(refillsOutboundOz);
  const dimWeightLb = dimensionalWeightLb(box);
  const emptiesInboundBilledLb = Math.max(emptiesInboundActualLb, dimWeightLb);
  const refillsOutboundBilledLb = Math.max(refillsOutboundActualLb, dimWeightLb);

  const kitOz =
    KIT_PACK.emptyBoxOz + wrapOz + WEIGHT.minVoidFillOz + WEIGHT.tapeAndLabelOz;
  const kitActualLb = ozToBilledPounds(kitOz);
  const kitDimLb = dimensionalWeightLb(KIT_PACK);
  const kitBilledLb = Math.max(kitActualLb, kitDimLb);

  return {
    boxKey: box.key,
    vesselCount: count,
    emptyVesselsOz: round1(emptyVesselsOz),
    waxOz: round1(waxOz),
    boxTareOz: round1(boxTareOz),
    wrapOz: round1(wrapOz),
    voidFillOz: round1(voidFillOz),
    tapeAndLabelOz: round1(tapeAndLabelOz),
    packingOz: round1(packingOz),
    emptiesInboundOz: round1(emptiesInboundOz),
    refillsOutboundOz: round1(refillsOutboundOz),
    kitOz: round1(kitOz),
    dimWeightLb,
    kitBilledLb,
    emptiesInboundActualLb,
    refillsOutboundActualLb,
    emptiesInboundBilledLb,
    refillsOutboundBilledLb,
    upsBilledLbOutbound: refillsOutboundBilledLb,
    emptiesInboundLabel: `${formatLbOz(emptiesInboundOz)} (billed ${emptiesInboundBilledLb} lb)`,
    refillsOutboundLabel: `${formatLbOz(refillsOutboundOz)} (billed ${refillsOutboundBilledLb} lb)`,
    kitLabel: `${formatLbOz(kitOz)} (billed ${kitBilledLb} lb)`,
    breakdownOutbound:
      `vessels ${formatLbOz(emptyVesselsOz)} · box ${formatLbOz(boxTareOz)} · packing ${formatLbOz(packingOz)} · wax ${formatLbOz(waxOz)}`,
    breakdownInbound:
      `vessels ${formatLbOz(emptyVesselsOz)} · box ${formatLbOz(boxTareOz)} · packing ${formatLbOz(packingOz)}`,
    summary:
      `Packed weight est. ${formatLbOz(refillsOutboundOz)} outbound ` +
      `(vessels + wax + ${box.shortName} + packing). ` +
      `Empties: about ${formatLbOz(emptiesInboundOz)}. UPS bills the greater of scale and dim weight.`,
  };
}

export function boxFitsShipment(boxKey, packedCuIn, vesselCount = 1) {
  const resolved = resolveBoxKey(boxKey);
  const box = UPS_BOXES[resolved];
  if (!box) return false;

  const usable = boxUsableVolumeCuIn(box);
  if (packedCuIn > usable) return false;

  const softMax = PACKING.softMaxVessels[resolved];
  if (softMax != null && vesselCount > softMax) return false;

  return true;
}

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

  const boxKey = BOX_FIT_ORDER.find((k) => fits[k]) || 'ups_large';
  const box = UPS_BOXES[boxKey];
  const packedWeight = estimatePackedWeight({
    totalWaxOz,
    vesselCount: count,
    perVesselOz,
    boxKey,
  });
  return {
    boxKey,
    box,
    packedCuIn,
    vesselCount: count,
    fits,
    packedWeight,
  };
}

function method3Allowed(box, packedWeight) {
  const sides = [box.lengthIn, box.widthIn, box.heightIn].sort((a, b) => b - a);
  const length = sides[0];
  const girthPlus = length + 2 * (sides[1] + sides[2]);
  if (length > METHOD3_LIMITS.maxLengthIn) {
    return { ok: false, reason: 'This box is longer than our prepaid-label size cap. Choose a smaller carton or another method.' };
  }
  if (girthPlus > METHOD3_LIMITS.maxGirthPlusLengthIn) {
    return { ok: false, reason: 'This box is over our UPS size cap for prepaid labels.' };
  }
  if (packedWeight.refillsOutboundBilledLb > METHOD3_LIMITS.maxBilledLb) {
    return { ok: false, reason: `Packed weight is over ${METHOD3_LIMITS.maxBilledLb} lb billed. Contact us or pick another method.` };
  }
  return { ok: true };
}

function money(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Quote all UPS Ground Saver legs for a refill method.
 */
export function quoteShippingMethod({
  destZip,
  methodKey = 'ship_own',
  totalWaxOz,
  vesselCount = 1,
  perVesselOz,
  boxKey,
} = {}) {
  const method = SHIPPING_METHODS[methodKey] || SHIPPING_METHODS.ship_own;
  const recommendation = recommendShippingBox({
    totalWaxOz,
    vesselCount,
    perVesselOz,
  });
  const resolved = resolveBoxKey(boxKey) || recommendation.boxKey;
  const box = UPS_BOXES[resolved] || recommendation.box;
  const packedWeight = estimatePackedWeight({
    totalWaxOz,
    vesselCount: recommendation.vesselCount,
    perVesselOz,
    boxKey: box.key,
  });

  const zipOk = isValidDestZip(destZip);
  if (!zipOk) {
    return {
      ok: false,
      needsZip: true,
      method,
      box,
      packedWeight,
      recommendation,
      reason: 'Enter your 5-digit ZIP to estimate UPS shipping.',
      shippingCostUsd: 0,
      legs: [],
    };
  }

  if (method.key === 'prepaid_labels') {
    const cap = method3Allowed(box, packedWeight);
    if (!cap.ok) {
      return {
        ok: false,
        method,
        box,
        packedWeight,
        recommendation,
        reason: cap.reason,
        shippingCostUsd: 0,
        legs: [],
      };
    }
  }

  const legs = [];
  const addLeg = (key, title, billedLb, residential) => {
    const q = quoteGroundSaverLeg({ destZip, billedLb, residential });
    if (!q.ok) {
      return q;
    }
    legs.push({
      key,
      title,
      billedLb: q.billedLb,
      zone: q.zone,
      baseUsd: q.baseUsd,
      fuelUsd: q.fuelUsd,
      residentialUsd: q.residentialUsd,
      totalUsd: money(q.totalUsd),
      label: q.label,
    });
    return { ok: true };
  };

  if (method.key === 'kit_roundtrip') {
    const kit = addLeg(
      'kit_out',
      'Packing kit to you',
      packedWeight.kitBilledLb,
      true
    );
    if (!kit.ok) {
      return { ok: false, method, box, packedWeight, recommendation, reason: kit.reason, shippingCostUsd: 0, legs };
    }
  }

  if (method.key === 'kit_roundtrip' || method.key === 'prepaid_labels') {
    const inn = addLeg(
      'empties_in',
      'Empties to The Candle Garden',
      packedWeight.emptiesInboundBilledLb,
      false
    );
    if (!inn.ok) {
      return { ok: false, method, box, packedWeight, recommendation, reason: inn.reason, shippingCostUsd: 0, legs };
    }
  }

  const out = addLeg(
    'refills_out',
    'Refills back to you',
    packedWeight.refillsOutboundBilledLb,
    true
  );
  if (!out.ok) {
    return { ok: false, method, box, packedWeight, recommendation, reason: out.reason, shippingCostUsd: 0, legs };
  }

  const shippingCostUsd = money(legs.reduce((s, l) => s + l.totalUsd, 0));
  const chargeWord = method.chargeCount === 1 ? 'trip' : 'trips';

  return {
    ok: true,
    method,
    box,
    packedWeight,
    recommendation,
    destZip: normalizeZip(destZip),
    zone: legs[0]?.zone,
    legs,
    shippingCostUsd,
    shippingLabel:
      method.key === 'ship_own'
        ? `${SERVICE_NAME} · return shipping to you · ${formatUsd(shippingCostUsd)}`
        : `${SERVICE_NAME} · ${method.chargeCount} ${chargeWord} · ${formatUsd(shippingCostUsd)}`,
    customerNote:
      method.key === 'ship_own'
        ? 'Does not include postage for empties you ship to us.'
        : method.key === 'prepaid_labels'
          ? 'You supply the box. Follow the packing instructions we email with your label.'
          : 'Kit is packing supplies and a carton — not your glass. Glass travels on the later two trips.',
  };
}

export function shippingLineLabel(quoteOrBox) {
  if (quoteOrBox?.shippingLabel) return quoteOrBox.shippingLabel;
  const box = quoteOrBox?.shortName || quoteOrBox?.name;
  return box ? `${SERVICE_NAME} · ${box}` : SERVICE_NAME;
}

export { quoteGroundSaverLeg, formatUsd };
