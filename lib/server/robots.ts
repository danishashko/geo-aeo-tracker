// Minimal robots.txt evaluator following RFC 9309 (the rules Google, OpenAI,
// Anthropic and Perplexity document for their crawlers):
//   - rules belong to the group(s) whose User-agent matches the crawler's
//     product token, case-insensitively; groups naming the same agent merge
//   - a crawler with no group of its own falls back to the `*` group
//   - the longest matching rule wins, and Allow wins a tie
//   - `*` matches any run of characters and a trailing `$` anchors the end
// Kept free of Next/server imports so it can be unit-tested with plain Node.

export type RobotsRule = { allow: boolean; pattern: string };
export type RobotsGroup = { agents: string[]; rules: RobotsRule[] };

export type AiCrawler = {
  token: string;
  owner: string;
  /** "answers": blocking it removes the page from that engine's live answers.
   *  "training": blocking it only opts out of model training. */
  purpose: "answers" | "training";
  powers: string;
};

export const AI_CRAWLERS: AiCrawler[] = [
  { token: "OAI-SearchBot", owner: "OpenAI", purpose: "answers", powers: "ChatGPT search results" },
  { token: "ChatGPT-User", owner: "OpenAI", purpose: "answers", powers: "pages ChatGPT opens for a user" },
  { token: "PerplexityBot", owner: "Perplexity", purpose: "answers", powers: "Perplexity search results" },
  { token: "Perplexity-User", owner: "Perplexity", purpose: "answers", powers: "pages Perplexity opens for a user" },
  { token: "Claude-SearchBot", owner: "Anthropic", purpose: "answers", powers: "Claude search results" },
  { token: "Claude-User", owner: "Anthropic", purpose: "answers", powers: "pages Claude opens for a user" },
  { token: "Googlebot", owner: "Google", purpose: "answers", powers: "Google AI Mode and AI Overviews" },
  { token: "Google-Extended", owner: "Google", purpose: "answers", powers: "Gemini app grounding and Gemini training" },
  { token: "Bingbot", owner: "Microsoft", purpose: "answers", powers: "Microsoft Copilot (Bing index)" },
  { token: "GPTBot", owner: "OpenAI", purpose: "training", powers: "OpenAI model training" },
  { token: "ClaudeBot", owner: "Anthropic", purpose: "training", powers: "Anthropic model training" },
  { token: "Applebot-Extended", owner: "Apple", purpose: "training", powers: "Apple model training" },
  { token: "Meta-ExternalAgent", owner: "Meta", purpose: "training", powers: "Meta model training" },
  { token: "CCBot", owner: "Common Crawl", purpose: "training", powers: "Common Crawl (used by many LLMs)" },
  { token: "Bytespider", owner: "ByteDance", purpose: "training", powers: "ByteDance model training" },
];

export function parseRobots(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  // A run of consecutive User-agent lines shares one group; the first rule
  // line closes the run, so the next User-agent starts a new group.
  let collectingAgents = false;

  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();

    if (key === "user-agent") {
      if (!current || !collectingAgents) {
        current = { agents: [], rules: [] };
        groups.push(current);
        collectingAgents = true;
      }
      // "Googlebot/2.1" -> "googlebot"
      const agent = value.split("/")[0].trim().toLowerCase();
      if (agent) current.agents.push(agent);
    } else if (key === "allow" || key === "disallow") {
      collectingAgents = false;
      // Rules before any User-agent line belong to no group.
      // An empty Disallow means "allow everything" and adds no rule.
      if (current && value) {
        current.rules.push({ allow: key === "allow", pattern: value });
      }
    }
    // Sitemap, Crawl-delay and unknown keys neither add rules nor end a group.
  }

  return groups;
}

function patternMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const source = body
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${source}${anchored ? "$" : ""}`).test(path);
}

function rulesFor(groups: RobotsGroup[], userAgent: string): RobotsRule[] {
  const ua = userAgent.toLowerCase();
  const own = groups.filter((g) => g.agents.includes(ua));
  const chosen = own.length > 0 ? own : groups.filter((g) => g.agents.includes("*"));
  return chosen.flatMap((g) => g.rules);
}

/** Whether `userAgent` may fetch `path` (path + query, starting with "/"). */
export function isAllowed(
  groups: RobotsGroup[],
  userAgent: string,
  path: string,
): boolean {
  let best: RobotsRule | null = null;
  for (const rule of rulesFor(groups, userAgent)) {
    if (!patternMatches(rule.pattern, path)) continue;
    if (
      !best ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow)
    ) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}
