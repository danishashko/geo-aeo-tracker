import {
  checkPair,
  fillKeyword,
  type SignalContext,
  type SignalDef,
} from "./rank-signal-features";
import {
  REWRITE_REASONING_EFFORT,
  chatCompletion,
  type ChatDeps,
} from "./rank-signal-judge";

/**
 * Builds the {with, without} pair for one passage. Code-built signals derive
 * both sides in code; LLM-built signals get both sides from one rewriter call,
 * so the judge never compares an edited text against an untouched one.
 */

export type PairOutcome =
  | {
      kind: "pair";
      with: string;
      without: string;
      direction: "add" | "remove";
      costUsd: number;
    }
  | { kind: "skip"; costUsd: number }
  | { kind: "rejected"; costUsd: number; reason: string }
  /** The rewriter call itself failed (429/5xx/network after retries). */
  | { kind: "failed"; costUsd: number };

const REWRITER_SYSTEM =
  "You build controlled A/B test pairs from a text passage. Make the smallest edit that adds or removes exactly this one feature. Keep every other sentence word-for-word. Add no facts beyond what the feature needs. Respond only with JSON.";

function taskFor(
  signal: SignalDef,
  direction: "add" | "remove" | "decide",
): string {
  if (signal.id === "S00") {
    return 'Set "without" to the passage as given. Set "with" to the same passage with exactly one sentence paraphrased: keep its facts and meaning, keep it about the same length, and leave every other sentence word-for-word.';
  }
  if (signal.id === "S14") {
    return 'Set "without" to the passage as given. Set "with" to the concise version.';
  }
  if (direction === "decide") {
    return 'First decide whether the passage already has the feature. If it has it, set "direction" to "remove": "with" keeps the feature and "without" removes it. If it lacks it, set "direction" to "add": "without" lacks the feature and "with" adds it.';
  }
  if (direction === "remove") {
    return 'The passage has the feature. "with" keeps it; "without" removes it.';
  }
  return 'The passage lacks the feature. "without" lacks it; "with" adds it.';
}

function rewriterPrompt(
  signal: SignalDef,
  text: string,
  ctx: SignalContext,
  direction: "add" | "remove" | "decide",
): string {
  const shape =
    direction === "decide"
      ? '{"direction":"add"|"remove","with":"...","without":"..."}'
      : '{"with":"...","without":"..."}';
  return [
    `Query: ${ctx.keyword}`,
    `Feature: ${fillKeyword(signal.feature, ctx.keyword)}`,
    `Task: ${taskFor(signal, direction)}`,
    `Return ${shape} with both versions in full; they must match each other word-for-word except for the feature. If the feature cannot be added or removed cleanly, return {"skip":true}.`,
    "",
    "Passage:",
    '"""',
    text,
    '"""',
  ].join("\n");
}

function parseRewrite(
  raw: string | null,
):
  | { skip: true }
  | { with: string; without: string; direction?: string }
  | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(
      raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""),
    ) as Record<string, unknown>;
    if (parsed.skip === true) return { skip: true };
    if (typeof parsed.with === "string" && typeof parsed.without === "string") {
      return {
        with: parsed.with,
        without: parsed.without,
        direction:
          typeof parsed.direction === "string" ? parsed.direction : undefined,
      };
    }
  } catch {
    // unparsable → treated like a failed control check
  }
  return null;
}

export async function buildPair(
  signal: SignalDef,
  text: string,
  ctx: SignalContext,
  rewriteModel: string,
  abortSignal: AbortSignal,
  deps: ChatDeps = {},
): Promise<PairOutcome> {
  if (signal.build === "code") {
    if (signal.skip?.(text, ctx) || signal.detect?.(text, ctx))
      return { kind: "skip", costUsd: 0 };
    const withText = signal.transform?.(text, ctx) ?? null;
    if (withText == null) return { kind: "skip", costUsd: 0 };
    const check = checkPair(signal, { with: withText, without: text }, ctx);
    if (!check.ok)
      return { kind: "rejected", costUsd: 0, reason: check.reason };
    return {
      kind: "pair",
      with: withText,
      without: text,
      direction: "add",
      costUsd: 0,
    };
  }

  const direction: "add" | "remove" | "decide" = signal.addOnly
    ? "add"
    : signal.detectorKind === "llm"
      ? "decide"
      : signal.detect?.(text, ctx)
        ? "remove"
        : "add";

  let costUsd = 0;
  let reason = "unparsable rewrite";
  // A failed control check regenerates once; a second failure rejects the pair.
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await chatCompletion(
      {
        model: rewriteModel,
        system: REWRITER_SYSTEM,
        user: rewriterPrompt(signal, text, ctx, direction),
        temperature: 0.2,
        maxTokens: 1500,
        reasoningEffort: REWRITE_REASONING_EFFORT,
      },
      abortSignal,
      deps,
    );
    costUsd += res.costUsd;
    if (!res.ok) return { kind: "failed", costUsd };
    const parsed = parseRewrite(res.content);
    if (parsed && "skip" in parsed) return { kind: "skip", costUsd };
    if (!parsed) continue;

    const dir =
      direction === "decide"
        ? parsed.direction === "add" || parsed.direction === "remove"
          ? parsed.direction
          : null
        : direction;
    if (!dir) {
      reason = "missing direction";
      continue;
    }
    const pair = { with: parsed.with.trim(), without: parsed.without.trim() };
    const check = checkPair(signal, pair, ctx);
    if (check.ok) return { kind: "pair", ...pair, direction: dir, costUsd };
    reason = check.reason;
  }
  return { kind: "rejected", costUsd, reason };
}
