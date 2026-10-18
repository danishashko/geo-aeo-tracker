import { useMemo, useState, useCallback } from "react";
import type { ScrapeRun } from "@/components/dashboard/types";
import { PROVIDER_LABELS, type Provider } from "@/components/dashboard/types";

type CitationOpportunitiesTabProps = {
  runs: ScrapeRun[];
  brandWebsites?: string[];
};

type Opportunity = {
  url: string;
  domain: string;
  citationCount: number;
  prompts: string[];
  providers: Provider[];
  competitorsMentioned: string[];
  highPriority: boolean;
};

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type SortKey = "citations" | "prompts" | "competitors" | "domain";

export function CitationOpportunitiesTab({ runs, brandWebsites = [] }: CitationOpportunitiesTabProps) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("citations");
  const [expandedOpp, setExpandedOpp] = useState<Record<string, boolean>>({});
  const [view, setView] = useState<"domain" | "url">("domain");

  const brandDomains = useMemo(() => new Set(brandWebsites.map((w) => extractDomain(w)).filter(Boolean)), [brandWebsites]);

  // Core computation: find opportunities
  const opportunities = useMemo(() => {
    const qualifyingRuns = runs.filter(
      (r) =>
        r.sources.length > 0 &&
        ((r.brandMentions?.length ?? 0) === 0 || r.sentiment === "not-mentioned"),
    );

    const urlMap = new Map<
      string,
      { count: number; prompts: Set<string>; providers: Set<Provider>; competitors: Set<string>; hasCompetitorRun: boolean }
    >();

    qualifyingRuns.forEach((run) => {
      run.sources.forEach((source) => {
        const domain = extractDomain(source);
        if (brandDomains.size > 0 && brandDomains.has(domain)) return;
        const existing = urlMap.get(source) ?? {
          count: 0,
          prompts: new Set<string>(),
          providers: new Set<Provider>(),
          competitors: new Set<string>(),
          hasCompetitorRun: false,
        };
        existing.count++;
        existing.prompts.add(run.prompt);
        existing.providers.add(run.provider);
        if (run.competitorMentions?.length > 0) {
          existing.hasCompetitorRun = true;
          run.competitorMentions.forEach((c) => existing.competitors.add(c));
        }
        urlMap.set(source, existing);
      });
    });

    return [...urlMap.entries()]
      .map(([url, data]) => ({
        url,
        domain: extractDomain(url),
        citationCount: data.count,
        prompts: [...data.prompts],
        providers: [...data.providers],
        competitorsMentioned: [...data.competitors],
        highPriority: data.hasCompetitorRun,
      }))
      .sort((a, b) => {
        if (a.highPriority !== b.highPriority) return a.highPriority ? -1 : 1;
        return b.citationCount - a.citationCount;
      });
  }, [runs, brandDomains]);

  // Domain-grouped view
  const domainGroups = useMemo(() => {
    const m = new Map<
      string,
      { urls: Opportunity[]; totalCitations: number; competitors: Set<string>; prompts: Set<string>; hasHighPriority: boolean }
    >();
    opportunities.forEach((opp) => {
      const existing = m.get(opp.domain) ?? {
        urls: [],
        totalCitations: 0,
        competitors: new Set<string>(),
        prompts: new Set<string>(),
        hasHighPriority: false,
      };
      existing.urls.push(opp);
      existing.totalCitations += opp.citationCount;
      opp.competitorsMentioned.forEach((c) => existing.competitors.add(c));
      opp.prompts.forEach((p) => existing.prompts.add(p));
      if (opp.highPriority) existing.hasHighPriority = true;
      m.set(opp.domain, existing);
    });
    return [...m.entries()]
      .map(([domain, data]) => ({
        domain,
        urls: data.urls,
        totalCitations: data.totalCitations,
        competitors: [...data.competitors],
        prompts: [...data.prompts],
        hasHighPriority: data.hasHighPriority,
      }))
      .sort((a, b) => {
        if (a.hasHighPriority !== b.hasHighPriority) return a.hasHighPriority ? -1 : 1;
        return b.totalCitations - a.totalCitations;
      });
  }, [opportunities]);

  // Filter + sort
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (view === "domain") {
      let list = domainGroups.filter(
        (d) => !q || d.domain.includes(q) || d.prompts.some((p) => p.toLowerCase().includes(q)) || d.competitors.some((c) => c.toLowerCase().includes(q)),
      );
      if (sortBy === "domain") list = list.sort((a, b) => a.domain.localeCompare(b.domain));
      else if (sortBy === "prompts") list = list.sort((a, b) => b.prompts.length - a.prompts.length);
      else if (sortBy === "competitors") list = list.sort((a, b) => b.competitors.length - a.competitors.length);
      return list;
    }
    let urlList = opportunities.filter(
      (o) => !q || o.url.toLowerCase().includes(q) || o.competitorsMentioned.some((c) => c.toLowerCase().includes(q)),
    );
    if (sortBy === "domain") urlList = urlList.sort((a, b) => a.domain.localeCompare(b.domain));
    else if (sortBy === "prompts") urlList = urlList.sort((a, b) => b.prompts.length - a.prompts.length);
    else if (sortBy === "competitors") urlList = urlList.sort((a, b) => b.competitorsMentioned.length - a.competitorsMentioned.length);
    return urlList;
  }, [search, view, domainGroups, opportunities, sortBy]);

  // Stats
  const stats = useMemo(() => {
    const uniqueCompetitors = new Set(opportunities.flatMap((o) => o.competitorsMentioned)).size;
    const highPriorityCount = opportunities.filter((o) => o.highPriority).length;
    return {
      totalOpportunities: opportunities.length,
      uniqueDomains: domainGroups.length,
      uniqueCompetitors,
      highPriorityCount,
    };
  }, [opportunities, domainGroups]);

  const exportCsv = useCallback(() => {
    let csv = "Domain,URL,Citations,Prompts,Providers,Competitors Mentioned,Priority\n";
    opportunities.forEach((opp) => {
      csv += `"${opp.domain}","${opp.url}",${opp.citationCount},"${opp.prompts.join(" | ")}","${opp.providers.join(", ")}","${opp.competitorsMentioned.join(", ")}","${opp.highPriority ? "High" : "Standard"}"\n`;
    });
    downloadCsv(`citation-opportunities-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }, [opportunities]);

  if (opportunities.length === 0) {
    return (
      <div className="rounded-lg border border-th-border bg-th-card-alt p-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-th-accent-soft">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-th-text-accent">
            <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
            <path d="M9 18h6" /><path d="M10 22h4" />
          </svg>
        </div>
        <p className="text-sm font-medium text-th-text">No citation opportunities found yet</p>
        <p className="mt-1 text-sm text-th-text-secondary">
          Run prompts to discover URLs that AI models cite in responses where your brand isn&apos;t mentioned. These are high-value outreach targets.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Header: stats + controls ── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <Stat label="Opportunities" value={stats.totalOpportunities} accent />
          <Stat label="Domains" value={stats.uniqueDomains} />
          {stats.highPriorityCount > 0 && (
            <Stat label="High Priority" value={stats.highPriorityCount} danger />
          )}
          {stats.uniqueCompetitors > 0 && (
            <Stat label="Competitors" value={stats.uniqueCompetitors} />
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-md border border-th-border text-xs">
            <button
              onClick={() => setView("domain")}
              className={`px-2.5 py-1 rounded-l-md transition-colors ${view === "domain" ? "bg-th-accent-soft text-th-text font-medium" : "text-th-text-muted hover:text-th-text-secondary"}`}
            >
              Domains
            </button>
            <button
              onClick={() => setView("url")}
              className={`px-2.5 py-1 rounded-r-md transition-colors ${view === "url" ? "bg-th-accent-soft text-th-text font-medium" : "text-th-text-muted hover:text-th-text-secondary"}`}
            >
              URLs
            </button>
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="bd-input rounded-md px-2 py-1 text-xs"
          >
            <option value="citations">Sort: Citations</option>
            <option value="prompts">Sort: Prompts</option>
            <option value="competitors">Sort: Competitors</option>
            <option value="domain">Sort: A-Z</option>
          </select>

          <button
            onClick={exportCsv}
            className="rounded-md border border-th-border px-2 py-1 text-xs text-th-text-muted hover:bg-th-card-hover hover:text-th-text-secondary transition-colors"
            title="Export CSV"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Inline explanation ── */}
      <p className="text-xs text-th-text-muted leading-relaxed">
        URLs cited by AI models in responses where <span className="font-medium text-th-text-secondary">your brand isn&apos;t mentioned</span>.
        Getting listed on these pages could improve your AI visibility.
        {stats.highPriorityCount > 0 && (
          <> Items marked <span className="font-semibold text-th-danger">high priority</span> also mention your competitors.</>
        )}
      </p>

      {/* ── Search ── */}
      <div className="relative">
        <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-th-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
        </svg>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by domain, URL, or competitor…"
          className="bd-input w-full rounded-md py-1.5 pl-9 pr-8 text-sm"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-th-text-muted hover:text-th-text text-xs">✕</button>
        )}
      </div>

      {/* ── Table ── */}
      <div className="rounded-lg border border-th-border overflow-hidden">
        {/* Column headers */}
        {view === "domain" ? (
          <div className="grid grid-cols-[1fr_40px_40px_52px] sm:grid-cols-[1fr_72px_72px_72px_64px] gap-2 bg-th-card px-4 py-2 text-[10px] sm:text-xs font-medium uppercase tracking-normal sm:tracking-wider text-th-text-muted border-b border-th-border">
            <span>Source</span>
            <span className="text-right">Cited</span>
            <span className="hidden text-right sm:block">Pages</span>
            <span className="text-right">Comp.</span>
            <span className="text-center">Priority</span>
          </div>
        ) : (
          <div className="grid grid-cols-[1fr_40px_64px_52px] sm:grid-cols-[1fr_72px_96px_64px] gap-2 bg-th-card px-4 py-2 text-[10px] sm:text-xs font-medium uppercase tracking-normal sm:tracking-wider text-th-text-muted border-b border-th-border">
            <span>URL</span>
            <span className="text-right">Cited</span>
            <span className="text-right"><span className="sm:hidden">Comp.</span><span className="hidden sm:inline">Competitors</span></span>
            <span className="text-center">Priority</span>
          </div>
        )}

        {/* Rows */}
        <div className="max-h-[520px] overflow-auto divide-y divide-th-border/60">
          {view === "domain"
            ? (filtered as typeof domainGroups).map((item, idx) => {
                const isOpen = expandedOpp[item.domain];
                return (
                  <div key={item.domain}>
                    <button
                      onClick={() => setExpandedOpp((prev) => ({ ...prev, [item.domain]: !prev[item.domain] }))}
                      className={`grid w-full grid-cols-[1fr_40px_40px_52px] sm:grid-cols-[1fr_72px_72px_72px_64px] gap-2 items-center px-4 py-2.5 text-left transition-colors hover:bg-th-card-hover ${isOpen ? "bg-th-card-hover/50" : idx % 2 === 0 ? "bg-th-card" : "bg-th-card-alt"}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-th-text-muted">{isOpen ? "▾" : "▸"}</span>
                        <span className="text-sm font-medium text-th-text truncate">{item.domain}</span>
                      </div>
                      <span className="text-right text-sm font-semibold text-th-text tabular-nums">{item.totalCitations}</span>
                      <span className="hidden text-right text-sm text-th-text-secondary tabular-nums sm:block">{item.urls.length}</span>
                      <span className="text-right text-sm text-th-text-secondary tabular-nums">{item.competitors.length}</span>
                      <div className="flex justify-center">
                        {item.hasHighPriority ? (
                          <span className="rounded bg-th-danger-soft px-1.5 py-0.5 text-[10px] font-bold text-th-danger uppercase tracking-wide">High</span>
                        ) : (
                          <span className="rounded bg-th-card-alt px-1.5 py-0.5 text-[10px] font-medium text-th-text-muted uppercase tracking-wide">—</span>
                        )}
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {isOpen && (
                      <div className="border-t border-th-border/40 bg-th-card-alt/50">
                        {/* Competitors row */}
                        {item.competitors.length > 0 && (
                          <div className="px-4 py-2 pl-10 flex items-center gap-2 border-b border-th-border/30">
                            <span className="text-xs font-medium text-th-text-muted">Competitors cited:</span>
                            <div className="flex flex-wrap gap-1">
                              {item.competitors.map((c) => (
                                <span key={c} className="rounded bg-th-danger-soft px-1.5 py-0.5 text-xs font-medium text-th-danger">{c}</span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Pages */}
                        {item.urls.map((opp) => (
                          <div key={opp.url} className="grid grid-cols-[1fr_40px_40px_52px] sm:grid-cols-[1fr_72px_72px_72px_64px] gap-2 items-center px-4 py-2 pl-10 border-b border-th-border/30 last:border-b-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <a href={opp.url} target="_blank" rel="noreferrer" className="text-sm text-th-text-accent hover:underline truncate min-w-0" title={opp.url}>
                                {opp.url.replace(/^https?:\/\/(www\.)?/, "")}
                              </a>
                            </div>
                            <span className="text-right text-xs text-th-text-secondary tabular-nums">{opp.citationCount}</span>
                            <span className="hidden sm:block" />
                            <span className="text-right text-xs text-th-text-muted tabular-nums">{opp.competitorsMentioned.length}</span>
                            <div className="flex justify-center">
                              {opp.highPriority ? (
                                <span className="h-2 w-2 rounded-full bg-th-danger" title="High priority" />
                              ) : (
                                <span className="h-2 w-2 rounded-full bg-th-border" />
                              )}
                            </div>
                          </div>
                        ))}

                        {/* AI models + prompts */}
                        <div className="px-4 py-2 pl-10 flex flex-wrap items-center gap-2">
                          {[...new Set(item.urls.flatMap((u) => u.providers))].map((p) => (
                            <span key={p} className="rounded bg-th-card px-1.5 py-0.5 text-xs text-th-text-muted border border-th-border">{PROVIDER_LABELS[p]}</span>
                          ))}
                          <span className="text-xs text-th-text-muted">·</span>
                          {item.prompts.slice(0, 3).map((p, i) => (
                            <span key={i} className="inline-block max-w-[220px] truncate rounded bg-th-accent-soft/60 px-2 py-0.5 text-xs text-th-text-secondary" title={p}>
                              {p.length > 50 ? p.slice(0, 47) + "…" : p}
                            </span>
                          ))}
                          {item.prompts.length > 3 && (
                            <span className="text-xs text-th-text-muted">+{item.prompts.length - 3} more</span>
                          )}
                        </div>

                        {/* Outreach hint */}
                        <div className="px-4 py-2 pl-10 border-t border-th-border/30">
                          <p className="text-xs text-th-text-muted leading-relaxed">
                            <span className="font-medium text-th-text-secondary">Outreach tip:</span>{" "}
                            {item.competitors.length > 0
                              ? `Your competitors (${item.competitors.join(", ")}) are cited on ${item.domain}. Consider contributing content or securing a listing to compete directly.`
                              : `AI models cite ${item.domain} for ${item.prompts.length} tracked prompt${item.prompts.length > 1 ? "s" : ""}. Getting featured here could boost your AI visibility.`}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            : (filtered as typeof opportunities).map((opp, idx) => (
                <div
                  key={opp.url}
                  className={`grid grid-cols-[1fr_40px_64px_52px] sm:grid-cols-[1fr_72px_96px_64px] gap-2 items-center px-4 py-2.5 ${idx % 2 === 0 ? "bg-th-card" : "bg-th-card-alt"}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="hidden shrink-0 text-xs text-th-text-muted sm:inline">{opp.domain}</span>
                    <a href={opp.url} target="_blank" rel="noreferrer" className="text-sm text-th-text-accent hover:underline truncate min-w-0" title={opp.url}>
                      {opp.url.replace(/^https?:\/\/(www\.)?/, "")}
                    </a>
                  </div>
                  <span className="text-right text-sm font-semibold text-th-text tabular-nums">{opp.citationCount}</span>
                  <div className="flex flex-wrap justify-end gap-1">
                    {opp.competitorsMentioned.slice(0, 2).map((c) => (
                      <span key={c} className="rounded bg-th-danger-soft px-1 py-0.5 text-[10px] font-medium text-th-danger truncate max-w-full sm:max-w-[80px]">{c}</span>
                    ))}
                    {opp.competitorsMentioned.length > 2 && (
                      <span className="text-[10px] text-th-text-muted">+{opp.competitorsMentioned.length - 2}</span>
                    )}
                  </div>
                  <div className="flex justify-center">
                    {opp.highPriority ? (
                      <span className="rounded bg-th-danger-soft px-1.5 py-0.5 text-[10px] font-bold text-th-danger uppercase">High</span>
                    ) : (
                      <span className="text-[10px] text-th-text-muted">—</span>
                    )}
                  </div>
                </div>
              ))}

          {(filtered as unknown[]).length === 0 && (
            <div className="py-8 text-center text-sm text-th-text-muted">
              No opportunities match your filters.
            </div>
          )}
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="text-right text-xs text-th-text-muted">
        Showing {(filtered as unknown[]).length} of{" "}
        {view === "domain" ? `${domainGroups.length} domains` : `${opportunities.length} URLs`}
      </div>
    </div>
  );
}

/* ── Inline stat ── */
function Stat({ label, value, accent, danger }: { label: string; value: number | string; accent?: boolean; danger?: boolean }) {
  const color = danger ? "text-th-danger" : accent ? "text-th-text-accent" : "text-th-text";
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={`text-xl font-bold tabular-nums ${color}`}>{value}</span>
      <span className="text-xs text-th-text-muted">{label}</span>
    </div>
  );
}
