import type { MetadataRoute } from "next";
import { isDemoDeploy, siteOrigin, sitemapUrls } from "@/lib/agent-discovery";

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapUrls(isDemoDeploy(), siteOrigin()).map((url) => ({ url }));
}
