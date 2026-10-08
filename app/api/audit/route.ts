import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertPublicHttpUrl } from "@/lib/server/ssrf";
import { AI_CRAWLERS, isAllowed, parseRobots } from "@/lib/server/robots";

export const runtime = "nodejs";

const bodySchema = z.object({
  url: z.string().url(),
});

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Check = {
  id: string;
  label: string;
  category: "discovery" | "structure" | "content" | "technical" | "rendering";
  pass: boolean;
  value: string;
  detail: string;
};

async function tryFetch(
  url: string,
): Promise<{ ok: boolean; text: string; status: number }> {
  let current = url;
  try {
    // Follow redirects manually so we can re-validate every hop — a public URL
    // that 30x-redirects to an internal address must not slip past the SSRF guard.
    for (let hop = 0; hop < 4; hop++) {
      await assertPublicHttpUrl(current);
      const res = await fetch(current, {
        headers: { "User-Agent": "GEO-AEO-Tracker/1.0" },
        cache: "no-store",
        redirect: "manual",
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return { ok: false, text: "", status: res.status };
        current = new URL(loc, current).toString();
        continue;
      }
      const text = res.ok ? await res.text() : "";
      return { ok: res.ok, text, status: res.status };
    }
    return { ok: false, text: "", status: 0 }; // too many redirects
  } catch {
    return { ok: false, text: "", status: 0 };
  }
}

export async function POST(req: NextRequest) {
  try {
    const { url } = bodySchema.parse(await req.json());
    // SSRF guard: reject internal/reserved targets before any server-side fetch.
    const target = await assertPublicHttpUrl(url);
    const checks: Check[] = [];

    // ── Fetch the page ─────────────────────────────────
    const pageRes = await tryFetch(url);
    if (!pageRes.ok) {
      return NextResponse.json(
        { error: `Unable to fetch page (${pageRes.status})` },
        { status: 400 },
      );
    }
    const html = pageRes.text;
    const plain = stripHtml(html);

    // ── Parallel fetches ───────────────────────────────
    const [llmsRes, llmsFullRes, robotsRes, sitemapRes] = await Promise.all([
      tryFetch(`${target.origin}/llms.txt`),
      tryFetch(`${target.origin}/llms-full.txt`),
      tryFetch(`${target.origin}/robots.txt`),
      tryFetch(`${target.origin}/sitemap.xml`),
    ]);

    // ═══════════════════════════════════════════════════
    // CATEGORY: DISCOVERY
    // ═══════════════════════════════════════════════════

    // 1. llms.txt
    checks.push({
      id: "llms_txt",
      label: "llms.txt",
      category: "discovery",
      pass: llmsRes.ok,
      value: llmsRes.ok ? "Present" : "Missing",
      detail: llmsRes.ok
        ? `Found at ${target.origin}/llms.txt (${llmsRes.text.length} bytes)`
        : "No llms.txt file found. This file tells AI models about your site\u2019s purpose and preferred content.",
    });

    // 2. llms-full.txt
    checks.push({
      id: "llms_full_txt",
      label: "llms-full.txt",
      category: "discovery",
      pass: llmsFullRes.ok,
      value: llmsFullRes.ok ? "Present" : "Missing",
      detail: llmsFullRes.ok
        ? `Found at ${target.origin}/llms-full.txt (${llmsFullRes.text.length} bytes)`
        : "No llms-full.txt found. This extended file provides detailed context for AI models.",
    });

    // 3. robots.txt - AI crawler access for this page's path
    // Per RFC 9309 a 4xx robots.txt means "no restrictions"; a 5xx or network
    // failure leaves access unknown, so we report it instead of guessing.
    const robotsMissing = robotsRes.status >= 400 && robotsRes.status < 500;
    const robotsReadable = robotsRes.ok || robotsMissing;
    const robotsGroups = robotsRes.ok ? parseRobots(robotsRes.text) : [];
    const pagePath = `${target.pathname}${target.search}`;
    const blockedCrawlers = AI_CRAWLERS.filter(
      (c) => robotsReadable && !isAllowed(robotsGroups, c.token, pagePath),
    );
    const blockedAnswer = blockedCrawlers.filter((c) => c.purpose === "answers");
    const blockedTraining = blockedCrawlers.filter(
      (c) => c.purpose === "training",
    );
    const answerCrawlerCount = AI_CRAWLERS.filter(
      (c) => c.purpose === "answers",
    ).length;
    checks.push({
      id: "robots_ai_access",
      label: "AI Crawler Access (robots.txt)",
      category: "discovery",
      // Only answer-engine crawlers decide whether this page can appear in AI
      // answers; blocking training-only crawlers is a legitimate opt-out.
      pass: robotsReadable && blockedAnswer.length === 0,
      value: !robotsReadable
        ? `Unreadable (${robotsRes.status || "network error"})`
        : blockedAnswer.length > 0
          ? `${blockedAnswer.length} of ${answerCrawlerCount} answer crawlers blocked`
          : robotsMissing
            ? "No robots.txt (all allowed)"
            : "All answer crawlers allowed",
      detail: !robotsReadable
        ? `Could not read ${target.origin}/robots.txt. Crawlers treat an unreachable robots.txt as “do not crawl”, so fix this first.`
        : [
            blockedAnswer.length > 0
              ? `Blocked for ${pagePath}: ${blockedAnswer.map((c) => `${c.token} (${c.powers})`).join(", ")}. This page cannot appear in those engines’ answers.`
              : robotsMissing
                ? "No robots.txt found — every AI crawler may crawl this page."
                : `Every answer-engine crawler (ChatGPT, Perplexity, Claude, Google, Copilot) may crawl ${pagePath}.`,
            blockedTraining.length > 0
              ? `Training-only crawlers blocked (does not affect AI answers): ${blockedTraining.map((c) => c.token).join(", ")}.`
              : "",
          ]
            .filter(Boolean)
            .join(" "),
    });

    // 4. Sitemap
    const hasSitemap = sitemapRes.ok && sitemapRes.text.includes("<url");
    const sitemapUrlCount = (sitemapRes.text.match(/<url>/gi) ?? []).length;
    checks.push({
      id: "sitemap",
      label: "XML Sitemap",
      category: "discovery",
      pass: hasSitemap,
      value: hasSitemap ? `${sitemapUrlCount} URLs` : "Missing",
      detail: hasSitemap
        ? `Sitemap found with ${sitemapUrlCount} URL entries.`
        : "No sitemap.xml found. A sitemap helps AI systems discover and index your pages.",
    });

    // ═══════════════════════════════════════════════════
    // CATEGORY: STRUCTURE
    // ═══════════════════════════════════════════════════

    // 5. JSON-LD Structured Data
    const jsonLdBlocks =
      html.match(
        /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
      ) ?? [];
    const schemaTypes: string[] = [];
    for (const block of jsonLdBlocks) {
      const inner = block.replace(/<script[^>]*>|<\/script>/gi, "");
      try {
        const parsed = JSON.parse(inner);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
          if (item?.["@type"]) {
            const types = Array.isArray(item["@type"])
              ? item["@type"]
              : [item["@type"]];
            schemaTypes.push(...types);
          }
        }
      } catch {
        /* skip invalid JSON-LD */
      }
    }
    checks.push({
      id: "json_ld",
      label: "JSON-LD Structured Data",
      category: "structure",
      pass: jsonLdBlocks.length > 0,
      value:
        jsonLdBlocks.length > 0
          ? `${jsonLdBlocks.length} blocks (${schemaTypes.length} types)`
          : "None found",
      detail:
        schemaTypes.length > 0
          ? `Schema types: ${[...new Set(schemaTypes)].join(", ")}`
          : "No JSON-LD structured data found. Add Organization, Product, FAQPage, or Article schema.",
    });

    // 6. FAQ Schema
    const hasFaqSchema = schemaTypes.some((t) => /faq/i.test(t));
    const hasFaqHtml =
      /<details|<summary|class="faq"|id="faq"|class="accordion"/i.test(html);
    checks.push({
      id: "faq_schema",
      label: "FAQ / Q&A Schema",
      category: "structure",
      pass: hasFaqSchema || hasFaqHtml,
      value: hasFaqSchema
        ? "Schema present"
        : hasFaqHtml
          ? "HTML only (no schema)"
          : "Missing",
      detail: hasFaqSchema
        ? "FAQPage schema found \u2014 AI models can extract Q&A pairs."
        : hasFaqHtml
          ? "FAQ-like HTML elements found but no FAQPage schema markup. Add JSON-LD FAQPage schema."
          : "No FAQ content or schema detected. FAQ schema dramatically improves AI answer citations.",
    });

    // 7. Open Graph Tags
    const ogTags =
      html.match(/<meta[^>]*property=["']og:[^"']*["'][^>]*>/gi) ?? [];
    const ogTitle = /og:title/i.test(html);
    const ogDesc = /og:description/i.test(html);
    const ogImage = /og:image/i.test(html);
    const ogComplete = ogTitle && ogDesc && ogImage;
    checks.push({
      id: "open_graph",
      label: "Open Graph Tags",
      category: "structure",
      pass: ogComplete,
      value: `${ogTags.length} tags${ogComplete ? " (complete)" : ""}`,
      detail: ogComplete
        ? "og:title, og:description, and og:image all present."
        : `Missing: ${[!ogTitle && "og:title", !ogDesc && "og:description", !ogImage && "og:image"].filter(Boolean).join(", ")}. OG tags help AI tools preview and cite your content.`,
    });

    // 8. Meta Description
    const metaDescMatch = html.match(
      /<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i,
    );
    const metaDesc = metaDescMatch?.[1] ?? "";
    const metaDescOk = metaDesc.length >= 50 && metaDesc.length <= 300;
    checks.push({
      id: "meta_description",
      label: "Meta Description",
      category: "structure",
      pass: metaDescOk,
      value: metaDesc ? `${metaDesc.length} chars` : "Missing",
      detail: metaDesc
        ? metaDescOk
          ? `Good length (${metaDesc.length} chars): "${metaDesc.slice(0, 100)}\u2026"`
          : `Length ${metaDesc.length} chars \u2014 ${metaDesc.length < 50 ? "too short" : "too long"}. Aim for 50\u2013160 characters.`
        : "No meta description found. AI tools use this as a content summary.",
    });

    // 9. Canonical Tag
    const hasCanonical = /<link[^>]*rel=["']canonical["']/i.test(html);
    checks.push({
      id: "canonical",
      label: "Canonical Tag",
      category: "structure",
      pass: hasCanonical,
      value: hasCanonical ? "Present" : "Missing",
      detail: hasCanonical
        ? "Canonical tag found \u2014 helps prevent duplicate content issues."
        : "No canonical tag. Add one to ensure AI models reference the correct URL.",
    });

    // ═══════════════════════════════════════════════════
    // CATEGORY: CONTENT
    // ═══════════════════════════════════════════════════

    // 10. BLUF / Direct-Answer Style
    const firstChunkLen = Math.max(plain.length * 0.2, 400);
    const firstChunk = plain.slice(0, Math.floor(firstChunkLen));
    const bulletCount = (html.match(/<li\b/gi) ?? []).length;
    const hasDirectAnswer =
      /\b(in short|tl;dr|summary|key takeaways|bottom line|the answer is|here('?s| is) (what|how|why))\b/i.test(
        firstChunk,
      );
    const blufScore = Math.min(
      1,
      (Number(hasDirectAnswer) +
        Number(bulletCount > 3) +
        Number(firstChunk.length > 100)) /
        2,
    );
    checks.push({
      id: "bluf_style",
      label: "BLUF / Direct-Answer Style",
      category: "content",
      pass: blufScore >= 0.5,
      value: `${Math.round(blufScore * 100)}%`,
      detail: hasDirectAnswer
        ? "Content leads with a direct answer \u2014 good for AI citation."
        : "Content doesn\u2019t lead with a clear direct answer. Start with a BLUF (Bottom Line Up Front) statement.",
    });

    // 11. Heading Hierarchy
    const h1Count = (html.match(/<h1[\s>]/gi) ?? []).length;
    const h2Count = (html.match(/<h2[\s>]/gi) ?? []).length;
    const h3Count = (html.match(/<h3[\s>]/gi) ?? []).length;
    const headingOk = h1Count === 1 && h2Count >= 2;
    checks.push({
      id: "heading_hierarchy",
      label: "Heading Hierarchy",
      category: "content",
      pass: headingOk,
      value: `H1:${h1Count} H2:${h2Count} H3:${h3Count}`,
      detail:
        h1Count === 0
          ? "No H1 tag found. Every page should have exactly one H1."
          : h1Count > 1
            ? `${h1Count} H1 tags found \u2014 use exactly one. AI models use H1 as primary topic signal.`
            : h2Count < 2
              ? "Only 1 H2 or none. Use H2 subheadings to break content into scannable sections."
              : "Good heading hierarchy \u2014 single H1 with multiple H2/H3 subheadings.",
    });

    // 12. Content Length
    const wordCount = plain.split(/\s+/).filter(Boolean).length;
    const contentLengthOk = wordCount >= 300;
    checks.push({
      id: "content_length",
      label: "Content Depth",
      category: "content",
      pass: contentLengthOk,
      value: `${wordCount.toLocaleString()} words`,
      detail: contentLengthOk
        ? wordCount > 2000
          ? "Comprehensive content \u2014 great for in-depth AI citations."
          : "Adequate content length for AI answer extraction."
        : "Thin content \u2014 AI models prefer pages with 300+ words for citation. Add more substance.",
    });

    // 13. Internal Links
    const internalLinkPattern = new RegExp(
      `<a[^>]*href=["'](?:https?://(?:www\\.)?${target.hostname.replace(/\./g, "\\.")})?/[^"']*["']`,
      "gi",
    );
    const internalLinks = (html.match(internalLinkPattern) ?? []).length;
    const internalLinkOk = internalLinks >= 3;
    checks.push({
      id: "internal_links",
      label: "Internal Links",
      category: "content",
      pass: internalLinkOk,
      value: `${internalLinks} links`,
      detail: internalLinkOk
        ? "Good internal linking \u2014 helps AI models discover related content."
        : "Few internal links. Add 3+ contextual internal links to help AI models map your content.",
    });

    // ═══════════════════════════════════════════════════
    // CATEGORY: TECHNICAL
    // ═══════════════════════════════════════════════════

    // 14. HTTPS
    const isHttps = target.protocol === "https:";
    checks.push({
      id: "https",
      label: "HTTPS",
      category: "technical",
      pass: isHttps,
      value: isHttps ? "Yes" : "No",
      detail: isHttps
        ? "Site uses HTTPS \u2014 required for trust signals."
        : "Site is not using HTTPS. This hurts trust and AI citation likelihood.",
    });

    // 15. Page Size
    const pageSizeKb = Math.round(html.length / 1024);
    const pageSizeOk = pageSizeKb < 500;
    checks.push({
      id: "page_size",
      label: "Page Size",
      category: "technical",
      pass: pageSizeOk,
      value: `${pageSizeKb} KB`,
      detail: pageSizeOk
        ? "Page size is reasonable for fast loading."
        : "Page is large (>500 KB). Heavy pages may timeout AI crawlers.",
    });

    // 16. Language Tag
    const langMatch = html.match(/<html[^>]*lang=["']([^"']+)["']/i);
    const hasLang = !!langMatch;
    checks.push({
      id: "lang_tag",
      label: "Language Attribute",
      category: "technical",
      pass: hasLang,
      value: hasLang ? langMatch![1] : "Missing",
      detail: hasLang
        ? `Language set to "${langMatch![1]}" \u2014 helps AI models serve correct language results.`
        : 'No lang attribute on <html>. Add lang="en" (or your language) for AI localization.',
    });

    // ═══════════════════════════════════════════════════
    // CATEGORY: RENDERING (SSR)
    // LLM bots cannot execute JavaScript — if a page
    // relies on client-side rendering, bots see a blank page.
    // ═══════════════════════════════════════════════════

    // 17. Client-Side Rendering Detection
    // Check if the page has very little text relative to HTML size,
    // combined with signals of JS frameworks that render client-side.
    const csrFrameworkSignals = [
      {
        name: "React CSR",
        pattern: /<div\s+id=["'](root|app|__next)["'][^>]*>\s*<\/div>/i,
      },
      {
        name: "Vue CSR",
        pattern: /<div\s+id=["'](app|__vue_app__)["'][^>]*>\s*<\/div>/i,
      },
      { name: "Angular", pattern: /<app-root[^>]*>\s*<\/app-root>/i },
      { name: "Svelte", pattern: /<div\s+id=["']svelte["'][^>]*>\s*<\/div>/i },
    ];
    const detectedCsrFrameworks = csrFrameworkSignals
      .filter((s) => s.pattern.test(html))
      .map((s) => s.name);
    // A page with SSR should have substantial text content even without JS
    const textToHtmlRatio = plain.length / Math.max(html.length, 1);
    const hasMinimalContent = plain.length < 200 && html.length > 2000;
    const likelyCsr =
      detectedCsrFrameworks.length > 0 &&
      (hasMinimalContent || textToHtmlRatio < 0.02);
    // Also check for __NEXT_DATA__ (Next.js SSR marker) or data-reactroot (React SSR)
    const hasNextData = /__NEXT_DATA__/i.test(html);
    const hasReactRoot = /data-reactroot/i.test(html);
    const hasSsrMarkers = hasNextData || hasReactRoot;
    const csrCheckPass = !likelyCsr || hasSsrMarkers;
    checks.push({
      id: "csr_detection",
      label: "Client-Side Rendering",
      category: "rendering",
      pass: csrCheckPass,
      value: likelyCsr
        ? hasSsrMarkers
          ? "CSR detected but SSR markers present"
          : `Likely CSR (${detectedCsrFrameworks.join(", ")})`
        : "Server-rendered",
      detail:
        likelyCsr && !hasSsrMarkers
          ? `Detected ${detectedCsrFrameworks.join(", ")} with minimal server-rendered text (${plain.length} chars, ${(textToHtmlRatio * 100).toFixed(1)}% text ratio). LLM bots like GPTBot, ClaudeBot, and PerplexityBot cannot execute JavaScript — they will see a blank page. Use SSR or SSG.`
          : likelyCsr && hasSsrMarkers
            ? `Framework detected (${detectedCsrFrameworks.join(", ")}) but SSR markers found (${[hasNextData && "__NEXT_DATA__", hasReactRoot && "data-reactroot"].filter(Boolean).join(", ")}). Content appears to be server-rendered.`
            : `Page content is server-rendered (${plain.length.toLocaleString()} chars text, ${(textToHtmlRatio * 100).toFixed(1)}% text ratio). LLM bots can read this content.`,
    });

    // 18. Noscript Fallback
    const hasNoscript = /<noscript[\s>]/i.test(html);
    const noscriptContent =
      html.match(/<noscript[^>]*>([\s\S]*?)<\/noscript>/i)?.[1] ?? "";
    const noscriptHasContent = stripHtml(noscriptContent).length > 20;
    checks.push({
      id: "noscript_fallback",
      label: "Noscript Fallback",
      category: "rendering",
      pass: hasNoscript && noscriptHasContent,
      value: hasNoscript
        ? noscriptHasContent
          ? "Has content"
          : "Empty/minimal"
        : "Missing",
      detail:
        hasNoscript && noscriptHasContent
          ? "Good — <noscript> tag with meaningful fallback content. Bots that don't execute JS can still get context."
          : hasNoscript
            ? "<noscript> tag exists but contains minimal content. Add a meaningful fallback message or link for non-JS environments."
            : "No <noscript> tag found. Add one with fallback content — LLM bots and crawlers that don't run JS will benefit from this.",
    });

    // 19. JavaScript Bundle Weight
    const scriptTags =
      html.match(/<script[^>]*src=["'][^"']+["'][^>]*>/gi) ?? [];
    const inlineScripts =
      html.match(/<script(?![^>]*src=)[\s\S]*?<\/script>/gi) ?? [];
    const totalInlineScriptSize = inlineScripts.reduce(
      (sum, s) => sum + s.length,
      0,
    );
    const externalScriptCount = scriptTags.length;
    // Heuristic: more than 15 external scripts or massive inline JS suggests heavy client-side app
    const jsHeavy = externalScriptCount > 15 || totalInlineScriptSize > 100_000;
    checks.push({
      id: "js_bundle_weight",
      label: "JavaScript Weight",
      category: "rendering",
      pass: !jsHeavy,
      value: `${externalScriptCount} external, ${Math.round(totalInlineScriptSize / 1024)}KB inline`,
      detail: jsHeavy
        ? `Heavy JS detected: ${externalScriptCount} external scripts and ${Math.round(totalInlineScriptSize / 1024)}KB inline JS. Pages with heavy JavaScript are likely CSR-dependent. LLM bots will timeout or see partial content. Consider reducing JS or implementing SSR.`
        : `Reasonable JS footprint: ${externalScriptCount} external scripts, ${Math.round(totalInlineScriptSize / 1024)}KB inline. This should not block LLM bot crawling.`,
    });

    // 20. Server-Rendered Content Quality
    // Even if a page passes CSR checks, we want to ensure the server-rendered HTML
    // contains enough meaningful content for bots to extract value from.
    const serverContentLen = plain.length;
    const hasSemanticHtml = /<(article|main|section)[\s>]/i.test(html);
    const hasDataAttributes = /data-(testid|cy|component)/i.test(html);
    const serverContentOk =
      serverContentLen > 500 && (hasSemanticHtml || !hasDataAttributes);
    checks.push({
      id: "server_content_quality",
      label: "Server-Rendered Content Quality",
      category: "rendering",
      pass: serverContentOk,
      value: serverContentOk
        ? `${serverContentLen.toLocaleString()} chars`
        : `Only ${serverContentLen} chars`,
      detail: serverContentOk
        ? `Server-rendered HTML contains ${serverContentLen.toLocaleString()} characters of text content${hasSemanticHtml ? " with semantic HTML elements (article/main/section)" : ""}. LLM bots can extract meaningful information.`
        : serverContentLen <= 500
          ? `Very little server-rendered text (${serverContentLen} chars). LLM bots see the initial HTML without JavaScript — ensure your key content is rendered server-side, not injected by JS.`
          : "Server-rendered HTML lacks semantic structure. Use <article>, <main>, or <section> elements to help bots identify key content areas.",
    });

    // ── Compute score ──────────────────────────────────
    const passed = checks.filter((c) => c.pass).length;
    const score = Math.round((passed / checks.length) * 100);

    // Legacy compat
    const schemaMentions =
      jsonLdBlocks.length + (html.match(/schema\.org/gi) ?? []).length;

    return NextResponse.json({
      url,
      score,
      checks,
      llmsTxtPresent: llmsRes.ok,
      schemaMentions,
      blufDensity: blufScore,
      pass: {
        llmsTxt: llmsRes.ok,
        schema: schemaMentions > 0,
        bluf: blufScore >= 0.5,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
