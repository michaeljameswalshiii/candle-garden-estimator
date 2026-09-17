export type ZipPlace = { city: string; state: string; zip: string };

/** Resolve US ZIP → city/state for UPS quotes when the estimator only has a ZIP. */
export async function resolveUsZip(zipRaw: string): Promise<ZipPlace | null> {
  const zip = String(zipRaw || "").replace(/\D/g, "").slice(0, 5);
  if (zip.length !== 5) return null;
  try {
    const response = await fetch(`https://api.zippopotam.us/us/${zip}`, {
      cache: "force-cache",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      "post code"?: string;
      places?: Array<{ "place name"?: string; "state abbreviation"?: string }>;
    };
    const place = payload.places?.[0];
    const city = place?.["place name"]?.trim();
    const state = place?.["state abbreviation"]?.trim()?.toUpperCase();
    if (!city || !state || state.length !== 2) return null;
    return { city, state, zip };
  } catch {
    return null;
  }
}
