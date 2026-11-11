import type {
  AppState,
  ScrapeRun,
  DriftAlert,
  Battlecard,
  AuditReport,
  Provider,
  TaggedPrompt,
} from "@/components/dashboard/types";

/*
 * Demo dataset.
 *
 * The tracked brand is a fictional healthy meal-kit subscription ("Forkful")
 * with fictional competitors. This keeps the demo neutral and avoids implying
 * anything about real companies.
 */

/* ─────────────────────────  Deterministic helpers ───────────────────────── */
/**
 * Fixed dates — never call argument-less new Date(). SSR and client produce
 * identical output. Eight weekly batches so the trend chart shows real movement.
 */
const BATCH_DATES = [
  "2026-01-03T10:00:00.000Z",
  "2026-01-10T10:00:00.000Z",
  "2026-01-17T10:00:00.000Z",
  "2026-01-24T10:00:00.000Z",
  "2026-01-31T10:00:00.000Z",
  "2026-02-07T10:00:00.000Z",
  "2026-02-11T14:30:00.000Z",
  "2026-02-14T09:00:00.000Z",
];
const NUM_BATCHES = BATCH_DATES.length;

/** Simple seeded hash replacing Math.random() — deterministic across SSR & client */
function seedScore(
  base: number,
  providerIdx: number,
  promptIdx: number,
  batch: number,
): number {
  const h =
    ((base + providerIdx * 17 + promptIdx * 31 + batch * 53) * 2654435761) >>>
    0;
  return h % 100;
}

/* ─────────────────────────  Brand + prompts ───────────────────────── */
const BRAND_NAME = "Forkful";

const PROMPTS: TaggedPrompt[] = [
  {
    text: "What are the best healthy meal kit delivery services for busy families in 2026?",
    tags: ["comparison", "families"],
  },
  {
    text: "How can a meal kit subscription help reduce food waste at home?",
    tags: ["sustainability"],
  },
  {
    text: "Compare the top meal kit services for couples who want quick weeknight dinners.",
    tags: ["comparison", "couples"],
  },
  {
    text: "What should I look for when choosing a healthy meal kit subscription?",
    tags: ["education"],
  },
  {
    text: "Which meal kit services offer the best vegetarian and plant-based options?",
    tags: ["vegetarian", "options"],
  },
];

const PROVIDERS: Provider[] = [
  "chatgpt",
  "perplexity",
  "gemini",
  "google_ai",
];

const SAMPLE_SOURCES: Record<string, string[]> = {
  "chatgpt-0": [
    "https://www.nytimes.com/wirecutter/reviews/best-meal-kit-delivery-services/",
    "https://www.goodhousekeeping.com/food-products/meal-kit-reviews/",
    "https://forkful.com/plans",
    "https://greenplate.com/menu",
    "https://www.cnet.com/health/nutrition/best-meal-kit-delivery/",
  ],
  "perplexity-0": [
    "https://www.nytimes.com/wirecutter/reviews/best-meal-kit-delivery-services/",
    "https://www.goodhousekeeping.com/food-products/meal-kit-reviews/",
    "https://forkful.com/",
    "https://www.tomsguide.com/best-picks/best-meal-kit-delivery",
  ],
  "gemini-0": [
    "https://www.goodhousekeeping.com/food-products/meal-kit-reviews/",
    "https://forkful.com/plans",
    "https://greenplate.com/menu",
  ],
  "chatgpt-1": [
    "https://www.seriouseats.com/how-meal-kits-reduce-food-waste",
    "https://forkful.com/sustainability",
    "https://www.epa.gov/recycle/reducing-wasted-food-home",
  ],
  "perplexity-1": [
    "https://www.seriouseats.com/how-meal-kits-reduce-food-waste",
    "https://forkful.com/sustainability",
    "https://greenplate.com/sustainability",
  ],
  "chatgpt-2": [
    "https://www.nytimes.com/wirecutter/reviews/best-meal-kit-delivery-services/",
    "https://forkful.com/express",
    "https://saveurkits.com/",
    "https://hearthbox.com/plans",
  ],
  "perplexity-2": [
    "https://www.tomsguide.com/best-picks/best-meal-kit-delivery",
    "https://forkful.com/express",
    "https://saveurkits.com/",
  ],
  "chatgpt-3": [
    "https://www.goodhousekeeping.com/food-products/meal-kit-reviews/",
    "https://www.consumerreports.org/meal-kit-delivery/",
    "https://forkful.com/how-it-works",
  ],
  "chatgpt-4": [
    "https://forkful.com/plant-based",
    "https://greenplate.com/menu",
    "https://saveurkits.com/vegetarian",
    "https://www.goodhousekeeping.com/food-products/meal-kit-reviews/",
  ],
  "perplexity-4": [
    "https://forkful.com/plant-based",
    "https://greenplate.com/menu",
    "https://www.cnet.com/health/nutrition/best-meal-kit-delivery/",
  ],
  "google_ai-4": [
    "https://forkful.com/plant-based",
    "https://greenplate.com/menu",
    "https://saveurkits.com/vegetarian",
  ],
};

