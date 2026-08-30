import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/shop", "/classes", "/our-story", "/contact"].map((path) => ({
    url: `${site.url}${path}`,
    lastModified: new Date(),
    changeFrequency: path === "/shop" || path === "/classes" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.8,
  }));
}
