import { loadRecord, saveRecord } from "./store";
import { site } from "@/lib/site";

export type PhotoSlots = {
  hero: string;
  heroAlt: string;
  about: string;
  aboutAlt: string;
  library: Array<{ url: string; name: string }>;
};

export const defaultPhotos = (): PhotoSlots => ({
  hero: site.hero,
  heroAlt: "The Candle Garden storefront in Atlantic Beach",
  about: site.logo,
  aboutAlt: "The Candle Garden flying pig",
  library: [],
});

export async function getPhotos(): Promise<PhotoSlots> {
  const stored = await loadRecord<Partial<PhotoSlots>>("photos", {});
  return { ...defaultPhotos(), ...stored, library: stored.library || [] };
}

export async function savePhotos(next: PhotoSlots): Promise<PhotoSlots> {
  const cleaned: PhotoSlots = {
    hero: String(next.hero || "").trim() || defaultPhotos().hero,
    heroAlt: String(next.heroAlt || "").trim(),
    about: String(next.about || "").trim() || defaultPhotos().about,
    aboutAlt: String(next.aboutAlt || "").trim(),
    library: (next.library || []).slice(0, 40),
  };
  await saveRecord("photos", cleaned);
  return cleaned;
}
