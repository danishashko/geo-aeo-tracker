"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  loadSovereignValue,
  saveSovereignValue,
  clearSovereignStore,
} from "@/lib/client/sovereign-store";
import { DEMO_STATE } from "@/lib/demo-data";
import { AeoAuditTab } from "@/components/dashboard/tabs/aeo-audit-tab";
import { AutomationTab } from "@/components/dashboard/tabs/automation-tab-v2";
import { BattlecardsTab } from "@/components/dashboard/tabs/battlecards-tab";
import { CitationOpportunitiesTab } from "@/components/dashboard/tabs/citation-opportunities-tab";
import { NicheExplorerTab } from "@/components/dashboard/tabs/niche-explorer-tab";
import { FanOutTab } from "@/components/dashboard/tabs/fan-out-tab";
import { PartnerDiscoveryTab } from "@/components/dashboard/tabs/partner-discovery-tab";
import { ProjectSettingsTab } from "@/components/dashboard/tabs/project-settings-tab";
import { PromptHubTab } from "@/components/dashboard/tabs/prompt-hub-tab";
import { ReputationSourcesTab } from "@/components/dashboard/tabs/reputation-sources-tab";
import { VisibilityAnalyticsTab } from "@/components/dashboard/tabs/visibility-analytics-tab";
import { DocumentationTab } from "@/components/dashboard/tabs/documentation-tab";
import { SROAnalysisTab } from "@/components/dashboard/tabs/sro-analysis-tab";
import type {
  AppState,
  Battlecard,
  DriftAlert,
  Provider,
  RunDelta,
  ScrapeRun,
  TabKey,
  Workspace,
} from "@/components/dashboard/types";
import {
  ALL_PROVIDERS,
  PROVIDER_LABELS,
  COUNTRIES,
  tabs,
} from "@/components/dashboard/types";

/* ── Inline SVG icon helpers (16×16) ─────────────────────────────── */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

const tabIcons: Record<TabKey, ReactNode> = {
  "Project Settings": (
    <Icon>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Icon>
  ),
  "Prompt Hub": (
    <Icon>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </Icon>
  ),
  "Persona Fan-Out": (
    <Icon>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Icon>
  ),
  "Niche Explorer": (
    <Icon>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </Icon>
  ),
  Automation: (
    <Icon>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </Icon>
  ),
  "Competitor Battlecards": (
    <Icon>
      <rect width="7" height="9" x="3" y="3" rx="1" />
      <rect width="7" height="5" x="14" y="3" rx="1" />
      <rect width="7" height="9" x="14" y="12" rx="1" />
      <rect width="7" height="5" x="3" y="16" rx="1" />
    </Icon>
  ),
  Responses: (
    <Icon>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M8 9h8M8 13h6" />
    </Icon>
  ),
  "Visibility Analytics": (
    <Icon>
      <path d="M3 3v18h18" />
      <path d="m19 9-5 5-4-4-3 3" />
    </Icon>
  ),
  Citations: (
    <Icon>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </Icon>
  ),
  "Citation Opportunities": (
    <Icon>
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </Icon>
  ),
  "AEO Audit": (
    <Icon>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </Icon>
  ),
  "SRO Analysis": (
    <Icon>
      <path d="M12 20V10" />
      <path d="M18 20V4" />
      <path d="M6 20v-4" />
    </Icon>
  ),
  Documentation: (
    <Icon>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <path d="M8 7h8M8 11h6" />
    </Icon>
  ),
};

const STORAGE_KEY = "sovereign-aeo-tracker-v1";
const WORKSPACES_KEY = "sovereign-workspaces";
const ACTIVE_WS_KEY = "sovereign-active-workspace";
const THEME_KEY = "sovereign-theme";

