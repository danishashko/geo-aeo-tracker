import { fetchWithTimeout } from "./http";

/**
 * Rank Signal judge + shared OpenRouter call. The judge sees a query and two
 * passages (no URLs, domains or titles) and must pick one.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export const DEFAULT_JUDGE_MODEL = "google/gemini-3.6-flash";
export const DEFAULT_REWRITE_MODEL = "google/gemini-3.5-flash";
export const REASONING_EFFORT = "low";
/**
 * The rewriter makes one small edit and needs no reasoning. Left at the
 * provider default, Gemini 3.5 Flash spends ~1,400 reasoning tokens, hits
 * max_tokens and returns truncated JSON (measured live: 33 of 37 pairs lost).
 */
export const REWRITE_REASONING_EFFORT = "minimal";

/** USD per 1M tokens. Every allowlisted model needs an entry here. */
export const PRICE_TABLE: Record<string, { input: number; output: number }> = {
  "google/gemini-3.6-flash": { input: 0.75, output: 3.75 },
  "google/gemini-3.5-flash": { input: 1.5, output: 9.0 },
};

export function judgeModelFromEnv(): string {
  return process.env.RANK_SIGNAL_JUDGE_MODEL?.trim() || DEFAULT_JUDGE_MODEL;
}

export function rewriteModelFromEnv(): string {
  return (
    process.env.RANK_SIGNAL_REWRITE_MODEL?.trim() ||
    process.env.OPENROUTER_MODEL?.trim() ||
    DEFAULT_REWRITE_MODEL
  );
}

export function allowedModels(): string[] {
  const raw = process.env.RANK_SIGNAL_ALLOWED_MODELS;
  const list = raw
    ? raw
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean)
    : [DEFAULT_JUDGE_MODEL, DEFAULT_REWRITE_MODEL];
  return [...new Set(list)];
}

/** Null when the model may be used; otherwise the reason it may not. */
export function modelProblem(model: string): string | null {
  if (!allowedModels().includes(model))
    return `Model not allowed: ${model}. Add it to RANK_SIGNAL_ALLOWED_MODELS.`;
  if (!PRICE_TABLE[model])
    return `Model has no price entry: ${model}. Add it to PRICE_TABLE in lib/server/rank-signal-judge.ts.`;
  return null;
}

/** Nominal cost of one call, used for the pre-dispatch budget estimate. */
export function estimateCallUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const p = PRICE_TABLE[model];
  if (!p) return 0;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

export interface ChatRequest {
  model: string;
  system: string;
  user: string;
  temperature: number;
  maxTokens: number;
  /** OpenRouter `reasoning.effort`. Reasoning tokens count toward maxTokens. */
  reasoningEffort?: string;
}

export interface ChatResult {
  ok: boolean;
  content: string | null;
  costUsd: number;
}

export interface ChatDeps {
  /** Backoff before each retry of a 429/5xx/network failure. */
  retryDelaysMs?: number[];
  /** Called with every settled call's cost, before the result returns. */
  onCost?: (usd: number) => void;
}

const DEFAULT_RETRY_DELAYS = [1000, 2000, 4000];

function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function costFromUsage(model: string, usage: unknown): number {
  const u = (usage ?? {}) as Record<string, unknown>;
  if (typeof u.cost === "number" && Number.isFinite(u.cost)) return u.cost;
  return estimateCallUsd(
    model,
    Number(u.prompt_tokens) || 0,
    Number(u.completion_tokens) || 0,
  );
}

/**
 * One OpenRouter chat call with `usage.include`. Retries 429/5xx and network
 * errors with 1/2/4 s backoff, then gives up with ok:false. An abort (client
 * disconnect) is rethrown so the caller stops immediately.
 */
export async function chatCompletion(
  req: ChatRequest,
  signal: AbortSignal,
  deps: ChatDeps = {},
): Promise<ChatResult> {
  const apiKey = process.env.OPENROUTER_KEY;
  if (!apiKey) return { ok: false, content: null, costUsd: 0 };
  const delays = deps.retryDelaysMs ?? DEFAULT_RETRY_DELAYS;

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    if (attempt > 0) await sleep(delays[attempt - 1], signal);
    if (signal.aborted) throw signal.reason;
    try {
      const res = await fetchWithTimeout(
        OPENROUTER_URL,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: req.model,
            messages: [
              { role: "system", content: req.system },
              { role: "user", content: req.user },
            ],
            temperature: req.temperature,
            max_tokens: req.maxTokens,
            ...(req.reasoningEffort
              ? { reasoning: { effort: req.reasoningEffort } }
              : {}),
            response_format: { type: "json_object" },
            usage: { include: true },
          }),
          signal,
        },
        60_000,
      );
      if (res.status === 429 || res.status >= 500) continue;
      if (!res.ok) return { ok: false, content: null, costUsd: 0 };
      const json = await res.json();
      const costUsd = costFromUsage(req.model, json?.usage);
      deps.onCost?.(costUsd);
      const content = json?.choices?.[0]?.message?.content;
      return {
        ok: true,
        content: typeof content === "string" ? content : null,
        costUsd,
      };
    } catch (err) {
      if (signal.aborted || isAbort(err)) throw err;
      // Network error or per-call timeout: retry
    }
  }
  return { ok: false, content: null, costUsd: 0 };
}

/**
 * Parses the judge's answer. JSON {"choice":"A"|"B"} first, then a bare
 * leading A/B ("A", "**B**"). "Both", "neither", refusals and empty → null.
 */
export function parseChoice(raw: string | null | undefined): "A" | "B" | null {
  if (!raw) return null;
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*|\s*```$/g, "")
    .trim();
  try {
    const parsed = JSON.parse(text) as { choice?: unknown };
    if (parsed && typeof parsed === "object") {
      const c = typeof parsed.choice === "string" ? parsed.choice.trim() : "";
      if (c === "A" || c === "B") return c;
    }
  } catch {
    // not JSON — fall through to the bare-letter form
  }
  const m = text.match(/^\W*(A|B)\b/);
  return m ? (m[1] as "A" | "B") : null;
}

export const JUDGE_SYSTEM =
  'You are the retrieval step of an AI answer engine. You get a user query and two candidate passages, A and B. Pick the ONE passage you would rather use as a source to answer the query. You must pick one. Respond only with JSON: {"choice":"A"} or {"choice":"B"}.';

export function judgeUserPrompt(keyword: string, a: string, b: string): string {
  return `Query: ${keyword}\n\n[Passage A]\n${a}\n\n[Passage B]\n${b}`;
}

export interface JudgeOutcome {
  choice: "A" | "B" | null;
  costUsd: number;
  /** True when the upstream call itself failed (not just an unparsable answer). */
  failed: boolean;
}

/** One A/B decision. An unparsable answer is retried once, then invalid. */
export async function judgePair(
  input: { keyword: string; a: string; b: string; model: string },
  signal: AbortSignal,
  deps: ChatDeps = {},
): Promise<JudgeOutcome> {
  let costUsd = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await chatCompletion(
      {
        model: input.model,
        system: JUDGE_SYSTEM,
        user: judgeUserPrompt(input.keyword, input.a, input.b),
        temperature: 0,
        maxTokens: 1000,
        reasoningEffort: REASONING_EFFORT,
      },
      signal,
      deps,
    );
    costUsd += res.costUsd;
    if (!res.ok) return { choice: null, costUsd, failed: true };
    const choice = parseChoice(res.content);
    if (choice) return { choice, costUsd, failed: false };
  }
  return { choice: null, costUsd, failed: false };
}
