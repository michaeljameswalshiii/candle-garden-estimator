import approvedScents from "./refill-scents.json";
export type RefillScent = { id: string; name: string; notes: string };
export type VesselScent = { vessel: number; description: string; ounces: number; scentId: string; scentName: string };

export function refillScents(_products: any[] = []): RefillScent[] {
  return approvedScents.map(scent => ({ id: `refill:${scent.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, name: scent.name, notes: scent.notes }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function estimateVessels(result: any): { description: string; ounces: number }[] {
  if (!result) return [];
  const source = Array.isArray(result.vessels) && result.vessels.length ? result.vessels : [{ wax_needed_oz: result.estimated_ounces }];
  return source.map((vessel: any, index: number) => ({ description: String(vessel.description || `Vessel ${index + 1}`), ounces: Number(vessel.wax_needed_oz ?? vessel.estimated_ounces ?? vessel.volume_oz ?? Number(result.estimated_ounces) / source.length) }));
}

export function vesselScentChoices(vessels: ReturnType<typeof estimateVessels>, selected: string[], scents: RefillScent[]): VesselScent[] {
  return vessels.map((vessel, index) => {
    const scent = scents.find(option => option.id === selected[index]);
    if (!scent) throw new Error(`Choose a scent for vessel ${index + 1}.`);
    return { vessel: index + 1, description: vessel.description, ounces: vessel.ounces, scentId: scent.id, scentName: scent.name };
  });
}

// Accept legacy app orders without this field; validate every selection from newer apps.
export function validateVesselScents(raw: unknown, count: number, products: any[]): VesselScent[] | undefined {
  if (raw === undefined) return undefined;
  if (!Number.isInteger(count) || count < 1 || count > 100 || !Array.isArray(raw) || raw.length !== count) throw new Error("Choose a scent for every vessel.");
  const scents = refillScents(products);
  return raw.map((entry, index) => {
    const scent = scents.find(option => option.id === entry?.scentId);
    const ounces = Number(entry?.ounces);
    if (!scent) throw new Error(`The scent for vessel ${index + 1} is unavailable. Please choose again.`);
    if (!Number.isFinite(ounces) || ounces <= 0 || ounces > 10000) throw new Error("One or more vessel volumes are invalid.");
    return { vessel: index + 1, description: String(entry.description || `Vessel ${index + 1}`).slice(0, 160), ounces, scentId: scent.id, scentName: scent.name };
  });
}

export function refillScentKey(vessels: VesselScent[] = []): string {
  return JSON.stringify(vessels.map(vessel => [vessel.description, vessel.ounces, vessel.scentId]));
}

export function scentSummary(vessels: VesselScent[] = []): string {
  return vessels.map(vessel => `Vessel ${vessel.vessel}: ${vessel.scentName} (${vessel.ounces} oz)`).join(" · ");
}