function storageKeyForWorkspace(wsId: string) {
  return wsId === "default" ? STORAGE_KEY : `sovereign-aeo-tracker-${wsId}`;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

const defaultState: AppState = {
  brand: {
    brandName: "",
    brandAliases: "",
    websites: [],
    industry: "",
    keywords: "",
    description: "",
  },
  provider: "chatgpt",
  activeProviders: ["chatgpt"],
  country: "US",
  prompt: "What are the best tools in your category in 2026? Include sources.",
  customPrompts: [
    {
      text: "How visible is {brand} compared to its competitors? Include sources.",
      tags: [],
    },
    {
      text: "What are the top 3 reasons to choose {brand} based on trusted sources?",
      tags: [],
    },
  ],
  personas: "CMO\nSEO Lead\nProduct Marketing Manager\nFounder",
  fanoutPrompts: [],
  niche: "",
  nicheQueries: [],
  cronExpr: "0 */6 * * *",
  githubWorkflow:
    "name: geo-aeo-tracker\non:\n  schedule:\n    - cron: '0 */6 * * *'\njobs:\n  track:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm ci && npm run test:scraper",
  competitors: [],
  battlecards: [],
  runs: [],
  auditUrl: "https://example.com",
  auditReport: null,
  scheduleEnabled: false,
  scheduleIntervalMs: 21600000,
  lastScheduledRun: null,
  driftAlerts: [],
};

const tabMeta: Record<
  TabKey,
  { title: string; tooltip: string; details: string }
> = {
  "Project Settings": {
    title: "Project Settings",
    tooltip: "Set your brand, site, keywords, and context.",
    details:
      "Define the exact brand and website to track. This context is reused across analysis flows so outputs stay targeted to your business.",
  },
  "Prompt Hub": {
    title: "Prompt Hub",
    tooltip: "Manage your tracking prompt library.",
    details:
      "Build a library of prompts to track over time. Use {brand} to inject your brand name. Run individual prompts or batch-run all across selected models.",
  },
  "Persona Fan-Out": {
    title: "Persona Fan-Out",
    tooltip: "Create and run persona-specific prompt variants.",
    details:
      "Write one core query, define personas, and generate persona-specific variants. Run each variant independently to compare how different audience angles change model responses.",
  },
  "Niche Explorer": {
    title: "Niche Explorer",
    tooltip: "Generate high-intent GEO/AEO queries.",
    details:
      "Build a reusable bank of niche prompts focused on discoverability, citations, and buyer intent so your tracking set stays comprehensive.",
  },
  Automation: {
    title: "Automation",
    tooltip: "Configure recurring runs via cron/workflows.",
    details:
      "Store deployment-ready scheduling templates for Vercel Cron and GitHub Actions so tracking can run automatically on a repeat cadence.",
  },
  "Competitor Battlecards": {
    title: "Competitors",
    tooltip: "Compare model sentiment vs competitors.",
    details:
      "Generate side-by-side competitor summaries and sentiment snapshots. See which competitors are mentioned alongside your brand and identify gaps.",
  },
  Responses: {
    title: "Responses",
    tooltip: "Browse AI model responses with brand highlighting.",
    details:
      "Browse all collected AI responses. Brand and competitor mentions are highlighted in-context. View visibility scores, sentiment, and cited sources per response.",
  },
  "Visibility Analytics": {
    title: "Analytics",
    tooltip: "Track visibility score and sentiment trends over time.",
    details:
      "Monitor your brand visibility score over time, track sentiment distribution across responses, and export data as CSV for further analysis.",
  },
  Citations: {
    title: "Citations",
    tooltip: "Analyze cited sources grouped by domain.",
    details:
      "See which domains and URLs get cited most in AI responses. Group by domain to find citation hubs, or search by URL for specific sources. Export data as CSV.",
  },
  "Citation Opportunities": {
    title: "Citation Opps",
    tooltip: "Competitor-cited sources where you're not mentioned.",
    details:
      "Discover high-value outreach targets: URLs where AI models cite your competitors but don't mention your brand. Each opportunity includes an outreach brief.",
  },
  "AEO Audit": {
    title: "AEO Audit",
    tooltip: "Audit site readiness for LLM discovery.",
    details:
      "Run checks for llms.txt, schema signals, and BLUF-style clarity indicators to quickly assess AI-answer readiness of a target URL.",
  },
  "SRO Analysis": {
    title: "SRO Analysis",
    tooltip: "Analyze Selection Rate Optimization across AI platforms.",
    details:
      "Run a full SRO pipeline: Gemini grounding, cross-platform citation checks, SERP analysis, and AI-powered recommendations to improve your selection rate in LLM responses.",
  },
  Documentation: {
    title: "Documentation",
    tooltip: "Learn about every feature in the tracker.",
    details:
      "A comprehensive guide to all tabs, features, scoring methodology, supported models, and data privacy. Searchable and browsable.",
  },
};

export function SovereignDashboard({
  demoMode = false,
  demoReason = "explicit",
}: { demoMode?: boolean; demoReason?: "explicit" | "no-key" } = {}) {
  const [activeTab, setActiveTab] = useState<TabKey>("Visibility Analytics");
  const [state, setState] = useState<AppState>(
    demoMode ? DEMO_STATE : defaultState,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    demoMode ? "Demo mode — read-only preview" : "",
  );
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWsId, setActiveWsId] = useState<string>("default");
  const [showWsPicker, setShowWsPicker] = useState(false);
  const [showScoreInfo, setShowScoreInfo] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  /**
   * False until the active workspace's state has finished loading from
   * IDB/cloud. Guards the save effect so the initial `defaultState` never
   * overwrites stored data during the async load (a data-loss race).
   */
  const hydratedRef = useRef(false);
  /** Debounce timer so rapid edits (typing) don't hammer IDB/cloud on every keystroke. */
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Apply theme class to <html> */
  const applyTheme = useCallback((t: "light" | "dark" | "system") => {
    const root = document.documentElement;
    if (t === "dark") {
      root.classList.add("dark");
    } else if (t === "light") {
      root.classList.remove("dark");
    } else {
      // system
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    }
  }, []);

  function cycleTheme() {
    const order: ("light" | "dark" | "system")[] = ["light", "dark", "system"];
    const next = order[(order.indexOf(theme) + 1) % 3];
    setTheme(next);
    applyTheme(next);
    if (!demoMode) localStorage.setItem(THEME_KEY, next);
  }

  /** Load workspaces on mount */
  useEffect(() => {
    // Theme
    const savedTheme = localStorage.getItem(THEME_KEY) as
      | "light"
      | "dark"
      | "system"
      | null;
    if (savedTheme) {
      setTheme(savedTheme);
      applyTheme(savedTheme);
    }

    if (demoMode) return; // Skip workspace loading in demo mode

    // Workspaces
    try {
      const raw = localStorage.getItem(WORKSPACES_KEY);
      const parsed: Workspace[] = raw ? JSON.parse(raw) : [];
      if (parsed.length === 0) {
        // Create default workspace
        const defaultWs: Workspace = {
          id: "default",
          brandName: "Default",
          createdAt: new Date().toISOString(),
        };
        parsed.push(defaultWs);
        localStorage.setItem(WORKSPACES_KEY, JSON.stringify(parsed));
      }
      setWorkspaces(parsed);
      const savedActiveId = localStorage.getItem(ACTIVE_WS_KEY) ?? parsed[0].id;
      setActiveWsId(savedActiveId);
    } catch {
      const defaultWs: Workspace = {
        id: "default",
        brandName: "Default",
        createdAt: new Date().toISOString(),
      };
      setWorkspaces([defaultWs]);
      setActiveWsId("default");
    }
  }, [applyTheme, demoMode]);

  /** Load app state for active workspace */
  useEffect(() => {
    if (demoMode || !activeWsId) return;
    let mounted = true;
    // New workspace target — block saves until this load resolves.
    hydratedRef.current = false;
    const key = storageKeyForWorkspace(activeWsId);
    loadSovereignValue<AppState>(key, defaultState).then((data) => {
      if (mounted) {
        // Merge saved state with defaults so new fields are never undefined
        const merged: AppState = {
          ...defaultState,
          ...data,
          brand: { ...defaultState.brand, ...(data.brand ?? {}) },
          provider: ALL_PROVIDERS.includes(data.provider as Provider)
            ? (data.provider as Provider)
            : defaultState.provider,
          activeProviders: Array.isArray(data.activeProviders)
            ? data.activeProviders.filter((provider): provider is Provider =>
                ALL_PROVIDERS.includes(provider as Provider),
              )
            : [],
        };
        // Migrate legacy single website → websites array
        const brandAny = data.brand as Record<string, unknown> | undefined;
        if (
          brandAny &&
          typeof brandAny.website === "string" &&
          !Array.isArray(brandAny.websites)
        ) {
          merged.brand.websites = brandAny.website ? [brandAny.website] : [];
        }
        // Migrate legacy comma-separated competitors string → Competitor[]
        if (typeof (data as Record<string, unknown>).competitors === "string") {
          merged.competitors = (data as Record<string, unknown>).competitors
            ? ((data as Record<string, unknown>).competitors as string)
                .split(",")
                .map((c: string) => c.trim())
                .filter(Boolean)
                .map((name: string) => ({ name, aliases: [], websites: [] }))
            : [];
        }
        // Migrate legacy plain-string customPrompts → TaggedPrompt[]
        if (
          Array.isArray(merged.customPrompts) &&
          merged.customPrompts.length > 0 &&
          typeof merged.customPrompts[0] === "string"
        ) {
          merged.customPrompts = (
            merged.customPrompts as unknown as string[]
          ).map((t) => ({ text: t, tags: [] }));
        }
        if (merged.activeProviders.length === 0) {
          merged.activeProviders = [merged.provider];
        }
        setState(merged);
        // Load complete — saves for this workspace are now safe.
        hydratedRef.current = true;
      }
    });
    return () => {
      mounted = false;
    };
  }, [activeWsId, demoMode]);

  useEffect(() => {
    if (demoMode || !activeWsId || !hydratedRef.current) return;
    // Debounce the (possibly network-bound, in cloud mode) save.
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const wsId = activeWsId;
    const snapshot = state;
    saveTimerRef.current = setTimeout(() => {
      saveSovereignValue(storageKeyForWorkspace(wsId), snapshot);
    }, 600);
    // Update workspace brandName if changed
    if (state.brand.brandName) {
      setWorkspaces((prev) => {
        const updated = prev.map((ws) =>
          ws.id === activeWsId
            ? { ...ws, brandName: state.brand.brandName || ws.brandName }
            : ws,
        );
        localStorage.setItem(WORKSPACES_KEY, JSON.stringify(updated));
        return updated;
      });
    }
  }, [state, activeWsId, demoMode]);

  /** ref to the scheduler interval so we can clear/re-create it */
  const schedulerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** ref to latest state so the scheduler callback doesn't close over stale state */
  const stateRef = useRef(state);
  stateRef.current = state;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  /** ref to latest callScrapeOne so the scheduler callback doesn't use stale brand terms */
  const callScrapeOneRef = useRef<
    (prompt: string, provider: Provider) => Promise<ScrapeRun | null>
  >(
    // placeholder — will be assigned after callScrapeOne is defined
    async () => null,
  );

  /** Detect drift after a batch of new runs */
  function detectDrift(
    newRuns: ScrapeRun[],
    existingRuns: ScrapeRun[],
  ): DriftAlert[] {
    const alerts: DriftAlert[] = [];
    const DRIFT_THRESHOLD = 10; // minimum score change to trigger alert

    newRuns.forEach((newRun) => {
      // Find the most recent existing run with same prompt+provider
      const prev = existingRuns.find(
        (r) => r.prompt === newRun.prompt && r.provider === newRun.provider,
      );
      if (!prev) return;
      const delta = (newRun.visibilityScore ?? 0) - (prev.visibilityScore ?? 0);
      if (Math.abs(delta) >= DRIFT_THRESHOLD) {
        alerts.push({
          id: `drift-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          prompt: newRun.prompt,
          provider: newRun.provider,
          oldScore: prev.visibilityScore ?? 0,
          newScore: newRun.visibilityScore ?? 0,
          delta,
          createdAt: new Date().toISOString(),
          dismissed: false,
        });
      }
    });

    return alerts;
  }

  /** Run a scheduled batch and detect drift */
  const runScheduledBatch = useCallback(async () => {
    const s = stateRef.current;
    if (busyRef.current) return; // skip if already running
    const prompts =
      s.customPrompts.length > 0
        ? s.customPrompts.map((p) => p.text)
        : [s.prompt];
    const providers = s.activeProviders;
    if (prompts.length === 0 || providers.length === 0) return;

    setBusy(true);
    setMessage("Auto-run: Starting scheduled batch…");

    const allRuns: ScrapeRun[] = [];
    for (const prompt of prompts) {
      const results = await Promise.allSettled(
        providers.map((p) => callScrapeOneRef.current(prompt, p)),
      );
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) allRuns.push(r.value);
      }
    }

    // Detect drift against existing runs
    const newAlerts = detectDrift(allRuns, s.runs);

    setState((prev) => ({
      ...prev,
      runs: [...allRuns, ...prev.runs].slice(0, 500),
      lastScheduledRun: new Date().toISOString(),
      driftAlerts: [...newAlerts, ...prev.driftAlerts].slice(0, 100),
    }));

    setMessage(
      `Auto-run complete: ${allRuns.length} results.${newAlerts.length > 0 ? ` ${newAlerts.length} drift alert${newAlerts.length > 1 ? "s" : ""} triggered.` : ""}`,
    );
    setBusy(false);
  }, []);

  /** Set up / tear down the scheduler interval */
  useEffect(() => {
    if (schedulerRef.current) {
      clearInterval(schedulerRef.current);
      schedulerRef.current = null;
    }
    if (!demoMode && state.scheduleEnabled && state.scheduleIntervalMs > 0) {
      schedulerRef.current = setInterval(
        runScheduledBatch,
        state.scheduleIntervalMs,
      );
    }
    return () => {
      if (schedulerRef.current) {
        clearInterval(schedulerRef.current);
        schedulerRef.current = null;
      }
    };
  }, [demoMode, state.scheduleEnabled, state.scheduleIntervalMs, runScheduledBatch]);

  function dismissAlert(id: string) {
    setState((prev) => ({
      ...prev,
      driftAlerts: prev.driftAlerts.map((a) =>
        a.id === id ? { ...a, dismissed: true } : a,
      ),
    }));
  }

  function dismissAllAlerts() {
    setState((prev) => ({
      ...prev,
      driftAlerts: prev.driftAlerts.map((a) => ({ ...a, dismissed: true })),
    }));
  }

  function switchWorkspace(wsId: string) {
    if (demoMode) {
      setMessage("Demo mode — workspaces are read-only");
      return;
    }
    // Save current state first
    saveSovereignValue(storageKeyForWorkspace(activeWsId), state);
    setActiveWsId(wsId);
    localStorage.setItem(ACTIVE_WS_KEY, wsId);
    setShowWsPicker(false);
    setMessage(
      `Switched to ${workspaces.find((w) => w.id === wsId)?.brandName ?? "workspace"}`,
    );
  }

  function createWorkspace(name: string) {
    if (demoMode) {
      setMessage("Demo mode — workspaces are read-only");
      return;
    }
    const ws: Workspace = {
      id: generateId(),
      brandName: name,
      createdAt: new Date().toISOString(),
    };
    const updated = [...workspaces, ws];
    setWorkspaces(updated);
    localStorage.setItem(WORKSPACES_KEY, JSON.stringify(updated));
    // Save current, switch to new
    saveSovereignValue(storageKeyForWorkspace(activeWsId), state);
    setState({
      ...defaultState,
      brand: { ...defaultState.brand, brandName: name },
    });
    setActiveWsId(ws.id);
    localStorage.setItem(ACTIVE_WS_KEY, ws.id);
    setShowWsPicker(false);
    setMessage(`Created workspace: ${name}`);
  }

  function deleteWorkspace(wsId: string) {
    if (demoMode) {
      setMessage("Demo mode — workspaces are read-only");
      return;
    }
    if (workspaces.length <= 1) return;
    if (!window.confirm("Delete this workspace and all its data?")) return;
    const updated = workspaces.filter((w) => w.id !== wsId);
    setWorkspaces(updated);
    localStorage.setItem(WORKSPACES_KEY, JSON.stringify(updated));
    clearSovereignStore(storageKeyForWorkspace(wsId));
    if (activeWsId === wsId) {
      switchWorkspace(updated[0].id);
    }
  }

  const partnerLeaderboard = useMemo(() => {
    // Client-side junk URL filter as safety net
    const junkHosts = [
      "cloudfront.net",
      "cdn.prod.website-files.com",
      "cdn.jsdelivr.net",
      "cdnjs.cloudflare.com",
      "unpkg.com",
      "fastly.net",
      "akamaihd.net",
      "connect.facebook.net",
      "facebook.net",
      "google-analytics.com",
      "googletagmanager.com",
      "doubleclick.net",
      "w3.org",
      "schema.org",
      "amazonaws.com",
      "cloudflare.com",
      "hotjar.com",
      "sentry.io",
    ];
    const junkExtPattern =
      /\.(png|jpe?g|gif|svg|webp|avif|ico|css|js|woff2?|ttf|eot|mp4|webm)(\?|$)/i;

    function isCleanUrl(url: string): boolean {
      try {
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase();
        if (junkHosts.some((j) => host === j || host.endsWith(`.${j}`)))
          return false;
        if (junkExtPattern.test(parsed.pathname)) return false;
        if (parsed.search.length > 200) return false;
        return true;
      } catch {
        return false;
      }
    }

    const map = new Map<string, { count: number; prompts: Set<string> }>();
    state.runs.forEach((run) => {
      run.sources.filter(isCleanUrl).forEach((source) => {
        const existing = map.get(source) ?? {
          count: 0,
          prompts: new Set<string>(),
        };
        existing.count += 1;
        existing.prompts.add(run.prompt);
        map.set(source, existing);
      });
    });

    return [...map.entries()]
      .map(([url, data]) => ({
        url,
        count: data.count,
        prompts: [...data.prompts],
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);
  }, [state.runs]);

  const visibilityTrend = useMemo(() => {
    const byDay = new Map<string, { total: number; sum: number }>();

    state.runs.forEach((run) => {
      const day = run.createdAt.slice(0, 10);
      const row = byDay.get(day) ?? { total: 0, sum: 0 };
      row.total += 1;
      row.sum += run.visibilityScore ?? 0;
      byDay.set(day, row);
    });

    return [...byDay.entries()]
      .map(([day, { total, sum }]) => ({
        day,
        visibility: total > 0 ? Math.round(sum / total) : 0,
      }))
      .sort((a, b) => a.day.localeCompare(b.day));
  }, [state.runs]);

  const totalSources = useMemo(
    () => state.runs.reduce((acc, run) => acc + run.sources.length, 0),
    [state.runs],
  );

  /** Count unique domains cited in runs where the brand was NOT mentioned — these are outreach targets */
  const citationOpportunities = useMemo(() => {
    const domains = new Set<string>();
    state.runs
      .filter(
        (r) =>
          r.sentiment === "not-mentioned" ||
          (r.brandMentions?.length ?? 0) === 0,
      )
      .forEach((r) => {
        r.sources.forEach((url) => {
          try {
            const host = new URL(url).hostname
              .replace(/^www\./, "")
              .toLowerCase();
            domains.add(host);
          } catch {
            /* skip */
          }
        });
      });
    return domains.size;
  }, [state.runs]);

  const latestRun = state.runs[0];

  /** Compute score deltas: for each prompt+provider, compare latest run to the previous one */
  const runDeltas: RunDelta[] = useMemo(() => {
    const grouped = new Map<string, ScrapeRun[]>();
    state.runs.forEach((run) => {
      const key = `${run.prompt}|||${run.provider}`;
      const list = grouped.get(key) ?? [];
      list.push(run);
      grouped.set(key, list);
    });

    const deltas: RunDelta[] = [];
    grouped.forEach((runs) => {
      // Sort newest first
      const sorted = [...runs].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      if (sorted.length < 2) return;
      const curr = sorted[0];
      const prev = sorted[1];
      const d = (curr.visibilityScore ?? 0) - (prev.visibilityScore ?? 0);
      if (d !== 0) {
        deltas.push({
          prompt: curr.prompt,
          provider: curr.provider,
          currentScore: curr.visibilityScore ?? 0,
          previousScore: prev.visibilityScore ?? 0,
          delta: d,
          currentRun: curr,
          previousRun: prev,
        });
      }
    });

    return deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [state.runs]);

  /** Top movers — biggest absolute delta changes */
  const movers = useMemo(() => runDeltas.slice(0, 5), [runDeltas]);

  /** KPI delta: compare current period avg visibility vs prior period */
  const kpiVisibilityDelta = useMemo(() => {
    if (state.runs.length < 2) return null;
    const sorted = [...state.runs].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const mid = Math.floor(sorted.length / 2);
    const recentHalf = sorted.slice(0, mid);
    const olderHalf = sorted.slice(mid);
    if (recentHalf.length === 0 || olderHalf.length === 0) return null;
    const recentAvg =
      recentHalf.reduce((a, r) => a + (r.visibilityScore ?? 0), 0) /
      recentHalf.length;
    const olderAvg =
      olderHalf.reduce((a, r) => a + (r.visibilityScore ?? 0), 0) /
      olderHalf.length;
    return Math.round(recentAvg - olderAvg);
  }, [state.runs]);

  /** Unread drift alerts count */
  const unreadAlertCount = useMemo(
    () => state.driftAlerts.filter((a) => !a.dismissed).length,
    [state.driftAlerts],
  );

  /** Brand context string injected into AI prompts when available */
  const brandCtx = state.brand.brandName
    ? `Context: Brand "${state.brand.brandName}"${state.brand.websites.length > 0 ? ` (${state.brand.websites.join(", ")})` : ""}${state.brand.industry ? `, industry: ${state.brand.industry}` : ""}${state.brand.keywords ? `, keywords: ${state.brand.keywords}` : ""}. `
    : "";

  /** Build list of brand names/aliases to detect */
  function getBrandTerms(): string[] {
    const terms: string[] = [];
    if (state.brand.brandName?.trim()) terms.push(state.brand.brandName.trim());
    if (state.brand.brandAliases?.trim()) {
      (state.brand.brandAliases ?? "").split(",").forEach((a) => {
        const t = a.trim();
        if (t) terms.push(t);
      });
    }
    return terms;
  }

  function getCompetitorTerms(): string[] {
    return state.competitors
      .flatMap((c) => [c.name, ...c.aliases])
      .filter(Boolean);
  }

  /** Find which terms appear in text (case-insensitive) */
  function findMentions(text: string, terms: string[]): string[] {
    const lower = text.toLowerCase();
    return terms.filter((t) => lower.includes(t.toLowerCase()));
  }

  /** Detect basic sentiment toward brand in answer */
  function detectSentiment(
    answer: string,
    brandTerms: string[],
  ): "positive" | "neutral" | "negative" | "not-mentioned" {
    if (brandTerms.length === 0) return "not-mentioned";
    const lower = answer.toLowerCase();
    const mentioned = brandTerms.some((t) => lower.includes(t.toLowerCase()));
    if (!mentioned) return "not-mentioned";

    const positiveWords = [
      "best",
      "leading",
      "top",
      "excellent",
      "recommend",
      "great",
      "outstanding",
      "innovative",
      "trusted",
      "powerful",
      "superior",
      "preferred",
      "popular",
      "reliable",
      "impressive",
      "standout",
      "strong",
      "ideal",
    ];
    const negativeWords = [
      "worst",
      "poor",
      "bad",
      "avoid",
      "lacking",
      "weak",
      "inferior",
      "disappointing",
      "overpriced",
      "limited",
      "outdated",
      "risky",
      "problematic",
      "concern",
      "drawback",
      "downside",
    ];

    let posScore = 0;
    let negScore = 0;
    positiveWords.forEach((w) => {
      if (lower.includes(w)) posScore++;
    });
    negativeWords.forEach((w) => {
      if (lower.includes(w)) negScore++;
    });

    if (posScore > negScore + 1) return "positive";
    if (negScore > posScore + 1) return "negative";
    return "neutral";
  }

  /** Calculate 0-100 visibility score */
  function calcVisibilityScore(
    answer: string,
    sources: string[],
    brandTerms: string[],
  ): number {
    if (brandTerms.length === 0) return 0;
    const lower = answer.toLowerCase();
    let score = 0;

    // Brand mentioned at all? +30
    const mentioned = brandTerms.some((t) => lower.includes(t.toLowerCase()));
    if (!mentioned) return 0;
    score += 30;

    // Mentioned in first 200 chars (prominent position)? +20
    const first200 = lower.slice(0, 200);
    if (brandTerms.some((t) => first200.includes(t.toLowerCase()))) score += 20;

    // Multiple mentions? +15
    const mentionCount = brandTerms.reduce((acc, t) => {
      const re = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      return acc + (lower.match(re)?.length ?? 0);
    }, 0);
    if (mentionCount >= 3) score += 15;
    else if (mentionCount >= 2) score += 8;

    // Brand website in sources? +20
    const websiteDomains = state.brand.websites
      .map((w) =>
        w
          .replace(/^https?:\/\//, "")
          .replace(/\/.*$/, "")
          .toLowerCase(),
      )
      .filter(Boolean);
    if (
      websiteDomains.length > 0 &&
      sources.some((s) => {
        const sl = s.toLowerCase();
        return websiteDomains.some((d) => sl.includes(d));
      })
    ) {
      score += 20;
    }

    // Positive sentiment bonus +15
    const sent = detectSentiment(answer, brandTerms);
    if (sent === "positive") score += 15;
    else if (sent === "neutral") score += 5;

    return Math.min(100, score);
  }

  /** Run a single scrape against one specific provider */
  async function callScrapeOne(
    prompt: string,
    provider: Provider,
  ): Promise<ScrapeRun | null> {
    if (demoMode) {
      setMessage("Demo mode — API calls are disabled");
      return null;
    }
    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          prompt,
          requireSources: true,
          country: state.country,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Scrape request failed");

      const answerText = data.answer || "";
      const sourceList = data.sources || [];
      const brandTerms = getBrandTerms();
      const competitorTerms = getCompetitorTerms();

      return {
        provider: data.provider,
        prompt: data.prompt,
        answer: answerText,
        sources: sourceList,
        createdAt: data.createdAt || new Date().toISOString(),
        visibilityScore: calcVisibilityScore(
          answerText,
          sourceList,
          brandTerms,
        ),
        sentiment: detectSentiment(answerText, brandTerms),
        brandMentions: findMentions(answerText, brandTerms),
        competitorMentions: findMentions(answerText, competitorTerms),
        country: state.country,
      };
    } catch {
      return null;
    }
  }

  // Keep the ref up-to-date so the scheduler always uses latest brand/competitor terms
  callScrapeOneRef.current = callScrapeOne;

  /** Run a prompt across all activeProviders in parallel */
  async function callScrape(prompt: string) {
    const providers =
      state.activeProviders.length > 0
        ? state.activeProviders
        : [state.provider];
    const count = providers.length;
    setBusy(true);
    setMessage(`Running across ${count} model${count > 1 ? "s" : ""}...`);

    try {
      const results = await Promise.allSettled(
        providers.map((p) => callScrapeOne(prompt, p)),
      );

      const runs: ScrapeRun[] = results
        .map((r) => (r.status === "fulfilled" ? r.value : null))
        .filter((r): r is ScrapeRun => r !== null);

      if (runs.length === 0) {
        setMessage(
          "All scrape requests failed. Check your Bright Data config.",
        );
        return;
      }

      setState((prev) => ({
        ...prev,
        runs: [...runs, ...prev.runs].slice(0, 500),
      }));

      const failed = count - runs.length;
      setMessage(
        `Done: ${runs.length}/${count} model${count > 1 ? "s" : ""} returned results.${failed > 0 ? ` ${failed} failed.` : ""}`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to run scraper.",
      );
    } finally {
      setBusy(false);
    }
  }

  /** Batch run all custom prompts across all active providers — fully parallel */
  async function batchRunAllPrompts() {
    const prompts = state.customPrompts.map((p) =>
      p.text.replace(/\{brand\}/gi, state.brand.brandName || "our brand"),
    );
    if (prompts.length === 0) {
      setMessage("No tracking prompts to run. Add prompts first.");
      return;
    }
    const providers =
      state.activeProviders.length > 0
        ? state.activeProviders
        : [state.provider];
    const totalJobs = prompts.length * providers.length;
    setBusy(true);
    setMessage(`Batch: launching ${totalJobs} jobs in parallel...`);

    // Fire ALL prompt × provider combinations at once
    const jobs = prompts.flatMap((prompt) =>
      providers.map((p) => callScrapeOne(prompt, p)),
    );
    const results = await Promise.allSettled(jobs);

    const allRuns: ScrapeRun[] = [];
    let failed = 0;
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        allRuns.push(r.value);
      } else {
        failed++;
      }
    }

    setState((prev) => ({
      ...prev,
      runs: [...allRuns, ...prev.runs].slice(0, 500),
    }));

    setMessage(
      `Batch complete: ${allRuns.length} results from ${prompts.length} prompts × ${providers.length} models.${failed > 0 ? ` ${failed} failed.` : ""}`,
    );
    setBusy(false);
  }

  function generatePersonaFanout() {
    const personas = state.personas
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const fanout = personas.map(
      (persona) =>
        `${persona}: ${state.prompt} Respond with sources and direct claims first.`,
    );

    setState((prev) => ({ ...prev, fanoutPrompts: fanout }));
  }

  function addCustomPrompt(value: string) {
    const cleaned = value.trim();
    if (!cleaned) return;
    setState((prev) => {
      if (prev.customPrompts.some((p) => p.text === cleaned)) return prev;
      return {
        ...prev,
        customPrompts: [
          { text: cleaned, tags: [] },
          ...prev.customPrompts,
        ].slice(0, 50),
      };
    });
    setMessage("Tracking prompt added.");
  }

  function removeCustomPrompt(value: string, deleteResponses?: boolean) {
    setState((prev) => ({
      ...prev,
      customPrompts: prev.customPrompts.filter((entry) => entry.text !== value),
      runs: deleteResponses
        ? prev.runs.filter(
            (r) =>
              r.prompt !== value &&
              r.prompt !==
                value.replace(
                  /\{brand\}/gi,
                  prev.brand.brandName || "our brand",
                ),
          )
        : prev.runs,
    }));
  }

  function updatePromptTags(text: string, tags: string[]) {
    setState((prev) => ({
      ...prev,
      customPrompts: prev.customPrompts.map((p) =>
        p.text === text ? { ...p, tags } : p,
      ),
    }));
  }

  function deleteRun(index: number) {
    setState((prev) => ({
      ...prev,
      runs: prev.runs.filter((_, i) => i !== index),
    }));
  }

  function extractNicheQueries(payload: unknown) {
    const data = payload as {
      text?: unknown;
      output?: unknown;
      response?: unknown;
      content?: unknown;
    };

    const directText = [
      data.text,
      data.output,
      data.response,
      data.content,
    ].find((value) => typeof value === "string" && value.trim().length > 0) as
      | string
      | undefined;

    const raw = directText ?? "";
    // Strip markdown fences entirely
    const cleaned = raw.replace(/```[\w]*\n?/g, "").trim();

    // Try JSON array first
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        const parsed = JSON.parse(arrayMatch[0]) as unknown;
        if (Array.isArray(parsed)) {
          const items = parsed
            .map((item) => (typeof item === "string" ? item.trim() : ""))
            .filter((line) => line.length > 10)
            .slice(0, 20);
          if (items.length > 0) return items;
        }
      } catch {
        // fall through to line parsing
      }
    }

    // Line-by-line parsing
    const fromLines = cleaned
      .split("\n")
      .map((line) =>
        line
          .replace(/^\s*[-*•]\s+/, "")
          .replace(/^\s*\d+[.)]\s+/, "")
          .replace(/^\s*"|"\s*$/g, "")
          .replace(/^\*\*(.+?)\*\*$/, "$1")
          .replace(/^"+|"+$/g, "")
          .trim(),
      )
      .filter((line) => line.length > 10 && line.length < 300)
      .filter(
        (line) =>
          !/^(here\s+(are|is)|high[- ]intent|sure|certainly|below|the following)\b/i.test(
            line,
          ),
      )
      .filter((line) => line.includes(" ")); // must have at least 2 words

    return fromLines.slice(0, 20);
  }

  async function runNicheExplorer() {
    if (demoMode) {
      setMessage("Demo mode — API calls are disabled");
      return;
    }
    setBusy(true);
    setMessage("Generating niche queries...");

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `${brandCtx}Generate exactly 12 high-intent search queries that a buyer or researcher would type into an AI assistant (ChatGPT, Perplexity, Gemini) when exploring this niche: "${state.niche}".

Requirements:
- Each query should be realistic and conversational
- Include source-seeking phrasing like "with sources", "according to experts", etc.
- Mix informational, comparison, and decision-stage queries
- Return ONLY a numbered list, one query per line, no explanations`,
          maxTokens: 1500,
          skipCache: true,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Niche generation failed");

      const queries = extractNicheQueries(data);

      setState((prev) => ({ ...prev, nicheQueries: queries }));
      setMessage(
        queries.length > 0
          ? "Niche queries updated."
          : "No valid niche queries returned. Try a more specific niche.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed generating queries.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function runBattlecards() {
    if (demoMode) {
      setMessage("Demo mode — API calls are disabled");
      return;
    }
    setBusy(true);
    setMessage("Building competitor battlecards...");

    try {
      const competitorList = state.competitors
        .map((c) => c.name.trim())
        .filter(Boolean);

      if (competitorList.length === 0) {
        setMessage("Add at least one competitor first.");
        setBusy(false);
        return;
      }

      const exampleJson = JSON.stringify({
        competitor: "example.com",
        sentiment: "positive",
        summary: "Strong brand presence with frequent citations.",
        sections: [
          {
            heading: "Strengths",
            points: ["High domain authority", "Frequent AI citations"],
          },
          { heading: "Weaknesses", points: ["Limited product range"] },
          {
            heading: "Pricing",
            points: ["Premium tier: $99/mo", "Free plan available"],
          },
          {
            heading: "AI Visibility",
            points: ["Mentioned in 8/10 tested prompts"],
          },
        ],
      });

      const normalizeBattlecards = (arr: unknown): Battlecard[] => {
        if (!Array.isArray(arr)) return [];
        const mapped = arr.map((item) => {
          const record = (item ?? {}) as Record<string, unknown>;
          const competitor = String(record.competitor ?? "").trim();
          if (!competitor) return null;
          const sentimentRaw = String(
            record.sentiment ?? "neutral",
          ).toLowerCase();
          const sentiment = (
            ["positive", "neutral", "negative"].includes(sentimentRaw)
              ? sentimentRaw
              : "neutral"
          ) as "positive" | "neutral" | "negative";
          const summary = String(
            record.summary ?? record.analysis ?? "No summary provided.",
          ).trim();
          // Parse structured sections
          const rawSections = Array.isArray(record.sections)
            ? record.sections
            : [];
          const sections = rawSections
            .map((s: unknown) => {
              const sec = (s ?? {}) as Record<string, unknown>;
              const heading = String(sec.heading ?? "").trim();
              const points = Array.isArray(sec.points)
                ? sec.points
                    .map((p: unknown) => String(p).trim())
                    .filter(Boolean)
                : [];
              return heading && points.length > 0 ? { heading, points } : null;
            })
            .filter(
              (s): s is { heading: string; points: string[] } => s !== null,
            );
          return {
            competitor,
            sentiment,
            summary,
            sections: sections.length > 0 ? sections : undefined,
          } as Battlecard;
        });
        return mapped.filter((entry): entry is Battlecard => entry !== null);
      };

      // Parse a single competitor object out of an LLM response (handles fences
      // and surrounding prose), normalizing via the array path above.
      const parseOne = (raw: string, name: string): Battlecard => {
        const tryObj = (s: string): Battlecard | null => {
          try {
            const cards = normalizeBattlecards([JSON.parse(s)]);
            return cards[0] ?? null;
          } catch {
            return null;
          }
        };
        const noFence = raw
          .replace(/```json\s*/gi, "")
          .replace(/```/g, "")
          .trim();
        let card = tryObj(noFence) ?? tryObj(raw);
        if (!card) {
          const start = raw.indexOf("{");
          const end = raw.lastIndexOf("}");
          if (start >= 0 && end > start)
            card = tryObj(raw.slice(start, end + 1));
        }
        if (card) return { ...card, competitor: name };
        const snippet = raw.replace(/[#*`]/g, "").trim().slice(0, 220);
        return {
          competitor: name,
          sentiment: "neutral",
          summary:
            snippet ||
            "AI could not generate a structured analysis for this competitor.",
        };
      };

      // One small, fast request per competitor. A single combined request for
      // all competitors is large enough to exceed the LLM/serverless time limits
      // and abort; per-competitor calls stay well within them. The model
      // occasionally returns an empty completion, so retry once before giving up.
      const attemptOne = async (name: string): Promise<Battlecard | null> => {
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: `${brandCtx}You are an AI search visibility analyst. Analyze how AI models (ChatGPT, Perplexity, Gemini, Copilot, Google AI) likely perceive the competitor "${name}".

Return ONE JSON object with:
- "competitor": "${name}"
- "sentiment": one of "positive", "neutral", or "negative"
- "summary": 2-3 sentence overview
- "sections": an array of {"heading": string, "points": string[]} covering Strengths, Weaknesses, Pricing Insights, AI Visibility, and Key Differentiators

Return ONLY the JSON object. No markdown fences. No extra text. Example format:
${exampleJson}`,
            // Pin a reliable structured-output model regardless of any
            // OPENROUTER_MODEL override the deployer may have set.
            model: "google/gemini-3.5-flash",
            maxTokens: 1300,
            temperature: 0.3,
            skipCache: true,
          }),
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Battlecard generation failed");
        const raw = String(data.text ?? "").trim();
        if (!raw) return null; // empty completion — signal a retry
        const card = parseOne(raw, name);
        // A card with sections parsed is "good"; otherwise let the caller retry.
        return card.sections && card.sections.length > 0 ? card : null;
      };

      const buildOne = async (name: string): Promise<Battlecard> => {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const card = await attemptOne(name);
            if (card) return card;
          } catch {
            /* fall through to retry / fallback */
          }
        }
        return {
          competitor: name,
          sentiment: "neutral",
          summary:
            "Could not generate a structured analysis for this competitor. Try again.",
        };
      };

      const settled = await Promise.allSettled(competitorList.map(buildOne));
      const parsed: Battlecard[] = settled.map((r, i) =>
        r.status === "fulfilled"
          ? r.value
          : {
              competitor: competitorList[i],
              sentiment: "neutral",
              summary:
                "Battlecard generation failed for this competitor. Try again.",
            },
      );

      setState((prev) => ({ ...prev, battlecards: parsed }));
      setMessage(`Battlecards ready for ${parsed.length} competitors.`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed building battlecards.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function runAudit() {
    if (demoMode) {
      setMessage("Demo mode — API calls are disabled");
      return;
    }
    setBusy(true);
    setMessage("Running AEO audit...");

    try {
      const response = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: state.auditUrl }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Audit failed");

      setState((prev) => ({ ...prev, auditReport: data }));
      setMessage("Audit complete.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed running audit.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleResetData() {
    if (demoMode) {
      setMessage("Demo mode — data cannot be modified");
      return;
    }
    if (
      !window.confirm(
        "This will delete ALL saved data (runs, prompts, settings). Continue?",
      )
    )
      return;
    await clearSovereignStore(storageKeyForWorkspace(activeWsId));
    setState(defaultState);
    setMessage("All data cleared.");
  }

  function renderActiveTab() {
    if (activeTab === "Project Settings") {
      return (
        <ProjectSettingsTab
          brand={state.brand}
          onBrandChange={(patch) =>
            setState((prev) => ({
              ...prev,
              brand: { ...prev.brand, ...patch },
            }))
          }
          onReset={handleResetData}
        />
      );
    }

    if (activeTab === "Prompt Hub") {
      return (
        <PromptHubTab
          customPrompts={state.customPrompts}
          brandName={state.brand.brandName}
          busy={busy}
          activeProviderCount={state.activeProviders.length}
          onAddCustomPrompt={addCustomPrompt}
          onRemoveCustomPrompt={removeCustomPrompt}
          onUpdatePromptTags={updatePromptTags}
          onRunPrompt={callScrape}
          onBatchRunAll={batchRunAllPrompts}
        />
      );
    }

    if (activeTab === "Persona Fan-Out") {
      return (
        <FanOutTab
          prompt={state.prompt}
          personas={state.personas}
          fanoutPrompts={state.fanoutPrompts}
          busy={busy}
          onPromptChange={(value) =>
            setState((prev) => ({ ...prev, prompt: value }))
          }
          onPersonasChange={(value) =>
            setState((prev) => ({ ...prev, personas: value }))
          }
          onGenerateFanout={generatePersonaFanout}
          onRunPrompt={callScrape}
        />
      );
    }

    if (activeTab === "Niche Explorer") {
      return (
        <NicheExplorerTab
          niche={state.niche}
          nicheQueries={state.nicheQueries}
          trackedPrompts={state.customPrompts.map((p) => p.text)}
          onNicheChange={(value) =>
            setState((prev) => ({ ...prev, niche: value }))
          }
          onGenerateQueries={runNicheExplorer}
          onAddToTracking={addCustomPrompt}
        />
      );
    }

    if (activeTab === "Automation") {
      return (
        <AutomationTab
          scheduleEnabled={state.scheduleEnabled}
          scheduleIntervalMs={state.scheduleIntervalMs}
          lastScheduledRun={state.lastScheduledRun}
          driftAlerts={state.driftAlerts}
          busy={busy}
          onToggleSchedule={(enabled) =>
            setState((prev) => ({ ...prev, scheduleEnabled: enabled }))
          }
          onIntervalChange={(interval) =>
            setState((prev) => ({ ...prev, scheduleIntervalMs: interval }))
          }
          onRunNow={runScheduledBatch}
          onDismissAlert={dismissAlert}
          onDismissAllAlerts={dismissAllAlerts}
        />
      );
    }

    if (activeTab === "Competitor Battlecards") {
      return (
        <BattlecardsTab
          competitors={state.competitors}
          battlecards={state.battlecards}
          onCompetitorsChange={(competitors) =>
            setState((prev) => ({ ...prev, competitors }))
          }
          onBuildBattlecards={runBattlecards}
        />
      );
    }

    if (activeTab === "Responses") {
      return (
        <ReputationSourcesTab
          runs={state.runs}
          brandTerms={getBrandTerms()}
          competitorTerms={getCompetitorTerms()}
          runDeltas={runDeltas}
          onDeleteRun={deleteRun}
        />
      );
    }

    if (activeTab === "Visibility Analytics") {
      return (
        <VisibilityAnalyticsTab data={visibilityTrend} runs={state.runs} />
      );
    }

    if (activeTab === "Citations") {
      return (
        <PartnerDiscoveryTab
          partnerLeaderboard={partnerLeaderboard}
          brandWebsites={state.brand.websites}
        />
      );
    }

    if (activeTab === "Citation Opportunities") {
      return (
        <CitationOpportunitiesTab
          runs={state.runs}
          brandWebsites={state.brand.websites}
        />
      );
    }

    if (activeTab === "SRO Analysis") {
      return null; // rendered persistently below to preserve state
    }

    if (activeTab === "Documentation") {
      return <DocumentationTab />;
    }

    return (
      <AeoAuditTab
        auditUrl={state.auditUrl}
        auditReport={state.auditReport}
        onAuditUrlChange={(value) =>
          setState((prev) => ({ ...prev, auditUrl: value }))
        }
        onRunAudit={runAudit}
      />
    );
  }

  const themeIcon = theme === "dark" ? "🌙" : theme === "light" ? "☀️" : "💻";

  return (
    <div className="flex h-screen overflow-hidden text-th-text">
      {/* ── Mobile sidebar backdrop ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      {/* ── Sidebar ──────────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[250px] shrink-0 flex-col border-r border-th-border bg-th-sidebar transition-transform duration-200 md:static md:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        {/* Brand / Workspace switcher */}
        <div className="border-b border-th-border px-4 py-3">
          {demoMode ? (
            <div className="flex items-center gap-2 px-1 py-0.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-th-accent">
                <span className="text-xs font-bold text-th-text-inverse">
                  {(state.brand.brandName || "AE").slice(0, 2).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-th-text">
                  {state.brand.brandName || "AEO Tracker"}
                </div>
                <div className="text-xs text-th-text-muted">Demo workspace</div>
              </div>
            </div>
          ) : (
            <>
              <button
                onClick={() => setShowWsPicker(!showWsPicker)}
                className="flex w-full items-center gap-2 rounded-lg px-1 py-0.5 text-left hover:bg-th-card-hover transition-colors"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-th-accent">
                  <span className="text-xs font-bold text-th-text-inverse">
                    {(state.brand.brandName || "AE").slice(0, 2).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-th-text">
                    {state.brand.brandName || "AEO Tracker"}
                  </div>
                  {state.brand.websites.length > 0 && (
                    <div className="truncate text-xs text-th-text-muted">
                      {state.brand.websites[0].replace(/^https?:\/\//, "")}
                      {state.brand.websites.length > 1
                        ? ` +${state.brand.websites.length - 1}`
                        : ""}
                    </div>
                  )}
                </div>
                <span className="text-xs text-th-text-muted">
                  {showWsPicker ? "▲" : "▼"}
                </span>
              </button>

              {/* Workspace dropdown */}
              {showWsPicker && (
                <div className="mt-2 rounded-lg border border-th-border bg-th-card p-2 shadow-lg">
                  <div className="mb-2 text-xs font-medium text-th-text-muted uppercase tracking-wider">
                    Workspaces
                  </div>
                  <div className="max-h-[200px] space-y-1 overflow-auto">
                    {workspaces.map((ws) => (
                      <div key={ws.id} className="flex items-center gap-1">
                        <button
                          onClick={() => switchWorkspace(ws.id)}
                          className={`flex-1 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                            ws.id === activeWsId
                              ? "bg-th-accent-soft text-th-text-accent font-medium"
                              : "text-th-text-secondary hover:bg-th-card-hover"
                          }`}
                        >
                          {ws.brandName || "Untitled"}
                        </button>
                        {workspaces.length > 1 && (
                          <button
                            onClick={() => deleteWorkspace(ws.id)}
                            className="rounded p-1 text-xs text-th-text-muted hover:text-th-danger hover:bg-th-danger-soft"
                            title="Delete workspace"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      const name = window.prompt("Brand / workspace name:");
                      if (name?.trim()) createWorkspace(name.trim());
                    }}
                    className="mt-2 flex w-full items-center gap-1.5 rounded-md border border-dashed border-th-border px-2 py-1.5 text-sm text-th-text-accent hover:bg-th-accent-soft transition-colors"
                  >
                    <span className="text-base">+</span> New Brand
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-2">
          {tabs.map((tab) => {
            const active = activeTab === tab;
            const isSettings = tab === "Project Settings";
            return (
              <div key={tab}>
                {isSettings && (
                  <div className="mb-1 px-2 text-xs font-medium uppercase tracking-wider text-th-text-muted">
                    Setup
                  </div>
                )}
                <button
                  title={tabMeta[tab].tooltip}
                  onClick={() => {
                    setActiveTab(tab);
                    setSidebarOpen(false);
                  }}
                  className={`group mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                    active
                      ? "bg-th-accent-soft text-th-text font-medium"
                      : "text-th-text-secondary hover:bg-th-card-hover hover:text-th-text"
                  }`}
                  style={
                    active
                      ? { boxShadow: "inset 3px 0 0 var(--th-accent)" }
                      : undefined
                  }
                >
                  <span
                    className={
                      active
                        ? "text-th-text-accent"
                        : "text-th-text-muted group-hover:text-th-text-secondary"
                    }
                  >
                    {tabIcons[tab]}
                  </span>
                  {tabMeta[tab].title}
                  {tab === "Automation" && unreadAlertCount > 0 && (
                    <span className="ml-auto rounded-full bg-th-danger px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                      {unreadAlertCount}
                    </span>
                  )}
                </button>
                {isSettings && (
                  <div className="mb-1 mt-2 border-t border-th-border pt-2 px-2 text-xs font-medium uppercase tracking-wider text-th-text-muted">
                    Pillars
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Bright Data CTA */}
        <div className="border-t border-th-border px-3 py-3">
          <a
            href="https://brightdata.com/?utm_source=geo-tracker-os"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col items-center gap-2 rounded-xl bg-gradient-to-br from-[#1a6dff] via-[#3b82f6] to-[#6366f1] px-4 py-4 shadow-lg transition-all hover:shadow-xl hover:brightness-110"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            </div>
            <div className="text-center">
              <div className="text-sm font-bold text-white">
                Powered by Bright Data
              </div>
              <div className="mt-0.5 text-xs text-white/70">
                Web data infrastructure for AI
              </div>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-medium text-white transition-colors group-hover:bg-white/25">
              Learn more
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </div>
          </a>
        </div>

        {/* Footer info */}
        <div className="border-t border-th-border px-4 py-2 text-center text-xs leading-relaxed text-th-text-muted">
          <div>
            {demoMode
              ? "Read-only demo"
              : `Local-first · ${workspaces.length} workspace${workspaces.length > 1 ? "s" : ""}`}
          </div>
          <div className="mt-1">
            Built by{" "}
            <a
              href="https://www.linkedin.com/in/daniel-shashko/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-th-text-accent hover:underline"
            >
              Daniel Shashko
            </a>
          </div>
        </div>
      </aside>

      {/* ── Main content ───────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Demo banner */}
        {demoMode && (
          <div className="flex shrink-0 items-center justify-center gap-2 border-b border-th-border bg-th-accent-soft px-4 py-1.5 text-xs font-medium text-th-text-accent">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-th-accent" />
            <span>
              {demoReason === "no-key"
                ? "Sample data — add BRIGHT_DATA_KEY to your environment to track live AI engines"
                : "Read-only demo — sample data, live API calls disabled"}
            </span>
          </div>
        )}
        {/* Toolbar */}
        <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-th-border bg-th-card px-3 py-2 md:gap-3 md:px-5 md:py-2.5">
          {/* Hamburger for mobile */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="rounded-md border border-th-border p-1.5 text-th-text-muted hover:bg-th-card-hover md:hidden"
            aria-label="Toggle sidebar"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <h1 className="mr-auto text-sm font-semibold text-th-text md:text-base">
            {tabMeta[activeTab].title}
          </h1>
          <label className="hidden text-sm text-th-text-muted sm:inline">
            Models
          </label>
          <div className="flex items-center gap-1 overflow-x-auto">
            {ALL_PROVIDERS.map((p) => {
              const active = state.activeProviders.includes(p);
              return (
                <button
                  key={p}
                  onClick={() =>
                    setState((prev) => {
                      const next = active
                        ? prev.activeProviders.filter((x) => x !== p)
                        : [...prev.activeProviders, p];
                      if (next.length === 0) return prev;
                      return {
                        ...prev,
                        activeProviders: next,
                        provider: next[0],
                      };
                    })
                  }
                  className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "bg-th-accent text-th-text-inverse"
                      : "bg-th-card-alt text-th-text-muted hover:bg-th-card-hover hover:text-th-text-secondary"
                  }`}
                  title={
                    active
                      ? `Deselect ${PROVIDER_LABELS[p]}`
                      : `Select ${PROVIDER_LABELS[p]}`
                  }
                >
                  {PROVIDER_LABELS[p]}
                </button>
              );
            })}
            <button
              onClick={() =>
                setState((prev) => ({
                  ...prev,
                  activeProviders:
                    prev.activeProviders.length === ALL_PROVIDERS.length
                      ? [prev.provider]
                      : [...ALL_PROVIDERS],
                }))
              }
              className="ml-1 rounded-md border border-th-border px-2 py-1 text-xs text-th-text-muted hover:bg-th-card-hover hover:text-th-text-secondary"
              title={
                state.activeProviders.length === ALL_PROVIDERS.length
                  ? "Select only one"
                  : "Select all models"
              }
            >
              {state.activeProviders.length === ALL_PROVIDERS.length
                ? "1"
                : "All"}
            </button>
          </div>

          {/* Country / geo selector */}
          <label className="hidden text-sm text-th-text-muted lg:inline">
            Region
          </label>
          <select
            value={state.country}
            onChange={(e) =>
              setState((prev) => ({ ...prev, country: e.target.value }))
            }
            className="rounded-md border border-th-border bg-th-card-alt px-2 py-1 text-xs text-th-text-secondary hover:bg-th-card-hover"
            title="Country to run AI-visibility checks from (Bright Data geolocation)"
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.label}
              </option>
            ))}
          </select>

          {/* Theme toggle */}
          <button
            onClick={cycleTheme}
            className="rounded-md border border-th-border px-2 py-1 text-sm hover:bg-th-card-hover transition-colors"
            title={`Theme: ${theme}`}
          >
            {themeIcon}
          </button>

          <span
            className={`rounded-md px-2.5 py-1 text-xs ${busy ? "animate-pulse bg-th-accent-soft text-th-text-accent" : "bg-th-card-alt text-th-text-muted"}`}
          >
            {message || "Ready"}
          </span>
        </header>

        {/* Scrollable body */}
        <main className="flex-1 overflow-y-auto bg-th-bg px-3 py-3 md:px-5 md:py-4">
          {/* KPI strip — overview (Visibility Analytics) only */}
          {activeTab === "Visibility Analytics" && (
            <section className="mb-4 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-6">
              <KpiCard label="Total Runs" value={state.runs.length} />
              <KpiCard
                label="Avg Visibility"
                value={
                  state.runs.length > 0
                    ? `${Math.round(state.runs.reduce((a, r) => a + (r.visibilityScore ?? 0), 0) / state.runs.length)}%`
                    : "—"
                }
                delta={kpiVisibilityDelta}
                small
                onInfoClick={() => setShowScoreInfo(!showScoreInfo)}
              />
              <KpiCard
                label="Brand Mentioned"
                value={
                  state.runs.filter((r) => (r.brandMentions?.length ?? 0) > 0)
                    .length
                }
              />
              <KpiCard label="Captured Sources" value={totalSources} />
              <KpiCard label="Citation Opps" value={citationOpportunities} />
              <KpiCard
                label="Latest Run"
                value={
                  latestRun
                    ? latestRun.createdAt.replace("T", " ").slice(0, 16)
                    : "—"
                }
                small
              />
            </section>
          )}

          {/* ── Movers strip — overview only ── */}
          {activeTab === "Visibility Analytics" && movers.length > 0 && (
            <section className="mb-4 rounded-xl border border-th-border bg-th-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-base">📊</span>
                <h3 className="text-sm font-semibold text-th-text">
                  Top Movers
                </h3>
                <span className="text-xs text-th-text-muted">
                  Biggest visibility changes between runs
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {movers.map((m, i) => {
                  const up = m.delta > 0;
                  return (
                    <div
                      key={`${m.prompt.slice(0, 20)}-${m.provider}-${i}`}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                        up
                          ? "border-th-success/30 bg-th-success-soft"
                          : "border-th-danger/30 bg-th-danger-soft"
                      }`}
                    >
                      <span
                        className={`text-lg font-bold ${up ? "text-th-success" : "text-th-danger"}`}
                      >
                        {up ? "↑" : "↓"}
                        {Math.abs(m.delta)}
                      </span>
                      <div className="min-w-0">
                        <div
                          className="truncate text-xs font-medium text-th-text"
                          style={{ maxWidth: "180px" }}
                        >
                          {m.prompt.length > 50
                            ? m.prompt.slice(0, 47) + "…"
                            : m.prompt}
                        </div>
                        <div className="text-xs text-th-text-muted">
                          {PROVIDER_LABELS[m.provider]} · {m.previousScore}→
                          {m.currentScore}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Scoring explanation — overview only */}
          {activeTab === "Visibility Analytics" && showScoreInfo && (
            <section className="mb-4 rounded-xl border border-th-border bg-th-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-th-text">
                  How Visibility Scoring Works
                </h3>
                <button
                  onClick={() => setShowScoreInfo(false)}
                  className="text-th-text-muted hover:text-th-text text-lg"
                >
                  ✕
                </button>
              </div>
              <p className="text-sm text-th-text-secondary mb-3">
                The visibility score (0–100) measures how prominently your brand
                appears in AI model responses. Each factor contributes points:
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <ScoreFactorCard
                  emoji="🔍"
                  label="Brand Mentioned"
                  points="+30"
                  desc="Your brand name or alias appears in the response"
                />
                <ScoreFactorCard
                  emoji="🏆"
                  label="Prominent Position"
                  points="+20"
                  desc="Brand is mentioned in the first 200 characters"
                />
                <ScoreFactorCard
                  emoji="🔁"
                  label="Multiple Mentions"
                  points="+8 to +15"
                  desc="Brand appears 2+ times (8pts) or 3+ times (15pts)"
                />
                <ScoreFactorCard
                  emoji="🔗"
                  label="Website Cited"
                  points="+20"
                  desc="Your website URL appears in the cited sources"
                />
                <ScoreFactorCard
                  emoji="👍"
                  label="Positive Sentiment"
                  points="+15"
                  desc="Response uses positive language about your brand"
                />
                <ScoreFactorCard
                  emoji="😐"
                  label="Neutral Sentiment"
                  points="+5"
                  desc="Response mentions brand in a neutral context"
                />
              </div>
            </section>
          )}

          {/* Active tab panel */}
          <section className="rounded-xl border border-th-border bg-th-card p-5 shadow-sm">
            {renderActiveTab()}
          </section>
          {/* SRO Analysis stays mounted to preserve in-flight state */}
          <div className={activeTab === "SRO Analysis" ? "" : "hidden"}>
            <section className="rounded-xl border border-th-border bg-th-card p-5 shadow-sm">
              <SROAnalysisTab demoMode={demoMode} />
            </section>
          </div>
          <section className="mt-3 rounded-lg border border-th-border bg-th-card px-4 py-3">
            <div className="text-xs uppercase tracking-wider font-medium text-th-text-muted">
              What this tab does
            </div>
            <p className="mt-1 text-sm leading-relaxed text-th-text-secondary">
              {tabMeta[activeTab].details}
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}

/* ── Score Factor Card ────────────────────────────────────────── */
function ScoreFactorCard({
  emoji,
  label,
  points,
  desc,
}: {
  emoji: string;
  label: string;
  points: string;
  desc: string;
}) {
  return (
    <div className="rounded-lg border border-th-border bg-th-card-alt px-3 py-2.5">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{emoji}</span>
        <span className="text-sm font-medium text-th-text">{label}</span>
        <span className="ml-auto text-sm font-semibold text-th-accent">
          {points}
        </span>
      </div>
      <p className="text-xs text-th-text-muted leading-relaxed">{desc}</p>
    </div>
  );
}

/* ── Compact KPI Card ─────────────────────────────────────────── */
function KpiCard({
  label,
  value,
  small,
  delta,
  onInfoClick,
}: {
  label: string;
  value: string | number;
  small?: boolean;
  delta?: number | null;
  onInfoClick?: () => void;
}) {
  return (
    <div className="rounded-xl border border-th-border bg-th-card px-4 py-3 shadow-sm">
      <div className="flex items-center gap-1">
        <div className="text-xs font-medium uppercase tracking-wider text-th-text-muted">
          {label}
        </div>
        {onInfoClick && (
          <button
            onClick={onInfoClick}
            className="text-th-text-muted hover:text-th-text-accent text-xs"
            title="How is this calculated?"
          >
            ⓘ
          </button>
        )}
      </div>
      <div
        className={`mt-1 flex items-baseline gap-1.5 font-semibold tracking-tight text-th-text ${small ? "text-lg" : "text-3xl"}`}
      >
        {value}
        {delta != null && delta !== 0 && (
          <span
            className={`text-xs font-bold ${delta > 0 ? "text-th-success" : "text-th-danger"}`}
          >
            {delta > 0 ? "↑" : "↓"}
            {Math.abs(delta)}
          </span>
        )}
      </div>
    </div>
  );
}
