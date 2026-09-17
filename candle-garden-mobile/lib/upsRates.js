/**
 * UPS Ground Saver list rates (1 lb+, US 48) and zone lookup from Candle Garden.
 * Table: UPS Ground Saver 1 lb or greater, effective 2026-04-01 (published daily/list).
 * Zones are from origin 32233 (Atlantic Beach, FL). Ground Saver is US 48 only.
 */

export const RATES_AS_OF = '2026-04-01';
export const ORIGIN_ZIP = '32233';
export const ORIGIN_CITY = 'Atlantic Beach, FL';
// The local table is an estimate. Checkout requests live UPS rates and selects
// the lowest service available to the Candle Garden account.
export const SERVICE_NAME = 'Estimated UPS shipping';

/** Residential delivery add-on per package (home addresses only). */
export const RESIDENTIAL_SURCHARGE_USD = 4.65;

/** Applied to the Ground Saver list rate (not residential). Tunable. */
export const FUEL_SURCHARGE_PCT = 0.16;

/**
 * Published Ground Saver USD by billed pound, zones 2–8.
 * Index 0 unused; index = billed pounds.
 */
export const GROUND_SAVER_RATES = {
  2: [null, 13.0, 13.99, 14.54, 14.94, 15.31, 15.44, 16.29, 16.73, 16.98, 21.77, 23.05, 23.27, 23.36, 24.41, 24.43, 25.05, 25.23, 25.5, 26.1, 26.11, 27.23, 27.24, 27.25, 28.22],
  3: [null, 13.51, 15.37, 16.14, 16.25, 16.95, 17.02, 17.39, 18.0, 18.25, 23.38, 23.84, 24.86, 24.94, 25.65, 26.0, 26.94, 27.5, 27.92, 29.19, 29.2, 30.35, 30.86, 31.22, 32.74],
  4: [null, 14.68, 16.71, 17.42, 18.12, 18.55, 18.72, 19.2, 19.86, 19.92, 25.62, 26.1, 26.35, 26.51, 26.91, 27.31, 27.79, 28.11, 28.39, 29.77, 29.82, 31.39, 32.46, 33.19, 34.89],
  5: [null, 15.31, 17.07, 18.27, 19.25, 20.09, 20.17, 20.8, 21.37, 21.55, 28.16, 28.49, 28.74, 29.08, 30.02, 30.86, 31.62, 32.5, 34.05, 35.55, 36.68, 37.39, 38.66, 39.11, 41.47],
  6: [null, 15.82, 17.78, 19.01, 19.77, 20.88, 20.89, 21.26, 22.1, 22.56, 29.14, 29.89, 30.94, 31.91, 33.77, 35.63, 37.07, 38.34, 40.34, 41.37, 42.8, 44.42, 46.23, 47.98, 50.63],
  7: [null, 15.99, 18.43, 19.62, 21.03, 21.97, 21.98, 22.57, 23.45, 24.41, 32.68, 35.25, 36.94, 39.03, 41.98, 42.98, 45.56, 47.53, 49.34, 50.29, 52.16, 53.98, 55.96, 57.31, 59.24],
  8: [null, 16.26, 18.73, 20.56, 21.98, 23.26, 23.27, 24.11, 25.14, 26.46, 36.15, 38.88, 40.39, 42.35, 45.82, 47.94, 50.06, 50.33, 54.25, 56.9, 58.93, 60.72, 63.39, 65.92, 69.67],
};

export const MAX_TABLE_LB = 24;

/**
 * 3-digit ZIP prefix ranges → Ground zone from 32233.
 * Approximate published-chart zones for quoting (not a full UPS zone file).
 * [startPrefix, endPrefix, zone]
 */
const PREFIX_ZONES = [
  [320, 322, 2],
  [323, 326, 2],
  [327, 349, 3],
  [300, 319, 3],
  [350, 369, 3],
  [290, 299, 3],
  [370, 385, 4],
  [386, 397, 4],
  [270, 289, 4],
  [400, 427, 4],
  [700, 714, 4],
  [716, 729, 4],
  [197, 199, 5],
  [200, 268, 5],
  [150, 196, 5],
  [430, 499, 5],
  [500, 528, 5],
  [530, 549, 5],
  [600, 658, 5],
  [660, 679, 5],
  [730, 799, 5],
  [100, 149, 6],
  [70, 89, 6],
  [10, 69, 6],
  [550, 588, 6],
  [680, 693, 6],
  [870, 884, 6],
  [590, 599, 7],
  [800, 838, 7],
  [840, 865, 7],
  [889, 898, 7],
  [900, 961, 8],
  [970, 994, 8],
];

