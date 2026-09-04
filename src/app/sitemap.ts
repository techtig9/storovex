import type {MetadataRoute} from "next";
import {siteUrl} from "@/core/config/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  // Public pages only. Anything behind auth is intentionally absent.
  return [
    {url: base, changeFrequency: "weekly", priority: 1},
    {url: `${base}/pricing`, changeFrequency: "monthly", priority: 0.8},
    {url: `${base}/login`, changeFrequency: "yearly", priority: 0.3},
    {url: `${base}/signup`, changeFrequency: "yearly", priority: 0.5},
  ];
}
