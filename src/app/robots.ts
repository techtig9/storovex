import type {MetadataRoute} from "next";
import {siteUrl} from "@/core/config/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: "*",
      allow: "/",
      // Signed-in surfaces have nothing useful to index and shouldn't be crawled.
      disallow: ["/api/", "/dashboard", "/generate", "/billing", "/projects"],
    }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