const ANSWER_TEMPLATES: Record<string, string> = {
  "chatgpt-0": `Here are some of the best healthy meal-kit delivery services for busy families in 2026:

**1. Forkful** — Chef-designed, nutritionist-approved menus with family-size portions and 15-minute "express" recipes. Flexible weekly plans and mostly recyclable packaging make it a strong pick for busy households.

**2. GreenPlate** — Certified-organic kits with a large rotating menu. Good for families who prioritise organic produce.

**3. Hearthbox** — Budget-friendly, kid-approved comfort meals at a low price per serving.

**4. Saveur Kits** — Gourmet, restaurant-style recipes for families who enjoy a more involved cook.

Key things to weigh: portion sizes, recipe time, dietary filters, and packaging waste.`,

  "perplexity-0": `Based on recent testing, the top healthy meal kits for families in 2026 include:

1. **Forkful** — Nutritionist-designed menus, family portions, and quick 15–30 minute recipes. Praised for fresh ingredients and recyclable packaging.
2. **GreenPlate** — Certified-organic ingredients with a wide weekly menu.
3. **Hearthbox** — Affordable, kid-friendly comfort meals.

Reviewers on Wirecutter and Good Housekeeping highlight recipe variety, ingredient freshness, and how easily each kit fits into a busy week.`,

  "gemini-0": `Several meal-kit services stand out for busy families this year:

• **Forkful** — Healthy, fast recipes with clear nutrition labels and family-size portions
• **GreenPlate** — Organic produce and a seasonal rotating menu
• **Hearthbox** — Low cost and kid-approved comfort food

Families should compare cook time, dietary options, and packaging when choosing.`,

  "chatgpt-1": `Meal-kit subscriptions cut household food waste in a few concrete ways:

**Pre-portioned ingredients** — You get exactly what a recipe needs, so half-used produce doesn't rot in the fridge.

**Planned menus** — Choosing meals up front reduces impulse grocery buys that go uneaten.

**Right-sized proteins** — Services like Forkful portion proteins per serving, avoiding the "bought a big pack, used half" problem.

**Recyclable packaging** — Forkful and GreenPlate use mostly recyclable or compostable packaging, though insulation liners vary.

To maximise the benefit, pick a plan sized to how many nights you actually cook.`,

  "chatgpt-2": `Here's how the leading meal kits compare for couples who want fast weeknight dinners:

| Service | Best for | Avg cook time | Price/serving |
|---------|----------|---------------|---------------|
| Forkful | Healthy & quick | 15–25 min | $$ |
| GreenPlate | Organic | 30–40 min | $$$ |
| Hearthbox | Budget comfort | 25–35 min | $ |
| Saveur Kits | Gourmet | 40–50 min | $$$ |

**Forkful** is the strongest fit for couples short on time, with 15-minute express recipes and two-person portions. **Saveur Kits** suits couples who enjoy a longer, more involved cook.`,

  "chatgpt-4": `The meal-kit services with the strongest vegetarian and plant-based ranges in 2026 include:

1. **Forkful** — A dedicated plant-based plan with high-protein vegetarian recipes and clear nutrition labels.
2. **GreenPlate** — Organic veggie boxes built around seasonal produce.
3. **Saveur Kits** — Elevated vegetarian recipes for a more gourmet experience.

Most households mix vegetarian and omnivore meals, so flexible per-meal selection (which Forkful and GreenPlate both offer) often matters more than a fully veg-only plan.`,
};

// US-heavy spread so the "Visibility by country" panel is populated in demo mode.
const DEMO_COUNTRIES = ["US", "US", "US", "GB", "DE", "CA"];

function buildRunBase(prompt: string, provider: Provider, batch: number) {
  const country =
    DEMO_COUNTRIES[
      (PROVIDERS.indexOf(provider) + batch) % DEMO_COUNTRIES.length
    ];
  return { provider, prompt, createdAt: BATCH_DATES[batch], country };
}