export function normalizeZip(zip) {
  const digits = String(zip || '').replace(/\D/g, '');
  if (digits.length < 5) return '';
  return digits.slice(0, 5);
}

export function isValidDestZip(zip) {
  const z = normalizeZip(zip);
  if (!/^\d{5}$/.test(z)) return false;
  const prefix = Number(z.slice(0, 3));
  if (prefix < 10) return false; // 000–009 unused / PR
  if (prefix >= 90 && prefix <= 99) return false; // APO/FPO
  if (prefix >= 995 && prefix <= 999) return false; // AK
  if (prefix >= 967 && prefix <= 968) return false; // HI
  return prefix <= 994;
}

export function zoneFromDestZip(zip) {
  if (!isValidDestZip(zip)) {
    const z = normalizeZip(zip);
    const prefix = z ? Number(z.slice(0, 3)) : 0;
    if (prefix < 10 || (prefix >= 90 && prefix <= 99) || prefix >= 967) {
      return { ok: false, reason: 'UPS shipping estimates currently cover the 48 contiguous states only.' };
    }
    return { ok: false, reason: 'Enter a 5-digit U.S. ZIP to estimate UPS shipping.' };
  }
  const z = normalizeZip(zip);
  const prefix = Number(z.slice(0, 3));
  for (const [start, end, zone] of PREFIX_ZONES) {
    if (prefix >= start && prefix <= end) {
      return { ok: true, zone, zip: z, originZip: ORIGIN_ZIP };
    }
  }
  return { ok: true, zone: 5, zip: z, originZip: ORIGIN_ZIP, inferred: true };
}

export function groundSaverBaseUsd(zone, billedLb) {
  const z = Math.min(8, Math.max(2, Number(zone) || 5));
  const lb = Math.min(MAX_TABLE_LB, Math.max(1, Math.ceil(Number(billedLb) || 1)));
  const row = GROUND_SAVER_RATES[z];
  const base = row && row[lb];
  if (base == null) return null;
  return { zone: z, billedLb: lb, baseUsd: base };
}

/**
 * One Ground Saver package: list rate + residential surcharge.
 * @returns {{ ok: boolean, zone?: number, billedLb?: number, baseUsd?: number, residentialUsd?: number, totalUsd?: number, label?: string, reason?: string }}
 */
export function quoteGroundSaverLeg({ destZip, billedLb, residential = true } = {}) {
  if (billedLb > MAX_TABLE_LB) {
    return {
      ok: false,
      reason: `This pack is over ${MAX_TABLE_LB} lb billed — contact us for a custom quote.`,
    };
  }
  const zoned = zoneFromDestZip(destZip);
  if (!zoned || !zoned.ok) {
    return { ok: false, reason: zoned?.reason || 'Enter a 5-digit U.S. ZIP to estimate UPS shipping.' };
  }
  const rated = groundSaverBaseUsd(zoned.zone, billedLb);
  if (!rated) {
    return { ok: false, reason: 'Could not rate this package.' };
  }
  const fuelUsd = Math.round(rated.baseUsd * FUEL_SURCHARGE_PCT * 100) / 100;
  const residentialUsd = residential ? RESIDENTIAL_SURCHARGE_USD : 0;
  const totalUsd = rated.baseUsd + fuelUsd + residentialUsd;
  return {
    ok: true,
    zone: rated.zone,
    billedLb: rated.billedLb,
    baseUsd: rated.baseUsd,
    fuelUsd,
    fuelPct: FUEL_SURCHARGE_PCT,
    residentialUsd,
    totalUsd,
    destZip: zoned.zip,
    label: `${SERVICE_NAME} zone ${rated.zone} · ${rated.billedLb} lb`,
  };
}

export function formatUsd(n) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}
