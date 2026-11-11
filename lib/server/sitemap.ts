// Sitemap detection for the AEO audit.

export type SitemapInfo =
  { kind: "urlset"; count: number } | { kind: "index"; count: number };

/** Reads an XML sitemap or sitemap index, or returns null if it is neither. */
export function sitemapInfo(xml: string): SitemapInfo | null {
  if (/<sitemapindex[\s>]/i.test(xml)) {
    return {
      kind: "index",
      count: (xml.match(/<sitemap[\s>]/gi) ?? []).length,
    };
  }
  if (/<urlset[\s>]/i.test(xml)) {
    return { kind: "urlset", count: (xml.match(/<url[\s>]/gi) ?? []).length };
  }
  return null;
}

/** The `Sitemap:` URLs a robots.txt declares (RFC 9309 allows any number). */
export function robotsSitemaps(robotsTxt: string): string[] {
  return [...robotsTxt.matchAll(/^\s*sitemap:\s*(\S+)/gim)]
    .map((m) => m[1])
    .filter((u) => /^https?:\/\//i.test(u));
}