/** Answers used when the brand is NOT present — competitors are cited instead. */
const COMPETITOR_ANSWERS: string[] = [
  `The best-reviewed meal-kit services right now are GreenPlate, Hearthbox, and Saveur Kits. GreenPlate leads on organic ingredients, Hearthbox is the budget pick for families, and Saveur Kits focuses on gourmet, restaurant-style recipes. Most write-ups draw on Wirecutter and Good Housekeeping testing.`,
  `For families comparing meal kits, GreenPlate and Hearthbox come up most often — GreenPlate for organic produce and Hearthbox for low cost and kid-friendly menus. Saveur Kits is the choice for more adventurous home cooks.`,
  `Among meal-kit subscriptions, GreenPlate, Hearthbox, and Saveur Kits are frequently recommended. Buyers weigh ingredient quality, price per serving, and recipe time, with review sites like CNET and Serious Eats as common references.`,
];

const COMPETITOR_SOURCES: string[] = [
  "https://www.nytimes.com/wirecutter/reviews/best-meal-kit-delivery-services/",
  "https://www.goodhousekeeping.com/food-products/meal-kit-reviews/",
  "https://greenplate.com/menu",
  "https://hearthbox.com/plans",
  "https://www.cnet.com/health/nutrition/best-meal-kit-delivery/",
];

/**
 * Deterministic brand-presence gate. Visibility improves over time, so later
 * batches mention the brand more often — this produces a realistic upward trend
 * and leaves earlier runs where competitors are cited but we're absent.
 */
function brandIsMentioned(
  pIdx: number,
  promptIdx: number,
  batch: number,
): boolean {
  const roll = seedScore(7, pIdx, promptIdx, batch) % 100;
  const threshold = 26 + batch * 9; // batch 0 ≈ 26% → final batch ≈ 89%
  return roll < threshold;
}

function buildRun(
  prompt: string,
  provider: Provider,
  promptIdx: number,
  batch: number,
): ScrapeRun {
  const key = `${provider}-${promptIdx}`;
  const pIdx = PROVIDERS.indexOf(provider);
  const jitter = seedScore(42, pIdx, promptIdx, batch) % 30;
  const base = buildRunBase(prompt, provider, batch);

  if (!brandIsMentioned(pIdx, promptIdx, batch)) {
    // Brand absent — competitors cited. Drives the Citation Opportunities tab.
    const answer =
      COMPETITOR_ANSWERS[
        (pIdx + promptIdx + batch) % COMPETITOR_ANSWERS.length
      ];
    const sources = COMPETITOR_SOURCES.slice(0, 2 + ((pIdx + batch) % 3));
    return {
      ...base,
      answer,
      sources,
      visibilityScore: Math.min(40, 5 + (jitter % 25)),
      sentiment: "not-mentioned",
      brandMentions: [],
      competitorMentions: ["GreenPlate", "Hearthbox", "Saveur Kits"],
    };
  }

  // Brand mentioned — use a rich template when available, else a default.
  const sources = SAMPLE_SOURCES[key] ?? [
    "https://www.nytimes.com/wirecutter/reviews/best-meal-kit-delivery-services/",
    "https://forkful.com/",
    "https://greenplate.com/menu",
  ];
  const answer =
    ANSWER_TEMPLATES[key] ??
    `For "${prompt}", reviewers point to a mix of services. ${BRAND_NAME} stands out for nutritionist-designed menus, family-size portions, and quick recipes, while GreenPlate and Hearthbox are common alternatives. Fresh ingredients, dietary flexibility, and packaging waste are the main things buyers compare.`;

  const score = Math.min(100, 58 + jitter + batch * 2);
  const isNegative = seedScore(13, pIdx, promptIdx, batch) % 100 < 9;
  const hasCompetitor = /greenplate|hearthbox|saveur/i.test(answer);

  return {
    ...base,
    answer,
    sources,
    visibilityScore: isNegative ? Math.max(34, score - 26) : score,
    sentiment: isNegative ? "negative" : score > 64 ? "positive" : "neutral",
    brandMentions: [BRAND_NAME],
    competitorMentions: hasCompetitor
      ? [
          ...(/greenplate/i.test(answer) ? ["GreenPlate"] : []),
          ...(/hearthbox/i.test(answer) ? ["Hearthbox"] : []),
          ...(/saveur/i.test(answer) ? ["Saveur Kits"] : []),
        ]
      : [],
  };
}

function generateRuns(): ScrapeRun[] {
  const runs: ScrapeRun[] = [];

  for (let batch = 0; batch < NUM_BATCHES; batch++) {
    PROMPTS.forEach((prompt, pIdx) => {
      const subset = PROVIDERS.filter((_, i) => (i + pIdx + batch) % 3 !== 2);
      subset.forEach((provider) => {
        runs.push(buildRun(prompt.text, provider, pIdx, batch));
      });
    });
  }

  return runs.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/* ─────────────────────────  Battlecards ───────────────────────── */
const demoBattlecards: Battlecard[] = [
  {
    competitor: "GreenPlate",
    sentiment: "neutral",
    summary:
      "Organic-first meal kit with a large rotating menu and strong sustainability messaging. Higher price per serving and longer cook times than Forkful.",
    sections: [
      {
        heading: "Strengths",
        points: [
          "Certified-organic ingredients",
          "Wide seasonal menu",
          "Strong sustainability story",
          "Good Wirecutter coverage",
        ],
      },
      {
        heading: "Weaknesses",
        points: [
          "Higher price per serving",
          "Longer average cook time",
          "Fewer quick-recipe options",
          "No express plan",
        ],
      },
      {
        heading: "AI Visibility",
        points: [
          "Frequently cited for 'organic meal kit' queries",
          "Strong on Good Housekeeping",
          "Wins some Gemini citations via long-form blog",
        ],
      },
    ],
  },
  {
    competitor: "Hearthbox",
    sentiment: "neutral",
    summary:
      "Budget, family-focused comfort-food kit with kid-friendly menus. Competes on price; less emphasis on nutrition and freshness than Forkful.",
    sections: [
      {
        heading: "Strengths",
        points: [
          "Lowest price per serving",
          "Kid-approved comfort menus",
          "Simple, fast recipes",
          "Wide availability",
        ],
      },
      {
        heading: "Weaknesses",
        points: [
          "Less emphasis on nutrition",
          "Smaller dietary range",
          "More packaging waste",
          "Limited plant-based options",
        ],
      },
      {
        heading: "AI Visibility",
        points: [
          "Cited for 'cheapest meal kit' queries",
          "Active on Reddit threads",
          "Weaker on health-focused prompts",
        ],
      },
    ],
  },
  {
    competitor: "Saveur Kits",
    sentiment: "neutral",
    summary:
      "Gourmet, restaurant-style meal kit for adventurous home cooks. Premium positioning; longer prep makes it a weak fit for the busy-family use case Forkful targets.",
    sections: [
      {
        heading: "Strengths",
        points: [
          "Elevated, restaurant-style recipes",
          "Premium ingredients",
          "Strong vegetarian gourmet range",
          "Loyal foodie audience",
        ],
      },
      {
        heading: "Weaknesses",
        points: [
          "Long cook times (40–50 min)",
          "Highest price point",
          "Not built for quick weeknights",
          "Niche appeal",
        ],
      },
      {
        heading: "AI Visibility",
        points: [
          "Cited for 'gourmet meal kit' queries",
          "Mentioned in foodie roundups",
          "Rarely surfaced for 'quick' or 'budget' prompts",
        ],
      },
    ],
  },
];

/* ─────────────────────────  Audit Report ───────────────────────── */
const demoAuditReport: AuditReport = {
  url: "https://forkful.com",
  score: 78,
  checks: [
    {
      id: "llms-txt",
      label: "llms.txt present",
      category: "discovery",
      pass: true,
      value: "Found",
      detail: "/llms.txt returns 200 with valid directives",
    },
    {
      id: "robots-txt",
      label: "robots.txt configured",
      category: "discovery",
      pass: true,
      value: "Found",
      detail: "robots.txt allows major AI crawlers",
    },
    {
      id: "schema-org",
      label: "Schema.org markup",
      category: "structure",
      pass: true,
      value: "5 types",
      detail:
        "Organization, WebSite, FAQPage, Recipe, Product schemas detected",
    },
    {
      id: "faq-schema",
      label: "FAQ schema",
      category: "structure",
      pass: true,
      value: "Present",
      detail: "FAQPage schema with 8 questions found",
    },
    {
      id: "bluf-style",
      label: "BLUF-style content",
      category: "content",
      pass: true,
      value: "Strong",
      detail: "Key pages lead with conclusions before detail",
    },
    {
      id: "heading-structure",
      label: "Heading hierarchy",
      category: "content",
      pass: true,
      value: "Clean",
      detail: "Proper H1→H2→H3 nesting throughout",
    },
    {
      id: "meta-descriptions",
      label: "Meta descriptions",
      category: "content",
      pass: false,
      value: "Missing on 2 pages",
      detail: "/pricing and /express lack meta descriptions",
    },
    {
      id: "page-speed",
      label: "Page speed",
      category: "technical",
      pass: true,
      value: "92/100",
      detail: "LCP: 1.2s, FID: 45ms, CLS: 0.02",
    },
    {
      id: "https",
      label: "HTTPS enabled",
      category: "technical",
      pass: true,
      value: "Active",
      detail: "Valid SSL certificate, HSTS enabled",
    },
    {
      id: "render-test",
      label: "JS rendering",
      category: "rendering",
      pass: true,
      value: "Works",
      detail: "Content accessible without JavaScript",
    },
    {
      id: "canonical-tags",
      label: "Canonical tags",
      category: "technical",
      pass: true,
      value: "Present",
      detail: "All pages have self-referencing canonicals",
    },
    {
      id: "sitemap",
      label: "XML Sitemap",
      category: "discovery",
      pass: true,
      value: "Found",
      detail: "sitemap.xml with 24 URLs, all returning 200",
    },
  ],
  llmsTxtPresent: true,
  schemaMentions: 5,
  blufDensity: 0.85,
  pass: { llmsTxt: true, schema: true, bluf: true },
};

/* ─────────────────────────  Drift Alerts ───────────────────────── */
const demoDriftAlerts: DriftAlert[] = [
  {
    id: "drift-demo-1",
    prompt:
      "What are the best healthy meal kit delivery services for busy families in 2026?",
    provider: "chatgpt",
    oldScore: 62,
    newScore: 81,
    delta: 19,
    createdAt: "2026-02-13T08:00:00.000Z",
    dismissed: false,
  },
  {
    id: "drift-demo-2",
    prompt:
      "Compare the top meal kit services for couples who want quick weeknight dinners.",
    provider: "perplexity",
    oldScore: 45,
    newScore: 31,
    delta: -14,
    createdAt: "2026-02-12T16:00:00.000Z",
    dismissed: false,
  },
];

/* ─────────────────────────  Full State ───────────────────────── */
export const DEMO_STATE: AppState = {
  brand: {
    brandName: "Forkful",
    brandAliases: "Forkful Kitchen, Forkful Meals",
    websites: ["https://forkful.com", "https://blog.forkful.com"],
    industry: "Meal-kit delivery / DTC food",
    keywords:
      "meal kit delivery, healthy meal subscription, dinner kits, plant-based meals, food waste",
    description:
      "Chef-designed healthy meal kits delivered weekly, with flexible plans, family-size portions, and minimal food waste.",
  },
  provider: "chatgpt",
  activeProviders: [
    "chatgpt",
    "perplexity",
    "gemini",
    "google_ai",
  ],
  country: "US",
  prompt:
    "What are the best healthy meal kit delivery services for busy families in 2026?",
  customPrompts: PROMPTS,
  personas:
    "Busy Parent\nHealth-Conscious Professional\nCouple Cooking at Home\nVegetarian Foodie\nMeal-Prep Beginner",
  fanoutPrompts: [
    "[Busy Parent] What meal kit is best for getting healthy dinners on the table fast for a family of four?",
    "[Health-Conscious Professional] Which meal kit has the best macros and clean ingredients for weeknight cooking?",
    "[Couple Cooking at Home] What's the best two-person meal kit for quick weeknight dinners?",
    "[Vegetarian Foodie] Which meal kit has the most interesting vegetarian and plant-based recipes?",
    "[Meal-Prep Beginner] What's the easiest meal kit to start with if I barely cook?",
  ],
  niche: "healthy meal-kit delivery for busy households",
  nicheQueries: [
    "best meal kit for families 2026",
    "healthiest meal kit subscriptions",
    "meal kits that reduce food waste",
    "best vegetarian meal kit delivery",
    "cheapest meal kit for two people",
  ],
  cronExpr: "0 */6 * * *",
  githubWorkflow:
    "name: forkful-visibility\non:\n  schedule:\n    - cron: '0 */6 * * *'\njobs:\n  track:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm ci && npm run test:scraper",
  competitors: [
    {
      name: "greenplate.com",
      aliases: ["GreenPlate"],
      websites: ["https://greenplate.com"],
    },
    {
      name: "hearthbox.com",
      aliases: ["Hearthbox"],
      websites: ["https://hearthbox.com"],
    },
    {
      name: "saveurkits.com",
      aliases: ["Saveur Kits", "Saveur"],
      websites: ["https://saveurkits.com"],
    },
  ],
  battlecards: demoBattlecards,
  runs: generateRuns(),
  auditUrl: "https://forkful.com",
  auditReport: demoAuditReport,
  scheduleEnabled: true,
  scheduleIntervalMs: 21600000,
  lastScheduledRun: "2026-02-14T06:00:00.000Z",
  driftAlerts: demoDriftAlerts,
};
